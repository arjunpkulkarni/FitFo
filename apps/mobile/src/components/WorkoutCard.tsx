import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getCreatorDisplayLabel } from "../lib/fitfo";
import { getTheme } from "../theme";
import type { SavedRoutinePreview } from "../types";

// Kept for older imports. Use theme colors for actual rendering.
export const BRAND_ORANGE = "#FF6F22";

export function getBrandAccent(theme: ReturnType<typeof getTheme>): string {
  return theme.colors.primary;
}

export type WorkoutCardAccent = "saved" | "scheduled" | "lastHit";

function getSourcePlatform(
  sourceUrl: string | null | undefined,
): "tiktok" | "instagram" | "other" | null {
  if (!sourceUrl) {
    return null;
  }
  try {
    const host = new URL(sourceUrl).host.toLowerCase();
    if (host.includes("tiktok.com")) {
      return "tiktok";
    }
    if (host.includes("instagram.com")) {
      return "instagram";
    }
    return "other";
  } catch {
    return null;
  }
}

function getSourceIconName(
  platform: ReturnType<typeof getSourcePlatform>,
): keyof typeof Ionicons.glyphMap {
  if (platform === "tiktok") {
    return "logo-tiktok";
  }
  if (platform === "instagram") {
    return "logo-instagram";
  }
  return "link-outline";
}

function getSourceLabel(
  platform: ReturnType<typeof getSourcePlatform>,
): string {
  if (platform === "tiktok") {
    return "View on TikTok";
  }
  if (platform === "instagram") {
    return "View on Instagram";
  }
  return "Open source";
}

export function FeedbackCard({
  actionLabel,
  body,
  icon,
  isLoading = false,
  onAction,
  theme,
  title,
}: {
  actionLabel?: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isLoading?: boolean;
  onAction?: () => void;
  theme: ReturnType<typeof getTheme>;
  title: string;
}) {
  const styles = createStyles(theme);

  return (
    <View style={styles.feedbackCard}>
      {isLoading ? (
        <ActivityIndicator color={getBrandAccent(theme)} size="small" />
      ) : icon ? (
        <Ionicons color={getBrandAccent(theme)} name={icon} size={20} />
      ) : null}
      <Text style={styles.feedbackTitle}>{title}</Text>
      <Text style={styles.feedbackBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WorkoutCard({
  accent,
  onOpen,
  onRemove,
  onSchedule,
  onStart,
  removeLabel = "Unsave",
  routine,
  theme,
}: {
  accent: WorkoutCardAccent;
  onOpen: () => void;
  onRemove?: () => void;
  onSchedule?: () => void;
  onStart: () => void;
  removeLabel?: string;
  routine: SavedRoutinePreview;
  theme: ReturnType<typeof getTheme>;
}) {
  const styles = createStyles(theme);
  const isScheduled = accent === "scheduled";
  const isLastHit = accent === "lastHit";
  const accentColor = getBrandAccent(theme);
  const creatorHandle = getCreatorDisplayLabel(routine.sourceUrl, routine.title);
  const sourceUrl = routine.sourceUrl || null;
  const platform = getSourcePlatform(sourceUrl);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open workout: ${routine.title}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.workoutCard,
        isScheduled ? styles.scheduledWorkoutCard : null,
        isLastHit ? styles.lastHitWorkoutCard : null,
        pressed ? styles.workoutCardPressed : null,
      ]}
    >
      <View style={styles.workoutHeader}>
        {isLastHit ? (
          <Text style={[styles.workoutBadgeText, { color: accentColor }]}>
            LAST HIT ON
          </Text>
        ) : (
          <View
            style={[
              styles.workoutBadge,
              isScheduled ? styles.scheduledWorkoutBadge : null,
            ]}
          >
            <Text
              style={[
                styles.workoutBadgeText,
                { color: accentColor },
                isScheduled ? styles.scheduledWorkoutBadgeText : null,
              ]}
            >
              {routine.badgeLabel || (isScheduled ? "Scheduled" : "Saved")}
            </Text>
          </View>
        )}
        <Ionicons
          color={theme.colors.textMuted}
          name="chevron-forward"
          size={18}
        />
      </View>

      {isLastHit ? (
        <View style={styles.lastHitBody}>
          <View style={styles.lastHitTextCol}>
            <Text numberOfLines={2} style={styles.workoutTitle}>
              {routine.title}
            </Text>

            {creatorHandle || sourceUrl ? (
              <View style={styles.sourceRow}>
                {creatorHandle ? (
                  <View style={styles.creatorChip}>
                    <Ionicons
                      color={accentColor}
                      name="person-circle-outline"
                      size={13}
                    />
                    <Text
                      style={[styles.creatorChipText, { color: accentColor }]}
                    >
                      {creatorHandle}
                    </Text>
                  </View>
                ) : null}
                {sourceUrl ? (
                  <Pressable
                    onPress={() => void Linking.openURL(sourceUrl)}
                    style={({ pressed }) => [
                      styles.sourceButton,
                      pressed ? styles.sourceButtonPressed : null,
                    ]}
                  >
                    <Ionicons
                      color={accentColor}
                      name={getSourceIconName(platform)}
                      size={13}
                    />
                    <Text
                      style={[styles.sourceButtonText, { color: accentColor }]}
                    >
                      {getSourceLabel(platform)}
                    </Text>
                    <Ionicons
                      color={accentColor}
                      name="open-outline"
                      size={12}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.workoutMetaRow}>
              <Text style={styles.workoutMeta}>{routine.metaLeft}</Text>
              <Text style={styles.workoutMeta}>{routine.metaRight}</Text>
            </View>
          </View>

          {routine.thumbnailUrl ? (
            <View style={styles.lastHitThumb}>
              <Image
                source={{ uri: routine.thumbnailUrl }}
                style={styles.lastHitThumbImage}
                resizeMode="cover"
              />
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <Text style={styles.workoutTitle}>{routine.title}</Text>
          {routine.description ? (
            <Text style={styles.workoutDescription}>{routine.description}</Text>
          ) : null}

          {creatorHandle || sourceUrl ? (
            <View style={styles.sourceRow}>
              {creatorHandle ? (
                <View style={styles.creatorChip}>
                  <Ionicons
                    color={accentColor}
                    name="person-circle-outline"
                    size={13}
                  />
                  <Text
                    style={[styles.creatorChipText, { color: accentColor }]}
                  >
                    {creatorHandle}
                  </Text>
                </View>
              ) : null}
              {sourceUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(sourceUrl)}
                  style={({ pressed }) => [
                    styles.sourceButton,
                    pressed ? styles.sourceButtonPressed : null,
                  ]}
                >
                  <Ionicons
                    color={accentColor}
                    name={getSourceIconName(platform)}
                    size={13}
                  />
                  <Text
                    style={[styles.sourceButtonText, { color: accentColor }]}
                  >
                    {getSourceLabel(platform)}
                  </Text>
                  <Ionicons
                    color={accentColor}
                    name="open-outline"
                    size={12}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.workoutMetaRow}>
            <Text style={styles.workoutMeta}>{routine.metaLeft}</Text>
            <Text style={styles.workoutMeta}>{routine.metaRight}</Text>
          </View>
        </>
      )}

      <View style={styles.actionRow}>
        <Pressable
          onPress={onStart}
          style={[styles.primaryButton, { backgroundColor: accentColor }]}
        >
          <Text style={styles.primaryButtonText}>Start Session</Text>
        </Pressable>
        {onSchedule ? (
          <Pressable
            onPress={onSchedule}
            style={({ pressed }) => [
              styles.iconButton,
              styles.scheduleIconButton,
              pressed ? styles.iconButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Schedule ${routine.title}`}
            hitSlop={6}
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="calendar-outline"
              size={20}
            />
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => [
              styles.iconButton,
              styles.removeIconButton,
              pressed ? styles.iconButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            hitSlop={6}
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="close"
              size={20}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    feedbackCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      padding: 24,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    feedbackTitle: {
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
    feedbackBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    retryButton: {
      marginTop: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    retryButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    workoutCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingVertical: 22,
      paddingHorizontal: 22,
      gap: 12,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    scheduledWorkoutCard: {
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.24)"
          : "rgba(71, 88, 240, 0.18)",
    },
    lastHitWorkoutCard: {
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.24)"
          : "rgba(15, 23, 42, 0.06)",
    },
    lastHitBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      marginTop: 4,
    },
    lastHitTextCol: {
      flex: 1,
      gap: 12,
    },
    lastHitThumb: {
      width: 116,
      height: 132,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    lastHitThumbImage: {
      width: "100%",
      height: "100%",
    },
    workoutHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    workoutBadge: {
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    scheduledWorkoutBadge: {
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.14)"
          : "rgba(71, 88, 240, 0.12)",
    },
    workoutBadgeText: {
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    scheduledWorkoutBadgeText: {},
    workoutTitle: {
      marginTop: 4,
      color: theme.colors.textPrimary,
      fontSize: 24,
      lineHeight: 28,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    workoutDescription: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    sourceRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    creatorChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    creatorChipText: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    sourceButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    sourceButtonPressed: {
      opacity: 0.85,
    },
    sourceButtonText: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    workoutMetaRow: {
      flexDirection: "row",
      gap: 24,
      flexWrap: "wrap",
      marginTop: 2,
    },
    workoutMeta: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    workoutCardPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.995 }],
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 16,
    },
    primaryButton: {
      flex: 1,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    iconButton: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
    },
    iconButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },
    scheduleIconButton: {
      borderColor: theme.colors.borderSoft,
    },
    removeIconButton: {
      borderColor: theme.colors.borderSoft,
    },
  });
