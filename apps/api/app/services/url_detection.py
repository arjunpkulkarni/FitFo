from __future__ import annotations

from typing import Literal, Tuple
from urllib.parse import urlparse

from app.services.tiktok_url import (
    assert_valid_tiktok_url,
    is_tiktok_host,
    normalize_source_url,
)

SourceType = Literal["tiktok", "instagram"]


def _strip_host_port(netloc: str) -> str:
    return netloc.lower().split("@")[-1].split(":")[0].rstrip(".")


def is_instagram_host(host: str) -> bool:
    h = _strip_host_port(host)
    return h in ("instagram.com", "ddinstagram.com") or h.endswith(".instagram.com")


# Only reel-style paths are accepted. Profile URLs like /natgeo are rejected
# because the Apify scraper would otherwise pull the N newest reels.
#
# Note: `/p/` is Instagram's post permalink, which is often used for photo
# carousels. Fitfo currently supports videos only, so we treat `/p/` as
# unsupported (handled explicitly in `assert_valid_instagram_reel_url` below).
_REEL_PATH_PREFIXES = ("/reel/", "/reels/", "/tv/")

# TikTok carousel / slideshow posts use `/photo/<id>` (occasionally `/photos/`)
# in the canonical path. We use this segment match — not a startswith — because
# the canonical TikTok URL always begins with `/@username/` before the type
# segment.
_TIKTOK_SLIDESHOW_PATH_SEGMENTS = ("/photo/", "/photos/")


def _is_reel_path(path: str) -> bool:
    normalized = path if path.startswith("/") else f"/{path}"
    return any(normalized.startswith(prefix) for prefix in _REEL_PATH_PREFIXES)


def is_tiktok_slideshow_url(url: str) -> bool:
    """True if `url` is a TikTok carousel / slideshow post.

    Used by the router to dispatch image-only posts to
    ``slideshow_pipeline.run_slideshow_job`` instead of the video pipeline,
    which can't handle them. Callers should resolve any TikTok shortlinks
    first so the path segment is canonical (e.g. ``/@user/photo/<id>``
    rather than ``vm.tiktok.com/<code>``).
    """
    try:
        normalized = normalize_source_url(url)
    except ValueError:
        return False
    parsed = urlparse(normalized)
    if not is_tiktok_host(parsed.netloc):
        return False
    path = parsed.path if parsed.path.startswith("/") else f"/{parsed.path}"
    return any(segment in path for segment in _TIKTOK_SLIDESHOW_PATH_SEGMENTS)


def detect_source(url: str) -> SourceType | None:
    try:
        normalized = normalize_source_url(url)
    except ValueError:
        return None
    parsed = urlparse(normalized)
    if is_tiktok_host(parsed.netloc):
        return "tiktok"
    if is_instagram_host(parsed.netloc):
        return "instagram"
    return None


def assert_valid_instagram_reel_url(raw: str) -> str:
    normalized = normalize_source_url(raw)
    parsed = urlparse(normalized)
    if not is_instagram_host(parsed.netloc):
        raise ValueError("Not an Instagram URL (host not allowed)")
    normalized_path = parsed.path if parsed.path.startswith("/") else f"/{parsed.path}"
    if normalized_path.startswith("/p/"):
        raise ValueError(
            "Fitfo supports videos only (TikTok videos / Instagram reels). Photo posts aren’t supported yet — coming in the next update."
        )
    if not _is_reel_path(parsed.path):
        raise ValueError(
            "Paste an Instagram reel URL (e.g. instagram.com/reel/...), not a profile"
        )
    return normalized


def assert_valid_source_url(raw: str) -> Tuple[str, SourceType]:
    """
    Validate a TikTok or Instagram reel URL. Returns (normalized_url, source_type).
    Raises ValueError if the URL is neither a supported TikTok nor Instagram reel link.
    """
    source_type = detect_source(raw)
    if source_type == "tiktok":
        return assert_valid_tiktok_url(raw), "tiktok"
    if source_type == "instagram":
        return assert_valid_instagram_reel_url(raw), "instagram"
    raise ValueError("Paste a TikTok or Instagram reel URL")
