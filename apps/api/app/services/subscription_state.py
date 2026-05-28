"""DB access for subscription_state + notification_log.

Thin wrapper over the Supabase client. The webhook handler upserts into
subscription_state, and the notification scheduler reads from it + writes the
log. No business logic lives here — see services.notification_scheduler and
services.revenuecat_webhook for that.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

from app.services.supabase_db import get_supabase

_LOG = logging.getLogger(__name__)


# Status values mirrored on the row.
STATUS_TRIALING = "trialing"
STATUS_ACTIVE = "active"
STATUS_GRACE = "in_grace_period"
STATUS_CANCELLED = "cancelled"
STATUS_EXPIRED = "expired"
STATUS_UNKNOWN = "unknown"

PERIOD_TRIAL = "trial"
PERIOD_NORMAL = "normal"
PERIOD_INTRO = "intro"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def get_subscription_by_original_app_user_id(
    user_id: str,
    original_app_user_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    """Look up a row by (user_id, original_app_user_id)."""
    if not user_id or not original_app_user_id:
        return None
    supa = get_supabase()
    result = (
        supa.table("subscription_state")
        .select("*")
        .eq("user_id", user_id)
        .eq("original_app_user_id", original_app_user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def upsert_subscription_state(
    user_id: str,
    *,
    original_app_user_id: Optional[str],
    fields: Mapping[str, Any],
) -> Dict[str, Any]:
    """Insert or update the row keyed on (user_id, original_app_user_id).

    ``fields`` may include any column on subscription_state. ``user_id`` and
    ``original_app_user_id`` are merged in automatically. Returns the row.
    """
    supa = get_supabase()
    existing = get_subscription_by_original_app_user_id(user_id, original_app_user_id)
    patch: Dict[str, Any] = {k: v for k, v in fields.items() if v is not None}
    patch["updated_at"] = _utc_now_iso()
    if existing:
        result = (
            supa.table("subscription_state")
            .update(patch)
            .eq("id", existing["id"])
            .execute()
        )
    else:
        patch["user_id"] = user_id
        if original_app_user_id is not None:
            patch["original_app_user_id"] = original_app_user_id
        result = supa.table("subscription_state").insert(patch).execute()
    if not result.data:
        raise RuntimeError("subscription_state upsert returned no data")
    return result.data[0]


def list_trials_in_pre_charge_window(
    *,
    window_lower_hours: float = 47.0,
    window_upper_hours: float = 49.0,
) -> List[Dict[str, Any]]:
    """Find trials whose ``trial_end_at`` falls within the configurable window.

    The default 47–49h window is intentionally wide so the 15-minute scheduler
    tick can't miss a trial. Idempotency is enforced by notification_log.
    """
    now = datetime.now(timezone.utc)
    lower = now + timedelta(hours=window_lower_hours)
    upper = now + timedelta(hours=window_upper_hours)
    supa = get_supabase()
    result = (
        supa.table("subscription_state")
        .select("*")
        .eq("period_type", PERIOD_TRIAL)
        .in_("status", [STATUS_TRIALING, STATUS_ACTIVE])
        .gte("trial_end_at", _to_iso(lower))
        .lte("trial_end_at", _to_iso(upper))
        .eq("is_family_share", False)
        .execute()
    )
    return list(result.data or [])


def list_just_converted_trials(
    *,
    lookback_hours: float = 6.0,
) -> List[Dict[str, Any]]:
    """Find rows whose period_type is now 'normal' (post-trial) and updated
    recently. Combined with notification_log uniqueness, ensures we send the
    "Welcome to Fitfo Premium" push exactly once at conversion.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    supa = get_supabase()
    result = (
        supa.table("subscription_state")
        .select("*")
        .eq("period_type", PERIOD_NORMAL)
        .eq("status", STATUS_ACTIVE)
        .eq("is_family_share", False)
        .gte("updated_at", _to_iso(cutoff))
        .execute()
    )
    return list(result.data or [])


def user_has_active_pro(user_id: str) -> bool:
    """Return true when RevenueCat says this user currently has Pro access."""
    if not user_id:
        return False
    supa = get_supabase()
    result = (
        supa.table("subscription_state")
        .select("id")
        .eq("user_id", user_id)
        .eq("entitlement_id", "pro")
        .eq("is_family_share", False)
        .in_("status", [STATUS_TRIALING, STATUS_ACTIVE, STATUS_GRACE, STATUS_CANCELLED])
        .limit(1)
        .execute()
    )
    return bool(result.data)


def has_notification_log(
    *,
    user_id: str,
    kind: str,
    subscription_state_id: Optional[str],
) -> bool:
    """Check if we already sent ``kind`` for this user+subscription tuple."""
    supa = get_supabase()
    query = (
        supa.table("notification_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("kind", kind)
    )
    if subscription_state_id is not None:
        query = query.eq("subscription_state_id", subscription_state_id)
    result = query.limit(1).execute()
    return bool(result.data)


def insert_notification_log(
    *,
    user_id: str,
    kind: str,
    subscription_state_id: Optional[str],
    sent_payload: Mapping[str, Any],
    expo_response: Optional[Mapping[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Record a successful send. Idempotent — duplicate inserts return None.

    The unique constraint on (user_id, kind, subscription_state_id) is the
    real safety net; we still pre-check via has_notification_log to avoid
    burning DB error logs on the happy path.
    """
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "kind": kind,
        "subscription_state_id": subscription_state_id,
        "sent_payload": dict(sent_payload),
    }
    if expo_response is not None:
        payload["expo_response"] = dict(expo_response)
    try:
        result = supa.table("notification_log").insert(payload).execute()
    except Exception as exc:
        # Most likely a unique-constraint violation from a concurrent send.
        _LOG.info(
            "notification_log insert failed (likely duplicate) user=%s kind=%s: %s",
            user_id,
            kind,
            exc,
        )
        return None
    if not result.data:
        return None
    return result.data[0]
