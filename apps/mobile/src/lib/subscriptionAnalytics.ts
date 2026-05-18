import type { CustomerInfo, PurchasesEntitlementInfo } from "react-native-purchases";

import { posthog } from "./posthog";
import { FITFO_PRO_ENTITLEMENT } from "./revenueCat";
import { getCommonAnalyticsProperties } from "./productAnalytics";

function parseExpMs(ent: PurchasesEntitlementInfo | undefined): number | null {
  if (!ent?.expirationDate) {
    return null;
  }
  const t = Date.parse(ent.expirationDate);
  return Number.isFinite(t) ? t : null;
}

/**
 * Emits subscription lifecycle events when RevenueCat pushes a new CustomerInfo snapshot.
 * Avoids double-counting by diffing against the previous snapshot.
 */
export function reportSubscriptionCustomerInfoDiff(
  prev: CustomerInfo | null,
  next: CustomerInfo,
): void {
  const base = getCommonAnalyticsProperties();
  const pid = FITFO_PRO_ENTITLEMENT;

  const pEnt = prev?.entitlements.active[pid];
  const nEnt = next.entitlements.active[pid];

  const pActive = Boolean(pEnt?.isActive);
  const nActive = Boolean(nEnt?.isActive);
  const pMs = parseExpMs(pEnt);
  const nMs = parseExpMs(nEnt);

  if (pActive && !nActive) {
    posthog.capture("subscription_expired", {
      ...base,
    });
  }

  if (nActive && nMs != null && pMs != null && prev != null && nMs > pMs + 86_400_000) {
    // ~Renewal: expiration moved out by more than a day (handles monthly/annual).
    posthog.capture("subscription_renewed", {
      ...base,
      previous_expiration: pEnt?.expirationDate ?? null,
      new_expiration: nEnt?.expirationDate ?? null,
    });
  }

  const billingNow = Boolean(nEnt?.billingIssueDetectedAt);
  const billingPrev = Boolean(pEnt?.billingIssueDetectedAt);

  if (billingNow && !billingPrev) {
    posthog.capture("billing_issue", {
      ...base,
    });
  }
}
