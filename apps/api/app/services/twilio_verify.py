from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

logger = logging.getLogger(__name__)


def log_twilio_rest_exception(
    operation: str,
    exc: TwilioRestException,
    *,
    to_e164: Optional[str] = None,
) -> None:
    """
    Log Twilio REST failure fields (never auth secrets).

    Codes: https://www.twilio.com/docs/errors/<code>
    """
    tail = "?"
    if to_e164:
        digits = "".join(c for c in to_e164 if c.isdigit())
        if len(digits) >= 4:
            tail = digits[-4:]
    logger.warning(
        "twilio %s failed: http_status=%s method=%s uri=%s twilio_code=%s msg=%r "
        "details=%r to_tail=%s",
        operation,
        getattr(exc, "status", None),
        getattr(exc, "method", None),
        getattr(exc, "uri", None),
        getattr(exc, "code", None),
        getattr(exc, "msg", None),
        getattr(exc, "details", None),
        tail,
    )


def _twilio_credential_fingerprint() -> dict[str, Any]:
    """Non-secret shape of env Twilio vars (wrong SID/token pairing, empty vars)."""
    sid = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
    tok = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    svc = (os.environ.get("TWILIO_SERVICE_SID") or "").strip()
    return {
        "account_sid_len": len(sid),
        "account_sid_suffix": sid[-6:] if len(sid) >= 6 else sid,
        "auth_token_len": len(tok),
        "service_sid_len": len(svc),
        "service_sid_suffix": svc[-6:] if len(svc) >= 6 else svc,
    }


def _load_env_if_missing() -> None:
    sid = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
    token = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    service_sid = (os.environ.get("TWILIO_SERVICE_SID") or "").strip()
    friendly_name = (os.environ.get("TWILIO_VERIFY_FRIENDLY_NAME") or "").strip()
    if sid and token and service_sid and friendly_name:
        return
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env", override=True)


class TwilioNotConfiguredError(RuntimeError):
    pass


@lru_cache
def _client() -> Client:
    _load_env_if_missing()
    account_sid = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
    auth_token = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    if not account_sid or not auth_token:
        raise TwilioNotConfiguredError(
            "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN for OTP delivery."
        )
    return Client(account_sid, auth_token)


@lru_cache
def _service_sid() -> str:
    _load_env_if_missing()
    service_sid = (os.environ.get("TWILIO_SERVICE_SID") or "").strip()
    if not service_sid:
        raise TwilioNotConfiguredError("Set TWILIO_SERVICE_SID for OTP delivery.")
    return service_sid


def _friendly_name() -> str:
    _load_env_if_missing()
    friendly_name = (os.environ.get("TWILIO_VERIFY_FRIENDLY_NAME") or "").strip()
    return friendly_name or "Fitfo"


def send_sms_otp(phone: str):
    service = _client().verify.v2.services(_service_sid())
    desired_name = _friendly_name()
    logger.info(
        "twilio_verify send_sms_otp start fingerprint=%s", _twilio_credential_fingerprint(),
    )

    try:
        return service.verifications.create(
            to=phone,
            channel="sms",
            custom_friendly_name=desired_name,
        )
    except TwilioRestException as exc:
        detail = str(exc.msg or exc).lower()
        if "custom friendly name not allowed" not in detail:
            log_twilio_rest_exception("verifications.create", exc, to_e164=phone)
            raise

        # Some Verify services/accounts reject per-verification branding
        # overrides. In that case, fall back to the service-level friendly
        # name instead — but warn loudly so the operator notices, because
        # Twilio will quietly use whatever is configured on the Verify
        # Service in the Twilio Console (which may not be "Fitfo"). If the
        # SMS body shows the wrong brand, rename the Verify Service in the
        # Twilio Console to match TWILIO_VERIFY_FRIENDLY_NAME.
        logger.warning(
            "Twilio rejected custom_friendly_name=%r; falling back to the "
            "service-level friendly name configured in the Twilio Console. "
            "SMS body branding depends on Service SID %s. Rename the Verify "
            "Service in the Twilio Console to %r if the SMS shows the wrong "
            "name.",
            desired_name,
            _service_sid(),
            desired_name,
        )
        try:
            return service.verifications.create(
                to=phone,
                channel="sms",
            )
        except TwilioRestException as exc2:
            log_twilio_rest_exception(
                "verifications.create_fallback_no_custom_friendly_name",
                exc2,
                to_e164=phone,
            )
            raise


def check_sms_otp(phone: str, code: str):
    try:
        return _client().verify.v2.services(_service_sid()).verification_checks.create(
            to=phone,
            code=code,
        )
    except TwilioRestException as exc:
        log_twilio_rest_exception(
            "verification_checks.create",
            exc,
            to_e164=phone,
        )
        raise
