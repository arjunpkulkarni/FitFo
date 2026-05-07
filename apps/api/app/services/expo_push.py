"""Send notifications via Expo Push API (server → device).

Two layers:

1. ``send_push`` — generic, low-level. Used by trial lifecycle notifications
   (services/notification_scheduler.py) and any future server-driven push.
2. ``send_ingestion_ready_to_tokens`` — typed wrapper around send_push for the
   "your import is ready" notification (called from ingestion_pipeline.py and
   routers/jobs.py).

Both are best-effort: they never raise back to callers — failures are logged.
DISABLE_EXPO_PUSH=1 short-circuits both for local dev / tests.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Mapping, Optional

import httpx

_LOG = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

INGESTION_READY_KIND = "ingestion-ready"
TRIAL_PRE_CHARGE_KIND = "trial-pre-charge-48h"
TRIAL_CONVERTED_KIND = "trial-converted"


def _push_disabled() -> bool:
    return os.environ.get("DISABLE_EXPO_PUSH", "").strip() in ("1", "true", "yes")


def _expo_headers() -> dict[str, str]:
    headers: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    expo_token = (os.environ.get("EXPO_ACCESS_TOKEN") or "").strip()
    if expo_token:
        headers["Authorization"] = f"Bearer {expo_token}"
    return headers


def send_push(
    *,
    expo_push_tokens: list[str],
    title: str,
    body: str,
    data: Optional[Mapping[str, Any]] = None,
    log_label: str = "push",
) -> dict[str, Any] | None:
    """
    Generic Expo push sender. Returns the parsed Expo response dict on success,
    None on no-op / failure. Never raises.

    ``data`` becomes the message ``data`` field — must be JSON-serializable.
    ``log_label`` is a free-form string used in log lines (e.g. "trial-48h:user_id=…").
    """
    tokens = [t.strip() for t in expo_push_tokens if t and str(t).strip()]
    if not tokens:
        return None

    if _push_disabled():
        _LOG.info("Expo push disabled (DISABLE_EXPO_PUSH); skipping %s", log_label)
        return None

    payload_data: dict[str, Any] = dict(data or {})
    messages = [
        {
            "to": t,
            "title": title,
            "body": body,
            "sound": "default",
            "data": payload_data,
        }
        for t in tokens
    ]

    try:
        response = httpx.post(
            EXPO_PUSH_URL,
            json=messages,
            headers=_expo_headers(),
            timeout=httpx.Timeout(20.0, connect=10.0),
        )
        if response.status_code >= 400:
            _LOG.warning(
                "Expo push HTTP %s for %s: %s",
                response.status_code,
                log_label,
                response.text[:500],
            )
            return None
        try:
            parsed = response.json()
        except Exception:
            _LOG.debug("Expo push response not JSON for %s", log_label)
            return None
        # Surface per-token errors so DeviceNotRegistered etc. are visible in logs.
        receipts = parsed.get("data") if isinstance(parsed, dict) else None
        if isinstance(receipts, list):
            for item in receipts:
                if not isinstance(item, dict):
                    continue
                if item.get("status") == "error":
                    _LOG.warning(
                        "Expo push ticket error %s: %s",
                        log_label,
                        item.get("message") or item,
                    )
        return parsed if isinstance(parsed, dict) else None
    except httpx.HTTPError as exc:
        _LOG.warning("Expo push request failed %s: %s", log_label, exc)
        return None


def creator_label_from_source_url(url: str | None) -> str | None:
    """Best-effort @handle for TikTok / Instagram URLs (matches client copy)."""
    if not url or not isinstance(url, str):
        return None
    u = url.strip()
    m = re.search(r"tiktok\.com/@([^/?.#]+)", u, re.I)
    if m:
        return f"@{m.group(1)}"
    m = re.search(r"instagram\.com/([^/?.#]+)", u, re.I)
    if m:
        segment = m.group(1)
        if segment.lower() not in ("reel", "reels", "p", "stories", "st"):
            return f"@{segment}"
    return None


def _build_ingestion_body(
    *,
    workout_title: str,
    creator_handle: str | None,
) -> tuple[str, str]:
    clean_title = (workout_title or "").strip() or "Your workout"
    if creator_handle:
        body = f"{creator_handle}'s {clean_title} is built. Tap to schedule or save it."
    else:
        body = f"{clean_title} is built. Tap to schedule or save it."
    return "Your workout's ready.", body


def send_ingestion_ready_to_tokens(
    *,
    expo_push_tokens: list[str],
    job_id: str,
    workout_title: str,
    source_url: str | None,
) -> None:
    """Typed wrapper around ``send_push`` for the import-complete push."""
    notif_title, notif_body = _build_ingestion_body(
        workout_title=workout_title,
        creator_handle=creator_label_from_source_url(source_url),
    )
    send_push(
        expo_push_tokens=expo_push_tokens,
        title=notif_title,
        body=notif_body,
        data={"kind": INGESTION_READY_KIND, "jobId": job_id},
        log_label=f"ingestion-ready:job_id={job_id}",
    )
