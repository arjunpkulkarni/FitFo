"""Tests for the CSV workout import parser (Hevy + generic schemas) and HTTP endpoint."""

import io
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.routers.deps import require_profile_id
from app.services import supabase_db
from app.services.csv_workout_import import (
    CsvImportError,
    parse_workout_csv,
)


HEVY_SAMPLE = (
    '"title","start_time","end_time","description","exercise_title","superset_id",'
    '"exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles",'
    '"duration_seconds","rpe"\n'
    '"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:30","Strong session","Bench Press",'
    ',"Felt heavy",0,"warmup",95,5,,0,7\n'
    '"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:30","Strong session","Bench Press",'
    ',"Felt heavy",1,"normal",135,10,,0,8\n'
    '"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:30","Strong session",'
    '"Overhead Press",,,0,"normal",75,8,,0,8\n'
    '"Leg Day","30 Mar 2025, 09:00","30 Mar 2025, 10:05","","Squat",,,0,"normal",225,5,,0,9\n'
)


STRONG_SAMPLE = (
    "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes\n"
    "2025-03-28 17:29:00,Push Day,Bench Press,1,135 lbs,10,,0,Felt strong\n"
    "2025-03-28 17:29:00,Push Day,Bench Press,2,135,8,,0,\n"
    "2025-03-28 17:29:00,Push Day,Overhead Press,1,75 lbs,10,,0,\n"
)


class CsvWorkoutImportTests(unittest.TestCase):
    def test_hevy_csv_detects_source_app(self) -> None:
        result = parse_workout_csv(HEVY_SAMPLE, source_file_name="hevy.csv")
        self.assertEqual(result.source_app, "hevy")

    def test_hevy_csv_groups_rows_into_workouts_and_exercises(self) -> None:
        result = parse_workout_csv(HEVY_SAMPLE, source_file_name="hevy.csv")
        self.assertEqual(len(result.workouts), 2)
        push_day = result.workouts[0]
        self.assertEqual(push_day.title, "Push Day")
        self.assertEqual(push_day.start_time, "28 Mar 2025, 17:29")
        self.assertEqual(push_day.end_time, "28 Mar 2025, 18:30")
        self.assertEqual(len(push_day.exercises), 2)
        bench = push_day.exercises[0]
        self.assertEqual(bench.name, "Bench Press")
        self.assertEqual(bench.notes, "Felt heavy")
        self.assertEqual(len(bench.sets), 2)
        self.assertEqual(bench.sets[0].weight_lbs, 95)
        self.assertEqual(bench.sets[0].reps, 5)
        self.assertEqual(bench.sets[0].set_type, "warmup")
        self.assertEqual(bench.sets[1].weight_lbs, 135)
        self.assertEqual(bench.sets[1].reps, 10)
        self.assertEqual(bench.sets[1].rpe, 8)
        self.assertEqual(result.total_sets, 4)

    def test_strong_csv_parses_as_generic(self) -> None:
        result = parse_workout_csv(STRONG_SAMPLE, source_file_name="strong.csv")
        self.assertIn(result.source_app, {"generic_csv", "strong"})
        self.assertEqual(len(result.workouts), 1)
        workout = result.workouts[0]
        self.assertEqual(workout.title, "Push Day")
        self.assertEqual(len(workout.exercises), 2)
        bench = workout.exercises[0]
        self.assertEqual(bench.name, "Bench Press")
        self.assertEqual(len(bench.sets), 2)
        self.assertEqual(bench.sets[0].weight_lbs, 135)
        self.assertEqual(bench.sets[0].reps, 10)

    def test_empty_csv_raises(self) -> None:
        with self.assertRaises(CsvImportError):
            parse_workout_csv("", source_file_name="empty.csv")

    def test_header_only_csv_raises(self) -> None:
        with self.assertRaises(CsvImportError):
            parse_workout_csv(
                "title,start_time,exercise_title,set_index,weight_lbs,reps\n",
                source_file_name="headers.csv",
            )

    def test_missing_exercise_columns_raises(self) -> None:
        with self.assertRaises(CsvImportError):
            parse_workout_csv(
                "title,start_time\nPush Day,2025-03-28 17:29\n",
                source_file_name="no_exercises.csv",
            )

    def test_rows_without_exercise_name_are_skipped(self) -> None:
        csv = (
            "title,start_time,exercise_title,set_index,weight_lbs,reps\n"
            "Push Day,2025-03-28 17:29,,0,135,10\n"
            "Push Day,2025-03-28 17:29,Bench Press,1,135,10\n"
        )
        result = parse_workout_csv(csv, source_file_name="ok.csv")
        self.assertEqual(len(result.workouts), 1)
        self.assertEqual(len(result.workouts[0].exercises), 1)
        self.assertEqual(result.workouts[0].exercises[0].name, "Bench Press")

    def test_workout_without_any_valid_row_raises(self) -> None:
        csv = (
            "title,start_time,exercise_title,set_index,weight_lbs,reps\n"
            "Push Day,,,,,,\n"
        )
        with self.assertRaises(CsvImportError):
            parse_workout_csv(csv, source_file_name="empty_rows.csv")


class CsvImportEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[require_profile_id] = lambda: "user-123"
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(require_profile_id, None)

    def _fake_saved_row(self, **payload):
        return {
            "id": "saved-1",
            "user_id": "user-123",
            "workout_id": None,
            "job_id": None,
            "source_url": None,
            "thumbnail_url": None,
            "title": payload.get("title", "Imported"),
            "description": payload.get("description"),
            "meta_left": payload.get("meta_left"),
            "meta_right": payload.get("meta_right"),
            "badge_label": payload.get("badge_label"),
            "workout_plan": payload.get("workout_plan"),
            "saved_at": "2025-03-28T17:29:00Z",
            "created_at": "2025-03-28T17:29:00Z",
            "updated_at": "2025-03-28T17:29:00Z",
        }

    def test_endpoint_rejects_non_csv_extension(self) -> None:
        response = self.client.post(
            "/imports/workouts/csv",
            files={"file": ("workouts.txt", b"col1,col2\n1,2\n", "text/plain")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("csv", response.json()["detail"].lower())

    def test_endpoint_rejects_empty_file(self) -> None:
        response = self.client.post(
            "/imports/workouts/csv",
            files={"file": ("workouts.csv", b"", "text/csv")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("empty", response.json()["detail"].lower())

    def test_endpoint_persists_hevy_workouts(self) -> None:
        with patch.object(
            supabase_db,
            "create_or_update_saved_workout",
            side_effect=lambda *a, **kw: self._fake_saved_row(**kw),
        ) as mock_save:
            response = self.client.post(
                "/imports/workouts/csv",
                files={"file": ("hevy.csv", HEVY_SAMPLE.encode("utf-8"), "text/csv")},
            )
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["source_app"], "hevy")
        self.assertEqual(body["imported_workouts_count"], 2)
        self.assertEqual(body["imported_sets_count"], 4)
        self.assertEqual(len(body["workouts"]), 2)
        self.assertEqual(mock_save.call_count, 2)

    def test_endpoint_returns_400_on_unparseable_csv(self) -> None:
        bad = b"unrelated,header\n1,2\n"
        response = self.client.post(
            "/imports/workouts/csv",
            files={"file": ("nope.csv", bad, "text/csv")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("exercise", response.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
