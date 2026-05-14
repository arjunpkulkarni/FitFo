#!/usr/bin/env python3
"""
Verify Twilio env on the droplet without printing secrets.

Usage (from repo or copy path):
  cd /opt/FitFo/apps/api
  ./venv/bin/python check_twilio_env.py

Loads .env from this directory unless vars are already set.
Exit 0: credentials authenticate. Exit 1: missing vars or Twilio error.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        from dotenv import load_dotenv

        load_dotenv(env_path, override=False)

    sid = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
    tok = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    svc = (os.environ.get("TWILIO_SERVICE_SID") or "").strip()

    print(f"Loaded .env from: {env_path} (exists={env_path.exists()})")
    print(
        "TWILIO_ACCOUNT_SID: "
        f"len={len(sid)} suffix={sid[-6:] if len(sid) >= 6 else sid!r} "
        f"prefix_ok={sid.startswith('AC')}"
    )
    print(
        "TWILIO_AUTH_TOKEN: "
        f"len={len(tok)} (Twilio Primary token is typically 32 hex chars)"
    )
    print(
        "TWILIO_SERVICE_SID: "
        f"len={len(svc)} suffix={svc[-6:] if len(svc) >= 6 else svc!r} "
        f"prefix_ok={svc.startswith('VA')}"
    )

    missing = []
    if not sid:
        missing.append("TWILIO_ACCOUNT_SID")
    if not tok:
        missing.append("TWILIO_AUTH_TOKEN")
    if not svc:
        missing.append("TWILIO_SERVICE_SID")
    if missing:
        print("ERROR: missing:", ", ".join(missing))
        return 1

    try:
        from twilio.rest import Client

        client = Client(sid, tok)
        client.api.accounts(sid).fetch()
    except Exception as exc:  # TwilioRestException or network
        print("ERROR: Twilio rejected SID+token:", exc)
        print(
            "Fix: Twilio Console → same account whose SID you use → regenerate "
            "Primary Auth Token, update .env, restart fitfo-api. "
            "If Verify lives under a subaccount, use that account's SID+token."
        )
        return 1

    print("OK: Account credentials accepted by Twilio REST API.")

    try:
        client.verify.v2.services(svc).fetch()
    except Exception as exc:
        print("WARN: Credentials OK but Verify service SID error:", exc)
        print(
            "Ensure TWILIO_SERVICE_SID belongs to THIS Twilio account "
            "(Console → Verify → Services → copy SID)."
        )
        return 1

    print("OK: Verify service SID is reachable with these credentials.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
