from __future__ import annotations

import unittest
from typing import Iterable

import httpx

from app.services import openai_retry


class _FakeResponse:
    def __init__(
        self,
        status_code: int,
        *,
        headers: dict | None = None,
        text: str = "",
    ) -> None:
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text


def _scripted_perform(responses: Iterable[object]):
    """Build a perform_request that yields each scripted response/exception in order."""
    iterator = iter(list(responses))

    async def _perform() -> httpx.Response:  # type: ignore[return-value]
        item = next(iterator)
        if isinstance(item, BaseException):
            raise item
        return item  # type: ignore[return-value]

    return _perform


class ParseRetryAfterTests(unittest.TestCase):
    def test_numeric_header(self) -> None:
        resp = _FakeResponse(429, headers={"Retry-After": "2"})
        self.assertEqual(openai_retry.parse_retry_after_seconds(resp), 2.0)  # type: ignore[arg-type]

    def test_missing_header(self) -> None:
        resp = _FakeResponse(429)
        self.assertIsNone(openai_retry.parse_retry_after_seconds(resp))  # type: ignore[arg-type]

    def test_non_numeric_header_returns_none(self) -> None:
        resp = _FakeResponse(429, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"})
        self.assertIsNone(openai_retry.parse_retry_after_seconds(resp))  # type: ignore[arg-type]


class ParseRetryHintFromBodyTests(unittest.TestCase):
    def test_milliseconds_hint(self) -> None:
        body = '{"error": {"message": "Please try again in 352ms."}}'
        self.assertAlmostEqual(openai_retry.parse_retry_hint_from_body(body), 0.352)

    def test_seconds_hint(self) -> None:
        body = "Please try again in 4s."
        self.assertEqual(openai_retry.parse_retry_hint_from_body(body), 4.0)

    def test_no_hint(self) -> None:
        self.assertIsNone(openai_retry.parse_retry_hint_from_body("nope"))
        self.assertIsNone(openai_retry.parse_retry_hint_from_body(""))
        self.assertIsNone(openai_retry.parse_retry_hint_from_body(None))


class ComputeBackoffDelayTests(unittest.TestCase):
    def test_uses_retry_after_header_with_floor(self) -> None:
        resp = _FakeResponse(429, headers={"Retry-After": "0.1"})
        delay = openai_retry.compute_backoff_delay(1, resp)  # type: ignore[arg-type]
        self.assertGreaterEqual(delay, 0.5)
        self.assertLessEqual(delay, 0.75 + 1e-9)

    def test_falls_back_to_exponential(self) -> None:
        delay = openai_retry.compute_backoff_delay(3, None)
        self.assertGreaterEqual(delay, 4.0)
        self.assertLessEqual(delay, 4.25 + 1e-9)

    def test_caps_huge_server_hints(self) -> None:
        resp = _FakeResponse(429, headers={"Retry-After": "9999"})
        delay = openai_retry.compute_backoff_delay(1, resp, cap=10.0)  # type: ignore[arg-type]
        self.assertLessEqual(delay, 10.0 + 0.25 + 1e-9)


class PostWithRetriesTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_first_success_immediately(self) -> None:
        ok = _FakeResponse(200)
        sleeps: list[float] = []

        async def _fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        resp = await openai_retry.post_with_retries(
            _scripted_perform([ok]),
            log_label="test",
            sleep=_fake_sleep,
        )
        self.assertIs(resp, ok)
        self.assertEqual(sleeps, [])

    async def test_retries_on_429_then_succeeds(self) -> None:
        rate_limited = _FakeResponse(429, headers={"Retry-After": "0"})
        ok = _FakeResponse(200)
        sleeps: list[float] = []

        async def _fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        resp = await openai_retry.post_with_retries(
            _scripted_perform([rate_limited, ok]),
            log_label="test",
            sleep=_fake_sleep,
        )
        self.assertIs(resp, ok)
        self.assertEqual(len(sleeps), 1)
        self.assertGreaterEqual(sleeps[0], 0.5)

    async def test_returns_last_response_when_attempts_exhausted(self) -> None:
        rate_limited = _FakeResponse(429, headers={"Retry-After": "0"})

        async def _fake_sleep(_seconds: float) -> None:
            return None

        resp = await openai_retry.post_with_retries(
            _scripted_perform([rate_limited, rate_limited]),
            log_label="test",
            max_attempts=2,
            sleep=_fake_sleep,
        )
        self.assertIs(resp, rate_limited)

    async def test_does_not_retry_on_non_retryable_status(self) -> None:
        bad = _FakeResponse(401)
        sleeps: list[float] = []

        async def _fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        resp = await openai_retry.post_with_retries(
            _scripted_perform([bad]),
            log_label="test",
            sleep=_fake_sleep,
        )
        self.assertIs(resp, bad)
        self.assertEqual(sleeps, [])

    async def test_retries_on_request_error_then_succeeds(self) -> None:
        ok = _FakeResponse(200)
        sleeps: list[float] = []

        async def _fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        resp = await openai_retry.post_with_retries(
            _scripted_perform([httpx.ConnectError("boom"), ok]),
            log_label="test",
            sleep=_fake_sleep,
        )
        self.assertIs(resp, ok)
        self.assertEqual(len(sleeps), 1)

    async def test_reraises_request_error_after_attempts(self) -> None:
        async def _fake_sleep(_seconds: float) -> None:
            return None

        with self.assertRaises(httpx.ConnectError):
            await openai_retry.post_with_retries(
                _scripted_perform([
                    httpx.ConnectError("boom"),
                    httpx.ConnectError("boom2"),
                ]),
                log_label="test",
                max_attempts=2,
                sleep=_fake_sleep,
            )


if __name__ == "__main__":
    unittest.main()
