import { useMemo, useRef } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { InlineEditableText } from "../components/InlineEditableText";
import { getCreatorDisplayLabel, titleCase } from "../lib/fitfo";
import {
  MUSCLE_GROUP_LABELS,
  getMuscleGroupsForPlan,
} from "../lib/muscleGroups";
import { getTheme, type ThemeMode } from "../theme";
import type {
  SavedRoutinePreview,
  WorkoutBlock,
  WorkoutExercise,
  WorkoutPlan,
} from "../types";

/**
 * Partial inline-edit patch dispatched to the parent. The parent is
 * responsible for merging it into local state AND PATCH-ing the backend
 * (saved vs scheduled workout) — the screen stays dumb about persistence.
 */
export interface SavedRoutineUpdate {
  title?: string;
  description?: string;
  metaLeft?: string;
  metaRight?: string;
  workoutPlan?: WorkoutPlan;
}

interface SavedWorkoutDetailScreenProps {
  onBack: () => void;
  onRemove?: () => void;
  /**
   * Open the schedule-picker modal for this routine. Omitted when the
   * detail screen represents an already-scheduled instance (rescheduling
   * is handled via unschedule + schedule from the saved row).
   */
  onSchedule?: () => void;
  /** Window rect for hub tour coachmark around Start Session. */
  onStartSessionMeasured?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null) => void;
  onStart: () => void;
  /**
   * Fired whenever the user commits an inline edit (on blur / submit). The
   * parent should update its cached routine optimistically and fire the
   * corresponding PATCH. When omitted, every field renders as read-only.
   */
  onUpdate?: (updates: SavedRoutineUpdate) => void;
  removeLabel?: string;
  routine: SavedRoutinePreview;
  themeMode?: ThemeMode;
}

type TargetMetric = "reps" | "time";

const DEFAULT_TARGET_REPS = 10;
const DEFAULT_TARGET_DURATION_SEC = 30;

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

function formatScheduledDate(
  isoDate: string | undefined,
  scheduledTimeMinutes?: number,
): string | null {
  if (!isoDate) {
    return null;
  }
  try {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    const dateLabel = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (
      typeof scheduledTimeMinutes === "number" &&
      scheduledTimeMinutes >= 0 &&
      scheduledTimeMinutes <= 1439
    ) {
      const hours = Math.floor(scheduledTimeMinutes / 60);
      const minutes = scheduledTimeMinutes % 60;
      const timeDate = new Date(year, (month || 1) - 1, day || 1, hours, minutes);
      const timeLabel = timeDate.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${dateLabel} at ${timeLabel}`;
    }
    return dateLabel;
  } catch {
    return isoDate;
  }
}

/**
 * Immutably replaces one exercise inside a plan. We build a new plan with
 * fresh block / exercise references so React sees the props as changed and
 * re-renders the relevant rows.
 */
function replaceExercise(
  plan: WorkoutPlan,
  blockIndex: number,
  exerciseIndex: number,
  next: WorkoutExercise,
): WorkoutPlan {
  const blocks = plan.blocks.map((block, bIdx) => {
    if (bIdx !== blockIndex) {
      return block;
    }
    const exercises = (block.exercises || []).map((exercise, eIdx) =>
      eIdx === exerciseIndex ? next : exercise,
    );
    return { ...block, exercises };
  });
  return { ...plan, blocks };
}

function replaceBlock(
  plan: WorkoutPlan,
  blockIndex: number,
  next: WorkoutBlock,
): WorkoutPlan {
  const blocks = plan.blocks.map((block, bIdx) =>
    bIdx === blockIndex ? next : block,
  );
  return { ...plan, blocks };
}

function createDefaultWorkoutPlan(title: string): WorkoutPlan {
  return {
    title,
    workout_type: "custom",
    muscle_groups: [],
    equipment: [],
    blocks: [{ name: null, exercises: [] }],
    notes: null,
  };
}

function createExerciseDraft(): WorkoutExercise {
  return {
    name: "New Exercise",
    sets: 3,
    reps: DEFAULT_TARGET_REPS,
    duration_sec: null,
    rest_sec: null,
    notes: null,
  };
}

function ensurePlanHasBlock(plan: WorkoutPlan): WorkoutPlan {
  if (plan.blocks.length > 0) {
    return plan;
  }

  return {
    ...plan,
    blocks: [{ name: null, exercises: [] }],
  };
}

function appendExerciseToPlan(plan: WorkoutPlan): WorkoutPlan {
  const nextPlan = ensurePlanHasBlock(plan);
  const blockIndex = Math.max(0, nextPlan.blocks.length - 1);
  const block = nextPlan.blocks[blockIndex];

  return replaceBlock(nextPlan, blockIndex, {
    ...block,
    exercises: [...(block.exercises || []), createExerciseDraft()],
  });
}

function removeExerciseFromPlan(
  plan: WorkoutPlan,
  blockIndex: number,
  exerciseIndex: number,
): WorkoutPlan {
  const block = plan.blocks[blockIndex];
  if (!block) {
    return plan;
  }

  return replaceBlock(plan, blockIndex, {
    ...block,
    exercises: (block.exercises || []).filter((_, index) => index !== exerciseIndex),
  });
}

/**
 * Parse a user-typed integer field. Empty input clears the value; non-numeric
 * or negative input is rejected by returning `undefined` so we preserve the
 * existing value.
 */
function parseIntegerInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  return n;
}

export function SavedWorkoutDetailScreen({
  onBack,
  onRemove,
  onSchedule,
  onStart,
  onStartSessionMeasured,
  onUpdate,
  removeLabel = "Unsave",
  routine,
  themeMode = "light",
}: SavedWorkoutDetailScreenProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const startSessionMeasureRef = useRef<View | null>(null);

  const plan = routine.workoutPlan;
  const creatorHandle = getCreatorDisplayLabel(routine.sourceUrl, routine.title);
  const sourceUrl = routine.sourceUrl || null;
  const platform = getSourcePlatform(sourceUrl);
  const scheduledLabel = formatScheduledDate(
    routine.scheduledFor,
    routine.scheduledTimeMinutes,
  );
  const equipment = (plan?.equipment || []).filter(
    (item): item is string => Boolean(item && item.trim()),
  );
  const muscleGroups = getMuscleGroupsForPlan(plan);
  const planNotes = plan?.notes?.trim() || "";
  const totalExercises = (plan?.blocks || []).reduce(
    (sum, block) => sum + (block.exercises?.length || 0),
    0,
  );
  // App Store Guideline 1.2 / 5.2 — mark any workout that was produced by our
  // LLM pipeline so the user knows it's AI-generated and may contain errors.
  // Manual workouts (no source URL, no parsed plan) don't get the badge.
  const isAiGenerated = Boolean(sourceUrl && plan && totalExercises > 0);

  const canEdit = Boolean(onUpdate);

  // Stable references to the commit handlers so InlineEditableText's `onSave`
  // doesn't churn on every render.
  const handleSaveTitle = useMemo(
    () => (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === routine.title) {
        return;
      }
      onUpdate?.({ title: trimmed });
    },
    [onUpdate, routine.title],
  );

  const handleSaveDescription = useMemo(
    () => (next: string) => {
      if (next === routine.description) {
        return;
      }
      onUpdate?.({ description: next });
    },
    [onUpdate, routine.description],
  );

  const handleSavePlanNotes = useMemo(
    () => (next: string) => {
      if (!plan) {
        return;
      }
      const normalized = next.trim() ? next : "";
      if ((plan.notes || "") === normalized) {
        return;
      }
      onUpdate?.({ workoutPlan: { ...plan, notes: normalized || null } });
    },
    [onUpdate, plan],
  );

  const handleAddExercise = () => {
    if (!canEdit) {
      return;
    }

    const basePlan = plan ?? createDefaultWorkoutPlan(routine.title);
    onUpdate?.({ workoutPlan: appendExerciseToPlan(basePlan) });
  };

  const handleReportWorkout = () => {
    const subject = encodeURIComponent(
      `Report AI-parsed workout: ${routine.title}`,
    );
    const bodyLines = [
      "Tell us what's wrong with this AI-parsed workout.",
      "",
      `Workout: ${routine.title}`,
      sourceUrl ? `Source: ${sourceUrl}` : "Source: (not provided)",
      `Routine ID: ${routine.id}`,
      "",
      "Describe the issue:",
      "",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    const mailto = `mailto:support@fitfo.app?subject=${subject}&body=${body}`;
    Linking.openURL(mailto).catch(() => {
      Alert.alert(
        "Email unavailable",
        "Send a note to support@fitfo.app with the workout title and a description of what's wrong and we'll fix it.",
      );
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons color={theme.colors.primary} name="chevron-back" size={18} />
        </Pressable>
        <Image
          resizeMode="contain"
          source={require("../../assets/vector-no-bg.png")}
          style={styles.brandLogo}
        />
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {routine.badgeLabel ||
                (routine.scheduledWorkoutId ? "Scheduled" : "Saved")}
            </Text>
          </View>
        </View>
        {canEdit ? (
          <InlineEditableText
            value={routine.title}
            onSave={handleSaveTitle}
            placeholder="Untitled workout"
            maxLength={200}
            textStyle={styles.title}
            themeMode={themeMode}
            hideHint
          />
        ) : (
          <Text style={styles.title}>{routine.title}</Text>
        )}
        {scheduledLabel ? (
          <Text style={styles.completedAt}>Scheduled for {scheduledLabel}</Text>
        ) : null}
        {canEdit ? (
          <InlineEditableText
            value={routine.description || ""}
            onSave={handleSaveDescription}
            placeholder="Add a description"
            multiline
            maxLength={2000}
            textStyle={styles.summary}
            placeholderStyle={styles.summaryPlaceholder}
            themeMode={themeMode}
            hideHint
          />
        ) : routine.description ? (
          <Text style={styles.summary}>{routine.description}</Text>
        ) : null}

        <View style={styles.heroStats}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Summary</Text>
            {canEdit ? (
              <InlineEditableText
                value={routine.metaLeft || ""}
                onSave={(next) => {
                  if (next === routine.metaLeft) {
                    return;
                  }
                  onUpdate?.({ metaLeft: next });
                }}
                placeholder="Summary"
                maxLength={120}
                textStyle={styles.heroStatValue}
                themeMode={themeMode}
                hideHint
              />
            ) : (
              <Text style={styles.heroStatValue}>{routine.metaLeft}</Text>
            )}
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>Details</Text>
            {canEdit ? (
              <InlineEditableText
                value={routine.metaRight || ""}
                onSave={(next) => {
                  if (next === routine.metaRight) {
                    return;
                  }
                  onUpdate?.({ metaRight: next });
                }}
                placeholder="Details"
                maxLength={120}
                textStyle={styles.heroStatValue}
                themeMode={themeMode}
                hideHint
              />
            ) : (
              <Text style={styles.heroStatValue}>{routine.metaRight}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.primaryActionRow}>
        <View
          collapsable={false}
          ref={(node) => {
            startSessionMeasureRef.current = node;
          }}
          onLayout={() => {
            if (!onStartSessionMeasured) {
              return;
            }
            startSessionMeasureRef.current?.measureInWindow?.((x, y, width, height) => {
              if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(width) ||
                !Number.isFinite(height)
              ) {
                onStartSessionMeasured(null);
                return;
              }
              onStartSessionMeasured({ x, y, width, height });
            });
          }}
        >
          <Pressable onPress={onStart} style={styles.primaryButton}>
            <Ionicons color={theme.colors.surface} name="play" size={16} />
            <Text style={styles.primaryButtonText}>Start Session</Text>
          </Pressable>
        </View>
        {onSchedule ? (
          <Pressable
            onPress={onSchedule}
            style={({ pressed }) => [
              styles.iconButton,
              styles.scheduleIconButton,
              pressed ? styles.iconButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Schedule this workout"
            hitSlop={6}
          >
            <Ionicons
              color={theme.colors.primary}
              name="calendar-outline"
              size={22}
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
              color={theme.colors.error}
              name="close"
              size={22}
            />
          </Pressable>
        ) : null}
      </View>

      {(muscleGroups.length > 0 ||
        equipment.length > 0 ||
        creatorHandle ||
        sourceUrl ||
        canEdit) && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>Overview</Text>
          </View>

          {muscleGroups.length > 0 ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Muscle Groups</Text>
              <View style={styles.chipRow}>
                {muscleGroups.map((group) => (
                  <View key={group} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>
                      {MUSCLE_GROUP_LABELS[group]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {equipment.length > 0 ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Equipment</Text>
              <View style={styles.chipRow}>
                {equipment.map((item) => (
                  <View key={item} style={styles.detailChip}>
                    <Text style={styles.detailChipText}>{titleCase(item)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {creatorHandle || sourceUrl ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Source</Text>
              {creatorHandle ? (
                <Text style={styles.detailValue}>{creatorHandle}</Text>
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
                    color={theme.colors.primary}
                    name={getSourceIconName(platform)}
                    size={14}
                  />
                  <Text style={styles.sourceButtonText}>
                    {getSourceLabel(platform)}
                  </Text>
                  <Ionicons
                    color={theme.colors.primary}
                    name="open-outline"
                    size={13}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {plan && (canEdit || planNotes) ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Notes</Text>
              {canEdit ? (
                <InlineEditableText
                  value={planNotes}
                  onSave={handleSavePlanNotes}
                  placeholder="Add workout notes (cues, tempo, etc.)"
                  multiline
                  maxLength={2000}
                  textStyle={styles.detailBody}
                  themeMode={themeMode}
                />
              ) : (
                <Text style={styles.detailBody}>{planNotes}</Text>
              )}
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Exercises</Text>
        </View>

        {plan && totalExercises > 0 ? (
          <View style={styles.exerciseList}>
            {(plan.blocks || []).map((block, blockIndex) => {
              const exercises = block.exercises || [];
              if (exercises.length === 0) {
                return null;
              }

              const handleSaveBlockName = (next: string) => {
                const trimmed = next.trim();
                const nextValue = trimmed.length > 0 ? trimmed : null;
                if ((block.name || null) === nextValue) {
                  return;
                }
                onUpdate?.({
                  workoutPlan: replaceBlock(plan, blockIndex, {
                    ...block,
                    name: nextValue,
                  }),
                });
              };

              return (
                <View
                  key={`${block.name || "block"}-${blockIndex}`}
                  style={styles.blockCard}
                >
                  {canEdit ? (
                    <InlineEditableText
                      value={block.name || ""}
                      onSave={handleSaveBlockName}
                      placeholder="Name this block"
                      maxLength={120}
                      textStyle={styles.blockName}
                      themeMode={themeMode}
                    />
                  ) : block.name ? (
                    <Text style={styles.blockName}>{block.name}</Text>
                  ) : null}
                  {exercises.map((exercise, exerciseIndex) => {
                    // Each of these handlers captures the current indices so
                    // on-blur saves always patch the right exercise even if
                    // the user edits several in rapid succession.
                    const saveExercise = (next: WorkoutExercise) => {
                      onUpdate?.({
                        workoutPlan: replaceExercise(
                          plan,
                          blockIndex,
                          exerciseIndex,
                          next,
                        ),
                      });
                    };

                    const handleSaveName = (nextName: string) => {
                      const trimmed = nextName.trim();
                      if (!trimmed || trimmed === exercise.name) {
                        return;
                      }
                      saveExercise({ ...exercise, name: trimmed });
                    };

                    const handleSaveNotes = (nextNotes: string) => {
                      const normalized = nextNotes.trim()
                        ? nextNotes
                        : "";
                      if ((exercise.notes || "") === normalized) {
                        return;
                      }
                      saveExercise({
                        ...exercise,
                        notes: normalized || null,
                      });
                    };

                    const handleSaveIntField = (
                      field: "sets" | "reps" | "duration_sec" | "rest_sec",
                    ) => (raw: string) => {
                      const parsed = parseIntegerInput(raw);
                      if (parsed === undefined) {
                        return;
                      }
                      if (exercise[field] === parsed) {
                        return;
                      }
                      saveExercise({
                        ...exercise,
                        [field]: parsed,
                        ...(field === "reps" && parsed != null
                          ? { duration_sec: null }
                          : {}),
                        ...(field === "duration_sec" && parsed != null
                          ? { reps: null }
                          : {}),
                      });
                    };

                    const handleSelectMetric = (metric: TargetMetric) => {
                      if (metric === "time") {
                        saveExercise({
                          ...exercise,
                          sets: exercise.sets ?? 3,
                          reps: null,
                          duration_sec:
                            exercise.duration_sec ?? DEFAULT_TARGET_DURATION_SEC,
                        });
                        return;
                      }

                      saveExercise({
                        ...exercise,
                        sets: exercise.sets ?? 3,
                        reps: exercise.reps ?? DEFAULT_TARGET_REPS,
                        duration_sec: null,
                      });
                    };

                    const handleRemoveExercise = () => {
                      Alert.alert(
                        "Remove exercise?",
                        `Remove ${titleCase(exercise.name) || exercise.name} from this saved workout?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => {
                              onUpdate?.({
                                workoutPlan: removeExerciseFromPlan(
                                  plan,
                                  blockIndex,
                                  exerciseIndex,
                                ),
                              });
                            },
                          },
                        ],
                      );
                    };

                    return (
                      <View
                        key={`${exercise.name}-${exerciseIndex}`}
                        style={styles.exerciseCard}
                      >
                        <View style={styles.exerciseHeader}>
                          <View style={styles.exerciseIcon}>
                            <Ionicons
                              color={theme.colors.primary}
                              name="barbell-outline"
                              size={18}
                            />
                          </View>
                          <View style={styles.exerciseCopy}>
                            {canEdit ? (
                              <InlineEditableText
                                value={
                                  titleCase(exercise.name) || exercise.name
                                }
                                onSave={handleSaveName}
                                placeholder="Exercise name"
                                maxLength={120}
                                textStyle={styles.exerciseName}
                                themeMode={themeMode}
                                hideHint
                              />
                            ) : (
                              <Text style={styles.exerciseName}>
                                {titleCase(exercise.name) || exercise.name}
                              </Text>
                            )}
                            <ExerciseTargetRow
                              exercise={exercise}
                              canEdit={canEdit}
                              themeMode={themeMode}
                              onSelectMetric={handleSelectMetric}
                              onSaveField={handleSaveIntField}
                              styles={styles}
                            />
                          </View>
                          {canEdit ? (
                            <Pressable
                              onPress={handleRemoveExercise}
                              style={styles.exerciseRemoveButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${exercise.name}`}
                            >
                              <Ionicons
                                color={theme.colors.error}
                                name="close"
                                size={18}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                        {canEdit || exercise.notes ? (
                          <View style={styles.exerciseNoteCard}>
                            <Text style={styles.exerciseNoteLabel}>
                              Coach Notes
                            </Text>
                            {canEdit ? (
                              <InlineEditableText
                                value={exercise.notes || ""}
                                onSave={handleSaveNotes}
                                placeholder="Add form cues, tempo, or a reminder"
                                multiline
                                maxLength={1000}
                                textStyle={styles.exerciseNoteBody}
                                themeMode={themeMode}
                              />
                            ) : (
                              <Text style={styles.exerciseNoteBody}>
                                {exercise.notes}
                              </Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons
              color={theme.colors.primary}
              name="reader-outline"
              size={20}
            />
            <Text style={styles.emptyTitle}>No exercises parsed</Text>
            <Text style={styles.emptyBody}>
              The parser wasn&apos;t able to extract specific exercises for this
              workout. {canEdit ? "Add them here before you start." : "You can still start a session and log them manually."}
            </Text>
          </View>
        )}
        {canEdit ? (
          <Pressable onPress={handleAddExercise} style={styles.addExerciseButton}>
            <Ionicons color={theme.colors.surface} name="add" size={18} />
            <Text style={styles.addExerciseButtonText}>Add Exercise</Text>
          </Pressable>
        ) : null}
      </View>

      {isAiGenerated ? (
        <View style={styles.aiDisclosureCard}>
          <View style={styles.aiDisclosureHeader}>
            <View style={styles.aiDisclosureBadge}>
              <Text style={styles.aiDisclosureBadgeText}>AI-Parsed</Text>
            </View>
            <Pressable onPress={handleReportWorkout} hitSlop={10}>
              <Text style={styles.aiDisclosureReport}>Report an issue</Text>
            </Pressable>
          </View>
          <Text style={styles.aiDisclosureBody}>
            This workout was auto-extracted from a video by our AI. Sets, reps,
            and exercise names may be inaccurate, verify before training and
            adjust weights to what&apos;s safe for you.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * Renders the sets × reps / duration / rest "target" row. In edit mode each
 * number becomes its own tiny inline input so the user can change one value
 * without retyping the whole string.
 */
function ExerciseTargetRow({
  exercise,
  canEdit,
  themeMode,
  onSelectMetric,
  onSaveField,
  styles,
}: {
  exercise: WorkoutExercise;
  canEdit: boolean;
  themeMode: ThemeMode;
  onSelectMetric: (metric: TargetMetric) => void;
  onSaveField: (
    field: "sets" | "reps" | "duration_sec" | "rest_sec",
  ) => (raw: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!canEdit) {
    const parts: string[] = [];
    if (exercise.sets != null && exercise.reps != null) {
      parts.push(`${exercise.sets} × ${exercise.reps} reps`);
    } else if (exercise.sets != null && exercise.duration_sec != null) {
      parts.push(`${exercise.sets} × ${exercise.duration_sec}s`);
    } else if (exercise.sets != null) {
      parts.push(`${exercise.sets} sets`);
    } else if (exercise.reps != null) {
      parts.push(`${exercise.reps} reps`);
    } else if (exercise.duration_sec != null) {
      parts.push(`${exercise.duration_sec}s`);
    }
    if (exercise.rest_sec != null) {
      parts.push(`${exercise.rest_sec}s rest`);
    }
    if (parts.length === 0) {
      return null;
    }
    return <Text style={styles.exerciseSubtitle}>{parts.join(" • ")}</Text>;
  }

  const targetMetric: TargetMetric =
    exercise.duration_sec != null && exercise.reps == null ? "time" : "reps";

  return (
    <View style={styles.targetEditor}>
      <View style={styles.metricToggleRow}>
        <Pressable
          onPress={() => onSelectMetric("reps")}
          style={[
            styles.metricToggleButton,
            targetMetric === "reps" ? styles.metricToggleButtonActive : null,
          ]}
        >
          <Text
            style={[
              styles.metricToggleText,
              targetMetric === "reps" ? styles.metricToggleTextActive : null,
            ]}
          >
            Sets / Reps
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSelectMetric("time")}
          style={[
            styles.metricToggleButton,
            targetMetric === "time" ? styles.metricToggleButtonActive : null,
          ]}
        >
          <Text
            style={[
              styles.metricToggleText,
              targetMetric === "time" ? styles.metricToggleTextActive : null,
            ]}
          >
            Time / Seconds
          </Text>
        </Pressable>
      </View>
      <View style={styles.targetRow}>
        <TargetField
          label="Sets"
          value={exercise.sets}
          onSave={onSaveField("sets")}
          themeMode={themeMode}
          styles={styles}
        />
        {targetMetric === "time" ? (
          <TargetField
            label="Seconds"
            value={exercise.duration_sec}
            unit="s"
            onSave={onSaveField("duration_sec")}
            themeMode={themeMode}
            styles={styles}
          />
        ) : (
          <TargetField
            label="Reps"
            value={exercise.reps}
            onSave={onSaveField("reps")}
            themeMode={themeMode}
            styles={styles}
          />
        )}
        <TargetField
          label="Rest"
          value={exercise.rest_sec}
          unit="s"
          onSave={onSaveField("rest_sec")}
          themeMode={themeMode}
          styles={styles}
        />
      </View>
    </View>
  );
}

function TargetField({
  label,
  value,
  unit,
  onSave,
  themeMode,
  styles,
}: {
  label: string;
  value: number | null;
  unit?: string;
  onSave: (raw: string) => void;
  themeMode: ThemeMode;
  styles: ReturnType<typeof createStyles>;
}) {
  const displayValue = value == null ? "" : String(value);
  return (
    <View style={styles.targetField}>
      <Text style={styles.targetLabel}>{label}</Text>
      <View style={styles.targetValueRow}>
        <InlineEditableText
          value={displayValue}
          onSave={onSave}
          placeholder="-"
          keyboardType="number-pad"
          maxLength={4}
          textStyle={styles.targetValue}
          placeholderStyle={styles.targetPlaceholder}
          themeMode={themeMode}
          hideHint
        />
        {unit && displayValue.length > 0 ? (
          <Text style={styles.targetUnit}>{unit}</Text>
        ) : null}
      </View>
    </View>
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
      gap: 24,
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
    heroBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    heroBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    heroBadgeText: {
      color: theme.colors.surface,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.surface,
      fontSize: 34,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
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
    summaryPlaceholder: {
      color: "rgba(255, 255, 255, 0.7)",
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
    primaryActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 4,
    },
    primaryButton: {
      flex: 1,
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
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    iconButton: {
      width: 56,
      height: 56,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
    },
    iconButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },
    scheduleIconButton: {
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.32)"
          : "rgba(71, 88, 240, 0.18)",
    },
    removeIconButton: {
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 105, 60, 0.32)"
          : theme.colors.errorSoft,
    },
    aiDisclosureCard: {
      marginHorizontal: 4,
      borderRadius: theme.radii.large,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.08)"
          : "rgba(255, 111, 34, 0.07)",
      borderWidth: 1,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.24)"
          : "rgba(255, 111, 34, 0.2)",
      padding: 16,
      gap: 10,
    },
    aiDisclosureHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    aiDisclosureBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.18)"
          : "rgba(255, 111, 34, 0.14)",
    },
    aiDisclosureBadgeText: {
      color: theme.colors.primary,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    aiDisclosureReport: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textDecorationLine: "underline",
    },
    aiDisclosureBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
    },
    section: {
      gap: 14,
      paddingHorizontal: 4,
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
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    detailCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 10,
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
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.12)"
          : "rgba(79, 117, 231, 0.16)",
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
    blockCard: {
      gap: 10,
    },
    blockName: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      paddingHorizontal: 4,
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
    exerciseRemoveButton: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 105, 60, 0.12)"
          : theme.colors.errorSoft,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 105, 60, 0.24)"
          : "rgba(255, 105, 60, 0.18)",
    },
    exerciseCopy: {
      flex: 1,
      gap: 6,
    },
    exerciseName: {
      color: theme.colors.textPrimary,
      fontSize: 22,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    exerciseSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    exerciseNoteCard: {
      padding: 12,
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.surfaceMuted,
      gap: 4,
    },
    exerciseNoteLabel: {
      color: theme.colors.primary,
      fontSize: 10,
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
    emptyCard: {
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      padding: 22,
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
    emptyBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    addExerciseButton: {
      marginTop: 2,
      minHeight: 54,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    addExerciseButtonText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    targetRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 2,
    },
    targetEditor: {
      gap: 10,
    },
    metricToggleRow: {
      flexDirection: "row",
      gap: 8,
    },
    metricToggleButton: {
      flex: 1,
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    metricToggleButtonActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    metricToggleText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    metricToggleTextActive: {
      color: theme.colors.surface,
    },
    targetField: {
      minWidth: 64,
      gap: 2,
    },
    targetLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    targetValueRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 2,
    },
    targetValue: {
      color: theme.colors.textPrimary,
      fontSize: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      minWidth: 24,
    },
    targetPlaceholder: {
      color: theme.colors.textMuted,
      fontStyle: "normal",
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    targetUnit: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
  });
