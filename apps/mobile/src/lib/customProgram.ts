import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_SCHEDULE_TIME_MINUTES } from "./scheduleTime";
import type {
  ExperienceLevel,
  MuscleGroup,
  OnboardingGoal,
  ScheduledWorkoutCreateRequest,
  WorkoutExercise,
  WorkoutPlan,
} from "../types";

export type CustomProgramFrequency = 3 | 4 | 5 | 6 | 7;
export type CustomProgramSupportedGoal = "build_muscle" | "lose_fat";
export type CustomProgramWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type CustomProgramScheduleMode = "fixed" | "flexible";
export type CustomProgramGenerationMode = "restart" | "update";

export interface CustomProgramConfig {
  frequency: CustomProgramFrequency;
  goals: CustomProgramSupportedGoal[];
  experienceLevel: ExperienceLevel;
  scheduleMode: CustomProgramScheduleMode;
  weekdays: CustomProgramWeekday[];
}

export interface CustomProgramBuildResult {
  config: CustomProgramConfig;
  endDateIso: string;
  generationMode: CustomProgramGenerationMode;
  scheduledCount: number;
  startWeek: number;
  startDateIso: string;
}

export interface CustomProgramFeedback {
  rating: number | null;
  wentWell: string;
  changeNext: string;
  submittedAt: string;
}

export interface StoredCustomProgramRecord extends CustomProgramBuildResult {
  builtAt: string;
  feedback?: CustomProgramFeedback | null;
}

interface ProgramExerciseSpec {
  name: string;
  notes?: string;
  restKind?: "compound" | "isolation";
}

interface WorkoutTemplate {
  label: string;
  muscleGroups: MuscleGroup[];
  exercises: ProgramExerciseSpec[];
  cardioOnly?: boolean;
}

export const CUSTOM_PROGRAM_FREQUENCIES: readonly CustomProgramFrequency[] = [
  3,
  4,
  5,
  6,
  7,
] as const;

export const CUSTOM_PROGRAM_BADGE_LABEL = "10-Week Program";
export const CUSTOM_PROGRAM_TOTAL_WEEKS = 10;

export const CUSTOM_PROGRAM_WEEKDAY_LABELS: Record<
  CustomProgramWeekday,
  { short: string; long: string }
> = {
  0: { short: "Sun", long: "Sunday" },
  1: { short: "Mon", long: "Monday" },
  2: { short: "Tue", long: "Tuesday" },
  3: { short: "Wed", long: "Wednesday" },
  4: { short: "Thu", long: "Thursday" },
  5: { short: "Fri", long: "Friday" },
  6: { short: "Sat", long: "Saturday" },
};

const MONDAY_FIRST_WEEKDAYS: readonly CustomProgramWeekday[] = [
  1,
  2,
  3,
  4,
  5,
  6,
  0,
] as const;

export const CUSTOM_PROGRAM_GOAL_OPTIONS: ReadonlyArray<{
  label: string;
  value:
    | CustomProgramSupportedGoal
    | "athletic_ability"
    | "increased_strength"
    | "longevity"
    | "mobility";
  supported: boolean;
}> = [
  { label: "Build Muscle", value: "build_muscle", supported: true },
  { label: "Lose Fat", value: "lose_fat", supported: true },
  { label: "Athletic Ability", value: "athletic_ability", supported: false },
  { label: "Increased Strength", value: "increased_strength", supported: false },
  { label: "Longevity", value: "longevity", supported: false },
  { label: "Mobility", value: "mobility", supported: false },
];

const CUSTOM_PROGRAM_STORAGE_PREFIX = "@fitfo:custom-program:v1:";

const UNIVERSAL_PLAN_NOTES = [
  "Include 1-2 warm-up sets at the start of each exercise.",
  "Start your session with the muscle group that needs the most work or feels weakest. You can drag exercises to reorder them.",
  "Need alternatives, form cues, or equipment substitutions? Ask the AI Coach during the workout.",
].join("\n");

const LOWER_1: WorkoutTemplate = {
  label: "Lower 1",
  muscleGroups: ["legs"],
  exercises: [
    { name: "Standing Calf Raises" },
    { name: "Leg Extensions" },
    { name: "Hack Squat", restKind: "compound" },
    { name: "Adductor Machine" },
    { name: "Seated Hamstring Curls" },
  ],
};

const LEGS: WorkoutTemplate = {
  label: "Legs",
  muscleGroups: ["legs"],
  exercises: [
    { name: "Standing Calf Raises" },
    { name: "Leg Extensions" },
    { name: "Hack Squat", restKind: "compound" },
    { name: "Adductor Machine" },
    { name: "Seated Hamstring Curls" },
  ],
};

const PUSH: WorkoutTemplate = {
  label: "Push",
  muscleGroups: ["chest", "shoulders", "arms"],
  exercises: [
    { name: "Flat Press", restKind: "compound" },
    { name: "Incline Press", restKind: "compound" },
    { name: "Single-Arm Tricep Extension" },
    { name: "JM Press", restKind: "compound" },
    { name: "Shoulder Press", restKind: "compound" },
    { name: "Lateral Raises" },
  ],
};

const PULL: WorkoutTemplate = {
  label: "Pull",
  muscleGroups: ["back", "arms"],
  exercises: [
    { name: "Lat Pulldown", restKind: "compound" },
    { name: "Lat Pullover" },
    { name: "T-Bar Row", restKind: "compound" },
    { name: "Preacher Curl" },
    { name: "Hammer Curl" },
  ],
};

const PROGRAM_TEMPLATES: Record<CustomProgramFrequency, WorkoutTemplate[]> = {
  3: [
    {
      label: "Full Body",
      muscleGroups: ["chest", "back", "shoulders", "arms", "legs"],
      exercises: [
        { name: "Machine Shoulder Press", restKind: "compound" },
        { name: "Leg Extensions" },
        {
          name: "Cable Tricep Extension",
          notes:
            "Use a variation that hits all three heads, such as an overhead rope extension.",
        },
        { name: "SLDL", restKind: "compound" },
        { name: "Lat Pulldown", restKind: "compound" },
        { name: "Pec Deck" },
        { name: "Reverse Pec Deck" },
        { name: "Hammer Curl" },
      ],
    },
    {
      label: "Upper",
      muscleGroups: ["chest", "back", "shoulders", "arms"],
      exercises: [
        { name: "Cable Lateral Raises" },
        { name: "Incline Machine Chest Press", restKind: "compound" },
        { name: "Lat Pulldown", restKind: "compound" },
        { name: "T-Bar Row", restKind: "compound" },
        { name: "Unilateral Cable Extensions" },
        { name: "Preacher Curl" },
      ],
    },
    {
      label: "Lower",
      muscleGroups: ["legs"],
      exercises: [
        { name: "Standing Calf Raises" },
        { name: "Leg Extensions" },
        { name: "Hack Squat", restKind: "compound" },
        { name: "Adductor Machine" },
        { name: "Seated Hamstring Curls" },
      ],
    },
  ],
  4: [
    {
      label: "Upper 1",
      muscleGroups: ["chest", "back", "shoulders", "arms"],
      exercises: [
        { name: "Cable Lateral Raises" },
        { name: "Pec Deck" },
        { name: "Wide-Grip Lat Pulldown", restKind: "compound" },
        { name: "T-Bar Row", restKind: "compound" },
        { name: "Cable Extensions" },
        { name: "Preacher Curl" },
        { name: "Hammer Curl" },
      ],
    },
    LOWER_1,
    {
      label: "Upper 2",
      muscleGroups: ["chest", "back", "shoulders", "arms"],
      exercises: [
        {
          name: "Machine Shoulder Press",
          notes: "Use a full range with a front and side delt focus.",
          restKind: "compound",
        },
        { name: "Pec Deck" },
        { name: "Reverse Pec Deck" },
        { name: "JM Press", restKind: "compound" },
        { name: "Wide-Grip Lat Pulldown", restKind: "compound" },
        { name: "Cable Extensions" },
        { name: "Preacher Curl" },
      ],
    },
    { ...LOWER_1, label: "Lower 2" },
  ],
  5: [
    PUSH,
    PULL,
    LEGS,
    {
      label: "Upper",
      muscleGroups: ["chest", "back", "shoulders", "arms"],
      exercises: [
        { name: "Cable Lateral Raises" },
        { name: "Pec Deck" },
        { name: "Wide-Grip Lat Pulldown", restKind: "compound" },
        { name: "T-Bar Row", restKind: "compound" },
        { name: "Cable Extensions" },
        { name: "Preacher Curl" },
        { name: "Hammer Curl" },
      ],
    },
    { ...LEGS, label: "Lower" },
  ],
  6: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
  7: [
    PUSH,
    PULL,
    LEGS,
    PUSH,
    PULL,
    LEGS,
    {
      label: "Cardio",
      muscleGroups: [],
      cardioOnly: true,
      exercises: [
        {
          name: "Steady-State Cardio",
          notes:
            "Use Stairmaster, incline treadmill, or stationary bike. Stay at 130-140 bpm; extend from 30 to 45 minutes if desired.",
          restKind: "isolation",
        },
      ],
    },
  ],
};

export function getDefaultProgramWeekdays(
  frequency: CustomProgramFrequency,
): CustomProgramWeekday[] {
  switch (frequency) {
    case 3:
      return [1, 4, 6];
    case 4:
      return [1, 2, 4, 6];
    case 5:
      return [1, 2, 3, 5, 6];
    case 6:
      return [1, 2, 3, 5, 6, 0];
    case 7:
      return [1, 2, 3, 4, 5, 6, 0];
    default:
      return [1, 2, 4, 6];
  }
}

export function sortProgramWeekdays(
  weekdays: readonly CustomProgramWeekday[],
): CustomProgramWeekday[] {
  const unique = Array.from(new Set(weekdays));
  return MONDAY_FIRST_WEEKDAYS.filter((day) => unique.includes(day));
}

export function formatProgramWeekdayList(
  weekdays: readonly CustomProgramWeekday[],
): string {
  return sortProgramWeekdays(weekdays)
    .map((day) => CUSTOM_PROGRAM_WEEKDAY_LABELS[day].short)
    .join(" / ");
}

export function getProgramSplitLabel(frequency: CustomProgramFrequency): string {
  switch (frequency) {
    case 3:
      return "Full Body / Upper / Lower";
    case 4:
      return "Upper / Lower / Upper / Lower";
    case 5:
      return "Push / Pull / Legs / Upper / Lower";
    case 6:
      return "Push / Pull / Legs x 2";
    case 7:
      return "Push / Pull / Legs x 2 / Cardio";
    default:
      return "Custom Program";
  }
}

export function isCustomProgramSupportedGoal(
  value: string,
): value is CustomProgramSupportedGoal {
  return value === "build_muscle" || value === "lose_fat";
}

export function getSupportedProgramGoalsFromOnboarding(
  goals: readonly OnboardingGoal[] | null | undefined,
): CustomProgramSupportedGoal[] {
  const next: CustomProgramSupportedGoal[] = [];
  if (goals?.includes("build_muscle")) {
    next.push("build_muscle");
  }
  if (goals?.includes("lose_fat")) {
    next.push("lose_fat");
  }
  return next;
}

export function validateCustomProgramConfig(
  config: CustomProgramConfig,
): string | null {
  if (!CUSTOM_PROGRAM_FREQUENCIES.includes(config.frequency)) {
    return "Choose a weekly frequency from 3 to 7 days.";
  }
  if (!config.goals.includes("build_muscle")) {
    return "Muscle Building is required for this program. Add it to continue, or check back soon for fat-loss-only programming.";
  }
  if (config.weekdays.length !== config.frequency) {
    return `Pick exactly ${config.frequency} training days.`;
  }
  return null;
}

function getCustomProgramStorageKey(userId: string) {
  return `${CUSTOM_PROGRAM_STORAGE_PREFIX}${userId}`;
}

export async function readStoredCustomProgramRecord(
  userId: string,
): Promise<StoredCustomProgramRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(getCustomProgramStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredCustomProgramRecord;
    if (!parsed?.config || !parsed.startDateIso || !parsed.endDateIso) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function storeCustomProgramRecord(
  userId: string,
  record: StoredCustomProgramRecord,
): Promise<void> {
  await AsyncStorage.setItem(
    getCustomProgramStorageKey(userId),
    JSON.stringify(record),
  );
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextProgramDates(
  weekdays: readonly CustomProgramWeekday[],
  count: number,
  startDate: Date,
): string[] {
  const orderedWeekdays = sortProgramWeekdays(weekdays);
  const dates: string[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (dates.length < count) {
    const weekday = cursor.getDay() as CustomProgramWeekday;
    if (orderedWeekdays.includes(weekday)) {
      dates.push(toIsoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function restSecondsForExercise(spec: ProgramExerciseSpec): number {
  if (spec.restKind === "compound") {
    return 150;
  }
  return 75;
}

function strengthExercise(spec: ProgramExerciseSpec): WorkoutExercise {
  const notes = [
    "Target 6-8 reps for each working set.",
    spec.notes,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    name: spec.name,
    sets: 2,
    reps: 8,
    duration_sec: null,
    rest_sec: restSecondsForExercise(spec),
    notes,
  };
}

function fatLossCardioExercise(): WorkoutExercise {
  return {
    name: "Stairmaster",
    sets: null,
    reps: null,
    duration_sec: 20 * 60,
    rest_sec: null,
    notes:
      "Keep heart rate at 130-140 bpm. Alternatives: stationary cycling or a 12% incline treadmill walk for the same 20 minutes and heart-rate target.",
  };
}

function dedicatedCardioExercise(spec: ProgramExerciseSpec): WorkoutExercise {
  return {
    name: spec.name,
    sets: null,
    reps: null,
    duration_sec: 30 * 60,
    rest_sec: null,
    notes:
      spec.notes ||
      "Keep heart rate at 130-140 bpm. Stairmaster, incline treadmill, or stationary bike all work.",
  };
}

function equipmentForTemplate(
  template: WorkoutTemplate,
  includesFatLossCardio: boolean,
): string[] {
  const equipment = new Set<string>();
  if (!template.cardioOnly) {
    equipment.add("machines");
    equipment.add("cables");
    equipment.add("free weights");
  }
  if (template.cardioOnly || includesFatLossCardio) {
    equipment.add("cardio equipment");
  }
  return Array.from(equipment);
}

function buildWorkoutPlan(
  template: WorkoutTemplate,
  config: CustomProgramConfig,
): WorkoutPlan {
  const includesFatLossCardio =
    config.goals.includes("lose_fat") && !template.cardioOnly;
  const exercises = template.cardioOnly
    ? template.exercises.map(dedicatedCardioExercise)
    : template.exercises.map(strengthExercise);
  const blocks = [
    {
      name: template.cardioOnly ? "Cardio" : template.label,
      exercises,
    },
  ];

  if (includesFatLossCardio) {
    blocks.push({
      name: "Fat Loss Cardio",
      exercises: [fatLossCardioExercise()],
    });
  }

  const goalLabel = config.goals.includes("lose_fat")
    ? "Muscle Building + Fat Loss"
    : "Muscle Building";

  return {
    title: `Fitfo ${template.label}`,
    workout_type: template.cardioOnly ? "cardio" : "hypertrophy",
    muscle_groups: template.muscleGroups,
    equipment: equipmentForTemplate(template, includesFatLossCardio),
    blocks,
    notes: `${UNIVERSAL_PLAN_NOTES}\nProgram goal: ${goalLabel}.`,
  };
}

function describeWorkout(template: WorkoutTemplate, config: CustomProgramConfig) {
  if (template.cardioOnly) {
    return "Dedicated steady-state cardio day for your 10-week custom program.";
  }
  if (config.goals.includes("lose_fat")) {
    return "Hypertrophy session with a 20-minute fat-loss cardio finisher.";
  }
  return "Hypertrophy session from your 10-week custom program.";
}

export function getProgramCurrentWeek(
  record: Pick<StoredCustomProgramRecord, "startDateIso"> | null | undefined,
  now: Date = new Date(),
): number {
  if (!record?.startDateIso) {
    return 1;
  }
  const startMs = Date.parse(`${record.startDateIso}T00:00:00`);
  if (!Number.isFinite(startMs)) {
    return 1;
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const elapsedDays = Math.max(
    0,
    Math.floor((today.getTime() - startMs) / (1000 * 60 * 60 * 24)),
  );
  return Math.max(
    1,
    Math.min(CUSTOM_PROGRAM_TOTAL_WEEKS, Math.floor(elapsedDays / 7) + 1),
  );
}

export function buildCustomProgramScheduledWorkouts(
  config: CustomProgramConfig,
  options?: {
    existingProgram?: StoredCustomProgramRecord | null;
    generationMode?: CustomProgramGenerationMode;
    startDate?: Date;
  },
): ScheduledWorkoutCreateRequest[] {
  const validation = validateCustomProgramConfig(config);
  if (validation) {
    throw new Error(validation);
  }

  const templates = PROGRAM_TEMPLATES[config.frequency];
  const generationMode = options?.generationMode ?? "restart";
  const startWeek =
    generationMode === "update"
      ? getProgramCurrentWeek(options?.existingProgram, options?.startDate)
      : 1;
  const weeksToSchedule = CUSTOM_PROGRAM_TOTAL_WEEKS - startWeek + 1;
  const count = config.frequency * weeksToSchedule;
  const startDate = options?.startDate ?? new Date();
  const dates = getNextProgramDates(config.weekdays, count, startDate);

  return dates.map((scheduledFor, index) => {
    const template = templates[index % templates.length];
    const plan = buildWorkoutPlan(template, config);
    const exerciseCount = plan.blocks.reduce(
      (total, block) => total + block.exercises.length,
      0,
    );
    const week = Math.floor(index / config.frequency) + startWeek;

    return {
      scheduled_for: scheduledFor,
      scheduled_time_minutes: DEFAULT_SCHEDULE_TIME_MINUTES,
      title: `Fitfo ${template.label}`,
      description: describeWorkout(template, config),
      meta_left:
        exerciseCount === 1 ? "1 exercise" : `${exerciseCount} exercises`,
      meta_right: `Week ${week} of ${CUSTOM_PROGRAM_TOTAL_WEEKS}`,
      badge_label: CUSTOM_PROGRAM_BADGE_LABEL,
      workout_plan: plan,
    };
  });
}

export function createCustomProgramBuildResult(
  config: CustomProgramConfig,
  requests: readonly ScheduledWorkoutCreateRequest[],
  options?: {
    existingProgram?: StoredCustomProgramRecord | null;
    generationMode?: CustomProgramGenerationMode;
    startDate?: Date;
  },
): CustomProgramBuildResult {
  const generationMode = options?.generationMode ?? "restart";
  const startDateIso =
    generationMode === "update" && options?.existingProgram?.startDateIso
      ? options.existingProgram.startDateIso
      : requests[0]?.scheduled_for ?? toIsoDate(new Date());
  const endDateIso =
    requests[requests.length - 1]?.scheduled_for ?? startDateIso;
  const startWeek =
    generationMode === "update"
      ? getProgramCurrentWeek(options?.existingProgram, options?.startDate)
      : 1;
  return {
    config,
    endDateIso,
    generationMode,
    scheduledCount: requests.length,
    startWeek,
    startDateIso,
  };
}

export function isStoredProgramFeedbackDue(
  record: StoredCustomProgramRecord | null,
  now: Date = new Date(),
): boolean {
  if (!record || record.feedback?.submittedAt) {
    return false;
  }
  const endMs = Date.parse(`${record.endDateIso}T23:59:59`);
  return Number.isFinite(endMs) && now.getTime() > endMs;
}
