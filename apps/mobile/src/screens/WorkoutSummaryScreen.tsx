import {
  ActivityIndicator,
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

import {
  formatCompletedWorkoutDate,
  getCompletedWorkoutMeta,
  getCreatorDisplayLabel,
  getRoutineDisplayTitle,
  canReplayCompletedSession,
  titleCase,
} from "../lib/fitfo";
import { getTheme, type ThemeMode } from "../theme";
import type { ActiveSetPreview, CompletedWorkoutRecord } from "../types";

interface WorkoutSummaryScreenProps {
  onBack: () => void;
  onRepeatWorkout?: () => void;
  onScheduleAgain?: () => void;
  isSchedulingAgain?: boolean;
  workout: CompletedWorkoutRecord;
  themeMode?: ThemeMode;
}

function formatSeconds(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatLoggedSet(set: ActiveSetPreview) {
  const parts: string[] = [];

  if (set.loggedWeight.trim()) {
    parts.push(`${set.loggedWeight} lb`);
  }

  if (set.loggedReps.trim()) {
    parts.push(set.targetDurationSec != null ? `${set.loggedReps}s` : `${set.loggedReps} reps`);
  }

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  if (set.targetDurationSec != null) {
    return `${set.targetDurationSec}s target`;
  }

  if (set.targetReps != null) {
    return `${set.targetReps} reps target`;
  }

  return "No set details recorded";
}

function formatSourceUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return sourceUrl;
  }
}

export function WorkoutSummaryScreen({
  onBack,
  onRepeatWorkout,
  onScheduleAgain,
  isSchedulingAgain = false,
  workout,
  themeMode = "light",
}: WorkoutSummaryScreenProps) {
  const posthog = usePostHog();
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const meta = getCompletedWorkoutMeta(workout);
  const displayTitle = getRoutineDisplayTitle({
    sourceUrl: workout.source_url,
    title: workout.title,
    workoutPlan: workout.workout_plan,
  });
  const canReplaySession = canReplayCompletedSession(workout);
  const detailChips = [
    workout.difficulty ? `Difficulty: ${workout.difficulty}` : null,
    workout.calories != null ? `${workout.calories} cal` : null,
    
  ].filter((value): value is string => Boolean(value));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons color={theme.colors.primary} name="chevron-back" size={18} />
        </Pressable>
        <Image
          resizeMode="contain"
          source={require("../../assets/logo_no_bg.png")}
          style={styles.brandLogo}
        />
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Workout Summary</Text>
        <Text style={styles.title}>{displayTitle}</Text>
        <Text style={styles.completedAt}>
          Completed {formatCompletedWorkoutDate(workout.completed_at)}
        </Text>
        <Text style={styles.summary}>
          {workout.summary || workout.description || "Your completed workout is saved to your account."}
        </Text>

        <View style={styles.heroStats}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Volume</Text>
            <Text style={styles.heroStatValue}>{meta.metaLeft}</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Logged</Text>
            <Text style={styles.heroStatValue}>{meta.metaRight}</Text>
          </View>
        </View>
      </View>

      {(onRepeatWorkout || onScheduleAgain) ? (
        <View style={styles.actionStack}>
          {onRepeatWorkout ? (
            <Pressable
              accessibilityHint="Begins a new practice session using this workout"
              accessibilityLabel="Start this workout again"
              disabled={!canReplaySession}
              onPress={() => {
                posthog.capture("workout_repeated", { workout_id: workout.id });
                onRepeatWorkout?.();
              }}
              style={({ pressed }) => [
                styles.startWorkoutButton,
                !canReplaySession ? styles.startWorkoutButtonDisabled : null,
                pressed && canReplaySession ? styles.startWorkoutButtonPressed : null,
              ]}
            >
              <Ionicons color={theme.colors.surface} name="play-circle" size={18} />
              <Text style={styles.startWorkoutButtonText}>Start this workout again</Text>
            </Pressable>
          ) : null}
          {onScheduleAgain ? (
            <Pressable
              disabled={isSchedulingAgain}
              onPress={onScheduleAgain}
              style={({ pressed }) => [
                styles.scheduleOutlineButton,
                isSchedulingAgain ? styles.scheduleOutlineButtonDisabled : null,
                pressed && !isSchedulingAgain ? styles.scheduleOutlineButtonPressed : null,
              ]}
            >
              {isSchedulingAgain ? (
                <>
                  <ActivityIndicator color={theme.colors.primary} size="small" />
                  <Text style={styles.scheduleOutlineButtonText}>Scheduling...</Text>
                </>
              ) : (
                <>
                  <Ionicons color={theme.colors.primary} name="calendar" size={16} />
                  <Text style={styles.scheduleOutlineButtonText}>
                    Schedule This Workout Again
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!canReplaySession && onRepeatWorkout ? (
        <Text style={styles.helperMuted}>
          This log has no lifts to repeat yet. Finish logging in the tracker first.
        </Text>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Session Details</Text>
        </View>

        {workout.started_at ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Started</Text>
            <Text style={styles.detailValue}>{formatCompletedWorkoutDate(workout.started_at)}</Text>
          </View>
        ) : null}

        {detailChips.length > 0 ? (
          <View style={styles.chipRow}>
            {detailChips.map((chip) => (
              <View key={chip} style={styles.detailChip}>
                <Text style={styles.detailChipText}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : null}


        {workout.source_url ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Source</Text>
            <Pressable
              onPress={() => void Linking.openURL(workout.source_url || "")}
              style={({ pressed }) => [
                styles.sourceButton,
                pressed ? styles.sourceButtonPressed : null,
              ]}
            >
              <Ionicons
                color={theme.colors.primary}
                name="logo-tiktok"
                size={16}
              />
              <Text style={styles.sourceButtonText}>
                {getCreatorDisplayLabel(workout.source_url, workout.title) ||
                  formatSourceUrl(workout.source_url)}
              </Text>
              <Ionicons
                color={theme.colors.primary}
                name="open-outline"
                size={14}
              />
            </Pressable>
          </View>
        ) : null}

        {workout.notes ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Notes</Text>
            <Text style={styles.detailBody}>{workout.notes}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Exercises</Text>
        </View>

        {workout.exercises.length > 0 ? (
          <View style={styles.exerciseList}>
            {workout.exercises.map((exercise) => (
              <View key={exercise.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseIcon}>
                    <Ionicons color={theme.colors.primary} name="barbell-outline" size={18} />
                  </View>
                  <View style={styles.exerciseCopy}>
                    <Text style={styles.exerciseName}>
                      {titleCase(exercise.name) || exercise.name}
                    </Text>
                    <Text style={styles.exerciseSubtitle}>{exercise.subtitle}</Text>
                    {exercise.blockName ? (
                      <Text style={styles.exerciseMeta}>{exercise.blockName}</Text>
                    ) : null}
                  </View>
                </View>

                {exercise.notes ? (
                  <View style={styles.exerciseNoteCard}>
                    <Text style={styles.exerciseNoteLabel}>Coach Notes</Text>
                    <Text style={styles.exerciseNoteBody}>{exercise.notes}</Text>
                  </View>
                ) : null}

                <View style={styles.setList}>
                  {exercise.sets.map((set) => (
                    <View key={set.id} style={styles.setCard}>
                      <View>
                        <Text style={styles.setLabel}>{set.label}</Text>
                        <Text style={styles.setValue}>{formatLoggedSet(set)}</Text>
                      </View>
                      <View style={styles.setBadge}>
                        <Ionicons color={theme.colors.success} name="checkmark-circle" size={14} />
                        <Text style={styles.setBadgeText}>Saved</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons color={theme.colors.primary} name="reader-outline" size={20} />
            <Text style={styles.emptyTitle}>No exercises were saved for this workout</Text>
            <Text style={styles.emptyBody}>
              The workout log still belongs to your account, but this session did not include exercise details.
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
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 132,
      gap: 28,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.softCard,
    },
    brandLogo: {
      width: 60,
      height: 60,
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    heroCard: {
      borderRadius: theme.radii.xlarge,
      backgroundColor: theme.colors.primary,
      padding: 22,
      gap: 10,
      ...theme.shadows.primary,
    },
    eyebrow: {
      color: theme.colors.primarySoftText,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.surface,
      fontSize: 34,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -1.2,
    },
    completedAt: {
      color: theme.colors.primarySoftText,
      fontSize: 13,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    summary: {
      color: theme.colors.surface,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
    },
    heroStats: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    heroStatCard: {
      flex: 1,
      borderRadius: theme.radii.large,
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      padding: 14,
      gap: 4,
    },
    heroStatLabel: {
      color: theme.colors.primarySoftText,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    heroStatValue: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    actionStack: {
      gap: 12,
    },
    startWorkoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 56,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 20,
      ...theme.shadows.primary,
    },
    startWorkoutButtonDisabled: {
      opacity: 0.5,
    },
    startWorkoutButtonPressed: {
      opacity: 0.88,
    },
    startWorkoutButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    scheduleOutlineButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 56,
      borderRadius: 20,
      paddingHorizontal: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    scheduleOutlineButtonDisabled: {
      opacity: 0.65,
    },
    scheduleOutlineButtonPressed: {
      opacity: 0.88,
    },
    scheduleOutlineButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    helperMuted: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
      textAlign: "center",
    },
    section: {
      gap: 14,
    },
    sectionHeader: {
      gap: 10,
      paddingTop: 4,
    },
    sectionAccent: {
      height: 1,
      width: "100%",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(15, 23, 42, 0.08)",
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 26,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    detailCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    detailLabel: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    detailValue: {
      color: theme.colors.textPrimary,
      fontSize: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    detailBody: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    detailChip: {
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    detailChipText: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    tagChip: {
      borderRadius: 999,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 111, 34, 0.12)" : "rgba(79, 117, 231, 0.16)",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tagChipText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    sourceButton: {
      marginTop: 4,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    sourceButtonPressed: {
      opacity: 0.85,
    },
    sourceButtonText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    exerciseList: {
      gap: 12,
    },
    exerciseCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    exerciseHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    exerciseIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    exerciseCopy: {
      flex: 1,
      gap: 4,
    },
    exerciseName: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.9,
    },
    exerciseSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    exerciseMeta: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    exerciseNoteCard: {
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 14,
      gap: 6,
    },
    exerciseNoteLabel: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    exerciseNoteBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
    },
    setList: {
      gap: 10,
    },
    setCard: {
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.successSoft,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    setLabel: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    setValue: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    setBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    setBadgeText: {
      color: theme.colors.success,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    emptyCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 24,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
    emptyBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
    },
  });
