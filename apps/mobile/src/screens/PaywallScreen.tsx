import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { PRIVACY_URL, TERMS_URL } from "../lib/legal";
import {
  getPaywallPackages,
  isRevenueCatNativePaywallSupported,
  isRevenueCatSdkAvailable,
} from "../lib/revenueCat";
import { getTheme, type ThemeMode } from "../theme";

const TRIAL_DAYS = 7;

const BENEFITS: ReadonlyArray<string> = [
  "Import workouts from TikTok & Instagram in seconds",
  "Auto-structured routines with sets, reps, and rest",
  "AI coach that guides every session",
  "Track real progress over time, not folders of clips",
];

type PlanKey = "annual" | "monthly";

interface PaywallScreenProps {
  /** Surface RevenueCat fetch / purchase errors above the CTA. */
  error?: string | null;
  isLoading?: boolean;
  /** Optional: opens the native customer center for managing existing subs. */
  onManageSubscription?: () => Promise<boolean>;
  /** Returns `true` when the user gains the `premium` entitlement after purchase. */
  onPurchasePackage: (packageToPurchase: PurchasesPackage) => Promise<boolean>;
  /** Returns `true` when restore promotes the current Apple ID to entitled. */
  onRestorePurchases: () => Promise<boolean>;
  /** Called when entitlements unlock (success or restore). Parent should refresh + route Home. */
  onUnlocked: () => void;
  themeMode?: ThemeMode;
}

function toPriceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatTrialEndDate(addDays: number): string {
  const target = new Date();
  target.setDate(target.getDate() + addDays);
  return target.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function PaywallScreen({
  error,
  isLoading = false,
  onManageSubscription,
  onPurchasePackage,
  onRestorePurchases,
  onUnlocked,
  themeMode = "dark",
}: PaywallScreenProps) {
  const posthog = usePostHog();
  const tracked = useRef(false);
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("annual");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseSucceeded, setPurchaseSucceeded] = useState(false);
  const [offeringLoading, setOfferingLoading] = useState(false);
  const [annualPriceString, setAnnualPriceString] = useState<string | null>(null);
  const [monthlyPriceString, setMonthlyPriceString] = useState<string | null>(null);
  const [annualAmount, setAnnualAmount] = useState<number | null>(null);
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);

  const sdkOk = isRevenueCatSdkAvailable();
  const nativeOk = isRevenueCatNativePaywallSupported();

  useEffect(() => {
    if (tracked.current) {
      return;
    }
    tracked.current = true;
    posthog.capture("paywall_viewed");
  }, [posthog]);

  // Fetch live App Store pricing via RevenueCat. Extracted so the "Retry"
  // button below can re-run it without remounting the screen.
  const loadPackages = useCallback(async () => {
    if (!sdkOk) {
      return;
    }
    setOfferingLoading(true);
    try {
      const {
        annualPackage: nextAnnualPackage,
        monthlyPackage: nextMonthlyPackage,
      } = await getPaywallPackages();

      const aProduct = nextAnnualPackage?.product as
        | { priceString?: string; price?: unknown; currencyCode?: string }
        | undefined;
      const mProduct = nextMonthlyPackage?.product as
        | { priceString?: string; price?: unknown; currencyCode?: string }
        | undefined;

      setAnnualPackage(nextAnnualPackage);
      setMonthlyPackage(nextMonthlyPackage);
      setAnnualPriceString(aProduct?.priceString ?? null);
      setMonthlyPriceString(mProduct?.priceString ?? null);
      setAnnualAmount(toPriceNumber(aProduct?.price));
      setMonthlyAmount(toPriceNumber(mProduct?.price));
      const cc = aProduct?.currencyCode ?? mProduct?.currencyCode ?? "USD";
      setCurrencyCode(cc);
    } catch {
      setAnnualPackage(null);
      setMonthlyPackage(null);
      setAnnualPriceString(null);
      setMonthlyPriceString(null);
      setAnnualAmount(null);
      setMonthlyAmount(null);
    } finally {
      setOfferingLoading(false);
    }
  }, [sdkOk]);

  useEffect(() => {
    void loadPackages().catch(() => undefined);
  }, [loadPackages]);

  const annualMonthlyEquiv = useMemo(() => {
    if (annualAmount == null) {
      return null;
    }
    return formatMoney(annualAmount / 12, currencyCode);
  }, [annualAmount, currencyCode]);

  const savingsPercent = useMemo(() => {
    if (annualAmount == null || monthlyAmount == null) {
      return null;
    }
    if (annualAmount <= 0 || monthlyAmount <= 0) {
      return null;
    }
    const annualIfMonthly = monthlyAmount * 12;
    if (annualIfMonthly <= annualAmount) {
      return null;
    }
    return Math.max(0, Math.min(99, Math.round((1 - annualAmount / annualIfMonthly) * 100)));
  }, [annualAmount, monthlyAmount]);

  // After the fetch settles, true when neither plan resolved to a real package.
  // Drives the "Pricing unavailable" copy + Retry affordance so users (and
  // future-us debugging this screen) immediately know the App Store offering
  // didn't load, instead of staring at marketing fallback numbers.
  const pricingFailedToLoad =
    sdkOk && !offeringLoading && !annualPackage && !monthlyPackage;

  const pricingUnavailableTracked = useRef(false);
  useEffect(() => {
    if (!pricingFailedToLoad || pricingUnavailableTracked.current) {
      return;
    }
    pricingUnavailableTracked.current = true;
    posthog.capture("paywall_pricing_unavailable");
  }, [pricingFailedToLoad, posthog]);

  const trialEndLabel = useMemo(() => formatTrialEndDate(TRIAL_DAYS), []);

  const busy = isLoading || Boolean(purchasingId);

  const selectedPackage =
    selectedPlan === "annual" ? annualPackage : monthlyPackage;
  const selectedPurchaseId = selectedPackage?.identifier ?? selectedPlan;

  const handlePurchase = async () => {
    if (busy) {
      return;
    }
    if (!sdkOk) {
      Alert.alert(
        "Subscriptions unavailable",
        nativeOk
          ? "Add your RevenueCat API key to this build to load App Store prices and subscribe."
          : "Use a development or production build to subscribe with Apple. You can still try Restore if you already purchased.",
      );
      return;
    }

    if (!selectedPackage) {
      Alert.alert(
        "Plan unavailable",
        "We couldn't load that subscription option from the App Store. Please try again in a moment.",
      );
      return;
    }

    setPurchasingId(selectedPurchaseId);
    try {
      const unlocked = await onPurchasePackage(selectedPackage);
      if (unlocked) {
        posthog.capture("subscription_started", {
          plan: selectedPlan,
          package_id: selectedPackage.identifier,
          product_id: selectedPackage.product.identifier,
        });
        setPurchaseSucceeded(true);
      }
    } catch {
      Alert.alert(
        "Purchase failed",
        "Something went wrong. Please try again or use Restore purchases.",
      );
    } finally {
      setPurchasingId(null);
    }
  };

  const handleRestore = async () => {
    if (busy) {
      return;
    }
    setPurchasingId("restore");
    try {
      const unlocked = await onRestorePurchases();
      if (unlocked) {
        posthog.capture("subscription_restored");
        setPurchaseSucceeded(true);
        return;
      }
      Alert.alert(
        "No active subscription found",
        "We couldn't find an active Fitfo Pro subscription on this Apple ID.",
      );
    } catch {
      Alert.alert(
        "Restore failed",
        "We couldn't restore purchases right now. Please try again.",
      );
    } finally {
      setPurchasingId(null);
    }
  };

  const handleManage = async () => {
    if (!onManageSubscription || busy) {
      return;
    }
    setPurchasingId("manage");
    try {
      const opened = await onManageSubscription();
      if (!opened) {
        Alert.alert(
          "Subscription management unavailable",
          "Please try again in a moment.",
        );
      }
    } finally {
      setPurchasingId(null);
    }
  };

  const ctaLabel = (() => {
    if (!selectedPackage) {
      if (offeringLoading) {
        return "Loading App Store pricing…";
      }
      return "Pricing unavailable";
    }
    if (selectedPlan === "annual") {
      return "Try 7 days completely free";
    }
    return monthlyPriceString
      ? `Subscribe · ${monthlyPriceString}/month`
      : "Subscribe";
  })();

  const ctaSubLabel = (() => {
    if (!selectedPackage) {
      return null;
    }
    if (selectedPlan === "annual") {
      return annualPriceString
        ? `Then ${annualPriceString}/year on ${trialEndLabel}`
        : null;
    }
    return "Renews monthly until cancelled";
  })();

  if (purchaseSucceeded) {
    return (
      <View style={styles.successRoot}>
        <View style={styles.successIconWrap}>
          <Ionicons
            color={theme.colors.primary}
            name="checkmark-circle"
            size={88}
          />
        </View>
        <Text style={styles.successEyebrow}>You&apos;re in</Text>
        <Text style={styles.successTitle}>Welcome to Fitfo.</Text>
        <Text style={styles.successBody}>
          {selectedPlan === "annual"
            ? `Your 7 days completely free have started. Cancel anytime before ${trialEndLabel} and you won't be charged a cent.`
            : "Your subscription is active. Let's get to work."}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started with Fitfo"
          onPress={() => {
            posthog.capture("paywall_welcome_continue");
            onUnlocked();
          }}
          style={({ pressed }) => [
            styles.cta,
            styles.successCta,
            pressed ? styles.ctaPressed : null,
          ]}
        >
          <Text style={styles.ctaText}>Get started</Text>
          <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.root}
    >
      <View style={styles.headerBlock}>
        <View style={styles.heroIcon}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require("../../assets/vector-no-bg.png")}
            style={styles.logo}
          />
        </View>
        <Text style={styles.eyebrow}>Fitfo Pro</Text>
        <Text style={styles.title}>Unlock Fitfo</Text>
        <Text style={styles.subtitle}>
          Turn TikToks into structured workouts you actually train.
        </Text>
      </View>

      <View style={styles.benefitList}>
        {BENEFITS.map((line) => (
          <View key={line} style={styles.benefitRow}>
            <Ionicons color={theme.colors.primary} name="checkmark-circle" size={18} />
            <Text style={styles.benefitText}>{line}</Text>
          </View>
        ))}
      </View>

      {!sdkOk ? (
        <Text style={styles.hint}>
          Apple checkout needs a development or App Store build. You can preview
          this screen in Expo Go.
        </Text>
      ) : !nativeOk ? (
        <Text style={styles.hint}>
          Apple checkout isn&apos;t available in Expo Go. Open this build in
          TestFlight or a dev client to subscribe.
        </Text>
      ) : null}

      {offeringLoading && sdkOk ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading App Store pricing…</Text>
        </View>
      ) : null}

      {pricingFailedToLoad ? (
        <View style={styles.pricingErrorBlock}>
          <Ionicons
            color={theme.colors.error}
            name="alert-circle-outline"
            size={16}
          />
          <Text style={styles.pricingErrorText}>
            Pricing unavailable. The App Store didn&apos;t return your
            subscription options. Try again, or contact support if this keeps
            happening.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading App Store pricing"
            disabled={offeringLoading}
            onPress={() => {
              void loadPackages();
            }}
            style={({ pressed }) => [
              styles.pricingRetryButton,
              pressed ? styles.pricingRetryButtonPressed : null,
            ]}
          >
            <Ionicons
              color={theme.colors.primary}
              name="refresh"
              size={14}
            />
            <Text style={styles.pricingRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.plans}>
        {/* Annual — preselected, "Most Popular / Save N%". */}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: selectedPlan === "annual" }}
          accessibilityLabel="Select annual plan"
          disabled={busy}
          onPress={() => setSelectedPlan("annual")}
          style={({ pressed }) => [
            styles.planCard,
            selectedPlan === "annual" ? styles.planCardSelected : null,
            pressed ? styles.planCardPressed : null,
          ]}
        >
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons color={theme.colors.primary} name="flame" size={12} />
              <Text style={styles.badgeText}>Most Popular</Text>
            </View>
            {savingsPercent != null ? (
              <View style={styles.savingsPill}>
                <Text style={styles.savingsPillText}>
                  Save {savingsPercent}%
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.planRow}>
            <View style={styles.radioOuter}>
              {selectedPlan === "annual" ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.planTextBlock}>
              <Text style={styles.planName}>Annual</Text>
              {annualPackage && annualMonthlyEquiv && annualPriceString ? (
                <>
                  <Text style={styles.planPriceLarge}>
                    {annualMonthlyEquiv}
                    <Text style={styles.planPricePeriod}>/month</Text>
                  </Text>
                  <Text style={styles.planSubLabel}>
                    {annualPriceString} billed annually
                  </Text>
                </>
              ) : offeringLoading ? (
                <Text style={styles.planSubLabel}>Loading App Store price…</Text>
              ) : (
                <>
                  <Text style={[styles.planPriceLarge, styles.planPriceUnavailable]}>
                    —
                  </Text>
                  <Text style={[styles.planSubLabel, styles.planSubLabelUnavailable]}>
                    Pricing unavailable
                  </Text>
                </>
              )}
            </View>
          </View>
        </Pressable>

        {/* Monthly — no intro offer in spec, just the recurring price. */}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: selectedPlan === "monthly" }}
          accessibilityLabel="Select monthly plan"
          disabled={busy}
          onPress={() => setSelectedPlan("monthly")}
          style={({ pressed }) => [
            styles.planCard,
            selectedPlan === "monthly" ? styles.planCardSelected : null,
            pressed ? styles.planCardPressed : null,
          ]}
        >
          <View style={styles.planRow}>
            <View style={styles.radioOuter}>
              {selectedPlan === "monthly" ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.planTextBlock}>
              <Text style={styles.planName}>Monthly</Text>
              {monthlyPackage && monthlyPriceString ? (
                <>
                  <Text style={styles.planPriceLarge}>
                    {monthlyPriceString}
                    <Text style={styles.planPricePeriod}>/month</Text>
                  </Text>
                  <Text style={styles.planSubLabel}>Billed every month</Text>
                </>
              ) : offeringLoading ? (
                <Text style={styles.planSubLabel}>Loading App Store price…</Text>
              ) : (
                <>
                  <Text style={[styles.planPriceLarge, styles.planPriceUnavailable]}>
                    —
                  </Text>
                  <Text style={[styles.planSubLabel, styles.planSubLabelUnavailable]}>
                    Pricing unavailable
                  </Text>
                </>
              )}
            </View>
          </View>
        </Pressable>
      </View>

      {/* Apple Guideline 3.1.2(a) trial disclosure: length, post-trial price, billing date. */}
      {selectedPackage ? (
        <View style={styles.trialBlock}>
          {selectedPlan === "annual" ? (
            <>
              <Text style={styles.trialPrimary}>
                {TRIAL_DAYS} days completely free
                {annualPriceString ? `, then ${annualPriceString}/year.` : "."}
              </Text>
              <Text style={styles.trialSecondary}>
                You won&apos;t be charged a cent during your {TRIAL_DAYS}-day
                free trial. Cancel anytime before it ends.
              </Text>
              <Text style={styles.trialSecondary}>
                Free trial ends {trialEndLabel} (your billing date).
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.trialPrimary}>
                {monthlyPriceString
                  ? `${monthlyPriceString}/month, billed by Apple. Cancel anytime.`
                  : "Billed monthly by Apple. Cancel anytime."}
              </Text>
              <Text style={styles.trialSecondary}>
                Renews automatically until you cancel from Settings → Apple ID →
                Subscriptions.
              </Text>
            </>
          )}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        disabled={busy || !selectedPackage}
        onPress={handlePurchase}
        style={({ pressed }) => [
          styles.cta,
          busy || !selectedPackage ? styles.ctaDisabled : null,
          pressed ? styles.ctaPressed : null,
        ]}
      >
        {purchasingId === selectedPurchaseId ? (
          <ActivityIndicator color={theme.colors.surface} size="small" />
        ) : (
          <>
            <Text style={styles.ctaText}>{ctaLabel}</Text>
            {selectedPackage ? (
              <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
            ) : null}
          </>
        )}
      </Pressable>
      {ctaSubLabel ? (
        <Text style={styles.ctaSubLabel}>{ctaSubLabel}</Text>
      ) : null}

      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="link"
          disabled={busy}
          hitSlop={6}
          onPress={handleRestore}
          style={styles.footerBtn}
        >
          {purchasingId === "restore" ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : (
            <>
              <Ionicons color={theme.colors.primary} name="refresh" size={14} />
              <Text style={styles.footerLink}>Restore Purchases</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.footerSep}>·</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open Terms of Service"
          hitSlop={6}
          onPress={() => void Linking.openURL(TERMS_URL)}
          style={styles.footerBtn}
        >
          <Text style={styles.footerLink}>Terms of Service</Text>
        </Pressable>
        <Text style={styles.footerSep}>·</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open Privacy Policy"
          hitSlop={6}
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          style={styles.footerBtn}
        >
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Pressable>
      </View>

      {onManageSubscription ? (
        <Pressable
          disabled={busy}
          onPress={handleManage}
          style={styles.linkButton}
        >
          <Text style={styles.linkButtonText}>Manage subscription</Text>
        </Pressable>
      ) : null}

      <Text style={styles.finePrint}>
        Payment will be charged to your Apple ID at confirmation of purchase.
        Subscriptions automatically renew unless cancelled at least 24 hours
        before the end of the current period. Manage in Settings → Apple ID →
        Subscriptions.
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 40,
      gap: 14,
    },
    headerBlock: {
      alignItems: "center",
      gap: 8,
    },
    heroIcon: {
      width: 72,
      height: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: {
      width: 60,
      height: 60,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.8,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 30,
      lineHeight: 34,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -1,
      textAlign: "center",
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "600",
      textAlign: "center",
      maxWidth: 320,
    },
    benefitList: {
      gap: 8,
      marginTop: 4,
    },
    benefitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    benefitText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "600",
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    plans: {
      gap: 12,
      marginTop: 4,
    },
    planCard: {
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      paddingVertical: 16,
      paddingHorizontal: 16,
      gap: 8,
    },
    planCardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.10)"
          : "rgba(71, 88, 240, 0.08)",
      ...theme.shadows.primary,
    },
    planCardPressed: {
      opacity: 0.92,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.22)"
          : "rgba(71, 88, 240, 0.18)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: {
      color: theme.colors.primary,
      fontSize: 10.5,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    savingsPill: {
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.10)"
          : "rgba(71, 88, 240, 0.12)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    savingsPillText: {
      color: theme.colors.textPrimary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    planRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    planTextBlock: {
      flex: 1,
      gap: 2,
    },
    planName: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    planPriceLarge: {
      color: theme.colors.textPrimary,
      fontSize: 26,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    planPricePeriod: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    planSubLabel: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    planPriceUnavailable: {
      color: theme.colors.textMuted,
    },
    planSubLabelUnavailable: {
      color: theme.colors.textMuted,
      fontStyle: "italic",
    },
    pricingErrorBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 80, 60, 0.10)"
          : "rgba(255, 80, 60, 0.08)",
      borderWidth: 1,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 80, 60, 0.32)"
          : "rgba(255, 80, 60, 0.24)",
    },
    pricingErrorText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 12.5,
      lineHeight: 17,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    pricingRetryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    pricingRetryButtonPressed: {
      opacity: 0.8,
    },
    pricingRetryText: {
      color: theme.colors.primary,
      fontSize: 12.5,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    trialBlock: {
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.08)"
          : "rgba(71, 88, 240, 0.06)",
      borderWidth: 1,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.22)"
          : "rgba(71, 88, 240, 0.18)",
      marginTop: 4,
    },
    trialPrimary: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    trialSecondary: {
      color: theme.colors.textSecondary,
      fontSize: 12.5,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    cta: {
      marginTop: 6,
      minHeight: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    ctaDisabled: {
      opacity: 0.65,
    },
    ctaPressed: {
      opacity: 0.9,
    },
    ctaText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "900",
    },
    ctaSubLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 6,
    },
    footerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
    },
    footerLink: {
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    footerSep: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    linkButton: {
      paddingVertical: 6,
      alignItems: "center",
    },
    linkButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    finePrint: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 4,
    },
    successRoot: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 28,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    },
    successIconWrap: {
      width: 112,
      height: 112,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.14)"
          : "rgba(71, 88, 240, 0.10)",
      marginBottom: 4,
    },
    successEyebrow: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    successTitle: {
      color: theme.colors.textPrimary,
      fontSize: 34,
      lineHeight: 38,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -1.2,
      textAlign: "center",
      maxWidth: 340,
    },
    successBody: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      textAlign: "center",
      maxWidth: 340,
    },
    successCta: {
      alignSelf: "stretch",
      maxWidth: 360,
      marginTop: 18,
    },
  });
