"""
Frame-level OCR for workout videos. Samples frames about once per second
from a downloaded MP4 using ffmpeg, then asks a vision-capable LLM to read any
on-screen text. The returned string is fed into the workout parser alongside
the audio transcript and caption, so videos with only on-screen text (no
narration) can still produce a structured workout.

Kept intentionally optional:
- If OCR is disabled or no provider is configured, extraction returns an empty
  result and the pipeline continues with transcript/caption.
- If ffmpeg/ffprobe/OpenAI requests fail, extraction returns structured
  metadata describing the soft failure instead of tanking the import.
"""

from __future__ import annotations

import base64
import logging
import math
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

from app.services import openai_retry


class FrameOCRError(RuntimeError):
    pass


ProviderName = Literal["openai"]

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_VISION_MODEL = "gpt-4.1-mini"
DEFAULT_FRAME_COUNT = 80
DEFAULT_FRAME_INTERVAL_SECONDS = 1.0
VISION_FRAME_BATCH_SIZE = 8
SCENE_CHANGE_THRESHOLD = 0.35
MAX_SCENE_FRAMES = 20

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class OCRExtractionResult:
    text: str
    ok: bool
    provider: ProviderName | None
    model: str | None
    frame_count: int
    char_count: int
    fallback_used: bool
    error: str | None = None
    reason: str | None = None


def _failure(reason: str, frame_count: int = 0, error: str | None = None) -> OCRExtractionResult:
    return OCRExtractionResult(
        text="",
        ok=False,
        provider=None,
        model=None,
        frame_count=frame_count,
        char_count=0,
        fallback_used=False,
        reason=reason,
        error=error,
    )


def _clean_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = value.strip()
    if not cleaned or cleaned.upper() == "NONE":
        return ""
    return cleaned


def _openai_api_key() -> str:
    return (os.environ.get("OPENAI_API_KEY") or "").strip()


def _openai_model() -> str:
    return (os.environ.get("OPENAI_VISION_MODEL") or DEFAULT_OPENAI_VISION_MODEL).strip()


def configured_provider_priority() -> list[ProviderName]:
    return ["openai"]


def is_provider_configured(provider: ProviderName) -> bool:
    return bool(_openai_api_key())


def is_enabled() -> bool:
    """OCR is opt-in via env. Feature flag must be enabled and OpenAI configured."""
    if (os.environ.get("ENABLE_FRAME_OCR") or "1").strip() == "0":
        return False
    return bool(_openai_api_key())


def _video_duration_seconds(video_path: Path) -> float:
    """Best-effort duration probe via ffprobe. Returns 0.0 if unavailable."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nokey=1:noprint_wrappers=1",
        str(video_path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return 0.0
    if proc.returncode != 0:
        return 0.0
    try:
        return max(0.0, float((proc.stdout or "").strip()))
    except ValueError:
        return 0.0


def sample_frames(video_path: Path, count: int = DEFAULT_FRAME_COUNT) -> list[bytes]:
    """
    Extract JPEG frames about once per second and return their raw bytes.
    `count` is a safety cap, not a spacing target. Silently returns [] if
    ffmpeg fails for any reason.
    """
    if count <= 0 or not video_path.exists():
        return []

    duration = _video_duration_seconds(video_path)
    if duration <= 0:
        return []

    frames: list[bytes] = []
    output_dir = video_path.parent / "frames"
    output_dir.mkdir(exist_ok=True)

    interval = DEFAULT_FRAME_INTERVAL_SECONDS
    frame_count = min(count, max(1, math.ceil(duration / interval)))
    start = min(0.5, duration / 2)

    for i in range(frame_count):
        position = min(duration, start + (i * interval))
        out_path = output_dir / f"frame_{i:02d}.jpg"
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{position:.2f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            "-vf",
            "scale=512:-2",
            str(out_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if proc.returncode != 0:
            continue
        if out_path.exists() and out_path.stat().st_size > 0:
            frames.append(out_path.read_bytes())

    return frames


def sample_frames_by_scene_change(
    video_path: Path,
    *,
    threshold: float = SCENE_CHANGE_THRESHOLD,
    max_frames: int = MAX_SCENE_FRAMES,
) -> list[bytes]:
    """
    Extract frames at scene boundaries using ffmpeg's built-in scene detector.
    Works well for workout videos that cut between exercise slides. Falls back
    to an empty list so callers can try even sampling instead.
    """
    if not video_path.exists():
        return []

    output_dir = video_path.parent / "frames_scene"
    output_dir.mkdir(exist_ok=True)
    out_pattern = str(output_dir / "scene_%04d.jpg")

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        f"select='gt(scene,{threshold})',scale=512:-2",
        "-vsync",
        "vfr",
        "-q:v",
        "4",
        "-frames:v",
        str(max_frames),
        out_pattern,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=60)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    if proc.returncode != 0:
        return []

    frames: list[bytes] = []
    for path in sorted(output_dir.glob("scene_*.jpg")):
        if path.stat().st_size > 0:
            frames.append(path.read_bytes())
    return frames


VISION_SYSTEM_PROMPT = (
    "You are transcribing the on-screen text of a short fitness video. "
    "You will be given a handful of frames sampled from the video. Output "
    "ONLY the on-screen text you can read in those frames, in the order the "
    "frames appear, one piece of text per line. Preserve set/rep notation "
    "exactly as written (e.g. '3x10', '4 sets', 'AMRAP', 'RDL 4x8'). Do not "
    "describe the scene, the athlete, or anything that isn't literal text. "
    "If there is no readable text, output the single word NONE."
)


def _build_user_content(frames: list[bytes]) -> list[dict]:
    content: list[dict] = [
        {"type": "text", "text": "Read the on-screen text from these frames."}
    ]
    for frame_bytes in frames:
        encoded = base64.b64encode(frame_bytes).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            }
        )
    return content


def _extract_message_text(raw: object) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        text_parts: list[str] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
        return "\n".join(text_parts)
    return ""


def _dedupe_ocr_text(text: str) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.upper() == "NONE":
            continue
        normalized = " ".join(line.lower().split())
        if normalized in seen:
            continue
        seen.add(normalized)
        lines.append(line)
    return "\n".join(lines)


async def _request_vision_ocr(
    *,
    api_key: str,
    model: str,
    frames: list[bytes],
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_content(frames)},
        ],
        "temperature": 0,
        "max_tokens": 1500,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(60.0, connect=15.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:

            async def _do_post() -> httpx.Response:
                return await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)

            resp = await openai_retry.post_with_retries(
                _do_post,
                log_label=f"task=ocr model={model}",
            )
    except httpx.RequestError as exc:
        raise FrameOCRError(str(exc)) from exc

    if resp.status_code != 200:
        body = resp.text[:300] if resp.text else "(empty)"
        raise FrameOCRError(f"HTTP {resp.status_code}: {body}")

    try:
        resp_json = resp.json()
    except ValueError as exc:
        raise FrameOCRError("Vision provider returned invalid JSON") from exc

    choices = resp_json.get("choices") or []
    if not choices:
        raise FrameOCRError("Vision provider returned no choices")

    raw = (choices[0].get("message") or {}).get("content")
    return _clean_text(_extract_message_text(raw))


async def _extract_with_provider(
    provider: ProviderName,
    frames: list[bytes],
) -> tuple[str, str]:
    key = _openai_api_key()
    if not key:
        raise FrameOCRError("OPENAI_API_KEY is not set")
    model = _openai_model()
    text_parts: list[str] = []
    _log.info(
        "ai_provider=OpenAI task=ocr model=%s sampled_frame_count=%s",
        model,
        len(frames),
    )
    for start in range(0, len(frames), VISION_FRAME_BATCH_SIZE):
        batch = frames[start : start + VISION_FRAME_BATCH_SIZE]
        text = await _request_vision_ocr(
            api_key=key,
            model=model,
            frames=batch,
        )
        if text:
            text_parts.append(text)
    text = _dedupe_ocr_text("\n".join(text_parts))
    return text, model


async def extract_on_screen_text(frames: list[bytes]) -> OCRExtractionResult:
    """
    Run OpenAI OCR over the sampled frames.
    Returns structured metadata describing which provider, if any, succeeded.
    """
    frame_count = len(frames)
    if frame_count == 0:
        return _failure("no_frames")

    if (os.environ.get("ENABLE_FRAME_OCR") or "1").strip() == "0":
        return _failure("disabled", frame_count)

    if not _openai_api_key():
        return _failure("no_provider_configured", frame_count)

    try:
        text, model = await _extract_with_provider("openai", frames)
        return OCRExtractionResult(
            text=text,
            ok=bool(text),
            provider="openai",
            model=model,
            frame_count=frame_count,
            char_count=len(text),
            fallback_used=False,
            error=None,
            reason=None if text else "no_text_detected",
        )
    except FrameOCRError as exc:
        return _failure("provider_error", frame_count, f"openai: {exc}")


async def extract_on_screen_text_from_video(
    video_path: Path,
    *,
    count: int = DEFAULT_FRAME_COUNT,
) -> OCRExtractionResult:
    """Convenience wrapper: sample + extract in a single call."""
    if (os.environ.get("ENABLE_FRAME_OCR") or "1").strip() == "0":
        return _failure("disabled")

    if not _openai_api_key():
        return _failure("no_provider_configured")

    frames = sample_frames(video_path, count=count)
    return await extract_on_screen_text(frames)
