from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.routers.deps import require_profile_id
from app.schemas.ingest import IngestCheckResponse, IngestRequest
from app.services import (
    ingestion_pipeline,
    slideshow_pipeline,
    supabase_db,
    tiktok_url,
    url_detection,
)

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestCheckResponse)
async def ingest_video(
    body: IngestRequest,
    background: BackgroundTasks,
    profile_id: str = Depends(require_profile_id),
) -> IngestCheckResponse:
    """
    Accept a TikTok or Instagram reel URL. Validates the URL shape, runs a
    cheap reachability probe for TikTok via oEmbed, inserts a pending
    ingestion job, and kicks off the background pipeline.
    """
    try:
        normalized, source_type = url_detection.assert_valid_source_url(body.source_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    provider_meta: dict = {"source_type": source_type}
    http_status: int | None = None
    # Tracks which background pipeline should run for this job. The video
    # ingest path lives in `ingestion_pipeline.run_ingestion_job`; TikTok
    # carousels (image-only posts) go through `slideshow_pipeline.run_slideshow_job`
    # instead. Detected once below so the job-creation branch can dispatch
    # without re-parsing the URL.
    media_type: str = "video"

    if source_type == "tiktok":
        # Share-sheet handoffs (iOS Share Extension / Android ACTION_SEND) give us
        # `tiktok.com/t/<code>` or `vm.tiktok.com/<code>` shortlinks. oEmbed only
        # accepts canonical `@user/video/<id>` URLs, so resolve the redirect first.
        normalized = await tiktok_url.resolve_tiktok_shortlink(normalized)

        if url_detection.is_tiktok_slideshow_url(normalized):
            # Carousel posts (`/@user/photo/<id>`) cannot be verified via oEmbed
            # — TikTok returns `type: "rich"` which our video-only verifier
            # treats as an error. Skip oEmbed and route to the slideshow
            # pipeline; TikWM will validate reachability when it resolves the
            # post for image extraction.
            media_type = "slideshow"
            provider_meta["media_type"] = "slideshow"
            provider_meta["oembed_skipped_reason"] = "tiktok_slideshow"
        else:
            embed_ok, http_status, err, oembed_preview = (
                await tiktok_url.verify_video_via_oembed(normalized)
            )
            if not embed_ok:
                return IngestCheckResponse(
                    ok=False,
                    source_url=body.source_url.strip(),
                    normalized_url=normalized,
                    format_ok=True,
                    reachable=False,
                    http_status=http_status,
                    error=err,
                    job_id=None,
                )
            provider_meta["oembed_verified"] = True
            provider_meta["oembed_http_status"] = http_status
            if oembed_preview:
                provider_meta["tiktok_oembed"] = oembed_preview
    else:
        # Instagram reels have no free reachability probe we can rely on.
        # The Apify scraper will surface unreachable URLs during the pipeline.
        provider_meta["instagram_reachability_check"] = "deferred_to_apify"

    try:
        row = supabase_db.create_ingestion_job(
            normalized,
            provider_meta=provider_meta,
            user_id=profile_id,
        )
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create ingestion job: {exc}",
        ) from exc

    job_id = UUID(row["id"]) if row.get("id") else None
    if job_id is not None:
        if media_type == "slideshow":
            background.add_task(
                slideshow_pipeline.run_slideshow_job,
                str(job_id),
                normalized,
            )
        else:
            background.add_task(
                ingestion_pipeline.run_ingestion_job,
                str(job_id),
                normalized,
            )
    return IngestCheckResponse(
        ok=True,
        source_url=body.source_url.strip(),
        normalized_url=normalized,
        format_ok=True,
        reachable=True,
        http_status=http_status,
        error=None,
        job_id=job_id,
    )
