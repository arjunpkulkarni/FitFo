from fastapi import APIRouter, Depends, HTTPException, status

from app.routers.deps import require_profile_id
from app.schemas.workout_persistence import (
    SavedWorkoutResponse,
    SavedWorkoutUpdateRequest,
    SavedWorkoutUpsertRequest,
)
from app.services.fitfo_pro_access import profile_has_fitfo_pro_access
from app.services import supabase_db

router = APIRouter(prefix="/saved-workouts", tags=["saved-workouts"])


@router.get("", response_model=list[SavedWorkoutResponse])
def list_saved_workouts(profile_id: str = Depends(require_profile_id)) -> list[SavedWorkoutResponse]:
    try:
        # The signed-in profile id scopes every query so one user never sees another user's saved workouts.
        rows = supabase_db.list_saved_workouts(profile_id)
        return [SavedWorkoutResponse(**row) for row in rows]
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load saved workouts: {exc}") from exc


@router.post("", response_model=SavedWorkoutResponse, status_code=status.HTTP_201_CREATED)
def save_workout_for_later(
    body: SavedWorkoutUpsertRequest,
    profile_id: str = Depends(require_profile_id),
) -> SavedWorkoutResponse:
    try:
        profile = supabase_db.get_profile_by_id(profile_id)
        if profile is None:
            raise HTTPException(status_code=401, detail="Account not found.")
        is_imported = bool(body.source_url or body.job_id)
        is_existing_update = supabase_db.saved_import_exists_for_workout(
            profile_id,
            body.workout_id,
        )
        if (
            is_imported
            and not is_existing_update
            and not profile_has_fitfo_pro_access(profile)
            and supabase_db.count_imported_saved_workouts(profile_id) >= 3
        ):
            raise HTTPException(
                status_code=402,
                detail=(
                    "You've maxed out your imported workouts. Remove one from your "
                    "saved workouts, or upgrade to Pro for unlimited imports."
                ),
            )
        # Save-for-later records are written against the authenticated account and become the backend source of truth.
        row = supabase_db.create_or_update_saved_workout(
            profile_id,
            workout_id=body.workout_id,
            job_id=body.job_id,
            source_url=body.source_url,
            thumbnail_url=body.thumbnail_url,
            title=body.title,
            description=body.description,
            meta_left=body.meta_left,
            meta_right=body.meta_right,
            badge_label=body.badge_label,
            workout_plan=body.workout_plan,
        )
        return SavedWorkoutResponse(**row)
    except HTTPException:
        raise
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save workout: {exc}") from exc


@router.patch("/{saved_workout_id}", response_model=SavedWorkoutResponse)
def update_saved_workout(
    saved_workout_id: str,
    body: SavedWorkoutUpdateRequest,
    profile_id: str = Depends(require_profile_id),
) -> SavedWorkoutResponse:
    # Partial update for inline edits (title, description, plan, etc.).
    # Only fields the client explicitly sent are touched; everything else is
    # left as-is so a rename doesn't accidentally wipe out the workout plan.
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        row = supabase_db.update_saved_workout(
            saved_workout_id,
            user_id=profile_id,
            fields=patch,
        )
        return SavedWorkoutResponse(**row)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update saved workout: {exc}") from exc


@router.delete("/{saved_workout_id}", response_model=SavedWorkoutResponse)
def delete_saved_workout(
    saved_workout_id: str,
    profile_id: str = Depends(require_profile_id),
) -> SavedWorkoutResponse:
    try:
        row = supabase_db.delete_saved_workout(saved_workout_id, user_id=profile_id)
        return SavedWorkoutResponse(**row)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete saved workout: {exc}") from exc
