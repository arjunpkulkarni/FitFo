import type { ActiveExercisePreview, ActiveSetPreview } from "../../types";

export type Cursor = { exerciseIndex: number; setIndex: number };

export type StackEntry = {
  exercise: ActiveExercisePreview;
  exerciseIndex: number;
  set: ActiveSetPreview;
  setIndex: number;
};

export type Progress = { done: number; skipped: number; total: number };

export function findCursor(exercises: ActiveExercisePreview[]): Cursor | null {
  for (let ei = 0; ei < exercises.length; ei++) {
    const ex = exercises[ei];
    for (let si = 0; si < ex.sets.length; si++) {
      const s = ex.sets[si];
      if (!s.completed && !s.skipped) return { exerciseIndex: ei, setIndex: si };
    }
  }
  return null;
}

export function findPreviousFinishedCursor(
  exercises: ActiveExercisePreview[],
  cursor: Cursor | null,
): Cursor | null {
  let startExerciseIndex = exercises.length - 1;
  const lastExercise = exercises[startExerciseIndex];
  let startSetIndex = lastExercise ? lastExercise.sets.length - 1 : -1;

  if (cursor) {
    startExerciseIndex = cursor.exerciseIndex;
    startSetIndex = cursor.setIndex - 1;
  }

  for (let ei = startExerciseIndex; ei >= 0; ei--) {
    const sets = exercises[ei]?.sets ?? [];
    const siStart = ei === startExerciseIndex ? startSetIndex : sets.length - 1;
    for (let si = siStart; si >= 0; si--) {
      const set = sets[si];
      if (set?.completed || set?.skipped) {
        return { exerciseIndex: ei, setIndex: si };
      }
    }
  }

  return null;
}

export function buildStack(
  exercises: ActiveExercisePreview[],
  cursor: Cursor | null,
): StackEntry[] {
  if (!cursor) return [];
  const cards: StackEntry[] = [];
  let ei = cursor.exerciseIndex;
  let si = cursor.setIndex;
  while (cards.length < 2 && ei < exercises.length) {
    const ex = exercises[ei];
    if (si >= ex.sets.length) {
      ei++;
      si = 0;
      continue;
    }
    const s = ex.sets[si];
    if (s.completed || s.skipped) {
      si++;
      continue;
    }
    cards.push({ exercise: ex, exerciseIndex: ei, set: s, setIndex: si });
    si++;
  }
  return cards;
}

export function countProgress(exercises: ActiveExercisePreview[]): Progress {
  let done = 0,
    skipped = 0,
    total = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      total++;
      if (s.completed) done++;
      else if (s.skipped) skipped++;
    }
  }
  return { done, skipped, total };
}

export function computeVolume(exercises: ActiveExercisePreview[]): number {
  return exercises.reduce((sum, ex) => {
    return (
      sum +
      ex.sets.reduce((s, set) => {
        if (set.completed && set.loggedWeight && set.loggedReps) {
          return s + parseFloat(set.loggedWeight) * parseInt(set.loggedReps, 10);
        }
        return s;
      }, 0)
    );
  }, 0);
}

export function deepCloneExercises(
  exercises: ActiveExercisePreview[],
): ActiveExercisePreview[] {
  return exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => ({ ...s })),
  }));
}

export function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
