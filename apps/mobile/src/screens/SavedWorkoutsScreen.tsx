import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  LayoutAnimation,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import {
  BRAND_ORANGE,
  FeedbackCard,
  WorkoutCard,
  getBrandAccent,
} from "../components/WorkoutCard";
import {
  formatCompletedWorkoutDate,
  getRoutineDisplayTitle,
} from "../lib/fitfo";
import { formatScheduleTimeMinutes } from "../lib/scheduleTime";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import { getTheme, type ThemeMode } from "../theme";
import type {
  CompletedWorkoutRecord,
  SavedRoutinePreview,
} from "../types";

interface SavedWorkoutsScreenProps {
  completedWorkouts: CompletedWorkoutRecord[];
  completedWorkoutsError: string | null;
  completedWorkoutsLoading: boolean;
  importedWorkouts: SavedRoutinePreview[];
  isScheduleLoading: boolean;
  onAddWorkout: () => void;
  onOpenCompletedSession: (workout: CompletedWorkoutRecord) => void;
  onOpenSavedList: () => void;
  onOpenWorkout: (routine: SavedRoutinePreview) => void;
  onPullToRefresh?: () => void | Promise<void>;
  onRemoveWorkout: (savedWorkoutId: string) => void;
  onRetry: () => void;
  onScheduleWorkout: (routine: SavedRoutinePreview) => void;
  onRescheduleScheduledWorkout: (routine: SavedRoutinePreview) => void;
  onStartSession: (routine?: SavedRoutinePreview) => void;
  onUnschedule: (scheduledWorkoutId: string) => void;
  freeScheduleEndsAt?: Date | null;
  isFreePlan?: boolean;
  onRequireUpgrade?: (message: string) => void;
  scheduledError: string | null;
  scheduledWorkouts: SavedRoutinePreview[];
  onSavedWorkoutsCardMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  /** When true, re-measures the Saved Workouts bento for hub tour (layout already ran before the step existed). */
  tourSpotlightsSavedWorkoutsCard?: boolean;
  themeMode?: ThemeMode;
}

function openScheduledWorkoutMenu(
  routine: SavedRoutinePreview,
  onReschedule: (routine: SavedRoutinePreview) => void,
) {
  Alert.alert("Scheduled workout", routine.title, [
    {
      text: "Move to another day",
      onPress: () => onReschedule(routine),
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Long weekday for subtitles under Today / Tomorrow. */
const WEEKDAY_LABELS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
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

function normalizeScheduledDateKey(raw: string): string {
  // Backend should return `YYYY-MM-DD`, but we defensively accept full timestamps.
  // Using a date key (vs Date parsing) avoids timezone quirks and keeps grouping consistent.
  if (raw.length >= 10) {
    return raw.slice(0, 10);
  }
  return raw;
}

const CALENDAR_PAGE_SIZE = 5;
/** First paint: show yesterday onward. Pagination can move farther back via `MIN_…`. */
const INITIAL_CALENDAR_START_OFFSET = -1;
/** ~15 mo of backward paging (`calendarStartOffset` is consumed as day shift with `addDays`). */
const MIN_CALENDAR_START_OFFSET = -450;
const UPCOMING_PREVIEW_LIMIT = 4;

function addDays(date: Date, offset: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatReadableDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reference = new Date(date);
  reference.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (reference.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) {
    return "Today";
  }
  if (diff === 1) {
    return "Tomorrow";
  }
  return `${DAY_LABELS[reference.getDay()]}, ${MONTH_LABELS[reference.getMonth()]} ${reference.getDate()}`;
}

/** Full calendar line under headline (today / tomorrow / picked day). */
function formatCalendarSubtitle(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reference = new Date(date);
  reference.setHours(0, 0, 0, 0);
  const y = reference.getFullYear();
  const thisYear = today.getFullYear();
  const suffix = y !== thisYear ? `, ${y}` : "";
  const dayName = WEEKDAY_LABELS_LONG[reference.getDay()] ?? "";
  return `${dayName}, ${MONTH_LABELS[reference.getMonth()]} ${reference.getDate()}${suffix}`;
}

function SavedLibraryBento({
  onMeasured,
  onPress,
  theme,
  tourSpotlightsCard = false,
}: {
  onMeasured?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onPress: () => void;
  theme: ReturnType<typeof getTheme>;
  tourSpotlightsCard?: boolean;
}) {
  const styles = createStyles(theme);
  const accent = getBrandAccent(theme);
  const ref = useRef<View | null>(null);

  const reportMeasure = useCallback(() => {
    if (!onMeasured) {
      return;
    }
    ref.current?.measureInWindow?.((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        onMeasured(null);
        return;
      }
      onMeasured({ x, y, width, height });
    });
  }, [onMeasured]);

  useLayoutEffect(() => {
    if (!tourSpotlightsCard || !onMeasured) {
      return;
    }
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const frames: number[] = [];

    const measureAfterFrame = (delay: number) => {
      const timer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        const frame = requestAnimationFrame(() => {
          if (!cancelled) {
            reportMeasure();
          }
        });
        frames.push(frame);
      }, delay);
      timers.push(timer);
    };

    measureAfterFrame(0);
    measureAfterFrame(80);
    measureAfterFrame(220);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
    };
  }, [tourSpotlightsCard, onMeasured, reportMeasure]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open saved workouts library"
      collapsable={false}
      onPress={onPress}
      onLayout={() => {
        reportMeasure();
      }}
      ref={(node) => {
        ref.current = node;
      }}
      style={({ pressed }) => [
        styles.libraryBento,
        pressed ? styles.bentoPressed : null,
      ]}
    >
      <View style={[styles.libraryBentoIcon, { borderColor: accent }]}>
        <Ionicons color={accent} name="folder-open" size={18} />
      </View>
      <View style={styles.libraryBentoTextBlock}>
        <Text style={[styles.libraryBentoEyebrow, { color: accent }]}>
          Library
        </Text>
        <Text numberOfLines={1} style={styles.libraryBentoTitle}>
          Saved Workouts
        </Text>
        <Text numberOfLines={2} style={styles.libraryBentoBody}>
          Manage and schedule saved plans.
        </Text>
      </View>
      <View style={styles.libraryBentoArrow}>
        <Ionicons color="#FFFFFF" name="chevron-forward" size={14} />
      </View>
    </Pressable>
  );
}

function StatTile({
  caption,
  iconColor,
  iconName,
  isMaterial = false,
  label,
  theme,
  value,
}: {
  caption: string;
  iconColor: string;
  iconName: string;
  isMaterial?: boolean;
  label: string;
  theme: ReturnType<typeof getTheme>;
  value: string;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.statTile}>
      <View style={styles.statTileHeader}>
        <Text style={styles.statTileLabel}>{label}</Text>
        {isMaterial ? (
          <MaterialCommunityIcons
            color={iconColor}
            name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
            size={15}
          />
        ) : (
          <Ionicons
            color={iconColor}
            name={iconName as keyof typeof Ionicons.glyphMap}
            size={15}
          />
        )}
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileUnit}>
        {label === "Streak" ? "Days" : "Workouts"}
      </Text>
      <Text style={[styles.statTileCaption, { color: iconColor }]}>
        {caption}
      </Text>
    </View>
  );
}

function UpcomingWorkoutRow({
  onMore,
  onOpen,
  onStart,
  routine,
  theme,
}: {
  onMore: () => void;
  onOpen: () => void;
  onStart: () => void;
  routine: SavedRoutinePreview;
  theme: ReturnType<typeof getTheme>;
}) {
  const styles = createStyles(theme);
  const accent = getBrandAccent(theme);

  const scheduledDate = useMemo(() => {
    if (!routine.scheduledFor) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(routine.scheduledFor.trim());
    if (!match) {
      return null;
    }
    const [, year, month, day] = match;
    return new Date(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      0,
      0,
      0,
      0,
    );
  }, [routine.scheduledFor]);

  const dayLabel = scheduledDate
    ? DAY_LABELS[scheduledDate.getDay()].toUpperCase()
    : "-";
  const dayNumber = scheduledDate ? `${scheduledDate.getDate()}` : "-";
  const monthLabel = scheduledDate
    ? MONTH_LABELS[scheduledDate.getMonth()]
    : "";
  const timeLabel =
    typeof routine.scheduledTimeMinutes === "number"
      ? formatScheduleTimeMinutes(routine.scheduledTimeMinutes)
      : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open scheduled workout: ${routine.title}`}
      style={({ pressed }) => [
        styles.upcomingRow,
        pressed ? styles.upcomingRowPressed : null,
      ]}
    >
      <View style={styles.upcomingDatePill}>
        <Text style={styles.upcomingDateLabel}>{dayLabel}</Text>
        <Text style={styles.upcomingDateNumber}>{dayNumber}</Text>
        <Text style={styles.upcomingDateMonth}>{monthLabel}</Text>
      </View>
      <View style={styles.upcomingContent}>
        <Text numberOfLines={1} style={styles.upcomingTitle}>
          {routine.title}
        </Text>
        <View style={styles.upcomingMetaRow}>
          <Text style={styles.upcomingMetaText}>{routine.metaLeft}</Text>
          <View style={styles.upcomingMetaDot} />
          <Text style={styles.upcomingMetaText}>{routine.metaRight}</Text>
        </View>
        {timeLabel ? (
          <View style={styles.upcomingTimeRow}>
            <Ionicons
              color={theme.colors.textMuted}
              name="time-outline"
              size={12}
            />
            <Text style={styles.upcomingTimeText}>{timeLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.upcomingActionRow}>
        <Pressable
          onPress={onMore}
          hitSlop={6}
          style={({ pressed }) => [
            styles.upcomingMoreButton,
            pressed ? styles.bentoPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="More actions"
        >
          <Ionicons
            color={theme.colors.textMuted}
            name="ellipsis-horizontal"
            size={16}
          />
        </Pressable>
        <Pressable
          onPress={onStart}
          style={({ pressed }) => [
            styles.upcomingStartButton,
            { backgroundColor: accent },
            pressed ? styles.bentoPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Start ${routine.title}`}
        >
          <Text style={styles.upcomingStartButtonText}>Start Session</Text>
          <Ionicons color="#FFFFFF" name="chevron-forward" size={12} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export function SavedWorkoutsScreen({
  completedWorkouts,
  completedWorkoutsError,
  completedWorkoutsLoading,
  importedWorkouts,
  isScheduleLoading,
  onAddWorkout,
  onOpenCompletedSession,
  onOpenSavedList,
  onOpenWorkout,
  onPullToRefresh,
  onRemoveWorkout,
  onRetry,
  onScheduleWorkout,
  onRescheduleScheduledWorkout,
  onStartSession,
  onUnschedule,
  freeScheduleEndsAt = null,
  isFreePlan = false,
  onRequireUpgrade,
  onSavedWorkoutsCardMeasured,
  scheduledError,
  scheduledWorkouts,
  tourSpotlightsSavedWorkoutsCard = false,
  themeMode = "light",
}: SavedWorkoutsScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const accent = getBrandAccent(theme);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [scheduledSectionY, setScheduledSectionY] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const historyLoadBlocked =
    Boolean(completedWorkoutsError) && completedWorkouts.length === 0;
  const historyLoadingCold =
    completedWorkoutsLoading && completedWorkouts.length === 0;

  const todayIso = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return toIsoDate(today);
  }, []);
  const todayDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [calendarStartOffset, setCalendarStartOffset] = useState<number>(
    INITIAL_CALENDAR_START_OFFSET,
  );

  useEffect(() => {
    if (Platform.OS === "android") {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const handlePullToRefresh = () => {
    if (!onPullToRefresh || pullRefreshing) {
      return;
    }
    setPullRefreshing(true);
    void Promise.resolve(onPullToRefresh()).finally(() => {
      setPullRefreshing(false);
    });
  };

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, SavedRoutinePreview[]>();
    for (const routine of scheduledWorkouts) {
      const key = routine.scheduledFor
        ? normalizeScheduledDateKey(routine.scheduledFor)
        : null;
      if (!key) {
        continue;
      }
      const existing = map.get(key) || [];
      existing.push(routine);
      map.set(key, existing);
    }
    return map;
  }, [scheduledWorkouts]);

  const completedByDate = useMemo(() => {
    const map = new Map<string, CompletedWorkoutRecord[]>();
    for (const workout of completedWorkouts) {
      const completedAtMs = new Date(workout.completed_at).getTime();
      if (!Number.isFinite(completedAtMs)) {
        continue;
      }
      const key = toIsoDate(new Date(completedAtMs));
      const list = map.get(key) || [];
      list.push(workout);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        return (
          new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        );
      });
    }
    return map;
  }, [completedWorkouts]);

  const visibleCalendarDays = useMemo(() => {
    return Array.from({ length: CALENDAR_PAGE_SIZE }, (_, index) =>
      addDays(todayDate, calendarStartOffset + index),
    );
  }, [calendarStartOffset, todayDate]);

  const selectedDateObject = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }, [selectedDate]);
  const scheduledForSelected = scheduledByDate.get(selectedDate) || [];
  const completedForSelected = completedByDate.get(selectedDate) || [];
  const selectionHasPlans = scheduledForSelected.length > 0;
  const selectionHasLogs = completedForSelected.length > 0;

  const scheduleDayActionLabel =
    selectionHasPlans || selectionHasLogs
      ? "Add to this day"
      : "Schedule for this day";

  const upcomingAfterSelected = useMemo(() => {
    const sorted = [...scheduledWorkouts]
      .filter((routine) => routine.scheduledFor)
      .map((routine) => ({
        routine,
        key: normalizeScheduledDateKey(routine.scheduledFor || ""),
      }))
      // Only show items strictly after the selected day (never duplicate the selected day).
      .filter((entry) => entry.key > selectedDate)
      .sort((left, right) => left.key.localeCompare(right.key));
    return sorted.map((entry) => entry.routine);
  }, [scheduledWorkouts, selectedDate]);

  const upcomingWorkouts = useMemo(
    () => upcomingAfterSelected.slice(0, UPCOMING_PREVIEW_LIMIT),
    [upcomingAfterSelected],
  );
  const hasMoreUpcoming =
    upcomingAfterSelected.length > UPCOMING_PREVIEW_LIMIT;

  const canPageBackward = calendarStartOffset > MIN_CALENDAR_START_OFFSET;

  const shiftCalendarWindow = (direction: "backward" | "forward") => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCalendarStartOffset((currentOffset) => {
      const nextOffset =
        direction === "forward"
          ? currentOffset + CALENDAR_PAGE_SIZE
          : Math.max(
              MIN_CALENDAR_START_OFFSET,
              currentOffset - CALENDAR_PAGE_SIZE,
            );
      const nextSelectedDay = addDays(todayDate, nextOffset + 1);
      if (!canUseScheduleDate(nextSelectedDay)) {
        onRequireUpgrade?.(
          "You can only schedule workouts within this week on the free plan.",
        );
        return currentOffset;
      }
      const nextSelectedDate = toIsoDate(nextSelectedDay);
      setSelectedDate(nextSelectedDate);
      return nextOffset;
    });
  };

  const canUseScheduleDate = (day: Date) => {
    if (!isFreePlan || !freeScheduleEndsAt) {
      return true;
    }
    const normalized = new Date(day);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime() <= freeScheduleEndsAt.getTime();
  };

  const handleScheduledSectionLayout = (event: LayoutChangeEvent) => {
    setScheduledSectionY(event.nativeEvent.layout.y);
  };

  const scrollToScheduledWorkouts = () => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(scheduledSectionY - 12, 0),
      animated: true,
    });
  };

  return (
    <ScrollView
      refreshControl={
        onPullToRefresh ? (
          <RefreshControl
            colors={[accent]}
            onRefresh={handlePullToRefresh}
            refreshing={pullRefreshing}
            tintColor={accent}
          />
        ) : undefined
      }
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarScrollPad },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: accent }]}>YOUR HUB</Text>
          <Text style={styles.title}>Workouts</Text>
        </View>
      </View>

      <SavedLibraryBento
        onMeasured={onSavedWorkoutsCardMeasured}
        onPress={onOpenSavedList}
        theme={theme}
        tourSpotlightsCard={tourSpotlightsSavedWorkoutsCard}
      />

      {completedWorkoutsError ? (
        <FeedbackCard
          actionLabel="Try again"
          body={completedWorkoutsError}
          icon="alert-circle-outline"
          onAction={onRetry}
          theme={theme}
          title="Couldn't load workout history"
        />
      ) : null}

      <View style={styles.section} onLayout={handleScheduledSectionLayout}>
        <Text style={[styles.sectionEyebrow, { color: accent }]}>CALENDAR</Text>
        <Text style={styles.sectionTitle}>Scheduled Workouts</Text>
        

        <View style={styles.calendarPagerRow}>
          <Pressable
            accessibilityLabel="Show previous dates"
            disabled={!canPageBackward}
            onPress={() => shiftCalendarWindow("backward")}
            style={[
              styles.calendarArrowButton,
              !canPageBackward ? styles.calendarArrowButtonDisabled : null,
            ]}
          >
            <Ionicons
              color={
                canPageBackward
                  ? theme.colors.textPrimary
                  : theme.colors.textMuted
              }
              name="chevron-back"
              size={15}
            />
          </Pressable>

          {visibleCalendarDays.map((day) => {
            const iso = toIsoDate(day);
            const isSelected = selectedDate === iso;
            const hasWorkout =
              (scheduledByDate.get(iso) || []).length > 0 ||
              (completedByDate.get(iso) || []).length > 0;
            return (
              <Pressable
                key={iso}
                onPress={() => {
                  if (!canUseScheduleDate(day)) {
                    onRequireUpgrade?.(
                      "You can only schedule workouts within this week on the free plan.",
                    );
                    return;
                  }
                  setSelectedDate(iso);
                }}
                style={[
                  styles.calendarPill,
                  isSelected
                    ? { backgroundColor: accent, borderColor: accent }
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.calendarPillLabel,
                    isSelected ? styles.calendarPillLabelSelected : null,
                  ]}
                >
                  {DAY_LABELS[day.getDay()].toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.calendarPillNumber,
                    isSelected ? styles.calendarPillNumberSelected : null,
                  ]}
                >
                  {day.getDate()}
                </Text>
                <Text
                  style={[
                    styles.calendarPillMonth,
                    isSelected ? styles.calendarPillMonthSelected : null,
                  ]}
                >
                  {MONTH_LABELS[day.getMonth()]}
                </Text>
                {hasWorkout ? (
                  <View
                    style={[
                      styles.calendarPillDot,
                      { backgroundColor: accent },
                      isSelected ? styles.calendarPillDotSelected : null,
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}

          <Pressable
            accessibilityLabel="Show next dates"
            onPress={() => shiftCalendarWindow("forward")}
            style={styles.calendarArrowButton}
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="chevron-forward"
              size={15}
            />
          </Pressable>
        </View>

        <View style={styles.scheduledSubHeader}>
          <View style={styles.scheduledDateBlock}>
            <Text style={styles.calendarSelectedLabel}>
              {formatReadableDate(selectedDateObject)}
            </Text>
            <Text style={styles.calendarSelectedSubtitle}>
              {formatCalendarSubtitle(selectedDateObject)}
            </Text>
          </View>
          <Pressable
            onPress={onAddWorkout}
            style={({ pressed }) => [
              styles.scheduledChip,
              pressed ? styles.bentoPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${scheduleDayActionLabel} — opens workout flow`}
          >
            <Ionicons color="#FFFFFF" name="add" size={15} />
            <Text style={styles.scheduledChipText}>{scheduleDayActionLabel}</Text>
          </Pressable>
        </View>

        {isScheduleLoading ? (
          <FeedbackCard
            body="Loading your scheduled workouts."
            isLoading
            theme={theme}
            title="Loading schedule"
          />
        ) : scheduledError ? (
          <FeedbackCard
            actionLabel="Try Again"
            body={scheduledError}
            icon="alert-circle-outline"
            onAction={onRetry}
            theme={theme}
            title="Couldn't load your schedule"
          />
        ) : (
          <>
            {selectionHasLogs ? (
              <View style={styles.loggedSessionsBlock}>
                <Text style={[styles.sectionEyebrow, { color: accent }]}>
                  Logged
                </Text>
                <View style={styles.completedDayCardList}>
                  {completedForSelected.map((session) => {
                    const title = getRoutineDisplayTitle({
                      sourceUrl: session.source_url,
                      title: session.title,
                      workoutPlan: session.workout_plan,
                    });
                    return (
                      <Pressable
                        key={session.id}
                        accessibilityRole="button"
                        accessibilityLabel={`View completed workout: ${title}`}
                        onPress={() => onOpenCompletedSession(session)}
                        style={styles.loggedSessionCard}
                      >
                        <View
                          style={[
                            styles.loggedSessionIconWrap,
                            {
                              backgroundColor:
                                theme.mode === "dark"
                                  ? "rgba(49, 196, 141, 0.18)"
                                  : "rgba(44, 182, 125, 0.14)",
                            },
                          ]}
                        >
                          <Ionicons
                            color={theme.colors.success}
                            name="checkmark"
                            size={16}
                          />
                        </View>
                        <View style={styles.loggedSessionCopy}>
                          <Text style={styles.loggedSessionTitle} numberOfLines={2}>
                            {title}
                          </Text>
                          <Text style={styles.loggedSessionMeta}>
                            {formatCompletedWorkoutDate(session.completed_at)}
                          </Text>
                        </View>
                        <Ionicons
                          color={theme.colors.textMuted}
                          name="chevron-forward"
                          size={18}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {selectionHasPlans ? (
              <>
                {selectionHasLogs ? (
                  <Text style={[styles.calendarScheduledEyebrow, { color: accent }]}>
                    Scheduled
                  </Text>
                ) : null}
                {scheduledForSelected.map((routine) => (
                  <WorkoutCard
                    key={routine.id}
                    accent="scheduled"
                    onOpen={() => onOpenWorkout(routine)}
                    onRemove={
                      routine.scheduledWorkoutId
                        ? () => onUnschedule(routine.scheduledWorkoutId || routine.id)
                        : undefined
                    }
                    onReschedule={
                      routine.scheduledWorkoutId
                        ? () =>
                            openScheduledWorkoutMenu(
                              routine,
                              onRescheduleScheduledWorkout,
                            )
                        : undefined
                    }
                    onStart={() => onStartSession(routine)}
                    removeLabel="Unschedule"
                    routine={routine}
                    theme={theme}
                  />
                ))}
              </>
            ) : null}

            {!selectionHasPlans && !selectionHasLogs ? (
              <View style={styles.scheduledEmptyCard}>
                <View style={styles.scheduledEmptyTopRow}>
                  <View
                    style={[
                      styles.scheduledEmptyIcon,
                      {
                        backgroundColor:
                          theme.mode === "dark"
                            ? "rgba(255, 111, 34, 0.14)"
                            : "rgba(71, 88, 240, 0.10)",
                      },
                    ]}
                  >
                    <Ionicons color={accent} name="calendar-outline" size={22} />
                  </View>
                  <View style={styles.scheduledEmptyTextBlock}>
                    <Text style={styles.scheduledEmptyTitle}>Nothing on this day</Text>
                    <Text style={styles.scheduledEmptyBody}>
                      Pull from your library, create something new, or pick another date
                      in the strip above.
                    </Text>
                  </View>
                  <View style={styles.scheduledEmptyDecor}>
                    <Ionicons
                      color={theme.colors.textMuted}
                      name="calendar"
                      size={56}
                      style={{ opacity: 0.2 }}
                    />
                  </View>
                </View>
                <View style={styles.scheduledEmptyActions}>
                  <Pressable
                    onPress={onOpenSavedList}
                    style={({ pressed }) => [
                      styles.scheduledEmptyCtaOutline,
                      {
                        borderColor:
                          theme.mode === "dark"
                            ? "rgba(255, 111, 34, 0.42)"
                            : "rgba(71, 88, 240, 0.35)",
                      },
                      pressed ? styles.bentoPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Browse saved workouts library"
                  >
                    <Ionicons color={accent} name="folder-open-outline" size={16} />
                    <Text
                      style={[styles.scheduledEmptyCtaOutlineText, { color: accent }]}
                    >
                      Browse library
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onAddWorkout}
                    style={({ pressed }) => [
                      styles.scheduledEmptyCtaFill,
                      { backgroundColor: accent },
                      pressed ? styles.bentoPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Create a new workout"
                  >
                    <Ionicons color="#FFFFFF" name="add" size={16} />
                    <Text style={styles.scheduledEmptyCtaFillText}>Create workout</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}

        {upcomingWorkouts.length > 0 ? (
          <>
            <View style={styles.scheduledSubHeader}>
              <Text style={styles.scheduledSubHeaderTitle}>Upcoming</Text>
              {hasMoreUpcoming ? (
                <Pressable
                  onPress={onAddWorkout}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.viewAllButton,
                    pressed ? styles.bentoPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="View all scheduled workouts"
                >
                  <Text style={[styles.viewAllButtonText, { color: accent }]}>
                    View all
                  </Text>
                  <Ionicons color={accent} name="chevron-forward" size={12} />
                </Pressable>
              ) : null}
            </View>
            {upcomingWorkouts.map((routine) => (
              <UpcomingWorkoutRow
                key={`upcoming-${routine.id}`}
                onMore={() =>
                  openScheduledWorkoutMenu(routine, onRescheduleScheduledWorkout)
                }
                onOpen={() => onOpenWorkout(routine)}
                onStart={() => onStartSession(routine)}
                routine={routine}
                theme={theme}
              />
            ))}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
      gap: 16,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 2,
      marginTop: 4,
      marginBottom: 4,
    },
    titleBlock: {
      gap: 8,
      flex: 1,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 40,
      lineHeight: 44,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -1.6,
    },

    bentoPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },

    libraryBento: {
      borderRadius: 20,
      backgroundColor: theme.mode === "dark" ? "#161616" : theme.colors.surface,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.06)"
          : "rgba(71, 88, 240, 0.12)",
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      overflow: "hidden",
      ...theme.shadows.softCard,
    },
    libraryBentoIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    libraryBentoTextBlock: {
      flex: 1,
      gap: 1,
    },
    libraryBentoEyebrow: {
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    libraryBentoTitle: {
      color: theme.mode === "dark" ? "#FFFFFF" : theme.colors.textPrimary,
      fontSize: 17,
      lineHeight: 21,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.4,
      marginTop: 1,
    },
    libraryBentoBody: {
      color:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.62)"
          : theme.colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    libraryBentoArrow: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.12)"
          : theme.colors.primary,
    },

    statsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 2,
    },
    statTile: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    statTileHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    statTileLabel: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statTileValue: {
      marginTop: 4,
      color: theme.colors.textPrimary,
      fontSize: 26,
      lineHeight: 30,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.75,
    },
    statTileUnit: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      marginTop: -1,
    },
    statTileCaption: {
      marginTop: 5,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },

    section: {
      gap: 12,
      paddingHorizontal: 2,
      marginTop: 8,
    },
    sectionDivider: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    sectionDividerAccent: {
      width: 36,
      height: 2,
      borderRadius: 999,
    },
    sectionDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(15, 23, 42, 0.08)",
    },
    sectionEyebrow: {
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      marginBottom: -4,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 26,
      lineHeight: 30,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    scheduledChip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 999,
      flexShrink: 0,
      backgroundColor: BRAND_ORANGE,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...Platform.select({
        ios: {
          shadowColor: BRAND_ORANGE,
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: theme.mode === "dark" ? 0.55 : 0.4,
          shadowRadius: 14,
        },
        android: {
          elevation: 12,
          shadowColor: BRAND_ORANGE,
        },
        default: {},
      }),
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor:
        theme.mode === "dark" ? "rgba(255, 255, 255, 0.14)" : "transparent",
    },
    scheduledChipText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    sectionBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: -4,
      marginBottom: 0,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },

    calendarPagerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 3,
    },
    calendarArrowButton: {
      width: 32,
      height: 62,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    calendarArrowButtonDisabled: {
      opacity: 0.45,
    },
    calendarPill: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 7,
      paddingHorizontal: 3,
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    calendarPillLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1,
    },
    calendarPillLabelSelected: {
      color: "#FFFFFF",
    },
    calendarPillNumber: {
      marginTop: 2,
      color: theme.colors.textPrimary,
      fontSize: 17,
      lineHeight: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    calendarPillNumberSelected: {
      color: "#FFFFFF",
    },
    calendarPillMonth: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    calendarPillMonthSelected: {
      color: "#FFFFFF",
    },
    calendarPillDot: {
      marginTop: 4,
      width: 4,
      height: 4,
      borderRadius: 999,
    },
    calendarPillDotSelected: {
      backgroundColor: "#FFFFFF",
    },
    calendarSelectedLabel: {
      color: theme.colors.textPrimary,
      fontSize: 22,
      lineHeight: 26,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    calendarSelectedSubtitle: {
      marginTop: 4,
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 17,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    scheduledDateBlock: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },
    loggedSessionsBlock: {
      gap: 10,
    },
    calendarScheduledEyebrow: {
      marginTop: 16,
      marginBottom: 10,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    completedDayCardList: {
      gap: 10,
    },
    loggedSessionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surface,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    loggedSessionIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    loggedSessionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    loggedSessionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.35,
      lineHeight: 21,
    },
    loggedSessionMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },

    scheduledSubHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginTop: 8,
      gap: 12,
    },
    scheduledSubHeaderTitle: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    viewAllButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    viewAllButtonText: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },

    scheduledEmptyCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      paddingVertical: 24,
      paddingHorizontal: 20,
      gap: 18,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
      overflow: "hidden",
    },
    scheduledEmptyTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    scheduledEmptyIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    scheduledEmptyTextBlock: {
      flex: 1,
      gap: 6,
    },
    scheduledEmptyTitle: {
      color: theme.colors.textPrimary,
      fontSize: 17,
      lineHeight: 21,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    scheduledEmptyBody: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    scheduledEmptyDecor: {
      width: 60,
      height: 60,
      alignItems: "center",
      justifyContent: "center",
    },
    scheduledEmptyActions: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    scheduledEmptyCtaOutline: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(71, 88, 240, 0.06)",
    },
    scheduledEmptyCtaOutlineText: {
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    scheduledEmptyCtaFill: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 14,
    },
    scheduledEmptyCtaFillText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },

    upcomingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    upcomingRowPressed: {
      opacity: 0.92,
    },
    upcomingDatePill: {
      width: 56,
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: "center",
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceMuted,
    },
    upcomingDateLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    upcomingDateNumber: {
      marginTop: 2,
      color: theme.colors.textPrimary,
      fontSize: 18,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    upcomingDateMonth: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 9,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    upcomingContent: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    upcomingTitle: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      lineHeight: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    upcomingMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    upcomingMetaText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    upcomingMetaDot: {
      width: 3,
      height: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.textMuted,
    },
    upcomingTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    upcomingTimeText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    upcomingActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    upcomingMoreButton: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    upcomingStartButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    upcomingStartButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },

    emptyStateCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      padding: 24,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    emptyStateIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyStateTitle: {
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
    emptyStateBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      fontFamily: "Satoshi"
    },
  });

// Re-exported so external files (App.tsx, etc.) that already imported BRAND_ORANGE
// from this module keep working without churn.
export { BRAND_ORANGE };
