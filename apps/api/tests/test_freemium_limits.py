import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException

from app.routers import scheduled_workouts
from app.schemas.scheduled_workouts import ScheduledWorkoutCreateRequest
from app.services import fitfo_pro_access


def _scheduled_request(**overrides):
    payload = {
        "scheduled_for": "2026-06-01",
        "title": "Imported Push",
    }
    payload.update(overrides)
    return ScheduledWorkoutCreateRequest(**payload)


class FreemiumScheduleLimitTests(unittest.TestCase):
    def test_current_week_sunday_returns_upcoming_sunday(self) -> None:
        self.assertEqual(
            scheduled_workouts._current_week_sunday(date(2026, 5, 27)),
            date(2026, 5, 31),
        )

    @patch("app.routers.scheduled_workouts.profile_has_fitfo_pro_access", return_value=False)
    @patch("app.routers.scheduled_workouts.supabase_db.get_profile_by_id", return_value={"id": "user-1"})
    def test_free_schedule_rejects_dates_after_current_week(
        self,
        _get_profile,
        _has_pro,
    ) -> None:
        with patch(
            "app.routers.scheduled_workouts._current_week_sunday",
            return_value=date(2026, 5, 31),
        ):
            with self.assertRaises(HTTPException) as raised:
                scheduled_workouts._enforce_free_schedule_window("user-1", "2026-06-01")

        self.assertEqual(raised.exception.status_code, 402)
        self.assertIn("within this week", str(raised.exception.detail))

    @patch("app.routers.scheduled_workouts.profile_has_fitfo_pro_access", return_value=True)
    @patch("app.routers.scheduled_workouts.supabase_db.get_profile_by_id", return_value={"id": "user-1"})
    def test_pro_schedule_skips_current_week_limit(self, _get_profile, _has_pro) -> None:
        with patch(
            "app.routers.scheduled_workouts._current_week_sunday",
            return_value=date(2026, 5, 31),
        ):
            scheduled_workouts._enforce_free_schedule_window("user-1", "2026-06-01")

    @patch("app.routers.scheduled_workouts.supabase_db.count_imported_saved_workouts", return_value=3)
    @patch("app.routers.scheduled_workouts.profile_has_fitfo_pro_access", return_value=False)
    @patch("app.routers.scheduled_workouts.supabase_db.get_profile_by_id", return_value={"id": "user-1"})
    def test_free_import_cap_blocks_scheduled_import(
        self,
        _get_profile,
        _has_pro,
        _count_imports,
    ) -> None:
        with self.assertRaises(HTTPException) as raised:
            scheduled_workouts._enforce_free_import_cap(
                "user-1",
                _scheduled_request(job_id="job-1"),
            )

        self.assertEqual(raised.exception.status_code, 402)
        self.assertIn("maxed out", str(raised.exception.detail))

    @patch("app.routers.scheduled_workouts.supabase_db.count_imported_saved_workouts")
    @patch("app.routers.scheduled_workouts.profile_has_fitfo_pro_access", return_value=False)
    @patch("app.routers.scheduled_workouts.supabase_db.get_profile_by_id")
    def test_manual_schedule_does_not_check_import_cap(
        self,
        get_profile,
        _has_pro,
        count_imports,
    ) -> None:
        scheduled_workouts._enforce_free_import_cap("user-1", _scheduled_request())

        get_profile.assert_not_called()
        count_imports.assert_not_called()


class FitfoProAccessTests(unittest.TestCase):
    @patch("app.services.fitfo_pro_access.subscription_state.user_has_active_pro", return_value=True)
    def test_subscription_state_grants_pro_access(self, user_has_active_pro) -> None:
        self.assertTrue(fitfo_pro_access.profile_has_fitfo_pro_access({"id": "user-1"}))
        user_has_active_pro.assert_called_once_with("user-1")

    @patch(
        "app.services.fitfo_pro_access.subscription_state.user_has_active_pro",
        side_effect=RuntimeError("db unavailable"),
    )
    def test_subscription_state_failure_falls_back_to_free(self, _user_has_active_pro) -> None:
        self.assertFalse(fitfo_pro_access.profile_has_fitfo_pro_access({"id": "user-1"}))


if __name__ == "__main__":
    unittest.main()
