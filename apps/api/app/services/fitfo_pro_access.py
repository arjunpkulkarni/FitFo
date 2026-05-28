"""
Server-side Fitfo Pro bypass (team accounts, founders) independent of RevenueCat.

Configure via env (comma-, newline-, or semicolon-separated lists). Example:
  FITFO_PRO_BYPASS_USER_IDS=uuid1,uuid2
  FITFO_PRO_BYPASS_EMAILS=you@company.com,other@company.com
  FITFO_PRO_BYPASS_PHONES=+15551234567

There are NO hardcoded allowlists — all bypass identities must be supplied via
environment so production can grant or revoke Pro access without a code deploy.
With no env vars set, every account goes through the normal RevenueCat paywall.
"""

from __future__ import annotations

import os
from typing import Any, Mapping

from app.services import subscription_state


def _env_csv(name: str) -> set[str]:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return set()
    # Allow multi-account lists pasted from spreadsheets or secrets managers.
    normalized = raw.replace("\n", ",").replace("\r", ",").replace(";", ",")
    return {part.strip() for part in normalized.split(",") if part.strip()}


def profile_has_fitfo_pro_bypass(profile: Mapping[str, Any]) -> bool:
    """True when this account should be treated as Pro on the backend."""
    user_id = str(profile.get("id") or "").strip()
    if user_id and user_id in _env_csv("FITFO_PRO_BYPASS_USER_IDS"):
        return True

    email = str(profile.get("email") or "").strip().lower()
    if email:
        env_emails = {e.strip().lower() for e in _env_csv("FITFO_PRO_BYPASS_EMAILS")}
        if email in env_emails:
            return True

    phone = str(profile.get("phone") or "").replace(" ", "")
    if phone:
        env_phones = {p.replace(" ", "") for p in _env_csv("FITFO_PRO_BYPASS_PHONES")}
        if phone in env_phones:
            return True

    return False


def embed_fitfo_pro_bypass(profile: Mapping[str, Any]) -> dict[str, Any]:
    """Shallow copy with computed ``fitfo_pro_bypass`` for API responses."""
    out = dict(profile)
    out["fitfo_pro_bypass"] = profile_has_fitfo_pro_bypass(profile)
    return out


def profile_has_fitfo_pro_access(profile: Mapping[str, Any]) -> bool:
    """True when this profile should bypass Free-tier limits on the API."""
    if profile_has_fitfo_pro_bypass(profile):
        return True
    user_id = str(profile.get("id") or "").strip()
    if not user_id:
        return False
    try:
        return subscription_state.user_has_active_pro(user_id)
    except Exception:
        return False
