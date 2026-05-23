"""HTTP entry points for the RevenueCat → Supabase user mapping.

Exposes two endpoints:

  POST /revenuecat/sync-user
      Mobile-initiated. Persists the link between the Supabase user id and
      the RevenueCat ``app_user_id`` (which we set equal to the Supabase id
      on the client). Authenticated with the standard bearer JWT.

  POST /revenuecat/webhook
      RevenueCat-initiated. Applies subscription lifecycle events to the
      same mapping row. Authenticated with a shared secret in the
      ``Authorization`` header configured in the RC dashboard.

This is intentionally separate from the existing ``/webhooks/revenuecat``
route (see :mod:`app.routers.webhooks`) which feeds the rich
``subscription_state`` table used by trial-conversion push notifications.
The endpoints here drive a lightweight per-user mapping snapshot.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from app.routers.deps import require_profile_id
from app.services import revenuecat_users, supabase_db

_LOG = logging.getLogger(__name__)

router = APIRouter(prefix="/revenuecat", tags=["revenuecat"])


class SyncUserResponse(BaseModel):
    ok: bool
    supabase_user_id: str
    revenuecat_app_user_id: str


def _expected_webhook_authorization() -> str:
    """Shared secret RevenueCat sends back as the ``Authorization`` header.

    Configured in RC dashboard → Project → Apps → Fitfo → Webhook URL
    settings → "Authorization header value". Must match
    ``REVENUECAT_WEBHOOK_AUTH_TOKEN`` in the API .env.
    """
    return (os.environ.get("REVENUECAT_WEBHOOK_AUTH_TOKEN") or "").strip()


@router.post("/sync-user", response_model=SyncUserResponse)
def sync_user(
    profile_id: str = Depends(require_profile_id),
) -> SyncUserResponse:
    """Upsert the RevenueCat ↔ Supabase mapping for the authenticated user.

    No body required: identity comes from the bearer token, phone and Apple
    provider id are looked up from ``profiles`` server-side so the client
    can't lie about them. RevenueCat ``app_user_id`` is always set equal to
    ``profiles.id`` because that's what the mobile client uses when
    configuring the RC SDK.
    """
    try:
        profile = supabase_db.get_profile_by_id(profile_id)
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _LOG.exception("sync_user profile lookup failed for %s", profile_id)
        raise HTTPException(
            status_code=500, detail=f"Failed to load profile: {exc}"
        ) from exc

    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")

    phone_number = profile.get("phone")
    apple_provider_id = profile.get("apple_user_id")

    try:
        row = revenuecat_users.upsert_user_mapping(
            supabase_user_id=profile_id,
            revenuecat_app_user_id=profile_id,
            phone_number=phone_number if isinstance(phone_number, str) else None,
            apple_provider_id=apple_provider_id
            if isinstance(apple_provider_id, str)
            else None,
        )
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        _LOG.exception("sync_user upsert failed for %s", profile_id)
        raise HTTPException(
            status_code=500, detail=f"Failed to sync RevenueCat mapping: {exc}"
        ) from exc

    return SyncUserResponse(
        ok=True,
        supabase_user_id=str(row.get("supabase_user_id") or profile_id),
        revenuecat_app_user_id=str(
            row.get("revenuecat_app_user_id") or profile_id
        ),
    )


@router.post("/webhook")
async def webhook(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Response:
    """Receive a RevenueCat webhook and apply it to the mapping row.

    Returns 204 on success and on intentionally-ignored events. Returns 401
    on missing/wrong shared secret, 400 on malformed JSON. Any internal
    handler exception is logged and swallowed so RC's retry queue doesn't
    pile up on a single bad event.
    """
    expected = _expected_webhook_authorization()
    if not expected:
        _LOG.error(
            "REVENUECAT_WEBHOOK_AUTH_TOKEN not set — refusing /revenuecat/webhook"
        )
        raise HTTPException(status_code=503, detail="webhook not configured")
    if not authorization or authorization.strip() != expected:
        _LOG.warning("/revenuecat/webhook auth mismatch")
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        body: Any = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")

    event = body.get("event")
    if not isinstance(event, dict):
        # We log and 204 instead of 400 here so RC retries don't pile up on
        # a one-off bad envelope. The dropped event will be backfilled by
        # the next status-bearing event for the same subscriber.
        _LOG.warning("/revenuecat/webhook: payload.event missing — ignoring")
        return Response(status_code=204)

    try:
        revenuecat_users.handle_event(event)
    except Exception:
        _LOG.exception(
            "/revenuecat/webhook handler crashed event_type=%s app_user_id=%s",
            (event.get("type") or "?") if isinstance(event, dict) else "?",
            (event.get("app_user_id") or "?") if isinstance(event, dict) else "?",
        )

    return Response(status_code=204)
