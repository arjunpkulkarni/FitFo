export type MeasurementUnitSystem = "imperial" | "metric";

const LBS_PER_KG = 2.2046226218;
const INCHES_PER_METER = 39.3700787402;

export function kgToLbs(kg: number): number {
  return kg * LBS_PER_KG;
}

export function lbsToKg(lbs: number): number {
  return lbs / LBS_PER_KG;
}

export function metersToInches(meters: number): number {
  return meters * INCHES_PER_METER;
}

export function inchesToMeters(inches: number): number {
  return inches / INCHES_PER_METER;
}

export function cmToInches(centimeters: number): number {
  return metersToInches(centimeters / 100);
}

export function inchesToCm(inches: number): number {
  return inchesToMeters(inches) * 100;
}

export function feetInchesToTotalInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

export function totalInchesToFeetInches(totalInches: number): {
  feet: number;
  inches: number;
} {
  const safeTotal = Math.max(0, Math.round(totalInches));
  const feet = Math.floor(safeTotal / 12);
  const inches = safeTotal % 12;
  return { feet, inches };
}

/** Whole-year age from a calendar birth date (local timezone). */
export function computeAgeFromBirthDate(
  year: number,
  month: number,
  day: number,
): number | null {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    year < 1900
  ) {
    return null;
  }
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }
  const today = new Date();
  if (birth > today) {
    return null;
  }
  let age = today.getFullYear() - year;
  const hadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

export function formatBirthDateIso(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatMetricNumber(value: number, maxDecimals = 2): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
