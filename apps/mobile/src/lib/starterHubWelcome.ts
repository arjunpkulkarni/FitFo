import { listSavedWorkouts, saveWorkoutForLater } from "./api";
import type { OnboardingSex, SavedWorkoutRecord, WorkoutPlan } from "../types";

/** Saved-row titles double as de-dupe keys for demo imports. */
export const STARTER_JACOB_TITLE = "Jacob 6 day push workout";
export const STARTER_SAMANTHA_TITLE = "Samantha glutes and abs day";

const HUB_TIP_INTRO =
  "We saved the workouts from your onboarding demos into your Fitfo library from the reels you walked through during setup, so you can schedule or start whenever you want.";

/** Default body when parent does not pass explicit `body` (e.g. story / tests). */
export const FIRST_HUB_TIP_MODAL_BODY = `${HUB_TIP_INTRO}\n\nTwo starter routines from the onboarding demos are in your Saved tab.`;

/** Shown once in-app after onboarding; copy used by `FirstHubTipModal`. */
export const FIRST_HUB_TIP_MODAL_TITLE = "Demo workouts loaded";

export function getFirstHubTipModalTitle(_sex: OnboardingSex | null): string {
  return FIRST_HUB_TIP_MODAL_TITLE;
}

export function getFirstHubTipModalBody(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return `${HUB_TIP_INTRO}\n\nYou'll find Samantha's routine and Jacob's push day in Saved.`;
  }
  if (sex === "male") {
    return `${HUB_TIP_INTRO}\n\nThe push workout from the demo reel you tried is in Saved.`;
  }
  return `${HUB_TIP_INTRO}\n\nTwo starter routines from the onboarding demos are in your Saved tab.`;
}

export function getFirstHubTipStorageKey(profileId: string): string {
  return `@fitfo:first-hub-tip:${profileId}`;
}

const STARTER_META_LEFT = "Demo import";

const JACOB_PLAN: WorkoutPlan = {
  title: "Jacob 6 day push workout",
  workout_type: "strength",
  muscle_groups: ["chest", "shoulders", "arms"],
  equipment: ["dumbbells", "machines", "cables"],
  blocks: [
    {
      name: "Push day",
      exercises: [
        {
          name: "Single arm lateral raise",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Pec dec",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Incline press",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Shoulder press machine",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Tricep dip machine",
          sets: 2,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Single arm cable extension",
          sets: 2,
          reps: 10,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
      ],
    },
  ],
  notes: null,
};

const SAMANTHA_PLAN: WorkoutPlan = {
  title: "Samantha glutes and abs day",
  workout_type: "strength",
  muscle_groups: ["legs"],
  equipment: ["barbell", "dumbbells", "machines"],
  blocks: [
    {
      name: "Glutes and abs",
      exercises: [
        {
          name: "Hip thrust",
          sets: 3,
          reps: 10,
          duration_sec: null,
          rest_sec: 90,
          notes: null,
        },
        {
          name: "Step ups",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 90,
          notes: null,
        },
        {
          name: "Kick backs",
          sets: 3,
          reps: 10,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Hip abductors",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Leg raises",
          sets: 3,
          reps: 10,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
      ],
    },
  ],
  notes: null,
};

type StarterTemplate = {
  title: string;
  description: string;
  plan: WorkoutPlan;
  badge_label: string;
};

/** Female gets both Samantha + Jacob demos; male includes both push + glutes; prefer_not includes both. */
function starterTemplatesForSex(sex: OnboardingSex | null): StarterTemplate[] {
  const sam: StarterTemplate = {
    title: STARTER_SAMANTHA_TITLE,
    description: "Imported from the Samantha demo reel during onboarding.",
    plan: SAMANTHA_PLAN,
    badge_label: "Demo import",
  };
  const jacob: StarterTemplate = {
    title: STARTER_JACOB_TITLE,
    description: "Imported from the push-day demo reel during onboarding.",
    plan: JACOB_PLAN,
    badge_label: "Demo import",
  };

  if (sex === "female") {
    return [sam, jacob];
  }
  if (sex === "male") {
    return [jacob];
  }
  return [sam, jacob];
}

async function seedStartersIfNeeded(
  accessToken: string,
  rows: SavedWorkoutRecord[],
  sex: OnboardingSex | null,
): Promise<boolean> {
  let added = false;
  const titles = new Set(rows.map((r) => r.title));
  const templates = starterTemplatesForSex(sex);

  for (const template of templates) {
    if (titles.has(template.title)) {
      continue;
    }
    await saveWorkoutForLater(accessToken, {
      title: template.title,
      description: template.description,
      meta_left: STARTER_META_LEFT,
      meta_right: "demo import",
      badge_label: template.badge_label,
      workout_plan: template.plan,
      source_url: null,
      thumbnail_url: null,
      workout_id: null,
      job_id: null,
    });
    titles.add(template.title);
    added = true;
  }

  return added;
}

/** Seeds starter library rows once and refreshes saved workouts. Does not show UI. */
export async function ensureStarterWorkoutsSeeded(
  accessToken: string,
  reloadSaved: () => Promise<void>,
  sex: OnboardingSex | null,
): Promise<void> {
  const rows = await listSavedWorkouts(accessToken);
  await seedStartersIfNeeded(accessToken, rows, sex);
  await reloadSaved();
}
