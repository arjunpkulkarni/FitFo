import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  ScheduleTimePicker,
  useDefaultScheduleTimeMinutes,
} from "./ScheduleTimePicker";
import { formatScheduleDateAndTime } from "../lib/scheduleTime";
import { getTheme, type ThemeMode } from "../theme";

interface ScheduleAgainModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  isScheduling?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (scheduledFor: string, scheduledTimeMinutes: number) => void;
  themeMode?: ThemeMode;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildUpcomingDates(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = new Date(today);
    next.setDate(today.getDate() + index);
    days.push(next);
  }
  return days;
}

function formatReadableDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reference = new Date(date);
  reference.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (reference.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  return `${DAY_LABELS[reference.getDay()]}, ${MONTH_LABELS[reference.getMonth()]} ${reference.getDate()}`;
}

export function ScheduleAgainModal({
  visible,
  title,
  subtitle,
  isScheduling = false,
  error,
  onClose,
  onConfirm,
  themeMode = "light",
}: ScheduleAgainModalProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const upcomingDates = useMemo(() => buildUpcomingDates(14), []);
  const defaultDateIso = upcomingDates[0] ? toIsoDate(upcomingDates[0]) : null;
  const defaultScheduleTimeMinutes = useDefaultScheduleTimeMinutes();
  const [selectedDate, setSelectedDate] = useState<string | null>(defaultDateIso);
  const [scheduledTimeMinutes, setScheduledTimeMinutes] = useState(
    defaultScheduleTimeMinutes,
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedDate(defaultDateIso);
    setScheduledTimeMinutes(defaultScheduleTimeMinutes);
  }, [defaultDateIso, defaultScheduleTimeMinutes, visible]);

  const readableSelectedDate = useMemo(() => {
    if (!selectedDate) {
      return "Pick a date";
    }
    const match = upcomingDates.find((date) => toIsoDate(date) === selectedDate);
    if (!match) {
      return selectedDate;
    }
    return formatReadableDate(match);
  }, [selectedDate, upcomingDates]);

  const scheduleConfirmLabel = useMemo(() => {
    if (!selectedDate) {
      return "Schedule workout";
    }
    return `Schedule for ${formatScheduleDateAndTime(
      selectedDate,
      scheduledTimeMinutes,
    )}`;
  }, [selectedDate, scheduledTimeMinutes]);

  const handleConfirm = () => {
    if (!selectedDate || isScheduling) {
      return;
    }
    onConfirm(selectedDate, scheduledTimeMinutes);
  };

  return (
    <Modal
      animationType="fade"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            disabled={isScheduling}
            hitSlop={8}
          >
            <Ionicons color={theme.colors.textMuted} name="close" size={20} />
          </Pressable>

          <View style={styles.headerIcon}>
            <Ionicons
              color={theme.colors.primary}
              name="calendar-outline"
              size={22}
            />
          </View>

          <Text style={styles.eyebrow}>Schedule again</Text>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.schedulerBlock}>
            <View style={styles.schedulerHeader}>
              <Text style={styles.schedulerEyebrow}>Pick a day</Text>
              <Text style={styles.schedulerSelectedText}>
                {readableSelectedDate}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayStripContent}
            >
              {upcomingDates.map((date) => {
                const iso = toIsoDate(date);
                const isSelected = selectedDate === iso;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => setSelectedDate(iso)}
                    style={[
                      styles.dayPill,
                      isSelected ? styles.dayPillSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayPillLabel,
                        isSelected ? styles.dayPillLabelSelected : null,
                      ]}
                    >
                      {DAY_LABELS[date.getDay()].toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.dayPillNumber,
                        isSelected ? styles.dayPillNumberSelected : null,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    <Text
                      style={[
                        styles.dayPillMonth,
                        isSelected ? styles.dayPillMonthSelected : null,
                      ]}
                    >
                      {MONTH_LABELS[date.getMonth()]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScheduleTimePicker
              value={scheduledTimeMinutes}
              onChange={setScheduledTimeMinutes}
              themeMode={themeMode}
            />

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={!selectedDate || isScheduling}
              onPress={handleConfirm}
              style={[
                styles.primaryButton,
                !selectedDate || isScheduling
                  ? styles.primaryButtonDisabled
                  : null,
              ]}
            >
              {isScheduling ? (
                <View style={styles.buttonRow}>
                  <ActivityIndicator color={theme.colors.surface} size="small" />
                  <Text style={styles.primaryButtonText}>Scheduling...</Text>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <Ionicons
                    color={theme.colors.surface}
                    name="calendar"
                    size={16}
                  />
                  <Text style={styles.primaryButtonText}>
                    {scheduleConfirmLabel}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              disabled={isScheduling}
              onPress={onClose}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.overlay,
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      padding: 22,
      gap: 10,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    closeButton: {
      position: "absolute",
      top: 16,
      right: 16,
      zIndex: 2,
      height: 32,
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIcon: {
      height: 44,
      width: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
      marginBottom: 6,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 26,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    schedulerBlock: {
      marginTop: 12,
      gap: 12,
    },
    schedulerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    schedulerEyebrow: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    schedulerSelectedText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    dayStripContent: {
      gap: 8,
      paddingVertical: 4,
      paddingRight: 8,
    },
    dayPill: {
      minWidth: 62,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    dayPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    dayPillLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    dayPillLabelSelected: {
      color: theme.colors.surface,
    },
    dayPillNumber: {
      marginTop: 2,
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    dayPillNumberSelected: {
      color: theme.colors.surface,
    },
    dayPillMonth: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    dayPillMonthSelected: {
      color: theme.colors.surface,
    },
    errorCard: {
      borderRadius: 18,
      backgroundColor: theme.colors.errorSoft,
      padding: 14,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.primary,
    },
    primaryButtonDisabled: {
      opacity: 0.55,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    cancelButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
    },
    cancelButtonText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
  });
