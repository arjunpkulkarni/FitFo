"""HTTP endpoint that accepts a workout-tracker CSV export and persists it.

The user uploads a single CSV via multipart/form-data; we parse it with
``csv_workout_import``, then write each workout to ``saved_workouts`` so it
shows up on the Saved Workouts list. We deliberately reuse the existing
saved-workout schema instead of introducing a parallel storage path.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.routers.deps import require_profile_id
from app.schemas.csv_imports import (
    CsvImportResponse,
    CsvImportedExercise,
    CsvImportedSet,
    CsvImportedWorkout,
)
from app.schemas.workout_persistence import SavedWorkoutResponse
from app.services import supabase_db
from app.services.csv_workout_import import (
    CsvImportError,
    ParsedExercise,
    ParsedSet,
    ParsedWorkout,
    parse_workout_csv,
    parsed_workout_to_workout_plan,
    summarize_workout,
)

router = APIRouter(prefix="/imports", tags=["imports"])


MAX_CSV_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB; Hevy/Strong exports are well under this


_SOURCE_APP_LABELS = {
    "hevy": "Imported from Hevy",
    "strong": "Imported from Strong",
    "generic_csv": "Imported from CSV",
}


def _badge_for_source(source_app: str) -> str:
    return "Imported"


def _description_for_source(source_app: str, file_name: str | None) -> str:
    label = _SOURCE_APP_LABELS.get(source_app, "Imported from CSV")
    return f"{label} • {file_name}" if file_name else label


def _set_to_schema(parsed: ParsedSet) -> CsvImportedSet:
    return CsvImportedSet(
        set_index=parsed.set_index,
        set_type=parsed.set_type,
        weight_lbs=parsed.weight_lbs,
        reps=parsed.reps,
        distance_miles=parsed.distance_miles,
        duration_seconds=parsed.duration_seconds,
        rpe=parsed.rpe,
    )


def _exercise_to_schema(parsed: ParsedExercise) -> CsvImportedExercise:
    return CsvImportedExercise(
        name=parsed.name,
        notes=parsed.notes,
        superset_id=parsed.superset_id,
        sets=[_set_to_schema(s) for s in parsed.sets],
    )


def _validate_upload(file: UploadFile) -> None:
    name = (file.filename or "").strip()
    if not name.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are supported.",
        )

    content_type = (file.content_type or "").lower()
    # iOS sometimes sends ``application/octet-stream`` for files picked from
    # Apple Files; only block on obvious mismatches.
    if content_type and content_type not in {
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "text/plain",
        "application/octet-stream",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type for CSV upload: {content_type}.",
        )


def _decode_csv_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Could not decode CSV file. Save it as UTF-8 and try again.",
    )


@router.post(
    "/workouts/csv",
    response_model=CsvImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_workouts_from_csv(
    file: UploadFile = File(...),
    profile_id: str = Depends(require_profile_id),
) -> CsvImportResponse:
    _validate_upload(file)

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty.",
        )
    if len(raw) > MAX_CSV_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is too large (limit 2 MB).",
        )

    text = _decode_csv_bytes(raw)
    source_file_name = (file.filename or "").strip() or None

    try:
        parsed = parse_workout_csv(text, source_file_name=source_file_name)
    except CsvImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    imported: List[CsvImportedWorkout] = []
    try:
        for workout in parsed.workouts:
            workout_plan = parsed_workout_to_workout_plan(workout)
            meta = summarize_workout(workout)
            saved_row = supabase_db.create_or_update_saved_workout(
                profile_id,
                title=workout.title,
                description=_description_for_source(parsed.source_app, source_file_name),
                meta_left=meta["meta_left"],
                meta_right=meta["meta_right"],
                badge_label=_badge_for_source(parsed.source_app),
                workout_plan=workout_plan,
                source_url=None,
                thumbnail_url=None,
            )
            imported.append(
                CsvImportedWorkout(
                    title=workout.title,
                    start_time=workout.start_time,
                    end_time=workout.end_time,
                    description=workout.description,
                    exercises=[_exercise_to_schema(e) for e in workout.exercises],
                    workout_plan=workout_plan,
                    saved_workout=SavedWorkoutResponse(**saved_row),
                )
            )
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to persist imported workouts: {exc}",
        ) from exc

    return CsvImportResponse(
        success=True,
        source_app=parsed.source_app,
        source_file_name=source_file_name,
        imported_workouts_count=len(imported),
        imported_sets_count=sum(
            len(exercise.sets)
            for workout in parsed.workouts
            for exercise in workout.exercises
        ),
        workouts=imported,
    )
