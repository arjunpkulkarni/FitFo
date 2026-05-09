/**
 * Singleton job-status subscription with adaptive polling.
 *
 * Why this exists:
 * - The ingestion pipeline takes anywhere from ~10s (cached caption-only)
 *   to ~120s (long video + cold OpenAI bucket). Polling every 1.5s for the
 *   full window costs ~80 wasted requests after the interesting transitions
 *   are done.
 * - Multiple components asking about the same job used to spawn one poll
 *   loop each. Refcounting on a per-jobId loop keeps that flat at one.
 *
 * Designed to be drop-in replaced by SSE next: hooks subscribe and receive
 * `JobUpdate` events the same way regardless of whether the underlying
 * transport is polling or `EventSource`.
 */

import { AppState, type AppStateStatus } from "react-native";

import { getJob, getWorkoutByJob } from "./api";
import type { JobResponse, JobStatus, WorkoutRow } from "../types";

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(["complete", "failed"]);

// Pipeline-shaped polling cadence. The ingestion phases have very different
// durations and observable progress:
//   0-20s   fetch + start of transcribe — status flips quickly, poll snappy.
//   20-30s  transcribing               — long opaque step; no point hammering.
//   30-40s  parsing                    — quick OpenAI call, result might land
//                                        any moment.
//   40s+    long-tail completion       — fastest checks so the user sees the
//                                        finish the instant it happens.
// `afterMs` entries MUST stay in ascending order; intervalForAge() walks the
// list and picks the last tier whose threshold is <= the job age.
const POLL_SCHEDULE: ReadonlyArray<{ afterMs: number; intervalMs: number }> = [
  { afterMs: 0, intervalMs: 1500 },
  { afterMs: 20_000, intervalMs: 10_000 },
  { afterMs: 30_000, intervalMs: 8000 },
  { afterMs: 40_000, intervalMs: 5000 },
];

const POLL_TIMEOUT_MS = 180_000;
// Don't trigger a foreground refresh if we already polled within this window.
// Prevents the "burst of 3 GETs in 1 second" behavior when AppState briefly
// flips active during a normal interval tick.
const FOREGROUND_REFRESH_DEBOUNCE_MS = 1500;
// Tolerate a couple network blips before showing the user an error.
const MAX_CONSECUTIVE_ERRORS = 3;

function intervalForAge(ageMs: number): number {
  let chosen = POLL_SCHEDULE[0].intervalMs;
  for (const tier of POLL_SCHEDULE) {
    if (ageMs >= tier.afterMs) {
      chosen = tier.intervalMs;
    }
  }
  return chosen;
}

export interface JobUpdate {
  job: JobResponse | null;
  workout: WorkoutRow | null;
  error: string | null;
}

type Listener = (update: JobUpdate) => void;

interface Subscription {
  jobId: string;
  accessToken: string;
  listeners: Set<Listener>;
  state: JobUpdate;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  consecutiveErrors: number;
  lastFetchAt: number;
  appStateSub: { remove: () => void } | null;
  stopped: boolean;
  inFlight: boolean;
}

const subscriptions = new Map<string, Subscription>();

function notify(sub: Subscription): void {
  for (const listener of sub.listeners) {
    listener(sub.state);
  }
}

function clearTimer(sub: Subscription): void {
  if (sub.timer) {
    clearTimeout(sub.timer);
    sub.timer = null;
  }
}

function schedule(sub: Subscription): void {
  if (sub.stopped) return;
  clearTimer(sub);
  const ageMs = Date.now() - sub.startedAt;
  sub.timer = setTimeout(() => {
    void poll(sub);
  }, intervalForAge(ageMs));
}

async function poll(sub: Subscription): Promise<void> {
  if (sub.stopped || sub.inFlight) return;
  sub.inFlight = true;
  sub.lastFetchAt = Date.now();
  try {
    const job = await getJob(sub.jobId, sub.accessToken);
    sub.consecutiveErrors = 0;

    let workout = sub.state.workout;
    if (job.status === "complete" && !workout) {
      try {
        workout = await getWorkoutByJob(sub.jobId, sub.accessToken);
      } catch {
        // Workout fetch is best-effort here; the UI can request it again
        // on demand if it really needs the rows.
      }
    }

    sub.state = { job, workout, error: null };
    notify(sub);

    if (TERMINAL_STATUSES.has(job.status)) {
      stop(sub);
      return;
    }
  } catch (error) {
    sub.consecutiveErrors += 1;
    if (sub.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      sub.state = {
        ...sub.state,
        error:
          error instanceof Error ? error.message : "Failed to fetch job status",
      };
      notify(sub);
      stop(sub);
      return;
    }
    // Transient — keep polling on the normal cadence.
  } finally {
    sub.inFlight = false;
  }

  schedule(sub);
}

function stop(sub: Subscription): void {
  if (sub.stopped) return;
  sub.stopped = true;
  clearTimer(sub);
  if (sub.timeoutTimer) {
    clearTimeout(sub.timeoutTimer);
    sub.timeoutTimer = null;
  }
  sub.appStateSub?.remove();
  sub.appStateSub = null;
  subscriptions.delete(sub.jobId);
}

function start(jobId: string, accessToken: string): Subscription {
  const sub: Subscription = {
    jobId,
    accessToken,
    listeners: new Set(),
    state: { job: null, workout: null, error: null },
    startedAt: Date.now(),
    timer: null,
    timeoutTimer: null,
    consecutiveErrors: 0,
    lastFetchAt: 0,
    appStateSub: null,
    stopped: false,
    inFlight: false,
  };

  sub.timeoutTimer = setTimeout(() => {
    sub.state = {
      ...sub.state,
      error: "Import is taking too long. Try again, or pick a different video.",
    };
    notify(sub);
    stop(sub);
  }, POLL_TIMEOUT_MS);

  sub.appStateSub = AppState.addEventListener(
    "change",
    (next: AppStateStatus) => {
      if (next !== "active") return;
      if (Date.now() - sub.lastFetchAt < FOREGROUND_REFRESH_DEBOUNCE_MS) return;
      void poll(sub);
    },
  );

  subscriptions.set(jobId, sub);
  void poll(sub);
  return sub;
}

export function subscribeToJob(
  jobId: string,
  accessToken: string,
  listener: Listener,
): () => void {
  let sub = subscriptions.get(jobId);
  if (sub && sub.accessToken !== accessToken) {
    // Token refreshed mid-flight: hot-swap so the next poll uses the new
    // bearer without dropping any in-flight subscribers.
    sub.accessToken = accessToken;
  }
  if (!sub) {
    sub = start(jobId, accessToken);
  }
  sub.listeners.add(listener);
  // Replay current state so a late subscriber doesn't have to wait a full
  // interval before seeing what we already know.
  listener(sub.state);

  return () => {
    if (!sub) return;
    sub.listeners.delete(listener);
    if (sub.listeners.size === 0) {
      stop(sub);
    }
  };
}
