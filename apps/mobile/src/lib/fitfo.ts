import type {
  ActiveExercisePreview,
  ActiveSessionPreview,
  CompletedWorkoutCreateRequest,
  CompletedWorkoutRecord,
  JobResponse,
  LiftLatestSetSnapshot,
  SavedWorkoutRecord,
  SavedRoutinePreview,
  ScheduledWorkoutRecord,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutRow,
} from "../types";

const LEGACY_IMPORT_DESCRIPTORS = [
  "Killer",
  "Savage",
  "Explosive",
  "Dialed",
  "Brutal",
  "Focused",
  "Elite",
  "Relentless",
  "Powerhouse",
  "Sharp",
  "Loaded",
  "Prime",
  "Dynamic",
  "Ferocious",
  "Electric",
  "Tough",
  "Locked-In",
  "Targeted",
  "Heavy",
  "Rapid",
  "Strong",
  "Peak",
  "Athletic",
  "Crushing",
];

const LEGACY_IMPORT_DESCRIPTOR_SET = new Set(
  LEGACY_IMPORT_DESCRIPTORS.map((descriptor) => descriptor.toLowerCase()),
);

const GENERIC_ROUTINE_TITLES = new Set([
  "workout",
  "routine",
  "session",
  "training",
  "training session",
  "imported workout",
  "imported tiktok workout",
  "tiktok workout",
  "new tiktok routine",
]);

/** When parsing omits per-exercise `rest_sec`, rest UI and timers use this fallback. */
export const DEFAULT_REST_BETWEEN_SETS_SEC = 90;

/** Prefer plan/log average rest between sets when present; fallback so countdowns aren't blank. */
export function resolveExerciseRestBaseline(
  averageRestSeconds: number | null | undefined,
): number {
  if (
    averageRestSeconds != null &&
    averageRestSeconds > 0 &&
    Number.isFinite(averageRestSeconds)
  ) {
    return Math.round(averageRestSeconds);
  }
  return DEFAULT_REST_BETWEEN_SETS_SEC;
}

function coerceParsedRestSec(
  value: number | null | undefined,
  baselineSeconds: number,
): number {
  if (value != null && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return baselineSeconds;
}

function fillMissingExerciseRest(
  exercises: ActiveExercisePreview[],
  baselineSeconds: number,
): ActiveExercisePreview[] {
  return exercises.map((exercise) =>
    exercise.restSeconds == null ? { ...exercise, restSeconds: baselineSeconds } : exercise,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanizeWords(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Short acronyms we leave uppercase during title-casing (e.g. HIIT, EMOM, AMRAP).
const PRESERVE_UPPERCASE_TOKENS = new Set([
  "HIIT",
  "EMOM",
  "AMRAP",
  "RPE",
  "PR",
  "DB",
  "BB",
  "KB",
  "RDL",
]);

function titleCaseWord(word: string): string {
  if (word.length === 0) {
    return word;
  }
  const upper = word.toUpperCase();
  if (PRESERVE_UPPERCASE_TOKENS.has(upper)) {
    return upper;
  }
  // Respect tokens that are obviously not words (numbers, reps like "5x5").
  if (/^[\d]/.test(word)) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function titleCase(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

export function sentenceCase(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function toPossessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function parseCreatorFromSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    const match = url.pathname.match(/@([^/]+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

/** Creator chip / reminders: @handle from TikTok-style URLs, else possessive prefix in title (e.g. "Sam's Leg Day"). */
export function getCreatorDisplayLabel(
  sourceUrl: string | null | undefined,
  title?: string | null,
): string | null {
  const fromUrl = getCreatorHandle(sourceUrl);
  if (fromUrl) {
    return fromUrl;
  }
  if (title) {
    const fromTitle = parsePossessiveCreatorFromTitle(title);
    if (fromTitle) {
      return fromTitle;
    }
  }
  return null;
}

function parsePossessiveCreatorFromTitle(title: string): string | null {
  const t = title.trim();
  const m = /^(.+?)(?:'|\u2019)s\s+\S/.exec(t);
  if (!m?.[1]) {
    return null;
  }
  const name = m[1].trim();
  if (name.length < 2 || name.length > 48) {
    return null;
  }
  if (/^\d+$/.test(name)) {
    return null;
  }
  return name.includes(" ") ? name : `@${name}`;
}

export function getCreatorHandle(sourceUrl: string | null | undefined): string | null {
  const slug = parseCreatorFromSourceUrl(sourceUrl);
  return slug ? `@${slug}` : null;
}

function normalizeTitleToken(value: string): string {
  return value.replace(/^[^a-zA-Z]+|[^a-zA-Z-]+$/g, "").toLowerCase();
}

function stripLegacyImportDescriptor(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return title;
  }

  const leadingDescriptor = normalizeTitleToken(words[0]);
  if (LEGACY_IMPORT_DESCRIPTOR_SET.has(leadingDescriptor)) {
    return words.slice(1).join(" ").trim();
  }

  for (let index = 0; index < words.length - 1; index += 1) {
    const currentWord = words[index];
    const nextWord = words[index + 1];
    const hasPossessiveEnding = /('s|')$/i.test(currentWord);
    const nextDescriptor = normalizeTitleToken(nextWord);

    if (hasPossessiveEnding && LEGACY_IMPORT_DESCRIPTOR_SET.has(nextDescriptor)) {
      return [...words.slice(0, index + 1), ...words.slice(index + 2)].join(" ").trim();
    }
  }

  return title.trim();
}

/** Long captions / hashtag dumps from TikTok & Reels — poor one-line UI titles. */
function looksLikeSocialCaption(title: string): boolean {
  const t = title.trim();
  if (!t) {
    return false;
  }
  if (/#/.test(t)) {
    return true;
  }
  if (t.length > 64) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 12;
}

function stripHashtagsForDisplay(value: string): string {
  return value
    .replace(/#[^\s#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactReadableCaption(cleanedTitle: string, maxWords: number): string {
  const trimmed = stripHashtagsForDisplay(cleanedTitle);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return cleanedTitle.trim();
  }
  return words.slice(0, maxWords).join(" ");
}

/** Drop noisy social captions when choosing a structured label from ``WorkoutPlan``. */
function normalizeTitleCandidateForPlan(raw: string | null | undefined): string | null {
  const t = asString(raw);
  if (!t) {
    return null;
  }
  return looksLikeSocialCaption(t) ? null : t;
}

function extractCreatorName(job?: JobResponse | null): string | null {
  const providerMeta = asRecord(job?.provider_meta);

  const ownerFull = asString(providerMeta?.owner_full_name);
  const ownerUser = asString(providerMeta?.owner_username);

  const apify = asRecord(providerMeta?.apify);
  const fromApifyFull =
    asString(apify?.ownerFullName) ||
    asString(apify?.fullName) ||
    asString(apify?.owner_full_name);
  const fromApifyUser =
    asString(apify?.ownerUsername) ||
    asString(apify?.username) ||
    asString(apify?.owner_username);

  const instagramCreator =
    ownerFull || fromApifyFull || ownerUser || fromApifyUser || null;

  const tikwm = asRecord(providerMeta?.tikwm);
  const data = asRecord(tikwm?.data);
  const author = asRecord(data?.author);

  const rawCreator =
    asString(author?.nickname) ||
    asString(author?.unique_id) ||
    asString(author?.uniqueId) ||
    asString(data?.author_nickname) ||
    asString(data?.author_unique_id) ||
    asString(data?.nickname) ||
    instagramCreator ||
    parseCreatorFromSourceUrl(job?.source_url);

  return rawCreator ? humanizeWords(rawCreator) : null;
}

function extractCaption(job?: JobResponse | null): string | null {
  const providerMeta = asRecord(job?.provider_meta);

  const topCaption = asString(providerMeta?.caption);
  if (topCaption) {
    return topCaption;
  }

  const apify = asRecord(providerMeta?.apify);
  if (apify) {
    const fromApify =
      asString(apify.caption) ||
      asString(apify.text) ||
      asString(apify.description) ||
      asString(apify.accessibilityCaption);
    if (fromApify) {
      return fromApify;
    }
    const edge = asRecord(apify.edge_media_to_caption);
    const edges = edge?.edges;
    if (Array.isArray(edges) && edges.length > 0) {
      const node = asRecord(asRecord(edges[0])?.node);
      const text = asString(node?.text);
      if (text) {
        return text;
      }
    }
  }

  const tikwm = asRecord(providerMeta?.tikwm);
  const data = asRecord(tikwm?.data);

  return (
    asString(data?.title) ||
    asString(data?.desc) ||
    asString(data?.caption) ||
    asString(data?.content) ||
    null
  );
}

function isInstagramSourceUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl) {
    return false;
  }
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host.includes("instagram.com");
  } catch {
    return false;
  }
}

function isLikelyMisassignedExerciseTitle(
  title: string | null | undefined,
  plan: WorkoutPlan | null | undefined,
): boolean {
  const t = asString(title);
  if (!t || !plan?.blocks?.length) {
    return false;
  }
  let count = 0;
  let primary: string | null = null;
  for (const block of plan.blocks) {
    for (const exercise of block.exercises) {
      count += 1;
      if (!primary) {
        primary = asString(exercise.name);
      }
    }
  }
  if (count < 2 || !primary) {
    return false;
  }
  return t.toLowerCase() === primary.trim().toLowerCase();
}

function inferFocusFromText(text: string): string | null {
  const normalized = text.toLowerCase();

  const keywordMap: Array<{ keywords: string[]; label: string }> = [
    { keywords: ["deadlift", "rdl", "romanian deadlift"], label: "Deadlift Day" },
    { keywords: ["push day", "push workout"], label: "Push Day" },
    { keywords: ["pull day", "pull workout"], label: "Pull Day" },
    { keywords: ["squat", "hack squat", "leg press"], label: "Squat Day" },
    { keywords: ["bench", "bench press"], label: "Bench Day" },
    { keywords: ["pull up", "pull-up", "chin up", "chin-up"], label: "Pull-Up Session" },
    { keywords: ["row", "lat pulldown", "back day"], label: "Back Builder" },
    { keywords: ["shoulder", "overhead press", "lateral raise"], label: "Shoulder Day" },
    { keywords: ["bicep", "tricep", "arm day", "arms"], label: "Arm Day" },
    { keywords: ["glute", "glutes", "hip thrust", "hip thrusts"], label: "Glute Day" },
    { keywords: ["leg day", "legs", "quad", "quads", "hamstring", "hamstrings"], label: "Leg Day" },
    { keywords: ["chest"], label: "Chest Day" },
    { keywords: ["upper body"], label: "Upper Body Session" },
    { keywords: ["lower body"], label: "Lower Body Session" },
    { keywords: ["full body"], label: "Full Body Session" },
    { keywords: ["core", "ab", "abs"], label: "Core Session" },
    { keywords: ["hiit", "conditioning"], label: "Conditioning Blast" },
    { keywords: ["cardio", "run", "treadmill"], label: "Cardio Session" },
    { keywords: ["mobility", "stretch", "warm up", "warmup"], label: "Mobility Flow" },
  ];

  for (const entry of keywordMap) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.label;
    }
  }

  return null;
}

function getPrimaryExerciseName(plan: WorkoutPlan): string | null {
  for (const block of plan.blocks) {
    for (const exercise of block.exercises) {
      const name = asString(exercise.name);
      if (name) {
        return name;
      }
    }
  }

  return null;
}

function getWorkoutFocus(workout: WorkoutRow, job?: JobResponse | null): string {
  const explicitRaw = asString(workout.title) || asString(workout.plan.title);
  const suspectExerciseTitle = isLikelyMisassignedExerciseTitle(explicitRaw, workout.plan);
  const explicitTitle = normalizeTitleCandidateForPlan(explicitRaw);
  if (
    explicitTitle &&
    !GENERIC_ROUTINE_TITLES.has(explicitTitle.toLowerCase()) &&
    !suspectExerciseTitle
  ) {
    return humanizeWords(explicitTitle);
  }

  const captionMatch = extractCaption(job);
  if (captionMatch) {
    const inferredFromCaption = inferFocusFromText(captionMatch);
    if (inferredFromCaption) {
      return inferredFromCaption;
    }
    const trimmed = captionMatch.trim();
    if (
      trimmed.length >= 3 &&
      trimmed.length <= 80 &&
      !looksLikeSocialCaption(trimmed)
    ) {
      return humanizeWords(trimmed);
    }
  }

  const primaryExercise = getPrimaryExerciseName(workout.plan);
  if (primaryExercise) {
    const inferredFromExercise = inferFocusFromText(primaryExercise);
    if (inferredFromExercise) {
      return inferredFromExercise;
    }

    return titleCase(primaryExercise) || primaryExercise;
  }

  switch (workout.plan.workout_type) {
    case "strength":
      return "Strength Session";
    case "cardio":
      return "Cardio Session";
    case "HIIT":
      return "HIIT Blast";
    case "flexibility":
      return "Flexibility Flow";
    case "mobility":
      return "Mobility Flow";
    case "mixed":
      return "Full Body Session";
    default:
      return "Workout";
  }
}

function getWorkoutFocusFromPlan(plan: WorkoutPlan, fallbackTitle?: string | null): string | null {
  const planTitleCandidate = normalizeTitleCandidateForPlan(asString(plan.title));
  const fallbackCandidate = normalizeTitleCandidateForPlan(fallbackTitle);
  const explicitTitle = planTitleCandidate || fallbackCandidate;
  const suspectSource = asString(plan.title) || asString(fallbackTitle);
  const suspectExerciseTitle = isLikelyMisassignedExerciseTitle(suspectSource, plan);
  if (
    explicitTitle &&
    !GENERIC_ROUTINE_TITLES.has(explicitTitle.toLowerCase()) &&
    !suspectExerciseTitle
  ) {
    return stripLegacyImportDescriptor(humanizeWords(explicitTitle));
  }

  const primaryExercise = getPrimaryExerciseName(plan);
  if (primaryExercise) {
    const inferredFromExercise = inferFocusFromText(primaryExercise);
    if (inferredFromExercise) {
      return inferredFromExercise;
    }

    return titleCase(primaryExercise) || primaryExercise;
  }

  switch (plan.workout_type) {
    case "strength":
      return "Strength Session";
    case "cardio":
      return "Cardio Session";
    case "HIIT":
      return "HIIT Blast";
    case "flexibility":
      return "Flexibility Flow";
    case "mobility":
      return "Mobility Flow";
    case "mixed":
      return "Full Body Session";
    default:
      return "Workout";
  }
}

export function getRoutineDisplayTitle(input: {
  sourceUrl?: string | null;
  title: string;
  workoutPlan?: WorkoutPlan | null;
}): string {
  const cleanedTitle = stripLegacyImportDescriptor(input.title);
  const suspectExerciseTitle =
    input.workoutPlan &&
    cleanedTitle &&
    isLikelyMisassignedExerciseTitle(cleanedTitle, input.workoutPlan);

  const captionNoise = Boolean(cleanedTitle && looksLikeSocialCaption(cleanedTitle));

  if (
    cleanedTitle &&
    !GENERIC_ROUTINE_TITLES.has(cleanedTitle.toLowerCase()) &&
    !suspectExerciseTitle &&
    !captionNoise
  ) {
    return titleCase(cleanedTitle) || cleanedTitle;
  }

  const creatorLabel = getCreatorDisplayLabel(
    input.sourceUrl,
    suspectExerciseTitle ? undefined : cleanedTitle,
  );
  const creatorName = creatorLabel
    ? humanizeWords(creatorLabel.replace(/^@/, ""))
    : null;

  const planFocusRaw = input.workoutPlan
    ? getWorkoutFocusFromPlan(input.workoutPlan, cleanedTitle)
    : null;
  const planFocus =
    planFocusRaw && planFocusRaw.trim().toLowerCase() !== "workout"
      ? planFocusRaw
      : null;
  const captionFocus = cleanedTitle ? inferFocusFromText(cleanedTitle) : null;
  const focus = planFocus || captionFocus;

  if (focus) {
    return creatorName ? `${toPossessive(creatorName)} ${focus}` : focus;
  }

  if (cleanedTitle) {
    const compact = compactReadableCaption(cleanedTitle, 7);
    return titleCase(compact) || compact;
  }

  return "Workout";
}

function getImportedDescription(
  workout: WorkoutRow,
  creatorName: string | null,
  focus: string,
  sourceUrl?: string | null,
): string {
  const normalizedNotes = workout.plan.notes?.trim().toLowerCase() || "";

  if (workout.plan.notes && normalizedNotes !== "no workout content found") {
    return sentenceCase(workout.plan.notes) || workout.plan.notes;
  }

  const platform = isInstagramSourceUrl(sourceUrl) ? "Instagram" : "TikTok";
  if (creatorName) {
    return `Imported from ${toPossessive(creatorName)} ${platform} and tagged as ${focus.toLowerCase()}.`;
  }

  return `Imported from ${platform} and tagged as ${focus.toLowerCase()}.`;
}

function sanitizeRoutineDescription(description: string | null | undefined): string {
  const normalized = description?.trim() || "";
  if (!normalized) {
    return "";
  }

  const autogeneratedSummaryPattern =
    /^\d+\s+exercises?\s+across\s+\d+\s+blocks?(?:\s+using\s+\d+\s+equipment\s+tags?)?\.$/i;

  if (autogeneratedSummaryPattern.test(normalized)) {
    return "";
  }

  return normalized;
}

function sanitizeCompletedWorkoutSummary(summary: string | null | undefined): string {
  const normalized = summary?.trim() || "";
  if (!normalized) {
    return "";
  }

  const autogeneratedCompletedSummaryPattern =
    /^\d+\s+exercises?\s+completed\s+across\s+\d+\s+logged\s+sets?\.$/i;

  if (autogeneratedCompletedSummaryPattern.test(normalized)) {
    return "";
  }

  return normalized;
}

function formatExerciseSummary(exercise: WorkoutExercise): string {
  const parts: string[] = [];

  if (exercise.sets != null) {
    parts.push(`${exercise.sets} sets`);
  }

  if (exercise.reps != null) {
    parts.push(`${exercise.reps} reps`);
  }

  if (exercise.duration_sec != null) {
    parts.push(`${exercise.duration_sec}s`);
  }

  if (exercise.rest_sec != null) {
    parts.push(`${exercise.rest_sec}s rest`);
  }

  const targetLine = parts.join(" • ");
  const trimmedNotes = exercise.notes?.trim() ?? "";
  const noteLine = trimmedNotes
    ? sentenceCase(trimmedNotes) || trimmedNotes
    : "";

  if (targetLine && noteLine) {
    return `${targetLine} • ${noteLine}`;
  }
  if (targetLine) {
    return targetLine;
  }
  if (noteLine) {
    return noteLine;
  }

  return "Follow coach notes";
}

function createSessionSets(exercise: WorkoutExercise, exerciseIndex: number) {
  // When the parser didn't pick up a set count, default to 3 so users start with
  // a realistic template they can trim or extend, instead of a single set.
  const setCount = exercise.sets != null ? Math.max(1, exercise.sets) : 3;

  return Array.from({ length: setCount }, (_, setIndex) => ({
    id: `${exerciseIndex + 1}-${setIndex + 1}`,
    label: `Set ${setIndex + 1}`,
    targetReps: exercise.reps,
    targetDurationSec: exercise.duration_sec,
    loggedWeight: "",
    loggedReps: "",
    completed: false,
  }));
}

function buildSessionExercises(
  plan: WorkoutPlan,
  restBaselineSeconds: number,
): ActiveExercisePreview[] {
  return plan.blocks.flatMap((block, blockIndex) =>
    block.exercises.map((exercise, exerciseIndex) => ({
      id: `${blockIndex + 1}-${exerciseIndex + 1}-${exercise.name}`,
      name: titleCase(exercise.name) || exercise.name,
      subtitle: formatExerciseSummary(exercise),
      blockName: block.name ? titleCase(block.name) : null,
      notes: exercise.notes ? sentenceCase(exercise.notes) : null,
      restSeconds: coerceParsedRestSec(exercise.rest_sec, restBaselineSeconds),
      sets: createSessionSets(exercise, blockIndex * 100 + exerciseIndex),
    })),
  );
}

function computeAverageRestSeconds(plan: WorkoutPlan): number | null {
  let totalRest = 0;
  let totalSets = 0;

  for (const block of plan.blocks) {
    for (const exercise of block.exercises) {
      if (exercise.rest_sec == null) {
        continue;
      }

      const setCount = Math.max(1, exercise.sets ?? 1);
      totalRest += exercise.rest_sec * setCount;
      totalSets += setCount;
    }
  }

  if (totalSets === 0) {
    return null;
  }

  return Math.round(totalRest / totalSets);
}

/** Fresh session rows from last completed log targets (plan missing fallback). */
function exercisesFromCompletedLog(
  exercises: ActiveExercisePreview[],
): ActiveExercisePreview[] {
  return exercises.map((exercise, exerciseIndex) => ({
    ...exercise,
    id: `replay-${exerciseIndex + 1}-${exercise.name}-${Date.now().toString(36)}`,
    sets: exercise.sets.map((set, setIndex) => ({
      id: `replay-${exerciseIndex + 1}-${setIndex + 1}`,
      label: `Set ${setIndex + 1}`,
      targetReps: set.targetReps,
      targetDurationSec: set.targetDurationSec,
      // Preserve last session's log numbers as the default starting point for
      // "Start" / "Schedule again" flows. These are still editable and the set
      // is not auto-marked complete.
      loggedWeight: set.loggedWeight ?? "",
      loggedReps: set.loggedReps ?? "",
      // Notes survive into the replayed session so users see past coaching
      // cues / sensations while logging the next session of the same workout.
      notes: set.notes ?? null,
      // Replays inherit the unit the original set was logged in so the
      // pre-filled `loggedWeight` value stays meaningful.
      weightUnit: set.weightUnit,
      completed: false,
    })),
  }));
}

/** Start today from any completed session (recent history or summary). Uses `workout_plan` when present. */
export function createActiveSessionFromCompletedWorkout(
  record: CompletedWorkoutRecord,
): ActiveSessionPreview {
  const displayTitle = getRoutineDisplayTitle({
    sourceUrl: record.source_url,
    title: record.title,
    workoutPlan: record.workout_plan,
  });
  const rawTitle = displayTitle.trim() || record.workout_plan?.title || "Workout Session";
  const title = titleCase(rawTitle) || rawTitle;
  const summaryBit = sanitizeCompletedWorkoutSummary(record.summary)?.trim();
  const descPiece = sanitizeRoutineDescription(record.description)?.trim();
  const description =
    descPiece ||
    summaryBit ||
    record.workout_plan?.notes?.trim() ||
    "Practice session restarted from your log.";

  if (record.workout_plan && record.workout_plan.blocks.length > 0) {
    return createActiveSessionFromPlan(record.workout_plan, {
      description: sentenceCase(description) || description,
      sourceJobId: record.job_id,
      sourceUrl: record.source_url,
      sourceWorkoutId: record.workout_id,
      title,
    });
  }

  if (record.exercises.length > 0) {
    const descFinal = sentenceCase(description) || description;
    const replayBaseline = resolveExerciseRestBaseline(record.average_rest_seconds);
    return {
      title,
      description: descFinal,
      startedAt: Date.now(),
      averageRestSeconds: replayBaseline,
      exercises: fillMissingExerciseRest(
        exercisesFromCompletedLog(record.exercises),
        replayBaseline,
      ),
      sourceWorkoutId: record.workout_id ?? null,
      sourceJobId: record.job_id ?? null,
      sourceUrl: record.source_url ?? null,
      workoutPlan: record.workout_plan ?? undefined,
    };
  }

  return createDefaultActiveSession({
    title,
    description: sentenceCase(description) || description,
    sourceJobId: record.job_id,
    sourceUrl: record.source_url,
    sourceWorkoutId: record.workout_id,
    workoutPlan: record.workout_plan ?? undefined,
  });
}

/** True when we can seed a new active session from this log (plan or exercise rows). */
export function canReplayCompletedSession(record: CompletedWorkoutRecord): boolean {
  return (
    (record.workout_plan?.blocks?.length ?? 0) > 0 ||
    record.exercises.length > 0
  );
}

export function createImportedRoutinePreview(
  workout: WorkoutRow,
  options?: {
    job?: JobResponse | null;
  },
): SavedRoutinePreview {
  const creatorName = extractCreatorName(options?.job);
  const focus = getWorkoutFocus(workout, options?.job);
  const exerciseCount = workout.plan.blocks.reduce(
    (count, block) => count + block.exercises.length,
    0,
  );

  return {
    id: workout.id,
    workoutId: workout.id,
    jobId: workout.job_id,
    sourceUrl: options?.job?.source_url ?? null,
    title: creatorName
      ? `${toPossessive(creatorName)} ${focus}`
      : focus,
    description: getImportedDescription(
      workout,
      creatorName,
      focus,
      options?.job?.source_url ?? null,
    ),
    metaLeft: exerciseCount > 0 ? `${exerciseCount} exercises` : `${workout.plan.blocks.length} blocks`,
    metaRight: workout.plan.blocks.length === 1
      ? `${workout.plan.blocks.length} block`
      : `${workout.plan.blocks.length} blocks`,
    badgeLabel: "Imported",
    workoutPlan: workout.plan,
    thumbnailUrl: options?.job?.thumbnail_url ?? null,
  };
}

export function createManualRoutinePreview(): SavedRoutinePreview {
  return {
    id: `manual-${Date.now()}`,
    title: "Custom Routine Draft",
    description: "Fresh template for a manually created workout session.",
    metaLeft: "Draft",
    metaRight: "Editable",
  };
}

export function createDefaultActiveSession(overrides?: {
  description?: string;
  scheduledWorkoutId?: string | null;
  sourceJobId?: string | null;
  sourceUrl?: string | null;
  sourceWorkoutId?: string | null;
  title?: string;
  workoutPlan?: WorkoutPlan | null;
}): ActiveSessionPreview {
  return {
    title: overrides?.title || "Workout Session",
    description:
      overrides?.description || "Add exercises to this workout to begin logging sets.",
    startedAt: Date.now(),
    averageRestSeconds: null,
    exercises: [],
    scheduledWorkoutId: overrides?.scheduledWorkoutId ?? undefined,
    sourceWorkoutId: overrides?.sourceWorkoutId ?? null,
    sourceJobId: overrides?.sourceJobId ?? null,
    sourceUrl: overrides?.sourceUrl ?? null,
    workoutPlan: overrides?.workoutPlan ?? null,
  };
}

export function createActiveSessionFromPlan(
  plan: WorkoutPlan,
  overrides?: {
    description?: string;
    scheduledWorkoutId?: string | null;
    sourceJobId?: string | null;
    sourceUrl?: string | null;
    sourceWorkoutId?: string | null;
    title?: string;
  },
): ActiveSessionPreview {
  const rawTitle = overrides?.title || plan.title || "Imported Workout";
  const title = titleCase(rawTitle) || rawTitle;
  const rawDescription =
    overrides?.description ||
    plan.notes ||
    `Structured ${plan.workout_type.toLowerCase()} session tuned from your TikTok reference.`;
  const description = sentenceCase(rawDescription) || rawDescription;
  const planAverageRest = computeAverageRestSeconds(plan);
  const restBaseline = resolveExerciseRestBaseline(planAverageRest);
  const exercises = buildSessionExercises(plan, restBaseline);

  return {
    title,
    description,
    startedAt: Date.now(),
    averageRestSeconds: restBaseline,
    exercises,
    scheduledWorkoutId: overrides?.scheduledWorkoutId ?? undefined,
    sourceWorkoutId: overrides?.sourceWorkoutId ?? null,
    sourceJobId: overrides?.sourceJobId ?? null,
    sourceUrl: overrides?.sourceUrl ?? null,
    workoutPlan: plan,
  };
}

export function createSavedRoutinePreviewFromRecord(
  record: SavedWorkoutRecord,
): SavedRoutinePreview {
  return {
    id: record.id,
    savedWorkoutId: record.id,
    workoutId: record.workout_id,
    jobId: record.job_id,
    sourceUrl: record.source_url,
    title: getRoutineDisplayTitle({
      sourceUrl: record.source_url,
      title: record.title,
      workoutPlan: record.workout_plan,
    }),
    description: sanitizeRoutineDescription(record.description),
    metaLeft: record.meta_left || "Saved workout",
    metaRight: record.meta_right || "Ready",
    badgeLabel: record.badge_label || "Saved",
    workoutPlan: record.workout_plan || undefined,
    thumbnailUrl: record.thumbnail_url ?? null,
  };
}

export function createScheduledRoutinePreview(
  record: ScheduledWorkoutRecord,
): SavedRoutinePreview {
  return {
    id: record.id,
    scheduledWorkoutId: record.id,
    savedWorkoutId: record.source_workout_id ?? undefined,
    workoutId: record.workout_id,
    jobId: record.job_id,
    sourceUrl: record.source_url,
    scheduledFor: record.scheduled_for,
    scheduledTimeMinutes: record.scheduled_time_minutes ?? undefined,
    title: getRoutineDisplayTitle({
      sourceUrl: record.source_url,
      title: record.title,
      workoutPlan: record.workout_plan,
    }),
    description: sanitizeRoutineDescription(record.description),
    metaLeft: record.meta_left || "Scheduled",
    metaRight: record.meta_right || "Ready",
    badgeLabel: record.badge_label || "Scheduled",
    workoutPlan: record.workout_plan || undefined,
    thumbnailUrl: record.thumbnail_url ?? null,
  };
}

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Matches DB lift_set_logs.exercise_key: trimmed lower-case with collapsed whitespace. */
export function normalizeExerciseKeyForLiftHistory(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatWeightForLiftHint(weightLbs: number): string {
  const rounded = Math.round(weightLbs * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded).replace(/\.?0+$/, "");
}

/** Single-line hint for the tracker (“Last time”) row; aligns with logged set copy style. */
export function formatLastLiftSnapshotLine(snapshot: LiftLatestSetSnapshot): string {
  if (snapshot.duration_sec != null && snapshot.duration_sec >= 0) {
    const weightPart =
      snapshot.weight_lbs != null && snapshot.weight_lbs > 0
        ? `${formatWeightForLiftHint(snapshot.weight_lbs)} lb · `
        : "";
    return `${weightPart}${snapshot.duration_sec}s`;
  }

  const parts: string[] = [];
  if (snapshot.weight_lbs != null && snapshot.weight_lbs > 0) {
    parts.push(`${formatWeightForLiftHint(snapshot.weight_lbs)} lb`);
  }
  if (snapshot.reps != null && snapshot.reps >= 0) {
    parts.push(`${snapshot.reps} reps`);
  }
  return parts.join(" × ");
}

export function formatPersonalRecordLiftLine(
  snapshot: Pick<LiftLatestSetSnapshot, "personal_record_reps" | "personal_record_weight_lbs">,
): string | null {
  if (
    snapshot.personal_record_weight_lbs == null ||
    snapshot.personal_record_weight_lbs <= 0
  ) {
    return null;
  }

  const weight = `${formatWeightForLiftHint(snapshot.personal_record_weight_lbs)} lb`;
  if (snapshot.personal_record_reps != null && snapshot.personal_record_reps > 0) {
    return `${weight} × ${snapshot.personal_record_reps}`;
  }
  return weight;
}

export function getCompletedWorkoutSetCount(exercises: ActiveExercisePreview[]): number {
  return exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
}

export function getCompletedWorkoutVolume(exercises: ActiveExercisePreview[]): number {
  return exercises.reduce((total, exercise) => {
    return (
      total +
      exercise.sets.reduce((exerciseTotal, set) => {
        const weight = parseNumber(set.loggedWeight);
        const reps = parseNumber(set.loggedReps);
        if (weight == null || reps == null) {
          return exerciseTotal;
        }
        return exerciseTotal + weight * reps;
      }, 0)
    );
  }, 0);
}

/** Sum weight × reps across every logged set in completed history (+ optional in-progress session). */
export function getTotalLoggedLiftVolume(
  workouts: CompletedWorkoutRecord[],
  activeWorkout?: ActiveSessionPreview | null,
): number {
  const fromHistory = workouts.reduce(
    (sum, workout) => sum + getCompletedWorkoutVolume(workout.exercises),
    0,
  );

  if (!activeWorkout) {
    return fromHistory;
  }

  const activeExercises = activeWorkout.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.completed),
  }));

  return fromHistory + getCompletedWorkoutVolume(activeExercises);
}

export function formatTotalLiftedVolume(lbs: number): string {
  if (lbs <= 0) {
    return "0 lb";
  }
  return `${Math.round(lbs).toLocaleString()} lb`;
}

export function formatCompletedWorkoutDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildCompletedWorkoutRequest(
  session: ActiveSessionPreview,
): CompletedWorkoutCreateRequest {
  const tags = [
    session.workoutPlan?.workout_type,
    ...(session.workoutPlan?.equipment || []),
  ].filter((value): value is string => Boolean(value));

  return {
    workout_id: session.sourceWorkoutId ?? null,
    job_id: session.sourceJobId ?? null,
    source_url: session.sourceUrl ?? null,
    title: session.title,
    description: session.description,
    summary: null,
    exercises: session.exercises,
    workout_plan: session.workoutPlan ?? null,
    average_rest_seconds: session.averageRestSeconds,
    started_at: new Date(session.startedAt).toISOString(),
    completed_at: new Date().toISOString(),
    tags,
  };
}

export function getCompletedWorkoutMeta(record: CompletedWorkoutRecord): {
  metaLeft: string;
  metaRight: string;
} {
  const volume = getCompletedWorkoutVolume(record.exercises);
  const setCount = getCompletedWorkoutSetCount(record.exercises);

  return {
    metaLeft: volume > 0 ? `${Math.round(volume).toLocaleString()} lb volume` : "Logged session",
    metaRight: `${setCount} ${setCount === 1 ? "set" : "sets"}`,
  };
}

export function getCompletedWorkoutDisplaySummary(
  record: CompletedWorkoutRecord,
): string {
  return (
    sanitizeCompletedWorkoutSummary(record.summary) ||
    sanitizeRoutineDescription(record.description) ||
    "Tap to view the full workout summary."
  );
}
