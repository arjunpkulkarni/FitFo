export type JobStatus =
  | "pending"
  | "fetching"
  | "transcribing"
  | "parsing"
  | "complete"
  | "failed";

export interface IngestRequest {
  source_url: string;
}

export interface IngestResponse {
  ok: boolean;
  source_url: string;
  normalized_url: string | null;
  format_ok: boolean;
  reachable: boolean | null;
  http_status: number | null;
  error: string | null;
  job_id: string | null;
}

export interface JobResponse {
  id: string;
  user_id: string | null;
  source_url: string;
  status: JobStatus;
  error: string | null;
  provider_meta: Record<string, unknown>;
  // Source video duration (seconds), once the fetch phase resolves and the
  // provider returns metadata. Null while pending or when the provider
  // didn't include duration in its payload. Surfaced by the backend so
  // clients don't have to dig through provider-specific shapes.
  video_duration_sec: number | null;
  // Best-effort thumbnail for the import flow: API prefers a frame from the
  // downloaded video (`preview_poster`), then TikTok oEmbed, then provider CDN.
  // ship a cover. CDN URLs are signed and rotate after a few hours, so
  // treat this as a short-lived preview asset, not a long-term reference.
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  duration_sec: number | null;
  rest_sec: number | null;
  notes: string | null;
}

export interface WorkoutBlock {
  name: string | null;
  exercises: WorkoutExercise[];
}

export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs";

export interface WorkoutPlan {
  title: string | null;
  workout_type: string;
  muscle_groups?: MuscleGroup[];
  equipment: string[];
  blocks: WorkoutBlock[];
  notes: string | null;
}

export interface WorkoutRow {
  id: string;
  job_id: string;
  title: string | null;
  schema_version: number;
  plan: WorkoutPlan;
  parser_model: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  username?: string | null;
  instagram_handle?: string | null;
  phone: string | null;
  email: string | null;
  apple_user_id: string | null;
  avatar_url?: string | null;
  onboarding: UserOnboarding | null;
  created_at: string | null;
  updated_at: string | null;
  /** When true, API grants Pro (server allowlist); client should treat as paid tier. */
  fitfo_pro_bypass?: boolean;
}

export type OnboardingGoal =
  | "build_muscle"
  | "lose_fat"
  | "get_stronger"
  | "improve_cardio"
  | "stay_active"
  | "athletic_performance";

export type TrainingSplit =
  | "ppl"
  | "upper_lower"
  | "bro_split"
  | "full_body"
  | "five_three_one"
  | "arnold_split"
  | "custom";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type OnboardingSex = "male" | "female" | "prefer_not_to_say";

export interface UserOnboarding {
  goals: OnboardingGoal[];
  sex: OnboardingSex | null;
  training_split: TrainingSplit;
  custom_split_notes: string | null;
  days_per_week: number;
  weight_lbs: number;
  height_inches: number;
  experience_level: ExperienceLevel;
  age: number;
  birth_date?: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AccountStatusRequest {
  phone: string;
}

export interface AccountStatusResponse {
  ok: boolean;
  exists: boolean;
  normalized_phone: string;
  message: string;
}

export interface SendOtpRequest {
  phone: string;
  intent: OtpIntent;
  full_name?: string;
}

export interface SendOtpResponse {
  ok: boolean;
  status: string;
  normalized_phone: string;
  message: string;
}

export type AppTab = "saved" | "logs" | "coach" | "profile" | "charts";

export type AuthMode = "login" | "signup" | "otp";

export type OtpIntent = "login" | "signup";

export interface VerifyOtpRequest {
  phone: string;
  code: string;
  intent: OtpIntent;
  full_name?: string;
}

export interface VerifyOtpResponse {
  ok: boolean;
  verified: boolean;
  access_token: string;
  token_type: "bearer";
  profile: UserProfile;
  message: string;
}

export interface AppleSignInRequest {
  identity_token: string;
  raw_nonce?: string;
  full_name?: string;
  email?: string;
}

export interface AppleSignInResponse {
  ok: boolean;
  verified: boolean;
  access_token: string;
  token_type: "bearer";
  profile: UserProfile;
  message: string;
}

export interface MeResponse {
  ok: boolean;
  profile: UserProfile;
}

export interface PatchProfileRequest {
  full_name: string;
}

export interface SaveUsernameRequest {
  username: string;
}

export interface UsernameCheckResponse {
  ok: boolean;
  username: string;
  available: boolean;
  message: string;
}

export interface SaveUsernameResponse {
  ok: boolean;
  profile: UserProfile;
  message: string;
}

export interface SaveInstagramHandleRequest {
  instagram_handle: string;
}

export interface SaveInstagramHandleResponse {
  ok: boolean;
  profile: UserProfile;
  message: string;
}

export interface SaveOnboardingRequest {
  goals: OnboardingGoal[];
  sex: OnboardingSex;
  training_split: TrainingSplit;
  custom_split_notes?: string | null;
  days_per_week: number;
  weight_lbs: number;
  height_inches: number;
  experience_level: ExperienceLevel;
  age: number;
  /** ISO calendar date (YYYY-MM-DD) from the birthday step. */
  birth_date?: string | null;
}

export interface SaveOnboardingResponse {
  ok: boolean;
  profile: UserProfile;
  message: string;
}

export interface BodyWeightEntryRecord {
  id: string;
  user_id: string;
  weight_lbs: number;
  source: "onboarding" | "manual" | string;
  recorded_at: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface BodyWeightEntryCreateRequest {
  weight_lbs: number;
}

export interface PendingOtpChallenge {
  intent: OtpIntent;
  phone: string;
  fullName: string | null;
  sentAt: number;
}

export interface StoredAuthSession {
  accessToken: string;
  profile: UserProfile | null;
}

export interface SavedRoutinePreview {
  id: string;
  savedWorkoutId?: string;
  scheduledWorkoutId?: string;
  workoutId?: string | null;
  jobId?: string | null;
  sourceUrl?: string | null;
  scheduledFor?: string;
  /** Minutes from local midnight (0–1439) when this workout is planned. */
  scheduledTimeMinutes?: number;
  title: string;
  description: string;
  metaLeft: string;
  metaRight: string;
  badgeLabel?: string;
  workoutPlan?: WorkoutPlan;
  // Best-effort cover image from the import job or persisted library rows.
  thumbnailUrl?: string | null;
}

export interface ActiveSetPreview {
  id: string;
  label: string;
  targetReps: number | null;
  targetDurationSec: number | null;
  loggedWeight: string;
  loggedReps: string;
  completed: boolean;
  skipped?: boolean;
  /**
   * Free-form per-set note ("felt heavy", "drop set 60 → 50", etc).
   * Persisted into `completed_workouts.exercises[].sets[].notes` on finish so
   * users can review them when they reopen the workout from history.
   */
  notes?: string | null;
  /**
   * Unit the athlete used when typing `loggedWeight`. Stored alongside the
   * value so historical sets always render in the unit they were entered in,
   * even if the athlete later flips their imperial/metric preference. Older
   * rows that pre-date this field default to `lb` at read time.
   */
  weightUnit?: "lb" | "kg";
}

export interface ActiveExercisePreview {
  id: string;
  name: string;
  subtitle: string;
  blockName: string | null;
  notes: string | null;
  restSeconds: number | null;
  sets: ActiveSetPreview[];
}

export interface ActiveSessionPreview {
  title: string;
  description: string;
  startedAt: number;
  /**
   * When set, finishing the session marks this `scheduled_workouts` row
   * completed so it drops off the calendar and upcoming lists.
   */
  scheduledWorkoutId?: string | null;
  /**
   * Set when the in-session workout UI is dismissed — hub/logs cards use this
   * instead of Date.now so elapsed stops until the athlete resumes.
   */
  hubTimerFrozenWallMs?: number;
  averageRestSeconds: number | null;
  exercises: ActiveExercisePreview[];
  sourceWorkoutId?: string | null;
  sourceJobId?: string | null;
  sourceUrl?: string | null;
  workoutPlan?: WorkoutPlan | null;
}

export interface SavedWorkoutRecord {
  id: string;
  user_id: string;
  workout_id: string | null;
  job_id: string | null;
  source_url: string | null;
  /** Present after API migration `013_saved_scheduled_thumbnail`; optional for older payloads. */
  thumbnail_url?: string | null;
  title: string;
  description: string | null;
  meta_left: string | null;
  meta_right: string | null;
  badge_label: string | null;
  workout_plan: WorkoutPlan | null;
  saved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SavedWorkoutUpsertRequest {
  workout_id?: string | null;
  job_id?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  title: string;
  description?: string | null;
  meta_left?: string | null;
  meta_right?: string | null;
  badge_label?: string | null;
  workout_plan?: WorkoutPlan | null;
}

export interface SavedWorkoutUpdateRequest {
  title?: string;
  description?: string | null;
  meta_left?: string | null;
  meta_right?: string | null;
  badge_label?: string | null;
  workout_plan?: WorkoutPlan | null;
  source_url?: string | null;
}

export interface CsvImportedSet {
  set_index: number | null;
  set_type: string | null;
  weight_lbs: number | null;
  reps: number | null;
  distance_miles: number | null;
  duration_seconds: number | null;
  rpe: number | null;
}

export interface CsvImportedExercise {
  name: string;
  notes: string | null;
  superset_id: string | null;
  sets: CsvImportedSet[];
}

export interface CsvImportedWorkout {
  title: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  exercises: CsvImportedExercise[];
  workout_plan: WorkoutPlan | null;
  saved_workout: SavedWorkoutRecord;
}

export interface CsvImportResponse {
  success: boolean;
  source_app: "hevy" | "strong" | "generic_csv" | string;
  source_file_name: string | null;
  imported_workouts_count: number;
  imported_sets_count: number;
  workouts: CsvImportedWorkout[];
}

export type ScheduledWorkoutStatus =
  | "scheduled"
  | "completed"
  | "skipped"
  | "cancelled";

export interface ScheduledWorkoutRecord {
  id: string;
  user_id: string;
  source_workout_id: string | null;
  workout_id: string | null;
  job_id: string | null;
  source_url: string | null;
  /** Present after API migration `013_saved_scheduled_thumbnail`. */
  thumbnail_url?: string | null;
  scheduled_for: string;
  scheduled_time_minutes?: number | null;
  status: ScheduledWorkoutStatus;
  title: string;
  description: string | null;
  meta_left: string | null;
  meta_right: string | null;
  badge_label: string | null;
  workout_plan: WorkoutPlan | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ScheduledWorkoutCreateRequest {
  source_workout_id?: string | null;
  workout_id?: string | null;
  job_id?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  scheduled_for: string;
  scheduled_time_minutes?: number;
  title: string;
  description?: string | null;
  meta_left?: string | null;
  meta_right?: string | null;
  badge_label?: string | null;
  workout_plan?: WorkoutPlan | null;
}

export interface ScheduledWorkoutUpdateRequest {
  scheduled_for?: string;
  scheduled_time_minutes?: number;
  status?: ScheduledWorkoutStatus;
  title?: string;
  description?: string | null;
  meta_left?: string | null;
  meta_right?: string | null;
  badge_label?: string | null;
  workout_plan?: WorkoutPlan | null;
  source_url?: string | null;
}

export interface CompletedWorkoutRecord {
  id: string;
  user_id: string;
  workout_id: string | null;
  job_id: string | null;
  source_url: string | null;
  title: string;
  description: string | null;
  summary: string | null;
  exercises: ActiveExercisePreview[];
  workout_plan: WorkoutPlan | null;
  notes: string | null;
  calories: number | null;
  difficulty: string | null;
  tags: string[];
  average_rest_seconds: number | null;
  started_at: string | null;
  completed_at: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CompletedWorkoutCreateRequest {
  workout_id?: string | null;
  job_id?: string | null;
  source_url?: string | null;
  title: string;
  description?: string | null;
  summary?: string | null;
  exercises: ActiveExercisePreview[];
  workout_plan?: WorkoutPlan | null;
  notes?: string | null;
  calories?: number | null;
  difficulty?: string | null;
  tags?: string[];
  average_rest_seconds?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/** Latest logged set from lift_set_logs /lift-history/latest-snapshot (per exercise_key + set slot). */
export interface LiftLatestSetSnapshot {
  exercise_key: string;
  exercise_name: string;
  set_position: number;
  weight_lbs: number | null;
  reps: number | null;
  duration_sec: number | null;
  recorded_at: string;
  last_session_recorded_at?: string | null;
  personal_record_weight_lbs?: number | null;
  personal_record_reps?: number | null;
  personal_record_recorded_at?: string | null;
}
