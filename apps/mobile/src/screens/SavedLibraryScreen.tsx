import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import {
  BRAND_ORANGE,
  FeedbackCard,
  getBrandAccent,
} from "../components/WorkoutCard";
import { getCreatorDisplayLabel } from "../lib/fitfo";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  getMuscleGroupsForPlan,
} from "../lib/muscleGroups";
import {
  getScheduleLabelForSaved,
} from "../lib/stats";
import { getTheme, type ThemeMode } from "../theme";
import type {
  MuscleGroup,
  SavedRoutinePreview,
} from "../types";

export type SavedLibraryMeasureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface SavedLibraryScreenProps {
  error: string | null;
  importedWorkouts: SavedRoutinePreview[];
  isLoading: boolean;
  onAddWorkout: () => void;
  onBack: () => void;
  onOpenWorkout: (routine: SavedRoutinePreview) => void;
  onRemoveWorkout: (savedWorkoutId: string) => void;
  onRetry: () => void;
  onScheduleWorkout: (routine: SavedRoutinePreview) => void;
  onStartSession: (routine?: SavedRoutinePreview) => void;
  /** When set, the matching saved row is measured for hub tour coachmarks. */
  onStarterDemoCardMeasured?: (rect: SavedLibraryMeasureRect | null) => void;
  scheduledWorkouts: SavedRoutinePreview[];
  /** Normalized against saved row titles for demo highlight measurement. */
  starterDemoTitle?: string | null;
  themeMode?: ThemeMode;
}

type MuscleGroupFilter = "all" | MuscleGroup;

function MeasuredTarget({
  children,
  onMeasured,
}: {
  children: ReactNode;
  onMeasured?: (rect: SavedLibraryMeasureRect | null) => void;
}) {
  const ref = useRef<View | null>(null);
  const report = () => {
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
  };
  return (
    <View
      collapsable={false}
      ref={(node) => {
        ref.current = node;
      }}
      onLayout={report}
    >
      {children}
    </View>
  );
}

function formatMuscleGroupLabel(group: MuscleGroupFilter): string {
  if (group === "all") {
    return "All";
  }
  return MUSCLE_GROUP_LABELS[group];
}

function getSourcePlatform(
  sourceUrl: string | null | undefined,
): "tiktok" | "instagram" | "other" | null {
  if (!sourceUrl) {
    return null;
  }
  try {
    const host = new URL(sourceUrl).host.toLowerCase();
    if (host.includes("tiktok.com")) {
      return "tiktok";
    }
    if (host.includes("instagram.com")) {
      return "instagram";
    }
    return "other";
  } catch {
    return null;
  }
}

function getSourceIconName(
  platform: ReturnType<typeof getSourcePlatform>,
): keyof typeof Ionicons.glyphMap {
  if (platform === "tiktok") {
    return "logo-tiktok";
  }
  if (platform === "instagram") {
    return "logo-instagram";
  }
  return "link-outline";
}

function getSourceShortLabel(
  platform: ReturnType<typeof getSourcePlatform>,
): string {
  if (platform === "tiktok") {
    return "TikTok";
  }
  if (platform === "instagram") {
    return "Instagram";
  }
  return "Source";
}

interface StatTileProps {
  caption: string;
  iconColor: string;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  theme: ReturnType<typeof getTheme>;
  value: string;
  variant?: "light" | "dark";
}

function StatTile({
  caption,
  iconColor,
  iconName,
  label,
  theme,
  value,
  variant = "light",
}: StatTileProps) {
  const styles = createStyles(theme);
  const isDark = variant === "dark";
  return (
    <View style={[styles.statTile, isDark ? styles.statTileDark : null]}>
      <View
        style={[
          styles.statTileIcon,
          {
            backgroundColor: isDark
              ? "rgba(255, 111, 34, 0.18)"
              : "rgba(71, 88, 240, 0.12)",
          },
        ]}
      >
        <Ionicons color={iconColor} name={iconName} size={14} />
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[styles.statTileValue, isDark ? styles.statTileValueDark : null]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={[styles.statTileLabel, isDark ? styles.statTileLabelDark : null]}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={[
          styles.statTileCaption,
          isDark ? styles.statTileCaptionDark : null,
        ]}
      >
        {caption}
      </Text>
    </View>
  );
}

function LibraryWorkoutCard({
  isDraft,
  onEdit,
  onMore,
  onOpen,
  onRemove,
  onStart,
  onStartButtonMeasured,
  routine,
  scheduleLabel,
  theme,
}: {
  isDraft?: boolean;
  onEdit: () => void;
  onMore?: () => void;
  onOpen: () => void;
  onRemove?: () => void;
  onStart: () => void;
  onStartButtonMeasured?: (rect: SavedLibraryMeasureRect | null) => void;
  routine: SavedRoutinePreview;
  scheduleLabel: string | null;
  theme: ReturnType<typeof getTheme>;
}) {
  const styles = createStyles(theme);
  const accent = getBrandAccent(theme);
  const creatorHandle = getCreatorDisplayLabel(routine.sourceUrl, routine.title);
  const sourceUrl = routine.sourceUrl || null;
  const platform = getSourcePlatform(sourceUrl);
  const sourceShortLabel = getSourceShortLabel(platform);
  const badgeLabel = isDraft ? "DRAFT" : routine.badgeLabel?.toUpperCase() || "IMPORTED";
  const lastEditedLabel = isDraft ? "Last edited" : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open workout: ${routine.title}`}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.cardTopRow}>
        {routine.thumbnailUrl ? (
          <View style={styles.cardThumb}>
            <Image
              source={{ uri: routine.thumbnailUrl }}
              style={styles.cardThumbImage}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.cardBadge,
                isDraft ? styles.cardBadgeDraft : null,
              ]}
            >
              <Text
                style={[
                  styles.cardBadgeText,
                  { color: isDraft ? theme.colors.textSecondary : accent },
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>

          <Text numberOfLines={2} style={styles.cardTitle}>
            {routine.title}
          </Text>

          {creatorHandle || sourceUrl ? (
            <View style={styles.cardChipsRow}>
              {creatorHandle ? (
                <View style={styles.creatorChip}>
                  <Text style={styles.creatorChipText}>{creatorHandle}</Text>
                </View>
              ) : null}
              {sourceUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(sourceUrl)}
                  style={({ pressed }) => [
                    styles.sourceChip,
                    pressed ? styles.sourceChipPressed : null,
                  ]}
                >
                  <Ionicons
                    color={theme.colors.textPrimary}
                    name={getSourceIconName(platform)}
                    size={12}
                  />
                  <Text style={styles.sourceChipText}>{sourceShortLabel}</Text>
                  <Ionicons
                    color={theme.colors.textMuted}
                    name="open-outline"
                    size={11}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMetaText}>{routine.metaLeft}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.cardMetaText}>{routine.metaRight}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBottomRow}>
        {scheduleLabel ? (
          // Already scheduled — keep the two-line stack so the date is legible.
          // Unscheduled cards intentionally render no left-side chip so the
          // action row sits flush left, matching the v1 saved-workouts spec.
          <View style={styles.cardScheduleBlock}>
            <Ionicons
              color={accent}
              name="calendar-outline"
              size={14}
              style={styles.cardScheduleIcon}
            />
            <View style={styles.cardScheduleTextBlock}>
              <Text style={styles.cardScheduleLabel} numberOfLines={1}>
                Scheduled
              </Text>
              <Text style={styles.cardScheduleSubLabel} numberOfLines={1}>
                {scheduleLabel}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.cardActionRow}>
          {isDraft ? (
            <Pressable
              onPress={onOpen}
              style={({ pressed }) => [
                styles.continueEditingButton,
                { borderColor: accent },
                pressed ? styles.actionPressed : null,
              ]}
            >
              <Text style={[styles.continueEditingText, { color: accent }]}>
                Continue Editing
              </Text>
            </Pressable>
          ) : (
            <MeasuredTarget onMeasured={onStartButtonMeasured}>
              <View style={styles.startActionRow}>
                <Pressable
                  onPress={onStart}
                  style={({ pressed }) => [
                    styles.startButton,
                    { backgroundColor: accent },
                    pressed ? styles.actionPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Start session"
                >
                  <Text style={styles.startButtonText}>Start Session</Text>
                  <Ionicons color="#FFFFFF" name="play" size={12} />
                </Pressable>
                {onMore ? (
                  <Pressable
                    onPress={onMore}
                    hitSlop={4}
                    style={({ pressed }) => [
                      styles.smallIconButton,
                      pressed ? styles.actionPressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={scheduleLabel ? "Reschedule" : "Schedule"}
                  >
                    <Ionicons
                      color={theme.colors.textPrimary}
                      name="calendar-outline"
                      size={16}
                    />
                  </Pressable>
                ) : null}
              </View>
            </MeasuredTarget>
          )}
          <Pressable
            onPress={onEdit}
            hitSlop={4}
            style={({ pressed }) => [
              styles.smallIconButton,
              pressed ? styles.actionPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit"
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="pencil-outline"
              size={16}
            />
          </Pressable>
          {onRemove ? (
            <Pressable
              onPress={onRemove}
              hitSlop={4}
              style={({ pressed }) => [
                styles.smallIconButton,
                pressed ? styles.actionPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Remove"
            >
              <Ionicons
                color={theme.colors.textPrimary}
                name="trash-outline"
                size={16}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function SavedLibraryScreen({
  error,
  importedWorkouts,
  isLoading,
  onAddWorkout,
  onBack,
  onOpenWorkout,
  onRemoveWorkout,
  onRetry,
  onScheduleWorkout,
  onStartSession,
  onStarterDemoCardMeasured,
  scheduledWorkouts,
  starterDemoTitle,
  themeMode = "light",
}: SavedLibraryScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const accent = getBrandAccent(theme);
  const starterKey = starterDemoTitle?.trim().toLowerCase() ?? "";

  const [selectedMuscleFilter, setSelectedMuscleFilter] =
    useState<MuscleGroupFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const muscleGroupsByRoutineId = useMemo(() => {
    const map = new Map<string, MuscleGroup[]>();
    for (const routine of importedWorkouts) {
      map.set(routine.id, getMuscleGroupsForPlan(routine.workoutPlan));
    }
    return map;
  }, [importedWorkouts]);

  const availableMuscleGroups = useMemo(() => {
    const set = new Set<MuscleGroup>();
    for (const groups of muscleGroupsByRoutineId.values()) {
      for (const group of groups) {
        set.add(group);
      }
    }
    return MUSCLE_GROUPS.filter((group) => set.has(group));
  }, [muscleGroupsByRoutineId]);

  useEffect(() => {
    if (
      selectedMuscleFilter !== "all" &&
      !availableMuscleGroups.includes(selectedMuscleFilter)
    ) {
      setSelectedMuscleFilter("all");
    }
  }, [availableMuscleGroups, selectedMuscleFilter]);

  const filteredWorkouts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return importedWorkouts.filter((routine) => {
      if (selectedMuscleFilter !== "all") {
        const groups = muscleGroupsByRoutineId.get(routine.id) || [];
        if (!groups.includes(selectedMuscleFilter)) {
          return false;
        }
      }
      if (query) {
        const haystack = [
          routine.title,
          routine.description,
          getCreatorDisplayLabel(routine.sourceUrl, routine.title) || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [
    importedWorkouts,
    muscleGroupsByRoutineId,
    searchQuery,
    selectedMuscleFilter,
  ]);

  const filterChips = useMemo(
    () => ["all", ...availableMuscleGroups] as MuscleGroupFilter[],
    [availableMuscleGroups],
  );

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.headerNav}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.iconRoundButton,
              pressed ? styles.actionPressed : null,
            ]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="arrow-back"
              size={20}
            />
          </Pressable>
          <Pressable
            onPress={onAddWorkout}
            style={({ pressed }) => [
              styles.iconRoundButton,
              pressed ? styles.actionPressed : null,
            ]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add workout"
          >
            <Ionicons color={accent} name="add" size={22} />
          </Pressable>
        </View>

        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: accent }]}>LIBRARY</Text>
          <Text style={styles.title}>Saved Workouts</Text>
          <Text style={styles.subtitle}>
            Your saved programs, imports, and drafts.
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons
            color={theme.colors.textMuted}
            name="search"
            size={18}
            style={styles.searchIcon}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search saved workouts..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => setShowFilters((current) => !current)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.searchFilterButton,
              pressed ? styles.actionPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle filters"
          >
            <MaterialCommunityIcons
              color={
                showFilters || selectedMuscleFilter !== "all"
                  ? accent
                  : theme.colors.textMuted
              }
              name="tune-variant"
              size={18}
            />
          </Pressable>
        </View>

      {showFilters && filterChips.length > 1 ? (
        <View style={styles.filterBento}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterStripContent}
          >
            {filterChips.map((filterValue) => {
              const isSelected = selectedMuscleFilter === filterValue;
              const label = formatMuscleGroupLabel(filterValue);
              return (
                <Pressable
                  key={filterValue}
                  onPress={() => setSelectedMuscleFilter(filterValue)}
                  style={[
                    styles.filterChip,
                    isSelected
                      ? { backgroundColor: accent, borderColor: accent }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected ? styles.filterChipTextSelected : null,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      </View>

      <View style={styles.workoutListRoundCap}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.workoutListScroll}
          contentContainerStyle={[
            styles.workoutListContent,
            { paddingBottom: tabBarScrollPad },
          ]}
        >
        {isLoading ? (
        <FeedbackCard
          body="Pulling your saved routines from your Fitfo account."
          isLoading
          theme={theme}
          title="Loading workouts"
        />
      ) : error ? (
        <FeedbackCard
          actionLabel="Try Again"
          body={error}
          icon="alert-circle-outline"
          onAction={onRetry}
          theme={theme}
          title="Couldn't load saved workouts"
        />
      ) : importedWorkouts.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIcon}>
            <Ionicons color={accent} name="barbell-outline" size={20} />
          </View>
          <Text style={styles.emptyStateTitle}>No saved workouts yet</Text>
          <Text style={styles.emptyStateBody}>
            Your imported routines and manual drafts will live here once you
            save them.
          </Text>
          <Pressable
            onPress={onAddWorkout}
            style={({ pressed }) => [
              styles.emptyCta,
              { backgroundColor: accent },
              pressed ? styles.actionPressed : null,
            ]}
          >
            <Ionicons color="#FFFFFF" name="add" size={16} />
            <Text style={styles.emptyCtaText}>Add a workout</Text>
          </Pressable>
        </View>
      ) : filteredWorkouts.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIcon}>
            <Ionicons color={accent} name="funnel-outline" size={20} />
          </View>
          <Text style={styles.emptyStateTitle}>No matches</Text>
          <Text style={styles.emptyStateBody}>
            Try a different search term or filter.
          </Text>
        </View>
      ) : (
        filteredWorkouts.map((routine) => {
          const key =
            routine.savedWorkoutId || routine.workoutId || routine.id;
          const scheduleLabel = key
            ? getScheduleLabelForSaved(routine, scheduledWorkouts)
            : null;
          const isStarterRow =
            starterKey.length > 0 &&
            routine.title.trim().toLowerCase() === starterKey;
          return (
            <View key={routine.id} style={{ width: "100%" }}>
              <LibraryWorkoutCard
                onEdit={() => onOpenWorkout(routine)}
                onMore={() => onScheduleWorkout(routine)}
                onOpen={() => onOpenWorkout(routine)}
                onRemove={
                  routine.savedWorkoutId
                    ? () =>
                        onRemoveWorkout(routine.savedWorkoutId || routine.id)
                    : undefined
                }
                onStart={() => onStartSession(routine)}
                onStartButtonMeasured={
                  isStarterRow ? onStarterDemoCardMeasured : undefined
                }
                routine={routine}
                scheduleLabel={scheduleLabel}
                theme={theme}
              />
            </View>
          );
        })
      )}
      </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topSection: {
      paddingHorizontal: 20,
      paddingTop: 20,
      gap: 14,
    },
    workoutListRoundCap: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      flex: 1,
      overflow: "hidden",
    },
    workoutListScroll: {
      flex: 1,
    },
    workoutListContent: {
      flexGrow: 1,
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    headerNav: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    iconRoundButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.10)"
          : "rgba(20, 32, 85, 0.10)",
      ...theme.shadows.softCard,
    },
    actionPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.96 }],
    },

    titleBlock: {
      gap: 6,
      paddingHorizontal: 2,
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
      fontSize: 32,
      lineHeight: 34,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -1.2,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      marginTop: 0,
    },

    statsRow: {
      flexDirection: "row",
      gap: 8,
    },
    statTile: {
      flex: 1,
      minHeight: 110,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    statTileDark: {
      backgroundColor: theme.mode === "dark" ? "#161616" : "#101010",
      borderWidth: 0,
    },
    statTileIcon: {
      width: 24,
      height: 24,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    statTileValue: {
      color: theme.colors.textPrimary,
      fontSize: 24,
      lineHeight: 27,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.65,
      marginBottom: 3,
    },
    statTileValueDark: {
      color: "#FFFFFF",
    },
    statTileLabel: {
      color: theme.colors.textPrimary,
      fontSize: 11,
      lineHeight: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statTileLabelDark: {
      color: "#FFFFFF",
    },
    statTileCaption: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 13,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      marginTop: 2,
    },
    statTileCaptionDark: {
      color: "rgba(255, 255, 255, 0.55)",
    },

    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    searchIcon: {},
    searchInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      paddingVertical: 0,
    },
    searchFilterButton: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },

    filterBento: {
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    filterStripContent: {
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 2,
      alignItems: "center",
    },
    filterChip: {
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: "transparent",
      borderWidth: 0,
    },
    filterChipText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    filterChipTextSelected: {
      color: "#FFFFFF",
      fontWeight: "800",
    },

    card: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    cardPressed: {
      opacity: 0.92,
    },
    cardTopRow: {
      flexDirection: "row",
      gap: 12,
    },
    cardThumb: {
      width: 92,
      height: 110,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    cardThumbImage: {
      width: "100%",
      height: "100%",
    },
    cardContent: {
      flex: 1,
      gap: 6,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardBadge: {
      borderRadius: 999,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 111, 34, 0.14)"
          : "rgba(71, 88, 240, 0.12)",
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    cardBadgeDraft: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    cardBadgeText: {
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    cardMoreButton: {
      width: 26,
      height: 26,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    cardMoreButtonPressed: {
      opacity: 0.7,
    },
    cardTitle: {
      color: theme.colors.textPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    cardChipsRow: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    creatorChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    creatorChipText: {
      color: theme.colors.textPrimary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    sourceChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    sourceChipPressed: {
      opacity: 0.85,
    },
    sourceChipText: {
      color: theme.colors.textPrimary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    cardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    cardMetaText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.textMuted,
    },

    cardBottomRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.borderSoft,
      paddingTop: 12,
    },
    cardScheduleBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    cardScheduleIcon: {
      marginTop: 1,
    },
    cardScheduleTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    cardScheduleLabel: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    cardScheduleSubLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      marginTop: 1,
    },
    cardActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    startActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
    },
    startButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    startButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    continueEditingButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
    },
    continueEditingText: {
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    smallIconButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surface,
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
    },
    emptyCta: {
      marginTop: 8,
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    emptyCtaText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });

// Re-export for parity with the hub screen.
export { BRAND_ORANGE };
