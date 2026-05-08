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


def _is_reel_path(path: str) -> bool:
    normalized = path if path.startswith("/") else f"/{path}"
    return any(normalized.startswith(prefix) for prefix in _REEL_PATH_PREFIXES)


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
