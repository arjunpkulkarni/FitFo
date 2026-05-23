"""Mapping + lightweight subscription mirror for RevenueCat users.

The mobile client sets the RevenueCat SDK ``appUserID`` to the Supabase user
id (``profiles.id``) right after sign-in. This module owns the
``revenuecat_users`` table that persists that mapping server-side and applies
RC webhook events to it.

Distinct from :mod:`app.services.revenuecat_webhook` which mutates the rich
``subscription_state`` table used by the trial/conversion push scheduler.
This module keeps a single-row-per-user "latest known state" snapshot for
internal services that just need to know whether a user is trialing, active,
cancelled, or expired.

Webhook event reference:
  https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from app.services.supabase_db import get_supabase

_LOG = logging.getLogger(__name__)

TABLE_NAME = "revenuecat_users"

STATUS_UNKNOWN = "unknown"
STATUS_TRIALING = "trialing"
STATUS_ACTIVE = "active"
STATUS_CANCELLED = "cancelled"
STATUS_EXPIRED = "expired"

# Event types we apply against the mapping row. Anything else is logged and
# ignored — we never crash on unknown event shapes.
_SUPPORTED_EVENT_TYPES = frozenset(
    {
        "TRIAL_STARTED",
        "INITIAL_PURCHASE",
        "RENEWAL",
        "CANCELLATION",
        "EXPIRATION",
    }
)


def ms_to_iso(value: Any) -> Optional[str]:
    """Convert a RevenueCat millisecond timestamp to an ISO-8601 UTC string.

    RC delivers epoch-ms numbers (sometimes as strings). Anything that can't
    be parsed cleanly returns ``None`` rather than raising, so a malformed
    field in one event never wedges the whole webhook.
    """
    if value is None:
        return None
    try:
        ms = int(value)
    except (TypeError, ValueError):
        return None
    try:
        dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None
    return dt.isoformat()


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _clean_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def upsert_user_mapping(
    *,
    supabase_user_id: str,
    revenuecat_app_user_id: str,
    phone_number: Optional[str] = None,
    apple_provider_id: Optional[str] = None,
) -> dict:
    """Insert or refresh the mapping row for a signed-in user.

    Called from the ``POST /revenuecat/sync-user`` endpoint after the mobile
    client completes Supabase auth. Idempotent — re-running with the same
    ``supabase_user_id`` updates phone / Apple id but never duplicates rows.
    """
    if not supabase_user_id:
        raise ValueError("supabase_user_id is required")
    if not revenuecat_app_user_id:
        raise ValueError("revenuecat_app_user_id is required")

    supa = get_supabase()
    now_iso = _utc_now_iso()
    payload = {
        "supabase_user_id": supabase_user_id,
        "revenuecat_app_user_id": revenuecat_app_user_id,
        "phone_number": _clean_str(phone_number),
        "apple_provider_id": _clean_str(apple_provider_id),
        "updated_at": now_iso,
    }

    result = (
        supa.table(TABLE_NAME)
        .upsert(payload, on_conflict="supabase_user_id")
        .execute()
    )
    rows = result.data or []
    if rows:
        return rows[0]

    # Defensive — supabase-py occasionally returns empty data on upsert when
    # the server elides the returned row. Re-select so the caller always
    # sees the current state.
    fetched = (
        supa.table(TABLE_NAME)
        .select("*")
        .eq("supabase_user_id", supabase_user_id)
        .limit(1)
        .execute()
    )
    rows = fetched.data or []
    return rows[0] if rows else payload


def _status_for_event(event_type: str) -> Optional[str]:
    if event_type in ("TRIAL_STARTED",):
        return STATUS_TRIALING
    if event_type in ("INITIAL_PURCHASE", "RENEWAL"):
        return STATUS_ACTIVE
    if event_type == "CANCELLATION":
        return STATUS_CANCELLED
    if event_type == "EXPIRATION":
        return STATUS_EXPIRED
    return None


def _build_update_fields(event: Mapping[str, Any]) -> dict:
    """Translate an RC event into a partial update for the mapping row.

    Only columns we actually want to overwrite are returned. We deliberately
    avoid persisting the raw RC payload — too noisy and contains PII.
    """
    event_type = str(event.get("type") or "").strip().upper()

    fields: dict = {"last_event_type": event_type}

    last_event_ms = event.get("event_timestamp_ms")
    last_event_iso = ms_to_iso(last_event_ms)
    if last_event_iso:
        fields["last_event_at"] = last_event_iso

    product_id = _clean_str(event.get("product_id"))
    if product_id:
        fields["product_id"] = product_id

    status = _status_for_event(event_type)
    if status:
        fields["subscription_status"] = status

    expiration_iso = ms_to_iso(event.get("expiration_at_ms"))
    if expiration_iso:
        fields["expires_at"] = expiration_iso

    if event_type == "TRIAL_STARTED":
        # Some RC tenants emit period_start_ms; fall back to purchased_at_ms
        # for older payload shapes. Either works for "when did the trial
        # begin".
        trial_started_iso = ms_to_iso(
            event.get("period_start_ms") or event.get("purchased_at_ms")
        )
        if trial_started_iso:
            fields["trial_started_at"] = trial_started_iso

    return fields


def handle_event(event: Mapping[str, Any]) -> Optional[dict]:
    """Apply one RevenueCat event to the matching ``revenuecat_users`` row.

    Returns the updated row, or ``None`` if the event was ignored. This is
    intentionally defensive — missing fields, unknown event types, and
    unrecognized users are all logged-and-skipped rather than raised, so
    RevenueCat's retry storm never piles up because of a malformed payload.
    """
    if not isinstance(event, Mapping):
        _LOG.warning("RC mapping webhook: event payload is not an object")
        return None

    event_type = str(event.get("type") or "").strip().upper()
    app_user_id = _clean_str(event.get("app_user_id"))

    _LOG.info(
        "revenuecat_users webhook event_type=%s app_user_id=%s",
        event_type or "(missing)",
        app_user_id or "(missing)",
    )

    if not event_type:
        _LOG.warning("RC mapping webhook: event.type missing — ignoring")
        return None

    if not app_user_id:
        _LOG.warning(
            "RC mapping webhook: event.app_user_id missing for type=%s — ignoring",
            event_type,
        )
        return None

    if event_type not in _SUPPORTED_EVENT_TYPES:
        _LOG.info(
            "RC mapping webhook: event_type=%s app_user_id=%s ignored (no handler)",
            event_type,
            app_user_id,
        )
        return None

    fields = _build_update_fields(event)
    if not fields:
        _LOG.info(
            "RC mapping webhook: event_type=%s app_user_id=%s produced no fields",
            event_type,
            app_user_id,
        )
        return None

    fields["updated_at"] = _utc_now_iso()

    supa = get_supabase()
    result = (
        supa.table(TABLE_NAME)
        .update(fields)
        .eq("revenuecat_app_user_id", app_user_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        # No matching row — likely a webhook for a user who signed in but
        # never reached /revenuecat/sync-user (or was deleted). Log + accept.
        _LOG.info(
            "RC mapping webhook: no revenuecat_users row for app_user_id=%s "
            "(event_type=%s) — ignoring",
            app_user_id,
            event_type,
        )
        return None

    return rows[0]
