/** Default morning slot when the user does not pick a custom time. */
export const DEFAULT_SCHEDULE_TIME_MINUTES = 7 * 60;

export type ScheduleTimePresetId = "morning" | "afternoon" | "evening" | "custom";

export interface ScheduleTimePreset {
  id: Exclude<ScheduleTimePresetId, "custom">;
  label: string;
  minutes: number;
  sublabel: string;
}

export const SCHEDULE_TIME_PRESETS: readonly ScheduleTimePreset[] = [
  { id: "morning", label: "Morning", minutes: 7 * 60, sublabel: "7:00 AM" },
  { id: "afternoon", label: "Afternoon", minutes: 12 * 60, sublabel: "12:00 PM" },
  { id: "evening", label: "Evening", minutes: 18 * 60, sublabel: "6:00 PM" },
] as const;

const CUSTOM_MINUTE_STEPS = [0, 15, 30, 45] as const;

export function isValidScheduleTimeMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1439;
}

export function presetIdForMinutes(minutes: number): ScheduleTimePresetId {
  const match = SCHEDULE_TIME_PRESETS.find((preset) => preset.minutes === minutes);
  return match?.id ?? "custom";
}

export function minutesFrom12h(
  hour12: number,
  minute: number,
  period: "AM" | "PM",
): number {
  const hour = Math.min(12, Math.max(1, hour12));
  const mins = Math.min(59, Math.max(0, minute));
  let hour24 = hour % 12;
  if (period === "PM") {
    hour24 += 12;
  }
  return hour24 * 60 + mins;
}

export function splitMinutesTo12h(minutes: number): {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
} {
  const clamped = Math.max(0, Math.min(1439, minutes));
  const hour24 = Math.floor(clamped / 60);
  const minute = clamped % 60;
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

export function snapCustomMinute(minute: number): number {
  let closest: number = CUSTOM_MINUTE_STEPS[0];
  let smallestDelta = Math.abs(minute - closest);
  for (const step of CUSTOM_MINUTE_STEPS) {
    const delta = Math.abs(minute - step);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = step;
    }
  }
  return closest;
}

export function formatScheduleTimeMinutes(minutes: number): string {
  const { hour12, minute, period } = splitMinutesTo12h(minutes);
  const minuteLabel = String(minute).padStart(2, "0");
  return `${hour12}:${minuteLabel} ${period}`;
}

export function formatScheduleDateAndTime(
  scheduledFor: string,
  scheduledTimeMinutes: number,
): string {
  const dateLabel = formatScheduleDateLabel(scheduledFor);
  const timeLabel = formatScheduleTimeMinutes(scheduledTimeMinutes);
  return `${dateLabel} at ${timeLabel}`;
}

export function formatScheduleDateLabel(scheduledFor: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledFor.trim());
  if (!match) {
    return scheduledFor;
  }
  const [, year, month, day] = match;
  const reference = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    0,
    0,
    0,
    0,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (reference.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  return reference.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
