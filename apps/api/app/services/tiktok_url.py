from __future__ import annotations

import json
from typing import Optional, Tuple
from urllib.parse import quote, urlparse, urlunparse

import httpx

_TIKTOK_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def _strip_host_port(netloc: str) -> str:
    return netloc.lower().split("@")[-1].split(":")[0].rstrip(".")


def is_tiktok_host(host: str) -> bool:
    h = _strip_host_port(host)
    return h == "tiktok.com" or h.endswith(".tiktok.com")


# Share-sheet URLs TikTok hands out need to be expanded before oEmbed will
# accept them. `www.tiktok.com/t/<code>` and `vm.tiktok.com/<code>` both 301
# redirect to the canonical `www.tiktok.com/@<user>/video/<id>` form.
_TIKTOK_SHORTLINK_PATH_PREFIXES = ("/t/",)
_TIKTOK_SHORTLINK_HOSTS = {"vm.tiktok.com", "vt.tiktok.com"}


def _is_tiktok_shortlink(parsed) -> bool:
    host = _strip_host_port(parsed.netloc)
    if host in _TIKTOK_SHORTLINK_HOSTS:
        return True
    # Share-sheet / Copy link uses `m.tiktok.com/t/…`, regional hosts, etc. Those
    # must be expanded via redirects to `@user/video/<id>` for oEmbed + scrapers.
    if is_tiktok_host(host):
        return any(parsed.path.startswith(p) for p in _TIKTOK_SHORTLINK_PATH_PREFIXES)
    return False


def normalize_source_url(raw: str) -> str:
    u = raw.strip()
    if not u:
        raise ValueError("URL is empty")
    parsed = urlparse(u)
    if not parsed.scheme:
        u = "https://" + u
        parsed = urlparse(u)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http or https")
    if not parsed.netloc:
        raise ValueError("URL is missing a host")
    cleaned = urlunparse(
        (
            "https" if parsed.scheme == "http" else parsed.scheme,
            parsed.netloc,
            parsed.path or "/",
            "",  # params
            parsed.query,
            "",  # fragment — drop tracking fragments
        )
    )
    return cleaned


def assert_valid_tiktok_url(raw: str) -> str:
    normalized = normalize_source_url(raw)
    parsed = urlparse(normalized)
    if not is_tiktok_host(parsed.netloc):
        raise ValueError("Not a TikTok URL (host not allowed)")
    if parsed.path in ("", "/") and not parsed.query:
        raise ValueError("Not a valid TikTok content URL")
    return normalized


async def resolve_tiktok_shortlink(url: str) -> str:
    """
    Follow the redirect chain for TikTok share-sheet shortlinks so downstream
    validators (oEmbed) and scrapers see the canonical video URL. No-ops for
    URLs that already look canonical. Falls back to the original URL on any
    network error; the subsequent oEmbed check will surface the real failure.
    """
    parsed = urlparse(url)
    if not _is_tiktok_shortlink(parsed):
        return url

    headers = {
        "User-Agent": _TIKTOK_UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }
    timeout = httpx.Timeout(15.0, connect=10.0)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=timeout, headers=headers
        ) as client:
            # HEAD is enough on TikTok's CDN; we only care about the final URL.
            response = await client.head(url)
    except (httpx.TimeoutException, httpx.RequestError):
        return url

    final_url = str(response.url) if response.url else url
    try:
        return normalize_source_url(final_url)
    except ValueError:
        return url


def _oembed_endpoint(page_url: str) -> str:
    return f"https://www.tiktok.com/oembed?url={quote(page_url, safe='')}"


def _oembed_preview_snapshot(data: dict) -> dict[str, str]:
    """
    Persist a small subset of the oEmbed payload for job previews.
    Official thumbnail_url avoids third-party scrapers returning interstitial art.
    """
    keys = ("thumbnail_url", "title", "author_name", "author_url")
    out: dict[str, str] = {}
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()
    return out


async def verify_video_via_oembed(
    page_url: str,
) -> Tuple[bool, Optional[int], Optional[str], Optional[dict]]:
    """
    Ask TikTok oEmbed whether this URL points to a real, public video.
    Fake or removed IDs get HTTP 400; the watch page alone often still returns 200 HTML.

    On success, returns an oEmbed subset (thumbnail_url, title, ...) for importer UI.
    """
    headers = {
        "User-Agent": _TIKTOK_UA,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.tiktok.com/",
    }
    timeout = httpx.Timeout(15.0, connect=10.0)
    oembed = _oembed_endpoint(page_url)
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout, headers=headers) as client:
            response = await client.get(oembed)
    except httpx.TimeoutException:
        return False, None, "oEmbed request timed out", None
    except httpx.RequestError as exc:
        return False, None, str(exc), None

    status = response.status_code
    if status == 400:
        try:
            payload = response.json()
            msg = payload.get("message", "Something went wrong")
        except (json.JSONDecodeError, ValueError):
            msg = response.text[:200] if response.text else "Bad request"
        return False, status, f"TikTok oEmbed rejected this URL ({msg}).", None

    if status == 403:
        return False, status, "TikTok oEmbed returned 403; try again later.", None

    if status != 200:
        return False, status, f"TikTok oEmbed returned HTTP {status}.", None

    try:
        data = response.json()
    except (json.JSONDecodeError, ValueError):
        return False, status, "TikTok oEmbed returned non-JSON body.", None

    if data.get("type") != "video":
        kind = data.get("type")
        if kind == "rich":
            return (
                False,
                status,
                "Fitfo supports videos only (TikTok videos / Instagram reels). Photo posts aren’t supported yet — coming in the next update.",
                None,
            )
        return False, status, "TikTok oEmbed did not return a video.", None

    preview = _oembed_preview_snapshot(data)
    return True, status, None, preview if preview else None
