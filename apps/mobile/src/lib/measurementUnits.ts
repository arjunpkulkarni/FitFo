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

export function formatMetricNumber(value: number, maxDecimals = 2): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
