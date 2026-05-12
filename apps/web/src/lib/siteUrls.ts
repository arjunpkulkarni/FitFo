/** Canonical origin (no trailing slash). Align Linktree targets with this host. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.fitfo.app";

/** Public App Store numeric id — also used in OG / schema metadata. */
export const APP_STORE_ID = "6762418380";

export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ??
  `https://apps.apple.com/us/app/id${APP_STORE_ID}`;

/**
 * Fallback custom-scheme opener for TikTok / in-app WKWebViews where HTTPS
 * Universal Links fail. Do not expose this bare URL off-site; funnel users
 * through {@link OPEN_APP_WEB_PATH}.
 */
export const FITFO_SCHEME_OPEN_URL = "fitfo://open";

/** Web path backed by Associated Domains + Android App Links. */
export const OPEN_APP_WEB_PATH = "/app";

/** Optional Play Store listing for timed Android redirects on `/app`. */
export const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() ?? "";

/**
 * Developer Team ID (public; baked into Universal Links entitlement and AASA).
 * Override if it ever changes.
 */
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "533W5X82G7";

export const IOS_BUNDLE_ID = "com.fitfo.mobile";
