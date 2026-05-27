import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Body, {
  type ExtendedBodyPart,
  type Slug,
} from "react-native-body-highlighter";

import { CustomProgramBuilderModal } from "../components/CustomProgramBuilderModal";
import {
  formatProgramWeekdayList,
  getProgramSplitLabel,
  isStoredProgramFeedbackDue,
  readStoredCustomProgramRecord,
  storeCustomProgramRecord,
  type CustomProgramBuildResult,
  type CustomProgramConfig,
  type CustomProgramGenerationMode,
  type StoredCustomProgramRecord,
} from "../lib/customProgram";
import { formatScheduleDateLabel } from "../lib/scheduleTime";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import {
  RECOVERY_MUSCLES,
  RECOVERY_MUSCLE_LABELS,
  RECOVERY_MUSCLE_TO_BODY_SLUGS,
  RECOVERY_STAGE_META,
  type RecoveryStage,
  type MuscleRecoveryState,
  computeRecoveryMap,
  formatLastHit,
} from "../lib/recovery";
import { getTheme, type ThemeMode } from "../theme";
import type { CompletedWorkoutRecord, UserProfile } from "../types";

interface RecoveryMapScreenProps {
  completedWorkouts: ReadonlyArray<CompletedWorkoutRecord>;
  onBuildCustomProgram?: (
    config: CustomProgramConfig,
    options?: {
      existingProgram?: StoredCustomProgramRecord | null;
      generationMode?: CustomProgramGenerationMode;
    },
  ) => Promise<CustomProgramBuildResult>;
  onOpenWorkouts?: () => void;
  profile?: UserProfile | null;
  themeMode?: ThemeMode;
}

/** Recompute the continuous % climb roughly once a minute while mounted. */
const TICK_MS = 60_000;
const STAGE_ORDER: RecoveryStage[] = [
  "fatigued",
  "recovering",
  "almost",
  "fresh",
];

export function RecoveryMapScreen({
  completedWorkouts,
  onBuildCustomProgram,
  onOpenWorkouts,
  profile = null,
  themeMode = "light",
}: RecoveryMapScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const accent = theme.colors.primary;
  const { width: screenWidth } = useWindowDimensions();
  const isDark = theme.mode === "dark";

  const [now, setNow] = useState(() => Date.now());
  const [isBuilderVisible, setIsBuilderVisible] = useState(false);
  const [builderGenerationMode, setBuilderGenerationMode] =
    useState<CustomProgramGenerationMode>("restart");
  const [storedProgram, setStoredProgram] =
    useState<StoredCustomProgramRecord | null>(null);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackWentWell, setFeedbackWentWell] = useState("");
  const [feedbackChangeNext, setFeedbackChangeNext] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) {
      setStoredProgram(null);
      return;
    }
    let cancelled = false;
    void readStoredCustomProgramRecord(userId).then((record) => {
      if (!cancelled) {
        setStoredProgram(record);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const recoveryMap = useMemo(
    () => computeRecoveryMap(completedWorkouts, now),
    [completedWorkouts, now],
  );

  // Each body part can take one color; if a muscle maps to multiple slugs
  // (e.g. back = upper-back + lower-back + trapezius), we paint all of them
  // the same recovery shade so the region reads as a single group.
  const bodyData = useMemo<ExtendedBodyPart[]>(() => {
    const parts: ExtendedBodyPart[] = [];
    for (const muscle of RECOVERY_MUSCLES) {
      const state = recoveryMap[muscle];
      // Fresh muscles render in the body's default fill so the figure doesn't
      // become a sea of green on the first load.
      if (state.stage === "fresh") {
        continue;
      }
      const color = RECOVERY_STAGE_META[state.stage].color;
      for (const slug of RECOVERY_MUSCLE_TO_BODY_SLUGS[muscle]) {
        parts.push({ slug: slug as Slug, color });
      }
    }
    return parts;
  }, [recoveryMap]);

  const recoveryStates = useMemo(
    () => RECOVERY_MUSCLES.map((muscle) => recoveryMap[muscle]),
    [recoveryMap],
  );
  const recoveringStates = useMemo(
    () => recoveryStates.filter((state) => state.stage !== "fresh"),
    [recoveryStates],
  );
  const freshStates = useMemo(
    () => recoveryStates.filter((state) => state.stage === "fresh"),
    [recoveryStates],
  );
  const isAllFresh = recoveringStates.length === 0;

  // Two bodies must fit inside the horizontal padding of the card. The default
  // wrapper is 200px wide at scale 1; we leave a little gutter between them.
  const bodyScale = useMemo(() => {
    const horizontalPadding = 16 + 16; // screen padding both sides
    const gutter = 12;
    const available = Math.max(0, screenWidth - horizontalPadding - gutter);
    const perBody = available / 2;
    return Math.max(0.55, Math.min(0.95, perBody / 200));
  }, [screenWidth]);

  const defaultFill = isDark ? "#22201E" : "#E5ECF7";
  const defaultStroke = isDark ? "#3A3631" : "#C9D5E6";
  const isFeedbackDue = isStoredProgramFeedbackDue(
    storedProgram,
    new Date(now),
  );

  const openBuilder = (mode: CustomProgramGenerationMode) => {
    setBuilderGenerationMode(mode);
    setIsBuilderVisible(true);
  };

  const handleBuildPress = () => {
    if (!storedProgram) {
      openBuilder("restart");
      return;
    }
    Alert.alert(
      "Rebuild your program?",
      "Update keeps this training block going from your current week. Start over removes the remaining scheduled program workouts and begins again at Week 1.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update current block",
          onPress: () => openBuilder("update"),
        },
        {
          text: "Start over",
          style: "destructive",
          onPress: () => openBuilder("restart"),
        },
      ],
    );
  };

  const handleGenerateProgram = async (config: CustomProgramConfig) => {
    if (!profile?.id || !onBuildCustomProgram) {
      throw new Error("Sign in before building a custom program.");
    }
    const result = await onBuildCustomProgram(config, {
      existingProgram: storedProgram,
      generationMode: builderGenerationMode,
    });
    const record: StoredCustomProgramRecord = {
      ...result,
      builtAt: new Date().toISOString(),
      feedback: null,
    };
    await storeCustomProgramRecord(profile.id, record);
    setStoredProgram(record);
    return result;
  };

  const openFeedback = () => {
    setFeedbackRating(null);
    setFeedbackWentWell("");
    setFeedbackChangeNext("");
    setIsFeedbackVisible(true);
  };

  const saveFeedback = () => {
    if (!profile?.id || !storedProgram) {
      setIsFeedbackVisible(false);
      return;
    }
    const nextRecord: StoredCustomProgramRecord = {
      ...storedProgram,
      feedback: {
        rating: feedbackRating,
        wentWell: feedbackWentWell.trim(),
        changeNext: feedbackChangeNext.trim(),
        submittedAt: new Date().toISOString(),
      },
    };
    setStoredProgram(nextRecord);
    setIsFeedbackVisible(false);
    void storeCustomProgramRecord(profile.id, nextRecord).catch(() => undefined);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarScrollPad },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: accent }]}>RECOVERY MAP</Text>
          <Text style={styles.title}>Coach</Text>
          <Text style={styles.subtitle}>
            Track which muscles are still cooked vs. ready to train.
          </Text>
        </View>
      </View>

      <ProgramBuilderCard
        isFeedbackDue={isFeedbackDue}
        onBuild={handleBuildPress}
        onFeedback={openFeedback}
        record={storedProgram}
        themeMode={themeMode}
      />

      <View style={styles.bodyCard}>
        <View style={styles.bodyRow}>
          <View style={styles.bodyColumn}>
            <Body
              data={bodyData}
              gender="male"
              side="front"
              scale={bodyScale}
              border={defaultStroke}
              defaultFill={defaultFill}
              defaultStroke={defaultStroke}
            />
            <Text style={styles.bodyCaption}>Front</Text>
          </View>
          <View style={styles.bodyColumn}>
            <Body
              data={bodyData}
              gender="male"
              side="back"
              scale={bodyScale}
              border={defaultStroke}
              defaultFill={defaultFill}
              defaultStroke={defaultStroke}
            />
            <Text style={styles.bodyCaption}>Back</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          {STAGE_ORDER.map((stage) => {
            const meta = RECOVERY_STAGE_META[stage];
            return (
              <View key={stage} style={styles.legendChip}>
                <View
                  style={[styles.legendDot, { backgroundColor: meta.color }]}
                />
                <Text style={styles.legendLabel}>{meta.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {isAllFresh ? (
        <AllFreshCard themeMode={themeMode} />
      ) : (
        <NeedsAttentionCard
          states={recoveringStates}
          themeMode={themeMode}
          totalCount={RECOVERY_MUSCLES.length}
        />
      )}

      {freshStates.length > 0 ? (
        <ReadyToTrainCard states={freshStates} themeMode={themeMode} />
      ) : null}

      {profile ? (
        <CustomProgramBuilderModal
          initialConfig={storedProgram?.config ?? null}
          generationMode={builderGenerationMode}
          onClose={() => setIsBuilderVisible(false)}
          onGenerate={handleGenerateProgram}
          onOpenWorkouts={() => {
            setIsBuilderVisible(false);
            onOpenWorkouts?.();
          }}
          profile={profile}
          themeMode={themeMode}
          visible={isBuilderVisible}
        />
      ) : null}

      <ProgramFeedbackModal
        changeNext={feedbackChangeNext}
        onChangeNext={setFeedbackChangeNext}
        onClose={() => setIsFeedbackVisible(false)}
        onRebuild={() => {
          setIsFeedbackVisible(false);
          setIsBuilderVisible(true);
        }}
        onSave={saveFeedback}
        onSetRating={setFeedbackRating}
        onWentWell={setFeedbackWentWell}
        rating={feedbackRating}
        themeMode={themeMode}
        visible={isFeedbackVisible}
        wentWell={feedbackWentWell}
      />
    </ScrollView>
  );
}

function ProgramBuilderCard({
  isFeedbackDue,
  onBuild,
  onFeedback,
  record,
  themeMode,
}: {
  isFeedbackDue: boolean;
  onBuild: () => void;
  onFeedback: () => void;
  record: StoredCustomProgramRecord | null;
  themeMode: ThemeMode;
}) {
  const theme = getTheme(themeMode);
  const styles = createProgramCardStyles(theme);
  const summary = record
    ? `${record.config.frequency} days/week • ${getProgramSplitLabel(
        record.config.frequency,
      )}`
    : "10 weeks, built from your goals.";

  return (
    <View style={styles.card}>
      <View style={styles.iconBubble}>
        <Ionicons color={theme.colors.surface} name="sparkles" size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Custom Program</Text>
        <Text style={styles.title}>Build Custom Program Based on My Goals</Text>
        <Text style={styles.body}>{summary}</Text>
        {record ? (
          <Text style={styles.meta}>
            {formatScheduleDateLabel(record.startDateIso)} to{" "}
            {formatScheduleDateLabel(record.endDateIso)} •{" "}
            {formatProgramWeekdayList(record.config.weekdays)}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {isFeedbackDue ? (
          <Pressable onPress={onFeedback} style={styles.secondaryButton}>
            <Ionicons
              color={theme.colors.primary}
              name="chatbubble-ellipses-outline"
              size={16}
            />
            <Text style={styles.secondaryButtonText}>Feedback</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onBuild} style={styles.primaryButton}>
          <Ionicons color={theme.colors.surface} name="calendar" size={16} />
          <Text style={styles.primaryButtonText}>
            {record ? "Rebuild" : "Build"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProgramFeedbackModal({
  changeNext,
  onChangeNext,
  onClose,
  onRebuild,
  onSave,
  onSetRating,
  onWentWell,
  rating,
  themeMode,
  visible,
  wentWell,
}: {
  changeNext: string;
  onChangeNext: (value: string) => void;
  onClose: () => void;
  onRebuild: () => void;
  onSave: () => void;
  onSetRating: (value: number) => void;
  onWentWell: (value: string) => void;
  rating: number | null;
  themeMode: ThemeMode;
  visible: boolean;
  wentWell: string;
}) {
  const theme = getTheme(themeMode);
  const styles = createFeedbackStyles(theme);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Ionicons color={theme.colors.textMuted} name="close" size={20} />
          </Pressable>
          <Text style={styles.eyebrow}>Training Block</Text>
          <Text style={styles.title}>How did this training block go?</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((value) => {
              const active = rating === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => onSetRating(value)}
                  style={[
                    styles.ratingButton,
                    active ? styles.ratingButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.ratingText,
                      active ? styles.ratingTextActive : null,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            multiline
            onChangeText={onWentWell}
            placeholder="What went well?"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={wentWell}
          />
          <TextInput
            multiline
            onChangeText={onChangeNext}
            placeholder="What would you change?"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={changeNext}
          />
          <View style={styles.actionRow}>
            <Pressable onPress={onRebuild} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Rebuild</Text>
            </Pressable>
            <Pressable onPress={onSave} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Save feedback</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AllFreshCard({ themeMode }: { themeMode: ThemeMode }) {
  const theme = getTheme(themeMode);
  const styles = createRecoverySummaryStyles(theme);

  return (
    <View style={styles.allFreshCard}>
      <View style={styles.freshIconBox}>
        <Ionicons color={theme.colors.success} name="checkmark" size={22} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryTitle}>All muscles fresh</Text>
        <Text style={styles.summarySubtitle}>Train any group today.</Text>
      </View>
    </View>
  );
}

function NeedsAttentionCard({
  states,
  themeMode,
  totalCount,
}: {
  states: MuscleRecoveryState[];
  themeMode: ThemeMode;
  totalCount: number;
}) {
  const theme = getTheme(themeMode);
  const styles = createRecoverySummaryStyles(theme);

  return (
    <View style={styles.needsCard}>
      <View style={styles.needsHeader}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>Still recovering</Text>
          <Text style={styles.summarySubtitle}>
            Train around these, or train them lightly.
          </Text>
        </View>
        <Text style={styles.countText}>
          {states.length} of {totalCount}
        </Text>
      </View>
      <View style={styles.bars}>
        {states.map((state) => (
          <RecoveryBar
            key={state.muscle}
            state={state}
            themeMode={themeMode}
          />
        ))}
      </View>
    </View>
  );
}

function ReadyToTrainCard({
  states,
  themeMode,
}: {
  states: MuscleRecoveryState[];
  themeMode: ThemeMode;
}) {
  const theme = getTheme(themeMode);
  const styles = createRecoverySummaryStyles(theme);

  return (
    <View style={styles.readyCard}>
      <View style={styles.readyHeader}>
        <View style={styles.readyTitleRow}>
          <View style={styles.readyDot} />
          <Text style={styles.readyTitle}>Ready to train</Text>
        </View>
        <Text style={styles.countText}>
          {states.length} {states.length === 1 ? "group" : "groups"}
        </Text>
      </View>
      <View style={styles.chipRow}>
        {states.map((state) => (
          <View key={state.muscle} style={styles.muscleChip}>
            <Text style={styles.muscleChipText}>
              {RECOVERY_MUSCLE_LABELS[state.muscle]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RecoveryBar({
  state,
  themeMode,
}: {
  state: MuscleRecoveryState;
  themeMode: ThemeMode;
}) {
  const theme = getTheme(themeMode);
  const styles = createBarStyles(theme);
  const meta = RECOVERY_STAGE_META[state.stage];
  const label = RECOVERY_MUSCLE_LABELS[state.muscle];
  const percent = Math.round(state.percent);

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.muscle}>{label}</Text>
        <View style={styles.stagePill}>
          <View
            style={[styles.stageDot, { backgroundColor: meta.color }]}
          />
          <Text style={[styles.stageLabel, { color: meta.color }]}>
            {meta.label}
          </Text>
          <Text style={styles.percent}>{percent}%</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${percent}%`,
              backgroundColor: meta.color,
            },
          ]}
        />
      </View>

      <Text style={styles.lastHit}>{getRecoveryBarDetail(state)}</Text>
    </View>
  );
}

function getRecoveryBarDetail(state: MuscleRecoveryState) {
  if (state.stage === "fresh") {
    return "Ready to train.";
  }

  const suffixByStage: Record<Exclude<RecoveryStage, "fresh">, string> = {
    fatigued: "just trained",
    recovering: "give it more time",
    almost: "train lightly",
  };

  return `${formatLastHit(state)} - ${suffixByStage[state.stage]}`;
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 24,
      gap: 16,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 2,
      marginTop: 4,
      marginBottom: 4,
    },
    titleBlock: {
      gap: 6,
      flex: 1,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    title: {
      fontSize: 34,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      color: theme.colors.textPrimary,
      lineHeight: 38,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    bodyCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingVertical: 20,
      paddingHorizontal: 16,
      gap: 16,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    bodyRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: 12,
    },
    bodyColumn: {
      alignItems: "center",
      gap: 6,
    },
    bodyCaption: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: theme.colors.textMuted,
    },
    legendRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
    },
    legendChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendLabel: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      color: theme.colors.textPrimary,
    },
  });

const createRecoverySummaryStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    allFreshCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    needsCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingVertical: 20,
      paddingHorizontal: 18,
      gap: 16,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    readyCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    freshIconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.successSoft,
      borderWidth: 1,
      borderColor: theme.colors.success,
    },
    summaryCopy: {
      flex: 1,
      gap: 3,
    },
    summaryTitle: {
      fontSize: 18,
      lineHeight: 22,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      color: theme.colors.textPrimary,
    },
    summarySubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    needsHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    bars: {
      gap: 16,
    },
    readyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    readyTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    readyDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.colors.success,
    },
    readyTitle: {
      fontSize: 16,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      color: theme.colors.textPrimary,
    },
    countText: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      color: theme.colors.textMuted,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    muscleChip: {
      minHeight: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surfaceMuted,
    },
    muscleChipText: {
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      color: theme.colors.textPrimary,
    },
  });

const createBarStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    row: {
      gap: 6,
    },
    rowHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    muscle: {
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      color: theme.colors.textPrimary,
    },
    stagePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    stageDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    stageLabel: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    percent: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      color: theme.colors.textSecondary,
      marginLeft: 4,
      minWidth: 36,
      textAlign: "right",
    },
    track: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: 999,
    },
    lastHit: {
      fontSize: 11,
      color: theme.colors.textMuted,
    },
  });

const createProgramCardStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    card: {
      borderRadius: 24,
      backgroundColor: theme.colors.primary,
      padding: 18,
      gap: 14,
      ...theme.shadows.primary,
    },
    iconBubble: {
      width: 42,
      height: 42,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    copy: {
      gap: 5,
    },
    eyebrow: {
      color: theme.colors.surface,
      opacity: 0.78,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.surface,
      fontSize: 22,
      lineHeight: 27,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    body: {
      color: theme.colors.surface,
      opacity: 0.88,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    meta: {
      color: theme.colors.surface,
      opacity: 0.72,
      fontSize: 12,
      lineHeight: 17,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    primaryButton: {
      minHeight: 44,
      borderRadius: 16,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
      backgroundColor: "rgba(255, 255, 255, 0.18)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.25)",
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 16,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
      backgroundColor: theme.colors.surface,
    },
    secondaryButtonText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });

const createFeedbackStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.overlay,
      padding: 22,
    },
    card: {
      width: "100%",
      maxWidth: 390,
      borderRadius: 26,
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 13,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
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
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.3,
      textTransform: "uppercase",
      paddingRight: 34,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 24,
      lineHeight: 29,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      paddingRight: 28,
    },
    ratingRow: {
      flexDirection: "row",
      gap: 8,
    },
    ratingButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surfaceMuted,
    },
    ratingButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    ratingText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    ratingTextActive: {
      color: theme.colors.surface,
    },
    input: {
      minHeight: 86,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 19,
      textAlignVertical: "top",
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
    },
    primaryButton: {
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
      fontWeight: "800",
    },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surfaceMuted,
    },
    secondaryButtonText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
