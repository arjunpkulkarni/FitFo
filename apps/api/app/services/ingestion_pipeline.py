from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from app.services import (
    apify_reel,
    expo_push,
    frame_ocr,
    supabase_db,
    tikwm,
    url_detection,
    whisper,
    workout_parser,
)


_log = logging.getLogger(__name__)


class IngestionPipelineError(RuntimeError):
    pass


def _bucket() -> str:
    return (os.environ.get("SUPABASE_STORAGE_BUCKET") or "raw-media").strip()


async def _download_to_file(url: str, dest: Path) -> None:
    timeout = httpx.Timeout(120.0, connect=15.0)
    headers = {"User-Agent": "Mozilla/5.0"}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in r.aiter_bytes():
                    if chunk:
                        f.write(chunk)
    if not dest.exists() or dest.stat().st_size == 0:
        raise IngestionPipelineError("Downloaded file is empty")


def _run_ffmpeg(cmd: list[str], *, output_path: Path, error_prefix: str) -> None:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise IngestionPipelineError("ffmpeg not found on PATH") from exc
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()[-500:]
        raise IngestionPipelineError(f"{error_prefix}: {tail}")
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise IngestionPipelineError(f"{error_prefix}: output file is empty")


def _extract_audio_ffmpeg(video_path: Path, audio_path: Path) -> None:
    """
    Extract the full video audio track as mono 16kHz mp3 for transcription.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        str(audio_path),
    ]
    _run_ffmpeg(cmd, output_path=audio_path, error_prefix="ffmpeg audio extraction failed")


def has_audio_stream(video_path: Path) -> bool:
    """Return True if the video has at least one audio stream.

    Fails open: returns True when ffprobe is unavailable, times out, or exits
    non-zero so extraction is still attempted rather than silently skipped.
    Only returns False when ffprobe succeeds with zero returncode and empty output.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_type",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True
    if proc.returncode != 0:
        return True
    return bool((proc.stdout or "").strip())


async def _try_audio_transcription(
    job_id: str,
    video_path: Path,
    audio_path: Path,
    provider_meta: dict,
    *,
    log_prefix: str,
    bucket: str,
    video_storage_path: str,
    audio_storage_path: str,
) -> tuple[str | None, dict]:
    """
    Attempt audio detection, extraction, upload, and transcription.
    Does not raise on audio-related failures (missing stream, ffmpeg error, upload
    error, transcription error) — those are caught and recorded in provider_meta.
    Infrastructure failures (Supabase down, etc.) propagate normally, consistent
    with the rest of the pipeline.
    Returns (transcript_text | None, updated_provider_meta).
    transcript_text is None on any non-success path, including when audio was
    successfully uploaded but transcription failed — in that case
    audio_extraction.state is still "audio_present" / ok=True.
    Records audio_extraction.state as one of:
      audio_present | audio_missing | audio_extract_failed_nonfatal
    """
    if not has_audio_stream(video_path):
        _log.info("[%s] audio=audio_missing", log_prefix)
        updated = supabase_db.merge_provider_meta(
            provider_meta,
            {"audio_extraction": {"ok": False, "state": "audio_missing"}},
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=updated)
        return None, updated

    try:
        _extract_audio_ffmpeg(video_path, audio_path)
    except Exception as exc:
        _log.warning("[%s] audio=audio_extract_failed_nonfatal error=%s", log_prefix, exc)
        updated = supabase_db.merge_provider_meta(
            provider_meta,
            {
                "audio_extraction": {
                    "ok": False,
                    "state": "audio_extract_failed_nonfatal",
                    "error": str(exc),
                }
            },
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=updated)
        return None, updated

    try:
        supabase_db.upload_bytes_to_storage(
            bucket=bucket,
            path=audio_storage_path,
            content=_read_bytes(audio_path),
            content_type="audio/mpeg",
            upsert=True,
        )
    except Exception as exc:
        _log.warning("[%s] audio=audio_extract_failed_nonfatal (upload) error=%s", log_prefix, exc)
        updated = supabase_db.merge_provider_meta(
            provider_meta,
            {
                "audio_extraction": {
                    "ok": False,
                    "state": "audio_extract_failed_nonfatal",
                    "error": str(exc),
                }
            },
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=updated)
        return None, updated

    updated = supabase_db.merge_provider_meta(
        provider_meta,
        {
            "audio_extraction": {"ok": True, "state": "audio_present"},
            "transcription_audio_source": "audio",
            "storage": {
                "bucket": bucket,
                "video_path": video_storage_path,
                "audio_path": audio_storage_path,
            },
        },
    )
    supabase_db.update_ingestion_job(job_id, status="transcribing", provider_meta=updated)

    try:
        transcript_text = await _run_transcription(job_id, audio_path)
    except Exception as exc:
        _log.warning("[%s] transcription_failed provider=openai error=%s", log_prefix, exc)
        failed = supabase_db.merge_provider_meta(
            updated,
            {
                "transcription": {
                    "ok": False,
                    "provider": "openai",
                    "model": os.environ.get("OPENAI_TRANSCRIBE_MODEL") or whisper.DEFAULT_MODEL,
                    "error": str(exc),
                }
            },
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=failed)
        return None, failed

    completed = supabase_db.merge_provider_meta(
        updated,
        {
            "transcription": {
                "ok": True,
                "provider": "openai",
                "model": os.environ.get("OPENAI_TRANSCRIBE_MODEL") or whisper.DEFAULT_MODEL,
                "char_count": len(transcript_text or ""),
            }
        },
    )
    supabase_db.update_ingestion_job(job_id, provider_meta=completed)

    _log.info("[%s] audio=audio_present transcript_length=%s", log_prefix, len(transcript_text or ""))
    return transcript_text, completed


def _read_bytes(p: Path) -> bytes:
    return p.read_bytes()


def _merge_preview_poster_into_meta(
    job_id: str,
    *,
    bucket: str,
    video_path: Path,
    provider_meta: dict,
) -> dict:
    """
    Upload a jpeg frame grabbed from local video storage for importer thumbnails.
    Best-effort: failures leave provider_meta unchanged.
    """
    poster_path = video_path.parent / "_fitfo_preview_poster.jpg"
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        "0.5",
        "-i",
        str(video_path),
        "-vf",
        "scale=720:-2",
        "-vframes",
        "1",
        "-q:v",
        "4",
        str(poster_path),
    ]
    try:
        _run_ffmpeg(cmd, output_path=poster_path, error_prefix="ffmpeg poster grab failed")
        supabase_db.upload_bytes_to_storage(
            bucket=bucket,
            path=f"jobs/{job_id}/poster.jpg",
            content=_read_bytes(poster_path),
            content_type="image/jpeg",
            upsert=True,
        )
    except Exception as exc:
        _log.warning("[job:%s] preview_poster_skipped reason=%s", job_id, exc)
        return provider_meta
    return supabase_db.merge_provider_meta(
        provider_meta,
        {
            "preview_poster": {
                "bucket": bucket,
                "path": f"jobs/{job_id}/poster.jpg",
            },
        },
    )


_WHISPER_WEAK_CHARS = 30


def _transcript_is_weak(text: str | None) -> bool:
    """Return True when transcript text is too short to be useful."""
    return len((text or "").strip()) < _WHISPER_WEAK_CHARS


async def _run_transcription(job_id: str, audio_path: Path) -> str:
    """Send the prepared transcription audio to OpenAI and save the transcript."""
    if not audio_path.exists() or audio_path.stat().st_size == 0:
        raise IngestionPipelineError("Audio file missing or empty for transcription")

    result = await whisper.transcribe_file(audio_path)

    text = result.get("text", "")
    segments = result.get("segments")
    language = result.get("language")
    model = result.get("model") or whisper.DEFAULT_MODEL

    _log.info(
        "[job:%s] ai_provider=OpenAI task=transcription model=%s transcript_length=%s",
        job_id,
        model,
        len(text or ""),
    )

    supabase_db.create_transcript(
        job_id,
        text=text,
        segments=segments,
        language=language,
        model=model,
    )

    supabase_db.update_ingestion_job(job_id, status="parsing")
    return text


def _extract_caption_from_provider_meta(provider_meta: dict | None) -> str:
    """
    Pull a human-readable caption out of whichever provider scraped the video.
    Both TikTok (tikwm) and Instagram (apify) stuff caption-ish text into
    provider_meta under different keys; normalize that here so the parser can
    use the caption when the transcript is thin or missing.
    """
    if not isinstance(provider_meta, dict):
        return ""

    # Apify branch stores the caption at the top level of provider_meta.
    caption = provider_meta.get("caption")
    if isinstance(caption, str) and caption.strip():
        return caption.strip()

    # Fallback: instagram actor output is sometimes only under provider_meta.apify
    # before/during early merges — mirror mobile `extractCaption` coverage so the
    # LLM still receives the reel caption for title/workout inference.
    apify = provider_meta.get("apify")
    if isinstance(apify, dict):
        for key in ("caption", "text", "description", "accessibilityCaption"):
            value = apify.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        edge = apify.get("edge_media_to_caption")
        if isinstance(edge, dict):
            edges = edge.get("edges")
            if isinstance(edges, list) and edges:
                first = edges[0]
                if isinstance(first, dict):
                    node = first.get("node")
                    if isinstance(node, dict):
                        text = node.get("text")
                        if isinstance(text, str) and text.strip():
                            return text.strip()

    # TikWM nests everything under provider_meta.tikwm.data.
    tikwm = provider_meta.get("tikwm")
    if isinstance(tikwm, dict):
        data = tikwm.get("data")
        if isinstance(data, dict):
            for key in ("title", "desc", "caption", "content"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

    return ""


def _extract_on_screen_text_from_provider_meta(provider_meta: dict | None) -> str:
    if not isinstance(provider_meta, dict):
        return ""
    value = provider_meta.get("on_screen_text")
    if isinstance(value, str):
        return value.strip()
    return ""


def _count_plan_exercises(plan: dict) -> int:
    count = 0
    for block in plan.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        exercises = block.get("exercises") or []
        if isinstance(exercises, list):
            count += len([item for item in exercises if isinstance(item, dict)])
    return count


def _configured_parse_model() -> str:
    return (os.environ.get("OPENAI_PARSE_MODEL") or workout_parser.DEFAULT_MODEL).strip()


def _configured_parser_model_label() -> str:
    return f"openai:{_configured_parse_model()}"


async def _run_parsing(job_id: str, *, video_path: Path | None = None) -> None:
    """
    Pull transcript + caption + OCR text and send the combined evidence object
    to the parser. Empty evidence is still parsed so the stored workout can
    explicitly record that no exact exercise names were detected.
    """
    try:
        transcript_row = supabase_db.get_transcript_by_job(job_id)
    except Exception:
        transcript_row = {}
    transcript_text = (
        transcript_row.get("text", "") if isinstance(transcript_row, dict) else ""
    )

    job_row = supabase_db.get_ingestion_job(job_id)
    provider_meta = job_row.get("provider_meta") if isinstance(job_row, dict) else None

    caption = _extract_caption_from_provider_meta(provider_meta)
    on_screen_text = _extract_on_screen_text_from_provider_meta(provider_meta)

    _log.info(
        "[job:%s] evidence_lengths caption=%s transcript=%s ocr=%s",
        job_id,
        len(caption),
        len(transcript_text or ""),
        len(on_screen_text),
    )

    plan = await workout_parser.parse_transcript_to_workout(
        transcript_text or "",
        on_screen_text=on_screen_text,
        caption=caption,
    )
    plan = workout_parser.clean_plan_exercise_names(plan)
    user_id = str(job_row.get("user_id") or "").strip() if isinstance(job_row, dict) else ""
    if not user_id:
        raise IngestionPipelineError("Ingestion job is missing an owning user account")

    title = plan.get("title")
    supabase_db.create_workout(
        job_id,
        user_id=user_id,
        title=title,
        plan=plan,
        parser_model=_configured_parser_model_label(),
    )

    exercise_count = _count_plan_exercises(plan)
    parser_reason = plan.get("reason") if isinstance(plan.get("reason"), str) else None
    _log.info(
        "[job:%s] ai_provider=OpenAI task=parsing model=%s final_parsed_exercise_count=%s",
        job_id,
        _configured_parse_model(),
        exercise_count,
    )
    if exercise_count == 0 and parser_reason:
        _log.info("[job:%s] parser_empty_reason=%s", job_id, parser_reason)

    supabase_db.update_ingestion_job(job_id, status="complete")
    try:
        tokens = supabase_db.list_expo_push_tokens_for_user(user_id)
        src = (
            str(job_row.get("source_url") or "").strip()
            if isinstance(job_row, dict)
            else ""
        )
        expo_push.send_ingestion_ready_to_tokens(
            expo_push_tokens=tokens,
            job_id=job_id,
            workout_title=str(title).strip() if title is not None else "",
            source_url=src or None,
        )
    except Exception:
        _log.exception("[job:%s] expo push after ingest complete failed", job_id)


async def _maybe_extract_on_screen_text(
    job_id: str,
    video_path: Path,
    provider_meta: dict | None,
) -> dict | None:
    """
    Best-effort frame-OCR pass. Persists whatever it finds (or whatever error
    it hit) onto provider_meta and returns the updated provider_meta. Never
    raises — on-screen text is strictly additive to the other sources.
    """
    try:
        result = await frame_ocr.extract_on_screen_text_from_video(video_path)
    except Exception as exc:  # noqa: BLE001 - isolate optional feature
        result = frame_ocr.OCRExtractionResult(
            text="",
            ok=False,
            provider=None,
            model=None,
            frame_count=0,
            char_count=0,
            fallback_used=False,
            error=str(exc),
            reason="unexpected_error",
        )

    extraction_meta: dict[str, object] = {
        "ok": result.ok,
        "frame_count": result.frame_count,
        "char_count": result.char_count,
        "fallback_used": result.fallback_used,
    }
    if result.provider:
        extraction_meta["provider"] = result.provider
    if result.model:
        extraction_meta["model"] = result.model
    if result.error:
        extraction_meta["error"] = result.error
    if result.reason:
        extraction_meta["reason"] = result.reason

    merged_payload: dict[str, object] = {
        "on_screen_text_extraction": extraction_meta,
    }
    if result.text:
        merged_payload["on_screen_text"] = result.text

    _log.info(
        "[job:%s] ai_provider=%s task=ocr model=%s sampled_frame_count=%s ocr_text_length=%s",
        job_id,
        "OpenAI" if result.provider == "openai" else "none",
        result.model,
        result.frame_count,
        result.char_count,
    )

    updated = supabase_db.merge_provider_meta(provider_meta, merged_payload)
    supabase_db.update_ingestion_job(job_id, provider_meta=updated)
    return updated


async def _process_downloaded_video(
    job_id: str,
    *,
    video_path: Path,
    audio_path: Path,
    provider_meta: dict,
    log_prefix: str,
) -> None:
    """
    Shared post-download extraction path for TikTok and Instagram.
    Uploads the video, attempts audio transcription, always runs frame OCR,
    then parses caption + transcript + OCR as a single evidence object.
    """
    bucket = _bucket()
    video_storage_path = f"jobs/{job_id}/video.mp4"
    audio_storage_path = f"jobs/{job_id}/audio.mp3"

    supabase_db.upload_bytes_to_storage(
        bucket=bucket,
        path=video_storage_path,
        content=_read_bytes(video_path),
        content_type="video/mp4",
        upsert=True,
    )

    _transcript, provider_meta = await _try_audio_transcription(
        job_id,
        video_path,
        audio_path,
        provider_meta,
        log_prefix=log_prefix,
        bucket=bucket,
        video_storage_path=video_storage_path,
        audio_storage_path=audio_storage_path,
    )

    t_ocr = time.monotonic()
    provider_meta = (
        await _maybe_extract_on_screen_text(job_id, video_path, provider_meta)
    ) or provider_meta
    _log.info("[%s] ocr_elapsed=%.1fs", log_prefix, time.monotonic() - t_ocr)

    await _run_parsing(job_id, video_path=video_path)


async def _run_tiktok_pipeline(job_id: str, source_url: str) -> None:
    """TikTok branch: resolve via TikWM, attempt audio transcription, always run OCR."""
    supabase_db.update_ingestion_job(job_id, status="fetching")

    tikwm_json = await tikwm.resolve_tiktok_url(source_url)
    download_url = tikwm.pick_download_url(tikwm_json)

    row = supabase_db.get_ingestion_job(job_id)
    provider_meta = supabase_db.merge_provider_meta(
        row.get("provider_meta") if isinstance(row, dict) else None,
        {
            "provider": "tikwm",
            "source_type": "tiktok",
            "tikwm": tikwm_json,
            "download_url": download_url,
        },
    )
    supabase_db.update_ingestion_job(job_id, provider_meta=provider_meta)

    with tempfile.TemporaryDirectory(prefix="liftsync_") as d:
        tmp = Path(d)
        video_path = tmp / "video.mp4"
        audio_path = tmp / "audio.mp3"

        await _download_to_file(download_url, video_path)

        provider_meta = supabase_db.merge_provider_meta(
            provider_meta,
            {"downloaded": {"video_bytes": video_path.stat().st_size}},
        )
        bucket = _bucket()
        provider_meta = _merge_preview_poster_into_meta(
            job_id,
            bucket=bucket,
            video_path=video_path,
            provider_meta=provider_meta,
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=provider_meta)

        await _process_downloaded_video(
            job_id,
            video_path=video_path,
            audio_path=audio_path,
            provider_meta=provider_meta,
            log_prefix=f"tiktok:{job_id}",
        )


async def _run_instagram_pipeline(job_id: str, source_url: str) -> None:
    """
    Instagram branch: Apify resolves the CDN video URL. Download, audio extraction,
    OpenAI transcription, and OCR all run locally. Audio failure is non-fatal;
    OCR always runs after download.
    """
    supabase_db.update_ingestion_job(job_id, status="fetching")

    t0 = time.monotonic()
    item = await apify_reel.fetch_reel(source_url)
    _log.info("[instagram:%s] apify_resolve=%.1fs", job_id, time.monotonic() - t0)

    download_url = apify_reel.pick_video_url(item)  # raises ApifyReelError if no URL
    owner_username = apify_reel.pick_owner_username(item)
    owner_full_name = apify_reel.pick_owner_full_name(item)
    caption = apify_reel.pick_caption(item)

    row = supabase_db.get_ingestion_job(job_id)
    provider_meta = supabase_db.merge_provider_meta(
        row.get("provider_meta") if isinstance(row, dict) else None,
        {
            "provider": "apify_instagram_reel",
            "source_type": "instagram",
            "apify": item,
            "download_url": download_url,
            "owner_username": owner_username,
            "owner_full_name": owner_full_name,
            "caption": caption,
        },
    )
    supabase_db.update_ingestion_job(job_id, provider_meta=provider_meta)

    with tempfile.TemporaryDirectory(prefix="liftsync_") as d:
        tmp = Path(d)
        video_path = tmp / "video.mp4"
        audio_path = tmp / "audio.mp3"

        t2 = time.monotonic()
        await _download_to_file(download_url, video_path)
        _log.info("[instagram:%s] video_download=%.1fs", job_id, time.monotonic() - t2)

        provider_meta = supabase_db.merge_provider_meta(
            provider_meta,
            {"downloaded": {"video_bytes": video_path.stat().st_size}},
        )
        supabase_db.update_ingestion_job(job_id, provider_meta=provider_meta)

        t4 = time.monotonic()
        await _process_downloaded_video(
            job_id,
            video_path=video_path,
            audio_path=audio_path,
            provider_meta=provider_meta,
            log_prefix=f"instagram:{job_id}",
        )
        _log.info("[instagram:%s] extraction=%.1fs", job_id, time.monotonic() - t4)


async def run_ingestion_job(job_id: str, source_url: str) -> None:
    """
    Long-running pipeline. Dispatches to TikTok or Instagram based on the URL.
    """
    try:
        source_type = url_detection.detect_source(source_url)
        if source_type == "instagram":
            await _run_instagram_pipeline(job_id, source_url)
        else:
            # Default to TikTok for any URL we didn't identify as Instagram.
            await _run_tiktok_pipeline(job_id, source_url)
    except Exception as exc:
        # Best effort to mark failed (avoid throwing if supabase is down)
        try:
            supabase_db.update_ingestion_job(job_id, status="failed", error=str(exc))
        except Exception:
            pass
        raise
