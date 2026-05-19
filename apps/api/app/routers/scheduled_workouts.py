from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routers.deps import require_profile_id
from app.schemas.scheduled_workouts import (
    ScheduledWorkoutCreateRequest,
    ScheduledWorkoutResponse,
    ScheduledWorkoutUpdateRequest,
)
from app.services import supabase_db

router = APIRouter(prefix="/scheduled-workouts", tags=["scheduled-workouts"])


def _parse_date(value: str, field: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}: must be YYYY-MM-DD",
        ) from exc


@router.get("", response_model=list[ScheduledWorkoutResponse])
def list_scheduled_workouts(
    profile_id: str = Depends(require_profile_id),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
) -> list[ScheduledWorkoutResponse]:
    try:
        start_iso = _parse_date(start, "start") if start else None
        end_iso = _parse_date(end, "end") if end else None
        rows = supabase_db.list_scheduled_workouts(
            profile_id, start_date=start_iso, end_date=end_iso
        )
        return [ScheduledWorkoutResponse(**row) for row in rows]
    except HTTPException:
        raise
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to load scheduled workouts: {exc}"
        ) from exc


@router.post(
    "", response_model=ScheduledWorkoutResponse, status_code=status.HTTP_201_CREATED
)
def create_scheduled_workout(
    body: ScheduledWorkoutCreateRequest,
    profile_id: str = Depends(require_profile_id),
) -> ScheduledWorkoutResponse:
    try:
        scheduled_for = _parse_date(body.scheduled_for, "scheduled_for")
        row = supabase_db.create_scheduled_workout(
            profile_id,
            scheduled_for=scheduled_for,
            scheduled_time_minutes=body.scheduled_time_minutes,
            title=body.title,
            source_workout_id=body.source_workout_id,
            workout_id=body.workout_id,
            job_id=body.job_id,
            source_url=body.source_url,
            thumbnail_url=body.thumbnail_url,
            description=body.description,
            meta_left=body.meta_left,
            meta_right=body.meta_right,
            badge_label=body.badge_label,
            workout_plan=body.workout_plan,
        )
        return ScheduledWorkoutResponse(**row)
    except HTTPException:
        raise
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to schedule workout: {exc}"
        ) from exc


@router.patch("/{scheduled_workout_id}", response_model=ScheduledWorkoutResponse)
def update_scheduled_workout(
    scheduled_workout_id: str,
    body: ScheduledWorkoutUpdateRequest,
    profile_id: str = Depends(require_profile_id),
) -> ScheduledWorkoutResponse:
    # PATCH supports both scheduling changes (scheduled_for / status) and
    # user-driven inline content edits (title, description, workout_plan,
    # etc.). Only the fields present in the request body are patched.
    patch = body.model_dump(exclude_unset=True)
    if "scheduled_for" in patch and patch["scheduled_for"] is not None:
        patch["scheduled_for"] = _parse_date(patch["scheduled_for"], "scheduled_for")
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        row = supabase_db.update_scheduled_workout(
            scheduled_workout_id,
            user_id=profile_id,
            fields=patch,
        )
        return ScheduledWorkoutResponse(**row)
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to update scheduled workout: {exc}"
        ) from exc


@router.delete("/{scheduled_workout_id}", response_model=ScheduledWorkoutResponse)
def delete_scheduled_workout(
    scheduled_workout_id: str,
    profile_id: str = Depends(require_profile_id),
) -> ScheduledWorkoutResponse:
    try:
        row = supabase_db.delete_scheduled_workout(
            scheduled_workout_id, user_id=profile_id
        )
        return ScheduledWorkoutResponse(**row)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete scheduled workout: {exc}"
        ) from exc
