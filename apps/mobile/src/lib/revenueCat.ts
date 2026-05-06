import Constants, { ExecutionEnvironment } from "expo-constants";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { Platform } from "react-native";

export const FITFO_PRO_ENTITLEMENT = "premium";
export const REVENUECAT_OFFERING_ID = "default";

export const REVENUECAT_PRODUCT_IDS = {
  monthly: "monthly",
  yearly: "yearly",
} as const;

let configuredUserId: string | null = null;

/**
 * RevenueCat Paywalls / Customer Center need native modules. Expo Go and web
 * run in "Preview" mode and call into a web path that expects `document`,
 * which spams errors if we present the paywall.
 */
export function isRevenueCatNativePaywallSupported(): boolean {
  if (Platform.OS === "web") {
    return false;
  }
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

function readExtraKey(name: "revenueCatAppleApiKey" | "revenueCatGoogleApiKey"): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const v = extra?.[name];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * RevenueCat public SDK key for this platform (set at build time via env / app.config extra).
 * iOS TestFlight and App Store builds must use the **App Store** key from the RevenueCat
 * dashboard (`appl_...`). Sandbox `test_...` keys trigger a native "Wrong API Key" exit.
 */
export function getRevenueCatSdkApiKey(): string {
  if (Platform.OS === "android") {
    return (
      readExtraKey("revenueCatGoogleApiKey") ||
      (process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? "").trim()
    );
  }
  return (
    readExtraKey("revenueCatAppleApiKey") ||
    (process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ?? "").trim()
  );
}

function asErrorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" ? (error as Record<string, unknown>) : null;
}

export function getRevenueCatErrorMessage(
  error: unknown,
  fallback = "RevenueCat request failed.",
) {
  const record = asErrorRecord(error);
  const message = record?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function isRevenueCatUserCancelled(error: unknown) {
  const record = asErrorRecord(error);
  return record?.userCancelled === true || record?.code === "PURCHASE_CANCELLED";
}

/**
 * True when this binary has a RevenueCat public SDK key suitable for this build.
 * Missing key: skip the SDK (no throws). Release + `test_` key: skip to avoid
 * RevenueCat's native forced exit — use an `appl_`/`goog_` key for store builds.
 */
export function isRevenueCatSdkAvailable(): boolean {
  const apiKey = getRevenueCatSdkApiKey();
  if (!apiKey) {
    return false;
  }
  if (!__DEV__ && apiKey.toLowerCase().startsWith("test_")) {
    return false;
  }
  return true;
}

export async function configureRevenueCat(userId: string) {
  await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

  if (!isRevenueCatSdkAvailable()) {
    return;
  }

  if (configuredUserId === userId) {
    return;
  }

  const apiKey = getRevenueCatSdkApiKey();

  if (configuredUserId) {
    await Purchases.logIn(userId);
  } else {
    Purchases.configure({
      apiKey,
      appUserID: userId,
    });
  }

  configuredUserId = userId;
}

export async function logOutRevenueCat() {
  if (!configuredUserId) {
    return;
  }

  configuredUserId = null;
  await Purchases.logOut();
}

export function hasFitfoPro(customerInfo: CustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active[FITFO_PRO_ENTITLEMENT]);
}

export async function getCustomerInfo() {
  return Purchases.getCustomerInfo();
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? offerings.all[REVENUECAT_OFFERING_ID] ?? null;
}

export function getPackageByProductId(
  offering: PurchasesOffering,
  productId: string,
): PurchasesPackage | null {
  return (
    offering.availablePackages.find(
      (availablePackage) =>
        availablePackage.product.identifier === productId ||
        availablePackage.identifier === productId,
    ) ?? null
  );
}

export function getAnnualPackage(offering: PurchasesOffering): PurchasesPackage | null {
  return (
    offering.annual ??
    offering.availablePackages.find(
      (availablePackage) =>
        availablePackage.packageType === Purchases.PACKAGE_TYPE.ANNUAL ||
        availablePackage.identifier === "$rc_annual" ||
        availablePackage.identifier === "annual" ||
        availablePackage.product.subscriptionPeriod === "P1Y" ||
        availablePackage.product.identifier === REVENUECAT_PRODUCT_IDS.yearly,
    ) ??
    null
  );
}

export function getMonthlyPackage(offering: PurchasesOffering): PurchasesPackage | null {
  return (
    offering.monthly ??
    offering.availablePackages.find(
      (availablePackage) =>
        availablePackage.packageType === Purchases.PACKAGE_TYPE.MONTHLY ||
        availablePackage.identifier === "$rc_monthly" ||
        availablePackage.identifier === "monthly" ||
        availablePackage.product.subscriptionPeriod === "P1M" ||
        availablePackage.product.identifier === REVENUECAT_PRODUCT_IDS.monthly,
    ) ??
    null
  );
}

export async function getPaywallPackages() {
  const offering = await getCurrentOffering();
  return {
    offering,
    annualPackage: offering ? getAnnualPackage(offering) : null,
    monthlyPackage: offering ? getMonthlyPackage(offering) : null,
  };
}

export async function purchasePackage(packageToPurchase: PurchasesPackage) {
  try {
    const result = await Purchases.purchasePackage(packageToPurchase);
    return {
      customerInfo: result.customerInfo,
      hasAccess: hasFitfoPro(result.customerInfo),
      cancelled: false,
    };
  } catch (error) {
    if (isRevenueCatUserCancelled(error)) {
      return {
        customerInfo: null,
        hasAccess: false,
        cancelled: true,
      };
    }

    throw error;
  }
}

export async function purchaseProductId(productId: string) {
  const offering = await getCurrentOffering();
  if (!offering) {
    throw new Error("No RevenueCat offering is configured.");
  }

  const packageToPurchase = getPackageByProductId(offering, productId);
  if (!packageToPurchase) {
    throw new Error(`RevenueCat product is not available: ${productId}`);
  }

  return purchasePackage(packageToPurchase);
}

export async function restoreRevenueCatPurchases() {
  if (!isRevenueCatSdkAvailable()) {
    return {
      customerInfo: null,
      hasAccess: false,
    };
  }
  const customerInfo = await Purchases.restorePurchases();
  return {
    customerInfo,
    hasAccess: hasFitfoPro(customerInfo),
  };
}

export async function presentFitfoPaywallIfNeeded() {
  if (!isRevenueCatSdkAvailable()) {
    return {
      result: PAYWALL_RESULT.NOT_PRESENTED,
      customerInfo: null,
      hasAccess: false,
      purchased: false,
    };
  }

  const customerInfo = await Purchases.getCustomerInfo();

  if (!isRevenueCatNativePaywallSupported()) {
    return {
      result: PAYWALL_RESULT.NOT_PRESENTED,
      customerInfo,
      hasAccess: hasFitfoPro(customerInfo),
      purchased: false,
    };
  }

  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: FITFO_PRO_ENTITLEMENT,
  });
  const latestInfo = await Purchases.getCustomerInfo();

  return {
    result,
    customerInfo: latestInfo,
    hasAccess: hasFitfoPro(latestInfo),
    purchased:
      result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED,
  };
}

export async function presentRevenueCatCustomerCenter() {
  if (!isRevenueCatNativePaywallSupported() || !isRevenueCatSdkAvailable()) {
    return;
  }
  await RevenueCatUI.presentCustomerCenter();
}
