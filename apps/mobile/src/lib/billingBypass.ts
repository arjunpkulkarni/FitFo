import type { UserProfile } from "../types";

/**
 * Client-side billing bypass allowlist.
 *
 * Currently disabled: all client-side allowlists (hardcoded UUIDs, emails,
 * phones, env-driven CSVs) are intentionally turned off. The only paths that
 * grant Pro without an App Store / Google Play purchase are:
 *
 *   1. `profile.fitfo_pro_bypass === true` (server-side allowlist), checked
 *      separately in `App.tsx` and `useRevenueCat.ts`.
 *   2. An active `pro` entitlement on the RevenueCat customer info.
 *
 * Keeping this exported (rather than deleting the file) preserves the import
 * sites in `App.tsx` and `useRevenueCat.ts` so no refactor is needed when we
 * re-enable a client allowlist later.
 */
export function hasBillingBypassForUser(_profile: UserProfile | null): boolean {
  return false;
}
