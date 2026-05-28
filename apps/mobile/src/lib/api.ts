import type {
  AccountStatusRequest,
  AccountStatusResponse,
  AppleSignInRequest,
  AppleSignInResponse,
  BodyWeightEntryCreateRequest,
  BodyWeightEntryRecord,
  CompletedWorkoutCreateRequest,
  CompletedWorkoutRecord,
  CsvImportResponse,
  LiftLatestSetSnapshot,
  IngestRequest,
  IngestResponse,
  JobResponse,
  MeResponse,
  PatchProfileRequest,
  SaveInstagramHandleRequest,
  SaveInstagramHandleResponse,
  SaveOnboardingRequest,
  SaveOnboardingResponse,
  SaveUsernameRequest,
  SaveUsernameResponse,
  SavedWorkoutRecord,
  SavedWorkoutUpdateRequest,
  SavedWorkoutUpsertRequest,
  ScheduledWorkoutCreateRequest,
  ScheduledWorkoutRecord,
  ScheduledWorkoutUpdateRequest,
  SendOtpRequest,
  SendOtpResponse,
  StartFreeAccessResponse,
  UsernameCheckResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  WorkoutRow,
} from "../types";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

// ─── Paywall / IAP policy (App Store Guideline 3.1.1) ──────────────────────
//
// Any future paywall in the iOS build MUST use StoreKit via Apple's In-App
// Purchase system (we recommend `react-native-purchases` / RevenueCat). Do
// NOT add calls to a web-hosted Stripe/Paddle/LemonSqueezy checkout here,
// do NOT add "subscribe on our website" buttons, and do NOT deep-link to
// an external purchase URL for digital unlocks. Apple will reject the
// binary. Android can keep a Play Billing path (also via RevenueCat).
//
// Backend subscription verification must validate Apple App Store Server
// receipts — never trust the client's claim of purchase status.
// ───────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 502:
    case 503:
    case 504:
      return "Service temporarily unavailable. Please try again in a moment.";
    case 404:
      return "Resource not found.";
    case 401:
    case 403:
      return "Request not authorized.";
    default:
      return `Something went wrong (${status}). Please try again.`;
  }
}

function looksLikeHtmlPayload(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("<html") ||
    t.includes("<body") ||
    t.includes("nginx/") ||
    t.includes("bad gateway")
  );
}

/** Turn proxy/HTML error pages into a short user-facing string. */
function humanizeErrorPayload(status: number, rawBody: string): string {
  const body = rawBody.trim();
  if (!body) {
    return defaultMessageForStatus(status);
  }
  if (looksLikeHtmlPayload(body)) {
    return defaultMessageForStatus(status);
  }
  if (body.length > 280) {
    return defaultMessageForStatus(status);
  }
  return body;
}

interface RequestOptions extends RequestInit {
  accessToken?: string;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.accessToken
        ? { Authorization: `Bearer ${init.accessToken}` }
        : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = defaultMessageForStatus(response.status);

    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      const detail = parsed.detail;
      if (typeof detail === "string" && detail.trim()) {
        message = looksLikeHtmlPayload(detail)
          ? defaultMessageForStatus(response.status)
          : detail.trim();
      }
    } catch {
      message = humanizeErrorPayload(response.status, body);
    }

    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

function normalizeLoggedField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function normalizeCompletedWorkoutRecord(
  record: CompletedWorkoutRecord,
): CompletedWorkoutRecord {
  // Defensive normalization: older records or backend transforms may return
  // `logged_weight` / `logged_reps` or numeric values.
  const exercises = Array.isArray(record.exercises) ? record.exercises : [];

  return {
    ...record,
    exercises: exercises.map((exercise: any) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      return {
        ...exercise,
        sets: sets.map((set: any) => ({
          ...set,
          loggedWeight: normalizeLoggedField(set?.loggedWeight ?? set?.logged_weight),
          loggedReps: normalizeLoggedField(set?.loggedReps ?? set?.logged_reps),
        })),
      };
    }),
  };
}

export async function createIngestionJob(
  sourceUrl: string,
  accessToken: string,
): Promise<IngestResponse> {
  const body: IngestRequest = { source_url: sourceUrl };

  return request<IngestResponse>("/ingest", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function getJob(
  jobId: string,
  accessToken: string,
): Promise<JobResponse> {
  return request<JobResponse>(`/jobs/${jobId}`, {
    accessToken,
  });
}

export async function getWorkoutByJob(
  jobId: string,
  accessToken: string,
): Promise<WorkoutRow> {
  return request<WorkoutRow>(`/jobs/${jobId}/workout`, {
    accessToken,
  });
}

export async function checkAccountStatus(
  phone: string,
): Promise<AccountStatusResponse> {
  const body: AccountStatusRequest = { phone };

  return request<AccountStatusResponse>("/auth/account-status", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function sendOtp(
  body: SendOtpRequest,
): Promise<SendOtpResponse> {
  const digits = body.phone.replace(/\D/g, "");
  const phoneTail = digits.length >= 4 ? digits.slice(-4) : digits || "?";
  // Metro / Xcode / adb logcat — use when debugging “send code” failures.
  console.log("[Fitfo OTP] POST /auth/send-otp →", {
    intent: body.intent,
    phoneTail,
    signupHasFullName:
      body.intent === "signup"
        ? Boolean((body.full_name ?? "").trim())
        : undefined,
    apiUrl: API_BASE,
  });

  try {
    const response = await request<SendOtpResponse>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log("[Fitfo OTP] send-otp OK:", {
      twilioFlowStatus: response.status,
      normalized_phone: response.normalized_phone,
      messagePreview: response.message?.slice(0, 80),
    });
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      console.log("[Fitfo OTP] send-otp FAILED:", {
        status: error.status,
        message: error.message,
      });
    } else {
      console.log("[Fitfo OTP] send-otp FAILED:", error);
    }
    throw error;
  }
}

export async function verifyOtp(
  body: VerifyOtpRequest,
): Promise<VerifyOtpResponse> {
  return request<VerifyOtpResponse>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function appleSignIn(
  body: AppleSignInRequest,
): Promise<AppleSignInResponse> {
  return request<AppleSignInResponse>("/auth/apple", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getCurrentUser(
  accessToken: string,
): Promise<MeResponse> {
  return request<MeResponse>("/auth/me", {
    method: "GET",
    accessToken,
  });
}

export async function patchProfile(
  accessToken: string,
  body: PatchProfileRequest,
): Promise<MeResponse> {
  return request<MeResponse>("/auth/me", {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(body),
  });
}

function guessImageMimeFromUri(uri: string): string {
  const lower = uri.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

export async function uploadProfileAvatar(
  accessToken: string,
  asset: { uri: string; mimeType?: string | null },
): Promise<MeResponse> {
  const mime = asset.mimeType?.trim() || guessImageMimeFromUri(asset.uri);
  const name =
    mime === "image/png"
      ? "avatar.png"
      : mime === "image/webp"
        ? "avatar.webp"
        : "avatar.jpg";

  const form = new FormData();
  form.append(
    "file",
    {
      uri: asset.uri,
      name,
      type: mime,
    } as unknown as Blob,
  );

  const response = await fetch(`${API_BASE}/auth/me/avatar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    let message = defaultMessageForStatus(response.status);
    try {
      const parsed = JSON.parse(bodyText) as { detail?: unknown };
      const detail = parsed.detail;
      if (typeof detail === "string" && detail.trim()) {
        message = looksLikeHtmlPayload(detail)
          ? defaultMessageForStatus(response.status)
          : detail.trim();
      }
    } catch {
      message = humanizeErrorPayload(response.status, bodyText);
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<MeResponse>;
}

/**
 * Upload a workout-export CSV (Hevy/Strong/generic). The backend parses the
 * file into one or more workouts and persists each to ``saved_workouts``.
 */
export async function importWorkoutsFromCsv(
  accessToken: string,
  asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null },
): Promise<CsvImportResponse> {
  const name = (asset.name?.trim() || "workouts.csv").replace(/[^A-Za-z0-9._-]+/g, "_");
  const mime = asset.mimeType?.trim() || "text/csv";

  const form = new FormData();
  form.append(
    "file",
    {
      uri: asset.uri,
      name,
      type: mime,
    } as unknown as Blob,
  );

  const response = await fetch(`${API_BASE}/imports/workouts/csv`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    let message = defaultMessageForStatus(response.status);
    try {
      const parsed = JSON.parse(bodyText) as { detail?: unknown };
      const detail = parsed.detail;
      if (typeof detail === "string" && detail.trim()) {
        message = looksLikeHtmlPayload(detail)
          ? defaultMessageForStatus(response.status)
          : detail.trim();
      }
    } catch {
      message = humanizeErrorPayload(response.status, bodyText);
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<CsvImportResponse>;
}

export async function deleteProfileAvatar(accessToken: string): Promise<MeResponse> {
  return request<MeResponse>("/auth/me/avatar", {
    method: "DELETE",
    accessToken,
  });
}

export interface SyncRevenueCatUserResponse {
  ok: boolean;
  supabase_user_id: string;
  revenuecat_app_user_id: string;
}

/**
 * Tell the backend to upsert the RevenueCat ↔ Supabase user mapping for
 * the signed-in user. The client doesn't need to send identity fields —
 * the server pulls phone / Apple provider id from the authenticated
 * profile and sets ``revenuecat_app_user_id`` equal to ``profiles.id``
 * (matching what the RC SDK is configured with on this device).
 *
 * Called after auth restore / login / signup, alongside Purchases.logIn.
 */
export async function syncRevenueCatUser(
  accessToken: string,
): Promise<SyncRevenueCatUserResponse> {
  return request<SyncRevenueCatUserResponse>("/revenuecat/sync-user", {
    method: "POST",
    accessToken,
    body: JSON.stringify({}),
  });
}

/** Register device for server-driven "import ready" push notifications. */
export async function registerExpoPushToken(
  accessToken: string,
  expoPushToken: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/auth/expo-push-token", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ expo_push_token: expoPushToken }),
  });
}

export async function saveOnboarding(
  accessToken: string,
  body: SaveOnboardingRequest,
): Promise<SaveOnboardingResponse> {
  return request<SaveOnboardingResponse>("/auth/onboarding", {
    method: "PUT",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function startFreeAccess(
  accessToken: string,
): Promise<StartFreeAccessResponse> {
  return request<StartFreeAccessResponse>("/auth/free-access", {
    method: "POST",
    accessToken,
  });
}

export async function checkUsername(
  accessToken: string,
  username: string,
): Promise<UsernameCheckResponse> {
  const query = new URLSearchParams({ username });
  return request<UsernameCheckResponse>(`/auth/username/check?${query}`, {
    accessToken,
  });
}

/**
 * Public username availability check — used by the onboarding carousel before
 * the user has an access token. Race conditions vs. {@link saveUsername} are
 * resolved by the API's 409 response, so a "yes available" answer is a
 * best-effort hint, not a hold.
 */
export async function checkUsernameAvailability(
  username: string,
): Promise<UsernameCheckResponse> {
  const query = new URLSearchParams({ username });
  return request<UsernameCheckResponse>(
    `/auth/username/availability?${query}`,
  );
}

export async function saveUsername(
  accessToken: string,
  body: SaveUsernameRequest,
): Promise<SaveUsernameResponse> {
  return request<SaveUsernameResponse>("/auth/username", {
    method: "PUT",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function saveInstagramHandle(
  accessToken: string,
  body: SaveInstagramHandleRequest,
): Promise<SaveInstagramHandleResponse> {
  return request<SaveInstagramHandleResponse>("/auth/instagram-handle", {
    method: "PUT",
    accessToken,
    body: JSON.stringify(body),
  });
}

export interface DeleteAccountResponse {
  ok: boolean;
  message: string;
  apple_revoked: boolean;
}

/**
 * Permanently delete the authenticated user's account (App Store 5.1.1(v)).
 * The server cascades deletion across every table the user owns and asks
 * Apple to revoke Sign-in-with-Apple refresh tokens when configured.
 */
export async function deleteAccount(
  accessToken: string,
): Promise<DeleteAccountResponse> {
  return request<DeleteAccountResponse>("/auth/me", {
    method: "DELETE",
    accessToken,
  });
}

export async function listSavedWorkouts(
  accessToken: string,
): Promise<SavedWorkoutRecord[]> {
  return request<SavedWorkoutRecord[]>("/saved-workouts", {
    method: "GET",
    accessToken,
  });
}

export async function saveWorkoutForLater(
  accessToken: string,
  body: SavedWorkoutUpsertRequest,
): Promise<SavedWorkoutRecord> {
  return request<SavedWorkoutRecord>("/saved-workouts", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function updateSavedWorkout(
  accessToken: string,
  savedWorkoutId: string,
  body: SavedWorkoutUpdateRequest,
): Promise<SavedWorkoutRecord> {
  return request<SavedWorkoutRecord>(`/saved-workouts/${savedWorkoutId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function deleteSavedWorkout(
  accessToken: string,
  savedWorkoutId: string,
): Promise<SavedWorkoutRecord> {
  return request<SavedWorkoutRecord>(`/saved-workouts/${savedWorkoutId}`, {
    method: "DELETE",
    accessToken,
  });
}

export async function listCompletedWorkouts(
  accessToken: string,
): Promise<CompletedWorkoutRecord[]> {
  const rows = await request<CompletedWorkoutRecord[]>("/completed-workouts", {
    method: "GET",
    accessToken,
  });
  return rows.map(normalizeCompletedWorkoutRecord);
}

export async function getCompletedWorkout(
  accessToken: string,
  completedWorkoutId: string,
): Promise<CompletedWorkoutRecord> {
  const row = await request<CompletedWorkoutRecord>(`/completed-workouts/${completedWorkoutId}`, {
    method: "GET",
    accessToken,
  });
  return normalizeCompletedWorkoutRecord(row);
}

export async function createCompletedWorkout(
  accessToken: string,
  body: CompletedWorkoutCreateRequest,
): Promise<CompletedWorkoutRecord> {
  const row = await request<CompletedWorkoutRecord>("/completed-workouts", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
  return normalizeCompletedWorkoutRecord(row);
}

export async function deleteCompletedWorkout(
  accessToken: string,
  completedWorkoutId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/completed-workouts/${encodeURIComponent(completedWorkoutId)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = defaultMessageForStatus(response.status);
    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      const detail = parsed.detail;
      if (typeof detail === "string" && detail.trim()) {
        message = looksLikeHtmlPayload(detail)
          ? defaultMessageForStatus(response.status)
          : detail.trim();
      }
    } catch {
      message = humanizeErrorPayload(response.status, body);
    }

    throw new ApiError(response.status, message);
  }
}

export async function fetchLiftLatestSnapshot(
  accessToken: string,
): Promise<LiftLatestSetSnapshot[]> {
  const payload = await request<{ snapshots: LiftLatestSetSnapshot[] }>(
    "/lift-history/latest-snapshot",
    {
      method: "GET",
      accessToken,
    },
  );
  return payload.snapshots ?? [];
}

export async function listBodyWeightEntries(
  accessToken: string,
): Promise<BodyWeightEntryRecord[]> {
  return request<BodyWeightEntryRecord[]>("/body-weight", {
    method: "GET",
    accessToken,
  });
}

export async function createBodyWeightEntry(
  accessToken: string,
  body: BodyWeightEntryCreateRequest,
): Promise<BodyWeightEntryRecord> {
  return request<BodyWeightEntryRecord>("/body-weight", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function listScheduledWorkouts(
  accessToken: string,
  params?: { start?: string; end?: string },
): Promise<ScheduledWorkoutRecord[]> {
  const query = new URLSearchParams();
  if (params?.start) {
    query.set("start", params.start);
  }
  if (params?.end) {
    query.set("end", params.end);
  }
  const suffix = query.toString();
  const path = suffix ? `/scheduled-workouts?${suffix}` : "/scheduled-workouts";
  return request<ScheduledWorkoutRecord[]>(path, {
    method: "GET",
    accessToken,
  });
}

export async function createScheduledWorkout(
  accessToken: string,
  body: ScheduledWorkoutCreateRequest,
): Promise<ScheduledWorkoutRecord> {
  return request<ScheduledWorkoutRecord>("/scheduled-workouts", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  });
}

export async function updateScheduledWorkout(
  accessToken: string,
  scheduledWorkoutId: string,
  body: ScheduledWorkoutUpdateRequest,
): Promise<ScheduledWorkoutRecord> {
  return request<ScheduledWorkoutRecord>(
    `/scheduled-workouts/${scheduledWorkoutId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(body),
    },
  );
}

export async function deleteScheduledWorkout(
  accessToken: string,
  scheduledWorkoutId: string,
): Promise<ScheduledWorkoutRecord> {
  return request<ScheduledWorkoutRecord>(
    `/scheduled-workouts/${scheduledWorkoutId}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}
