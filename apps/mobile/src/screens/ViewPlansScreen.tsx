import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";

import {
  getCurrentOffering,
  getPackageByProductId,
  isRevenueCatNativePaywallSupported,
  isRevenueCatSdkAvailable,
  REVENUECAT_PRODUCT_IDS,
} from "../lib/revenueCat";
import { getTheme, type ThemeMode } from "../theme";

const PRO_BENEFITS = [
  "Import workouts from TikTok & IG in seconds",
  "Turn videos into structured routines you can actually follow",
  "Track real progress, not a folder of random clips",
  "AI coach guides you through every session",
] as const;

/** Shown when App Store price isn’t loaded yet; replaced by `yearlyPrice` when available. */
const MARKETING_ANNUAL_PRICE_LINE = "$39.99/year";
const MARKETING_ANNUAL_USD = 39.99;
const MARKETING_MONTHLY_PRICE_LINE = "$5.99/month";

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

interface ViewPlansScreenProps {
  error?: string | null;
  isLoading?: boolean;
  onBack: () => void;
  onPurchaseProduct: (productId: string) => Promise<boolean>;
  onRestorePurchases: () => Promise<boolean>;
  onUnlocked: () => void;
  themeMode?: ThemeMode;
}

export function ViewPlansScreen({
  error: parentError,
  isLoading: parentLoading = false,
  onBack,
  onPurchaseProduct,
  onRestorePurchases,
  onUnlocked,
  themeMode = "dark",
}: ViewPlansScreenProps) {
  const posthog = usePostHog();
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  const [yearlyPrice, setYearlyPrice] = useState<string | null>(null);
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null);
  const [yearlyAmount, setYearlyAmount] = useState<number | null>(null);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [offeringLoading, setOfferingLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const sdkOk = isRevenueCatSdkAvailable();
  const nativeOk = isRevenueCatNativePaywallSupported();

  useEffect(() => {
    if (!sdkOk) {
      return;
    }

    let cancelled = false;
    setOfferingLoading(true);

    void (async () => {
      try {
        const offering = await getCurrentOffering();
        if (cancelled || !offering) {
          return;
        }
        const monthlyPkg = getPackageByProductId(
          offering,
          REVENUECAT_PRODUCT_IDS.monthly,
        );
        const yearlyPkg = getPackageByProductId(
          offering,
          REVENUECAT_PRODUCT_IDS.yearly,
        );
        if (cancelled) {
          return;
        }
        const mProduct = monthlyPkg?.product as
          | { priceString?: string; price?: unknown; currencyCode?: string }
          | undefined;
        const yProduct = yearlyPkg?.product as
          | { priceString?: string; price?: unknown; currencyCode?: string }
          | undefined;

        setMonthlyPrice(mProduct?.priceString ?? null);
        setYearlyPrice(yProduct?.priceString ?? null);
        setMonthlyAmount(toPriceNumber(mProduct?.price));
        setYearlyAmount(toPriceNumber(yProduct?.price));
        const cc = mProduct?.currencyCode ?? yProduct?.currencyCode ?? "USD";
        setCurrencyCode(cc);
      } catch {
        if (!cancelled) {
          setMonthlyPrice(null);
          setYearlyPrice(null);
          setMonthlyAmount(null);
          setYearlyAmount(null);
        }
      } finally {
        if (!cancelled) {
          setOfferingLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sdkOk]);

  const marketingMonthlyEquiv = useMemo(
    () => formatMoney(MARKETING_ANNUAL_USD / 12, "USD"),
    [],
  );

  const priceMeta = useMemo(() => {
    const m = monthlyAmount;
    const y = yearlyAmount;
    if (m == null || y == null || m <= 0 || y <= 0) {
      return {
        monthlyEquiv: null as string | null,
        savingsPercent: null as number | null,
      };
    }
    const annualIfMonthly = m * 12;
    if (annualIfMonthly <= y) {
      return { monthlyEquiv: null, savingsPercent: null };
    }
    const perMo = y / 12;
    const pct = Math.round((1 - y / annualIfMonthly) * 100);
    return {
      monthlyEquiv: formatMoney(perMo, currencyCode),
      savingsPercent: Math.max(0, Math.min(99, pct)),
    };
  }, [currencyCode, monthlyAmount, yearlyAmount]);

  const annualMonthlyEquivLine = useMemo(() => {
    if (priceMeta.monthlyEquiv) {
      return priceMeta.monthlyEquiv;
    }
    if (yearlyAmount != null && yearlyAmount > 0) {
      return formatMoney(yearlyAmount / 12, currencyCode);
    }
    return marketingMonthlyEquiv;
  }, [
    currencyCode,
    marketingMonthlyEquiv,
    priceMeta.monthlyEquiv,
    yearlyAmount,
  ]);

  const busy = parentLoading || Boolean(purchasingId);

  const handlePurchase = async (productId: string) => {
    if (busy || !sdkOk) {
      if (!sdkOk) {
        Alert.alert(
          "Subscriptions unavailable",
          nativeOk
            ? "Add your RevenueCat API key to this build to load App Store prices and subscribe."
            : "Use a development or production build to subscribe with Apple. You can still try Restore if you already purchased.",
        );
      }
      return;
    }

    setPurchasingId(productId);
    try {
      const unlocked = await onPurchaseProduct(productId);
      if (unlocked) {
        posthog.capture("subscription_started", { plan: productId });
        onUnlocked();
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
    if (busy || !sdkOk) {
      if (!sdkOk) {
        Alert.alert(
          "Restore unavailable",
          "Connect the subscription SDK in this build, or restore from a TestFlight / App Store install.",
        );
      }
      return;
    }
    setPurchasingId("restore");
    try {
      const ok = await onRestorePurchases();
      if (ok) {
        posthog.capture("subscription_restored");
        onUnlocked();
      } else {
        Alert.alert(
          "No active subscription found",
          "We could not find an active Fitfo Pro subscription on this Apple ID.",
        );
      }
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.topTitle}>Fitfo Pro</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>Turn TikToks into real workouts.</Text>
        <Text style={styles.subhead}>
          Stop saving workouts you never do. Import, structure, and follow them like a program.
        </Text>

        <View style={styles.socialProof}>
          <Ionicons color={theme.colors.primary} name="people" size={16} />
          <Text style={styles.socialProofText}>
            10,000+ workouts imported · Built for lifters who finish what they save
          </Text>
        </View>

        <View style={styles.urgencyStrip}>
          <Ionicons color={theme.colors.primaryLight} name="time-outline" size={18} />
          <Text style={styles.urgencyText}>
            7-day free trial · Cancel anytime · No commitment today
          </Text>
        </View>

        {!sdkOk ? (
          <Text style={styles.hint}>
            Prices load when RevenueCat is configured. Expo Go can preview this screen; checkout
            needs a dev or store build.
          </Text>
        ) : !nativeOk ? (
          <Text style={styles.hint}>
            Apple checkout isn&apos;t available in Expo Go. Open this build in TestFlight or a dev
            client to subscribe.
          </Text>
        ) : null}

        {parentError ? <Text style={styles.errorText}>{parentError}</Text> : null}

        {offeringLoading && sdkOk ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.loadingText}>Loading App Store pricing…</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Pick your plan</Text>

        <View style={styles.plans}>
          <Pressable
            disabled={busy}
            onPress={() => void handlePurchase(REVENUECAT_PRODUCT_IDS.yearly)}
            style={({ pressed }) => [
              styles.planCard,
              styles.planCardFeatured,
              pressed && styles.planCardPressed,
              busy && styles.planCardDisabled,
            ]}
          >
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Ionicons color={theme.colors.primary} name="flame" size={12} />
                <Text style={styles.badgeText}>Best value</Text>
              </View>
              {priceMeta.savingsPercent != null ? (
                <View style={styles.savingsPill}>
                  <Text style={styles.savingsPillText}>
                    Save {priceMeta.savingsPercent}%
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.planName}>Annual</Text>
            <Text style={styles.planPriceLarge}>
              {yearlyPrice ?? MARKETING_ANNUAL_PRICE_LINE}
            </Text>
            <Text style={styles.planPeriodMuted}>Billed once per year</Text>
            <Text style={styles.anchorLine}>
              Just {annualMonthlyEquivLine}/mo equivalent
            </Text>
            {purchasingId === REVENUECAT_PRODUCT_IDS.yearly ? (
              <ActivityIndicator color={theme.colors.surface} style={styles.planSpinner} />
            ) : (
              <View style={styles.planCta}>
                <Text style={styles.planCtaText}>Start free trial</Text>
                <Ionicons color={theme.colors.surface} name="arrow-forward" size={17} />
              </View>
            )}
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={() => void handlePurchase(REVENUECAT_PRODUCT_IDS.monthly)}
            style={({ pressed }) => [
              styles.planCard,
              styles.planCardSecondary,
              pressed && styles.planCardPressed,
              busy && styles.planCardDisabled,
            ]}
          >
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPriceLarge}>
              {monthlyPrice ?? MARKETING_MONTHLY_PRICE_LINE}
            </Text>
            <Text style={styles.planPeriodMuted}>Billed every month · Cancel anytime</Text>
            {purchasingId === REVENUECAT_PRODUCT_IDS.monthly ? (
              <ActivityIndicator color={theme.colors.primary} style={styles.planSpinner} />
            ) : (
              <View style={styles.planCtaSecondary}>
                <Text style={styles.planCtaSecondaryText}>Try monthly</Text>
                <Ionicons color={theme.colors.primary} name="arrow-forward" size={17} />
              </View>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>What you get</Text>

        <View style={styles.featureList}>
          {PRO_BENEFITS.map((line) => (
            <View key={line} style={styles.featureRow}>
              <Ionicons color={theme.colors.primary} name="checkmark-circle" size={20} />
              <Text style={styles.featureText}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          disabled={busy}
          onPress={() => void handleRestore()}
          style={styles.restoreBtn}
        >
          <Ionicons color={theme.colors.primary} name="refresh" size={17} />
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.finePrint}>
          7-day free trial where eligible. After that, your plan renews until you cancel in
          Settings → Apple ID → Subscriptions.
        </Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 4,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    backBtnPressed: {
      opacity: 0.7,
    },
    topTitle: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    topBarSpacer: {
      width: 44,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 36,
      gap: 14,
    },
    headline: {
      color: theme.colors.textPrimary,
      fontSize: 30,
      lineHeight: 34,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -0.9,
    },
    subhead: {
      color: theme.colors.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: "Satoshi-Bold",
      fontWeight: "600",
    },
    socialProof: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.1)" : "rgba(71, 88, 240, 0.08)",
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.22)" : "rgba(71, 88, 240, 0.2)",
    },
    socialProofText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    urgencyStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    urgencyText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      lineHeight: 19,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    sectionLabel: {
      marginTop: 6,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    featureList: {
      gap: 12,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    featureText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Satoshi-Bold",
      fontWeight: "600",
    },
    plans: {
      gap: 16,
    },
    planCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      padding: 22,
      gap: 6,
      ...theme.shadows.softCard,
    },
    planCardFeatured: {
      borderWidth: 2,
      borderColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.7)" : "rgba(71, 88, 240, 0.55)",
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.12)" : "rgba(71, 88, 240, 0.1)",
      ...theme.shadows.primary,
    },
    planCardSecondary: {
      opacity: 0.98,
    },
    planCardPressed: {
      opacity: 0.92,
    },
    planCardDisabled: {
      opacity: 0.55,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 4,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.22)" : "rgba(71, 88, 240, 0.18)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    badgeText: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    savingsPill: {
      backgroundColor:
        theme.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(71, 88, 240, 0.12)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    savingsPillText: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    planName: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginTop: 4,
    },
    planPriceLarge: {
      color: theme.colors.textPrimary,
      fontSize: 32,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    planPeriodMuted: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "600",
    },
    anchorLine: {
      color: theme.colors.primaryLight,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      marginTop: 2,
      marginBottom: 4,
    },
    planSpinner: {
      alignSelf: "flex-start",
      marginTop: 8,
    },
    planCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.primary,
      alignSelf: "stretch",
      paddingVertical: 15,
      borderRadius: 16,
      marginTop: 8,
      ...theme.shadows.primary,
    },
    planCtaText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "900",
    },
    planCtaSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      alignSelf: "stretch",
      paddingVertical: 14,
      borderRadius: 16,
      marginTop: 8,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: "transparent",
    },
    planCtaSecondaryText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "900",
    },
    restoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
    },
    restoreText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    finePrint: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 4,
    },
  });
