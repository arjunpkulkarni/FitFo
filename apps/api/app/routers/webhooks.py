"""HTTP entry points for third-party webhooks (currently RevenueCat)."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response

from app.services import revenuecat_webhook

_LOG = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _expected_authorization() -> str:
    """The exact value RevenueCat sends as the ``Authorization`` header.

    Configured in RC dashboard → Project → Apps → Fitfo → Webhook URL settings
    → "Authorization header value". Must match REVENUECAT_WEBHOOK_AUTH_TOKEN
    in the API .env. We compare full strings — no Bearer-prefix munging,
    because RC sends the literal value back unmodified.
    """
    return (os.environ.get("REVENUECAT_WEBHOOK_AUTH_TOKEN") or "").strip()


@router.post("/revenuecat")
async def revenuecat(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Response:
    """Receive RevenueCat lifecycle events.

    Auth: shared-secret string in the ``Authorization`` header. RC retries
    aggressively on non-2xx, so any auth/decoding failure raises 401/400 to
    surface the misconfiguration rather than silently dropping events.

    Returns 204 on accepted events (including ones we ignore by design).
    """
    expected = _expected_authorization()
    if not expected:
        # Fail loudly rather than letting unsigned traffic through.
        _LOG.error("REVENUECAT_WEBHOOK_AUTH_TOKEN not set — refusing webhook")
        raise HTTPException(status_code=503, detail="webhook not configured")
    if not authorization or authorization.strip() != expected:
        _LOG.warning("RevenueCat webhook auth mismatch")
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")

    event = body.get("event")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="payload.event missing")

    try:
        revenuecat_webhook.handle_event(event)
    except revenuecat_webhook.WebhookValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        # Don't surface internal errors to RC — this would trigger their
        # retry storm. Log + accept; we'll catch missed events on the next
        # status-bearing webhook for the same subscriber.
        _LOG.exception("RC webhook handler crashed event=%s: %s", event.get("type"), exc)
    return Response(status_code=204)
