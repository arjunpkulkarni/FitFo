import { useEffect, useRef } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";

import { PRIVACY_URL, TERMS_URL } from "../lib/legal";
import { getTheme, type ThemeMode } from "../theme";

interface TrialExplainerScreenProps {
  /** Tapped when the user accepts the explainer; parent advances to paywall. */
  onContinue: () => void;
  themeMode?: ThemeMode;
}

const TRIAL_TIMELINE: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  marker: string;
  title: string;
  body: string;
}> = [
  {
    icon: "lock-open-outline",
    marker: "Today",
    title: "Full access to Fitfo Pro, completely free.",
    body: "Add your payment method to unlock the app. You won't be charged a cent for the next 7 days.",
  },
  {
    icon: "notifications-outline",
    marker: "Day 5",
    title: "We'll remind you before you're charged.",
    body: "Apple sends a heads-up so the trial never sneaks up on you.",
  },
  {
    icon: "card-outline",
    marker: "Day 7",
    title: "Trial ends. Subscription begins.",
    body: "Cancel anytime in the first 7 days from Settings → Apple ID → Subscriptions and you won't be charged.",
  },
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

      <Text style={styles.eyebrow}>Fitfo Pro · Required</Text>
      <Text style={styles.title}>7 days completely free.</Text>
      <Text style={styles.body}>
        Fitfo is a paid app. Try every feature completely free for 7 days —
        payment method required upfront so your access is uninterrupted when
        the trial ends.
      </Text>

      <View style={styles.benefits}>
        {TRIAL_TIMELINE.map(({ icon, marker, title, body }) => (
          <View key={marker} style={styles.timelineRow}>
            <View style={styles.timelineIconWrap}>
              <Ionicons color={theme.colors.primary} name={icon} size={18} />
            </View>
            <View style={styles.timelineTextWrap}>
              <Text style={styles.timelineMarker}>{marker}</Text>
              <Text style={styles.timelineTitle}>{title}</Text>
              <Text style={styles.timelineBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See plans and start your free trial"
        onPress={() => {
          posthog.capture("trial_explainer_continue");
          onContinue();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed ? styles.primaryButtonPressed : null,
        ]}
      >
        <Text style={styles.primaryButtonText}>See plans</Text>
        <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
      </Pressable>

      <Text style={styles.finePrint}>
        Fitfo Pro is an auto-renewing subscription billed monthly or annually
        through your Apple ID. Subscriptions renew until cancelled at least 24
        hours before the end of the current period. Manage anytime in Settings
        → Apple ID → Subscriptions.
      </Text>

      <View style={styles.legalRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open Terms of Use (EULA)"
          hitSlop={6}
          onPress={() => void Linking.openURL(TERMS_URL)}
          style={styles.legalBtn}
        >
          <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
        </Pressable>
        <Text style={styles.legalSep}>·</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open Privacy Policy"
          hitSlop={6}
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          style={styles.legalBtn}
        >
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
      </View>
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
      width: 50,
      height: 50,
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
      gap: 10,
    },
    timelineRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    timelineIconWrap: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      marginTop: 2,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.16)"
          : "rgba(71, 88, 240, 0.12)",
    },
    timelineTextWrap: {
      flex: 1,
      gap: 2,
    },
    timelineMarker: {
      color: theme.colors.primary,
      fontSize: 10.5,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    timelineTitle: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    timelineBody: {
      color: theme.colors.textSecondary,
      fontSize: 12.5,
      lineHeight: 17,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
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
    legalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    legalBtn: {
      paddingVertical: 4,
    },
    legalLink: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    legalSep: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
  });
