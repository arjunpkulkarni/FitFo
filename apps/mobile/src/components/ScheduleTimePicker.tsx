import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  DEFAULT_SCHEDULE_TIME_MINUTES,
  formatScheduleTimeMinutes,
  minutesFrom12h,
  presetIdForMinutes,
  SCHEDULE_TIME_PRESETS,
  snapCustomMinute,
  splitMinutesTo12h,
  type ScheduleTimePresetId,
} from "../lib/scheduleTime";
import { getTheme, type ThemeMode } from "../theme";

interface ScheduleTimePickerProps {
  value: number;
  onChange: (minutes: number) => void;
  themeMode?: ThemeMode;
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const CUSTOM_MINUTES = [0, 15, 30, 45] as const;

export function ScheduleTimePicker({
  value,
  onChange,
  themeMode = "light",
}: ScheduleTimePickerProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const [mode, setMode] = useState<ScheduleTimePresetId>(() =>
    presetIdForMinutes(value),
  );
  const customParts = useMemo(() => splitMinutesTo12h(value), [value]);

  const selectPreset = (minutes: number, presetId: ScheduleTimePresetId) => {
    setMode(presetId);
    onChange(minutes);
  };

  const selectCustom = () => {
    setMode("custom");
    onChange(
      minutesFrom12h(
        customParts.hour12,
        snapCustomMinute(customParts.minute),
        customParts.period,
      ),
    );
  };

  const updateCustom = (
    patch: Partial<{
      hour12: number;
      minute: number;
      period: "AM" | "PM";
    }>,
  ) => {
    const next = {
      hour12: patch.hour12 ?? customParts.hour12,
      minute: patch.minute ?? customParts.minute,
      period: patch.period ?? customParts.period,
    };
    onChange(
      minutesFrom12h(
        next.hour12,
        snapCustomMinute(next.minute),
        next.period,
      ),
    );
  };

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Pick a time</Text>
        <Text style={styles.selected}>{formatScheduleTimeMinutes(value)}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetStrip}
      >
        {SCHEDULE_TIME_PRESETS.map((preset) => {
          const isSelected = mode === preset.id;
          return (
            <Pressable
              key={preset.id}
              onPress={() => selectPreset(preset.minutes, preset.id)}
              style={[styles.presetPill, isSelected ? styles.presetPillSelected : null]}
            >
              <Text
                style={[
                  styles.presetLabel,
                  isSelected ? styles.presetLabelSelected : null,
                ]}
              >
                {preset.label}
              </Text>
              <Text
                style={[
                  styles.presetSublabel,
                  isSelected ? styles.presetSublabelSelected : null,
                ]}
              >
                {preset.sublabel}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={selectCustom}
          style={[styles.presetPill, mode === "custom" ? styles.presetPillSelected : null]}
        >
          <Text
            style={[
              styles.presetLabel,
              mode === "custom" ? styles.presetLabelSelected : null,
            ]}
          >
            Custom
          </Text>
          <Text
            style={[
              styles.presetSublabel,
              mode === "custom" ? styles.presetSublabelSelected : null,
            ]}
          >
            {mode === "custom"
              ? formatScheduleTimeMinutes(value)
              : "Set time"}
          </Text>
        </Pressable>
      </ScrollView>

      {mode === "custom" ? (
        <View style={styles.customBlock}>
          <Text style={styles.customLabel}>Hour</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.customStrip}
          >
            {HOURS_12.map((hour) => {
              const isSelected = customParts.hour12 === hour;
              return (
                <Pressable
                  key={hour}
                  onPress={() => updateCustom({ hour12: hour })}
                  style={[
                    styles.customPill,
                    isSelected ? styles.customPillSelected : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.customPillText,
                      isSelected ? styles.customPillTextSelected : null,
                    ]}
                  >
                    {hour}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.customLabel}>Minute</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.customStrip}
          >
            {CUSTOM_MINUTES.map((minute) => {
              const isSelected = customParts.minute === minute;
              return (
                <Pressable
                  key={minute}
                  onPress={() => updateCustom({ minute })}
                  style={[
                    styles.customPill,
                    isSelected ? styles.customPillSelected : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.customPillText,
                      isSelected ? styles.customPillTextSelected : null,
                    ]}
                  >
                    {String(minute).padStart(2, "0")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.periodRow}>
            {(["AM", "PM"] as const).map((period) => {
              const isSelected = customParts.period === period;
              return (
                <Pressable
                  key={period}
                  onPress={() => updateCustom({ period })}
                  style={[
                    styles.periodPill,
                    isSelected ? styles.periodPillSelected : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodPillText,
                      isSelected ? styles.periodPillTextSelected : null,
                    ]}
                  >
                    {period}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function useDefaultScheduleTimeMinutes(): number {
  return DEFAULT_SCHEDULE_TIME_MINUTES;
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    block: {
      gap: 10,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    eyebrow: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    selected: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    presetStrip: {
      gap: 8,
      paddingVertical: 2,
      paddingRight: 8,
    },
    presetPill: {
      minWidth: 88,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    presetPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    presetLabel: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    presetLabelSelected: {
      color: theme.colors.surface,
    },
    presetSublabel: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    presetSublabelSelected: {
      color: theme.colors.surface,
      opacity: 0.9,
    },
    customBlock: {
      gap: 8,
      marginTop: 2,
    },
    customLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    customStrip: {
      gap: 6,
      paddingRight: 8,
    },
    customPill: {
      minWidth: 44,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    customPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    customPillText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    customPillTextSelected: {
      color: theme.colors.surface,
    },
    periodRow: {
      flexDirection: "row",
      gap: 8,
    },
    periodPill: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    periodPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    periodPillText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    periodPillTextSelected: {
      color: theme.colors.surface,
    },
  });
