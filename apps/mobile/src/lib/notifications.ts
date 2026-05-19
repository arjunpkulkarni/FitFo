import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { registerExpoPushToken as registerExpoPushTokenApi } from "./api";
import { getCreatorDisplayLabel } from "./fitfo";
import type { ScheduledWorkoutRecord } from "../types";

// One storage key maps scheduled_workout_id -> expo notification ids so we can
// cancel local notifications when the user unschedules without keeping a DB column.
const NOTIFICATION_MAP_STORAGE_KEY = "@fitfo:scheduled-workout-notification-map";

// Persists the user's "always notify me when an import is taking long" choice
// so we can auto-promote slow imports to background mode without re-asking.
const AUTO_NOTIFY_IMPORTS_STORAGE_KEY = "@fitfo:auto-notify-imports";

// Fallback reminder times when a scheduled workout has no time-of-day set.
const DAY_BEFORE_REMINDER_HOUR_24H = 19;
const DAY_OF_REMINDER_HOUR_24H = 7;

// Expo local notifications on Android require a channel. Without one, scheduled
// notifications can be created but never visibly delivered.
// We intentionally use the built-in `default` channelId so we don't need to
// thread channel IDs through the notification content types (our current
// `expo-notifications` typings don't expose an `android` field).
const REMINDER_NOTIFICATION_CHANNEL_ID = "default";
const REMINDER_NOTIFICATION_CHANNEL_NAME = "Fitfo workout reminders";

let permissionState: "unknown" | "granted" | "denied" = "unknown";

type NotificationMap = Record<string, string[]>;

async function ensureReminderNotificationChannel(): Promise<void> {
  try {
    // Only meaningful on Android; harmless on iOS.
    await Notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_ID, {
      name: REMINDER_NOTIFICATION_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      // A simple vibration pattern for attention without being too aggressive.
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Best-effort: if channel setup fails, scheduled reminders may still work
    // depending on platform/Expo defaults.
  }
}

async function readNotificationMap(): Promise<NotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([id, value]) => {
        if (Array.isArray(value)) {
          const notificationIds = value.filter(
            (notificationId): notificationId is string =>
              typeof notificationId === "string",
          );
          return notificationIds.length > 0 ? [[id, notificationIds]] : [];
        }
        // Backward compatibility for installs that still have the old single-id map.
        return typeof value === "string" ? [[id, [value]]] : [];
      }),
    );
  } catch {
    return {};
  }
}

async function writeNotificationMap(map: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_MAP_STORAGE_KEY, JSON.stringify(map));
}

// Track whether we've shown the pre-permission explainer in this session so
// we don't nag the user every time they schedule a workout.
let explainerShownThisSession = false;

function askUserBeforeSystemPrompt(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Turn on Fitfo alerts?",
        "Fitfo sends local alerts: reminders the evening before and morning of each workout you schedule, a quick ping when an imported workout finishes building, and, if your calendar has no upcoming workouts, a gentle nudge after 24 hours to schedule your next session. No marketing, no ads. You can turn them off anytime in iOS Settings.",
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Turn on",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    );
  });
}

/**
 * Ask iOS/Android for notification permission.
 *
 * Apple best practice (and common App Review feedback): show an in-app
 * explainer BEFORE the system-level permission dialog so users understand
 * what they're opting into. Once the system dialog has been dismissed the
 * first time, we can't ask again — so the pre-prompt matters.
 *
 * Safe to call repeatedly — the explainer only fires once per session when
 * the OS still has room to present the native dialog.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionState = "granted";
      void ensureReminderNotificationChannel();
      return true;
    }
    if (!existing.canAskAgain) {
      permissionState = "denied";
      return false;
    }

    // Only surface the in-app explainer the first time this session — after
    // that, repeated schedule actions shouldn't re-prompt.
    if (!explainerShownThisSession) {
      explainerShownThisSession = true;
      const userAgreed = await askUserBeforeSystemPrompt();
      if (!userAgreed) {
        permissionState = "denied";
        return false;
      }
    }

    const requested = await Notifications.requestPermissionsAsync();
    permissionState = requested.granted ? "granted" : "denied";
    if (requested.granted) {
      await ensureReminderNotificationChannel();
    }
    return requested.granted;
  } catch {
    permissionState = "denied";
    return false;
  }
}

/**
 * First-time onboarding: explain workout reminders before the system dialog.
 * Prefer calling when the user completes the **calendar** step (scheduled-workout
 * context) so prompts land before they hit slow imports. Sessions that skip that
 * UI (e.g. auth-landing deferred onboarding) should call this after save instead.
 * Once the system dialog has been dismissed the first time, we can't ask again — so
 * the pre-prompt matters.
 */
export async function requestNotificationPermissionForOnboarding(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionState = "granted";
      return true;
    }
    if (!existing.canAskAgain) {
      permissionState = "denied";
      return false;
    }

    explainerShownThisSession = true;

    const userAgreed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Get workout reminders?",
        "We'll remind you the evening before and the morning of each workout you schedule, nudge you after 24 hours if nothing is on your calendar, and, if an import takes a bit, let you know when your workout is ready to save. You can turn this off anytime in Settings.",
        [
          { text: "Not now", style: "cancel", onPress: () => resolve(false) },
          { text: "Allow", onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });

    if (!userAgreed) {
      return false;
    }

    const requested = await Notifications.requestPermissionsAsync();
    permissionState = requested.granted ? "granted" : "denied";
    return requested.granted;
  } catch {
    permissionState = "denied";
    return false;
  }
}

// War Mode copy bank. Harsh, no-excuses push energy, but no profanity or
// user-directed insults so App Review / Play Store can't flag or throttle us.
const DAY_BEFORE_TEMPLATES_WITH_CREATOR = [
  "{creator}'s {title} is tomorrow. Pack your gear.",
  "Tomorrow is {title}. {creator} set the plan. You show up.",
  "Heads up: {creator}'s {title} is on deck tomorrow.",
  "No surprise excuses tomorrow. {creator}'s {title} is scheduled.",
  "Tomorrow's work: {creator}'s {title}. Hydrate tonight.",
];

const DAY_BEFORE_TEMPLATES_NO_CREATOR = [
  "{title} is tomorrow. Pack your gear.",
  "Tomorrow is {title}. Set the alarm.",
  "Heads up: {title} is on deck tomorrow.",
  "No surprise excuses tomorrow. {title} is scheduled.",
  "Tomorrow's work: {title}. Hydrate tonight.",
  "You scheduled {title} for tomorrow. Honor it.",
];

const DAY_OF_TEMPLATES_WITH_CREATOR = [
  "Today is {creator}'s {title}. Lock in.",
  "{creator}'s {title} is today. Show up.",
  "No snooze. {creator}'s {title} is on the calendar today.",
  "War mode: on. {creator}'s {title} goes down today.",
  "Phone down. {creator}'s {title} is today's work.",
];

const DAY_OF_TEMPLATES_NO_CREATOR = [
  "Today is {title}. Lock in.",
  "{title} is today. Show up.",
  "No snooze. {title} is on the calendar today.",
  "War mode: on. {title} goes down today.",
  "Phone down. {title} is today's work.",
  "Discipline check. {title} is today.",
];

// Creator-specific banks. Match is case-insensitive and substring-based so
// @nunosfitness, @nuno.builds, etc. all route into the right bank.
const NUNO_LINES = [
  "Nuno's {title} is today. Go build it.",
  "Nuno didn't build that back skipping days. {title} is today.",
  "Nuno's on the calendar today. {title}. Go.",
  "Back builder time. Nuno's {title} is today.",
  "Nuno dropped the reel. You signed up. {title} is today.",
];

const NUNO_TITLES = ["Nuno's calling.", "Back day's up.", "Nuno time."];

const REMINDER_TITLES = [
  "Lock in.",
  "No excuses.",
  "War mode.",
  "Move.",
  "Fitfo says show up.",
];

const DAY_BEFORE_TITLES = [
  "Tomorrow's workout.",
  "Get ready.",
  "You're on tomorrow.",
  "Prep tonight.",
];

function pickCreatorBank(creatorHandle: string | null): {
  body: readonly string[];
  title: readonly string[];
} | null {
  if (!creatorHandle) {
    return null;
  }
  const normalized = creatorHandle.replace(/^@/, "").toLowerCase();
  if (normalized.includes("nuno")) {
    return { body: NUNO_LINES, title: NUNO_TITLES };
  }
  return null;
}

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function applyTemplate(
  template: string,
  values: { creator: string | null; title: string },
): string {
  return template
    .replaceAll("{creator}", values.creator ?? "")
    .replaceAll("{title}", values.title);
}

type ReminderKind = "dayBefore" | "dayOf";

function buildReminderCopy(
  routine: ScheduledWorkoutRecord,
  kind: ReminderKind,
): {
  title: string;
  body: string;
} {
  const creator = getCreatorDisplayLabel(routine.source_url, routine.title);
  const cleanTitle = routine.title.trim() || "workout";
  // Prefer persona-specific copy for Nuno / Jacob so the reminder feels like
  // the actual creator is poking you on workout day.
  const personaBank = pickCreatorBank(creator);
  if (kind === "dayOf" && personaBank) {
    const body = applyTemplate(pickRandom(personaBank.body), {
      creator,
      title: cleanTitle,
    });
    const title = pickRandom(personaBank.title);
    return { title, body };
  }

  const pool =
    kind === "dayBefore"
      ? creator
        ? DAY_BEFORE_TEMPLATES_WITH_CREATOR
        : DAY_BEFORE_TEMPLATES_NO_CREATOR
      : creator
        ? DAY_OF_TEMPLATES_WITH_CREATOR
        : DAY_OF_TEMPLATES_NO_CREATOR;
  const body = applyTemplate(pickRandom(pool), { creator, title: cleanTitle });
  const title = pickRandom(
    kind === "dayBefore" ? DAY_BEFORE_TITLES : REMINDER_TITLES,
  );
  return { title, body };
}

/**
 * Parse a YYYY-MM-DD date string into the local reminder timestamps around
 * that workout date. Any timestamp already in the past is skipped.
 */
function resolveReminderClock(
  scheduledTimeMinutes: number | null | undefined,
): { hour: number; minute: number } {
  if (
    typeof scheduledTimeMinutes === "number" &&
    Number.isInteger(scheduledTimeMinutes) &&
    scheduledTimeMinutes >= 0 &&
    scheduledTimeMinutes <= 1439
  ) {
    return {
      hour: Math.floor(scheduledTimeMinutes / 60),
      minute: scheduledTimeMinutes % 60,
    };
  }
  return { hour: DAY_OF_REMINDER_HOUR_24H, minute: 0 };
}

function buildReminderDates(
  scheduledFor: string,
  scheduledTimeMinutes?: number | null,
): Array<{ kind: ReminderKind; fireAt: Date }> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledFor.trim());
  if (!match) {
    return [];
  }
  const [, year, month, day] = match;
  const scheduledDate = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    0,
    0,
    0,
    0,
  );

  const { hour, minute } = resolveReminderClock(scheduledTimeMinutes);

  const dayBefore = new Date(scheduledDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  if (typeof scheduledTimeMinutes === "number") {
    dayBefore.setHours(hour, minute, 0, 0);
  } else {
    dayBefore.setHours(DAY_BEFORE_REMINDER_HOUR_24H, 0, 0, 0);
  }

  const dayOf = new Date(scheduledDate);
  dayOf.setHours(hour, minute, 0, 0);

  const now = Date.now();
  return [
    { kind: "dayBefore" as const, fireAt: dayBefore },
    { kind: "dayOf" as const, fireAt: dayOf },
  ].filter(({ fireAt }) => fireAt.getTime() > now);
}

/**
 * Schedule local notifications for a newly created scheduled workout. Safe
 * to call even if permission is denied; we return null and skip silently.
 */
export async function scheduleWorkoutReminder(
  routine: ScheduledWorkoutRecord,
): Promise<string[] | null> {
  const reminders = buildReminderDates(
    routine.scheduled_for,
    routine.scheduled_time_minutes,
  );
  if (reminders.length === 0) {
    return null;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return null;
  }

  const notificationIds: string[] = [];

  try {
    await cancelWorkoutReminder(routine.id);

    for (const reminder of reminders) {
      const copy = buildReminderCopy(routine, reminder.kind);
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          sound: "default",
          data: { scheduledWorkoutId: routine.id, reminderKind: reminder.kind },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.fireAt,
        },
      });
      notificationIds.push(notificationId);
    }

    const map = await readNotificationMap();
    map[routine.id] = notificationIds;
    await writeNotificationMap(map);

    return notificationIds;
  } catch {
    for (const notificationId of notificationIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch {
        // ignore cleanup failure
      }
    }
    return null;
  }
}

export async function cancelWorkoutReminder(
  scheduledWorkoutId: string,
): Promise<void> {
  const map = await readNotificationMap();
  const notificationIds = map[scheduledWorkoutId];
  if (!notificationIds) {
    return;
  }
  for (const notificationId of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // best-effort — the notification may have already fired or been cancelled
    }
  }
  delete map[scheduledWorkoutId];
  await writeNotificationMap(map);
}

/**
 * Drop any notification IDs from local storage whose scheduled_workout no
 * longer exists on the backend. Called once after the schedule list loads
 * so we don't leak cancelled schedule → orphaned notification pairs.
 */
export async function reconcileScheduledNotifications(
  currentScheduledWorkoutIds: readonly string[],
): Promise<void> {
  const map = await readNotificationMap();
  const alive = new Set(currentScheduledWorkoutIds);
  const stale = Object.keys(map).filter((id) => !alive.has(id));
  if (stale.length === 0) {
    return;
  }
  for (const id of stale) {
    const notificationIds = map[id];
    for (const notificationId of notificationIds ?? []) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch {
        // ignore
      }
    }
    delete map[id];
  }
  await writeNotificationMap(map);
}

const GYM_NUDGE_NOTIFICATION_ID_KEY = "@fitfo:gym-schedule-nudge-notification-id";

/** 24-hour ping when nothing is on the training calendar after a meaningful action. */
const NEXT_WORKOUT_NUDGE_DELAY_MS = 24 * 60 * 60 * 1000;

export const GYM_SCHEDULE_NUDGE_NOTIFICATION_KIND = "gym-schedule-nudge";

export type NextWorkoutNudgeReason =
  | "saved_workout"
  | "completed_workout"
  | "calendar_empty";

function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeScheduleYmd(scheduled_for: string): string {
  const trimmed = scheduled_for.trim();
  const match = /^(\d{4}-\d{2}-\d{2})/u.exec(trimmed);
  return match ? match[1] : trimmed.slice(0, 10);
}

function hasUpcomingScheduledWorkoutOnCalendar(
  rows: readonly ScheduledWorkoutRecord[],
): boolean {
  const today = localTodayYmd();
  return rows.some(
    (r) =>
      r.status === "scheduled" &&
      typeof r.scheduled_for === "string" &&
      normalizeScheduleYmd(r.scheduled_for) >= today,
  );
}

function computeNextGymNudgeFireDate(nowMs = Date.now()): Date {
  return new Date(nowMs + NEXT_WORKOUT_NUDGE_DELAY_MS);
}

function cleanNudgeWorkoutTitle(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  return trimmed.length > 0 ? trimmed : "that workout";
}

function buildNextWorkoutNudgeCopy(args: {
  reason: NextWorkoutNudgeReason;
  workoutTitle?: string | null;
}): { title: string; body: string } {
  if (args.reason === "saved_workout") {
    const title = cleanNudgeWorkoutTitle(args.workoutTitle);
    return {
      title: "Schedule your next lift.",
      body: `You saved ${title}. Put it on the calendar for your next lift.`,
    };
  }

  if (args.reason === "completed_workout") {
    return {
      title: "Keep the streak alive.",
      body: "Nice work. Schedule this workout again or import a new one for your next lift.",
    };
  }

  return {
    title: "Time to go to the gym",
    body: "You don’t have a workout scheduled. Open Fitfo and plan your next session.",
  };
}

async function readGymNudgeNotificationId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(GYM_NUDGE_NOTIFICATION_ID_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    return null;
  }
}

async function writeGymNudgeNotificationId(id: string | null): Promise<void> {
  try {
    if (id) {
      await AsyncStorage.setItem(GYM_NUDGE_NOTIFICATION_ID_KEY, id);
    } else {
      await AsyncStorage.removeItem(GYM_NUDGE_NOTIFICATION_ID_KEY);
    }
  } catch {
    // ignore
  }
}

/** Drops the repeating “schedule a workout” ping (e.g. on logout). */
export async function cancelGymScheduleNudge(): Promise<void> {
  const id = await readGymNudgeNotificationId();
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // already fired or cancelled
    }
  }
  await writeGymNudgeNotificationId(null);
}

/**
 * Keeps a single local notification 24 hours out when the user has no upcoming
 * scheduled workout (today or later). Contextual actions replace the generic
 * nudge so "saved workout" / "finished workout" copy is what the user sees.
 */
export async function scheduleNextWorkoutNudgeIfNeeded(args: {
  rows: readonly ScheduledWorkoutRecord[];
  reason: NextWorkoutNudgeReason;
  workoutTitle?: string | null;
  requestPermission?: boolean;
}): Promise<void> {
  try {
    if (hasUpcomingScheduledWorkoutOnCalendar(args.rows)) {
      await cancelGymScheduleNudge();
      return;
    }

    const granted = args.requestPermission
      ? await requestNotificationPermission()
      : (await Notifications.getPermissionsAsync()).granted;
    if (!granted) {
      await cancelGymScheduleNudge();
      return;
    }

    await ensureReminderNotificationChannel();

    const existingId = await readGymNudgeNotificationId();
    if (existingId && args.reason === "calendar_empty") {
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      if (pending.some((n) => n.identifier === existingId)) {
        return;
      }
    }

    await cancelGymScheduleNudge();

    const fireAt = computeNextGymNudgeFireDate();
    const copy = buildNextWorkoutNudgeCopy(args);
    const newId = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: "default",
        data: {
          kind: GYM_SCHEDULE_NUDGE_NOTIFICATION_KIND,
          reason: args.reason,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
    await writeGymNudgeNotificationId(newId);
  } catch {
    // Non-fatal: scheduling APIs can fail on simulators / permission edge cases.
  }
}

/**
 * Backward-compatible generic sync used on app resume / schedule list load.
 * It only fills in a missing nudge; contextual save/complete nudges replace it.
 */
export async function syncGymScheduleNudgeIfNeeded(
  rows: readonly ScheduledWorkoutRecord[],
): Promise<void> {
  await scheduleNextWorkoutNudgeIfNeeded({
    rows,
    reason: "calendar_empty",
  });
}

/**
 * Wire up how the app handles an incoming notification while in the
 * foreground. Called once at module load so reminders show a banner/sound
 * instead of getting silently swallowed.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Import-ready notifications ────────────────────────────────────────────
// Fired when a long-running ingestion job finishes while the user is no
// longer staring at the AddWorkoutModal. Reuses the same permission flow as
// scheduled-workout reminders.

export const INGESTION_READY_NOTIFICATION_KIND = "ingestion-ready";
// Lifecycle pushes from the server. App.tsx routes the pre-charge tap into
// the RC Customer Center; the converted push is informational only.
export const TRIAL_PRE_CHARGE_NOTIFICATION_KIND = "trial-pre-charge-48h";
export const TRIAL_CONVERTED_NOTIFICATION_KIND = "trial-converted";

export interface NotifyWorkoutReadyArgs {
  title: string;
  creatorHandle: string | null;
  jobId: string;
}

export async function notifyWorkoutReady(
  args: NotifyWorkoutReadyArgs,
): Promise<string | null> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    return null;
  }

  const cleanTitle = args.title.trim() || "Your workout";
  const body = args.creatorHandle
    ? `${args.creatorHandle}'s ${cleanTitle} is built. Tap to schedule or save it.`
    : `${cleanTitle} is built. Tap to schedule or save it.`;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your workout's ready.",
        body,
        sound: "default",
        data: { kind: INGESTION_READY_NOTIFICATION_KIND, jobId: args.jobId },
      },
      // Fire immediately — `null` trigger on expo-notifications schedules now.
      trigger: null,
    });
  } catch {
    return null;
  }
}

/**
 * Reads the user's "always notify me when an import is slow" preference.
 * Returns false on miss / parse error so the first long import still shows
 * the opt-in card.
 */
export async function getAutoNotifyImportsPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_NOTIFY_IMPORTS_STORAGE_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

export async function setAutoNotifyImportsPreference(
  value: boolean,
): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(AUTO_NOTIFY_IMPORTS_STORAGE_KEY, "true");
    } else {
      await AsyncStorage.removeItem(AUTO_NOTIFY_IMPORTS_STORAGE_KEY);
    }
  } catch {
    // Best-effort — failing to persist just means we'll re-ask next time.
  }
}

/**
 * Registers the Expo push token with the API (after notification permission).
 * Safe no-op on failure (simulator, missing EAS project id, etc.).
 */
export async function syncExpoPushTokenWithBackend(
  accessToken: string | null | undefined,
): Promise<void> {
  if (!accessToken?.trim()) {
    return;
  }
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      return;
    }
    const extra = Constants.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId =
      extra?.eas?.projectId ??
      (
        Constants as {
          easConfig?: { projectId?: string };
        }
      ).easConfig?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResult.data?.trim();
    if (!token) {
      return;
    }
    await registerExpoPushTokenApi(accessToken, token);
  } catch {
    // Missing projectId, Expo Go limitations, etc.
  }
}
