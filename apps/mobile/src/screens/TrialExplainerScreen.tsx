import { useEffect, useRef } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";

import { getTheme, type ThemeMode } from "../theme";

interface TrialExplainerScreenProps {
  /** Tapped when the user accepts the explainer; parent advances to paywall. */
  onContinue: () => void;
  themeMode?: ThemeMode;
}

const TRIAL_HIGHLIGHTS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { icon: "barbell-outline", label: "Unlimited workouts imported from TikTok & IG" },
  { icon: "sparkles-outline", label: "AI coach that guides every session" },
  { icon: "trending-up-outline", label: "Track every set, rep, and PR over time" },
];

export function TrialExplainerScreen({
  onContinue,
  themeMode = "dark",
}: TrialExplainerScreenProps) {
  const posthog = usePostHog();
  const tracked = useRef(false);
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  useEffect(() => {
    if (tracked.current) {
      return;
    }
    tracked.current = true;
    posthog.capture("trial_explainer_viewed");
  }, [posthog]);

  return (
    <View style={styles.container}>
      <View style={styles.heroIcon}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={require("../../assets/vector-no-bg.png")}
          style={styles.logo}
        />
      </View>

      <Text style={styles.eyebrow}>Fitfo Pro</Text>
      <Text style={styles.title}>Start your 7-day free trial</Text>
      <Text style={styles.body}>
        Use Fitfo completely free for the next 7 days. Cancel anytime before
        your trial ends and you won&apos;t be charged.
      </Text>

      <View style={styles.benefits}>
        {TRIAL_HIGHLIGHTS.map(({ icon, label }) => (
          <View key={label} style={styles.benefitRow}>
            <View style={styles.benefitIconWrap}>
              <Ionicons color={theme.colors.primary} name={icon} size={18} />
            </View>
            <Text style={styles.benefitText}>{label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue to subscription options"
        onPress={() => {
          posthog.capture("trial_explainer_continue");
          onContinue();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed ? styles.primaryButtonPressed : null,
        ]}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
        <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
      </Pressable>

      <Text style={styles.finePrint}>
        Payments are processed by Apple. You can cancel or manage your
        subscription any time from Settings → Apple ID → Subscriptions.
      </Text>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      paddingHorizontal: 28,
      gap: 18,
    },
    heroIcon: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    logo: {
      width: 80,
      height: 80,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 32,
      lineHeight: 36,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: -1.1,
      maxWidth: 340,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      textAlign: "center",
      maxWidth: 340,
    },
    benefits: {
      width: "100%",
      maxWidth: 360,
      marginTop: 6,
      gap: 12,
    },
    benefitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    benefitIconWrap: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.16)"
          : "rgba(71, 88, 240, 0.12)",
    },
    benefitText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    primaryButton: {
      marginTop: 8,
      alignSelf: "stretch",
      maxWidth: 360,
      minHeight: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    primaryButtonPressed: {
      opacity: 0.9,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    finePrint: {
      maxWidth: 340,
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 4,
    },
  });
