import { NativeModules, Platform } from "react-native";

/**
 * Public payload accepted by `LiveWorkoutActivity.start` / `.update`.
 *
 * Mirrors `FitFoWorkoutAttributes.ContentState` on the iOS side. Pass
 * `restEndAt` as a JS `Date` (or absolute epoch ms) — we serialize it
 * across the bridge as epoch milliseconds so the widget can render a
 * native countdown using `Text(timerInterval:countsDown:)`.
 */
export interface LiveWorkoutActivityPayload {
  workoutName: string;
  exerciseName: string;
  /** 1-based current set index. */
  currentSet: number;
  /** Total sets planned for the current exercise. */
  totalSets: number;
  /** "active" | "rest" | "ready". Anything else is treated as "active" by the widget. */
  phase: "active" | "rest" | "ready";
  /** Absolute wall-clock end time of the rest countdown. Required when `phase === "rest"`. */
  restEndAt?: Date | number | null;
  /** Optional next set index — surfaced under the rest countdown. */
  nextSet?: number | null;
}

export interface LiveWorkoutActivityResult {
  ok: boolean;
  activityId?: string;
  reason?: string;
  reused?: boolean;
}

interface LiveWorkoutActivityNativeModule {
  start(payload: Record<string, unknown>): Promise<LiveWorkoutActivityResult>;
  update(payload: Record<string, unknown>): Promise<LiveWorkoutActivityResult>;
  end(): Promise<LiveWorkoutActivityResult>;
}

const NATIVE: LiveWorkoutActivityNativeModule | undefined =
  Platform.OS === "ios"
    ? (NativeModules.LiveWorkoutActivityModule as LiveWorkoutActivityNativeModule | undefined)
    : undefined;

function toEpochMs(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizePayload(payload: LiveWorkoutActivityPayload): Record<string, unknown> {
  const restEndAtMs = toEpochMs(payload.restEndAt);
  return {
    workoutName: (payload.workoutName ?? "").toString() || "Workout",
    exerciseName: (payload.exerciseName ?? "").toString() || "Get ready",
    currentSet: Math.max(1, Math.floor(payload.currentSet || 1)),
    totalSets: Math.max(
      Math.max(1, Math.floor(payload.currentSet || 1)),
      Math.floor(payload.totalSets || 0) || 1,
    ),
    phase: payload.phase || "active",
    restEndAtMs: restEndAtMs ?? 0,
    nextSet: typeof payload.nextSet === "number" ? Math.max(1, Math.floor(payload.nextSet)) : null,
  };
}

async function safeCall(
  reason: string,
  invoke: () => Promise<LiveWorkoutActivityResult>,
): Promise<LiveWorkoutActivityResult> {
  if (!NATIVE) {
    return { ok: false, reason };
  }
  try {
    const result = await invoke();
    return result ?? { ok: false, reason: "no_result" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "native_error",
    };
  }
}

/**
 * iOS-only thin wrapper over the FitFo Live Activity ActivityKit bridge.
 *
 * All methods are safe to call on Android and on iOS < 16.2 — they return
 * `{ ok: false, reason }` synchronously without throwing so callers never
 * need to gate on `Platform.OS`.
 */
export const LiveWorkoutActivity = {
  async start(payload: LiveWorkoutActivityPayload): Promise<LiveWorkoutActivityResult> {
    return safeCall("unsupported_platform", () => NATIVE!.start(normalizePayload(payload)));
  },
  async update(payload: LiveWorkoutActivityPayload): Promise<LiveWorkoutActivityResult> {
    return safeCall("unsupported_platform", () => NATIVE!.update(normalizePayload(payload)));
  },
  async end(): Promise<LiveWorkoutActivityResult> {
    return safeCall("unsupported_platform", () => NATIVE!.end());
  },
  /** True when the native module is wired up and the OS is iOS. */
  isAvailable(): boolean {
    return Boolean(NATIVE);
  },
};

export type LiveWorkoutActivityModule = typeof LiveWorkoutActivity;
