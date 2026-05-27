import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Linking, View, StyleSheet, Text, Pressable } from "react-native";

import CoachSheet, { type CoachChatMessage } from "../components/CoachSheet";
import { F } from "../lib/fonts";
import { LiveWorkoutActivity } from "../lib/liveWorkoutActivity";
import { darkColors, type ThemeMode } from "../theme";
import type {
  ActiveExercisePreview,
  ActiveSessionPreview,
  ActiveSetPreview,
} from "../types";
import type { MeasurementUnitSystem } from "../lib/measurementUnits";
import type { WorkoutContext as ChatWorkoutContext } from "../lib/chat";

import {
  findCursor,
  buildStack,
  countProgress,
  deepCloneExercises,
  findPreviousFinishedCursor,
  formatClock,
  computeVolume,
} from "../components/workout/workoutUtils";
import WorkoutTopBar from "../components/workout/WorkoutTopBar";
import WorkoutExerciseStrip from "../components/workout/WorkoutExerciseStrip";
import WorkoutSetCard from "../components/workout/WorkoutSetCard";
import WorkoutRestOverlay from "../components/workout/WorkoutRestOverlay";
import WorkoutEditSheet from "../components/workout/WorkoutEditSheet";
import WorkoutOverviewSheet from "../components/workout/WorkoutOverviewSheet";
import WorkoutFinishModal from "../components/workout/WorkoutFinishModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveActivityProgress {
  exerciseName: string;
  currentSet: number;
  totalSets: number;
  phase: "active" | "rest" | "ready";
  restEndAt: number | null;
  nextSet: number | null;
}

interface RestState {
  targetSeconds: number;
  startedAt: number;
}

interface ActiveWorkoutScreenProps {
  session: ActiveSessionPreview;
  onBack: () => void;
  onFinish: (session: ActiveSessionPreview) => void;
  coachMessages: CoachChatMessage[];
  setCoachMessages: Dispatch<SetStateAction<CoachChatMessage[]>>;
  onCoachButtonMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  coachOpenRequestId?: number;
  hubTourStep?: "active_scroll" | "finish_workout" | null;
  onHubTourFinishButtonMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onHubTourListViewportMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onHubTourFinishButtonVisible?: () => void;
  themeMode?: ThemeMode;
  /**
   * The athlete's onboarding measurement-unit preference. Passed through to
   * the set card so the WEIGHT input shows kg or lb correctly. New sets the
   * athlete logs are stamped with the matching `weightUnit` so historical
   * reads remain in the unit they were recorded in.
   */
  unitSystem?: MeasurementUnitSystem;
  resolveLastLiftLabel?: (exerciseName: string, setPositionOneBased: number) => string | null;
  resolveExerciseLiftSummary?: (exerciseName: string) => {
    lastSessionLabel: string | null;
    personalRecordLabel: string | null;
  } | null;
  userId?: string | null;
  onOpenSuggestFeatures?: () => void;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function buildCoachDraftLoggedSummary(set: ActiveSetPreview): string | null {
  const w = set.loggedWeight.trim();
  const r = set.loggedReps.trim();
  if (!w && !r) return null;
  const parts: string[] = [];
  if (w) parts.push(`${w} lb`);
  if (r) parts.push(set.targetDurationSec != null ? `${r}s held` : `${r} reps`);
  return parts.join(" · ") || null;
}

function getTargetCopy(set: ActiveSetPreview) {
  if (set.targetDurationSec != null) return `${set.targetDurationSec}s target`;
  if (set.targetReps != null) return `${set.targetReps} reps target`;
  return "Log your set";
}

function deriveLiveActivityProgress(
  exercises: ActiveExercisePreview[],
  restTargetSeconds: number | null,
  restElapsedSeconds: number,
): LiveActivityProgress | null {
  if (!exercises.length) return null;

  let active: ActiveExercisePreview | null = null;
  for (const exercise of exercises) {
    if (exercise.sets.length === 0) continue;
    const hasIncomplete = exercise.sets.some((s) => !s.completed);
    if (hasIncomplete) {
      active = exercise;
      break;
    }
  }
  if (!active) active = exercises[exercises.length - 1];

  const totalSets = active.sets.length || 1;
  const incompleteIndex = active.sets.findIndex((s) => !s.completed);
  const currentSetIndex = incompleteIndex >= 0 ? incompleteIndex : totalSets - 1;
  const currentSet = currentSetIndex + 1;
  const nextSetCandidate = currentSetIndex + 1;
  const nextSet = nextSetCandidate < totalSets ? nextSetCandidate + 1 : null;

  const isResting =
    restTargetSeconds != null &&
    restTargetSeconds > 0 &&
    restElapsedSeconds < restTargetSeconds;

  const restEndAt = isResting
    ? Date.now() + Math.max(0, restTargetSeconds! - restElapsedSeconds) * 1000
    : null;

  return {
    exerciseName: active.name,
    currentSet,
    totalSets,
    phase: isResting ? "rest" : "active",
    restEndAt,
    nextSet,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActiveWorkoutScreen({
  session,
  onFinish,
  coachMessages,
  setCoachMessages,
  onCoachButtonMeasured,
  coachOpenRequestId = 0,
  themeMode,
  unitSystem = "imperial",
  resolveLastLiftLabel,
  resolveExerciseLiftSummary,
  userId = null,
  onOpenSuggestFeatures,
}: ActiveWorkoutScreenProps) {
  const preferredWeightUnit: "lb" | "kg" =
    unitSystem === "metric" ? "kg" : "lb";
  // ── Core state ──────────────────────────────────────────────────────────────
  const [exercises, setExercises] = useState<ActiveExercisePreview[]>(() =>
    deepCloneExercises(session.exercises),
  );
  const [restState, setRestState] = useState<RestState | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [restElapsed, setRestElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  /** Wall-clock time at which the user pressed pause; null while running. */
  const [pausedAtWallMs, setPausedAtWallMs] = useState<number | null>(null);
  /**
   * Total milliseconds the workout has spent in the paused state. We subtract
   * this from `now - session.startedAt` so the elapsed clock cleanly resumes
   * from where the user paused without inventing a new "startedAt".
   */
  const [pausedAccumulatorMs, setPausedAccumulatorMs] = useState(0);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const cursor = useMemo(() => findCursor(exercises), [exercises]);
  const stack = useMemo(() => buildStack(exercises, cursor), [exercises, cursor]);
  const progress = useMemo(() => countProgress(exercises), [exercises]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const coachButtonRef = useRef<View | null>(null);
  const lastCoachOpenRequestIdRef = useRef(coachOpenRequestId);
  const liveActivityLastPayloadRef = useRef<string | null>(null);

  // ── Reset on new session ────────────────────────────────────────────────────
  useEffect(() => {
    setExercises(deepCloneExercises(session.exercises));
    setIsPaused(false);
    setPausedAtWallMs(null);
    setPausedAccumulatorMs(0);
  }, [session]);

  // ── Elapsed workout timer ───────────────────────────────────────────────────
  // While paused, freeze elapsed at the moment of the pause so the clock can
  // pick up exactly where it left off when the user resumes.
  useEffect(() => {
    const startedAt = session.startedAt;
    const update = () => {
      const reference = pausedAtWallMs ?? Date.now();
      setElapsed(
        Math.max(
          0,
          Math.floor((reference - startedAt - pausedAccumulatorMs) / 1000),
        ),
      );
    };
    update();
    if (pausedAtWallMs != null) {
      // Paused — no need to keep ticking.
      return;
    }
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [session.startedAt, pausedAtWallMs, pausedAccumulatorMs]);

  // ── Rest elapsed timer (for Live Activity) ──────────────────────────────────
  useEffect(() => {
    if (!restState) {
      setRestElapsed(0);
      return;
    }
    if (pausedAtWallMs != null) {
      // Pause freezes the rest timer too — we read the rest end-time from the
      // current elapsed value below, so simply don't tick the clock here.
      return;
    }
    const { startedAt } = restState;
    const update = () => setRestElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [restState, pausedAtWallMs]);

  // ── Pause toggle ───────────────────────────────────────────────────────────
  // Capturing pausedAtWallMs lets us add the pause duration to
  // pausedAccumulatorMs on resume so the elapsed clock looks continuous.
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      const now = Date.now();
      if (next) {
        setPausedAtWallMs(now);
        if (restState) {
          // Snapshot the rest start so it resumes counting from the same place.
          setRestState({
            ...restState,
            startedAt: restState.startedAt,
          });
        }
      } else {
        setPausedAtWallMs((wallMs) => {
          if (wallMs != null) {
            const delta = Math.max(0, now - wallMs);
            setPausedAccumulatorMs((accum) => accum + delta);
            if (restState) {
              // Push the rest startedAt forward by the same delta so the rest
              // overlay's countdown picks up exactly where it paused.
              setRestState({
                ...restState,
                startedAt: restState.startedAt + delta,
              });
            }
          }
          return null;
        });
      }
      return next;
    });
  }, [restState]);

  const handleOpenSource = useCallback(() => {
    const url = session.sourceUrl?.trim();
    if (!url) {
      return;
    }
    Linking.openURL(url).catch(() => undefined);
  }, [session.sourceUrl]);

  // ── Auto-open finish when all sets done ─────────────────────────────────────
  useEffect(() => {
    if (!cursor && progress.total > 0 && progress.done > 0) {
      setShowFinish(true);
    }
  }, [cursor, progress.done, progress.total]);

  // ── Coach sheet: open programmatically ─────────────────────────────────────
  useEffect(() => {
    if (coachOpenRequestId === lastCoachOpenRequestIdRef.current) return;
    lastCoachOpenRequestIdRef.current = coachOpenRequestId;
    if (coachOpenRequestId > 0) setCoachOpen(true);
  }, [coachOpenRequestId]);

  // ── Live Activity ───────────────────────────────────────────────────────────
  const liveActivityProgress = useMemo(
    () =>
      deriveLiveActivityProgress(
        exercises,
        restState?.targetSeconds ?? null,
        restElapsed,
      ),
    [exercises, restState, restElapsed],
  );

  useEffect(() => {
    if (!LiveWorkoutActivity.isAvailable() || !liveActivityProgress) return;
    const workoutName = (session.title || "Workout").trim() || "Workout";
    const payload = {
      workoutName,
      exerciseName: liveActivityProgress.exerciseName,
      currentSet: liveActivityProgress.currentSet,
      totalSets: liveActivityProgress.totalSets,
      phase: liveActivityProgress.phase,
      restEndAt: liveActivityProgress.restEndAt,
      nextSet: liveActivityProgress.nextSet,
    } as const;
    const key = JSON.stringify({
      ...payload,
      restEndAt: payload.restEndAt
        ? Math.floor((payload.restEndAt as number) / 1000)
        : null,
    });
    if (liveActivityLastPayloadRef.current === key) return;
    liveActivityLastPayloadRef.current = key;
    void LiveWorkoutActivity.start(payload);
  }, [liveActivityProgress, session.title]);

  // ── Coach button measurement ────────────────────────────────────────────────
  const measureCoachButton = useCallback(() => {
    if (!onCoachButtonMeasured) return;
    coachButtonRef.current?.measureInWindow?.((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        onCoachButtonMeasured(null);
        return;
      }
      onCoachButtonMeasured({ x, y, width, height });
    });
  }, [onCoachButtonMeasured]);

  useEffect(() => {
    const id = requestAnimationFrame(measureCoachButton);
    return () => cancelAnimationFrame(id);
  }, [measureCoachButton]);

  // ── Coach workout context ───────────────────────────────────────────────────
  const coachWorkoutContext = useMemo<ChatWorkoutContext>(() => {
    const plan = session.workoutPlan;
    let focusExercise: ActiveExercisePreview | undefined;
    let focusExerciseIndexZero = -1;
    let focusSet: ActiveSetPreview | undefined;
    let focusSetNumber: number | null = null;

    if (cursor) {
      focusExerciseIndexZero = cursor.exerciseIndex;
      focusExercise = exercises[cursor.exerciseIndex];
      focusSet = focusExercise?.sets[cursor.setIndex];
      focusSetNumber = cursor.setIndex + 1;
    } else if (exercises.length > 0) {
      focusExerciseIndexZero = exercises.length - 1;
      focusExercise = exercises[focusExerciseIndexZero];
      if (focusExercise.sets.length > 0) {
        const last = focusExercise.sets.length - 1;
        focusSet = focusExercise.sets[last];
        focusSetNumber = last + 1;
      }
    }

    const draftLogged = focusSet != null ? buildCoachDraftLoggedSummary(focusSet) : null;

    return {
      title: session.title || null,
      description: session.description || null,
      workout_type: plan?.workout_type ?? null,
      muscle_groups: plan?.muscle_groups?.length ? plan.muscle_groups : null,
      equipment: plan?.equipment?.length ? plan.equipment : null,
      exercises: exercises.map((exercise) => {
        const referenceSet = exercise.sets[0];
        const setsDone = exercise.sets.filter((s) => s.completed).length;
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
      elapsed_sec: elapsed,
      timer_paused: false,
      completed_set_count: progress.done,
      total_set_count: progress.total,
      current_exercise_index:
        focusExerciseIndexZero >= 0 ? focusExerciseIndexZero + 1 : null,
      current_exercise_name: focusExercise?.name ?? null,
      current_set_number: focusSetNumber,
      current_set_target_summary: focusSet ? getTargetCopy(focusSet) : null,
      current_set_logged_summary: draftLogged,
      source_workout_id: session.sourceWorkoutId ?? null,
      source_job_id: session.sourceJobId ?? null,
      source_url: session.sourceUrl ?? null,
    };
  }, [cursor, elapsed, exercises, progress.done, progress.total, session]);

  // ── Workout operations ──────────────────────────────────────────────────────
  const updateCurrentSet = useCallback(
    (patch: Partial<ActiveSetPreview>) => {
      if (!cursor) return;
      setExercises((prev) => {
        const next = deepCloneExercises(prev);
        Object.assign(next[cursor.exerciseIndex].sets[cursor.setIndex], patch);
        return next;
      });
    },
    [cursor],
  );

  const logCurrentSet = useCallback(() => {
    if (!cursor) return;
    setExercises((prev) => {
      const next = deepCloneExercises(prev);
      const set = next[cursor.exerciseIndex].sets[cursor.setIndex];
      const finalWeight =
        set.loggedWeight ||
        (set.targetReps != null ? "" : "");
      const finalReps =
        set.loggedReps ||
        (set.targetReps != null ? String(set.targetReps) : "") ||
        (set.targetDurationSec != null ? String(set.targetDurationSec) : "");
      set.loggedWeight = finalWeight;
      set.loggedReps = finalReps;
      set.completed = true;
      return next;
    });

    const ex = exercises[cursor.exerciseIndex];
    if (ex?.restSeconds && ex.restSeconds > 0) {
      setRestState({ targetSeconds: ex.restSeconds, startedAt: Date.now() });
    }
  }, [cursor, exercises]);

  const skipCurrentSet = useCallback(() => {
    if (!cursor) return;
    setExercises((prev) => {
      const next = deepCloneExercises(prev);
      next[cursor.exerciseIndex].sets[cursor.setIndex].skipped = true;
      return next;
    });
  }, [cursor]);

  const addSet = useCallback(() => {
    if (!cursor) return;
    setExercises((prev) => {
      const next = deepCloneExercises(prev);
      const ex = next[cursor.exerciseIndex];
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push({
        id: `s-${ex.id}-extra-${Date.now()}`,
        label: `Set ${ex.sets.length + 1}`,
        targetReps: last.targetReps,
        targetDurationSec: last.targetDurationSec,
        loggedWeight: "",
        loggedReps: "",
        completed: false,
      });
      return next;
    });
  }, [cursor]);

  const removeLastSet = useCallback(() => {
    if (!cursor) return;
    setExercises((prev) => {
      const next = deepCloneExercises(prev);
      const ex = next[cursor.exerciseIndex];
      if (ex.sets.length > 1) ex.sets.pop();
      return next;
    });
  }, [cursor]);

  const previousSetCursor = useMemo(
    () => findPreviousFinishedCursor(exercises, cursor),
    [cursor, exercises],
  );

  const backToPreviousSet = useCallback(() => {
    setRestState(null);
    setShowFinish(false);
    setExercises((prev) => {
      const target = findPreviousFinishedCursor(prev, findCursor(prev));
      if (!target) return prev;

      const next = deepCloneExercises(prev);
      const previousSet = next[target.exerciseIndex]?.sets[target.setIndex];
      if (!previousSet) return prev;

      previousSet.completed = false;
      previousSet.skipped = false;
      return next;
    });
  }, []);

  const handleFinish = useCallback(() => {
    const updatedSession: ActiveSessionPreview = {
      ...session,
      exercises,
    };
    onFinish(updatedSession);
  }, [session, exercises, onFinish]);

  // ── Rest overlay info ───────────────────────────────────────────────────────
  const restNextCursor = useMemo(
    () => findCursor(exercises),
    [exercises],
  );
  const restExerciseName = restNextCursor
    ? exercises[restNextCursor.exerciseIndex]?.name ?? "Next exercise"
    : "Workout complete";
  const restNextSetLabel = restNextCursor
    ? `Set ${restNextCursor.setIndex + 1} of ${exercises[restNextCursor.exerciseIndex]?.sets.length ?? 0}`
    : "";

  // ── Editing exercise ────────────────────────────────────────────────────────
  const editingExercise = useMemo(
    () => exercises.find((e) => e.id === editingExerciseId) ?? null,
    [exercises, editingExerciseId],
  );

  const C = darkColors;

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <WorkoutTopBar
        title={session.title}
        elapsed={elapsed}
        done={progress.done}
        total={progress.total}
        isPaused={isPaused}
        onTogglePause={togglePause}
        sourceUrl={session.sourceUrl}
        onOpenSource={handleOpenSource}
        onCoach={() => setCoachOpen(true)}
        onOverview={() => setShowOverview(true)}
        onFinish={() => setShowFinish(true)}
        coachButtonRef={coachButtonRef}
      />

      {/* Exercise strip */}
      {exercises.length > 0 ? (
        <View style={styles.strip}>
          <WorkoutExerciseStrip
            exercises={exercises}
            currentExerciseIndex={cursor?.exerciseIndex ?? exercises.length - 1}
            currentSetIndex={cursor?.setIndex ?? 0}
            onReorder={setExercises}
          />
        </View>
      ) : null}

      {/* Card stack area */}
      <View style={styles.stackArea}>
        {stack.length > 0 ? (
          <View style={StyleSheet.absoluteFillObject}>
            {[...stack]
              .reverse()
              .map((item, revIdx) => {
                const stackIdx = stack.length - 1 - revIdx;
                const isTop = stackIdx === 0;
                return (
                  <WorkoutSetCard
                    key={`${item.exercise.id}-${item.set.id}`}
                    exercise={item.exercise}
                    set={item.set}
                    setIndexInExercise={item.setIndex}
                    exerciseIndex={item.exerciseIndex}
                    isTopCard={isTop}
                    isFirstOfWorkout={isTop && progress.done === 0}
                    zIndex={10 - stackIdx}
                    offsetY={stackIdx * 8}
                    scale={1 - stackIdx * 0.035}
                    onLog={isTop ? logCurrentSet : () => {}}
                    onSkip={isTop ? skipCurrentSet : () => {}}
                    onBack={isTop ? backToPreviousSet : () => {}}
                    canGoBack={isTop && previousSetCursor != null}
                    onWeightChange={
                      isTop
                        ? (v) =>
                            // Stamp the user's current preferred unit on every
                            // edit so the value's meaning is unambiguous when
                            // it lands in completed_workouts JSON. Existing
                            // sets without a unit are read as `lb` (legacy
                            // default) so historical data stays correct.
                            updateCurrentSet({
                              loggedWeight: v,
                              weightUnit:
                                item.set.weightUnit ?? preferredWeightUnit,
                            })
                        : () => {}
                    }
                    onRepsChange={
                      isTop
                        ? (v) => updateCurrentSet({ loggedReps: v })
                        : () => {}
                    }
                    onNotesChange={
                      isTop
                        ? (v) =>
                            updateCurrentSet({
                              notes: v.length > 0 ? v : null,
                            })
                        : () => {}
                    }
                    onAddSet={isTop ? addSet : () => {}}
                    onRemoveSet={isTop ? removeLastSet : () => {}}
                    onEditExercise={
                      isTop
                        ? () => setEditingExerciseId(item.exercise.id)
                        : () => {}
                    }
                    lastLiftLabel={
                      resolveLastLiftLabel
                        ? resolveLastLiftLabel(item.exercise.name, item.setIndex + 1)
                        : null
                    }
                    personalRecordLabel={
                      resolveExerciseLiftSummary?.(item.exercise.name)?.personalRecordLabel ?? null
                    }
                    weightUnit={preferredWeightUnit}
                  />
                );
              })}
          </View>
        ) : (
          <FinishedHero onFinish={() => setShowFinish(true)} />
        )}
      </View>

      {/* Rest overlay */}
      {restState ? (
        <WorkoutRestOverlay
          targetSeconds={restState.targetSeconds}
          exerciseName={restExerciseName}
          nextSetLabel={restNextSetLabel}
          onDone={() => setRestState(null)}
          onSkip={() => setRestState(null)}
        />
      ) : null}

      {/* Edit sheet */}
      {editingExercise ? (
        <WorkoutEditSheet
          exercise={editingExercise}
          onClose={() => setEditingExerciseId(null)}
          onUpdate={(updated) => {
            setExercises((prev) =>
              prev.map((e) => (e.id === updated.id ? updated : e)),
            );
          }}
          onRemove={() => {
            setExercises((prev) =>
              prev.filter((e) => e.id !== editingExerciseId),
            );
            setEditingExerciseId(null);
          }}
        />
      ) : null}

      {/* Overview sheet */}
      {showOverview ? (
        <WorkoutOverviewSheet
          title={session.title}
          exercises={exercises}
          sourceUrl={session.sourceUrl}
          onClose={() => setShowOverview(false)}
          onEditExercise={(id) => {
            setShowOverview(false);
            setEditingExerciseId(id);
          }}
          onRemoveExercise={(id) => {
            setExercises((prev) => prev.filter((e) => e.id !== id));
          }}
          onReorder={setExercises}
          onAddExercise={(name) => {
            setExercises((prev) => [
              ...prev,
              {
                id: `ex-${Date.now()}`,
                name,
                subtitle: "",
                blockName: "Accessory",
                notes: null,
                restSeconds: 90,
                sets: [
                  {
                    id: `s-new-${Date.now()}-1`,
                    label: "Set 1",
                    targetReps: 10,
                    targetDurationSec: null,
                    loggedWeight: "",
                    loggedReps: "",
                    completed: false,
                  },
                  {
                    id: `s-new-${Date.now()}-2`,
                    label: "Set 2",
                    targetReps: 10,
                    targetDurationSec: null,
                    loggedWeight: "",
                    loggedReps: "",
                    completed: false,
                  },
                  {
                    id: `s-new-${Date.now()}-3`,
                    label: "Set 3",
                    targetReps: 10,
                    targetDurationSec: null,
                    loggedWeight: "",
                    loggedReps: "",
                    completed: false,
                  },
                ],
              },
            ]);
          }}
        />
      ) : null}

      {/* Finish modal */}
      {showFinish ? (
        <WorkoutFinishModal
          exercises={exercises}
          elapsed={elapsed}
          onConfirm={handleFinish}
          onCancel={() => setShowFinish(false)}
        />
      ) : null}

      {/* Coach sheet */}
      <CoachSheet
        messages={coachMessages}
        setMessages={setCoachMessages}
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        workout={coachWorkoutContext}
        themeMode={themeMode}
        userId={userId}
        onOpenSuggestFeatures={onOpenSuggestFeatures}
      />
    </View>
  );
}

// ─── Finished hero ────────────────────────────────────────────────────────────

function FinishedHero({ onFinish }: { onFinish: () => void }) {
  const C = darkColors;
  return (
    <View style={heroStyles.container}>
      <View style={heroStyles.circle}>
        <Text style={heroStyles.checkmark}>✓</Text>
      </View>
      <Text style={heroStyles.heading}>All sets done</Text>
      <Text style={heroStyles.subtitle}>
        You crushed it. Hit finish to save and review your session.
      </Text>
      <Pressable onPress={onFinish} style={heroStyles.button}>
        <Text style={heroStyles.buttonText}>Finish workout</Text>
      </Pressable>
    </View>
  );
}

const C = darkColors;

const heroStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  circle: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  checkmark: {
    fontSize: 36,
    color: "#fff",
    fontFamily: F.bold,
  },
  heading: {
    fontFamily: F.black,
    fontSize: 26,
    letterSpacing: -0.5,
    color: C.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: F.regular,
    fontSize: 14,
    color: C.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 6,
  },
  buttonText: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: "#fff",
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: darkColors.background,
  },
  strip: {
    marginTop: 8,
  },
  stackArea: {
    flex: 1,
    padding: 12,
    paddingBottom: 16,
    position: "relative",
  },
});

export default ActiveWorkoutScreen;
