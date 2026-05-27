import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  CUSTOM_PROGRAM_FREQUENCIES,
  CUSTOM_PROGRAM_GOAL_OPTIONS,
  CUSTOM_PROGRAM_WEEKDAY_LABELS,
  formatProgramWeekdayList,
  getDefaultProgramWeekdays,
  getProgramSplitLabel,
  getSupportedProgramGoalsFromOnboarding,
  isCustomProgramSupportedGoal,
  sortProgramWeekdays,
  validateCustomProgramConfig,
  type CustomProgramBuildResult,
  type CustomProgramConfig,
  type CustomProgramFrequency,
  type CustomProgramGenerationMode,
  type CustomProgramSupportedGoal,
  type CustomProgramWeekday,
} from "../lib/customProgram";
import { formatScheduleDateLabel } from "../lib/scheduleTime";
import { getTheme, type ThemeMode } from "../theme";
import type { ExperienceLevel, UserProfile } from "../types";

interface CustomProgramBuilderModalProps {
  generationMode?: CustomProgramGenerationMode;
  initialConfig?: CustomProgramConfig | null;
  onClose: () => void;
  onGenerate: (config: CustomProgramConfig) => Promise<CustomProgramBuildResult>;
  onOpenWorkouts?: () => void;
  profile: UserProfile;
  themeMode?: ThemeMode;
  visible: boolean;
}

type BuilderStep =
  | "frequency"
  | "goals"
  | "experience"
  | "schedule"
  | "review"
  | "complete";

const STEPS: readonly BuilderStep[] = [
  "frequency",
  "goals",
  "experience",
  "schedule",
  "review",
] as const;

const EXPERIENCE_OPTIONS: ReadonlyArray<{
  label: string;
  subtitle: string;
  value: ExperienceLevel;
}> = [
  { label: "Beginner", subtitle: "Under 1 year", value: "beginner" },
  { label: "Intermediate", subtitle: "2-5 years", value: "intermediate" },
  { label: "Advanced", subtitle: "5+ years", value: "advanced" },
];

function coerceFrequency(value: number | null | undefined): CustomProgramFrequency {
  return CUSTOM_PROGRAM_FREQUENCIES.includes(value as CustomProgramFrequency)
    ? (value as CustomProgramFrequency)
    : 4;
}

function resolveInitialGoals(
  profile: UserProfile,
  initialConfig?: CustomProgramConfig | null,
): CustomProgramSupportedGoal[] {
  if (initialConfig?.goals.length) {
    return initialConfig.goals;
  }
  const onboardingGoals = getSupportedProgramGoalsFromOnboarding(
    profile.onboarding?.goals,
  );
  return onboardingGoals.length > 0 ? onboardingGoals : ["build_muscle"];
}

function resolveInitialWeekdays(
  frequency: CustomProgramFrequency,
  initialConfig?: CustomProgramConfig | null,
): CustomProgramWeekday[] {
  if (
    initialConfig?.frequency === frequency &&
    initialConfig.weekdays.length === frequency
  ) {
    return sortProgramWeekdays(initialConfig.weekdays);
  }
  return getDefaultProgramWeekdays(frequency);
}

function stepTitle(step: BuilderStep): string {
  switch (step) {
    case "frequency":
      return "How many days can you train?";
    case "goals":
      return "Reconfirm your goals";
    case "experience":
      return "Lifting experience";
    case "schedule":
      return "Pick your gym days";
    case "review":
      return "Ready to build";
    case "complete":
      return "Program built";
    default:
      return "Custom Program";
  }
}

export function CustomProgramBuilderModal({
  generationMode = "restart",
  initialConfig = null,
  onClose,
  onGenerate,
  onOpenWorkouts,
  profile,
  themeMode = "light",
  visible,
}: CustomProgramBuilderModalProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const [step, setStep] = useState<BuilderStep>("frequency");
  const [frequency, setFrequency] = useState<CustomProgramFrequency>(() =>
    coerceFrequency(initialConfig?.frequency ?? profile.onboarding?.days_per_week),
  );
  const [goals, setGoals] = useState<CustomProgramSupportedGoal[]>(() =>
    resolveInitialGoals(profile, initialConfig),
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    () =>
      initialConfig?.experienceLevel ||
      profile.onboarding?.experience_level ||
      "intermediate",
  );
  const [scheduleMode, setScheduleMode] = useState<"fixed" | "flexible">(
    () => initialConfig?.scheduleMode || "flexible",
  );
  const [weekdays, setWeekdays] = useState<CustomProgramWeekday[]>(() =>
    resolveInitialWeekdays(
      coerceFrequency(initialConfig?.frequency ?? profile.onboarding?.days_per_week),
      initialConfig,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buildResult, setBuildResult] =
    useState<CustomProgramBuildResult | null>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    if (wasVisibleRef.current) {
      return;
    }
    wasVisibleRef.current = true;

    const nextFrequency = coerceFrequency(
      initialConfig?.frequency ?? profile.onboarding?.days_per_week,
    );
    setStep("frequency");
    setFrequency(nextFrequency);
    setGoals(resolveInitialGoals(profile, initialConfig));
    setExperienceLevel(
      initialConfig?.experienceLevel ||
        profile.onboarding?.experience_level ||
        "intermediate",
    );
    setScheduleMode(initialConfig?.scheduleMode || "flexible");
    setWeekdays(resolveInitialWeekdays(nextFrequency, initialConfig));
    setError(null);
    setIsSubmitting(false);
    setBuildResult(null);
  }, [initialConfig, profile, visible]);

  const stepIndex = step === "complete" ? STEPS.length : STEPS.indexOf(step);
  const selectedWeekdays =
    scheduleMode === "flexible" ? getDefaultProgramWeekdays(frequency) : weekdays;
  const selectedWeekdayLabel = formatProgramWeekdayList(selectedWeekdays);
  const hasBuildMuscle = goals.includes("build_muscle");
  const hasFatLoss = goals.includes("lose_fat");

  const config = useMemo<CustomProgramConfig>(
    () => ({
      frequency,
      goals,
      experienceLevel,
      scheduleMode,
      weekdays: selectedWeekdays,
    }),
    [experienceLevel, frequency, goals, scheduleMode, selectedWeekdays],
  );

  const canAdvance = useMemo(() => {
    if (step === "goals") {
      return hasBuildMuscle;
    }
    if (step === "schedule") {
      return selectedWeekdays.length === frequency;
    }
    return true;
  }, [frequency, hasBuildMuscle, selectedWeekdays.length, step]);

  const handleSelectFrequency = (next: CustomProgramFrequency) => {
    setFrequency(next);
    setWeekdays((current) => {
      if (scheduleMode === "flexible") {
        return getDefaultProgramWeekdays(next);
      }
      return sortProgramWeekdays(current).slice(0, next);
    });
    setError(null);
  };

  const toggleGoal = (value: string) => {
    if (!isCustomProgramSupportedGoal(value)) {
      return;
    }
    setGoals((current) =>
      current.includes(value)
        ? current.filter((goal) => goal !== value)
        : [...current, value],
    );
    setError(null);
  };

  const toggleWeekday = (weekday: CustomProgramWeekday) => {
    if (scheduleMode === "flexible") {
      return;
    }
    setWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((day) => day !== weekday);
      }
      if (current.length >= frequency) {
        return current;
      }
      return sortProgramWeekdays([...current, weekday]);
    });
    setError(null);
  };

  const goBack = () => {
    if (isSubmitting) {
      return;
    }
    if (step === "complete") {
      onClose();
      return;
    }
    if (stepIndex <= 0) {
      onClose();
      return;
    }
    setStep(STEPS[stepIndex - 1]);
    setError(null);
  };

  const goNext = async () => {
    if (isSubmitting) {
      return;
    }
    if (step === "goals" && !hasBuildMuscle) {
      setError(
        "Muscle Building is required for this program. Add it to continue, or check back soon for fat-loss-only programming.",
      );
      return;
    }
    if (step === "schedule" && selectedWeekdays.length !== frequency) {
      setError(`Pick exactly ${frequency} training days.`);
      return;
    }
    if (step !== "review") {
      setStep(STEPS[stepIndex + 1]);
      setError(null);
      return;
    }

    const validation = validateCustomProgramConfig(config);
    if (validation) {
      setError(validation);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onGenerate(config);
      setBuildResult(result);
      setStep("complete");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to build your program right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "frequency":
        return (
          <View style={styles.optionGrid}>
            {CUSTOM_PROGRAM_FREQUENCIES.map((value) => {
              const active = frequency === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => handleSelectFrequency(value)}
                  style={[
                    styles.frequencyButton,
                    active ? styles.frequencyButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.frequencyNumber,
                      active ? styles.frequencyNumberActive : null,
                    ]}
                  >
                    {value}
                  </Text>
                  <Text
                    style={[
                      styles.frequencyLabel,
                      active ? styles.frequencyLabelActive : null,
                    ]}
                  >
                    days/week
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      case "goals":
        return (
          <View style={styles.goalGrid}>
            {CUSTOM_PROGRAM_GOAL_OPTIONS.map((goal) => {
              const active =
                goal.supported &&
                goals.includes(goal.value as CustomProgramSupportedGoal);
              return (
                <Pressable
                  key={goal.value}
                  disabled={!goal.supported}
                  onPress={() => toggleGoal(goal.value)}
                  style={[
                    styles.goalButton,
                    active ? styles.goalButtonActive : null,
                    !goal.supported ? styles.goalButtonDisabled : null,
                  ]}
                >
                  <View style={styles.goalTextCol}>
                    <Text
                      style={[
                        styles.goalLabel,
                        active ? styles.goalLabelActive : null,
                        !goal.supported ? styles.goalLabelDisabled : null,
                      ]}
                    >
                      {goal.label}
                    </Text>
                    {!goal.supported ? (
                      <Text style={styles.comingSoon}>Coming Soon</Text>
                    ) : null}
                  </View>
                  {active ? (
                    <Ionicons
                      color={theme.colors.surface}
                      name="checkmark-circle"
                      size={19}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        );
      case "experience":
        return (
          <View style={styles.stack}>
            {EXPERIENCE_OPTIONS.map((option) => {
              const active = experienceLevel === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setExperienceLevel(option.value)}
                  style={[
                    styles.rowOption,
                    active ? styles.rowOptionActive : null,
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.rowOptionTitle,
                        active ? styles.rowOptionTitleActive : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.rowOptionSubtitle,
                        active ? styles.rowOptionSubtitleActive : null,
                      ]}
                    >
                      {option.subtitle}
                    </Text>
                  </View>
                  {active ? (
                    <Ionicons
                      color={theme.colors.surface}
                      name="checkmark"
                      size={18}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        );
      case "schedule":
        return (
          <View style={styles.stack}>
            <Pressable
              onPress={() => {
                const nextMode = scheduleMode === "flexible" ? "fixed" : "flexible";
                setScheduleMode(nextMode);
                if (nextMode === "flexible") {
                  setWeekdays(getDefaultProgramWeekdays(frequency));
                }
                setError(null);
              }}
              style={[
                styles.flexibleButton,
                scheduleMode === "flexible" ? styles.flexibleButtonActive : null,
              ]}
            >
              <Ionicons
                color={
                  scheduleMode === "flexible"
                    ? theme.colors.surface
                    : theme.colors.primary
                }
                name="calendar-clear-outline"
                size={18}
              />
              <View style={styles.goalTextCol}>
                <Text
                  style={[
                    styles.flexibleTitle,
                    scheduleMode === "flexible" ? styles.flexibleTitleActive : null,
                  ]}
                >
                  I'm flexible
                </Text>
                <Text
                  style={[
                    styles.flexibleSubtitle,
                    scheduleMode === "flexible"
                      ? styles.flexibleSubtitleActive
                      : null,
                  ]}
                >
                  {formatProgramWeekdayList(getDefaultProgramWeekdays(frequency))}
                </Text>
              </View>
            </Pressable>

            <View style={styles.weekdayGrid}>
              {sortProgramWeekdays(MONDAY_FIRST_WEEKDAYS).map((weekday) => {
                const active = selectedWeekdays.includes(weekday);
                const locked =
                  scheduleMode === "fixed" &&
                  !active &&
                  weekdays.length >= frequency;
                return (
                  <Pressable
                    key={weekday}
                    disabled={scheduleMode === "flexible" || locked}
                    onPress={() => toggleWeekday(weekday)}
                    style={[
                      styles.weekdayButton,
                      active ? styles.weekdayButtonActive : null,
                      scheduleMode === "flexible" || locked
                        ? styles.weekdayButtonDisabled
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekdayText,
                        active ? styles.weekdayTextActive : null,
                      ]}
                    >
                      {CUSTOM_PROGRAM_WEEKDAY_LABELS[weekday].short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              {scheduleMode === "flexible"
                ? "Default days will be added to your calendar."
                : `${selectedWeekdays.length}/${frequency} days selected.`}
            </Text>
          </View>
        );
      case "review":
        return (
          <View style={styles.reviewPanel}>
            <SummaryRow label="Frequency" value={`${frequency} days/week`} />
            <SummaryRow label="Split" value={getProgramSplitLabel(frequency)} />
            <SummaryRow
              label="Goals"
              value={hasFatLoss ? "Build Muscle + Lose Fat" : "Build Muscle"}
            />
            <SummaryRow label="Experience" value={experienceLevel} />
            <SummaryRow label="Schedule" value={selectedWeekdayLabel} />
          </View>
        );
      case "complete":
        return (
          <ProgramReadySummary
            generationMode={generationMode}
            result={buildResult}
            themeMode={themeMode}
            onClose={onClose}
            onOpenWorkouts={onOpenWorkouts}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      animationType="slide"
      visible={visible}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={goBack} disabled={isSubmitting} style={styles.iconButton}>
            <Ionicons
              color={theme.colors.textPrimary}
              name={stepIndex === 0 ? "close" : "chevron-back"}
              size={22}
            />
          </Pressable>
          <View style={styles.progressDots}>
            {STEPS.map((item) => (
              <View
                key={item}
                style={[
                  styles.progressDot,
                  step === "complete" || STEPS.indexOf(item) <= stepIndex
                    ? styles.progressDotActive
                    : null,
                ]}
              />
            ))}
          </View>
          <View style={styles.iconButton} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>Custom Program</Text>
            <Text style={styles.title}>{stepTitle(step)}</Text>
            <Text style={styles.subtitle}>
              {step === "complete"
                ? "Your next 10 weeks are already on the calendar."
                : step === "review"
                ? "This creates 10 weeks of calendar workouts."
                : "Build Muscle is the launch program. More goals are on the way."}
            </Text>
          </View>

          {renderStep()}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {step !== "complete" ? (
          <View style={styles.footer}>
            <Pressable
              disabled={isSubmitting}
              onPress={goNext}
              style={[
                styles.primaryButton,
                (!canAdvance || isSubmitting) && step !== "review"
                  ? styles.primaryButtonMuted
                  : null,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.surface} size="small" />
              ) : (
                <Ionicons
                  color={theme.colors.surface}
                  name={step === "review" ? "calendar" : "arrow-forward"}
                  size={18}
                />
              )}
              <Text style={styles.primaryButtonText}>
              {isSubmitting
                ? "Building..."
                : step === "review"
                  ? generationMode === "update"
                    ? "Update program"
                    : "Build 10-week program"
                  : "Continue"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ProgramReadySummary({
  generationMode,
  onClose,
  onOpenWorkouts,
  result,
  themeMode,
}: {
  generationMode: CustomProgramGenerationMode;
  onClose: () => void;
  onOpenWorkouts?: () => void;
  result: CustomProgramBuildResult | null;
  themeMode: ThemeMode;
}) {
  const theme = getTheme(themeMode);
  const styles = createReadyStyles(theme);
  const frequency = result?.config.frequency ?? 0;
  const split = result ? getProgramSplitLabel(result.config.frequency) : "";
  const schedule = result
    ? formatProgramWeekdayList(result.config.weekdays)
    : "";
  const dateRange = result
    ? `${formatScheduleDateLabel(result.startDateIso)} to ${formatScheduleDateLabel(
        result.endDateIso,
      )}`
    : "";
  const goalLabel = result?.config.goals.includes("lose_fat")
    ? "Muscle Building + Fat Loss"
    : "Muscle Building";
  const updateLabel =
    generationMode === "update" && result?.startWeek
      ? `Your program has been updated from Week ${result.startWeek}.`
      : "Fitfo built your 10-week plan.";
  const scheduleLabel =
    generationMode === "update"
      ? "every remaining session is scheduled for you."
      : "every session is scheduled for you.";

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.checkCircle}>
          <Ionicons color={theme.colors.surface} name="checkmark" size={28} />
        </View>
        <Text style={styles.heroTitle}>Your program is ready</Text>
        <Text style={styles.heroBody}>
          {updateLabel} It is saved to the Workouts screen, and {scheduleLabel}
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <ReadyStat label="Schedule" styles={styles} value={schedule || "Set"} />
        <ReadyStat label="Split" styles={styles} value={split || "Custom"} />
        <ReadyStat label="Goal" styles={styles} value={goalLabel} />
        <ReadyStat
          label="Calendar"
          styles={styles}
          value={dateRange || "10 weeks"}
        />
      </View>

      <View style={styles.nextCard}>
        <View style={styles.nextIcon}>
          <Ionicons
            color={theme.colors.primary}
            name="calendar-outline"
            size={20}
          />
        </View>
        <View style={styles.nextCopy}>
          <Text style={styles.nextTitle}>What happens now</Text>
          <Text style={styles.nextBody}>
            Open Fitfo, check the Workouts screen for today's scheduled workout,
            tap it, and begin the session. Exercises, sets, reps, notes, and any
            cardio finishers are already loaded.
          </Text>
        </View>
      </View>

      <View style={styles.noteCard}>
        <Ionicons
          color={theme.colors.primary}
          name="sparkles-outline"
          size={18}
        />
        <Text style={styles.noteText}>
          Need swaps, form cues, or an equipment substitution? Start the workout
          and ask the AI Coach from inside the session.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onOpenWorkouts ?? onClose}
          style={styles.primaryButton}
        >
          <Ionicons color={theme.colors.surface} name="barbell" size={17} />
          <Text style={styles.primaryButtonText}>Go to Workouts</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Stay in Coach</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReadyStat({
  label,
  styles,
  value,
}: {
  label: string;
  styles: ReturnType<typeof createReadyStyles>;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    gap: 4,
  },
  label: {
    color: "#8A94B5",
    fontSize: 11,
    fontFamily: "Satoshi-Bold",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  value: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Satoshi-Bold",
    fontWeight: "800",
    textTransform: "capitalize",
  },
});

const createReadyStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    wrap: {
      gap: 16,
    },
    hero: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
    },
    checkCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    heroTitle: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      lineHeight: 32,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textAlign: "center",
    },
    heroBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      paddingHorizontal: 6,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    statCard: {
      width: "48%",
      minHeight: 86,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: "center",
      gap: 5,
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    nextCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      padding: 16,
      flexDirection: "row",
      gap: 12,
    },
    nextIcon: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    nextCopy: {
      flex: 1,
      gap: 4,
    },
    nextTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    nextBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    noteCard: {
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 14,
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
    },
    noteText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    actions: {
      gap: 10,
      paddingTop: 4,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });

const MONDAY_FIRST_WEEKDAYS: readonly CustomProgramWeekday[] = [
  1,
  2,
  3,
  4,
  5,
  6,
  0,
] as const;

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 58,
      paddingHorizontal: 16,
      paddingTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.background,
    },
    iconButton: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 21,
    },
    progressDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    progressDot: {
      width: 22,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.track,
    },
    progressDotActive: {
      backgroundColor: theme.colors.primary,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 24,
      gap: 18,
    },
    titleBlock: {
      gap: 7,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 30,
      lineHeight: 34,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    optionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    frequencyButton: {
      width: "30.8%",
      minHeight: 96,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
    },
    frequencyButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    frequencyNumber: {
      color: theme.colors.textPrimary,
      fontSize: 32,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    frequencyNumberActive: {
      color: theme.colors.surface,
    },
    frequencyLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
    },
    frequencyLabelActive: {
      color: theme.colors.surface,
    },
    goalGrid: {
      gap: 10,
    },
    goalButton: {
      minHeight: 62,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    goalButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    goalButtonDisabled: {
      opacity: 0.54,
    },
    goalTextCol: {
      gap: 3,
      flex: 1,
    },
    goalLabel: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    goalLabelActive: {
      color: theme.colors.surface,
    },
    goalLabelDisabled: {
      color: theme.colors.textMuted,
    },
    comingSoon: {
      alignSelf: "flex-start",
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
    },
    stack: {
      gap: 10,
    },
    rowOption: {
      minHeight: 70,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    rowOptionActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    rowOptionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    rowOptionTitleActive: {
      color: theme.colors.surface,
    },
    rowOptionSubtitle: {
      marginTop: 3,
      color: theme.colors.textSecondary,
      fontSize: 13,
    },
    rowOptionSubtitleActive: {
      color: theme.colors.surface,
    },
    flexibleButton: {
      minHeight: 72,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    flexibleButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    flexibleTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    flexibleTitleActive: {
      color: theme.colors.surface,
    },
    flexibleSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    flexibleSubtitleActive: {
      color: theme.colors.surface,
    },
    weekdayGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    weekdayButton: {
      width: "22.8%",
      minHeight: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
    },
    weekdayButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    weekdayButtonDisabled: {
      opacity: 0.55,
    },
    weekdayText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    weekdayTextActive: {
      color: theme.colors.surface,
    },
    helperText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    reviewPanel: {
      borderRadius: 22,
      backgroundColor:
        theme.mode === "dark" ? theme.colors.surface : theme.colors.primary,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : theme.colors.primary,
      ...theme.shadows.card,
    },
    errorBox: {
      borderRadius: 16,
      padding: 14,
      backgroundColor: theme.colors.errorSoft,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.background,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...theme.shadows.primary,
    },
    primaryButtonMuted: {
      opacity: 0.72,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
