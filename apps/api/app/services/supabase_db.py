from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

try:
    import phonenumbers
except ImportError:
    phonenumbers = None  # type: ignore[assignment,no-redef]


from dotenv import load_dotenv
from supabase import Client, create_client


def _load_env_if_missing() -> None:
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if url and key:
        return
    root = Path(__file__).resolve().parents[2]
    # override=True: fix stale empty vars from an earlier parse of KEY= with no value
    load_dotenv(root / ".env", override=True)


class SupabaseNotConfiguredError(RuntimeError):
    pass


class ProfileNotFoundError(RuntimeError):
    pass


@lru_cache
def _client() -> Client:
    _load_env_if_missing()
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise SupabaseNotConfiguredError(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistence."
        )
    return create_client(url, key)


def get_supabase() -> Client:
    return _client()


def normalize_phone_number(phone: str) -> str:
    """
    Normalize to E.164 for Twilio + Supabase.

    Prefer `phonenumbers` when installed (correct national formats).
    Fallback to digit heuristics only if the dependency is missing (avoids crashing
    when deploy pip install was skipped).

    Bare digit strings with the heuristic can still produce odd E.164 for some locales
    (e.g. UK leading 0) — fix by installing `phonenumbers` per requirements.txt.
    """
    raw = (phone or "").strip()
    if not raw:
        raise ValueError("Phone number is required")

    pn = phonenumbers
    if pn is not None:
        from phonenumbers import NumberParseException, PhoneNumberFormat

        region = (os.environ.get("PHONE_DEFAULT_REGION") or "US").strip().upper()
        if len(region) != 2:
            region = "US"

        try:
            parsed = pn.parse(raw, None if raw.startswith("+") else region)
        except NumberParseException:
            raise ValueError("Enter a valid phone number") from None

        if not pn.is_valid_number(parsed):
            raise ValueError("Enter a valid phone number")

        return pn.format_number(parsed, PhoneNumberFormat.E164)

    return _legacy_normalize_phone_digits(raw)


def _legacy_normalize_phone_digits(phone: str) -> str:
    """
    Older Fitfo heuristic (pre libphonenumber). Still used only as an alternate
    lookup key when matching existing profile rows keyed with that format.
    """
    raw = (phone or "").strip()
    if not raw:
        raise ValueError("Phone number is required")

    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if 8 <= len(digits) <= 15:
        return f"+{digits}"
    raise ValueError("Enter a valid phone number")


def _profile_phone_lookup_keys(raw_phone: str) -> List[str]:
    """Ordered keys to try against profiles.phone — canonical first."""
    canonical = normalize_phone_number(raw_phone)
    keys: List[str] = [canonical]
    try:
        legacy = _legacy_normalize_phone_digits(raw_phone)
        if legacy not in keys:
            keys.append(legacy)
    except ValueError:
        pass
    return keys


def _require_bucket() -> str:
    bucket = (os.environ.get("SUPABASE_STORAGE_BUCKET") or "").strip()
    return bucket or "raw-media"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


PROFILE_SELECT_FIELDS = (
    "id, full_name, phone, email, apple_user_id, created_at, updated_at"
)
PROFILE_ONBOARDING_SELECT_FIELDS = (
    "user_id, goals, sex, training_split, custom_split_notes, days_per_week, weight_lbs, "
    "height_inches, experience_level, age, completed_at, created_at, updated_at"
)
BODY_WEIGHT_ENTRY_SELECT_FIELDS = (
    "id, user_id, weight_lbs, source, recorded_at, created_at, updated_at"
)


def create_ingestion_job(
    source_url: str,
    *,
    provider_meta: Dict[str, Any],
    user_id: str,
) -> Dict[str, Any]:
    """Insert a row into ingestion_jobs. Returns the inserted row (incl. id)."""
    supa = get_supabase()
    payload = {
        "user_id": user_id,
        "source_url": source_url,
        "status": "pending",
        "provider_meta": provider_meta,
    }
    result = supa.table("ingestion_jobs").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert returned no data")
    return result.data[0]


def update_ingestion_job(
    job_id: str,
    *,
    status: Optional[str] = None,
    error: Optional[str] = None,
    provider_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    patch: Dict[str, Any] = {}
    if status is not None:
        patch["status"] = status
    if error is not None:
        patch["error"] = error
    if provider_meta is not None:
        patch["provider_meta"] = provider_meta
    if not patch:
        raise ValueError("No fields to update")
    result = supa.table("ingestion_jobs").update(patch).eq("id", job_id).execute()
    if not result.data:
        raise RuntimeError("Supabase update returned no data")
    return result.data[0]


def get_ingestion_job(job_id: str, *, user_id: Optional[str] = None) -> Dict[str, Any]:
    supa = get_supabase()
    query = supa.table("ingestion_jobs").select("*").eq("id", job_id)
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.single().execute()
    if not result.data:
        raise RuntimeError("Supabase select returned no data")
    return result.data


def merge_provider_meta(existing: Optional[Dict[str, Any]], updates: Dict[str, Any]) -> Dict[str, Any]:
    base = dict(existing or {})
    for k, v in updates.items():
        base[k] = v
    return base


def upsert_expo_push_token(user_id: str, expo_push_token: str) -> None:
    """Register or refresh an Expo push token for this profile."""
    supa = get_supabase()
    token = (expo_push_token or "").strip()
    if not token or len(token) > 512:
        raise ValueError("Invalid Expo push token")
    patch_time = _utc_now_iso()
    found = (
        supa.table("user_push_tokens")
        .select("id")
        .eq("user_id", user_id)
        .eq("expo_push_token", token)
        .limit(1)
        .execute()
    )
    if found.data:
        supa.table("user_push_tokens").update({"updated_at": patch_time}).eq(
            "user_id", user_id
        ).eq("expo_push_token", token).execute()
        return
    supa.table("user_push_tokens").insert(
        {
            "user_id": user_id,
            "expo_push_token": token,
            "updated_at": patch_time,
        }
    ).execute()


def list_expo_push_tokens_for_user(user_id: str) -> List[str]:
    """All registered device tokens for push (may be empty)."""
    supa = get_supabase()
    result = (
        supa.table("user_push_tokens")
        .select("expo_push_token")
        .eq("user_id", user_id)
        .execute()
    )
    out: List[str] = []
    for row in result.data or []:
        t = row.get("expo_push_token")
        if isinstance(t, str) and t.strip():
            out.append(t.strip())
    return out


def create_transcript(
    job_id: str,
    *,
    text: str,
    segments: Optional[List[Dict[str, Any]]] = None,
    language: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "job_id": job_id,
        "text": text,
    }
    if segments is not None:
        payload["segments"] = segments
    if language is not None:
        payload["language"] = language
    if model is not None:
        payload["model"] = model
    result = supa.table("transcripts").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert (transcripts) returned no data")
    return result.data[0]


def get_transcript_by_job(job_id: str) -> Dict[str, Any]:
    supa = get_supabase()
    result = supa.table("transcripts").select("*").eq("job_id", job_id).single().execute()
    if not result.data:
        raise RuntimeError(f"No transcript found for job {job_id}")
    return result.data


def create_workout(
    job_id: str,
    *,
    user_id: str,
    title: Optional[str] = None,
    plan: Dict[str, Any],
    parser_model: Optional[str] = None,
    schema_version: int = 1,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "job_id": job_id,
        "user_id": user_id,
        "plan": plan,
        "schema_version": schema_version,
    }
    if title is not None:
        payload["title"] = title
    if parser_model is not None:
        payload["parser_model"] = parser_model
    result = supa.table("workouts").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert (workouts) returned no data")
    return result.data[0]


def get_workout_by_job(job_id: str, *, user_id: Optional[str] = None) -> Dict[str, Any]:
    supa = get_supabase()
    query = supa.table("workouts").select("*").eq("job_id", job_id)
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.single().execute()
    if not result.data:
        raise RuntimeError(f"No workout found for job {job_id}")
    return result.data


def list_saved_workouts(user_id: str) -> List[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("saved_workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("saved_at", desc=True)
        .execute()
    )
    return list(result.data or [])


def create_or_update_saved_workout(
    user_id: str,
    *,
    workout_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    title: str,
    description: Optional[str] = None,
    meta_left: Optional[str] = None,
    meta_right: Optional[str] = None,
    badge_label: Optional[str] = None,
    workout_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "title": title,
        "description": description,
        "meta_left": meta_left,
        "meta_right": meta_right,
        "badge_label": badge_label,
        "workout_plan": workout_plan,
        "source_url": source_url,
        "thumbnail_url": thumbnail_url,
        "saved_at": _utc_now_iso(),
    }
    if workout_id is not None:
        payload["workout_id"] = workout_id
    if job_id is not None:
        payload["job_id"] = job_id

    existing: Optional[Dict[str, Any]] = None
    if workout_id is not None:
        existing_result = (
            supa.table("saved_workouts")
            .select("*")
            .eq("user_id", user_id)
            .eq("workout_id", workout_id)
            .limit(1)
            .execute()
        )
        if existing_result.data:
            existing = existing_result.data[0]

    if existing is not None:
        result = (
            supa.table("saved_workouts")
            .update(payload)
            .eq("id", existing["id"])
            .eq("user_id", user_id)
            .execute()
        )
    else:
        result = supa.table("saved_workouts").insert(payload).execute()

    if not result.data:
        raise RuntimeError("Supabase saved_workouts write returned no data")
    return result.data[0]


_SAVED_WORKOUT_UPDATABLE_FIELDS = frozenset(
    {
        "title",
        "description",
        "meta_left",
        "meta_right",
        "badge_label",
        "workout_plan",
        "source_url",
    }
)


def update_saved_workout(
    saved_workout_id: str,
    *,
    user_id: str,
    fields: Dict[str, Any],
) -> Dict[str, Any]:
    # Whitelist so unexpected keys (e.g. user_id, id, workout_id) can't be
    # smuggled in via the PATCH body. `fields` is already the pydantic
    # `exclude_unset=True` dict so absent fields won't accidentally null out
    # columns; we still guard against empty patches at the router level.
    patch: Dict[str, Any] = {
        key: value for key, value in fields.items() if key in _SAVED_WORKOUT_UPDATABLE_FIELDS
    }
    if not patch:
        raise ValueError("No fields to update")

    supa = get_supabase()
    result = (
        supa.table("saved_workouts")
        .update(patch)
        .eq("id", saved_workout_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError("Saved workout not found")
    return result.data[0]


def delete_saved_workout(saved_workout_id: str, *, user_id: str) -> Dict[str, Any]:
    supa = get_supabase()
    existing = (
        supa.table("saved_workouts")
        .select("*")
        .eq("id", saved_workout_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise RuntimeError("Saved workout not found")

    supa.table("saved_workouts").delete().eq("id", saved_workout_id).eq("user_id", user_id).execute()
    return existing.data[0]


SCHEDULED_WORKOUT_FIELDS = (
    "id, user_id, source_workout_id, workout_id, job_id, source_url, thumbnail_url, scheduled_for, "
    "status, title, description, meta_left, meta_right, badge_label, workout_plan, "
    "created_at, updated_at"
)


def list_scheduled_workouts(
    user_id: str,
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    supa = get_supabase()
    query = (
        supa.table("scheduled_workouts")
        .select(SCHEDULED_WORKOUT_FIELDS)
        .eq("user_id", user_id)
        .eq("status", "scheduled")
    )
    if start_date is not None:
        query = query.gte("scheduled_for", start_date)
    if end_date is not None:
        query = query.lte("scheduled_for", end_date)
    result = query.order("scheduled_for", desc=False).execute()
    return list(result.data or [])


def create_scheduled_workout(
    user_id: str,
    *,
    scheduled_for: str,
    title: str,
    source_workout_id: Optional[str] = None,
    workout_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    description: Optional[str] = None,
    meta_left: Optional[str] = None,
    meta_right: Optional[str] = None,
    badge_label: Optional[str] = None,
    workout_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "scheduled_for": scheduled_for,
        "title": title,
        "description": description,
        "meta_left": meta_left,
        "meta_right": meta_right,
        "badge_label": badge_label,
        "workout_plan": workout_plan,
        "source_url": source_url,
        "thumbnail_url": thumbnail_url,
        "status": "scheduled",
    }
    if source_workout_id is not None:
        payload["source_workout_id"] = source_workout_id
    if workout_id is not None:
        payload["workout_id"] = workout_id
    if job_id is not None:
        payload["job_id"] = job_id

    result = supa.table("scheduled_workouts").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase scheduled_workouts insert returned no data")
    return result.data[0]


_SCHEDULED_WORKOUT_UPDATABLE_FIELDS = frozenset(
    {
        "scheduled_for",
        "status",
        "title",
        "description",
        "meta_left",
        "meta_right",
        "badge_label",
        "workout_plan",
        "source_url",
    }
)


def update_scheduled_workout(
    scheduled_workout_id: str,
    *,
    user_id: str,
    fields: Dict[str, Any],
) -> Dict[str, Any]:
    # See update_saved_workout for the rationale behind the allowlist.
    patch: Dict[str, Any] = {
        key: value
        for key, value in fields.items()
        if key in _SCHEDULED_WORKOUT_UPDATABLE_FIELDS
    }
    if not patch:
        raise ValueError("No fields to update")

    supa = get_supabase()
    result = (
        supa.table("scheduled_workouts")
        .update(patch)
        .eq("id", scheduled_workout_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError("Scheduled workout not found")
    return result.data[0]


def delete_scheduled_workout(
    scheduled_workout_id: str, *, user_id: str
) -> Dict[str, Any]:
    supa = get_supabase()
    existing = (
        supa.table("scheduled_workouts")
        .select(SCHEDULED_WORKOUT_FIELDS)
        .eq("id", scheduled_workout_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise RuntimeError("Scheduled workout not found")

    supa.table("scheduled_workouts").delete().eq("id", scheduled_workout_id).eq(
        "user_id", user_id
    ).execute()
    return existing.data[0]


def list_completed_workouts(user_id: str) -> List[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("completed_workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("completed_at", desc=True)
        .execute()
    )
    return list(result.data or [])


def fetch_lift_set_logs_latest_snapshot(user_id: str) -> List[Dict[str, Any]]:
    """Latest logged weight/reps (or timed duration) per exercise_key + set_position."""
    supa = get_supabase()
    result = supa.rpc(
        "lift_set_logs_latest_snapshot",
        {"p_user_id": user_id},
    ).execute()
    raw = result.data or []
    normalized: List[Dict[str, Any]] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        patch = dict(row)
        wl = patch.get("weight_lbs")
        if wl is not None:
            patch["weight_lbs"] = float(wl)
        normalized.append(patch)
    return normalized


def create_completed_workout(
    user_id: str,
    *,
    workout_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source_url: Optional[str] = None,
    title: str,
    description: Optional[str] = None,
    summary: Optional[str] = None,
    exercises: List[Dict[str, Any]],
    workout_plan: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
    calories: Optional[int] = None,
    difficulty: Optional[str] = None,
    tags: Optional[List[str]] = None,
    average_rest_seconds: Optional[int] = None,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "title": title,
        "description": description,
        "summary": summary,
        "exercises": exercises,
        "workout_plan": workout_plan,
        "notes": notes,
        "calories": calories,
        "difficulty": difficulty,
        "tags": tags or [],
        "average_rest_seconds": average_rest_seconds,
    }
    if workout_id is not None:
        payload["workout_id"] = workout_id
    if job_id is not None:
        payload["job_id"] = job_id
    if source_url is not None:
        payload["source_url"] = source_url
    if started_at is not None:
        payload["started_at"] = started_at
    if completed_at is not None:
        payload["completed_at"] = completed_at

    result = supa.table("completed_workouts").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase completed_workouts insert returned no data")
    return result.data[0]


def get_completed_workout(completed_workout_id: str, *, user_id: str) -> Dict[str, Any]:
    supa = get_supabase()
    result = (
        supa.table("completed_workouts")
        .select("*")
        .eq("id", completed_workout_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise RuntimeError("Completed workout not found")
    return result.data


def get_profile_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    """Resolve profile from raw user input; canonical E.164 first, then legacy heuristic."""
    supa = get_supabase()
    for normalized_phone in _profile_phone_lookup_keys(phone):
        result = (
            supa.table("profiles")
            .select(PROFILE_SELECT_FIELDS)
            .eq("phone", normalized_phone)
            .limit(1)
            .execute()
        )
        if result.data:
            return _attach_profile_onboarding(result.data[0])
    return None


def get_profile_by_id(profile_id: str) -> Optional[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("profiles")
        .select(PROFILE_SELECT_FIELDS)
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return _attach_profile_onboarding(result.data[0])


def get_profile_onboarding(user_id: str) -> Optional[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("profile_onboarding")
        .select(PROFILE_ONBOARDING_SELECT_FIELDS)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


def _attach_profile_onboarding(profile: Dict[str, Any]) -> Dict[str, Any]:
    hydrated = dict(profile)
    hydrated["onboarding"] = get_profile_onboarding(str(profile["id"]))
    return hydrated


def create_profile(*, full_name: str, phone: str) -> Dict[str, Any]:
    supa = get_supabase()
    clean_name = full_name.strip()
    if not clean_name:
        raise ValueError("Full name is required")

    normalized_phone = normalize_phone_number(phone)
    payload = {
        "full_name": clean_name,
        "phone": normalized_phone,
    }
    result = supa.table("profiles").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert (profiles) returned no data")
    return _attach_profile_onboarding(result.data[0])


def get_profile_by_apple_user_id(apple_user_id: str) -> Optional[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("profiles")
        .select(PROFILE_SELECT_FIELDS)
        .eq("apple_user_id", apple_user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return _attach_profile_onboarding(result.data[0])


def create_profile_with_apple(
    *,
    apple_user_id: str,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    clean_name = (full_name or "").strip() or "Fitfo User"
    clean_email = (email or "").strip() or None
    payload: Dict[str, Any] = {
        "full_name": clean_name,
        "apple_user_id": apple_user_id.strip(),
    }
    if clean_email:
        payload["email"] = clean_email
    result = supa.table("profiles").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert (profiles via apple) returned no data")
    return _attach_profile_onboarding(result.data[0])


def update_profile_full_name(profile_id: str, *, full_name: str) -> Dict[str, Any]:
    """Set the user's display name. Raises ValueError if the name is empty after trim."""
    clean = (full_name or "").strip()
    if not clean:
        raise ValueError("Full name cannot be empty")
    if len(clean) > 120:
        raise ValueError("Full name must be at most 120 characters")
    supa = get_supabase()
    result = (
        supa.table("profiles")
        .update({"full_name": clean})
        .eq("id", profile_id)
        .execute()
    )
    if not result.data:
        raise ProfileNotFoundError(f"Profile {profile_id} not found")
    return _attach_profile_onboarding(result.data[0])


# Tables that own per-user rows and must be purged when a profile is deleted.
# Order is child-first so foreign keys don't block the cascade even if
# individual FK constraints aren't `on delete cascade` in the DB.
_USER_SCOPED_TABLES: Tuple[str, ...] = (
    "user_push_tokens",
    "body_weight_entries",
    "completed_workouts",
    "scheduled_workouts",
    "saved_workouts",
)


def _delete_user_rows(table: str, user_id: str) -> None:
    """Best-effort delete of a user's rows in a table. Swallows errors so a
    single table failing doesn't block the rest of the cascade."""
    try:
        supa = get_supabase()
        supa.table(table).delete().eq("user_id", user_id).execute()
    except Exception:
        # Account deletion must be resilient to partial schemas / bad rows.
        pass


def delete_profile(profile_id: str) -> Dict[str, Any]:
    """
    Hard-delete a user account and every row it owns.

    Returns the pre-delete profile snapshot so callers can use fields like
    `apple_user_id` to run post-delete cleanup (e.g. Apple token revocation)
    without another round-trip to the DB.

    Deletion order:
      1. body_weight_entries, completed_workouts, scheduled_workouts,
         saved_workouts (leaf tables keyed by user_id)
      2. transcripts (via the user's ingestion_jobs — transcripts don't have
         user_id but they cascade when the parent job goes)
      3. workouts (keyed by user_id)
      4. ingestion_jobs (keyed by user_id; deleting here releases any
         remaining transcripts via `on delete cascade` if set, otherwise the
         transcripts pass above has already cleared them)
      5. profile_onboarding (keyed by user_id)
      6. profiles (the account row itself)

    App Store Guideline 5.1.1(v): we run this on explicit user request from
    inside the app. For Apple Sign In users, the caller is also expected to
    revoke the refresh token with Apple (see `apple_auth.revoke_refresh_token`).
    """
    supa = get_supabase()

    existing = (
        supa.table("profiles")
        .select(PROFILE_SELECT_FIELDS)
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise ProfileNotFoundError(f"Profile {profile_id} not found")
    snapshot = existing.data[0]

    for table in _USER_SCOPED_TABLES:
        _delete_user_rows(table, profile_id)

    # Transcripts are keyed by job_id, not user_id. Pull the user's jobs and
    # clear their transcripts before deleting the jobs themselves.
    try:
        jobs_result = (
            supa.table("ingestion_jobs")
            .select("id")
            .eq("user_id", profile_id)
            .execute()
        )
        job_ids = [row["id"] for row in (jobs_result.data or []) if row.get("id")]
        if job_ids:
            try:
                supa.table("transcripts").delete().in_("job_id", job_ids).execute()
            except Exception:
                pass
    except Exception:
        pass

    _delete_user_rows("workouts", profile_id)
    _delete_user_rows("ingestion_jobs", profile_id)
    _delete_user_rows("profile_onboarding", profile_id)

    supa.table("profiles").delete().eq("id", profile_id).execute()
    return snapshot


def update_profile_apple_fields(
    profile_id: str,
    *,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Patch nullable profile fields that may arrive on first Apple sign-in after
    the profile already exists. No-op if nothing meaningful is supplied.
    """
    patch: Dict[str, Any] = {}
    clean_name = (full_name or "").strip()
    if clean_name and clean_name != "Fitfo User":
        patch["full_name"] = clean_name
    clean_email = (email or "").strip()
    if clean_email:
        patch["email"] = clean_email
    if not patch:
        return None
    supa = get_supabase()
    result = (
        supa.table("profiles")
        .update(patch)
        .eq("id", profile_id)
        .execute()
    )
    if not result.data:
        return None
    return _attach_profile_onboarding(result.data[0])


def upsert_profile_onboarding(
    user_id: str,
    *,
    goals: List[str],
    sex: str,
    training_split: str,
    days_per_week: int,
    weight_lbs: float,
    height_inches: int,
    experience_level: str,
    age: int,
    custom_split_notes: Optional[str] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    cleaned_goals = list(dict.fromkeys(goal.strip() for goal in goals if goal.strip()))
    if not cleaned_goals:
        raise ValueError("Select at least one goal")

    cleaned_notes: Optional[str] = None
    if custom_split_notes is not None:
        trimmed = custom_split_notes.strip()
        cleaned_notes = trimmed or None

    if training_split == "custom" and not cleaned_notes:
        raise ValueError("Describe your custom split so we can tailor your plan.")
    if training_split != "custom":
        cleaned_notes = None

    payload: Dict[str, Any] = {
        "goals": cleaned_goals,
        "sex": sex,
        "training_split": training_split,
        "custom_split_notes": cleaned_notes,
        "days_per_week": days_per_week,
        "weight_lbs": weight_lbs,
        "height_inches": height_inches,
        "experience_level": experience_level,
        "age": age,
    }

    existing = get_profile_onboarding(user_id)
    if existing is None:
        result = (
            supa.table("profile_onboarding")
            .insert(
                {
                    "user_id": user_id,
                    "completed_at": _utc_now_iso(),
                    **payload,
                }
            )
            .execute()
        )
    else:
        result = (
            supa.table("profile_onboarding")
            .update(payload)
            .eq("user_id", user_id)
            .execute()
        )

    if not result.data:
        raise RuntimeError("Supabase upsert (profile_onboarding) returned no data")
    ensure_initial_body_weight_entry(
        user_id,
        weight_lbs=weight_lbs,
        recorded_at=existing["completed_at"] if existing is not None else result.data[0]["completed_at"],
    )
    return result.data[0]


def list_body_weight_entries(user_id: str) -> List[Dict[str, Any]]:
    supa = get_supabase()
    result = (
        supa.table("body_weight_entries")
        .select(BODY_WEIGHT_ENTRY_SELECT_FIELDS)
        .eq("user_id", user_id)
        .order("recorded_at", desc=False)
        .execute()
    )
    return list(result.data or [])


def create_body_weight_entry(
    user_id: str,
    *,
    weight_lbs: float,
    source: str = "manual",
    recorded_at: Optional[str] = None,
) -> Dict[str, Any]:
    supa = get_supabase()
    payload: Dict[str, Any] = {
        "user_id": user_id,
        "weight_lbs": weight_lbs,
        "source": source,
        "recorded_at": recorded_at or _utc_now_iso(),
    }
    result = supa.table("body_weight_entries").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Supabase insert (body_weight_entries) returned no data")
    return result.data[0]


def ensure_initial_body_weight_entry(
    user_id: str,
    *,
    weight_lbs: float,
    recorded_at: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    supa = get_supabase()
    existing = (
        supa.table("body_weight_entries")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return None
    return create_body_weight_entry(
        user_id,
        weight_lbs=weight_lbs,
        source="onboarding",
        recorded_at=recorded_at,
    )


def upload_bytes_to_storage(
    *,
    path: str,
    content: bytes,
    content_type: str,
    upsert: bool = True,
    bucket: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upload bytes to Supabase Storage using the service role.
    Returns the storage API response dict.
    """
    supa = get_supabase()
    b = bucket or _require_bucket()
    options = {"content-type": content_type, "x-upsert": "true" if upsert else "false"}
    # supabase-py expects raw bytes for small uploads
    return supa.storage.from_(b).upload(path, content, file_options=options)  # type: ignore[no-any-return]


def create_signed_download_url_for_path(
    *,
    bucket: str,
    path: str,
    expires_in_seconds: int = 604800,
) -> Optional[str]:
    """
    Builds a temporary HTTPS URL suitable for RN <Image uri=…> downloads.
    Returns None when Supabase is not configured or signing fails.
    """
    bucket_name = bucket.strip()
    object_path = path.strip().lstrip("/")
    if not bucket_name or not object_path:
        return None
    try:
        supa = get_supabase()
        out = supa.storage.from_(bucket_name).create_signed_url(
            object_path, expires_in_seconds
        )
    except Exception:
        return None
    if isinstance(out, dict):
        return out.get("signedURL") or out.get("signedUrl")  # storage3 casing varies
    return getattr(out, "signedURL", None) or getattr(out, "signedUrl", None)
