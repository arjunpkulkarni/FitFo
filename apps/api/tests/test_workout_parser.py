from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from app.services import workout_parser


class _FakeResponse:
    def __init__(
        self,
        payload: dict,
        status_code: int = 200,
        headers: dict | None = None,
    ) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)
        self.headers = headers or {}

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(
        self,
        response: _FakeResponse | list[_FakeResponse],
        capture: dict | None = None,
        **kwargs,
    ) -> None:
        if isinstance(response, list):
            self._responses = list(response)
        else:
            self._responses = [response]
        self.capture = capture if capture is not None else {}
        self.call_count = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, headers: dict, json: dict):
        self.capture["url"] = url
        self.capture["headers"] = headers
        self.capture["json"] = json
        self.call_count += 1
        if len(self._responses) == 1:
            return self._responses[0]
        return self._responses.pop(0)


class WorkoutParserTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()
        os.environ["OPENAI_API_KEY"] = "openai-key"

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)

    def test_build_user_message_labels_all_sources(self) -> None:
        message = workout_parser._build_user_message(
            "",
            on_screen_text="Goblet squat 3x10",
            caption="Quiet leg day",
        )
        payload = json.loads(message)
        self.assertEqual(payload["evidence"]["transcript"], "")
        self.assertEqual(payload["evidence"]["on_screen_text"], "Goblet squat 3x10")
        self.assertEqual(payload["evidence"]["caption"], "Quiet leg day")

    def test_system_prompt_instructs_transcript_precedence(self) -> None:
        self.assertIn("Prefer the transcript when it covers a value", workout_parser.SYSTEM_PROMPT)
        self.assertIn("exact exercise name appears", workout_parser.SYSTEM_PROMPT)

    async def test_parse_transcript_to_workout_supports_ocr_only_inputs(self) -> None:
        capture: dict = {}
        response = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "title": "Leg burner",
                                    "workout_type": "strength",
                                    "equipment": [],
                                    "blocks": [
                                        {
                                            "name": None,
                                            "exercises": [
                                                {
                                                    "name": "Goblet squat",
                                                    "sets": 3,
                                                    "reps": 10,
                                                    "duration_sec": None,
                                                    "rest_sec": None,
                                                    "notes": None,
                                                }
                                            ],
                                        }
                                    ],
                                    "notes": None,
                                }
                            )
                        }
                    }
                ]
            }
        )

        with patch(
            "app.services.workout_parser.httpx.AsyncClient",
            return_value=_FakeAsyncClient(response, capture),
        ):
            plan = await workout_parser.parse_transcript_to_workout(
                "",
                on_screen_text="Goblet squat 3x10",
                caption="Leg burner",
            )

        self.assertEqual(plan["title"], "Leg burner")
        self.assertEqual(plan["blocks"][0]["exercises"][0]["name"], "Goblet squat")
        user_message = json.loads(capture["json"]["messages"][1]["content"])
        self.assertEqual(user_message["evidence"]["transcript"], "")
        self.assertEqual(user_message["evidence"]["on_screen_text"], "Goblet squat 3x10")
        self.assertEqual(capture["url"], workout_parser.OPENAI_CHAT_URL)

    async def test_parse_filters_exercises_not_supported_by_evidence(self) -> None:
        response = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "title": "Leg day",
                                    "workout_type": "strength",
                                    "muscle_groups": ["legs"],
                                    "equipment": [],
                                    "blocks": [
                                        {
                                            "name": None,
                                            "exercises": [
                                                {
                                                    "name": "Burpees",
                                                    "sets": 3,
                                                    "reps": 10,
                                                    "duration_sec": None,
                                                    "rest_sec": None,
                                                    "notes": None,
                                                }
                                            ],
                                        }
                                    ],
                                    "notes": None,
                                }
                            )
                        }
                    }
                ]
            }
        )

        with patch(
            "app.services.workout_parser.httpx.AsyncClient",
            return_value=_FakeAsyncClient(response),
        ):
            plan = await workout_parser.parse_transcript_to_workout(
                "",
                on_screen_text="Goblet squat 3x10",
                caption="Leg day",
            )

        self.assertEqual(plan["blocks"], [])
        self.assertEqual(
            plan["reason"],
            "No exercise names detected in caption, transcript, or on-screen text.",
        )

    async def test_parse_retries_on_429_then_succeeds(self) -> None:
        rate_limited = _FakeResponse(
            {
                "error": {
                    "message": (
                        "Rate limit reached for gpt-4.1-mini ... "
                        "Please try again in 250ms."
                    ),
                    "type": "tokens",
                    "code": "rate_limit_exceeded",
                }
            },
            status_code=429,
        )
        success = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "title": "Leg burner",
                                    "workout_type": "strength",
                                    "muscle_groups": ["legs"],
                                    "equipment": [],
                                    "blocks": [
                                        {
                                            "name": None,
                                            "exercises": [
                                                {
                                                    "name": "Goblet squat",
                                                    "sets": 3,
                                                    "reps": 10,
                                                    "duration_sec": None,
                                                    "rest_sec": None,
                                                    "notes": None,
                                                }
                                            ],
                                        }
                                    ],
                                    "notes": None,
                                }
                            )
                        }
                    }
                ]
            }
        )

        fake_client = _FakeAsyncClient([rate_limited, success])
        sleeps: list[float] = []

        async def _fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)

        with patch(
            "app.services.workout_parser.httpx.AsyncClient",
            return_value=fake_client,
        ), patch("app.services.openai_retry.asyncio.sleep", _fake_sleep):
            plan = await workout_parser.parse_transcript_to_workout(
                "",
                on_screen_text="Goblet squat 3x10",
                caption="Leg burner",
            )

        self.assertEqual(plan["blocks"][0]["exercises"][0]["name"], "Goblet squat")
        self.assertEqual(fake_client.call_count, 2)
        self.assertEqual(len(sleeps), 1)
        # Body hint of 250ms is floored to _MIN_SERVER_HINT_SECONDS by the helper.
        from app.services import openai_retry as _retry

        self.assertGreaterEqual(sleeps[0], _retry._MIN_SERVER_HINT_SECONDS)
        self.assertLessEqual(
            sleeps[0],
            _retry._MIN_SERVER_HINT_SECONDS + _retry._JITTER_SECONDS + 1e-9,
        )

    async def test_parse_raises_when_429_persists(self) -> None:
        from app.services import openai_retry as _retry

        rate_limited = _FakeResponse(
            {"error": {"message": "Rate limit reached", "code": "rate_limit_exceeded"}},
            status_code=429,
            headers={"Retry-After": "0"},
        )

        fake_client = _FakeAsyncClient([rate_limited] * _retry.DEFAULT_MAX_ATTEMPTS)

        async def _fake_sleep(_seconds: float) -> None:
            return None

        with patch(
            "app.services.workout_parser.httpx.AsyncClient",
            return_value=fake_client,
        ), patch("app.services.openai_retry.asyncio.sleep", _fake_sleep):
            with self.assertRaises(workout_parser.WorkoutParserError) as cm:
                await workout_parser.parse_transcript_to_workout(
                    "Goblet squat 3 sets of 10",
                    on_screen_text="",
                    caption="",
                )

        self.assertIn("HTTP 429", str(cm.exception))
        self.assertEqual(fake_client.call_count, _retry.DEFAULT_MAX_ATTEMPTS)
