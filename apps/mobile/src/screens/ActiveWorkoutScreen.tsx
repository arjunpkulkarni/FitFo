import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import CoachSheet, { type CoachChatMessage } from "../components/CoachSheet";
import { titleCase } from "../lib/fitfo";
import type { WorkoutContext as ChatWorkoutContext } from "../lib/chat";
import { F } from "../lib/fonts";
import { getTheme, radii, type ThemeMode } from "../theme";
import type {
  ActiveExercisePreview,
  ActiveSessionPreview,
  ActiveSetPreview,
} from "../types";

interface ActiveWorkoutScreenProps {
  session: ActiveSessionPreview;
  onBack: () => void;
  onFinish: (session: ActiveSessionPreview) => void;
  /** Lifted coach transcript so reopening from the Logs tab retains memory. */
  coachMessages: CoachChatMessage[];
  setCoachMessages: Dispatch<SetStateAction<CoachChatMessage[]>>;
  /** One-time coach spotlight: measure the coach button so parent can highlight it. */
  onCoachButtonMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  /** When this increments, open the coach sheet programmatically. */
  coachOpenRequestId?: number;
  hubTourStep?: "active_scroll" | "finish_workout" | null;
  onHubTourFinishButtonMeasured?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null) => void;
  onHubTourListViewportMeasured?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null) => void;
  onHubTourFinishButtonVisible?: () => void;
  onScheduleAgain?: () => void;
  isSchedulingAgain?: boolean;
  /**
   * Persist the in-progress session into the saved library so the athlete
   * can run the same routine again later. Receives the latest exercises
   * snapshot — same shape `onFinish` uses — so any in-session edits are
   * captured if the parent decides to derive the saved plan from them.
   */
  onSave?: (session: ActiveSessionPreview) => void;
  isSaving?: boolean;
  /** When true, render a confirmation state on the save button. */
  hasSaved?: boolean;
  themeMode?: ThemeMode;
}

interface SelectedSetState {
  exerciseId: string;
  setId: string;
}

type TargetMetric = "reps" | "time";

const DEFAULT_TARGET_REPS = 10;
const DEFAULT_TARGET_DURATION_SEC = 30;

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeWeight(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

function sanitizeReps(value: string) {
  return value.replace(/\D/g, "");
}

function buildCoachDraftLoggedSummary(set: ActiveSetPreview): string | null {
  const w = set.loggedWeight.trim();
  const r = set.loggedReps.trim();
  if (!w && !r) {
    return null;
  }
  const parts: string[] = [];
  if (w) {
    parts.push(`${w} lb`);
  }
  if (r) {
    parts.push(
      set.targetDurationSec != null ? `${r}s held` : `${r} reps`,
    );
  }
  return parts.join(" · ") || null;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTargetCopy(set: ActiveSetPreview) {
  if (set.targetDurationSec != null) {
    return `${set.targetDurationSec}s target`;
  }

  if (set.targetReps != null) {
    return `${set.targetReps} reps target`;
  }

  return "Log your set";
}

function getLoggedSetCopy(set: ActiveSetPreview) {
  const parts: string[] = [];

  if (set.loggedWeight.trim()) {
    parts.push(`${set.loggedWeight} lb`);
  }

  if (set.loggedReps.trim()) {
    parts.push(
      set.targetDurationSec != null
        ? `${set.loggedReps}s`
        : `${set.loggedReps} reps`,
    );
  }

  return parts.join(" • ") || getTargetCopy(set);
}

function isSetReadyToComplete(set: ActiveSetPreview) {
  if (set.targetDurationSec != null) {
    return Boolean(set.loggedReps.trim());
  }

  return Boolean(set.loggedWeight.trim()) && Boolean(set.loggedReps.trim());
}

function getExerciseSubtitle(sets: ActiveSetPreview[]) {
  const setCountLabel = `${sets.length} ${sets.length === 1 ? "set" : "sets"}`;
  const referenceSet = sets.find(
    (set) => set.targetDurationSec != null || set.targetReps != null,
  );

  if (referenceSet?.targetDurationSec != null) {
    return `${setCountLabel} • ${referenceSet.targetDurationSec}s`;
  }

  if (referenceSet?.targetReps != null) {
    return `${setCountLabel} • ${referenceSet.targetReps} reps`;
  }

  return setCountLabel;
}

function relabelSets(sets: ActiveSetPreview[]) {
  return sets.map((set, index) => ({
    ...set,
    label: `Set ${index + 1}`,
  }));
}

function syncExercise(exercise: ActiveExercisePreview): ActiveExercisePreview {
  return {
    ...exercise,
    subtitle: getExerciseSubtitle(exercise.sets),
  };
}

function createSetDraft(
  index: number,
  options?: {
    targetDurationSec?: number | null;
    targetReps?: number | null;
  },
): ActiveSetPreview {
  return {
    id: createId("set"),
    label: `Set ${index}`,
    targetReps: options?.targetReps ?? null,
    targetDurationSec: options?.targetDurationSec ?? null,
    loggedWeight: "",
    loggedReps: "",
    completed: false,
  };
}

function createExerciseDraft(options: {
  averageRestSeconds: number | null;
  name: string;
  setCount: number;
  targetDurationSec?: number | null;
  targetReps: number | null;
}): ActiveExercisePreview {
  const sets = Array.from({ length: options.setCount }, (_, index) =>
    createSetDraft(index + 1, {
      targetDurationSec: options.targetDurationSec ?? null,
      targetReps: options.targetReps,
    }),
  );

  return syncExercise({
    id: createId("exercise"),
    name: options.name,
    subtitle: "",
    blockName: null,
    notes: null,
    restSeconds: options.averageRestSeconds,
    sets,
  });
}

type ActiveWorkoutTheme = ReturnType<typeof getTheme>;
type ActiveWorkoutStyles = ReturnType<typeof createStyles>;

interface SetRowProps {
  exerciseId: string;
  exerciseName: string;
  canRemove: boolean;
  isActive: boolean;
  onMaybeComplete: (exerciseId: string, setId: string) => void;
  onOpen: (exerciseId: string, setId: string) => void;
  onRepsChange: (exerciseId: string, setId: string, value: string) => void;
  onRemove: (exerciseId: string, setId: string) => void;
  onTargetRepsChange: (exerciseId: string, setId: string, value: number | null) => void;
  onTargetDurationChange: (
    exerciseId: string,
    setId: string,
    value: number | null,
  ) => void;
  onWeightChange: (exerciseId: string, setId: string, value: string) => void;
  set: ActiveSetPreview;
  styles: ActiveWorkoutStyles;
  theme: ActiveWorkoutTheme;
}

function SetRow({
  exerciseId,
  exerciseName,
  canRemove,
  isActive,
  set,
  onMaybeComplete,
  onOpen,
  onRepsChange,
  onRemove,
  onTargetRepsChange,
  onTargetDurationChange,
  onWeightChange,
  styles,
  theme,
}: SetRowProps) {
  const isTimedSet = set.targetDurationSec != null;
  const [targetRepsDraft, setTargetRepsDraft] = useState(
    set.targetReps != null ? String(set.targetReps) : "",
  );
  const [targetDurationDraft, setTargetDurationDraft] = useState(
    set.targetDurationSec != null ? String(set.targetDurationSec) : "",
  );

  useEffect(() => {
    setTargetRepsDraft(set.targetReps != null ? String(set.targetReps) : "");
  }, [set.targetReps]);

  useEffect(() => {
    setTargetDurationDraft(
      set.targetDurationSec != null ? String(set.targetDurationSec) : "",
    );
  }, [set.targetDurationSec]);

  const commitTargetReps = () => {
    const trimmed = targetRepsDraft.trim();
    if (!trimmed) {
      onTargetRepsChange(exerciseId, set.id, null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    onTargetRepsChange(exerciseId, set.id, Number.isFinite(parsed) ? parsed : null);
  };

  const commitTargetDuration = () => {
    const trimmed = targetDurationDraft.trim();
    if (!trimmed) {
      onTargetDurationChange(exerciseId, set.id, null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    onTargetDurationChange(
      exerciseId,
      set.id,
      Number.isFinite(parsed) ? parsed : null,
    );
  };

  if (!isActive) {
    return (
      <View
        style={[
          styles.setRow,
          styles.setRowCompact,
          set.completed ? styles.setRowComplete : styles.setRowUpcoming,
        ]}
      >
        <Pressable onPress={() => onOpen(exerciseId, set.id)} style={styles.setRowOpenButton}>
          <View style={styles.setRowHeader}>
            <View style={styles.setRowTitleColumn}>
              <Text style={styles.setLabel}>{set.label}</Text>
              <Text style={styles.setTarget}>
                {set.completed ? getLoggedSetCopy(set) : getTargetCopy(set)}
              </Text>
            </View>
            <View style={styles.setHeaderActions}>
              {set.completed ? (
                <View style={styles.setDonePill}>
                  <Ionicons color={theme.colors.success} name="checkmark-circle" size={14} />
                  <Text style={styles.setDoneText}>Logged</Text>
                </View>
              ) : (
                <Text style={styles.setExerciseName}>Up next</Text>
              )}
              {canRemove ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => onRemove(exerciseId, set.id)}
                  style={styles.inlineRemoveButton}
                >
                  <Ionicons color={theme.colors.error} name="close" size={14} />
                </Pressable>
              ) : (
                <Ionicons color={theme.colors.textMuted} name="create-outline" size={16} />
              )}
            </View>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.setRow, set.completed ? styles.setRowComplete : null]}>
      <View style={styles.setRowHeader}>
        <View style={styles.setRowTitleColumn}>
          <Text style={styles.setLabel}>{set.label}</Text>
          <View style={styles.setTargetEditRow}>
            {isTimedSet ? (
              <View style={styles.targetEditPill}>
                <TextInput
                  keyboardType="number-pad"
                  onBlur={commitTargetDuration}
                  onChangeText={(value) => setTargetDurationDraft(sanitizeReps(value))}
                  placeholder="--"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.targetEditInput}
                  value={targetDurationDraft}
                />
                <Text style={styles.targetEditUnit}>s target</Text>
              </View>
            ) : (
              <View style={styles.targetEditPill}>
                <TextInput
                  keyboardType="number-pad"
                  onBlur={commitTargetReps}
                  onChangeText={(value) => setTargetRepsDraft(sanitizeReps(value))}
                  placeholder="--"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.targetEditInput}
                  value={targetRepsDraft}
                />
                <Text style={styles.targetEditUnit}>reps target</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.setHeaderActions}>
          {set.completed ? (
            <View style={styles.setDonePill}>
              <Ionicons color={theme.colors.success} name="checkmark-circle" size={14} />
              <Text style={styles.setDoneText}>Logged</Text>
            </View>
          ) : (
            <Text style={styles.setExerciseName}>
              {titleCase(exerciseName) || exerciseName}
            </Text>
          )}
          {canRemove ? (
            <Pressable
              hitSlop={8}
              onPress={() => onRemove(exerciseId, set.id)}
              style={styles.inlineRemoveButton}
            >
              <Ionicons color={theme.colors.error} name="close" size={14} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.inputRow}>
        {isTimedSet ? (
          <View style={[styles.inputField, styles.inputFieldFull]}>
            <Text style={styles.inputLabel}>Time</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(value) =>
                onRepsChange(exerciseId, set.id, sanitizeReps(value))
              }
              placeholder="Secs"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={set.loggedReps}
            />
          </View>
        ) : (
          <>
            <View style={styles.inputField}>
              <Text style={styles.inputLabel}>Weight</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  onWeightChange(exerciseId, set.id, sanitizeWeight(value))
                }
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={set.loggedWeight}
              />
            </View>

            <View style={styles.inputField}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) =>
                  onRepsChange(exerciseId, set.id, sanitizeReps(value))
                }
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={set.loggedReps}
              />
            </View>
          </>
        )}
      </View>

      {set.completed ? (
        <Text style={styles.autoAdvanceText}>
          Adjust the numbers here any time and this set will stay saved.
        </Text>
      ) : (
        <Pressable
          onPress={() => onMaybeComplete(exerciseId, set.id)}
          disabled={!isSetReadyToComplete(set)}
          style={({ pressed }) => [
            styles.confirmSetButton,
            !isSetReadyToComplete(set)
              ? styles.confirmSetButtonDisabled
              : null,
            pressed && isSetReadyToComplete(set)
              ? styles.confirmSetButtonPressed
              : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Confirm ${set.label}`}
        >
          <Ionicons
            color={
              isSetReadyToComplete(set)
                ? "#FFFFFF"
                : theme.colors.textMuted
            }
            name="checkmark"
            size={16}
          />
          <Text
            style={[
              styles.confirmSetButtonText,
              !isSetReadyToComplete(set)
                ? styles.confirmSetButtonTextDisabled
                : null,
            ]}
          >
            {isSetReadyToComplete(set)
              ? "Confirm Set"
              : set.targetDurationSec != null
                ? "Enter time to confirm"
                : "Enter weight & reps to confirm"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface ExerciseCardProps {
  autoFocusName?: boolean;
  editingSetId: string | null;
  exercise: ActiveExercisePreview;
  expanded: boolean;
  onAddSet: (exerciseId: string) => void;
  onChangeNotes: (exerciseId: string, value: string) => void;
  onChangeRestSeconds: (exerciseId: string, value: number | null) => void;
  onCompleteSet: (exerciseId: string, setId: string) => void;
  onOpenSet: (exerciseId: string, setId: string) => void;
  onRenameExercise: (exerciseId: string, value: string) => void;
  onRepsChange: (exerciseId: string, setId: string, value: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onSelectTargetMetric: (exerciseId: string, metric: TargetMetric) => void;
  onTargetRepsChange: (exerciseId: string, setId: string, value: number | null) => void;
  onTargetDurationChange: (
    exerciseId: string,
    setId: string,
    value: number | null,
  ) => void;
  onToggle: (exerciseId: string) => void;
  onWeightChange: (exerciseId: string, setId: string, value: string) => void;
  /** Long‑press drag handle for list reorder (card chrome; inner controls capture taps first). */
  onReorderDrag: () => void;
  reorderDragDisabled?: boolean;
  styles: ActiveWorkoutStyles;
  theme: ActiveWorkoutTheme;
}

function ExerciseCard({
  autoFocusName,
  editingSetId,
  exercise,
  expanded,
  onAddSet,
  onChangeNotes,
  onChangeRestSeconds,
  onCompleteSet,
  onOpenSet,
  onRenameExercise,
  onRepsChange,
  onRemoveExercise,
  onRemoveSet,
  onSelectTargetMetric,
  onTargetRepsChange,
  onTargetDurationChange,
  onToggle,
  onWeightChange,
  onReorderDrag,
  reorderDragDisabled,
  styles,
  theme,
}: ExerciseCardProps) {
  const completedSetCount = exercise.sets.filter((set) => set.completed).length;
  const isExerciseFullyComplete =
    exercise.sets.length > 0 && completedSetCount === exercise.sets.length;
  const defaultOpenSetId =
    exercise.sets.find((set) => !set.completed)?.id ?? exercise.sets[0]?.id ?? null;
  const activeSetId =
    editingSetId != null && exercise.sets.some((set) => set.id === editingSetId)
      ? editingSetId
      : defaultOpenSetId;
  const targetMetric: TargetMetric = exercise.sets.some(
    (set) => set.targetDurationSec != null,
  )
    ? "time"
    : "reps";

  const [nameDraft, setNameDraft] = useState(
    titleCase(exercise.name) || exercise.name,
  );
  const [notesDraft, setNotesDraft] = useState(exercise.notes ?? "");
  const [restDraft, setRestDraft] = useState(
    exercise.restSeconds != null ? String(exercise.restSeconds) : "",
  );
  const nameInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    setNameDraft(titleCase(exercise.name) || exercise.name);
  }, [exercise.name]);

  useEffect(() => {
    setNotesDraft(exercise.notes ?? "");
  }, [exercise.notes]);

  useEffect(() => {
    setRestDraft(exercise.restSeconds != null ? String(exercise.restSeconds) : "");
  }, [exercise.restSeconds]);

  useEffect(() => {
    if (autoFocusName && expanded) {
      const handle = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [autoFocusName, expanded]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (!next) {
      setNameDraft(titleCase(exercise.name) || exercise.name);
      return;
    }
    if (next !== exercise.name) {
      onRenameExercise(exercise.id, next);
    }
  };

  const commitNotes = () => {
    if ((notesDraft ?? "") !== (exercise.notes ?? "")) {
      onChangeNotes(exercise.id, notesDraft);
    }
  };

  const commitRest = () => {
    const trimmed = restDraft.trim();
    if (!trimmed) {
      onChangeRestSeconds(exercise.id, null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    onChangeRestSeconds(exercise.id, Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <Pressable
      accessibilityHint="Hold, then drag to move this exercise in the workout."
      accessibilityLabel={`${titleCase(exercise.name) || exercise.name || "Exercise"} workout block`}
      delayLongPress={280}
      disabled={Boolean(reorderDragDisabled)}
      onLongPress={onReorderDrag}
      style={[
        styles.exerciseCard,
        isExerciseFullyComplete ? styles.exerciseCardComplete : null,
      ]}
    >
      <View style={styles.exerciseTopRow}>
        <View style={styles.exerciseToggleChunk}>
          <View style={styles.exerciseIdentity}>
            <Pressable
              accessibilityHint={
                expanded
                  ? "Tap to collapse this exercise card"
                  : "Tap to expand sets and details for this exercise"
              }
              accessibilityLabel={expanded ? "Collapse exercise" : "Expand exercise"}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={() => onToggle(exercise.id)}
            >
              <View
                style={[
                  styles.exerciseIconShell,
                  isExerciseFullyComplete ? styles.exerciseIconShellComplete : null,
                ]}
              >
                <Ionicons
                  color={isExerciseFullyComplete ? "#06140F" : theme.colors.primary}
                  name={isExerciseFullyComplete ? "checkmark" : "barbell-outline"}
                  size={isExerciseFullyComplete ? 24 : 18}
                />
              </View>
            </Pressable>
            <View style={styles.exerciseCopy}>
              {exercise.blockName ? (
                <Text style={styles.exerciseEyebrow}>{exercise.blockName}</Text>
              ) : null}
              <TextInput
                ref={nameInputRef}
                autoCapitalize="words"
                autoCorrect={false}
                onBlur={commitName}
                onChangeText={setNameDraft}
                onFocus={() => {
                  if (!expanded) {
                    onToggle(exercise.id);
                  }
                }}
                onSubmitEditing={commitName}
                placeholder="Tap to name this exercise"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                style={styles.exerciseTitleInput}
                value={nameDraft}
              />
              <Text style={styles.exerciseSubtitle}>{exercise.subtitle}</Text>
            </View>
          </View>
        </View>

        <View style={styles.exerciseReorderGutter} />

        <View style={styles.exerciseActions}>
          <View
            style={[
              styles.setCountPill,
              isExerciseFullyComplete ? styles.setCountPillComplete : null,
            ]}
          >
            <Text
              style={
                isExerciseFullyComplete ? styles.setCountTextComplete : styles.setCountText
              }
            >
              {completedSetCount}/{exercise.sets.length}
            </Text>
          </View>
          <Pressable
            onPress={() => onRemoveExercise(exercise.id)}
            style={[styles.exerciseIconButton, styles.exerciseDeleteButton]}
          >
            <Ionicons
              color={theme.colors.error}
              name="trash-outline"
              size={16}
            />
          </Pressable>
        </View>
      </View>

      {expanded ? (
        <View style={styles.exerciseBody}>
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>Notes</Text>
            <TextInput
              multiline
              onBlur={commitNotes}
              onChangeText={setNotesDraft}
              placeholder="Add notes, cues, tempo..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.notesInput}
              value={notesDraft}
            />
          </View>

          <View style={styles.metricToggleCard}>
            <Text style={styles.metricToggleLabel}>Track this exercise by</Text>
            <View style={styles.metricToggleRow}>
              <Pressable
                onPress={() => onSelectTargetMetric(exercise.id, "reps")}
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
                onPress={() => onSelectTargetMetric(exercise.id, "time")}
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
          </View>

          <View style={styles.restRow}>
            <Text style={styles.restLabel}>Rest between sets</Text>
            <View style={styles.restInputPill}>
              <TextInput
                keyboardType="number-pad"
                onBlur={commitRest}
                onChangeText={(value) => setRestDraft(sanitizeReps(value))}
                placeholder="--"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.restInput}
                value={restDraft}
              />
              <Text style={styles.restUnit}>sec</Text>
            </View>
          </View>

          {exercise.sets.length > 0 ? (
            <View style={styles.setList}>
              {exercise.sets.map((set) => (
                <SetRow
                  key={set.id}
                  canRemove={exercise.sets.length > 1}
                  exerciseId={exercise.id}
                  exerciseName={exercise.name}
                  isActive={activeSetId === set.id}
                  onMaybeComplete={onCompleteSet}
                  onOpen={onOpenSet}
                  onRepsChange={onRepsChange}
                  onRemove={onRemoveSet}
                  onTargetRepsChange={onTargetRepsChange}
                  onTargetDurationChange={onTargetDurationChange}
                  onWeightChange={onWeightChange}
                  set={set}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptySetCard}>
              <Ionicons color={theme.colors.primary} name="albums-outline" size={18} />
              <Text style={styles.emptySetTitle}>No sets yet</Text>
              <Text style={styles.emptySetBody}>
                Add a set to start logging this exercise.
              </Text>
            </View>
          )}

          <Pressable onPress={() => onAddSet(exercise.id)} style={styles.addSetButton}>
            <Ionicons color={theme.colors.primary} name="add-circle-outline" size={18} />
            <Text style={styles.addSetButtonText}>Add Set</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ActiveWorkoutScreen({
  session,
  onBack,
  onFinish,
  coachMessages,
  setCoachMessages,
  onCoachButtonMeasured,
  coachOpenRequestId = 0,
  hubTourStep = null,
  onHubTourFinishButtonMeasured,
  onHubTourListViewportMeasured,
  onHubTourFinishButtonVisible,
  onScheduleAgain,
  isSchedulingAgain = false,
  onSave,
  isSaving = false,
  hasSaved = false,
  themeMode = "light",
}: ActiveWorkoutScreenProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const listViewportRef = useRef<View | null>(null);
  const finishButtonRef = useRef<View | null>(null);
  const coachButtonRef = useRef<View | null>(null);
  const lastCoachOpenRequestIdRef = useRef(0);
  const previousCompletedSetCountRef = useRef(0);
  const lastElapsedTickRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    session.exercises[0]?.id || null,
  );
  const [exercises, setExercises] = useState(session.exercises);
  const [selectedSet, setSelectedSet] = useState<SelectedSetState | null>(null);
  const [autoFocusExerciseId, setAutoFocusExerciseId] = useState<string | null>(null);
  const [restCountdownSeconds, setRestCountdownSeconds] = useState<number | null>(
    null,
  );
  const [coachOpen, setCoachOpen] = useState(false);

  useEffect(() => {
    if (coachOpenRequestId === lastCoachOpenRequestIdRef.current) {
      return;
    }
    lastCoachOpenRequestIdRef.current = coachOpenRequestId;
    if (coachOpenRequestId > 0) {
      setCoachOpen(true);
    }
  }, [coachOpenRequestId]);

  useEffect(() => {
    setExercises(session.exercises);
    setExpandedExerciseId(session.exercises[0]?.id || null);
    setSelectedSet(null);
    setAutoFocusExerciseId(null);
    setRestCountdownSeconds(null);
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)));
    setIsTimerPaused(false);
    lastElapsedTickRef.current = Date.now();
  }, [session]);

  const measureCoachButton = useCallback(() => {
    if (!onCoachButtonMeasured) {
      return;
    }
    coachButtonRef.current?.measureInWindow?.((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        onCoachButtonMeasured(null);
        return;
      }
      onCoachButtonMeasured({ x, y, width, height });
    });
  }, [onCoachButtonMeasured]);

  const measureListViewport = useCallback(() => {
    if (!onHubTourListViewportMeasured) {
      return;
    }
    listViewportRef.current?.measureInWindow?.((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        onHubTourListViewportMeasured(null);
        return;
      }
      onHubTourListViewportMeasured({ x, y, width, height });
    });
  }, [onHubTourListViewportMeasured]);

  const measureFinishButton = useCallback(() => {
    if (!onHubTourFinishButtonMeasured) {
      return;
    }
    finishButtonRef.current?.measureInWindow?.((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        onHubTourFinishButtonMeasured(null);
        return;
      }
      onHubTourFinishButtonMeasured({ x, y, width, height });
    });
  }, [onHubTourFinishButtonMeasured]);

  const checkFinishButtonVisibility = useCallback(() => {
    if (!onHubTourFinishButtonVisible) {
      return;
    }
    listViewportRef.current?.measureInWindow?.((viewportX, viewportY, viewportWidth, viewportHeight) => {
      finishButtonRef.current?.measureInWindow?.((buttonX, buttonY, buttonWidth, buttonHeight) => {
        if (
          !Number.isFinite(viewportX) ||
          !Number.isFinite(viewportY) ||
          !Number.isFinite(viewportWidth) ||
          !Number.isFinite(viewportHeight) ||
          !Number.isFinite(buttonX) ||
          !Number.isFinite(buttonY) ||
          !Number.isFinite(buttonWidth) ||
          !Number.isFinite(buttonHeight)
        ) {
          return;
        }

        const viewportTop = viewportY;
        const viewportBottom = viewportY + viewportHeight;
        const buttonTop = buttonY;
        const buttonBottom = buttonY + buttonHeight;
        const visibleHeight =
          Math.min(buttonBottom, viewportBottom) - Math.max(buttonTop, viewportTop);

        if (visibleHeight >= Math.min(buttonHeight * 0.6, 44)) {
          onHubTourFinishButtonVisible();
        }
      });
    });
  }, [onHubTourFinishButtonVisible]);

  useEffect(() => {
    if (hubTourStep !== "active_scroll") {
      return;
    }
    const id = requestAnimationFrame(() => {
      measureListViewport();
      checkFinishButtonVisibility();
    });
    return () => cancelAnimationFrame(id);
  }, [checkFinishButtonVisibility, hubTourStep, measureListViewport, session.startedAt]);

  useEffect(() => {
    if (hubTourStep !== "finish_workout") {
      return;
    }
    const id = requestAnimationFrame(() => {
      measureFinishButton();
    });
    return () => cancelAnimationFrame(id);
  }, [hubTourStep, measureFinishButton, session.startedAt, exercises.length]);

  useEffect(() => {
    if (isTimerPaused) {
      lastElapsedTickRef.current = Date.now();
      return undefined;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = Math.floor((now - lastElapsedTickRef.current) / 1000);
      if (deltaSeconds <= 0) {
        return;
      }

      lastElapsedTickRef.current += deltaSeconds * 1000;
      setElapsedSeconds((current) => current + deltaSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerPaused]);

  useEffect(() => {
    if (isTimerPaused || restCountdownSeconds == null || restCountdownSeconds <= 0) {
      if (restCountdownSeconds === 0) {
        setRestCountdownSeconds(null);
      }
      return;
    }

    const interval = setInterval(() => {
      setRestCountdownSeconds((current) => {
        if (current == null || current <= 1) {
          return null;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerPaused, restCountdownSeconds]);

  const totalSetCount = useMemo(
    () => exercises.reduce((count, exercise) => count + exercise.sets.length, 0),
    [exercises],
  );

  const completedSetCount = useMemo(
    () =>
      exercises.reduce(
        (count, exercise) => count + exercise.sets.filter((set) => set.completed).length,
        0,
      ),
    [exercises],
  );

  // Snapshot of workout + athlete position sent on every coach turn so the LLM
  // sees the exact exercise/set. We cannot rely on expandedExerciseId alone: the UI
  // often leaves a completed lift expanded while the athlete has moved on, which
  // made the coach claim "you're on one of three sets".
  //
  // Anchor: logging row (selectedSet) wins; else first incomplete set top-to-bottom;
  // else workout is checked off → last planned set so we still expose a coherent #.
  const coachWorkoutContext = useMemo<ChatWorkoutContext>(() => {
    const plan = session.workoutPlan;

    let focusExercise: ActiveExercisePreview | undefined;
    let focusExerciseIndexZero = -1;
    let focusSet: ActiveSetPreview | undefined;
    let focusSetNumber: number | null = null;

    if (
      selectedSet != null &&
      exercises.some((e) => e.id === selectedSet.exerciseId)
    ) {
      const exIdx = exercises.findIndex((e) => e.id === selectedSet.exerciseId);
      const exercise = exercises[exIdx];
      const sIdx = exercise.sets.findIndex((set) => set.id === selectedSet.setId);
      if (exIdx >= 0 && sIdx >= 0) {
        focusExercise = exercise;
        focusExerciseIndexZero = exIdx;
        focusSet = exercise.sets[sIdx];
        focusSetNumber = sIdx + 1;
      }
    }

    if (focusExercise == null) {
      for (let exIdx = 0; exIdx < exercises.length; exIdx += 1) {
        const exercise = exercises[exIdx];
        const sIdx = exercise.sets.findIndex((set) => !set.completed);
        if (sIdx >= 0) {
          focusExercise = exercise;
          focusExerciseIndexZero = exIdx;
          focusSet = exercise.sets[sIdx];
          focusSetNumber = sIdx + 1;
          break;
        }
      }
    }

    if (focusExercise == null && exercises.length > 0) {
      focusExerciseIndexZero = exercises.length - 1;
      focusExercise = exercises[focusExerciseIndexZero];
      if (focusExercise.sets.length > 0) {
        const last = focusExercise.sets.length - 1;
        focusSet = focusExercise.sets[last];
        focusSetNumber = last + 1;
      }
    }

    const draftLogged =
      focusSet != null ? buildCoachDraftLoggedSummary(focusSet) : null;

    return {
      title: session.title || null,
      description: session.description || null,
      workout_type: plan?.workout_type ?? null,
      muscle_groups: plan?.muscle_groups?.length ? plan.muscle_groups : null,
      equipment: plan?.equipment?.length ? plan.equipment : null,
      exercises: exercises.map((exercise) => {
        const referenceSet = exercise.sets[0];
        const setsDone = exercise.sets.filter((set) => set.completed).length;
        return {
          name: exercise.name,
          sets: exercise.sets.length || null,
          reps: referenceSet?.targetReps ?? null,
          duration_sec: referenceSet?.targetDurationSec ?? null,
          rest_sec: exercise.restSeconds ?? null,
          notes: exercise.notes ?? null,
          sets_completed: exercise.sets.length > 0 ? setsDone : null,
        };
      }),
      session_started_at_ms: session.startedAt,
      elapsed_sec: elapsedSeconds,
      timer_paused: isTimerPaused,
      completed_set_count: completedSetCount,
      total_set_count: totalSetCount,
      current_exercise_index:
        focusExerciseIndexZero >= 0 ? focusExerciseIndexZero + 1 : null,
      current_exercise_name: focusExercise?.name ?? null,
      current_set_number: focusSetNumber,
      current_set_target_summary: focusSet ? getTargetCopy(focusSet) : null,
      current_set_logged_summary: draftLogged,
      source_workout_id: session.sourceWorkoutId ?? null,
      source_job_id: session.sourceJobId ?? null,
    };
  }, [
    completedSetCount,
    elapsedSeconds,
    exercises,
    isTimerPaused,
    selectedSet,
    session,
    totalSetCount,
  ]);

  useEffect(() => {
    previousCompletedSetCountRef.current = 0;
  }, [session]);

  useEffect(() => {
    const previousCompletedSetCount = previousCompletedSetCountRef.current;
    previousCompletedSetCountRef.current = completedSetCount;

    if (completedSetCount <= previousCompletedSetCount || expandedExerciseId == null) {
      return;
    }

    const expandedExerciseIndex = exercises.findIndex(
      (exercise) => exercise.id === expandedExerciseId,
    );
    if (expandedExerciseIndex < 0) {
      return;
    }

    const expandedExercise = exercises[expandedExerciseIndex];
    const hasIncompleteSets = expandedExercise.sets.some((set) => !set.completed);
    if (hasIncompleteSets) {
      return;
    }

    const nextExercise =
      exercises
        .slice(expandedExerciseIndex + 1)
        .find((exercise) => exercise.sets.some((set) => !set.completed)) ??
      exercises.find((exercise) => exercise.sets.some((set) => !set.completed));

    setSelectedSet(null);
    setExpandedExerciseId(nextExercise?.id ?? null);
  }, [completedSetCount, exercises, expandedExerciseId]);

  const updateSet = (
    exerciseId: string,
    setId: string,
    updater: (set: ActiveSetPreview) => ActiveSetPreview,
  ) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? updater(set) : set,
              ),
            },
      ),
    );
  };

  const handleSetFieldChange = (
    exerciseId: string,
    setId: string,
    updater: (set: ActiveSetPreview) => ActiveSetPreview,
  ) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? updater(set) : set,
              ),
            },
      ),
    );
  };

  const handleWeightChange = (exerciseId: string, setId: string, value: string) => {
    handleSetFieldChange(exerciseId, setId, (set) => ({
      ...set,
      loggedWeight: value,
    }));
  };

  const handleRepsChange = (exerciseId: string, setId: string, value: string) => {
    handleSetFieldChange(exerciseId, setId, (set) => ({
      ...set,
      loggedReps: value,
    }));
  };

  const handleCompleteSet = (exerciseId: string, setId: string) => {
    const exerciseIndex = exercises.findIndex((exercise) => exercise.id === exerciseId);
    const matchingExercise =
      exerciseIndex >= 0 ? exercises[exerciseIndex] : undefined;
    if (!matchingExercise) {
      return;
    }

    const matchingSet = matchingExercise.sets.find((set) => set.id === setId);
    if (!matchingSet || matchingSet.completed || !isSetReadyToComplete(matchingSet)) {
      return;
    }

    updateSet(exerciseId, setId, (set) => ({ ...set, completed: true }));

    if (matchingExercise.restSeconds != null && matchingExercise.restSeconds > 0) {
      setRestCountdownSeconds(matchingExercise.restSeconds);
    }

    const nextIncompleteSet = matchingExercise.sets.find(
      (set) => set.id !== setId && !set.completed,
    );
    if (nextIncompleteSet) {
      setExpandedExerciseId(exerciseId);
      setSelectedSet({ exerciseId, setId: nextIncompleteSet.id });
      return;
    }

    const nextExercise = exercises
      .slice(exerciseIndex + 1)
      .find((exercise) => exercise.sets.some((set) => !set.completed));

    setSelectedSet(null);
    if (nextExercise) {
      setExpandedExerciseId(nextExercise.id);
    }
  };

  const handleOpenSet = (exerciseId: string, setId: string) => {
    setExpandedExerciseId(exerciseId);
    setSelectedSet({ exerciseId, setId });
  };

  const handleRenameExercise = (exerciseId: string, value: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, name: value } : exercise,
      ),
    );
  };

  const handleChangeNotes = (exerciseId: string, value: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, notes: value.trim() ? value : null }
          : exercise,
      ),
    );
  };

  const handleChangeRestSeconds = (exerciseId: string, value: number | null) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, restSeconds: value }
          : exercise,
      ),
    );
  };

  const handleChangeTargetReps = (
    exerciseId: string,
    setId: string,
    value: number | null,
  ) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : syncExercise({
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      targetReps: value,
                      targetDurationSec:
                        value == null ? set.targetDurationSec : null,
                    }
                  : set,
              ),
            }),
      ),
    );
  };

  const handleChangeTargetDuration = (
    exerciseId: string,
    setId: string,
    value: number | null,
  ) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : syncExercise({
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      targetDurationSec: value,
                      targetReps: value == null ? set.targetReps : null,
                      loggedWeight: value == null ? set.loggedWeight : "",
                    }
                  : set,
              ),
            }),
      ),
    );
  };

  const handleSelectTargetMetric = (
    exerciseId: string,
    metric: TargetMetric,
  ) => {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return syncExercise({
          ...exercise,
          sets: exercise.sets.map((set) => {
            if (metric === "time") {
              return {
                ...set,
                targetDurationSec:
                  set.targetDurationSec ?? DEFAULT_TARGET_DURATION_SEC,
                targetReps: null,
                loggedWeight: "",
              };
            }

            return {
              ...set,
              targetDurationSec: null,
              targetReps: set.targetReps ?? DEFAULT_TARGET_REPS,
            };
          }),
        });
      }),
    );
  };

  const handleAddSet = (exerciseId: string) => {
    let nextSelectedSet: SelectedSetState | null = null;

    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const previousSet = exercise.sets[exercise.sets.length - 1];
        const newSet = createSetDraft(exercise.sets.length + 1, {
          targetDurationSec: previousSet?.targetDurationSec ?? null,
          targetReps: previousSet?.targetReps ?? null,
        });
        nextSelectedSet = { exerciseId, setId: newSet.id };

        return syncExercise({
          ...exercise,
          sets: relabelSets([...exercise.sets, newSet]),
        });
      }),
    );

    setExpandedExerciseId(exerciseId);
    setSelectedSet(nextSelectedSet);
  };

  const handleRemoveSet = (exerciseId: string, setId: string) => {
    let nextSelectedSet: SelectedSetState | null | undefined;

    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const remainingSets = relabelSets(exercise.sets.filter((set) => set.id !== setId));

        if (selectedSet?.exerciseId === exerciseId && selectedSet.setId === setId) {
          const replacementSet =
            remainingSets.find((set) => !set.completed) ?? remainingSets[0] ?? null;
          nextSelectedSet = replacementSet
            ? { exerciseId, setId: replacementSet.id }
            : null;
        }

        return syncExercise({
          ...exercise,
          sets: remainingSets,
        });
      }),
    );

    if (nextSelectedSet !== undefined) {
      setSelectedSet(nextSelectedSet);
    }
  };

  const handleRemoveExercise = (exerciseId: string) => {
    const removedIndex = exercises.findIndex((exercise) => exercise.id === exerciseId);
    if (removedIndex < 0) {
      return;
    }

    const nextExercises = exercises.filter((exercise) => exercise.id !== exerciseId);
    setExercises(nextExercises);

    if (selectedSet?.exerciseId === exerciseId) {
      setSelectedSet(null);
    }

    if (autoFocusExerciseId === exerciseId) {
      setAutoFocusExerciseId(null);
    }

    if (expandedExerciseId === exerciseId) {
      setExpandedExerciseId(
        nextExercises[removedIndex]?.id ?? nextExercises[removedIndex - 1]?.id ?? null,
      );
    }
  };

  const insertExerciseAt = (insertIndex: number) => {
    const newExercise = createExerciseDraft({
      averageRestSeconds: session.averageRestSeconds,
      name: "",
      setCount: 3,
      targetReps: DEFAULT_TARGET_REPS,
    });

    setExercises((current) => {
      const clamped = Math.max(0, Math.min(insertIndex, current.length));
      return [...current.slice(0, clamped), newExercise, ...current.slice(clamped)];
    });

    setExpandedExerciseId(newExercise.id);
    setAutoFocusExerciseId(newExercise.id);
    setSelectedSet(
      newExercise.sets[0]
        ? { exerciseId: newExercise.id, setId: newExercise.sets[0].id }
        : null,
    );
  };

  const handleAppendExercise = () => {
    insertExerciseAt(exercises.length);
  };

  const handleOpenSourceUrl = () => {
    if (!session.sourceUrl) {
      return;
    }
    Linking.openURL(session.sourceUrl).catch(() => {
      // Silent failure is fine; the button just won't do anything on unsupported URLs.
    });
  };

  const handleToggleTimerPaused = () => {
    setIsTimerPaused((current) => !current);
  };

  const toggleExercise = (exerciseId: string) => {
    setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId));
  };

  const renderExerciseItem = ({
    item: exercise,
    drag,
    isActive,
  }: RenderItemParams<ActiveExercisePreview>) => (
    <ScaleDecorator activeScale={1.04}>
      <View style={styles.draggableExerciseBody}>
        <ExerciseCard
          autoFocusName={autoFocusExerciseId === exercise.id}
          editingSetId={
            selectedSet?.exerciseId === exercise.id ? selectedSet.setId : null
          }
          exercise={exercise}
          expanded={expandedExerciseId === exercise.id}
          onReorderDrag={drag}
          reorderDragDisabled={isActive}
          onAddSet={handleAddSet}
          onChangeNotes={handleChangeNotes}
          onChangeRestSeconds={handleChangeRestSeconds}
          onCompleteSet={handleCompleteSet}
          onOpenSet={handleOpenSet}
          onRenameExercise={handleRenameExercise}
          onRepsChange={handleRepsChange}
          onRemoveExercise={handleRemoveExercise}
          onRemoveSet={handleRemoveSet}
          onSelectTargetMetric={handleSelectTargetMetric}
          onTargetRepsChange={handleChangeTargetReps}
          onTargetDurationChange={handleChangeTargetDuration}
          onToggle={toggleExercise}
          onWeightChange={handleWeightChange}
          styles={styles}
          theme={theme}
        />
      </View>
    </ScaleDecorator>
  );

  const listEmpty = (
    <View style={styles.emptyCard}>
      <Ionicons color={theme.colors.primary} name="barbell-outline" size={20} />
      <Text style={styles.emptyTitle}>No exercises in this session yet</Text>
      <Text style={styles.emptyBody}>
        Start from an imported TikTok workout to populate this screen with real exercises.
      </Text>
    </View>
  );

  const listHeader = (
    <View style={styles.workoutHeaderStack}>
      <View style={styles.header}>
              <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
                <Ionicons color={theme.colors.primary} name="chevron-back" size={18} />
              </Pressable>
              <Image
                resizeMode="contain"
                source={require("../../assets/icon.png")}
                style={styles.brandLogo}
              />
              <Pressable
                onPress={() => setCoachOpen(true)}
                ref={(node) => {
                  coachButtonRef.current = node;
                }}
                onLayout={() => {
                  measureCoachButton();
                }}
                style={({ pressed }) => [
                  styles.coachButton,
                  pressed && styles.coachButtonPressed,
                ]}
                hitSlop={10}
                accessibilityLabel="Open coach chat"
                accessibilityRole="button"
              >
                <Image
                  resizeMode="contain"
                  source={require("../../assets/coach.png")}
                  style={styles.coachButtonIcon}
                />
              </Pressable>
            </View>
      
            <View style={styles.heroSection}>
              <Text style={styles.eyebrow}>Current Session</Text>
              <Text style={styles.heroTitle}>{session.title}</Text>
              <Text style={styles.heroDescription}>{session.description}</Text>
              {session.sourceUrl ? (
                <Pressable onPress={handleOpenSourceUrl} style={styles.sourceUrlPill} hitSlop={6}>
                  <Ionicons color={theme.colors.primary} name="play-circle-outline" size={14} />
                  <Text style={styles.sourceUrlText}>View original reel</Text>
                  <Ionicons
                    color={theme.colors.primary}
                    name="open-outline"
                    size={12}
                  />
                </Pressable>
              ) : null}
            </View>
      
            <View style={styles.timerCard}>
              <Text style={styles.timerEyebrow}>Time Elapsed</Text>
              <Text style={styles.timerValue}>{formatClock(elapsedSeconds)}</Text>
              <Text style={styles.timerHelper}>
                {isTimerPaused
                  ? "Workout paused"
                  : `${completedSetCount} of ${totalSetCount} sets logged`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isTimerPaused ? "Resume workout timer" : "Pause workout timer"}
                onPress={handleToggleTimerPaused}
                style={styles.timerPauseButton}
              >
                <Ionicons
                  color={theme.colors.primary}
                  name={isTimerPaused ? "play" : "pause"}
                  size={16}
                />
                <Text style={styles.timerPauseButtonText}>
                  {isTimerPaused ? "Resume Workout" : "Pause Workout"}
                </Text>
              </Pressable>
              {restCountdownSeconds != null ? (
                <Text style={styles.restCountdownText}>
                  Rest: {formatClock(restCountdownSeconds)}
                  {isTimerPaused ? " paused" : ""}
                </Text>
              ) : null}
            </View>
    </View>
  );

  const listFooter = (
    <View style={styles.workoutFooterSection}>
      <Pressable onPress={handleAppendExercise} style={styles.addExerciseButton}>
              <Ionicons color={theme.colors.surface} name="add" size={18} />
              <Text style={styles.addExerciseButtonText}>Add Exercise</Text>
            </Pressable>
      
            {onScheduleAgain ? (
              <Pressable
                disabled={isSchedulingAgain}
                onPress={onScheduleAgain}
                style={[
                  styles.scheduleAgainButton,
                  isSchedulingAgain ? styles.scheduleAgainButtonDisabled : null,
                ]}
              >
                {isSchedulingAgain ? (
                  <>
                    <ActivityIndicator color={theme.colors.primary} size="small" />
                    <Text style={styles.scheduleAgainButtonText}>Scheduling...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      color={theme.colors.primary}
                      name="calendar-outline"
                      size={16}
                    />
                    <Text style={styles.scheduleAgainButtonText}>
                      Schedule This Workout Again
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}

            {onSave ? (
              <Pressable
                accessibilityLabel="Save this workout to your library"
                accessibilityRole="button"
                disabled={isSaving || hasSaved}
                onPress={() => onSave({ ...session, exercises })}
                style={[
                  styles.scheduleAgainButton,
                  isSaving ? styles.scheduleAgainButtonDisabled : null,
                  hasSaved ? styles.saveButtonDone : null,
                ]}
              >
                {isSaving ? (
                  <>
                    <ActivityIndicator color={theme.colors.primary} size="small" />
                    <Text style={styles.scheduleAgainButtonText}>Saving...</Text>
                  </>
                ) : hasSaved ? (
                  <>
                    <Ionicons
                      color={theme.colors.primary}
                      name="checkmark-circle"
                      size={16}
                    />
                    <Text style={styles.scheduleAgainButtonText}>
                      Saved to Library
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      color={theme.colors.primary}
                      name="bookmark-outline"
                      size={16}
                    />
                    <Text style={styles.scheduleAgainButtonText}>
                      Save Workout
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}

            <View
              collapsable={false}
              ref={(node) => {
                finishButtonRef.current = node;
              }}
              onLayout={() => {
                if (hubTourStep === "finish_workout") {
                  measureFinishButton();
                  return;
                }
                if (hubTourStep === "active_scroll") {
                  checkFinishButtonVisibility();
                }
              }}
            >
              <Pressable
                onPress={() => onFinish({ ...session, exercises })}
                style={styles.finishButton}
              >
                <Text style={styles.finishButtonText}>Finish Workout</Text>
                <Ionicons color={theme.colors.surface} name="flag" size={16} />
              </Pressable>
            </View>
    </View>
  );

  const handleHubTourScroll = useCallback(
    () => {
      if (hubTourStep === "active_scroll") {
        requestAnimationFrame(() => {
          checkFinishButtonVisibility();
        });
      }
      if (hubTourStep === "finish_workout") {
        requestAnimationFrame(() => {
          measureFinishButton();
        });
      }
    },
    [checkFinishButtonVisibility, hubTourStep, measureFinishButton],
  );

  return (
    <>
    <View
      style={styles.listViewportShell}
      collapsable={false}
      ref={(node) => {
        listViewportRef.current = node;
      }}
      onLayout={() => {
        if (hubTourStep === "active_scroll") {
          measureListViewport();
        }
      }}
    >
    <DraggableFlatList
      data={exercises}
      keyExtractor={(item) => item.id}
      activationDistance={12}
      onDragEnd={({ data }) => setExercises(data)}
      extraData={[expandedExerciseId, selectedSet, autoFocusExerciseId, hubTourStep]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.container}
      containerStyle={{ flex: 1 }}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.exerciseSeparator} />}
      onScroll={handleHubTourScroll}
      renderItem={renderExerciseItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      scrollEventThrottle={16}
    />
    </View>
    <CoachSheet
      messages={coachMessages}
      setMessages={setCoachMessages}
      visible={coachOpen}
      onClose={() => setCoachOpen(false)}
      workout={coachWorkoutContext}
      themeMode={themeMode}
    />
    </>
  );
}

const createStyles = (theme: ActiveWorkoutTheme) =>
  StyleSheet.create({
    listViewportShell: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 132,
      gap: 18,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    modalCard: {
      width: "100%",
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    modalCloseButton: {
      position: "absolute",
      top: 16,
      right: 16,
      zIndex: 2,
      height: 32,
      width: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    modalIconShell: {
      height: 52,
      width: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    modalTitle: {
      color: theme.colors.textPrimary,
      fontSize: 30,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    modalSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: F.regular,
      fontWeight: "400",
    },
    modalFormBlock: {
      gap: 8,
    },
    modalMetaRow: {
      flexDirection: "row",
    },
    modalMetaChip: {
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    modalMetaChipText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    modalActionRow: {
      flexDirection: "row",
      gap: 10,
    },
    modalSecondaryButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    modalSecondaryButtonText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    modalPrimaryButton: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.primary,
    },
    modalPrimaryButtonDisabled: {
      backgroundColor: theme.colors.primaryLight,
      shadowOpacity: 0,
      elevation: 0,
    },
    modalPrimaryButtonText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 4,
      paddingBottom: 4,
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
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    coachButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 0,
      paddingLeft: 8,
      paddingRight: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      shadowColor: theme.colors.primary,
      shadowOpacity: theme.mode === "dark" ? 0.45 : 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    coachButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.97 }],
    },
    coachButtonIcon: {
      width: 26,
      height: 26,
      marginRight: -4,
      tintColor: "#FFFFFF",
    },
    coachButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: F.bold,
    },
    brandLogo: {
      width: 72,
      height: 72,
    },
    heroSection: {
      gap: 8,
      paddingTop: 0,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: theme.colors.textPrimary,
      fontSize: 36,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      lineHeight: 40,
      letterSpacing: -1.2,
    },
    heroDescription: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: F.medium,
      fontWeight: "500",
    },
    timerCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 22,
      alignItems: "center",
      ...theme.shadows.card,
    },
    timerEyebrow: {
      color: theme.colors.primarySoftText,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    timerValue: {
      marginTop: 10,
      color: theme.colors.surface,
      fontSize: 44,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -1.4,
    },
    timerHelper: {
      marginTop: 6,
      color: theme.colors.primarySoftText,
      fontSize: 13,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    timerPauseButton: {
      marginTop: 16,
      minHeight: 42,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    timerPauseButtonText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    restCountdownText: {
      marginTop: 10,
      color: theme.colors.primarySoftText,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    statGrid: {
      flexDirection: "row",
      gap: 12,
    },
    statCardPrimary: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.mode === "dark" ? "#261512" : "#D6EAFB",
      padding: 14,
      gap: 5,
    },
    statCardSoft: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 14,
      gap: 5,
    },
    statValuePrimary: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    statValueSoft: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    statLabelPrimary: {
      color: theme.colors.primary,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    statLabelSoft: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    workoutHeaderStack: {
      gap: 12,
    },
    workoutFooterSection: {
      gap: 18,
      paddingTop: 18,
      flexShrink: 0,
    },
    draggableExerciseBody: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    exerciseSeparator: {
      height: 12,
    },
    exerciseCard: {
      borderRadius: radii.large,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.softCard,
    },
    exerciseCardComplete: {
      borderColor:
        theme.mode === "dark"
          ? "rgba(49, 196, 141, 0.65)"
          : "rgba(44, 182, 125, 0.52)",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(49, 196, 141, 0.1)"
          : "rgba(44, 182, 125, 0.12)",
      ...theme.shadows.card,
    },
    exerciseTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    exerciseToggleChunk: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: "100%",
    },
    exerciseIdentity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
      maxWidth: "100%",
    },
    exerciseReorderGutter: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 8,
      minHeight: 44,
      alignSelf: "stretch",
    },
    exerciseIconShell: {
      height: 48,
      width: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    exerciseIconShellComplete: {
      backgroundColor: theme.colors.success,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor:
        theme.mode === "dark"
          ? "rgba(200, 255, 226, 0.45)"
          : "rgba(255, 255, 255, 0.4)",
      ...Platform.select({
        ios: {
          shadowColor: theme.colors.success,
          shadowOpacity: theme.mode === "dark" ? 0.5 : 0.38,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        android: { elevation: 3 },
      }),
    },
    exerciseCopy: {
      flexShrink: 1,
      gap: 2,
      minWidth: 0,
      maxWidth: "100%",
      alignItems: "flex-start",
    },
    exerciseEyebrow: {
      color: theme.colors.primary,
      fontSize: 9,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    exerciseTitle: {
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    exerciseTitleInput: {
      flexGrow: 0,
      alignSelf: "flex-start",
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.5,
      paddingVertical: 2,
      paddingHorizontal: 0,
      margin: 0,
      maxWidth: "100%",
    },
    exerciseSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: F.medium,
      fontWeight: "500",
    },
    exerciseActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },
    setCountPill: {
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    setCountPillComplete: {
      backgroundColor: theme.colors.success,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor:
        theme.mode === "dark"
          ? "rgba(200, 245, 220, 0.5)"
          : "rgba(255, 255, 255, 0.42)",
    },
    setCountText: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    setCountTextComplete: {
      color: "#06140F",
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 0.2,
    },
    exerciseIconButton: {
      height: 34,
      width: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    exerciseIconButtonActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    exerciseDeleteButton: {
      borderColor: theme.mode === "dark" ? "rgba(255, 105, 60, 0.36)" : "#F1C4C7",
      backgroundColor: theme.colors.errorSoft,
    },
    exerciseBody: {
      gap: 12,
    },
    exerciseEditorBanner: {
      borderRadius: 16,
      backgroundColor: theme.mode === "dark" ? "#221411" : "#E1EEFB",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    exerciseEditorBannerText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: F.medium,
      fontWeight: "500",
    },
    notesCard: {
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 12,
      gap: 4,
    },
    notesLabel: {
      color: theme.colors.primary,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    notesText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: F.regular,
      fontWeight: "400",
    },
    notesInput: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: F.regular,
      fontWeight: "400",
      paddingVertical: 2,
      paddingHorizontal: 0,
      margin: 0,
      minHeight: 20,
    },
    metricToggleCard: {
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 12,
      gap: 8,
    },
    metricToggleLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    metricToggleRow: {
      flexDirection: "row",
      gap: 8,
    },
    metricToggleButton: {
      flex: 1,
      minHeight: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
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
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    metricToggleTextActive: {
      color: theme.colors.surface,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    restRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    restLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    restInputPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    restInput: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      minWidth: 32,
      padding: 0,
      textAlign: "right",
    },
    restUnit: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    setList: {
      gap: 10,
    },
    setRow: {
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 12,
      gap: 12,
    },
    setRowCompact: {
      paddingVertical: 10,
      gap: 10,
    },
    setRowComplete: {
      backgroundColor: theme.colors.successSoft,
    },
    setRowUpcoming: {
      backgroundColor: theme.mode === "dark" ? theme.colors.surfaceStrong : "#EEF4FA",
    },
    setRowHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    setRowOpenButton: {
      gap: 8,
    },
    setLabel: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    setTarget: {
      marginTop: 2,
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontFamily: F.medium,
      fontWeight: "500",
    },
    setExerciseName: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      textAlign: "right",
    },
    setHeaderActions: {
      alignItems: "flex-end",
      gap: 6,
    },
    setDonePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    setDoneText: {
      color: theme.colors.success,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    setRowHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: F.regular,
      fontWeight: "400",
    },
    setRowTitleColumn: {
      flex: 1,
      gap: 4,
    },
    setTargetEditRow: {
      flexDirection: "row",
    },
    targetEditPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    targetEditInput: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      minWidth: 26,
      padding: 0,
      textAlign: "right",
    },
    targetEditUnit: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    inlineRemoveButton: {
      height: 24,
      width: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.errorSoft,
    },
    sourceUrlPill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginTop: 4,
    },
    sourceUrlText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    removeItemButton: {
      alignSelf: "flex-end",
      borderRadius: 999,
      backgroundColor: theme.colors.errorSoft,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    removeItemButtonText: {
      color: theme.colors.error,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    inputRow: {
      flexDirection: "row",
      gap: 10,
    },
    inputField: {
      flex: 1,
      gap: 6,
    },
    inputFieldFull: {
      flex: 1,
    },
    inputLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    input: {
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    autoAdvanceText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: F.regular,
      fontWeight: "400",
    },
    confirmSetButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 999,
      paddingVertical: 12,
      backgroundColor: theme.colors.primary,
    },
    confirmSetButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    confirmSetButtonDisabled: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    confirmSetButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    confirmSetButtonTextDisabled: {
      color: theme.colors.textMuted,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    editModeHint: {
      color: theme.colors.primary,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: F.medium,
      fontWeight: "500",
    },
    emptySetCard: {
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 18,
      alignItems: "center",
      gap: 8,
    },
    emptySetTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    emptySetBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      fontFamily: F.regular,
      fontWeight: "400",
    },
    addSetButton: {
      minHeight: 48,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    addSetButtonText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    emptyCard: {
      borderRadius: 24,
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
      fontFamily: F.regular,
      fontWeight: "400",
    },
    addExerciseButton: {
      marginTop: 2,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...theme.shadows.primary,
    },
    addExerciseButtonText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    finishButton: {
      marginTop: 4,
      minHeight: 58,
      borderRadius: 18,
      backgroundColor: theme.colors.primaryBright,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      ...theme.shadows.primary,
    },
    finishButtonText: {
      color: theme.colors.surface,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    scheduleAgainButton: {
      marginTop: 4,
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    scheduleAgainButtonDisabled: {
      opacity: 0.6,
    },
    scheduleAgainButtonText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    saveButtonDone: {
      backgroundColor: theme.colors.surfaceMuted,
      opacity: 0.92,
    },
  });
