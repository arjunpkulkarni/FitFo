"""Response shapes for CSV workout imports."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.schemas.workout_persistence import SavedWorkoutResponse


class CsvImportedSet(BaseModel):
    set_index: Optional[int] = None
    set_type: Optional[str] = None
    weight_lbs: Optional[float] = None
    reps: Optional[int] = None
    distance_miles: Optional[float] = None
    duration_seconds: Optional[int] = None
    rpe: Optional[float] = None


class CsvImportedExercise(BaseModel):
    name: str
    notes: Optional[str] = None
    superset_id: Optional[str] = None
    sets: List[CsvImportedSet] = []


class CsvImportedWorkout(BaseModel):
    title: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    description: Optional[str] = None
    exercises: List[CsvImportedExercise] = []
    workout_plan: Dict[str, Any]
    saved_workout: SavedWorkoutResponse


class CsvImportResponse(BaseModel):
    success: bool = True
    source_app: str
    source_file_name: Optional[str] = None
    imported_workouts_count: int
    imported_sets_count: int
    workouts: List[CsvImportedWorkout] = []
