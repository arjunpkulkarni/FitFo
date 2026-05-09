from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from app.services import openai_retry

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4.1-mini"

_log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a strict workout extractor for short-form fitness videos. You receive \
up to three labeled input sources describing the same video and return \
**valid JSON only** — no markdown, no explanation.

The user message is a JSON evidence object with:
- transcript: what the creator said out loud (may be empty for silent videos)
- on_screen_text: text that appeared on-screen in sampled frames (may be empty)
- caption: the caption / description posted alongside the video (may be empty)

Return a single JSON object with this exact shape:

{
  "title": "<short descriptive title, or null if none of the sources give one>",
  "workout_type": "<strength | cardio | HIIT | flexibility | mobility | mixed | other>",
  "muscle_groups": ["<chest | back | shoulders | arms | legs>", ...],
  "equipment": ["<item>", ...],
  "blocks": [
    {
      "name": "<block or round name if explicitly stated, else null>",
      "exercises": [
        {
          "name": "<exercise name only (no cues/tempo/setup); keep it short and canonical>",
          "sets": <integer, or null if not stated>,
          "reps": <integer, or null if not stated>,
          "duration_sec": <integer, or null if not stated>,
          "rest_sec": <integer, or null if not stated>,
          "notes": "<verbatim cue from the sources (tempo/setup/modifiers like 'do weighted'), or null>"
        }
      ]
    }
  ],
  "notes": "<overall notes only if stated in the sources, else null>",
  "reason": "<why blocks is empty, else null>"
}

Extraction rules (strict):
- Only include information that is literally present in one of the provided \
sources. Treat the three sources as complementary: on-screen text often lists \
exercises/sets/reps when the creator is silent.
- Prefer the transcript when it covers a value; use on-screen text and caption \
to fill gaps (e.g. sets/reps), but only when the filled value is explicitly \
present in the evidence.
- An exercise is eligible only when its exact exercise name appears in the \
caption, transcript, or on-screen text. Do not add exercises based on body \
parts, workout themes, creator intent, common routines, or visual guesswork.
- NEVER invent exercises. Use the literal names as written / spoken.
- NEVER invent sets, reps, duration, or rest. If a value is not stated in any \
source, use null.
- NEVER invent equipment. Only list equipment explicitly mentioned. If none is \
mentioned, return [].
- Preserve the order exercises appear in (transcript order first, then \
on-screen text order for anything not already mentioned).
- Do not combine, split, or rephrase exercises beyond minor capitalization and \
trimming whitespace.
- Exercise names must contain ONLY the exercise name. If sources include extra
  cues/modifiers (tempo, pauses, setup, "do weighted", "each side", etc.),
  put that information in the exercise "notes" field instead of the name.
- workout_type should be chosen conservatively: use "other" if the sources do \
not clearly indicate a category.
- **Title:** When the **caption** (or another source) names the session, day, \
or focus (e.g. "Glutes and abs day", "Leg day", "Push workout"), use that \
as **title** — not the first exercise in the list. Use an exercise name as \
**title** only when no source names the overall workout.
- muscle_groups MUST be a subset of the exact strings \
["chest", "back", "shoulders", "arms", "legs"]. Include every group that is \
meaningfully trained by the extracted exercises (a push day would be \
["chest", "shoulders", "arms"]; a leg day would be ["legs"]). Map exercises \
to groups as follows: chest presses / pushups / flyes -> "chest"; rows / pull-ups \
/ lat pulldowns / deadlifts -> "back"; overhead presses / lateral raises / \
front raises / rear delt work -> "shoulders"; biceps curls / triceps \
extensions / dips / close-grip presses -> "arms"; squats / lunges / leg \
press / hip thrusts / calf raises / glute bridges -> "legs". If the workout \
is purely cardio, mobility, flexibility, or core-only (planks, crunches, \
abs) with no clear match to the five groups, return []. Do not invent \
groups that are not in the allowed list.
- If none of the sources contain exact exercise names, return blocks: [] and \
reason: "No exercise names detected in caption, transcript, or on-screen text."
- If none of the sources contain workout content, return: \
{"title":null,"workout_type":"other","muscle_groups":[],"equipment":[],"blocks":[],"notes":null,"reason":"No exercise names detected in caption, transcript, or on-screen text."}
- Return ONLY the JSON object. No extra text before or after.\
"""


class WorkoutParserError(RuntimeError):
    pass


def _normalize_for_support_check(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _exercise_name_supported(name: object, evidence_text: str) -> bool:
    if not isinstance(name, str) or not name.strip():
        return False
    normalized_name = _normalize_for_support_check(name)
    normalized_evidence = _normalize_for_support_check(evidence_text)
    if not normalized_name or not normalized_evidence:
        return False
    padded_evidence = f" {normalized_evidence} "
    if f" {normalized_name} " in padded_evidence:
        return True
    return normalized_name.replace(" ", "") in normalized_evidence.replace(" ", "")


def _openai_api_key() -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise WorkoutParserError("OPENAI_API_KEY is not set")
    return key


_CUE_KEYWORDS = (
    "tempo",
    "pause",
    "slow",
    "controlled",
    "strict",
    "eccentric",
    "concentric",
    "isometric",
    "hold",
    "amrap",
    "to failure",
    "failure",
    "weighted",
    "bodyweight",
    "bw",
    "banded",
    "superset",
    "drop set",
    "dropset",
    "each side",
    "per side",
    "rpe",
    "rir",
)


def _looks_like_cue(text: str) -> bool:
    lowered = (text or "").strip().lower()
    if not lowered:
        return False
    if lowered.startswith(("do ", "with ", "no ", "slow ", "pause ")):
        return True
    return any(keyword in lowered for keyword in _CUE_KEYWORDS)


def _append_notes(existing: object, extra: str) -> str:
    extra_clean = (extra or "").strip()
    if not extra_clean:
        return str(existing).strip() if isinstance(existing, str) else ""
    if isinstance(existing, str) and existing.strip():
        return f"{existing.strip()} • {extra_clean}"
    return extra_clean


def _split_name_and_cue(name: str) -> tuple[str, str | None]:
    """
    Conservative import-time cleanup: move obvious cue/modifier text out of
    exercise names and into notes.
    Examples:
      "Pull-ups (do weighted)" -> ("Pull-ups", "do weighted")
      "Hip thrust - pause at top" -> ("Hip thrust", "pause at top")
    """
    raw = (name or "").strip()
    if not raw:
        return "", None

    paren = re.match(r"^(?P<base>.+?)\s*\((?P<cue>[^)]{2,80})\)\s*$", raw)
    if paren:
        base = (paren.group("base") or "").strip()
        cue = (paren.group("cue") or "").strip()
        if base and cue and _looks_like_cue(cue):
            return base, cue

    for sep in (" — ", " - ", ": "):
        if sep in raw:
            left, right = raw.split(sep, 1)
            base = left.strip()
            cue = right.strip()
            if base and cue and len(cue) <= 80 and _looks_like_cue(cue):
                return base, cue
            break

    return raw, None


def clean_plan_exercise_names(plan: dict[str, Any]) -> dict[str, Any]:
    """
    Ensure exercise.name contains only the exercise name.
    Intended for imported plans only (LLM output can be inconsistent).
    """
    blocks = plan.get("blocks")
    if not isinstance(blocks, list):
        return plan

    changed = False
    cleaned_blocks: list[dict[str, Any]] = []
    for block in blocks:
        if not isinstance(block, dict):
            cleaned_blocks.append(block)
            continue
        exercises = block.get("exercises")
        if not isinstance(exercises, list):
            cleaned_blocks.append(block)
            continue

        cleaned_exercises: list[dict[str, Any]] = []
        for exercise in exercises:
            if not isinstance(exercise, dict):
                cleaned_exercises.append(exercise)
                continue
            name = exercise.get("name")
            if not isinstance(name, str):
                cleaned_exercises.append(exercise)
                continue
            base, cue = _split_name_and_cue(name)
            if cue and base and base != name:
                updated = dict(exercise)
                updated["name"] = base
                updated["notes"] = _append_notes(updated.get("notes"), cue) or None
                cleaned_exercises.append(updated)
                changed = True
            else:
                cleaned_exercises.append(exercise)

        if changed:
            updated_block = dict(block)
            updated_block["exercises"] = cleaned_exercises
            cleaned_blocks.append(updated_block)
        else:
            cleaned_blocks.append(block)

    if not changed:
        return plan
    updated_plan = dict(plan)
    updated_plan["blocks"] = cleaned_blocks
    return updated_plan


def _parse_model(model: str) -> str:
    if model == DEFAULT_MODEL:
        return (os.environ.get("OPENAI_PARSE_MODEL") or DEFAULT_MODEL).strip()
    return (model or DEFAULT_MODEL).strip()


def _build_user_message(
    transcript_text: str,
    *,
    on_screen_text: str = "",
    caption: str = "",
) -> str:
    """
    Build the evidence object for the parser. Empty sections are still present
    so the model knows what was and was not available.
    """
    evidence = {
        "evidence": {
            "transcript": transcript_text.strip(),
            "on_screen_text": on_screen_text.strip(),
            "caption": caption.strip(),
        }
    }
    return json.dumps(evidence, ensure_ascii=False)


async def parse_transcript_to_workout(
    transcript_text: str,
    *,
    on_screen_text: str = "",
    caption: str = "",
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """
    Send the combined transcript + on-screen text + caption to the LLM and
    return the parsed workout plan dict. Any of the three sources can be empty
    as long as at least one contains workout content.
    Raises WorkoutParserError on API or validation failure.
    """
    key = _openai_api_key()
    resolved_model = _parse_model(model)
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    user_message = _build_user_message(
        transcript_text,
        on_screen_text=on_screen_text,
        caption=caption,
    )
    evidence_text = "\n".join(
        [transcript_text or "", on_screen_text or "", caption or ""]
    )
    payload = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},
    }
    timeout = httpx.Timeout(60.0, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        _log.info("ai_provider=OpenAI task=parsing model=%s", resolved_model)

        async def _do_post() -> httpx.Response:
            return await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)

        try:
            resp = await openai_retry.post_with_retries(
                _do_post,
                log_label=f"task=parsing model={resolved_model}",
            )
        except httpx.RequestError as exc:
            raise WorkoutParserError(f"OpenAI chat network error: {exc}") from exc

    if resp.status_code != 200:
        body = resp.text[:500] if resp.text else "(empty)"
        raise WorkoutParserError(f"OpenAI chat HTTP {resp.status_code}: {body}")

    resp_json = resp.json()
    choices = resp_json.get("choices") or []
    if not choices:
        raise WorkoutParserError("OpenAI returned no choices")

    raw_content = (choices[0].get("message") or {}).get("content", "").strip()

    # Strip markdown fences if the LLM wraps output in ```json ... ```
    if raw_content.startswith("```"):
        lines = raw_content.splitlines()
        # drop first and last ``` lines
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw_content = "\n".join(lines).strip()

    try:
        plan = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise WorkoutParserError(
            f"LLM returned invalid JSON: {exc}\n\nRaw:\n{raw_content[:500]}"
        ) from exc

    if not isinstance(plan, dict):
        raise WorkoutParserError(f"Expected JSON object, got {type(plan).__name__}")

    # Minimal validation: blocks key must exist
    if "blocks" not in plan:
        raise WorkoutParserError(f"Missing 'blocks' key in parsed workout: {list(plan.keys())}")
    if not isinstance(plan.get("blocks"), list):
        raise WorkoutParserError("'blocks' must be a list in parsed workout")
    supported_blocks: list[dict[str, Any]] = []
    for block in plan["blocks"]:
        if not isinstance(block, dict) or not isinstance(block.get("exercises"), list):
            continue
        supported_exercises = [
            exercise
            for exercise in block["exercises"]
            if isinstance(exercise, dict)
            and _exercise_name_supported(exercise.get("name"), evidence_text)
        ]
        if supported_exercises:
            supported_block = dict(block)
            supported_block["exercises"] = supported_exercises
            supported_blocks.append(supported_block)
    plan["blocks"] = supported_blocks
    if not plan["blocks"] and not plan.get("reason"):
        plan["reason"] = "No exercise names detected in caption, transcript, or on-screen text."

    return plan


def build_workout_from_visual_blocks(confirmed_blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build a WorkoutPlan dict from user-confirmed visual analysis blocks.
    Sets/reps are left null because they cannot be determined from video alone.
    Only blocks with segment_type == "exercise" and a non-null exercise_label
    are included.
    """
    exercises = []
    for block in confirmed_blocks:
        label = block.get("exercise_label") or block.get("exercise_key")
        if not label or block.get("segment_type") != "exercise":
            continue
        exercises.append({
            "name": label,
            "sets": None,
            "reps": None,
            "duration_sec": None,
            "rest_sec": None,
            "notes": "Detected visually — confirm sets and reps before training",
        })

    return {
        "title": None,
        "workout_type": "strength",
        "muscle_groups": [],
        "equipment": [],
        "blocks": [{"name": None, "exercises": exercises}],
        "notes": "Created from visual analysis. Review and edit before use.",
    }
