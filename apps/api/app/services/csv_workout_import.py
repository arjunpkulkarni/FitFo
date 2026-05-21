"""Parse exported workout CSVs (Hevy, Strong, generic) into Fitfo workout objects.

The parser groups rows into workouts using ``(title, start_time)``, then groups
sets within a workout by ``exercise_title``. Hevy-specific columns are detected
automatically; for other CSVs we fall back to a generic column alias map so
files exported from Strong (and similar trackers) also import without ceremony.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


class CsvImportError(ValueError):
    """Raised when the uploaded CSV cannot be turned into Fitfo workouts."""


@dataclass
class ParsedSet:
    set_index: Optional[int]
    set_type: Optional[str]
    weight_lbs: Optional[float]
    reps: Optional[int]
    distance_miles: Optional[float]
    duration_seconds: Optional[int]
    rpe: Optional[float]


@dataclass
class ParsedExercise:
    name: str
    notes: Optional[str]
    superset_id: Optional[str]
    sets: List[ParsedSet] = field(default_factory=list)


@dataclass
class ParsedWorkout:
    title: str
    start_time: Optional[str]
    end_time: Optional[str]
    description: Optional[str]
    exercises: List[ParsedExercise] = field(default_factory=list)


@dataclass
class ParsedCsvImport:
    source_app: str
    source_file_name: Optional[str]
    workouts: List[ParsedWorkout]

    @property
    def total_sets(self) -> int:
        return sum(len(exercise.sets) for workout in self.workouts for exercise in workout.exercises)


# Columns we recognize as canonical names. The aliases on the right are
# normalized (lower, non-alphanumerics stripped) before lookup so a header
# like "Set Order" matches "set_order".
_CANONICAL_ALIASES: Dict[str, List[str]] = {
    "title": ["title", "workoutname", "workout", "name", "session", "routine"],
    "start_time": ["starttime", "datestart", "date", "started", "datetime", "timestamp", "performedat"],
    "end_time": ["endtime", "dateend", "finished", "completedat"],
    "description": ["description", "notes", "workoutnotes", "comment"],
    "exercise_title": [
        "exercisetitle",
        "exercisename",
        "exercise",
        "lift",
        "movement",
    ],
    "superset_id": ["supersetid", "superset", "group"],
    "exercise_notes": ["exercisenotes", "setnotes", "notesperexercise"],
    "set_index": ["setindex", "setorder", "set", "setnumber", "setno"],
    "set_type": ["settype", "type"],
    "weight_lbs": ["weightlbs", "weight", "weightlb", "load", "kg", "weightkg"],
    "reps": ["reps", "repetitions"],
    "distance_miles": ["distancemiles", "distance", "distancemi", "distancekm"],
    "duration_seconds": [
        "durationseconds",
        "duration",
        "durationsec",
        "seconds",
        "time",
    ],
    "rpe": ["rpe"],
}

# Hevy-specific normalized headers we look for to fingerprint the export.
# Strong/generic CSVs use ``Weight``/``Reps``/``Set Order`` rather than the
# literal ``weight_lbs``/``set_index`` columns Hevy emits, so requiring two
# Hevy-unique tokens avoids misidentifying other trackers.
_HEVY_FINGERPRINT_HEADERS = {"weightlbs", "setindex", "exercisetitle"}


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.strip().lower())


def _detect_column_map(headers: Sequence[str]) -> Dict[str, str]:
    """Map canonical column → actual header text. Headers not present are omitted."""
    by_norm: Dict[str, str] = {}
    for header in headers:
        if header is None:
            continue
        norm = _normalize_header(str(header))
        if not norm or norm in by_norm:
            continue
        by_norm[norm] = header

    mapping: Dict[str, str] = {}
    for canonical, aliases in _CANONICAL_ALIASES.items():
        for alias in aliases:
            if alias in by_norm:
                mapping[canonical] = by_norm[alias]
                break
    return mapping


def _coerce_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_int(value: object) -> Optional[int]:
    text = _coerce_str(value)
    if text is None:
        return None
    cleaned = re.sub(r"[^0-9\-]", "", text)
    if not cleaned or cleaned == "-":
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def _coerce_float(value: object) -> Optional[float]:
    text = _coerce_str(value)
    if text is None:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", text)
    if not cleaned or cleaned in {"-", "."}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _convert_weight_to_lbs(value: object, header: str) -> Optional[float]:
    """Hevy stores ``weight_lbs`` already; Strong CSVs may store kg. Best-effort coercion."""
    text = _coerce_str(value)
    if text is None:
        return None
    is_kg = "kg" in header.lower() or "kg" in text.lower()
    number = _coerce_float(text)
    if number is None:
        return None
    if is_kg:
        return round(number * 2.2046226218, 2)
    return number


def _convert_distance_to_miles(value: object, header: str) -> Optional[float]:
    text = _coerce_str(value)
    if text is None:
        return None
    is_km = "km" in header.lower() or "km" in text.lower()
    number = _coerce_float(text)
    if number is None:
        return None
    if is_km:
        return round(number * 0.621371, 4)
    return number


def _is_hevy_layout(normalized_headers: set[str]) -> bool:
    return _HEVY_FINGERPRINT_HEADERS.issubset(normalized_headers)


def parse_workout_csv(
    text: str,
    *,
    source_file_name: Optional[str] = None,
) -> ParsedCsvImport:
    """Parse a CSV export into one or more workouts. Raises ``CsvImportError`` on invalid input."""
    cleaned = (text or "").lstrip("\ufeff").strip()
    if not cleaned:
        raise CsvImportError("CSV file is empty.")

    reader = csv.DictReader(io.StringIO(cleaned))
    headers = reader.fieldnames or []
    column_map = _detect_column_map(headers)
    normalized_headers = {
        _normalize_header(str(header)) for header in headers if header is not None
    }

    if "exercise_title" not in column_map:
        raise CsvImportError(
            "CSV is missing an exercise column. Expected something like 'exercise_title' or 'Exercise Name'."
        )
    if "title" not in column_map and "start_time" not in column_map:
        raise CsvImportError(
            "CSV is missing both workout title and date columns. At least one is required to group sets."
        )

    source_app = "hevy" if _is_hevy_layout(normalized_headers) else "generic_csv"

    workouts: List[ParsedWorkout] = []
    workouts_by_key: Dict[tuple, ParsedWorkout] = {}
    exercises_by_key: Dict[tuple, ParsedExercise] = {}

    weight_header = column_map.get("weight_lbs", "")
    distance_header = column_map.get("distance_miles", "")

    for row in reader:
        title = _coerce_str(row.get(column_map.get("title", ""))) if "title" in column_map else None
        start_time = (
            _coerce_str(row.get(column_map.get("start_time", "")))
            if "start_time" in column_map
            else None
        )
        end_time = (
            _coerce_str(row.get(column_map.get("end_time", "")))
            if "end_time" in column_map
            else None
        )
        description = (
            _coerce_str(row.get(column_map.get("description", "")))
            if "description" in column_map
            else None
        )
        exercise_name = _coerce_str(row.get(column_map["exercise_title"]))

        if not exercise_name:
            continue

        # Build the workout grouping key. Without title we group by date alone;
        # without date we group by title alone; if neither is set, we treat
        # the whole file as a single workout so users still get something useful.
        workout_key = (title or "Imported workout", start_time or "")

        workout = workouts_by_key.get(workout_key)
        if workout is None:
            workout = ParsedWorkout(
                title=title or "Imported workout",
                start_time=start_time,
                end_time=end_time,
                description=description,
            )
            workouts_by_key[workout_key] = workout
            workouts.append(workout)
        elif end_time and not workout.end_time:
            workout.end_time = end_time

        exercise_notes = (
            _coerce_str(row.get(column_map.get("exercise_notes", "")))
            if "exercise_notes" in column_map
            else None
        )
        superset_id = (
            _coerce_str(row.get(column_map.get("superset_id", "")))
            if "superset_id" in column_map
            else None
        )

        exercise_key = (workout_key, exercise_name.lower(), superset_id or "")
        exercise = exercises_by_key.get(exercise_key)
        if exercise is None:
            exercise = ParsedExercise(
                name=exercise_name,
                notes=exercise_notes,
                superset_id=superset_id,
            )
            exercises_by_key[exercise_key] = exercise
            workout.exercises.append(exercise)
        elif exercise_notes and not exercise.notes:
            exercise.notes = exercise_notes

        parsed_set = ParsedSet(
            set_index=_coerce_int(row.get(column_map.get("set_index", ""))),
            set_type=(
                _coerce_str(row.get(column_map.get("set_type", "")))
                if "set_type" in column_map
                else None
            ),
            weight_lbs=_convert_weight_to_lbs(
                row.get(column_map.get("weight_lbs", "")), weight_header
            )
            if "weight_lbs" in column_map
            else None,
            reps=_coerce_int(row.get(column_map.get("reps", ""))),
            distance_miles=_convert_distance_to_miles(
                row.get(column_map.get("distance_miles", "")), distance_header
            )
            if "distance_miles" in column_map
            else None,
            duration_seconds=_coerce_int(row.get(column_map.get("duration_seconds", ""))),
            rpe=_coerce_float(row.get(column_map.get("rpe", ""))),
        )
        exercise.sets.append(parsed_set)

    # Drop workouts that ended up with zero usable exercises (e.g. only blank
    # rows survived). After that, ensure we have at least one workout.
    workouts = [w for w in workouts if w.exercises]
    if not workouts:
        raise CsvImportError("No workouts found in CSV. Make sure rows include an exercise name.")

    return ParsedCsvImport(
        source_app=source_app,
        source_file_name=source_file_name,
        workouts=workouts,
    )


def parsed_workout_to_workout_plan(workout: ParsedWorkout) -> Dict[str, object]:
    """Convert a ``ParsedWorkout`` into the Fitfo ``workout_plan`` JSON shape."""
    exercises: List[Dict[str, object]] = []
    for exercise in workout.exercises:
        # Pick a representative "default" target for the saved workout view.
        primary_set = exercise.sets[0] if exercise.sets else None
        exercises.append(
            {
                "name": exercise.name,
                "sets": len(exercise.sets) or None,
                "reps": primary_set.reps if primary_set else None,
                "duration_sec": primary_set.duration_seconds if primary_set else None,
                "rest_sec": None,
                "notes": exercise.notes,
            }
        )

    notes_lines: List[str] = []
    if workout.description:
        notes_lines.append(workout.description)
    if workout.start_time:
        notes_lines.append(f"Original date: {workout.start_time}")
    if workout.end_time:
        notes_lines.append(f"Ended: {workout.end_time}")

    return {
        "title": workout.title,
        "workout_type": "strength",
        "equipment": [],
        "blocks": [
            {
                "name": None,
                "exercises": exercises,
            }
        ],
        "notes": "\n".join(notes_lines) or None,
    }


def summarize_workout(workout: ParsedWorkout) -> Dict[str, str]:
    """Pick short ``meta_left``/``meta_right`` strings for saved-workout cards."""
    total_sets = sum(len(exercise.sets) for exercise in workout.exercises)
    exercise_count = len(workout.exercises)
    meta_left = (
        f"{exercise_count} exercise" if exercise_count == 1 else f"{exercise_count} exercises"
    )
    meta_right = f"{total_sets} set" if total_sets == 1 else f"{total_sets} sets"
    return {"meta_left": meta_left, "meta_right": meta_right}
