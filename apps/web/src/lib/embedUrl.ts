/**
 * Validates https URLs embedded in trusted internal pages (still avoid `javascript:`).
 */
export function isHttpsUrl(raw: string | undefined | null): raw is string {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isPosthogEmbedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "posthog.com" || host.endsWith(".posthog.com");
  } catch {
    return false;
  }
}
