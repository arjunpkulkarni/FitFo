/**
 * Trial cancellation feedback collection.
 *
 * Posts the user's reason for canceling to a Google Apps Script Web App
 * (the URL is in ``EXPO_PUBLIC_CANCEL_FEEDBACK_URL``) which appends a row to
 * a Google Sheet. We fire-and-forget on a short timeout so that the user's
 * "submit and continue to cancellation" tap is never blocked by a slow
 * webhook — Apple's guideline is to not gate cancellation on side-effects.
 *
 * Design notes:
 * - We intentionally talk to the webhook directly from the device instead of
 *   routing through the Fitfo API. The webhook URL + shared secret are
 *   public-ish (anyone with both can append rows) but the Sheet is private
 *   to the team. For a low-volume internal feedback channel this trade is
 *   fine; if abuse becomes a problem, swap in a server endpoint.
 * - The Apps Script writer must accept the JSON keys produced by
 *   ``buildCancelFeedbackPayload``.
 */

import { Platform } from "react-native";

const FEEDBACK_URL = process.env.EXPO_PUBLIC_CANCEL_FEEDBACK_URL ?? "";
// Must match the SECRET constant in the Apps Script that owns the Sheet.
// Kept hardcoded (not env) on purpose: the value isn't a real secret since
// the URL is already in the bundle — it just stops random scanners from
// scribbling into the Sheet.
const FEEDBACK_SHARED_SECRET = "fitfo_cancel_feedback_v1";

// Network timeout for the webhook call. Apps Script can be slow on cold
// starts; we cap it to keep the cancel flow responsive.
const FEEDBACK_TIMEOUT_MS = 4_000;

export const CANCEL_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "didnt_understand_app", label: "Didn't understand the app" },
  { id: "bugs_or_issues", label: "Bugs or issues" },
  { id: "didnt_need_it", label: "Didn't need it" },
  { id: "missing_features", label: "Missing features" },
  { id: "just_testing", label: "Just testing" },
  { id: "other", label: "Other" },
] as const;

export type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];

export interface CancelFeedbackPayload {
  reason: CancelReasonId;
  reason_label: string;
  free_text: string;
  user_id: string | null;
  email: string | null;
  username: string | null;
  platform: "ios" | "android" | "web";
  app_version: string | null;
}

export interface SubmitCancelFeedbackOptions {
  reason: CancelReasonId;
  freeText: string;
  user: {
    id: string | null;
    email?: string | null;
    username?: string | null;
  };
  appVersion?: string | null;
}

function reasonLabel(reason: CancelReasonId): string {
  const match = CANCEL_REASONS.find((entry) => entry.id === reason);
  return match?.label ?? reason;
}

export function buildCancelFeedbackPayload(
  options: SubmitCancelFeedbackOptions,
): CancelFeedbackPayload {
  return {
    reason: options.reason,
    reason_label: reasonLabel(options.reason),
    free_text: options.freeText.trim(),
    user_id: options.user.id,
    email: options.user.email ?? null,
    username: options.user.username ?? null,
    platform:
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web",
    app_version: options.appVersion ?? null,
  };
}

/**
 * Post the cancellation reason to the Google Apps Script webhook. Resolves
 * to ``true`` when the webhook returns ``{ok: true}``. Never throws — the
 * caller proceeds to Apple Subscriptions regardless of the outcome.
 */
export async function submitCancelFeedback(
  options: SubmitCancelFeedbackOptions,
): Promise<boolean> {
  if (!FEEDBACK_URL) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS);
  try {
    const response = await fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: FEEDBACK_SHARED_SECRET,
        ...buildCancelFeedbackPayload(options),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean }
      | null;
    return Boolean(json?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
