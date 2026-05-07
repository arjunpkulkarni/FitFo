import type { UserProfile } from "../types";

/**
 * Comma-, newline-, or semicolon-separated lists from env (optional). Example:
 * EXPO_PUBLIC_BILLING_BYPASS_USER_IDS=uuid1,uuid2
 * EXPO_PUBLIC_BILLING_BYPASS_EMAILS=you@company.com,other@company.com
 * EXPO_PUBLIC_BILLING_BYPASS_PHONES=+15551234567,5551234567
 */
function parseCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  const normalized = raw.replace(/\n/g, ",").replace(/\r/g, ",").replace(/;/g, ",");
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Built-in allowlist for internal / support accounts (always bypass paywall). */
const DEFAULT_BYPASS_EMAILS = ["support@fitfo.app"];

const bypassUserIds = new Set(parseCsv(process.env.EXPO_PUBLIC_BILLING_BYPASS_USER_IDS));

/** Founders / team — profile UUIDs from Supabase (Arjun has two profiles). */
const HARDCODED_BILLING_BYPASS_USER_IDS = new Set<string>([
  "9dfd253a-19c3-4500-9967-a710fc9ae21d", // Nirv Nag
  // "6b8c2e2d-184c-49a4-9962-d091afb31ebd", // Arjun (email account)
  // "7e188dc1-80fc-4628-bf76-d97208a798c0", // Arjun (phone account)
]);

const HARDCODED_BILLING_BYPASS_EMAILS = ["arjunpkulkarni@gmail.com"];

const HARDCODED_BILLING_BYPASS_PHONES = ["+19146597022", "+19147192129"];

const bypassEmails = new Set(
  [
    ...DEFAULT_BYPASS_EMAILS,
    ...parseCsv(process.env.EXPO_PUBLIC_BILLING_BYPASS_EMAILS),
    ...HARDCODED_BILLING_BYPASS_EMAILS,
  ].map((e) => e.toLowerCase()),
);

const bypassPhones = new Set(
  [
    ...parseCsv(process.env.EXPO_PUBLIC_BILLING_BYPASS_PHONES),
    ...HARDCODED_BILLING_BYPASS_PHONES,
  ].map((p) => p.replace(/\s/g, "")),
);

/**
 * When true, the user skips the subscription gate and RevenueCat is not
 * configured for this session (avoids SDK noise for team accounts).
 */
export function hasBillingBypassForUser(profile: UserProfile | null): boolean {
  if (!profile) {
    return false;
  }

  if (
    profile.id &&
    (bypassUserIds.has(profile.id) || HARDCODED_BILLING_BYPASS_USER_IDS.has(profile.id))
  ) {
    return true;
  }

  const email = profile.email?.trim().toLowerCase();
  if (email && bypassEmails.has(email)) {
    return true;
  }

  const phone = profile.phone?.replace(/\s/g, "") ?? "";
  if (phone && bypassPhones.has(phone)) {
    return true;
  }

  return false;
}
