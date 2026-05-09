"""Shared retry-with-backoff helpers for OpenAI HTTP calls.

OpenAI returns HTTP 429 when an organization exceeds its tokens-per-minute
budget on a model. The body and the ``Retry-After`` header tell us how long
to wait before the bucket refills (often well under a second). Without
retries a single 429 — even a 352 ms one — flips the ingestion job to
``failed``. This module centralizes the retry policy so every OpenAI caller
behaves the same.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Awaitable, Callable

import httpx

_log = logging.getLogger(__name__)

RETRYABLE_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503, 504})

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BASE_BACKOFF_SECONDS = 1.0
DEFAULT_MAX_BACKOFF_SECONDS = 30.0
_MIN_SERVER_HINT_SECONDS = 0.5
_JITTER_SECONDS = 0.25

_RETRY_HINT_RE = re.compile(r"try again in\s+([0-9.]+)\s*(ms|s)\b", re.IGNORECASE)


def parse_retry_after_seconds(resp: httpx.Response) -> float | None:
    """Return seconds to wait per the ``Retry-After`` header, if present and numeric."""
    headers = getattr(resp, "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if not raw:
        return None
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        # OpenAI rate-limit headers are numeric; HTTP-date variants are not relevant here.
        return None
    return max(0.0, value)


def parse_retry_hint_from_body(body: str | None) -> float | None:
    """Extract OpenAI's "Please try again in 352ms" hint from the response body."""
    if not body:
        return None
    match = _RETRY_HINT_RE.search(body)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    if match.group(2).lower() == "ms":
        value /= 1000.0
    return max(0.0, value)


def compute_backoff_delay(
    attempt: int,
    resp: httpx.Response | None,
    *,
    base: float = DEFAULT_BASE_BACKOFF_SECONDS,
    cap: float = DEFAULT_MAX_BACKOFF_SECONDS,
) -> float:
    """Wait time before the next attempt.

    Honors OpenAI's ``Retry-After`` header first, then the body hint, then
    falls back to exponential backoff. Always adds a small jitter so two
    concurrent jobs that 429 at the same instant don't retry in lockstep.
    """
    server_hint: float | None = None
    if resp is not None:
        server_hint = parse_retry_after_seconds(resp)
        if server_hint is None:
            body = getattr(resp, "text", None)
            server_hint = parse_retry_hint_from_body(body)

    if server_hint is not None:
        # Floor sub-second hints so the bucket actually has time to refill,
        # and cap absurd hints so the background task can't hang forever.
        delay = min(cap, max(server_hint, _MIN_SERVER_HINT_SECONDS))
    else:
        delay = min(cap, base * (2 ** (attempt - 1)))

    return delay + random.uniform(0.0, _JITTER_SECONDS)


async def post_with_retries(
    perform_request: Callable[[], Awaitable[httpx.Response]],
    *,
    log_label: str,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_backoff: float = DEFAULT_BASE_BACKOFF_SECONDS,
    max_backoff: float = DEFAULT_MAX_BACKOFF_SECONDS,
    sleep: Callable[[float], Awaitable[None]] | None = None,
) -> httpx.Response:
    """Run ``perform_request`` with retries on 429/5xx and transport errors.

    Returns the final ``httpx.Response`` whether successful or not — callers
    decide how to interpret a non-200 result on the last attempt. Network
    errors (``httpx.RequestError``) are re-raised once attempts are exhausted.

    ``sleep`` defaults to ``asyncio.sleep``; resolved at call time so tests can
    monkey-patch ``asyncio.sleep`` without re-importing this module.
    """
    if max_attempts < 1:
        raise ValueError("max_attempts must be >= 1")

    sleep_fn: Callable[[float], Awaitable[None]] = sleep or asyncio.sleep
    last_request_error: httpx.RequestError | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            resp = await perform_request()
        except httpx.RequestError as exc:
            last_request_error = exc
            if attempt >= max_attempts:
                raise
            delay = compute_backoff_delay(attempt, None, base=base_backoff, cap=max_backoff)
            _log.warning(
                "openai_retry label=%s network_error=%s retry_in=%.2fs attempt=%s/%s",
                log_label,
                exc,
                delay,
                attempt,
                max_attempts,
            )
            await sleep_fn(delay)
            continue

        if resp.status_code not in RETRYABLE_STATUSES or attempt >= max_attempts:
            return resp

        delay = compute_backoff_delay(attempt, resp, base=base_backoff, cap=max_backoff)
        _log.warning(
            "openai_retry label=%s status=%s retry_in=%.2fs attempt=%s/%s",
            log_label,
            resp.status_code,
            delay,
            attempt,
            max_attempts,
        )
        await sleep_fn(delay)

    # Defensive: the loop always either returns or raises above.
    if last_request_error is not None:
        raise last_request_error
    raise RuntimeError("post_with_retries exhausted attempts without a response")
