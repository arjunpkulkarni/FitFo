"""User activity counters for push notification personalization.

Used by services/notification_scheduler.py to render copy like "You've imported
8 workouts and logged 12 sessions." inside the 48h pre-charge reminder.

Each call is a single COUNT against Supabase. Cheap; no caching needed at
current trial volume.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.services.supabase_db import get_supabase

_LOG = logging.getLogger(__name__)


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def count_saved_workouts_since(user_id: str, since: Optional[datetime]) -> int:
    """How many TikTok/Instagram imports the user saved since ``since``.

    If ``since`` is None, counts all-time.
    """
    if not user_id:
        return 0
    supa = get_supabase()
    query = (
        supa.table("saved_workouts")
        .select("id", count="exact")
        .eq("user_id", user_id)
    )
    if since is not None:
        query = query.gte("created_at", _to_iso(since))
    try:
        result = query.execute()
    except Exception as exc:
        _LOG.warning("count_saved_workouts_since failed user=%s: %s", user_id, exc)
        return 0
    return int(result.count or 0)


def count_completed_workouts_since(user_id: str, since: Optional[datetime]) -> int:
    """How many sessions the user logged as complete since ``since``."""
    if not user_id:
        return 0
    supa = get_supabase()
    query = (
        supa.table("completed_workouts")
        .select("id", count="exact")
        .eq("user_id", user_id)
    )
    if since is not None:
        query = query.gte("completed_at", _to_iso(since))
    try:
        result = query.execute()
    except Exception as exc:
        _LOG.warning("count_completed_workouts_since failed user=%s: %s", user_id, exc)
        return 0
    return int(result.count or 0)
