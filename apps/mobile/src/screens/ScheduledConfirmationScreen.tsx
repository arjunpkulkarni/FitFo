import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { formatScheduleDateAndTime } from "../lib/scheduleTime";
import { getTheme, type ThemeMode } from "../theme";

interface ScheduledConfirmationScreenProps {
  title: string;
  scheduledFor: string;
  scheduledTimeMinutes: number;
  origin: "share" | "manual";
  onDismiss: () => void;
  themeMode?: ThemeMode;
}

const SHARE_LINES = [
  "Scheduled. Now get back to scrolling, king.",
  "Workout parked. Enjoy your brainrot.",
  "Locked in. Back to the For You page with you.",
  "Saved for later. Your thumb earned this.",
  "Pipeline clean. Go watch 12 more reels, champ.",
  "Imported. Now finish that doomscroll session in peace.",
];

const MANUAL_LINES = [
  "You're locked in. Dismiss this and go touch grass.",
  "Saved. No excuses when the reminder pops.",
  "It's in the books. Go hydrate or whatever.",
  "Done. Future-you is already mad at you.",
];

function pickLine(origin: "share" | "manual"): string {
  const bank = origin === "share" ? SHARE_LINES : MANUAL_LINES;
  return bank[Math.floor(Math.random() * bank.length)];
}

export function ScheduledConfirmationScreen({
  title,
  scheduledFor,
  scheduledTimeMinutes,
  origin,
  onDismiss,
  themeMode = "dark",
}: ScheduledConfirmationScreenProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  const punchline = useMemo(() => pickLine(origin), [origin]);
  const scheduledLabel = useMemo(
    () => formatScheduleDateAndTime(scheduledFor, scheduledTimeMinutes),
    [scheduledFor, scheduledTimeMinutes],
  );

  const checkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(checkScale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      onDismiss();
    }, 4500);

    return () => clearTimeout(timeout);
  }, [checkScale, contentOpacity, onDismiss]);

  return (
    <Pressable onPress={onDismiss} style={styles.container}>
      <Animated.View
        style={[
          styles.checkShell,
          {
            transform: [{ scale: checkScale }],
          },
        ]}
      >
        <Ionicons color={theme.colors.surface} name="checkmark" size={56} />
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
        <Text style={styles.eyebrow}>You&apos;re locked in</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.scheduled}>Scheduled for {scheduledLabel}</Text>
        <Text style={styles.punchline}>{punchline}</Text>
        <Text style={styles.dismiss}>Tap anywhere to dismiss</Text>
      </Animated.View>
    </Pressable>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      gap: 24,
    },
    checkShell: {
      height: 120,
      width: 120,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.primary,
    },
    content: {
      alignItems: "center",
      gap: 10,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.6,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 32,
      fontFamily: "ClashDisplay-Semibold",
      fontWeight: "800",
      letterSpacing: -1,
      textAlign: "center",
    },
    scheduled: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    punchline: {
      marginTop: 8,
      color: theme.colors.textPrimary,
      fontSize: 17,
      lineHeight: 24,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
      textAlign: "center",
      paddingHorizontal: 6,
    },
    dismiss: {
      marginTop: 18,
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
  });
