"""Tests for the RevenueCat webhook → subscription_state translator.

The translator depends on Supabase (for profile lookup + state upsert) and on
the subscription_state DB helpers. Both are patched here so the tests stay
unit-level and don't need a live database.
"""

from __future__ import annotations

import unittest
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch

from app.services import revenuecat_webhook, subscription_state


def _event(event_type: str, **overrides: Any) -> Dict[str, Any]:
    """Build a RevenueCat-shaped event payload (the inner ``event`` object)."""
    base: Dict[str, Any] = {
        "type": event_type,
        "id": "evt-1",
        "event_timestamp_ms": 1_700_000_000_000,
        "app_user_id": "user-uuid",
        "original_app_user_id": "original-tx-1",
        "product_id": "fitfo_premium_annual",
        "entitlement_ids": ["pro"],
        "purchased_at_ms": 1_700_000_000_000,
        "expiration_at_ms": 1_700_000_000_000 + 7 * 24 * 60 * 60 * 1000,
        "period_type": "TRIAL",
        "is_family_share": False,
        "price": 39.99,
        "price_in_purchased_currency": 39.99,
        "currency": "USD",
        "store": "APP_STORE",
    }
    base.update(overrides)
    return base


class _FakeStateStore:
    """Stand-in for subscription_state DB helpers, capturing all calls."""

    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []
        self.upsert_calls: List[Tuple[str, Optional[str], Dict[str, Any]]] = []

    def get_subscription_by_original_app_user_id(
        self, user_id: str, original_app_user_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        for row in self.rows:
            if (
                row["user_id"] == user_id
                and row.get("original_app_user_id") == original_app_user_id
            ):
                return row
        return None

    def upsert_subscription_state(
        self,
        user_id: str,
        *,
        original_app_user_id: Optional[str],
        fields: Dict[str, Any],
    ) -> Dict[str, Any]:
        self.upsert_calls.append((user_id, original_app_user_id, dict(fields)))
        existing = self.get_subscription_by_original_app_user_id(
            user_id, original_app_user_id
        )
        if existing:
            existing.update(fields)
            return existing
        row = {
            "id": f"row-{len(self.rows) + 1}",
            "user_id": user_id,
            "original_app_user_id": original_app_user_id,
            **fields,
        }
        self.rows.append(row)
        return row


class RevenueCatWebhookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = _FakeStateStore()
        # Patch the module-level functions the webhook calls.
        self._patches = [
            patch.object(
                revenuecat_webhook.subscription_state,
                "get_subscription_by_original_app_user_id",
                self.store.get_subscription_by_original_app_user_id,
            ),
            patch.object(
                revenuecat_webhook.subscription_state,
                "upsert_subscription_state",
                self.store.upsert_subscription_state,
            ),
            patch.object(
                revenuecat_webhook,
                "_resolve_user_id",
                lambda _aid: "user-uuid",
            ),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self) -> None:
        for p in self._patches:
            p.stop()

    # --- Validation -----------------------------------------------------

    def test_rejects_missing_event_type(self) -> None:
        with self.assertRaises(revenuecat_webhook.WebhookValidationError):
            revenuecat_webhook.handle_event({"app_user_id": "x"})

    def test_rejects_missing_app_user_id(self) -> None:
        with self.assertRaises(revenuecat_webhook.WebhookValidationError):
            revenuecat_webhook.handle_event({"type": "RENEWAL"})

    # --- Initial trial purchase ----------------------------------------

    def test_initial_purchase_with_trial_creates_trialing_row(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        self.assertEqual(len(self.store.rows), 1)
        row = self.store.rows[0]
        self.assertEqual(row["status"], subscription_state.STATUS_TRIALING)
        self.assertEqual(row["period_type"], subscription_state.PERIOD_TRIAL)
        self.assertIsNotNone(row["trial_start_at"])
        self.assertIsNotNone(row["trial_end_at"])
        self.assertEqual(row["entitlement_id"], "pro")
        self.assertEqual(row["next_charge_currency"], "USD")
        self.assertEqual(
            row["next_charge_amount_micros"], 39_990_000
        )

    def test_initial_purchase_without_trial_is_active(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE", period_type="NORMAL"))
        row = self.store.rows[0]
        self.assertEqual(row["status"], subscription_state.STATUS_ACTIVE)
        self.assertEqual(row["period_type"], subscription_state.PERIOD_NORMAL)

    # --- Renewal flips trial → normal (drives conversion push) ----------

    def test_renewal_after_trial_flips_to_normal(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        revenuecat_webhook.handle_event(
            _event("RENEWAL", id="evt-2", period_type="NORMAL")
        )
        row = self.store.rows[0]
        self.assertEqual(row["status"], subscription_state.STATUS_ACTIVE)
        self.assertEqual(row["period_type"], subscription_state.PERIOD_NORMAL)

    # --- Cancellation suppresses pre-charge reminder --------------------

    def test_cancellation_marks_cancelled_and_records_reason(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        revenuecat_webhook.handle_event(
            _event("CANCELLATION", id="evt-2", cancel_reason="UNSUBSCRIBE")
        )
        row = self.store.rows[0]
        self.assertEqual(row["status"], subscription_state.STATUS_CANCELLED)
        self.assertEqual(row["cancel_reason"], "UNSUBSCRIBE")
        self.assertIsNotNone(row["cancelled_at"])

    # --- Plan switch updates the price -----------------------------------

    def test_product_change_updates_product_and_price(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        revenuecat_webhook.handle_event(
            _event(
                "PRODUCT_CHANGE",
                id="evt-2",
                product_id="fitfo_premium_monthly",
                price=6.99,
                price_in_purchased_currency=6.99,
                # period_type unchanged — still in trial
                period_type="TRIAL",
            )
        )
        row = self.store.rows[0]
        self.assertEqual(row["product_id"], "fitfo_premium_monthly")
        self.assertEqual(row["next_charge_amount_micros"], 6_990_000)
        # Status remains trialing during a mid-trial plan switch.
        self.assertEqual(row["status"], subscription_state.STATUS_TRIALING)

    # --- Idempotency ----------------------------------------------------

    def test_duplicate_event_is_skipped(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        # Same id — should be dropped without a second upsert.
        result = revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE"))
        self.assertIsNone(result)
        self.assertEqual(len(self.store.upsert_calls), 1)

    # --- Family sharing flag preserved ----------------------------------

    def test_family_share_flag_persisted(self) -> None:
        revenuecat_webhook.handle_event(_event("INITIAL_PURCHASE", is_family_share=True))
        row = self.store.rows[0]
        self.assertTrue(row["is_family_share"])

    # --- Unknown event types are ignored, not errored -------------------

    def test_unknown_event_type_is_ignored(self) -> None:
        result = revenuecat_webhook.handle_event(_event("REFUND"))
        self.assertIsNone(result)
        self.assertEqual(len(self.store.upsert_calls), 0)


if __name__ == "__main__":
    unittest.main()
