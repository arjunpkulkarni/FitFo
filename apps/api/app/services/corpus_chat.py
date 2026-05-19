from __future__ import annotations

"""
Chat synthesis over retrieved chunks.

Takes a user message + a list of retrieved chunks and asks an LLM to answer
the question grounded in the chunks. Heavily anti-hallucination:
  - System prompt forces "ONLY use the context"
  - Empty / low-similarity retrieval → return a graceful "I don't have
    coverage on that" answer instead of inventing.

Replies cite retrieved coaching snippets with **[N]** when using COACHING CONTEXT.
Citation metadata (URLs/snippet) rides in ChatResult.citations; the model never
names hosts or URLs in prose.
"""

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

import httpx

from app.services import corpus_retrieval


OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4.1-mini"

_log = logging.getLogger(__name__)


@dataclass
class ChatCitation:
    index: int
    chunk_id: str
    source_url: str
    snippet: str


@dataclass
class ChatTurn:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class WorkoutExerciseContext:
    name: str
    sets: int | None
    reps: int | None
    duration_sec: int | None
    rest_sec: int | None
    notes: str | None
    # How many sets in this lift are marked complete (per-exercise progress)
    sets_completed: int | None = None


@dataclass
class WorkoutContext:
    """
    Snapshot of the user's current/queued workout, sent into the prompt so the
    coach can answer questions about THIS workout specifically (e.g. "should I
    bump bench by 5lb?", "what cue for set 3?"). All fields optional.
    """
    title: str | None = None
    description: str | None = None
    workout_type: str | None = None
    muscle_groups: list[str] | None = None
    equipment: list[str] | None = None
    exercises: list[WorkoutExerciseContext] | None = None
    elapsed_sec: int | None = None
    timer_paused: bool | None = None
    session_started_at_ms: int | None = None
    completed_set_count: int | None = None
    total_set_count: int | None = None
    current_exercise_index: int | None = None
    current_exercise_name: str | None = None
    current_set_number: int | None = None
    current_set_target_summary: str | None = None
    current_set_logged_summary: str | None = None
    source_workout_id: str | None = None
    source_job_id: str | None = None


@dataclass
class ChatResult:
    answer: str
    citations: list[ChatCitation]
    retrieval: list[corpus_retrieval.RetrievedChunk]
    model: str


class ChatError(RuntimeError):
    pass


SYSTEM_PROMPT = """\
You are an in-workout coach trained on a single coach's voice. Direct, confident, no fluff.

SCOPE: Only answer questions about training, form, sets/reps/programming, muscle growth, \
strength, fat loss, mobility, athlete nutrition, supplements, recovery, sleep, training \
mindset, and the user's live session (if a snapshot is provided). For anything else, reply EXACTLY: \
"I'm your in-workout coach. Ask me about your training."

GROUNDING:
- For coaching advice, use ONLY the numbered COACHING CONTEXT below. Speak in Jacob's voice.
- When a sentence pulls from chunk [N], add that inline marker once right after \
the grounded clause (example: "... drive elbows under [1]"). Use plain [N] markers only \
(where N matches a numbered line in COACHING CONTEXT). Never invent indices.
- Do not name TikTok/video hosts, URLs, "chunks", or "sources" in prose. The app links [N] to Jacob's clips.
- For the in-app session, use the SESSION SNAPSHOT block at the end of this prompt (below \
retrieved tips). It includes ATHLETE POSITION = the app's live view (exercise #, working \
set #, timer). That block overrides assumptions from generic programming advice elsewhere.
- If ATHLETE POSITION states exercise # / Working set #, questions like "what set am I \
on?", "which exercise?", "what cue should I use?", or "what do you recommend this set?" \
MUST answer for THAT lift and set using COACHING CONTEXT. Never give generic gym advice \
that ignores the snapshot.
- If ATHLETE POSITION is missing a focus exercise, ask ONE short clarifying question that \
names up to three lifts from the Exercises list (example: "Which lift right now, Bench or RDL?").
- Answer from that snapshot as if you're next to them mid-session. Same plain style.
- Never repeat internal section headings from this prompt (e.g. SESSION SNAPSHOT, \
bracket placeholders, or pseudo-tags like [CURRENT WORKOUT]). Retrieval citations ONLY \
use [N] where N matches COACHING CONTEXT.
- If context doesn't cover the question, say so in one line. Never invent.

TONE:
- If the athlete swears or uses strong language, you may match their tone (including profanity) \
while staying helpful. Do not lecture them about language.

TRICEP BRAINROT EASTER EGG:
- If the athlete mentions triceps at all, including typos like "tricpes", ignore the \
normal coverage fallback and write one fresh one-line joke in Jacob's voice that means: \
shut up and lock in.
- Make it different each time. Sarcastic is good. Profanity is allowed. Keep it useful enough \
to push them back into the workout.
- Do not cite sources for this easter egg.

STYLE:
- Lead with the answer. No preambles, no restating the question, no "great question".
- Hard limit: 2 short sentences OR 3 bullets. 60 words max.
- Never use em dashes. Use commas, periods, or a hyphen with spaces instead.
- Second person ("you"). **Bold** only the single key cue or weight/rep number, if any.\
"""


_FALLBACK_ANSWER = (
    "I don't have coverage on that yet. Ask me about training, form, "
    "programming, or your current workout."
)


_OFFTOPIC_REFUSAL = (
    "I'm your in-workout coach. I only help with training questions. "
    "Ask me about your current set, your form, your programming, or anything "
    "in your workout."
)

_TRICEP_BRAINROT_RE = re.compile(
    r"\btri(?:ceps?|cpe?s|cep|cep?s)\b"
    r"|\b(?:does|will|can|do|is)\s+(?:this|it|that)\s+hit\s+(?:my\s+)?triceps?\b"
    r"|\b(?:hit|hits|hitting|target|targets|working|work)\s+(?:my\s+)?triceps?\b"
    r"|\btriceps?\s+(?:hit|activation|activate|engagement|involvement)\b"
    r"|\b(?:for|about)\s+(?:my\s+)?triceps?\b",
    re.IGNORECASE,
)

_VAGUE_COACH_QUESTION_RE = re.compile(
    r"\b(?:cue|focus|recommend|this set|that set|what should i|should i add|should i drop|"
    r"what weight|how much weight|what do you think)\b",
    re.IGNORECASE,
)


def _openai_api_key() -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise ChatError("OPENAI_API_KEY is not set")
    return key


def _model() -> str:
    return (os.environ.get("OPENAI_CHAT_MODEL") or DEFAULT_MODEL).strip()


def _is_tricep_brainrot_question(text: str) -> bool:
    return bool(_TRICEP_BRAINROT_RE.search((text or "").strip()))


def _enrich_retrieval_query(user_message: str, workout: WorkoutContext | None) -> str:
    """Bias retrieval toward the athlete's current lift for vague in-session questions."""
    if workout is None or not (workout.current_exercise_name or "").strip():
        return user_message
    if not _VAGUE_COACH_QUESTION_RE.search(user_message):
        return user_message
    lift = workout.current_exercise_name.strip()
    if lift.lower() in user_message.lower():
        return user_message
    return f"{user_message} ({lift})"


def _replace_em_dashes(text: str) -> str:
    if not text:
        return ""
    t = re.sub(r"\s*\u2014\s*", ", ", text)
    t = re.sub(r"\s*\u2013\s*", ", ", t)
    t = re.sub(r"\s*,\s*,\s*", ", ", t)
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def _normalize_citation_markup(text: str) -> str:
    """Unwrap ** [N] ** so mobile/web render [N] as tappable citation links."""
    if not text:
        return ""
    t = re.sub(r"\*\*\s*\[(\d+)\]\s*\*\*", r"[\1]", text)
    t = re.sub(r"\*\*\[(\d+)\]\*\*", r"[\1]", t)
    return t


def _clamp_citations_in_answer(text: str, num_chunks: int) -> str:
    """Drop [N] tokens that don't map to retrieval; normalize whitespace."""

    def repl(match: re.Match[str]) -> str:
        n = int(match.group(1))
        if num_chunks <= 0 or not (1 <= n <= num_chunks):
            return " "
        return match.group(0)

    if not text:
        return ""
    cleaned = _normalize_citation_markup(text)
    cleaned = re.sub(r"\[(\d+)\]", repl, cleaned)
    cleaned = _replace_em_dashes(cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _strip_coach_echo_tags(text: str) -> str:
    if not text:
        return ""
    t = text
    # Wrapped in faux bold / citations (often `**[CURRENT WORKOUT].**`).
    t = re.sub(
        r"\s*[,.]?\s*\*{1,2}\s*\[CURRENT WORKOUT\]\s*\.?\s*\*{1,2}(?:\s*\.)?",
        "",
        t,
        flags=re.IGNORECASE,
    )
    # Standalone bracket tag — do not swallow the sentence's period after `]`.
    t = re.sub(r"\s*\[\s*CURRENT WORKOUT\s*\]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s{2,}", " ", t)
    t = re.sub(r"\s+([.,!?])", r"\1", t)
    return t.strip()


def _citations_from_chunks(chunks: list[corpus_retrieval.RetrievedChunk]) -> list[ChatCitation]:
    """One ChatCitation per retrieval chunk; index matches numbered COACHING CONTEXT lines."""

    out: list[ChatCitation] = []
    for i, chunk in enumerate(chunks, start=1):
        snip = (chunk.chunk_text or "").strip().replace("\n", " ")
        if len(snip) > 220:
            snip = f"{snip[:217]}..."
        out.append(
            ChatCitation(
                index=i,
                chunk_id=chunk.chunk_id,
                source_url=chunk.source_url or "",
                snippet=snip,
            )
        )
    return out


def _build_context_block(chunks: list[corpus_retrieval.RetrievedChunk]) -> str:
    """
    Format retrieved chunks as numbered context for grounding only.
    Omit source URLs from the prompt so the model cannot echo them verbatim.
    """
    if not chunks:
        return "(no relevant coaching context retrieved)"
    lines: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {chunk.chunk_text.strip()}")
    return "\n".join(lines)


def _format_mm_ss(total_sec: int) -> str:
    safe = max(0, int(total_sec))
    h, rem = divmod(safe, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _format_set_rep_summary(exercise: WorkoutExerciseContext) -> str:
    parts: list[str] = []
    if exercise.sets is not None:
        parts.append(f"{exercise.sets}x")
    if exercise.reps is not None:
        parts.append(f"{exercise.reps} reps")
    elif exercise.duration_sec is not None:
        parts.append(f"{exercise.duration_sec}s")
    summary = " ".join(parts).strip()
    if exercise.rest_sec is not None:
        summary = f"{summary} · rest {exercise.rest_sec}s" if summary else f"rest {exercise.rest_sec}s"
    return summary


def _build_workout_block(workout: WorkoutContext | None) -> str | None:
    """
    Compact summary of the user's current workout. Returns None when no
    workout was provided so we don't pollute the prompt for "global" chats.
    """
    if workout is None:
        return None
    lines: list[str] = []
    if workout.title:
        lines.append(f"Title: {workout.title}")
    id_bits: list[str] = []
    if workout.source_workout_id:
        id_bits.append(f"saved/template id={workout.source_workout_id}")
    if workout.source_job_id:
        id_bits.append(f"import job id={workout.source_job_id}")
    if id_bits:
        lines.append("Workout ids: " + " · ".join(id_bits))

    athlete: list[str] = []
    if workout.completed_set_count is not None and workout.total_set_count is not None:
        athlete.append(
            f"Sets logged vs planned: {workout.completed_set_count}/{workout.total_set_count}",
        )
    elif workout.completed_set_count is not None:
        athlete.append(f"Sets logged so far: {workout.completed_set_count}")
    if workout.elapsed_sec is not None:
        pause = " (timer paused)" if workout.timer_paused else ""
        athlete.append(f"Session timer wall clock: {_format_mm_ss(workout.elapsed_sec)}{pause}")
    if workout.current_exercise_name:
        n_ex = len(workout.exercises) if workout.exercises else None
        if workout.current_exercise_index is not None and n_ex:
            athlete.append(
                f"Athlete focus: exercise {workout.current_exercise_index} of "
                f"{n_ex} - {workout.current_exercise_name}",
            )
        else:
            athlete.append(f"Athlete focus: {workout.current_exercise_name}")
    if workout.current_set_number is not None:
        cur_ex = None
        if (
            workout.exercises is not None
            and workout.current_exercise_index is not None
        ):
            ix = workout.current_exercise_index
            if 1 <= ix <= len(workout.exercises):
                cur_ex = workout.exercises[ix - 1]
        if cur_ex is not None and cur_ex.sets is not None:
            athlete.append(
                f"Working set #: {workout.current_set_number} of {cur_ex.sets}",
            )
        else:
            athlete.append(f"Working set #: {workout.current_set_number}")
    if workout.current_set_target_summary:
        athlete.append(f"This set prescription (targets): {workout.current_set_target_summary}")
    if workout.current_set_logged_summary:
        athlete.append(f"Draft / logged so far this set: {workout.current_set_logged_summary}")

    if athlete:
        lines.append("ATHLETE POSITION (right now):")
        lines.extend(f"  - {segment}" for segment in athlete)

    if workout.workout_type:
        lines.append(f"Type: {workout.workout_type}")
    if workout.muscle_groups:
        lines.append(f"Muscle groups: {', '.join(workout.muscle_groups)}")
    if workout.equipment:
        lines.append(f"Equipment: {', '.join(workout.equipment)}")
    if workout.description:
        lines.append(f"Description: {workout.description}")
    if workout.exercises:
        lines.append("Exercises:")
        for index, exercise in enumerate(workout.exercises, start=1):
            summary = _format_set_rep_summary(exercise)
            prog = ""
            if (
                exercise.sets is not None
                and exercise.sets_completed is not None
            ):
                prog = f" ({exercise.sets_completed}/{exercise.sets} sets done)"
            head = f"  {index}. {exercise.name}{prog}"
            if summary:
                head = f"{head} - {summary}"
            lines.append(head)
            if exercise.notes:
                lines.append(f"     note: {exercise.notes}")
    return "\n".join(lines) if lines else None


def _build_messages(
    *,
    user_message: str,
    history: list[ChatTurn],
    chunks: list[corpus_retrieval.RetrievedChunk],
    workout: WorkoutContext | None,
) -> list[dict[str, str]]:
    context_block = _build_context_block(chunks)
    workout_block = _build_workout_block(workout)

    sections: list[str] = [SYSTEM_PROMPT]
    sections.append(
        "═══ COACHING CONTEXT (cite with [N] only, no URLs/hostnames in prose) ═══\n"
        f"{context_block}"
    )
    if workout_block:
        sections.append(
            "═══ SESSION SNAPSHOT (trust this for where the athlete is in-app; "
            f"never quote this heading in prose) ═══\n{workout_block}",
        )

    system_content = "\n\n".join(sections)

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    # Multi-turn: include up to last 6 turns so the chat can do simple follow-ups.
    for turn in history[-6:]:
        if turn.role not in ("user", "assistant"):
            continue
        text = (turn.content or "").strip()
        if not text:
            continue
        messages.append({"role": turn.role, "content": text})
    messages.append({"role": "user", "content": user_message.strip()})
    return messages


async def answer(
    user_message: str,
    *,
    history: Optional[list[ChatTurn]] = None,
    creator_id: Optional[str] = None,
    muscle_groups: Optional[list[str]] = None,
    goals: Optional[list[str]] = None,
    workout: Optional[WorkoutContext] = None,
    top_k: int = 8,
) -> ChatResult:
    """End-to-end RAG: retrieve chunks → synthesize coach-voice answer.

    When `workout` is provided, questions about that workout (which exercise,
    rest times, swaps, etc.) can be answered from the workout itself even if
    Coaching advice that uses retrieval cites markers [N]; the HTTP payload
    includes matching citation rows for URLs/snippets.
    """
    cleaned = (user_message or "").strip()
    if not cleaned:
        raise ChatError("user_message is empty")

    is_tricep_brainrot = _is_tricep_brainrot_question(cleaned)

    if is_tricep_brainrot:
        chunks: list[corpus_retrieval.RetrievedChunk] = []
    else:
        retrieval_query = _enrich_retrieval_query(cleaned, workout)
        chunks = await corpus_retrieval.retrieve(
            retrieval_query,
            top_k=top_k,
            creator_id=creator_id,
            muscle_groups=muscle_groups,
            goals=goals,
        )

    # No retrieval AND no workout context → graceful fallback, skip LLM call.
    # If we have workout context, we still call the LLM so it can answer
    # workout-specific questions ("what's my next set?") without retrieval.
    if not chunks and workout is None and not is_tricep_brainrot:
        return ChatResult(
            answer=_FALLBACK_ANSWER,
            citations=[],
            retrieval=[],
            model=_model(),
        )

    key = _openai_api_key()
    model = _model()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # Same brotlicffi-bug avoidance as the embeddings call.
        "Accept-Encoding": "gzip",
    }
    payload = {
        "model": model,
        "messages": _build_messages(
            user_message=cleaned,
            history=history or [],
            chunks=chunks,
            workout=workout,
        ),
        "temperature": 0.85 if is_tricep_brainrot else 0.2,
        "max_tokens": 220,  # hard cap to keep answers short
    }
    timeout = httpx.Timeout(60.0, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        _log.info("ai_provider=OpenAI task=chat model=%s context_chunks=%d", model, len(chunks))
        resp = await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)

    if resp.status_code != 200:
        body = resp.text[:500] if resp.text else "(empty)"
        raise ChatError(f"OpenAI chat HTTP {resp.status_code}: {body}")

    try:
        body_json = resp.json()
    except ValueError as exc:
        raise ChatError("OpenAI returned non-JSON body") from exc

    choices = body_json.get("choices") or []
    if not choices:
        raise ChatError("OpenAI returned no choices")

    answer_text = (choices[0].get("message") or {}).get("content", "").strip()
    if not answer_text:
        answer_text = _FALLBACK_ANSWER

    answer_text = _clamp_citations_in_answer(answer_text, len(chunks))
    answer_text = _strip_coach_echo_tags(answer_text)
    answer_text = _replace_em_dashes(answer_text)
    cites = _citations_from_chunks(chunks)

    return ChatResult(
        answer=answer_text,
        citations=cites,
        retrieval=chunks,
        model=model,
    )


__all__ = [
    "ChatCitation",
    "ChatError",
    "ChatResult",
    "ChatTurn",
    "WorkoutContext",
    "WorkoutExerciseContext",
    "answer",
]
