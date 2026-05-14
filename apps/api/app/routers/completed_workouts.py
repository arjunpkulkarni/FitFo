from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.routers.deps import require_profile_id
from app.schemas.workout_persistence import (
    CompletedWorkoutCreateRequest,
    CompletedWorkoutResponse,
)
from app.services import supabase_db

router = APIRouter(prefix="/completed-workouts", tags=["completed-workouts"])


@router.get("", response_model=list[CompletedWorkoutResponse])
def list_completed_workouts(
    profile_id: str = Depends(require_profile_id),
) -> list[CompletedWorkoutResponse]:
    try:
        # Workout history queries are always filtered to the authenticated account.
        rows = supabase_db.list_completed_workouts(profile_id)
        return [CompletedWorkoutResponse(**row) for row in rows]
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load workout history: {exc}") from exc


@router.get("/{completed_workout_id}", response_model=CompletedWorkoutResponse)
def get_completed_workout(
    completed_workout_id: str,
    profile_id: str = Depends(require_profile_id),
) -> CompletedWorkoutResponse:
    try:
        row = supabase_db.get_completed_workout(completed_workout_id, user_id=profile_id)
        return CompletedWorkoutResponse(**row)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load workout summary: {exc}") from exc


@router.post("", response_model=CompletedWorkoutResponse, status_code=status.HTTP_201_CREATED)
def create_completed_workout(
    body: CompletedWorkoutCreateRequest,
    profile_id: str = Depends(require_profile_id),
) -> CompletedWorkoutResponse:
    try:
        # Persist the finished workout to the current user so summaries survive logout/login and device changes.
        row = supabase_db.create_completed_workout(
            profile_id,
            workout_id=body.workout_id,
            job_id=body.job_id,
            source_url=body.source_url,
            title=body.title,
            description=body.description,
            summary=body.summary,
            exercises=body.exercises,
            workout_plan=body.workout_plan,
            notes=body.notes,
            calories=body.calories,
            difficulty=body.difficulty,
            tags=body.tags,
            average_rest_seconds=body.average_rest_seconds,
            started_at=body.started_at,
            completed_at=body.completed_at,
        )
        return CompletedWorkoutResponse(**row)
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save completed workout: {exc}") from exc


@router.delete("/{completed_workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_completed_workout(
    completed_workout_id: str,
    profile_id: str = Depends(require_profile_id),
) -> Response:
    """Remove one completed-session row (profile-scoped). Lift set logs CASCADE."""
    try:
        supabase_db.delete_completed_workout(completed_workout_id, user_id=profile_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete workout: {exc}",
        ) from exc
