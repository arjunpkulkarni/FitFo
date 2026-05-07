"""Translate RevenueCat webhook events into subscription_state row updates.

This is the *only* place our DB learns about subscription lifecycle. The
mobile app never POSTs trial state to the server. RC is the source of truth
because Apple can change trial dates (extensions, refunds, etc.) and RC
mirrors those changes in real time.

Webhook payload reference:
  https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

We handle these event types — anything else is logged and ignored:

  INITIAL_PURCHASE     User signed up (with or without intro trial). Create
                       the row, set period_type / trial dates / next_charge.
  RENEWAL              Recurring renewal (incl. first paid renewal after a
                       trial). Update current_period_*; flip period_type to
                       'normal' if it was 'trial' — that flip is what the
                       conversion-confirmation push keys off of.
  PRODUCT_CHANGE       User upgraded / downgraded mid-trial or mid-period.
                       Update product_id + next_charge_amount.
  CANCELLATION         User opted out (will not auto-renew). Mark cancelled.
                       Trial-pre-charge reminder is suppressed via status
                       filter in subscription_state.list_trials_in_pre_charge_window.
  EXPIRATION           Period actually ended (e.g. cancelled trial expired).
                       Mark expired.
  BILLING_ISSUE        Apple couldn't charge. Mark in_grace_period.
  UNCANCELLATION       User re-enabled auto-renew. Flip back to active.
  SUBSCRIBER_ALIAS     RC merged anonymous user with logged-in user. Re-key
                       any rows on the alias.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional

from app.services import subscription_state
from app.services.supabase_db import get_supabase

_LOG = logging.getLogger(__name__)


class WebhookValidationError(ValueError):
    """Raised when an incoming RC payload is malformed enough to reject."""


def _from_ms(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000.0, tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _resolve_user_id(app_user_id: str) -> Optional[str]:
    """Map RC ``app_user_id`` → profiles.id.

    We set the RC SDK appUserID = profiles.id on the client, so this is
    almost always identity. We still validate the row exists; missing rows
    are logged + dropped rather than 500'd, since RC retries indefinitely
    on 5xx and we don't want a deleted user to wedge the queue.
    """
    if not app_user_id:
        return None
    supa = get_supabase()
    result = (
        supa.table("profiles")
        .select("id")
        .eq("id", app_user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0]["id"] if rows else None


def _normalize_period_type(rc_value: Optional[str]) -> Optional[str]:
    if rc_value is None:
        return None
    normalized = str(rc_value).strip().lower()
    if normalized in ("trial",):
        return subscription_state.PERIOD_TRIAL
    if normalized in ("normal",):
        return subscription_state.PERIOD_NORMAL
    if normalized in ("intro",):
        return subscription_state.PERIOD_INTRO
    return None


def _common_fields(event: Mapping[str, Any]) -> Dict[str, Any]:
    """Fields we copy from the event onto every upsert."""
    fields: Dict[str, Any] = {
        "revenuecat_app_user_id": event.get("app_user_id"),
        "product_id": event.get("product_id"),
        "last_event_id": event.get("id"),
        "last_event_type": event.get("type"),
        "last_event_at": _to_iso(_from_ms(event.get("event_timestamp_ms"))),
    }
    entitlement_ids = event.get("entitlement_ids")
    if isinstance(entitlement_ids, list) and entitlement_ids:
        fields["entitlement_id"] = str(entitlement_ids[0])

    period_type = _normalize_period_type(event.get("period_type"))
    if period_type:
        fields["period_type"] = period_type

    purchased_at = _from_ms(event.get("purchased_at_ms"))
    if purchased_at and period_type == subscription_state.PERIOD_TRIAL:
        fields["trial_start_at"] = _to_iso(purchased_at)
    expiration_at = _from_ms(event.get("expiration_at_ms"))
    if expiration_at:
        if period_type == subscription_state.PERIOD_TRIAL:
            fields["trial_end_at"] = _to_iso(expiration_at)
        else:
            fields["current_period_end_at"] = _to_iso(expiration_at)
    if purchased_at and period_type != subscription_state.PERIOD_TRIAL:
        fields["current_period_start_at"] = _to_iso(purchased_at)

    # Pricing — for the personalized "we'll charge $X.XX" copy.
    price = event.get("price_in_purchased_currency", event.get("price"))
    if isinstance(price, (int, float)):
        fields["next_charge_amount_micros"] = int(round(float(price) * 1_000_000))
    currency = event.get("currency")
    if isinstance(currency, str) and currency.strip():
        fields["next_charge_currency"] = currency.strip().upper()

    fields["is_family_share"] = bool(event.get("is_family_share"))
    return fields


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _is_duplicate_event(
    *,
    user_id: str,
    original_app_user_id: Optional[str],
    event_id: Optional[str],
) -> bool:
    """RC delivers each event multiple times on retry — drop dupes.

    We compare by ``last_event_id`` on the existing row; if it equals the
    incoming event id we've already processed it. We do NOT use a strict
    timestamp comparison because RC's retry timestamps shift.
    """
    if not event_id:
        return False
    existing = subscription_state.get_subscription_by_original_app_user_id(
        user_id, original_app_user_id
    )
    if not existing:
        return False
    return existing.get("last_event_id") == event_id


def handle_event(event: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    """Apply a single RC event payload. Returns the resulting row or None.

    ``event`` must be the inner ``event`` object from RC's webhook envelope:
        {"event": {...}, "api_version": "1.0"}
    Caller should pass ``payload["event"]``.
    """
    if not isinstance(event, Mapping):
        raise WebhookValidationError("event must be an object")

    event_type = (event.get("type") or "").strip().upper()
    if not event_type:
        raise WebhookValidationError("event.type is required")

    app_user_id = event.get("app_user_id") or event.get("aliases", [None])[0]
    if not app_user_id:
        raise WebhookValidationError("event.app_user_id is required")

    user_id = _resolve_user_id(str(app_user_id))
    if not user_id:
        _LOG.info(
            "RC webhook event=%s ignored — no profile for app_user_id=%s",
            event_type,
            app_user_id,
        )
        return None

    original_app_user_id = (
        event.get("original_app_user_id") or app_user_id
    )

    if _is_duplicate_event(
        user_id=user_id,
        original_app_user_id=original_app_user_id,
        event_id=event.get("id"),
    ):
        _LOG.info(
            "RC webhook event=%s id=%s skipped (duplicate)",
            event_type,
            event.get("id"),
        )
        return None

    fields = _common_fields(event)

    if event_type in ("INITIAL_PURCHASE",):
        # period_type=TRIAL means user got the intro free trial. period_type
        # absent or NORMAL means they paid up front.
        if fields.get("period_type") == subscription_state.PERIOD_TRIAL:
            fields["status"] = subscription_state.STATUS_TRIALING
        else:
            fields["status"] = subscription_state.STATUS_ACTIVE

    elif event_type in ("RENEWAL", "UNCANCELLATION"):
        fields["status"] = subscription_state.STATUS_ACTIVE
        # First paid renewal after a trial: flip period_type to NORMAL. The
        # scheduler's just-converted query keys off this transition.
        if fields.get("period_type") is None:
            fields["period_type"] = subscription_state.PERIOD_NORMAL

    elif event_type in ("PRODUCT_CHANGE",):
        # User switched plans mid-trial or mid-cycle. Keep current status,
        # but refresh product_id + price (already in _common_fields).
        pass

    elif event_type in ("CANCELLATION",):
        fields["status"] = subscription_state.STATUS_CANCELLED
        cancel_reason = event.get("cancel_reason")
        if isinstance(cancel_reason, str) and cancel_reason.strip():
            fields["cancel_reason"] = cancel_reason.strip()
        fields["cancelled_at"] = _to_iso(_from_ms(event.get("event_timestamp_ms")))

    elif event_type in ("EXPIRATION",):
        fields["status"] = subscription_state.STATUS_EXPIRED

    elif event_type in ("BILLING_ISSUE",):
        fields["status"] = subscription_state.STATUS_GRACE

    elif event_type in ("SUBSCRIBER_ALIAS", "TRANSFER"):
        # Account merge — log and let the next status-bearing event drive state.
        _LOG.info("RC webhook %s app_user_id=%s noted (no row change)", event_type, app_user_id)
        return None

    else:
        # NON_RENEWING_PURCHASE, REFUND, etc. — log + ignore for now.
        _LOG.info("RC webhook event=%s ignored (no handler)", event_type)
        return None

    return subscription_state.upsert_subscription_state(
        user_id,
        original_app_user_id=str(original_app_user_id),
        fields=fields,
    )
