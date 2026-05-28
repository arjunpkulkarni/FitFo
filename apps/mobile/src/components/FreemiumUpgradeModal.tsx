import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getTheme, type ThemeMode } from "../theme";

const FEATURE_ROWS = [
  ["Log workouts & sets", "Unlimited", "Unlimited"],
  ["Build custom routines manually", "check", "check"],
  ["Import workouts from TikTok/Reels", "3 saved max", "Unlimited"],
  ["AI Coach queries", "2 per workout", "Unlimited"],
  ["Schedule workouts", "Per week", "Unlimited"],
  ["Multi-month custom programs", "no", "check"],
  ["Muscle Recovery Map", "no", "check"],
  ["Suggest features / help shape Fitfo", "no", "check"],
] as const;

interface ComparisonTableProps {
  themeMode?: ThemeMode;
}

export function FreemiumComparisonTable({
  themeMode = "dark",
}: ComparisonTableProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  const renderValue = (value: string) => {
    if (value === "check") {
      return <Ionicons color={theme.colors.success} name="checkmark-circle" size={19} />;
    }
    if (value === "no") {
      return <Ionicons color={theme.colors.error} name="close-circle" size={19} />;
    }
    return <Text style={styles.cellText}>{value}</Text>;
  };

  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.headerText, styles.featureCell]}>Feature</Text>
        <Text style={[styles.headerText, styles.planCell]}>Free</Text>
        <Text style={[styles.headerText, styles.planCell]}>Pro</Text>
      </View>
      {FEATURE_ROWS.map(([feature, free, pro]) => (
        <View key={feature} style={styles.row}>
          <Text style={[styles.cellText, styles.featureCell]}>{feature}</Text>
          <View style={styles.planCell}>{renderValue(free)}</View>
          <View style={styles.planCell}>{renderValue(pro)}</View>
        </View>
      ))}
    </View>
  );
}

export function ProUpgradeModal({
  message,
  onClose,
  onUpgrade,
  themeMode = "dark",
  visible,
}: {
  message: string;
  onClose: () => void;
  onUpgrade: () => void;
  themeMode?: ThemeMode;
  visible: boolean;
}) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
            <Ionicons color={theme.colors.textMuted} name="close" size={20} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.iconBubble}>
              <Ionicons color={theme.colors.surface} name="lock-closed" size={22} />
            </View>
            <Text style={styles.eyebrow}>Fitfo Pro</Text>
            <Text style={styles.title}>{message}</Text>
            <Text style={styles.subtitle}>
              Upgrade for unlimited imports, unlimited AI Coach, Recovery Map,
              and goal-based 10-week programs.
            </Text>
            <FreemiumComparisonTable themeMode={themeMode} />
            <Text style={styles.priceLine}>$5.99/mo or $39.99/yr after 7 days free</Text>
            <Pressable onPress={onUpgrade} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Upgrade now</Text>
              <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function FreePlanIntroModal({
  onContinue,
  onUpgrade,
  themeMode = "dark",
  visible,
}: {
  onContinue: () => void;
  onUpgrade: () => void;
  themeMode?: ThemeMode;
  visible: boolean;
}) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onContinue}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.iconBubble}>
              <Ionicons color={theme.colors.surface} name="sparkles" size={22} />
            </View>
            <Text style={styles.eyebrow}>Free Plan</Text>
            <Text style={styles.title}>You're using Fitfo Free.</Text>
            <Text style={styles.subtitle}>
              You still get unlimited workout logging and manual routines. Pro
              unlocks the features that make Fitfo feel automatic.
            </Text>
            <FreemiumComparisonTable themeMode={themeMode} />
            <View style={styles.actionRow}>
              <Pressable onPress={onContinue} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Continue free</Text>
              </Pressable>
              <Pressable onPress={onUpgrade} style={styles.primaryButtonCompact}>
                <Text style={styles.primaryButtonText}>Upgrade</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function ProFreemiumAnnouncementModal({
  onCancelSubscription,
  onContinuePro,
  themeMode = "dark",
  visible,
}: {
  onCancelSubscription: () => void;
  onContinuePro: () => void;
  themeMode?: ThemeMode;
  visible: boolean;
}) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onContinuePro}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.iconBubble}>
              <Ionicons color={theme.colors.surface} name="heart" size={22} />
            </View>
            <Text style={styles.eyebrow}>Fitfo Update</Text>
            <Text style={styles.title}>Fitfo now has Free and Pro.</Text>
            <Text style={styles.subtitle}>
              Thank you for supporting us from the start. Pro subscriptions
              directly fund new features and the team building Fitfo.
            </Text>
            <FreemiumComparisonTable themeMode={themeMode} />
            <View style={styles.actionRow}>
              <Pressable onPress={onCancelSubscription} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel subscription</Text>
              </Pressable>
              <Pressable onPress={onContinuePro} style={styles.primaryButtonCompact}>
                <Text style={styles.primaryButtonText}>Continue Pro</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      backgroundColor: theme.colors.overlay,
    },
    card: {
      width: "100%",
      maxWidth: 430,
      maxHeight: "92%",
      borderRadius: 26,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    closeButton: {
      position: "absolute",
      right: 14,
      top: 14,
      zIndex: 2,
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollContent: {
      padding: 20,
      gap: 13,
    },
    iconBubble: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 24,
      lineHeight: 29,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      paddingRight: 18,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    table: {
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      borderRadius: 16,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      minHeight: 42,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
    },
    headerRow: {
      borderTopWidth: 0,
      backgroundColor: theme.colors.surfaceMuted,
    },
    featureCell: {
      flex: 1.35,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    planCell: {
      flex: 0.8,
      paddingHorizontal: 8,
      paddingVertical: 10,
      justifyContent: "center",
    },
    headerText: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    cellText: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    priceLine: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      backgroundColor: theme.colors.primary,
    },
    primaryButtonCompact: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "900",
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      backgroundColor: theme.colors.surfaceMuted,
    },
    secondaryButtonText: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
  });
