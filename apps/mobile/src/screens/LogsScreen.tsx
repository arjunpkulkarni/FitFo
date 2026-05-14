import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  canReplayCompletedSession,
  getRoutineDisplayTitle,
} from "../lib/fitfo";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import { getTheme, type ThemeMode } from "../theme";
import type { ActiveSessionPreview, CompletedWorkoutRecord } from "../types";

interface LogsScreenProps {
  activeWorkout: ActiveSessionPreview | null;
  error: string | null;
  isLoading: boolean;
  onOpenWorkout: (workout: CompletedWorkoutRecord) => void;
  onResumeWorkout: () => void;
  onRetry: () => void;
  onScheduleAgain?: (workout: CompletedWorkoutRecord) => void;
  /** Quick-start practice from hub log row (does not navigate to summary first). */
  onStartFromCompleted?: (workout: CompletedWorkoutRecord) => void;
  schedulingWorkoutId?: string | null;
  /** Permanently remove a logged session after confirmation. */
  onDeleteCompletedSession?: (workout: CompletedWorkoutRecord) => Promise<void>;
  /** Row id matching an in-flight delete (shows spinner instead of trash). */
  deletingCompletedWorkoutId?: string | null;
  workouts: CompletedWorkoutRecord[];
  themeMode?: ThemeMode;
}

function completedWorkoutSourceLabel(
  url: string | null | undefined,
): string | null {
  const raw = (url || "").trim();
  if (!raw) {
    return null;
  }
  try {
    const host = new URL(raw).host.toLowerCase();
    if (host.includes("tiktok")) {
      return "TikTok";
    }
    if (host.includes("instagram")) {
      return "Instagram";
    }
    return null;
  } catch {
    return null;
  }
}

function formatElapsed(startedAt: number, nowTick: number) {
  const elapsedSeconds = Math.max(0, Math.floor((nowTick - startedAt) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function completedWorkoutDayShort(completedAt: string): string {
  const parsed = new Date(completedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function LogsScreen({
  activeWorkout,
  deletingCompletedWorkoutId = null,
  error,
  isLoading,
  onDeleteCompletedSession,
  onOpenWorkout,
  onResumeWorkout,
  onRetry,
  onScheduleAgain,
  onStartFromCompleted,
  schedulingWorkoutId = null,
  workouts,
  themeMode = "light",
}: LogsScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const headlineBreath = useRef(new Animated.Value(0)).current;

  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  const headlineAnimatedStyle = useMemo(
    () => ({
      opacity: headlineBreath.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
      }),
      transform: [
        {
          translateY: headlineBreath.interpolate({
            inputRange: [0, 1],
            outputRange: [2, -2],
          }),
        },
      ],
    }),
    [headlineBreath],
  );

  const activeWorkoutSetCount = activeWorkout
    ? activeWorkout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
    : 0;
  const loggedSetCount = activeWorkout
    ? activeWorkout.exercises.reduce(
        (count, exercise) => count + exercise.sets.filter((set) => set.completed).length,
        0,
      )
    : 0;

  useEffect(() => {
    if (!activeWorkout) {
      return;
    }

    if (activeWorkout.hubTimerFrozenWallMs != null) {
      return;
    }

    const intervalId = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeWorkout]);

  useEffect(() => {
    const frozenAt = activeWorkout?.hubTimerFrozenWallMs;
    if (!activeWorkout || frozenAt == null) {
      return;
    }

    const sync = Math.min(frozenAt, Date.now());
    setNowTick(sync);
    return undefined;
  }, [activeWorkout, activeWorkout?.hubTimerFrozenWallMs]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(headlineBreath, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(headlineBreath, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
    };
  }, [headlineBreath]);

  const elapsedNowMs =
    activeWorkout?.hubTimerFrozenWallMs ?? nowTick;
  const isHubWorkoutPaused = activeWorkout?.hubTimerFrozenWallMs != null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarScrollPad },
      ]}
      showsVerticalScrollIndicator={false}
    >
      

      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>History</Text>
        <Animated.View style={headlineAnimatedStyle}>
          <Text style={styles.title}>
            Stop watching.{"\n"}
            <Text style={styles.titleAccent}>Start lifting.</Text>
          </Text>
        </Animated.View>
      </View>

      {activeWorkout ? (
        <View style={styles.activeWorkoutCard}>
          <View style={styles.activeWorkoutHeader}>
            <View>
              <Text style={styles.activeWorkoutEyebrow}>
              {isHubWorkoutPaused ? "Paused workout" : "Active Workout"}
            </Text>
              <Text style={styles.activeWorkoutTitle}>{activeWorkout.title}</Text>
            </View>
            <View style={styles.activeWorkoutPulse}>
              <Ionicons color={theme.colors.surface} name="radio-button-on" size={10} />
            </View>
          </View>

          <Text style={styles.activeWorkoutBody}>
            {isHubWorkoutPaused ? "Paused for" : "In progress for"}{" "}
            {formatElapsed(activeWorkout.startedAt, elapsedNowMs)} with{" "}
            {loggedSetCount} of {activeWorkoutSetCount} sets logged.
          </Text>

          <View style={styles.activeWorkoutMetrics}>
            <View style={styles.activeWorkoutMetric}>
              <Text style={styles.activeWorkoutMetricLabel}>Exercises</Text>
              <Text style={styles.activeWorkoutMetricValue}>
                {activeWorkout.exercises.length}
              </Text>
            </View>
            <View style={styles.activeWorkoutMetric}>
              <Text style={styles.activeWorkoutMetricLabel}>Sets Logged</Text>
              <Text style={styles.activeWorkoutMetricValue}>
                {loggedSetCount}/{activeWorkoutSetCount}
              </Text>
            </View>
          </View>

          <Pressable onPress={onResumeWorkout} style={styles.resumeButton}>
            <Ionicons color={theme.colors.surface} name="play" size={16} />
            <Text style={styles.resumeButtonText}>Resume Workout</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.recentSessionsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Past sessions</Text>
        </View>

        {isLoading ? (
          <View style={styles.feedbackCard}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.feedbackTitle}>Loading workout history</Text>
            <Text style={styles.feedbackBody}>
              Syncing completed workouts from your Fitfo account.
            </Text>
          </View>
        ) : error ? (
          <View style={styles.feedbackCard}>
            <Ionicons color={theme.colors.error} name="alert-circle-outline" size={20} />
            <Text style={styles.feedbackTitle}>Couldn&apos;t load workout history</Text>
            <Text style={styles.feedbackBody}>{error}</Text>
            <Pressable onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : workouts.length > 0 ? (
          <View style={styles.sessionList}>
            {workouts.map((item) => {
              const displayTitle = getRoutineDisplayTitle({
                sourceUrl: item.source_url,
                title: item.title,
                workoutPlan: item.workout_plan,
              });

              const confirmDeletePastSession = () => {
                if (!onDeleteCompletedSession) return;
                Alert.alert(
                  "Delete this workout?",
                  `Remove "${displayTitle}" from your history. This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        void (async () => {
                          try {
                            await onDeleteCompletedSession(item);
                          } catch (err) {
                            const msg =
                              err instanceof Error ? err.message : "Try again.";
                            Alert.alert("Couldn't delete", msg);
                          }
                        })();
                      },
                    },
                  ],
                );
              };

              const isSchedulingThis = schedulingWorkoutId === item.id;
              const sourceTag = completedWorkoutSourceLabel(item.source_url);
              const dayShort = completedWorkoutDayShort(item.completed_at);
              const metaLine = [dayShort, sourceTag].filter(Boolean).join(" · ");

              return (
                <Pressable
                  key={item.id}
                  onPress={() => onOpenWorkout(item)}
                  style={styles.sessionCard}
                >
                  <View style={styles.sessionTop}>
                    <View style={styles.sessionImageShell}>
                      <Ionicons color={theme.colors.primary} name="barbell-outline" size={17} />
                    </View>
                    <View style={styles.sessionCopy}>
                      <Text numberOfLines={1} style={styles.sessionTitle}>
                        {displayTitle}
                      </Text>
                      {metaLine ? (
                        <Text style={styles.sessionMetaLine}>{metaLine}</Text>
                      ) : null}
                    </View>
                    {onDeleteCompletedSession ? (
                      <Pressable
                        accessibilityLabel={`Delete logged workout ${displayTitle}`}
                        accessibilityHint="Opens a confirmation prompt"
                        accessibilityRole="button"
                        disabled={deletingCompletedWorkoutId === item.id}
                        hitSlop={8}
                        onPress={confirmDeletePastSession}
                        style={({ pressed }) => [
                          styles.sessionDeleteButton,
                          pressed && deletingCompletedWorkoutId !== item.id
                            ? styles.sessionDeleteButtonPressed
                            : null,
                        ]}
                      >
                        {deletingCompletedWorkoutId === item.id ? (
                          <ActivityIndicator color={theme.colors.error} size="small" />
                        ) : (
                          <Ionicons
                            color={theme.colors.error}
                            name="close"
                            size={18}
                          />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  {(onStartFromCompleted || onScheduleAgain) ? (
                    <View style={styles.sessionActions}>
                      {onStartFromCompleted ? (
                        <Pressable
                          disabled={!canReplayCompletedSession(item)}
                          onPress={() => onStartFromCompleted(item)}
                          style={({ pressed }) => [
                            styles.startNowButton,
                            !canReplayCompletedSession(item)
                              ? styles.sessionActionMuted
                              : null,
                            pressed && canReplayCompletedSession(item)
                              ? styles.sessionActionPressed
                              : null,
                          ]}
                        >
                          <Ionicons color={theme.colors.surface} name="play" size={13} />
                          <Text style={styles.startNowButtonText}>Start</Text>
                        </Pressable>
                      ) : null}
                      {onScheduleAgain ? (
                        <Pressable
                          disabled={isSchedulingThis}
                          onPress={() => onScheduleAgain(item)}
                          style={({ pressed }) => [
                            styles.scheduleAgainButton,
                            isSchedulingThis ? styles.scheduleAgainButtonBusy : null,
                            onStartFromCompleted ? styles.scheduleAgainButtonFlexible : null,
                            pressed && !isSchedulingThis ? styles.sessionActionPressed : null,
                          ]}
                        >
                          {isSchedulingThis ? (
                            <ActivityIndicator color={theme.colors.primary} size="small" />
                          ) : (
                            <Ionicons
                              color={theme.colors.primary}
                              name="calendar-outline"
                              size={13}
                            />
                          )}
                          <Text style={styles.scheduleAgainButtonText}>
                            {isSchedulingThis ? "Scheduling..." : "Schedule"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.feedbackCard}>
            <Ionicons color={theme.colors.primary} name="receipt-outline" size={20} />
            <Text style={styles.feedbackTitle}>No workout logs yet</Text>
            <Text style={styles.feedbackBody}>
              Finish a workout and it will show up here with a full summary you can reopen later.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
      gap: 24,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    brandBadge: {
      width: 18,
      height: 18,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    brandBadgeText: {
      color: theme.colors.surface,
      fontSize: 9,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    brandText: {
      color: theme.colors.primary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    headerIcons: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    avatarShell: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    titleBlock: {
      gap: 8,
      paddingHorizontal: 2,
      marginTop: 4,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 34,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      lineHeight: 38,
      letterSpacing: -1.25,
    },
    titleAccent: {
      color: theme.colors.primary,
    },
    analysisCard: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 12,
      width: "100%",
    },
    activeWorkoutCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.primary,
      padding: 18,
      gap: 12,
      ...theme.shadows.primary,
    },
    activeWorkoutHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    activeWorkoutEyebrow: {
      color: theme.colors.primarySoftText,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    activeWorkoutTitle: {
      marginTop: 4,
      color: theme.colors.surface,
      fontSize: 28,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    activeWorkoutPulse: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    activeWorkoutBody: {
      color: theme.colors.surface,
      fontFamily: "satoshi",
      fontSize: 14,
      lineHeight: 21,
    },
    activeWorkoutMetrics: {
      flexDirection: "row",
      gap: 10,
    },
    activeWorkoutMetric: {
      flex: 1,
      borderRadius: theme.radii.medium,
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      padding: 12,
      gap: 4,
    },
    activeWorkoutMetricLabel: {
      color: theme.colors.primarySoftText,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    activeWorkoutMetricValue: {
      color: theme.colors.surface,
      fontSize: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    resumeButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 999,
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      paddingVertical: 12,
    },
    resumeButtonText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statTile: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 132,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    statTileIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.18)"
          : "rgba(255, 111, 34, 0.12)",
    },
    statTileValue: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      lineHeight: 30,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
      marginBottom: 4,
    },
    statTileLabel: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      lineHeight: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statTileCaption: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      marginTop: 2,
    },
    metricPill: {
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    metricPillText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    sectionHeader: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    recentSessionsSection: {
      gap: 12,
    },
    sectionTitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.15,
      textTransform: "uppercase",
      lineHeight: 16,
    },
    feedbackCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 24,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
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
      color: theme.colors.surface,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    sessionList: {
      gap: 12,
    },
    sessionCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    sessionTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      width: "100%",
    },
    sessionDeleteButton: {
      alignSelf: "flex-start",
      padding: 8,
      marginTop: 2,
      marginLeft: -2,
      marginRight: -4,
      borderRadius: theme.radii.small,
    },
    sessionDeleteButtonPressed: {
      opacity: 0.72,
      backgroundColor: theme.colors.surfaceMuted,
    },
    sessionImageShell: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.12)"
          : theme.colors.surfaceMuted,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: "rgba(255, 111, 34, 0.22)",
    },
    sessionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    sessionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.35,
      lineHeight: 22,
    },
    sessionMetaLine: {
      marginTop: 3,
      color: theme.colors.textMuted,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      fontSize: 12,
      lineHeight: 16,
    },
    sessionActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
    },
    sessionActionPressed: {
      opacity: 0.86,
    },
    sessionActionMuted: {
      opacity: 0.45,
    },
    startNowButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    startNowButtonText: {
      color: theme.colors.surface,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    scheduleAgainButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceMuted,
    },
    scheduleAgainButtonFlexible: {
      flex: 1,
    },
    scheduleAgainButtonBusy: {
      opacity: 0.75,
    },
    scheduleAgainButtonText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
  });
