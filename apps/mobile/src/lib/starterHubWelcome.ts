import AsyncStorage from "@react-native-async-storage/async-storage";

import { listSavedWorkouts, saveWorkoutForLater } from "./api";
import type { OnboardingSex, SavedWorkoutRecord, WorkoutPlan } from "../types";

/** Ordered steps for the post-onboarding hub tour (demo workout → session → finish). */
export type HubTourStep =
  | "saved_card"
  | "library_demo"
  | "start_session"
  | "active_scroll"
  | "finish_workout";

/** Saved-row titles double as de-dupe keys for demo imports. */
export const STARTER_NUNO_TITLE = "Nuno push workout";
export const STARTER_NICOLETTE_TITLE = "Nicolette leg day";

const HUB_TIP_INTRO =
  "We saved the workouts from your onboarding demos into your Fitfo library from the reels you walked through during setup, so you can schedule or start whenever you want.";

/** Default body when parent does not pass explicit `body` (e.g. story / tests). */
export const FIRST_HUB_TIP_MODAL_BODY = `${HUB_TIP_INTRO}\n\nTap Saved Workouts to find your demo import.`;

/** Shown once in-app after onboarding; copy used by `FirstHubTipModal`. */
export const FIRST_HUB_TIP_MODAL_TITLE = "Demo workouts loaded";

export function getFirstHubTipModalTitle(_sex: OnboardingSex | null): string {
  return FIRST_HUB_TIP_MODAL_TITLE;
}

export function getFirstHubTipModalBody(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return `${HUB_TIP_INTRO}\n\nTap the Saved Workouts card to see Nicolette's leg day.`;
  }
  if (sex === "male") {
    return `${HUB_TIP_INTRO}\n\nTap the Saved Workouts card to see Nuno's push workout.`;
  }
  return `${HUB_TIP_INTRO}\n\nTap the Saved Workouts card to see your demo import.`;
}

export function getSavedWorkoutsCoachmarkTitle(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return "Tap Saved Workouts";
  }
  if (sex === "male") {
    return "Tap Saved Workouts";
  }
  return "Tap Saved Workouts";
}

export function getSavedWorkoutsCoachmarkBody(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return "Your Nicolette leg day is already saved—tap here to open it.";
  }
  if (sex === "male") {
    return "Your Nuno push workout is already saved—tap here to open it.";
  }
  return "Your demo workout is already saved—tap here to open it.";
}

export function getFirstHubTipStorageKey(profileId: string): string {
  return `@fitfo:first-hub-tip:${profileId}`;
}

export function getHubTourDoneStorageKey(profileId: string): string {
  return `@fitfo:starter-hub-tour-done:v2:${profileId}`;
}

export function getHubTourStepStorageKey(profileId: string): string {
  return `@fitfo:starter-hub-tour-step:v2:${profileId}`;
}

/**
 * Records that we've already attempted to seed the starter demo workouts
 * for this profile. Once set, `ensureStarterWorkoutsSeeded` becomes a no-op
 * — even if the user has since deleted those demos. Without this, the
 * seeder would re-create the demos on every cold start because it
 * de-dupes purely on the saved-workout titles being present.
 */
export function getStartersSeededStorageKey(profileId: string): string {
  return `@fitfo:starters-seeded:v1:${profileId}`;
}

/** Title of the single seeded demo row for this user (matches saved workout title). */
export function getStarterDemoTitleForSex(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return STARTER_NICOLETTE_TITLE;
  }
  return STARTER_NUNO_TITLE;
}

export function isStarterDemoWorkoutTitle(
  title: string,
  sex: OnboardingSex | null,
): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === getStarterDemoTitleForSex(sex).trim().toLowerCase();
}

export function getHubTourLibraryCoachmarkTitle(_sex: OnboardingSex | null): string {
  return "Start your workout";
}

export function getHubTourLibraryCoachmarkBody(sex: OnboardingSex | null): string {
  if (sex === "female") {
    return "Tap Start Session to begin Nicolette leg day.";
  }
  if (sex === "male") {
    return "Tap Start Session to begin Nuno push workout.";
  }
  return "Tap Start Session to begin your demo workout.";
}

export function getHubTourStartSessionCoachmarkTitle(_sex: OnboardingSex | null): string {
  return "Start your workout";
}

export function getHubTourStartSessionCoachmarkBody(_sex: OnboardingSex | null): string {
  return "Tap Start Session to begin.";
}

export function getHubTourScrollCoachmarkTitle(_sex: OnboardingSex | null): string {
  return "Scroll down";
}

export function getHubTourScrollCoachmarkBody(_sex: OnboardingSex | null): string {
  return "Scroll through your exercises until you see Finish Workout at the bottom.";
}

export function getHubTourFinishCoachmarkTitle(_sex: OnboardingSex | null): string {
  return "Finish Workout";
}

export function getHubTourFinishCoachmarkBody(_sex: OnboardingSex | null): string {
  return "Tap Finish Workout when you’re done to save this session to your log.";
}

const STARTER_META_LEFT = "Demo import";

const NUNO_PLAN: WorkoutPlan = {
  title: "Nuno push workout",
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
          rest_sec: null,
          notes: null,
        },
        {
          name: "Pec dec",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: null,
          notes: null,
        },
        {
          name: "Incline press",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: null,
          notes: null,
        },
        {
          name: "Shoulder press machine",
          sets: 3,
          reps: 8,
          duration_sec: null,
          rest_sec: null,
          notes: null,
        },
        {
          name: "Tricep dip machine",
          sets: 2,
          reps: 8,
          duration_sec: null,
          rest_sec: null,
          notes: null,
        },
        {
          name: "Single arm cable extension",
          sets: 2,
          reps: 10,
          duration_sec: null,
          rest_sec: null,
          notes: null,
        },
      ],
    },
  ],
  notes: null,
};

const NICOLETTE_PLAN: WorkoutPlan = {
  title: "Nicolette leg day",
  workout_type: "strength",
  muscle_groups: ["legs"],
  equipment: ["barbell", "dumbbells", "machines"],
  blocks: [
    {
      name: "Leg day",
      exercises: [
        {
          name: "Hip thrust",
          sets: 4,
          reps: 8,
          duration_sec: null,
          rest_sec: 90,
          notes: null,
        },
        {
          name: "Plate-loaded RDLs",
          sets: 4,
          reps: 8,
          duration_sec: null,
          rest_sec: 90,
          notes: null,
        },
        {
          name: "DB sumo squats",
          sets: 3,
          reps: 10,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Hamstring curls",
          sets: 3,
          reps: 12,
          duration_sec: null,
          rest_sec: 60,
          notes: null,
        },
        {
          name: "Hip abductors",
          sets: 3,
          reps: 12,
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

/** Seed exactly one starter demo workout based on onboarding sex. */
function starterTemplatesForSex(sex: OnboardingSex | null): StarterTemplate[] {
  const nicolette: StarterTemplate = {
    title: STARTER_NICOLETTE_TITLE,
    description: "Imported from the Nicolette demo reel during onboarding.",
    plan: NICOLETTE_PLAN,
    badge_label: "Demo import",
  };
  const nuno: StarterTemplate = {
    title: STARTER_NUNO_TITLE,
    description: "Imported from the Nuno demo reel during onboarding.",
    plan: NUNO_PLAN,
    badge_label: "Demo import",
  };

  if (sex === "female") {
    return [nicolette];
  }
  if (sex === "male") {
    return [nuno];
  }
  return [nuno];
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

/**
 * Seeds starter library rows exactly once per profile and refreshes saved
 * workouts. Does not show UI.
 *
 * The per-profile `getStartersSeededStorageKey` flag in AsyncStorage acts as
 * the durable "we've already done this" marker. After the first successful
 * pass we set the flag and short-circuit on every future call, even if the
 * user has since deleted the demos — otherwise leaving and reopening the
 * app re-creates the demos from scratch.
 */
export async function ensureStarterWorkoutsSeeded(
  accessToken: string,
  reloadSaved: () => Promise<void>,
  sex: OnboardingSex | null,
  profileId: string | null,
): Promise<void> {
  // Profile id is required to scope the "already seeded" flag. Without it
  // we'd risk seeding the wrong account on shared devices, so bail rather
  // than guess.
  if (!profileId) {
    return;
  }

  const seededKey = getStartersSeededStorageKey(profileId);
  const alreadySeeded = await AsyncStorage.getItem(seededKey);
  if (alreadySeeded === "1") {
    return;
  }

  const rows = await listSavedWorkouts(accessToken);
  await seedStartersIfNeeded(accessToken, rows, sex);
  // Persist the flag *after* a successful seed pass. If the seed throws,
  // we leave the flag unset so the next launch retries — which preserves
  // the original "best effort" semantics for transient failures.
  await AsyncStorage.setItem(seededKey, "1");
  await reloadSaved();
}
