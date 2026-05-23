"""Tests for the RevenueCat → Supabase user mapping service.

Covers:
  - ms_to_iso helper conversions (incl. malformed values)
  - upsert_user_mapping shape
  - handle_event applies the right fields per supported event type
  - handle_event tolerates missing / malformed payloads without raising
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch

from app.services import revenuecat_users


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------


class _FakeQuery:
    """Captures the chained calls supabase-py users make on a table.

    Mirrors just enough of the real client surface (``select``, ``upsert``,
    ``update``, ``eq``, ``limit``, ``execute``) to let the service under
    test believe it is talking to a Postgres-backed table.
    """

    def __init__(self, store: "_FakeSupabase", table: str) -> None:
        self._store = store
        self._table = table
        self._mode: Optional[str] = None
        self._payload: Any = None
        self._filters: List[Tuple[str, Any]] = []

    def select(self, _cols: str = "*") -> "_FakeQuery":
        self._mode = "select"
        return self

    def upsert(self, payload: Dict[str, Any], on_conflict: str = "") -> "_FakeQuery":
        self._mode = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def update(self, payload: Dict[str, Any]) -> "_FakeQuery":
        self._mode = "update"
        self._payload = payload
        return self

    def eq(self, column: str, value: Any) -> "_FakeQuery":
        self._filters.append((column, value))
        return self

    def limit(self, _n: int) -> "_FakeQuery":
        return self

    def execute(self) -> Any:
        if self._mode == "upsert":
            return self._do_upsert()
        if self._mode == "update":
            return self._do_update()
        if self._mode == "select":
            return self._do_select()
        raise RuntimeError(f"Unsupported fake query mode {self._mode}")

    def _matches(self, row: Dict[str, Any]) -> bool:
        return all(row.get(col) == val for col, val in self._filters)

    def _do_select(self) -> Any:
        matches = [dict(row) for row in self._store.rows if self._matches(row)]
        return _FakeResult(matches)

    def _do_upsert(self) -> Any:
        conflict_col = self._on_conflict or "id"
        conflict_val = self._payload.get(conflict_col)
        for row in self._store.rows:
            if conflict_val is not None and row.get(conflict_col) == conflict_val:
                row.update(self._payload)
                return _FakeResult([dict(row)])
        new_row = {"id": f"row-{len(self._store.rows) + 1}", **self._payload}
        self._store.rows.append(new_row)
        return _FakeResult([dict(new_row)])

    def _do_update(self) -> Any:
        updated: List[Dict[str, Any]] = []
        for row in self._store.rows:
            if self._matches(row):
                row.update(self._payload)
                updated.append(dict(row))
        return _FakeResult(updated)


class _FakeResult:
    def __init__(self, data: List[Dict[str, Any]]) -> None:
        self.data = data


class _FakeSupabase:
    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []

    def table(self, name: str) -> _FakeQuery:
        assert name == revenuecat_users.TABLE_NAME, name
        return _FakeQuery(self, name)


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


class MsToIsoTests(unittest.TestCase):
    def test_converts_ms_to_iso_utc(self) -> None:
        # 2023-11-14T22:13:20+00:00
        iso = revenuecat_users.ms_to_iso(1_700_000_000_000)
        self.assertIsNotNone(iso)
        parsed = datetime.fromisoformat(iso)  # type: ignore[arg-type]
        self.assertEqual(parsed.tzinfo, timezone.utc)
        self.assertEqual(int(parsed.timestamp() * 1000), 1_700_000_000_000)

    def test_accepts_numeric_string(self) -> None:
        iso = revenuecat_users.ms_to_iso("1700000000000")
        self.assertIsNotNone(iso)

    def test_returns_none_for_none(self) -> None:
        self.assertIsNone(revenuecat_users.ms_to_iso(None))

    def test_returns_none_for_garbage_string(self) -> None:
        self.assertIsNone(revenuecat_users.ms_to_iso("not-a-number"))

    def test_returns_none_for_huge_value(self) -> None:
        # Several centuries past datetime's max → swallowed, not raised.
        self.assertIsNone(revenuecat_users.ms_to_iso(10**20))


def _event(event_type: str, **overrides: Any) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "type": event_type,
        "id": "evt-1",
        "app_user_id": "user-uuid",
        "event_timestamp_ms": 1_700_000_000_000,
        "product_id": "fitfo_premium_annual",
        "expiration_at_ms": 1_700_000_000_000 + 7 * 24 * 60 * 60 * 1000,
    }
    base.update(overrides)
    return base


class RevenueCatUsersServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fake = _FakeSupabase()
        self._patch = patch.object(
            revenuecat_users, "get_supabase", lambda: self.fake
        )
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()

    # --- upsert_user_mapping --------------------------------------------

    def test_upsert_creates_row_with_identity_fields(self) -> None:
        row = revenuecat_users.upsert_user_mapping(
            supabase_user_id="user-uuid",
            revenuecat_app_user_id="user-uuid",
            phone_number="+15555550100",
            apple_provider_id="apple-sub-123",
        )
        self.assertEqual(row["supabase_user_id"], "user-uuid")
        self.assertEqual(row["revenuecat_app_user_id"], "user-uuid")
        self.assertEqual(row["phone_number"], "+15555550100")
        self.assertEqual(row["apple_provider_id"], "apple-sub-123")
        self.assertEqual(len(self.fake.rows), 1)

    def test_upsert_is_idempotent_on_same_user(self) -> None:
        revenuecat_users.upsert_user_mapping(
            supabase_user_id="user-uuid",
            revenuecat_app_user_id="user-uuid",
            phone_number="+15555550100",
        )
        revenuecat_users.upsert_user_mapping(
            supabase_user_id="user-uuid",
            revenuecat_app_user_id="user-uuid",
            phone_number="+15555550200",
            apple_provider_id="apple-sub-123",
        )
        self.assertEqual(len(self.fake.rows), 1)
        row = self.fake.rows[0]
        self.assertEqual(row["phone_number"], "+15555550200")
        self.assertEqual(row["apple_provider_id"], "apple-sub-123")

    def test_upsert_rejects_missing_supabase_user_id(self) -> None:
        with self.assertRaises(ValueError):
            revenuecat_users.upsert_user_mapping(
                supabase_user_id="",
                revenuecat_app_user_id="user-uuid",
            )

    def test_upsert_blanks_string_inputs_become_null(self) -> None:
        row = revenuecat_users.upsert_user_mapping(
            supabase_user_id="user-uuid",
            revenuecat_app_user_id="user-uuid",
            phone_number="   ",
            apple_provider_id=None,
        )
        self.assertIsNone(row["phone_number"])
        self.assertIsNone(row["apple_provider_id"])

    # --- handle_event - happy path per supported type --------------------

    def _seed_mapping(self) -> None:
        revenuecat_users.upsert_user_mapping(
            supabase_user_id="user-uuid",
            revenuecat_app_user_id="user-uuid",
            phone_number="+15555550100",
        )

    def test_trial_started_sets_trialing_status(self) -> None:
        self._seed_mapping()
        revenuecat_users.handle_event(
            _event("TRIAL_STARTED", period_start_ms=1_700_000_000_000)
        )
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_TRIALING
        )
        self.assertIsNotNone(row["trial_started_at"])
        self.assertEqual(row["last_event_type"], "TRIAL_STARTED")
        self.assertIsNotNone(row["last_event_at"])

    def test_initial_purchase_marks_active(self) -> None:
        self._seed_mapping()
        revenuecat_users.handle_event(_event("INITIAL_PURCHASE"))
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_ACTIVE
        )
        self.assertEqual(row["product_id"], "fitfo_premium_annual")
        self.assertIsNotNone(row["expires_at"])

    def test_renewal_marks_active(self) -> None:
        self._seed_mapping()
        revenuecat_users.handle_event(_event("RENEWAL"))
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_ACTIVE
        )

    def test_cancellation_marks_cancelled(self) -> None:
        self._seed_mapping()
        revenuecat_users.handle_event(_event("CANCELLATION"))
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_CANCELLED
        )

    def test_expiration_marks_expired(self) -> None:
        self._seed_mapping()
        revenuecat_users.handle_event(_event("EXPIRATION"))
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_EXPIRED
        )

    # --- handle_event - defensive behavior --------------------------------

    def test_unknown_event_type_is_ignored(self) -> None:
        self._seed_mapping()
        result = revenuecat_users.handle_event(_event("REFUND"))
        self.assertIsNone(result)
        row = self.fake.rows[0]
        # Row left untouched by the unsupported event — no status/event
        # fields written. (subscription_status defaults to 'unknown' at
        # the DB layer; the fake omits the default so we check the key
        # is absent instead.)
        self.assertNotIn("last_event_type", row)

    def test_missing_event_type_is_ignored(self) -> None:
        result = revenuecat_users.handle_event({"app_user_id": "user-uuid"})
        self.assertIsNone(result)

    def test_missing_app_user_id_is_ignored(self) -> None:
        result = revenuecat_users.handle_event({"type": "RENEWAL"})
        self.assertIsNone(result)

    def test_non_mapping_payload_does_not_raise(self) -> None:
        result = revenuecat_users.handle_event("definitely not an object")  # type: ignore[arg-type]
        self.assertIsNone(result)

    def test_no_matching_row_is_ignored(self) -> None:
        # No seed call → no row exists for app_user_id=user-uuid.
        result = revenuecat_users.handle_event(_event("RENEWAL"))
        self.assertIsNone(result)

    def test_missing_optional_fields_do_not_crash(self) -> None:
        self._seed_mapping()
        # Drop product_id, expiration_at_ms, event_timestamp_ms entirely.
        revenuecat_users.handle_event(
            {"type": "RENEWAL", "app_user_id": "user-uuid"}
        )
        row = self.fake.rows[0]
        self.assertEqual(
            row["subscription_status"], revenuecat_users.STATUS_ACTIVE
        )
        # product_id was already set by seed (it's actually null since seed
        # doesn't set it) — confirm absence doesn't blow up.
        self.assertEqual(row["last_event_type"], "RENEWAL")


if __name__ == "__main__":
    unittest.main()
