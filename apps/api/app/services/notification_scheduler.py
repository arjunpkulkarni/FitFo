"""Periodic scheduler that fires trial-lifecycle push notifications.

Runs in-process via APScheduler (started in app/main.py lifespan). Two ticks:

* every 15 minutes — pre-charge reminder 48h before trial ends
* every 5 minutes  — conversion confirmation right after first paid renewal

Both ticks are idempotent thanks to the unique key on notification_log
(user_id, kind, subscription_state_id), so multiple workers / restarts won't
double-send.

Copy is dynamic — plan price comes from subscription_state.next_charge_amount_*
which is populated by the RC webhook. Personalized stats come from
services.user_activity. Nothing here is hardcoded.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional

from app.services import expo_push, subscription_state, user_activity
from app.services.supabase_db import list_expo_push_tokens_for_user

_LOG = logging.getLogger(__name__)


# Deep link the pre-charge reminder taps into. App.tsx maps this to the RC
# customer center (or the Apple subscription URL fallback in dev/Expo Go).
DEEP_LINK_MANAGE_SUBSCRIPTION = "fitfo://manage-subscription"


def _format_money(amount_micros: Optional[int], currency: Optional[str]) -> Optional[str]:
    if amount_micros is None:
        return None
    amount = float(amount_micros) / 1_000_000.0
    code = (currency or "").upper().strip() or "USD"
    # Cheap currency formatter — avoids pulling babel for one symbol.
    if code == "USD":
        return f"${amount:,.2f}"
    if code == "EUR":
        return f"\u20ac{amount:,.2f}"
    if code == "GBP":
        return f"\u00a3{amount:,.2f}"
    return f"{amount:,.2f} {code}"


def _format_charge_date(trial_end_iso: Optional[str]) -> Optional[str]:
    if not trial_end_iso:
        return None
    try:
        dt = datetime.fromisoformat(trial_end_iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Cross-platform-safe day-of-month ("Aug 5", not "Aug 05").
    month = dt.strftime("%b")
    return f"{month} {dt.day}"


def _build_pre_charge_copy(state_row: Mapping[str, Any]) -> tuple[str, str]:
    user_id = str(state_row.get("user_id"))
    trial_start_iso = state_row.get("trial_start_at")
    trial_start_dt: Optional[datetime] = None
    if isinstance(trial_start_iso, str):
        try:
            trial_start_dt = datetime.fromisoformat(trial_start_iso.replace("Z", "+00:00"))
        except ValueError:
            trial_start_dt = None

    saved_count = user_activity.count_saved_workouts_since(user_id, trial_start_dt)
    completed_count = user_activity.count_completed_workouts_since(user_id, trial_start_dt)

    price_str = _format_money(
        state_row.get("next_charge_amount_micros"),
        state_row.get("next_charge_currency"),
    )
    charge_date = _format_charge_date(state_row.get("trial_end_at"))

    title = "Your free trial ends in 2 days"
    pieces: list[str] = []
    if price_str and charge_date:
        pieces.append(f"We'll charge {price_str} on {charge_date} unless you cancel.")
    elif price_str:
        pieces.append(f"We'll charge {price_str} unless you cancel.")
    else:
        pieces.append("Apple will renew your subscription unless you cancel.")

    if saved_count > 0 or completed_count > 0:
        # Only include the personalized line when the user has actually used
        # the app — empty stats sound condescending in copy.
        bits: list[str] = []
        if saved_count > 0:
            noun = "workout" if saved_count == 1 else "workouts"
            bits.append(f"{saved_count} {noun} imported")
        if completed_count > 0:
            noun = "session" if completed_count == 1 else "sessions"
            bits.append(f"{completed_count} {noun} logged")
        if bits:
            pieces.append("So far: " + ", ".join(bits) + ".")

    return title, " ".join(pieces)


def _build_converted_copy() -> tuple[str, str]:
    return "You're in.", "Welcome to Fitfo Premium."


def fire_trial_pre_charge_reminders() -> int:
    """Send the 48h pre-charge push to every eligible trial. Returns count sent."""
    sent = 0
    try:
        candidates = subscription_state.list_trials_in_pre_charge_window()
    except Exception as exc:
        _LOG.warning("notification_scheduler: pre_charge query failed: %s", exc)
        return 0

    for row in candidates:
        user_id = str(row.get("user_id") or "").strip()
        state_id = row.get("id")
        if not user_id or not state_id:
            continue
        if subscription_state.has_notification_log(
            user_id=user_id,
            kind=expo_push.TRIAL_PRE_CHARGE_KIND,
            subscription_state_id=state_id,
        ):
            continue

        tokens = list_expo_push_tokens_for_user(user_id)
        if not tokens:
            _LOG.info("pre_charge skip user=%s — no push tokens", user_id)
            # Still log so we don't reconsider this trial repeatedly with no tokens.
            subscription_state.insert_notification_log(
                user_id=user_id,
                kind=expo_push.TRIAL_PRE_CHARGE_KIND,
                subscription_state_id=state_id,
                sent_payload={"skipped": "no_push_tokens"},
                expo_response=None,
            )
            continue

        title, body = _build_pre_charge_copy(row)
        data: Dict[str, Any] = {
            "kind": expo_push.TRIAL_PRE_CHARGE_KIND,
            "deepLink": DEEP_LINK_MANAGE_SUBSCRIPTION,
            "subscriptionStateId": state_id,
        }
        expo_response = expo_push.send_push(
            expo_push_tokens=tokens,
            title=title,
            body=body,
            data=data,
            log_label=f"trial-48h:user_id={user_id}",
        )
        subscription_state.insert_notification_log(
            user_id=user_id,
            kind=expo_push.TRIAL_PRE_CHARGE_KIND,
            subscription_state_id=state_id,
            sent_payload={"title": title, "body": body, "data": data},
            expo_response=expo_response,
        )
        sent += 1

    if sent:
        _LOG.info("pre_charge tick: sent=%s candidates=%s", sent, len(candidates))
    return sent


def fire_trial_converted_confirmations() -> int:
    """Send the welcome push for trials that just renewed into a paid period."""
    sent = 0
    try:
        candidates = subscription_state.list_just_converted_trials()
    except Exception as exc:
        _LOG.warning("notification_scheduler: converted query failed: %s", exc)
        return 0

    for row in candidates:
        user_id = str(row.get("user_id") or "").strip()
        state_id = row.get("id")
        if not user_id or not state_id:
            continue
        if subscription_state.has_notification_log(
            user_id=user_id,
            kind=expo_push.TRIAL_CONVERTED_KIND,
            subscription_state_id=state_id,
        ):
            continue

        tokens = list_expo_push_tokens_for_user(user_id)
        if not tokens:
            subscription_state.insert_notification_log(
                user_id=user_id,
                kind=expo_push.TRIAL_CONVERTED_KIND,
                subscription_state_id=state_id,
                sent_payload={"skipped": "no_push_tokens"},
                expo_response=None,
            )
            continue

        title, body = _build_converted_copy()
        data: Dict[str, Any] = {
            "kind": expo_push.TRIAL_CONVERTED_KIND,
            "subscriptionStateId": state_id,
        }
        expo_response = expo_push.send_push(
            expo_push_tokens=tokens,
            title=title,
            body=body,
            data=data,
            log_label=f"trial-converted:user_id={user_id}",
        )
        subscription_state.insert_notification_log(
            user_id=user_id,
            kind=expo_push.TRIAL_CONVERTED_KIND,
            subscription_state_id=state_id,
            sent_payload={"title": title, "body": body, "data": data},
            expo_response=expo_response,
        )
        sent += 1

    if sent:
        _LOG.info("trial_converted tick: sent=%s candidates=%s", sent, len(candidates))
    return sent


# ---------------------------------------------------------------------------
# Scheduler wiring (APScheduler) — see app/main.py for start/stop hooks.

_scheduler: Any = None  # type: BackgroundScheduler | None


def start_scheduler() -> None:
    """Start the APScheduler background scheduler. Idempotent."""
    global _scheduler
    if _scheduler is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler  # type: ignore
    except ImportError:
        _LOG.warning(
            "apscheduler not installed — trial notification scheduler disabled. "
            "Add `apscheduler>=3.10.0` to requirements.txt and restart the API."
        )
        return

    sched = BackgroundScheduler(timezone="UTC", daemon=True)
    sched.add_job(
        fire_trial_pre_charge_reminders,
        trigger="interval",
        minutes=15,
        id="trial_pre_charge",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    sched.add_job(
        fire_trial_converted_confirmations,
        trigger="interval",
        minutes=5,
        id="trial_converted",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    sched.start()
    _scheduler = sched
    _LOG.info("notification scheduler started (pre_charge=15m, converted=5m)")


def shutdown_scheduler() -> None:
    """Stop the scheduler if running."""
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception as exc:
        _LOG.warning("notification scheduler shutdown error: %s", exc)
    _scheduler = None
