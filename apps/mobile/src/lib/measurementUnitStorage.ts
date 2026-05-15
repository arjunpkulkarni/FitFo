import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MeasurementUnitSystem } from "./measurementUnits";

const MEASUREMENT_UNIT_KEY = "@fitfo/measurement-unit";

export async function getStoredMeasurementUnit(): Promise<MeasurementUnitSystem | null> {
  const rawValue = await AsyncStorage.getItem(MEASUREMENT_UNIT_KEY);
  return rawValue === "metric" || rawValue === "imperial" ? rawValue : null;
}

export async function storeMeasurementUnit(system: MeasurementUnitSystem) {
  await AsyncStorage.setItem(MEASUREMENT_UNIT_KEY, system);
}
