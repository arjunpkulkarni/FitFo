"""Tests for the trial notification scheduler's copy + send loop.

The scheduler is wired up against patched DB / Expo helpers so we can verify
both the dynamic copy and the idempotency contract without a live backend.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch

from app.services import expo_push, notification_scheduler


def _trial_row(
    *,
    user_id: str = "user-1",
    state_id: str = "row-1",
    end_offset_hours: float = 48.0,
    price_micros: Optional[int] = 39_990_000,
    currency: Optional[str] = "USD",
    trial_start_offset_hours: float = -120.0,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "id": state_id,
        "user_id": user_id,
        "trial_start_at": (now + timedelta(hours=trial_start_offset_hours)).isoformat(),
        "trial_end_at": (now + timedelta(hours=end_offset_hours)).isoformat(),
        "next_charge_amount_micros": price_micros,
        "next_charge_currency": currency,
    }


class _Recorder:
    """Captures calls into the patched helpers so we can assert on them."""

    def __init__(self) -> None:
        self.tokens_by_user: Dict[str, List[str]] = {}
        self.has_log: Dict[Tuple[str, str, Optional[str]], bool] = {}
        self.log_inserts: List[Dict[str, Any]] = []
        self.push_sends: List[Dict[str, Any]] = []

    def list_tokens(self, user_id: str) -> List[str]:
        return list(self.tokens_by_user.get(user_id, []))

    def has_log_fn(self, *, user_id: str, kind: str, subscription_state_id: Optional[str]) -> bool:
        return self.has_log.get((user_id, kind, subscription_state_id), False)

    def insert_log_fn(
        self,
        *,
        user_id: str,
        kind: str,
        subscription_state_id: Optional[str],
        sent_payload: Any,
        expo_response: Any,
    ) -> Dict[str, Any]:
        entry = {
            "user_id": user_id,
            "kind": kind,
            "subscription_state_id": subscription_state_id,
            "sent_payload": dict(sent_payload),
            "expo_response": expo_response,
        }
        self.log_inserts.append(entry)
        # Subsequent has_log lookups should now return True (idempotency).
        self.has_log[(user_id, kind, subscription_state_id)] = True
        return entry

    def send_push_fn(
        self,
        *,
        expo_push_tokens: List[str],
        title: str,
        body: str,
        data: Any = None,
        log_label: str = "push",
    ) -> Dict[str, Any]:
        self.push_sends.append(
            {
                "tokens": list(expo_push_tokens),
                "title": title,
                "body": body,
                "data": dict(data or {}),
                "label": log_label,
            }
        )
        return {"data": [{"status": "ok"}]}


class TrialPreChargeReminderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.recorder = _Recorder()
        self._patches = [
            patch.object(
                notification_scheduler.subscription_state,
                "has_notification_log",
                self.recorder.has_log_fn,
            ),
            patch.object(
                notification_scheduler.subscription_state,
                "insert_notification_log",
                self.recorder.insert_log_fn,
            ),
            patch.object(
                notification_scheduler,
                "list_expo_push_tokens_for_user",
                self.recorder.list_tokens,
            ),
            patch.object(
                notification_scheduler.expo_push,
                "send_push",
                self.recorder.send_push_fn,
            ),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self) -> None:
        for p in self._patches:
            p.stop()

    def test_pre_charge_renders_dynamic_price_and_deep_link(self) -> None:
        self.recorder.tokens_by_user["user-1"] = ["ExponentPushToken[abc]"]
        with patch.object(
            notification_scheduler.subscription_state,
            "list_trials_in_pre_charge_window",
            return_value=[_trial_row()],
        ), patch.object(
            notification_scheduler.user_activity,
            "count_saved_workouts_since",
            return_value=8,
        ), patch.object(
            notification_scheduler.user_activity,
            "count_completed_workouts_since",
            return_value=12,
        ):
            sent = notification_scheduler.fire_trial_pre_charge_reminders()

        self.assertEqual(sent, 1)
        self.assertEqual(len(self.recorder.push_sends), 1)
        msg = self.recorder.push_sends[0]
        self.assertIn("$39.99", msg["body"])
        # Personalized stats line included when both > 0.
        self.assertIn("8 workouts imported", msg["body"])
        self.assertIn("12 sessions logged", msg["body"])
        self.assertEqual(
            msg["data"]["deepLink"], notification_scheduler.DEEP_LINK_MANAGE_SUBSCRIPTION
        )
        self.assertEqual(msg["data"]["kind"], expo_push.TRIAL_PRE_CHARGE_KIND)

        # Idempotency: second tick must not re-send.
        with patch.object(
            notification_scheduler.subscription_state,
            "list_trials_in_pre_charge_window",
            return_value=[_trial_row()],
        ):
            sent_again = notification_scheduler.fire_trial_pre_charge_reminders()
        self.assertEqual(sent_again, 0)

    def test_pre_charge_omits_personalized_line_when_zero(self) -> None:
        self.recorder.tokens_by_user["user-1"] = ["ExponentPushToken[abc]"]
        with patch.object(
            notification_scheduler.subscription_state,
            "list_trials_in_pre_charge_window",
            return_value=[_trial_row()],
        ), patch.object(
            notification_scheduler.user_activity,
            "count_saved_workouts_since",
            return_value=0,
        ), patch.object(
            notification_scheduler.user_activity,
            "count_completed_workouts_since",
            return_value=0,
        ):
            notification_scheduler.fire_trial_pre_charge_reminders()

        body = self.recorder.push_sends[0]["body"]
        self.assertIn("$39.99", body)
        self.assertNotIn("So far", body)

    def test_pre_charge_skips_user_with_no_tokens_but_still_logs(self) -> None:
        # Empty token list — we still write a "skipped" log row so we don't
        # re-evaluate this trial every 15 minutes for the rest of the window.
        with patch.object(
            notification_scheduler.subscription_state,
            "list_trials_in_pre_charge_window",
            return_value=[_trial_row()],
        ):
            sent = notification_scheduler.fire_trial_pre_charge_reminders()

        self.assertEqual(sent, 0)
        self.assertEqual(len(self.recorder.push_sends), 0)
        self.assertEqual(len(self.recorder.log_inserts), 1)
        self.assertEqual(self.recorder.log_inserts[0]["sent_payload"]["skipped"], "no_push_tokens")


class TrialConvertedConfirmationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.recorder = _Recorder()
        self._patches = [
            patch.object(
                notification_scheduler.subscription_state,
                "has_notification_log",
                self.recorder.has_log_fn,
            ),
            patch.object(
                notification_scheduler.subscription_state,
                "insert_notification_log",
                self.recorder.insert_log_fn,
            ),
            patch.object(
                notification_scheduler,
                "list_expo_push_tokens_for_user",
                self.recorder.list_tokens,
            ),
            patch.object(
                notification_scheduler.expo_push,
                "send_push",
                self.recorder.send_push_fn,
            ),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self) -> None:
        for p in self._patches:
            p.stop()

    def test_converted_sends_welcome_copy_once(self) -> None:
        self.recorder.tokens_by_user["user-1"] = ["ExponentPushToken[abc]"]
        with patch.object(
            notification_scheduler.subscription_state,
            "list_just_converted_trials",
            return_value=[_trial_row()],
        ):
            sent = notification_scheduler.fire_trial_converted_confirmations()
            sent_again = notification_scheduler.fire_trial_converted_confirmations()

        self.assertEqual(sent, 1)
        self.assertEqual(sent_again, 0)
        msg = self.recorder.push_sends[0]
        self.assertEqual(msg["title"], "You're in.")
        self.assertEqual(msg["body"], "Welcome to Fitfo Premium.")


if __name__ == "__main__":
    unittest.main()
