from __future__ import annotations

import json
import os
import unittest
from unittest.mock import AsyncMock, patch

from app.services import corpus_chat, corpus_retrieval


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, response: _FakeResponse, capture: dict | None = None) -> None:
        self.response = response
        self.capture = capture if capture is not None else {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, headers: dict, json: dict):
        self.capture["url"] = url
        self.capture["headers"] = headers
        self.capture["json"] = json
        return self.response


def _retrieval_chunk(text: str, *, chunk_id: str, similarity: float = 0.7) -> corpus_retrieval.RetrievedChunk:
    return corpus_retrieval.RetrievedChunk(
        chunk_id=chunk_id,
        source_id=f"src-{chunk_id}",
        chunk_text=text,
        chunk_type="tip",
        exercise=[],
        muscle_group=["arms"],
        equipment=[],
        goal=["hypertrophy"],
        source_url=f"https://www.tiktok.com/@jacoboestreichercoaching/video/{chunk_id}",
        creator_id="creator-uuid",
        similarity=similarity,
    )


class BuildContextBlockTests(unittest.TestCase):
    def test_indexes_chunks_starting_at_one(self) -> None:
        chunks = [
            _retrieval_chunk("first", chunk_id="a"),
            _retrieval_chunk("second", chunk_id="b"),
        ]
        block = corpus_chat._build_context_block(chunks)
        self.assertIn("[1] first", block)
        self.assertIn("[2] second", block)

    def test_empty_chunks_emits_explicit_marker(self) -> None:
        block = corpus_chat._build_context_block([])
        self.assertIn("no relevant", block.lower())

    def test_context_block_has_no_urls(self) -> None:
        chunks = [_retrieval_chunk("tip body", chunk_id="z")]
        block = corpus_chat._build_context_block(chunks)
        self.assertNotIn("http", block.lower())


class BuildWorkoutBlockTests(unittest.TestCase):
    def test_athlete_position_and_per_exercise_completion(self) -> None:
        workout = corpus_chat.WorkoutContext(
            title="Legs",
            completed_set_count=4,
            total_set_count=12,
            elapsed_sec=185,
            timer_paused=False,
            current_exercise_index=2,
            current_exercise_name="RDL",
            current_set_number=2,
            current_set_target_summary="8 reps target",
            current_set_logged_summary="185 lb · 10 reps",
            source_workout_id="sw_abc",
            exercises=[
                corpus_chat.WorkoutExerciseContext(
                    "Squat", 4, 8, None, 120, None, sets_completed=2,
                ),
                corpus_chat.WorkoutExerciseContext(
                    "RDL", 3, 8, None, 90, None, sets_completed=1,
                ),
            ],
        )
        block = corpus_chat._build_workout_block(workout)
        self.assertIsNotNone(block)
        assert block is not None
        self.assertIn("ATHLETE POSITION", block)
        self.assertIn("Sets logged vs planned: 4/12", block)
        self.assertIn("03:05", block)
        self.assertIn("Athlete focus: exercise 2 of 2 — RDL", block)
        self.assertIn("Working set #: 2 of 3", block)
        self.assertIn("saved/template id=sw_abc", block)
        self.assertIn("(2/4 sets done)", block)
        self.assertIn("(1/3 sets done)", block)


class ClampCitationsInAnswerTests(unittest.TestCase):
    def test_keeps_tokens_in_range_and_strips_oob(self) -> None:
        raw = "Drive elbows under [1] and stay stacked [2] bogus [99]."
        out = corpus_chat._clamp_citations_in_answer(raw, num_chunks=2)
        self.assertIn("[1]", out)
        self.assertIn("[2]", out)
        self.assertNotIn("[99]", out)
        self.assertIn("Drive elbows under [1]", out)

    def test_strips_all_when_no_chunks(self) -> None:
        raw = "Hint [1] here."
        out = corpus_chat._clamp_citations_in_answer(raw, num_chunks=0)
        self.assertNotIn("[1]", out)


class AnswerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()
        os.environ["OPENAI_API_KEY"] = "openai-key"

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)

    async def test_returns_fallback_when_retrieval_is_empty(self) -> None:
        with patch(
            "app.services.corpus_chat.corpus_retrieval.retrieve",
            new=AsyncMock(return_value=[]),
        ):
            result = await corpus_chat.answer("how do triceps grow?")
        self.assertIn("don't have coverage", result.answer)
        self.assertEqual(result.citations, [])
        self.assertEqual(result.retrieval, [])

    async def test_synthesizes_answer_from_retrieved_chunks(self) -> None:
        chunks = [
            _retrieval_chunk(
                "Get strong on pressing movements to grow triceps.",
                chunk_id="c1",
                similarity=0.82,
            ),
            _retrieval_chunk(
                "Bench, overhead press, dips — these build the triceps.",
                chunk_id="c2",
                similarity=0.74,
            ),
        ]
        llm_response = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": (
                                "Stop doing little tricep pushdowns and get strong on "
                                "presses [1]. Bench, overhead press, dips [2]."
                            )
                        }
                    }
                ]
            }
        )
        capture: dict = {}

        with (
            patch(
                "app.services.corpus_chat.corpus_retrieval.retrieve",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.corpus_chat.httpx.AsyncClient",
                return_value=_FakeAsyncClient(llm_response, capture),
            ),
        ):
            result = await corpus_chat.answer("how do I grow my triceps?")

        self.assertIn("[1]", result.answer)
        self.assertIn("[2]", result.answer)
        self.assertEqual(len(result.citations), 2)
        self.assertEqual({c.index for c in result.citations}, {1, 2})
        system_content = capture["json"]["messages"][0]["content"]
        self.assertIn("pressing movements", system_content)
        self.assertIn("[1]", system_content)
        self.assertNotIn("tiktok.com", system_content.lower())

    async def test_workout_context_appears_in_system_message(self) -> None:
        chunks = [_retrieval_chunk("Drive your feet for stability.", chunk_id="c1")]
        llm_response = _FakeResponse(
            {"choices": [{"message": {"content": "Lock your feet [1]."}}]}
        )
        capture: dict = {}
        workout = corpus_chat.WorkoutContext(
            title="Push Day",
            workout_type="strength",
            muscle_groups=["chest", "shoulders", "arms"],
            exercises=[
                corpus_chat.WorkoutExerciseContext(
                    name="Incline Smith press",
                    sets=4, reps=8, duration_sec=None, rest_sec=120, notes=None,
                ),
                corpus_chat.WorkoutExerciseContext(
                    name="Dips",
                    sets=3, reps=10, duration_sec=None, rest_sec=90, notes="bodyweight",
                ),
            ],
        )

        with (
            patch(
                "app.services.corpus_chat.corpus_retrieval.retrieve",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.corpus_chat.httpx.AsyncClient",
                return_value=_FakeAsyncClient(llm_response, capture),
            ),
        ):
            await corpus_chat.answer("what should I focus on?", workout=workout)

        system_content = capture["json"]["messages"][0]["content"]
        self.assertIn("SESSION SNAPSHOT", system_content)
        self.assertIn("Push Day", system_content)
        self.assertIn("Incline Smith press", system_content)
        self.assertIn("4x 8 reps", system_content)
        self.assertIn("rest 120s", system_content)

    async def test_no_chunks_with_workout_still_calls_llm(self) -> None:
        """Workout-context questions don't need retrieval — LLM must still run."""
        llm_response = _FakeResponse(
            {"choices": [{"message": {"content": "Your second exercise is dips."}}]}
        )
        workout = corpus_chat.WorkoutContext(
            title="Push", exercises=[
                corpus_chat.WorkoutExerciseContext(
                    name="Bench", sets=4, reps=8, duration_sec=None, rest_sec=120, notes=None,
                ),
                corpus_chat.WorkoutExerciseContext(
                    name="Dips", sets=3, reps=10, duration_sec=None, rest_sec=90, notes=None,
                ),
            ],
        )
        with (
            patch(
                "app.services.corpus_chat.corpus_retrieval.retrieve",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.corpus_chat.httpx.AsyncClient",
                return_value=_FakeAsyncClient(llm_response),
            ),
        ):
            result = await corpus_chat.answer(
                "what's my second exercise?", workout=workout
            )
        self.assertEqual(result.answer, "Your second exercise is dips.")
        self.assertEqual(result.citations, [])
        self.assertEqual(result.retrieval, [])

    async def test_no_chunks_no_workout_returns_fallback_without_llm(self) -> None:
        llm_called = False

        class _ShouldNotBeCalledClient:
            def __init__(self, *args, **kwargs) -> None:
                nonlocal llm_called
                llm_called = True

        with (
            patch(
                "app.services.corpus_chat.corpus_retrieval.retrieve",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.corpus_chat.httpx.AsyncClient",
                _ShouldNotBeCalledClient,
            ),
        ):
            result = await corpus_chat.answer("how do triceps grow?")
        self.assertFalse(llm_called)
        self.assertIn("don't have coverage", result.answer)

    async def test_system_prompt_carries_scope_guard(self) -> None:
        """Off-topic refusal is enforced in the system prompt itself."""
        self.assertIn("SCOPE", corpus_chat.SYSTEM_PROMPT)
        self.assertIn("ask me about your training", corpus_chat.SYSTEM_PROMPT)

    async def test_system_prompt_enforces_short_output(self) -> None:
        """Style block must keep answers tight."""
        prompt_lower = corpus_chat.SYSTEM_PROMPT.lower()
        self.assertIn("style", prompt_lower)
        self.assertIn("60 words", prompt_lower)
        self.assertIn("**bold**", prompt_lower)

    async def test_includes_recent_history_in_messages(self) -> None:
        chunks = [_retrieval_chunk("Heavy compounds drive arm growth.", chunk_id="c1")]
        llm_response = _FakeResponse(
            {
                "choices": [
                    {"message": {"content": "Yep, double down on presses [1]."}}
                ]
            }
        )
        capture: dict = {}
        history = [
            corpus_chat.ChatTurn(role="user", content="how do I grow arms?"),
            corpus_chat.ChatTurn(role="assistant", content="Get strong on presses [1]."),
        ]

        with (
            patch(
                "app.services.corpus_chat.corpus_retrieval.retrieve",
                new=AsyncMock(return_value=chunks),
            ),
            patch(
                "app.services.corpus_chat.httpx.AsyncClient",
                return_value=_FakeAsyncClient(llm_response, capture),
            ),
        ):
            await corpus_chat.answer("but my triceps still aren't growing", history=history)

        roles = [m["role"] for m in capture["json"]["messages"]]
        # system + 2 history turns + 1 new user message
        self.assertEqual(roles, ["system", "user", "assistant", "user"])


class StripCoachEchoTagsTests(unittest.TestCase):
    def test_strip_bolds_and_period_variants(self) -> None:
        raw = (
            "You're on exercise 1 of 3 — Bench, working on set 1 of 3 "
            "**[CURRENT WORKOUT].**"
        )
        self.assertEqual(
            corpus_chat._strip_coach_echo_tags(raw),
            "You're on exercise 1 of 3 — Bench, working on set 1 of 3",
        )

    def test_plain_brackets_strip(self) -> None:
        self.assertEqual(
            corpus_chat._strip_coach_echo_tags(
                "Set 2 next [CURRENT WORKOUT].",
            ),
            "Set 2 next.",
        )

    def test_does_not_strip_retrieval_citations(self) -> None:
        self.assertEqual(
            corpus_chat._strip_coach_echo_tags("Grip the bar **[1]** at shoulder width."),
            "Grip the bar **[1]** at shoulder width.",
        )


if __name__ == "__main__":
    unittest.main()
