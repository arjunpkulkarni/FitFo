/**
 * Recovery Map state model.
 *
 * Every muscle group runs on a 72h recovery clock anchored to the last
 * completed workout that hit it. The percentage climbs continuously (recompute
 * on screen open + every minute the screen is mounted), while the color stage
 * switches at the 24h / 48h / 72h checkpoints. V1 keeps the model flat: no
 * volume scaling, no decay, no compounding for back-to-back sessions (the
 * clock simply resets to the most recent hit).
 */

import type {
  ActiveExercisePreview,
  CompletedWorkoutRecord,
  MuscleGroup,
  WorkoutPlan,
} from "../types";

/**
 * v1 taxonomy. Shoulders is one group because `react-native-body-highlighter`
 * exposes a single `deltoids` slug — splitting front/side/rear delts in the
 * bar list while showing them as one region on the map would be a confusing
 * mismatch. Forearms are tracked because curls and grip-heavy work fatigue
 * them in a way the spec calls out explicitly.
 */
export type RecoveryMuscle =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

export const RECOVERY_MUSCLES: readonly RecoveryMuscle[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
] as const;

export const RECOVERY_MUSCLE_LABELS: Record<RecoveryMuscle, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
};

/** Slugs from `react-native-body-highlighter` that paint each recovery group. */
export const RECOVERY_MUSCLE_TO_BODY_SLUGS: Record<RecoveryMuscle, string[]> = {
  chest: ["chest"],
  back: ["upper-back", "lower-back", "trapezius"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs", "obliques"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
};

export type RecoveryStage =
  | "fatigued"
  | "recovering"
  | "almost"
  | "fresh";

export interface RecoveryStageMeta {
  label: string;
  /** Hex color used for the bar fill, body shading, and legend chip. */
  color: string;
  /** Short note shown under the bar while a muscle is mid-recovery. */
  body: string;
}

export const RECOVERY_STAGE_META: Record<RecoveryStage, RecoveryStageMeta> = {
  fatigued: {
    label: "Fatigued",
    color: "#DC2626",
    body: "Just trained — let it cook.",
  },
  recovering: {
    label: "Recovering",
    color: "#F97316",
    body: "Not yet — give it more time.",
  },
  almost: {
    label: "Almost ready",
    color: "#FACC15",
    body: "Okay to train, but not optimal.",
  },
  fresh: {
    label: "Fresh",
    color: "#22C55E",
    body: "Ready to train.",
  },
};

const RECOVERY_WINDOW_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

export interface MuscleRecoveryState {
  muscle: RecoveryMuscle;
  stage: RecoveryStage;
  /** 0–100. 100 means fully recovered (Fresh). */
  percent: number;
  /** ms since the last hit. null when the muscle has never been recorded. */
  msSinceLastHit: number | null;
  /** ISO completed_at of the most recent workout that hit this muscle. */
  lastHitAt: string | null;
}

export type RecoveryMap = Record<RecoveryMuscle, MuscleRecoveryState>;

/**
 * Per-exercise keyword inference. Order matters slightly — patterns earlier in
 * a muscle's list win when several would match, but the matcher is additive
 * across muscles (a bench press lights up chest + triceps + shoulders).
 *
 * Keep this conservative. The spec is explicit: track primary movers only. So
 * a barbell row hits back + biceps, not "everything that braces the lift".
 */
const EXERCISE_KEYWORDS: Array<{
  muscles: RecoveryMuscle[];
  patterns: RegExp[];
}> = [
  // Chest + assists
  {
    muscles: ["chest", "triceps", "shoulders"],
    patterns: [
      /\bbench\s*press\b/,
      /\bdb\s*bench\b/,
      /\bincline\s*press\b/,
      /\bdecline\s*press\b/,
      /\bchest\s*press\b/,
      /\bpush[-\s]?up\b/,
      /\bpushup\b/,
    ],
  },
  {
    muscles: ["chest"],
    patterns: [
      /\bpec(?:toral)?\s*(?:fly|flye|deck)?\b/,
      /\b(?:cable|dumbbell|db|incline|decline|flat)?\s*fly(?:e|es)?\b/,
      /\bchest\b/,
    ],
  },
  // Dips emphasize triceps & lower chest
  {
    muscles: ["triceps", "chest"],
    patterns: [/\bdip(?:s)?\b/],
  },
  // Triceps isolation
  {
    muscles: ["triceps"],
    patterns: [
      /\bskull\s*crusher\b/,
      /\btricep\s*extension\b/,
      /\bpushdown\b/,
      /\bpush[-\s]?down\b/,
      /\bkickback(?:s)?\b/,
      /\bclose[-\s]?grip\s*(?:bench|press)\b/,
      /\btricep(?:s)?\b/,
    ],
  },
  // Overhead pressing
  {
    muscles: ["shoulders", "triceps"],
    patterns: [
      /\boverhead\s*press\b/,
      /\b(?:military|shoulder|ohp|strict|push)\s*press\b/,
      /\barnold\s*press\b/,
    ],
  },
  // Shoulder isolation
  {
    muscles: ["shoulders"],
    patterns: [
      /\blateral\s*raises?\b/,
      /\bside\s*raises?\b/,
      /\bfront\s*raises?\b/,
      /\brear\s*delt\b/,
      /\bupright\s*row\b/,
      /\bface\s*pull\b/,
      /\bdelt(?:oid)?\b/,
      /\bshoulder\b/,
    ],
  },
  // Pulls — back + biceps (compound)
  {
    muscles: ["back", "biceps"],
    patterns: [
      /\brow(?:s|ing)?\b/,
      /\bpull[-\s]?up\b/,
      /\bpullup\b/,
      /\bchin[-\s]?up\b/,
      /\blat\s*(?:pull[-\s]?down|pulldown)?\b/,
    ],
  },
  // Hinge — back + hamstrings + glutes
  {
    muscles: ["back", "hamstrings", "glutes"],
    patterns: [/\bdeadlift\b/],
  },
  {
    muscles: ["hamstrings", "glutes", "back"],
    patterns: [/\brdl\b/, /\bromanian\s*deadlift\b/],
  },
  // Back isolation
  {
    muscles: ["back"],
    patterns: [
      /\bshrug\b/,
      /\bpullover\b/,
      /\bback\s*extension\b/,
      /\bsuperman\b/,
    ],
  },
  // Biceps + grip
  {
    muscles: ["biceps", "forearms"],
    patterns: [
      /\bcurl(?:s)?\b/,
      /\bhammer\s*curl\b/,
      /\bpreacher\s*curl\b/,
      /\bbicep(?:s)?\b/,
    ],
  },
  // Forearms direct
  {
    muscles: ["forearms"],
    patterns: [
      /\bwrist\s*curl\b/,
      /\bfarmer'?s?\s*(?:walk|carry)\b/,
      /\bforearm\b/,
    ],
  },
  // Squat pattern
  {
    muscles: ["quads", "glutes"],
    patterns: [
      /\bsquat(?:s)?\b/,
      /\bleg\s*press\b/,
      /\blunge(?:s)?\b/,
      /\bsplit\s*squat\b/,
      /\bbulgarian\s*split\s*squat\b/,
      /\bgoblet\s*squat\b/,
      /\bstep[-\s]?up\b/,
      /\bwall\s*sit\b/,
    ],
  },
  // Quad isolation
  {
    muscles: ["quads"],
    patterns: [/\bleg\s*extensions?\b/, /\bquad(?:ricep)?s?\b/],
  },
  // Hamstring isolation
  {
    muscles: ["hamstrings"],
    patterns: [
      /\bleg\s*curl\b/,
      /\bham(?:string)?\s*curl\b/,
      /\bnordic\s*curl\b/,
      /\bhamstring(?:s)?\b/,
    ],
  },
  // Glute isolation
  {
    muscles: ["glutes"],
    patterns: [/\bhip\s*thrust\b/, /\bglute\s*bridge\b/, /\bglute(?:s)?\b/],
  },
  // Calves
  {
    muscles: ["calves"],
    patterns: [/\bcalf\s*raises?\b/, /\bcalves?\b/, /\btoe\s*raises?\b/],
  },
  // Abs
  {
    muscles: ["abs"],
    patterns: [
      /\bcrunch(?:es)?\b/,
      /\bsit[-\s]?up\b/,
      /\bplank\b/,
      /\bleg\s*raise\b/,
      /\bhanging\s*knee\s*raise\b/,
      /\bab\s*wheel\b/,
      /\brollout\b/,
      /\boblique\b/,
      /\brussian\s*twist\b/,
      /\bmountain\s*climber\b/,
      /\bab(?:s|dominal)?\b/,
    ],
  },
];

/** Expanding coarse `MuscleGroup` to fine recovery muscles for fallback only. */
const COARSE_TO_RECOVERY: Record<MuscleGroup, RecoveryMuscle[]> = {
  chest: ["chest"],
  back: ["back"],
  shoulders: ["shoulders"],
  arms: ["biceps", "triceps", "forearms"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
};

/** Recovery muscles hit by a single exercise (by name). */
export function inferRecoveryMusclesFromExerciseName(
  name: string | null | undefined,
): RecoveryMuscle[] {
  if (!name) {
    return [];
  }
  const text = name.toLowerCase();
  const matched = new Set<RecoveryMuscle>();
  for (const { muscles, patterns } of EXERCISE_KEYWORDS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        for (const muscle of muscles) {
          matched.add(muscle);
        }
        break;
      }
    }
  }
  return RECOVERY_MUSCLES.filter((muscle) => matched.has(muscle));
}

/** Aggregate recovery muscles hit across a finished workout's exercises. */
export function inferRecoveryMusclesFromWorkout(
  exercises: ActiveExercisePreview[] | null | undefined,
  workoutPlan: WorkoutPlan | null | undefined,
): RecoveryMuscle[] {
  const hits = new Set<RecoveryMuscle>();
  for (const exercise of exercises || []) {
    for (const muscle of inferRecoveryMusclesFromExerciseName(exercise?.name)) {
      hits.add(muscle);
    }
  }
  if (hits.size > 0) {
    return RECOVERY_MUSCLES.filter((muscle) => hits.has(muscle));
  }
  // Fallback: nothing matched by name. Use the workout plan's coarse muscle
  // groups so the recovery clock still moves for older / unparsed workouts.
  for (const group of workoutPlan?.muscle_groups || []) {
    const expanded = COARSE_TO_RECOVERY[group];
    if (expanded) {
      for (const muscle of expanded) {
        hits.add(muscle);
      }
    }
  }
  return RECOVERY_MUSCLES.filter((muscle) => hits.has(muscle));
}

function classifyStage(hoursSince: number): RecoveryStage {
  if (hoursSince < 24) {
    return "fatigued";
  }
  if (hoursSince < 48) {
    return "recovering";
  }
  if (hoursSince < RECOVERY_WINDOW_HOURS) {
    return "almost";
  }
  return "fresh";
}

function freshState(muscle: RecoveryMuscle): MuscleRecoveryState {
  return {
    muscle,
    stage: "fresh",
    percent: 100,
    msSinceLastHit: null,
    lastHitAt: null,
  };
}

/**
 * Build the recovery state for every muscle, given the user's completed
 * workouts. `nowMs` lets callers stamp recompute-on-tick without re-reading
 * `Date.now()` inside the function (helpful for testing).
 */
export function computeRecoveryMap(
  completedWorkouts: ReadonlyArray<CompletedWorkoutRecord>,
  nowMs: number = Date.now(),
): RecoveryMap {
  const lastHit = new Map<RecoveryMuscle, number>();
  const lastHitIso = new Map<RecoveryMuscle, string>();

  for (const workout of completedWorkouts) {
    const completedAt = workout?.completed_at;
    if (!completedAt) {
      continue;
    }
    const completedMs = Date.parse(completedAt);
    if (!Number.isFinite(completedMs)) {
      continue;
    }
    const muscles = inferRecoveryMusclesFromWorkout(
      workout.exercises,
      workout.workout_plan,
    );
    for (const muscle of muscles) {
      const prev = lastHit.get(muscle);
      if (prev == null || completedMs > prev) {
        lastHit.set(muscle, completedMs);
        lastHitIso.set(muscle, completedAt);
      }
    }
  }

  const map = {} as RecoveryMap;
  for (const muscle of RECOVERY_MUSCLES) {
    const lastMs = lastHit.get(muscle);
    if (lastMs == null) {
      map[muscle] = freshState(muscle);
      continue;
    }
    const elapsedMs = Math.max(0, nowMs - lastMs);
    const hoursSince = elapsedMs / HOUR_MS;
    const percent = Math.max(
      0,
      Math.min(100, (hoursSince / RECOVERY_WINDOW_HOURS) * 100),
    );
    map[muscle] = {
      muscle,
      stage: classifyStage(hoursSince),
      percent,
      msSinceLastHit: elapsedMs,
      lastHitAt: lastHitIso.get(muscle) ?? null,
    };
  }
  return map;
}

/** Human-readable "Last hit 14h ago" / "2d ago" / "Never" label. */
export function formatLastHit(state: MuscleRecoveryState): string {
  if (state.msSinceLastHit == null) {
    return "Never logged";
  }
  const hours = state.msSinceLastHit / HOUR_MS;
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(state.msSinceLastHit / 60000));
    return `Last hit ${minutes}m ago`;
  }
  if (hours < 48) {
    return `Last hit ${Math.round(hours)}h ago`;
  }
  const days = hours / 24;
  return `Last hit ${days < 10 ? days.toFixed(1) : Math.round(days)}d ago`;
}
