"""
Parallel ingestion pipeline for TikTok carousel / slideshow posts.

Carousels are TikTok URLs of the shape ``tiktok.com/@user/photo/<id>`` — a
sequence of static images instead of a video. The video pipeline in
``ingestion_pipeline.py`` cannot handle them (no audio to transcribe, no
frames to sample), so this module runs an image-only flow:

  1. Resolve the TikTok URL via TikWM and pull the carousel image URLs.
  2. Download each image to a tempfile (capped to a sane maximum count).
  3. Upload the images to Supabase Storage so the saved workout can revisit
     the original carousel later.
  4. Feed the image bytes directly to ``frame_ocr.extract_on_screen_text``
     — the same OCR helper the video pipeline uses for sampled frames.
  5. Combine OCR text + caption and run
     ``workout_parser.parse_transcript_to_workout`` with an empty transcript.
  6. Persist the workout, fire the standard "ingestion ready" push, and
     mark the job ``complete``.

The video pipeline (``ingestion_pipeline.py``) is intentionally untouched —
this module is its own end-to-end flow so future changes here cannot regress
the video ingest path.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

from app.services import (
    expo_push,
    frame_ocr,
    supabase_db,
    tikwm,
    workout_parser,
)

_log = logging.getLogger(__name__)

# Hard caps so a malicious or malformed slideshow can't blow our token
# budget or memory. 30 images is well above the typical fitness carousel
# (usually 8-12 slides).
DEFAULT_MAX_IMAGES = 30
# Generous per-image ceiling for any TikTok / IG JPEG. Above this almost
# always indicates a malformed response or a re-encoded video frame, not a
# legitimate slideshow image.
MAX_IMAGE_BYTES = 4 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 30.0


class SlideshowPipelineError(RuntimeError):
    pass


def _bucket() -> str:
    return (os.environ.get("SUPABASE_STORAGE_BUCKET") or "raw-media").strip()


def _max_images() -> int:
    raw = os.environ.get("SLIDESHOW_MAX_IMAGES")
    try:
        value = int(raw) if raw else DEFAULT_MAX_IMAGES
    except ValueError:
        value = DEFAULT_MAX_IMAGES
    return max(1, min(value, DEFAULT_MAX_IMAGES))


def pick_image_urls(tikwm_json: dict[str, Any]) -> list[str]:
    """Extract the carousel's ordered image URLs from a TikWM response.

    TikWM returns slideshow posts with ``data.images: [...]``. Field shape
    varies by quality variant (sometimes a flat list of URLs, sometimes a
    list of dicts), so we accept both forms in declaration order.
    """
    data = tikwm_json.get("data") if isinstance(tikwm_json, dict) else None
    if not isinstance(data, dict):
        raise SlideshowPipelineError("TikWM response is missing the data block")

    images = data.get("images")
    if not isinstance(images, list) or not images:
        raise SlideshowPipelineError("TikWM response has no images for this slideshow")

    urls: list[str] = []
    for entry in images:
        if isinstance(entry, str) and entry.startswith("http"):
            urls.append(entry)
            continue
        if isinstance(entry, dict):
            for key in ("url", "play", "download"):
                value = entry.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    urls.append(value)
                    break
    if not urls:
        raise SlideshowPipelineError("TikWM images list contained no usable URLs")
    return urls


async def _download_image(client: httpx.AsyncClient, url: str, dest: Path) -> None:
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        size = 0
        with dest.open("wb") as f:
            async for chunk in response.aiter_bytes():
                if not chunk:
                    continue
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    raise SlideshowPipelineError(
                        f"Slideshow image exceeded {MAX_IMAGE_BYTES} bytes ({url})"
                    )
                f.write(chunk)
    if not dest.exists() or dest.stat().st_size == 0:
        raise SlideshowPipelineError(f"Downloaded slideshow image is empty ({url})")


async def _download_all(image_urls: list[str], work_dir: Path) -> list[Path]:
    """Concurrently download every image and return their on-disk paths in order."""
    timeout = httpx.Timeout(DOWNLOAD_TIMEOUT_SECONDS, connect=10.0)
    headers = {"User-Agent": "Mozilla/5.0"}
    paths: list[Path] = [
        work_dir / f"image_{index:02d}.jpg" for index in range(len(image_urls))
    ]
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers=headers,
    ) as client:
        await asyncio.gather(
            *(
                _download_image(client, url, path)
                for url, path in zip(image_urls, paths)
            )
        )
    return paths


def _read_bytes(path: Path) -> bytes:
    with path.open("rb") as f:
        return f.read()


def _extract_caption(provider_meta: dict | None) -> str:
    """Mirror the caption pickers used by the video pipeline.

    Slideshows reuse the TikWM caption fields (``data.title`` / ``data.desc``
    / etc.), so the parser sees the same evidence shape regardless of media
    type.
    """
    if not isinstance(provider_meta, dict):
        return ""

    caption = provider_meta.get("caption")
    if isinstance(caption, str) and caption.strip():
        return caption.strip()

    tikwm_payload = provider_meta.get("tikwm")
    if isinstance(tikwm_payload, dict):
        data = tikwm_payload.get("data")
        if isinstance(data, dict):
            for key in ("title", "desc", "caption", "content"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
    return ""


async def _resolve_tiktok_slideshow(
    source_url: str,
) -> tuple[dict[str, Any], list[str]]:
    tikwm_json = await tikwm.resolve_tiktok_url(source_url)
    image_urls = pick_image_urls(tikwm_json)
    return tikwm_json, image_urls


def _configured_parse_model() -> str:
    return (os.environ.get("OPENAI_PARSE_MODEL") or workout_parser.DEFAULT_MODEL).strip()


def _configured_parser_model_label() -> str:
    return f"openai:{_configured_parse_model()}"


async def _run_slideshow_parsing(
    job_id: str,
    *,
    ocr_text: str,
    provider_meta: dict,
) -> None:
    job_row = supabase_db.get_ingestion_job(job_id)
    user_id = (
        str(job_row.get("user_id") or "").strip() if isinstance(job_row, dict) else ""
    )
    if not user_id:
        raise SlideshowPipelineError("Ingestion job is missing an owning user account")

    caption = _extract_caption(provider_meta)
    _log.info(
        "[slideshow:%s] evidence_lengths caption=%s ocr=%s",
        job_id,
        len(caption),
        len(ocr_text or ""),
    )

    plan = await workout_parser.parse_transcript_to_workout(
        "",  # carousels have no audio transcript
        on_screen_text=ocr_text or "",
        caption=caption,
    )
    plan = workout_parser.clean_plan_exercise_names(plan)
    title = plan.get("title")
    supabase_db.create_workout(
        job_id,
        user_id=user_id,
        title=title,
        plan=plan,
        parser_model=_configured_parser_model_label(),
    )

    supabase_db.update_ingestion_job(job_id, status="complete")
    try:
        tokens = supabase_db.list_expo_push_tokens_for_user(user_id)
        source_url = (
            str(job_row.get("source_url") or "").strip()
            if isinstance(job_row, dict)
            else ""
        )
        expo_push.send_ingestion_ready_to_tokens(
            expo_push_tokens=tokens,
            job_id=job_id,
            workout_title=str(title).strip() if title is not None else "",
            source_url=source_url or None,
        )
    except Exception:  # noqa: BLE001 - notification is best-effort
        _log.exception("[slideshow:%s] expo push after ingest complete failed", job_id)


async def _run_tiktok_slideshow(job_id: str, source_url: str) -> None:
    """End-to-end TikTok carousel ingest.

    Status transitions mirror the video flow's vocabulary so the mobile UI
    (which only knows ``pending | fetching | transcribing | parsing |
    complete | failed``) continues to work without any client change. We
    skip the ``transcribing`` state because slideshows have no audio.
    """
    supabase_db.update_ingestion_job(job_id, status="fetching")

    try:
        tikwm_json, image_urls = await _resolve_tiktok_slideshow(source_url)
    except (tikwm.TikWMError, SlideshowPipelineError) as exc:
        raise SlideshowPipelineError(
            f"Failed to resolve TikTok slideshow: {exc}"
        ) from exc

    image_urls = image_urls[: _max_images()]
    _log.info("[slideshow:%s] image_count=%s", job_id, len(image_urls))

    row = supabase_db.get_ingestion_job(job_id)
    provider_meta = supabase_db.merge_provider_meta(
        row.get("provider_meta") if isinstance(row, dict) else None,
        {
            "provider": "tikwm",
            "source_type": "tiktok",
            "media_type": "slideshow",
            "tikwm": tikwm_json,
            "image_urls": image_urls,
            "image_count": len(image_urls),
        },
    )
    supabase_db.update_ingestion_job(job_id, provider_meta=provider_meta)

    bucket = _bucket()
    with tempfile.TemporaryDirectory(prefix=f"slideshow-{job_id}-") as tmp_dir:
        work_dir = Path(tmp_dir)
        try:
            local_paths = await _download_all(image_urls, work_dir)
        except (
            httpx.HTTPStatusError,
            httpx.RequestError,
            SlideshowPipelineError,
        ) as exc:
            raise SlideshowPipelineError(
                f"Failed to download slideshow images: {exc}"
            ) from exc

        # Best-effort upload to storage. Failure here doesn't fail the job —
        # the OCR + parser work is what determines whether the user gets a
        # workout, and they can still view the original on TikTok via
        # source_url if storage hiccups.
        for index, path in enumerate(local_paths):
            storage_path = f"jobs/{job_id}/image_{index:02d}.jpg"
            try:
                supabase_db.upload_bytes_to_storage(
                    bucket=bucket,
                    path=storage_path,
                    content=_read_bytes(path),
                    content_type="image/jpeg",
                    upsert=True,
                )
            except Exception as exc:  # noqa: BLE001 - storage is non-fatal
                _log.warning(
                    "[slideshow:%s] image upload failed index=%s err=%s",
                    job_id,
                    index,
                    exc,
                )

        t_ocr = time.monotonic()
        frames = [_read_bytes(path) for path in local_paths]
        ocr_result = await frame_ocr.extract_on_screen_text(frames)
        _log.info(
            "[slideshow:%s] ocr_elapsed=%.1fs ocr_text_length=%s",
            job_id,
            time.monotonic() - t_ocr,
            ocr_result.char_count,
        )

    extraction_meta: dict[str, object] = {
        "ok": ocr_result.ok,
        "frame_count": ocr_result.frame_count,
        "char_count": ocr_result.char_count,
        "fallback_used": ocr_result.fallback_used,
    }
    if ocr_result.provider:
        extraction_meta["provider"] = ocr_result.provider
    if ocr_result.model:
        extraction_meta["model"] = ocr_result.model
    if ocr_result.error:
        extraction_meta["error"] = ocr_result.error
    if ocr_result.reason:
        extraction_meta["reason"] = ocr_result.reason

    merged_payload: dict[str, object] = {
        "on_screen_text_extraction": extraction_meta,
    }
    if ocr_result.text:
        merged_payload["on_screen_text"] = ocr_result.text

    provider_meta = supabase_db.merge_provider_meta(provider_meta, merged_payload)
    supabase_db.update_ingestion_job(
        job_id,
        provider_meta=provider_meta,
        status="parsing",
    )

    await _run_slideshow_parsing(
        job_id,
        ocr_text=ocr_result.text,
        provider_meta=provider_meta,
    )


async def run_slideshow_job(job_id: str, source_url: str) -> None:
    """Long-running pipeline entry point for TikTok slideshow / carousel posts.

    Mirrors the signature of ``ingestion_pipeline.run_ingestion_job`` so the
    router can swap dispatchers based on the detected media type.
    """
    try:
        await _run_tiktok_slideshow(job_id, source_url)
    except Exception as exc:
        try:
            supabase_db.update_ingestion_job(
                job_id,
                status="failed",
                error=str(exc),
            )
        except Exception:  # noqa: BLE001 - keep the original error visible
            pass
        raise
