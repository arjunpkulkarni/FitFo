/**
 * Centralised links to legal documents required by Apple App Review.
 *
 * Apple Guideline 3.1.2(c) requires that any screen presenting an
 * auto-renewing subscription expose:
 *   - the subscription title
 *   - subscription length
 *   - subscription price (and per-unit price where appropriate)
 *   - a functional link to the Privacy Policy
 *   - a functional link to the Terms of Use (EULA)
 *
 * Importing from a single module guarantees every paywall surface
 * (TrialExplainer, PaywallScreen, etc.) ships the same canonical URLs.
 */
export const TERMS_URL = "https://www.fitfo.app/terms";
export const PRIVACY_URL = "https://www.fitfo.app/privacy";
