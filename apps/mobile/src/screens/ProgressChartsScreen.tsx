import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getCompletedWorkoutSetCount } from "../lib/fitfo";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import { getTheme, type ThemeMode } from "../theme";
import type {
  BodyWeightEntryRecord,
  CompletedWorkoutRecord,
  UserProfile,
} from "../types";

type LiftKey = "bench" | "squat" | "deadlift" | "ohp";

interface ProgressChartsScreenProps {
  bodyWeightError: string | null;
  completedWorkouts: CompletedWorkoutRecord[];
  error: string | null;
  isLoading: boolean;
  isSubmittingWeightEntry: boolean;
  onAddWeightEntry: (weightLbs: number) => Promise<void> | void;
  onRetry: () => void;
  profile: UserProfile;
  themeMode?: ThemeMode;
  weightEntries: BodyWeightEntryRecord[];
}

interface LiftPoint {
  label: string;
  recordedAt: string;
  value: number;
}

interface PlotPoint {
  x: number;
  y: number;
}

interface ChartSeries {
  labels: string[];
  values: number[];
  yTicks: number[];
}

interface PersonalRecord {
  date: string | null;
  exercise: string;
  weight: number | null;
}

interface ChartsPalette {
  addPointBackground: string;
  addPointBorder: string;
  addPointText: string;
  badgeBackground: string;
  badgeText: string;
  disabledButton: string;
  inlineErrorBackground: string;
  inlineErrorText: string;
  inputPlaceholder: string;
  liftFill: string;
  liftGrid: string;
  modalInputBackground: string;
  modalInputBorder: string;
  quoteAuthor: string;
  quoteCard: string;
  quoteDot: string;
  quoteDotActive: string;
  quoteOrb: string;
  tabInactive: string;
  weightFill: string;
  weightGainPill: string;
  weightGainText: string;
  weightGrid: string;
  weightLine: string;
  weightLossPill: string;
  weightLossText: string;
}

const QUOTE_TEXT =
  "Your body can stand almost anything. It's your mind you have to convince.";

const LIGHT_THEME = getTheme("light");
const DARK_THEME = getTheme("dark");

const LIGHT_PALETTE: ChartsPalette = {
  addPointBackground: "#ECEEFF",
  addPointBorder: "#D8DCFF",
  addPointText: "#4758F0",
  badgeBackground: "#ECEEFF",
  badgeText: "#4758F0",
  disabledButton: "#A6B0C8",
  inlineErrorBackground: "#FFEDEE",
  inlineErrorText: "#C51F2D",
  inputPlaceholder: "#9AA6C3",
  liftFill: "rgba(71, 88, 240, 0.14)",
  liftGrid: "rgba(15, 30, 110, 0.08)",
  modalInputBackground: "#F3F6FF",
  modalInputBorder: "#DCE7F1",
  quoteAuthor: "rgba(255, 255, 255, 0.72)",
  quoteCard: "#3D48E5",
  quoteDot: "rgba(255, 255, 255, 0.34)",
  quoteDotActive: "#FFFFFF",
  quoteOrb: "rgba(255, 255, 255, 0.08)",
  tabInactive: "#EEF1F8",
  weightFill: "rgba(22, 40, 103, 0.10)",
  weightGainPill: "#FCE8E8",
  weightGainText: "#C93535",
  weightGrid: "rgba(15, 30, 110, 0.08)",
  weightLine: "#162867",
  weightLossPill: "#E3F5EC",
  weightLossText: "#22A06B",
};

const DARK_PALETTE: ChartsPalette = {
  addPointBackground: "rgba(255, 111, 34, 0.14)",
  addPointBorder: "rgba(255, 111, 34, 0.26)",
  addPointText: "#FFAE80",
  badgeBackground: "rgba(255, 111, 34, 0.14)",
  badgeText: "#FFAE80",
  disabledButton: "#5A4E4A",
  inlineErrorBackground: "#2E1714",
  inlineErrorText: "#EAB0A9",
  inputPlaceholder: "#8A7E7A",
  liftFill: "rgba(255, 111, 34, 0.18)",
  liftGrid: "rgba(255, 130, 90, 0.14)",
  modalInputBackground: "#161312",
  modalInputBorder: "#332926",
  quoteAuthor: "rgba(246, 230, 220, 0.72)",
  quoteCard: "#26180F",
  quoteDot: "rgba(255, 125, 82, 0.34)",
  quoteDotActive: "#F8EDE6",
  quoteOrb: "rgba(255, 170, 120, 0.16)",
  tabInactive: "#1A1614",
  weightFill: "rgba(255, 125, 80, 0.14)",
  weightGainPill: "rgba(255, 105, 60, 0.14)",
  weightGainText: "#E8ACA5",
  weightGrid: "rgba(255, 130, 90, 0.12)",
  weightLine: "#FF9648",
  weightLossPill: "rgba(255, 125, 80, 0.14)",
  weightLossText: "#E8C9B0",
};

const LIFT_META: Array<{
  aliases: string[];
  cardTitle: string;
  chartLabel: string;
  exclude?: string[];
  key: LiftKey;
}> = [
  {
    aliases: ["bench press", "bench", "flat bench", "barbell bench press"],
    cardTitle: "Bench Press",
    chartLabel: "Bench",
    key: "bench",
  },
  {
    aliases: ["back squat", "front squat", "squat"],
    cardTitle: "Squat",
    chartLabel: "Squat",
    exclude: ["split squat", "jump squat", "goblet squat"],
    key: "squat",
  },
  {
    aliases: ["deadlift", "sumo deadlift", "conventional deadlift", "rdl", "romanian deadlift"],
    cardTitle: "Deadlift",
    chartLabel: "Deadlift",
    key: "deadlift",
  },
  {
    aliases: ["overhead press", "ohp", "military press", "strict press"],
    cardTitle: "Overhead Press",
    chartLabel: "OHP",
    key: "ohp",
  },
];

function createStyles(
  theme: ReturnType<typeof getTheme>,
  palette: ChartsPalette,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
      gap: 24,
    },
    header: {
      paddingBottom: 0,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
    },
    brandBadge: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primaryBright,
    },
    brandBadgeText: {
      color: theme.colors.surface,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    brandText: {
      color: theme.colors.primaryBright,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    eyebrow: {
      color: theme.colors.primaryBright,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1,
      marginBottom: 4,
    },
    pageTitle: {
      color: theme.colors.textPrimary,
      fontSize: 34,
      lineHeight: 38,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    pageTitleAccent: {
      color: theme.colors.primaryBright,
    },
    quoteCard: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderRadius: 22,
      backgroundColor: palette.quoteCard,
      overflow: "hidden",
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.18)" : "transparent",
      ...theme.shadows.primary,
    },
    quoteOrb: {
      position: "absolute",
      top: -24,
      right: -18,
      width: 112,
      height: 112,
      borderRadius: 999,
      backgroundColor: palette.quoteOrb,
    },
    quoteText: {
      color: "#FFFFFF",
      fontSize: 17,
      lineHeight: 26,
      fontStyle: "italic",
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
      maxWidth: "92%",
    },
    quoteAuthor: {
      marginTop: 10,
      color: palette.quoteAuthor,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    quoteDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 16,
    },
    quoteDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: palette.quoteDot,
    },
    quoteDotActive: {
      width: 18,
      backgroundColor: palette.quoteDotActive,
    },
    section: {
      paddingHorizontal: 0,
      marginBottom: 0,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontSize: 20,
      lineHeight: 24,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      marginBottom: 14,
    },
    feedbackCard: {
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      alignItems: "flex-start",
      gap: 8,
      ...theme.shadows.softCard,
    },
    feedbackTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    feedbackBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
    },
    retryButton: {
      marginTop: 6,
      borderRadius: 999,
      backgroundColor: palette.addPointBackground,
      borderWidth: 1,
      borderColor: palette.addPointBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    retryButtonText: {
      color: palette.addPointText,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    prGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 10,
    },
    prCard: {
      width: "48.5%",
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    prExercise: {
      color: theme.colors.primaryBright,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 5,
    },
    prValueRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    prWeight: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      lineHeight: 30,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    prUnit: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      marginLeft: 4,
      marginBottom: 4,
    },
    prDate: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
      marginTop: 6,
      minHeight: 14,
    },
    prBadge: {
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: palette.badgeBackground,
    },
    prBadgeText: {
      color: palette.badgeText,
      fontSize: 9,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    chartCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    chartTabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    chartTabButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: palette.tabInactive,
      borderWidth: theme.mode === "dark" ? 1 : 0,
      borderColor:
        theme.mode === "dark" ? "rgba(255, 111, 34, 0.12)" : "transparent",
    },
    chartTabButtonActive: {
      backgroundColor: theme.colors.primaryBright,
      borderColor: theme.colors.primaryBright,
    },
    chartTabText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    chartTabTextActive: {
      color: theme.colors.surface,
    },
    chartFrame: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    yAxis: {
      width: 50,
      marginRight: 8,
      position: "relative",
    },
    yAxisLabel: {
      position: "absolute",
      left: 0,
      width: 46,
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    chartMain: {
      flex: 1,
    },
    plotArea: {
      position: "relative",
    },
    gridLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
    },
    fillBar: {
      position: "absolute",
      width: 6,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    lineSegment: {
      position: "absolute",
      height: 3,
      borderRadius: 999,
    },
    point: {
      position: "absolute",
      width: 10,
      height: 10,
      borderRadius: 999,
      borderWidth: 2,
    },
    xAxisArea: {
      position: "relative",
      height: 28,
      marginTop: 10,
    },
    xAxisLabel: {
      position: "absolute",
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
      textAlign: "center",
    },
    weightHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },
    weightCopy: {
      gap: 4,
      flex: 1,
    },
    weightLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    weightValueRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
    },
    weightValue: {
      color: theme.colors.textPrimary,
      fontSize: 34,
      lineHeight: 36,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    weightUnit: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
      marginBottom: 5,
    },
    weightHeaderActions: {
      alignItems: "flex-end",
      gap: 8,
    },
    weightPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: palette.weightLossPill,
    },
    weightPillGain: {
      backgroundColor: palette.weightGainPill,
    },
    weightPillText: {
      color: palette.weightLossText,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    weightPillTextGain: {
      color: palette.weightGainText,
    },
    addPointButton: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: palette.addPointBackground,
      borderWidth: 1,
      borderColor: palette.addPointBorder,
    },
    addPointButtonText: {
      color: palette.addPointText,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    statCard: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.softCard,
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontSize: 28,
      lineHeight: 30,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textAlign: "center",
    },
    statLabel: {
      marginTop: 6,
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.7,
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      padding: 20,
      backgroundColor: theme.colors.overlay,
    },
    modalCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 18,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      ...theme.shadows.card,
    },
    modalCloseButton: {
      alignSelf: "flex-end",
    },
    modalCloseText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    modalEyebrow: {
      color: theme.colors.primaryBright,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    modalTitle: {
      color: theme.colors.textPrimary,
      fontSize: 26,
      lineHeight: 30,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    modalBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
    },
    modalInputShell: {
      marginTop: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 16,
      backgroundColor: palette.modalInputBackground,
      borderWidth: 1,
      borderColor: palette.modalInputBorder,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    modalInput: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 22,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      paddingVertical: 0,
    },
    modalInputUnit: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
    },
    inlineErrorCard: {
      marginTop: 12,
      borderRadius: 14,
      backgroundColor: palette.inlineErrorBackground,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    inlineErrorText: {
      color: palette.inlineErrorText,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    modalPrimaryButton: {
      marginTop: 16,
      height: 50,
      borderRadius: 16,
      backgroundColor: theme.colors.primaryBright,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...theme.shadows.primary,
    },
    modalPrimaryButtonDisabled: {
      backgroundColor: palette.disabledButton,
      shadowOpacity: 0,
      elevation: 0,
    },
    modalPrimaryButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
}

const LIGHT_STYLES = createStyles(LIGHT_THEME, LIGHT_PALETTE);
const DARK_STYLES = createStyles(DARK_THEME, DARK_PALETTE);

interface ChartsThemeContextValue {
  palette: ChartsPalette;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof getTheme>;
}

const ChartsThemeContext = createContext<ChartsThemeContextValue | null>(null);

function useChartsTheme() {
  const value = useContext(ChartsThemeContext);
  if (!value) {
    throw new Error("Charts theme context is missing.");
  }

  return value;
}

const sanitizeWeightInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", decimal = ""] = cleaned.split(".");
  if (!cleaned.includes(".")) {
    return whole.slice(0, 4);
  }
  return `${whole.slice(0, 4)}.${decimal.slice(0, 1)}`;
};

function formatWeight(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function parseWeight(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeExerciseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatChartDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "No logged PR yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getValueRange(values: number[], yTicks: number[]) {
  return {
    max: Math.max(...values, ...yTicks),
    min: Math.min(...values, ...yTicks),
  };
}

function buildTicks(values: number[], minimumStep: number) {
  if (!values.length) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = Math.max(max - min, minimumStep * 2);
  const paddedMin = Math.max(0, min - rawRange * 0.12);
  const paddedMax = max + rawRange * 0.12;
  const rawStep = Math.max((paddedMax - paddedMin) / 5, minimumStep);
  const step = Math.max(
    minimumStep,
    Math.ceil(rawStep / minimumStep) * minimumStep,
  );
  const first = Math.floor(paddedMin / step) * step;
  const last = Math.ceil(paddedMax / step) * step;
  const ticks: number[] = [];

  for (let current = last; current >= first; current -= step) {
    ticks.push(Number(current.toFixed(1)));
  }

  return ticks;
}

function buildPlotPoints(width: number, height: number, values: number[], yTicks: number[]) {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const { min, max } = getValueRange(values, yTicks);
  const range = Math.max(max - min, 1);

  return values.map((value, index) => {
    const x =
      values.length === 1
        ? safeWidth / 2
        : (safeWidth / Math.max(values.length - 1, 1)) * index;
    const y = safeHeight - ((value - min) / range) * safeHeight;
    return { x, y };
  });
}

function getTickPosition(height: number, tick: number, values: number[], yTicks: number[]) {
  const { min, max } = getValueRange(values, yTicks);
  const range = Math.max(max - min, 1);
  return height - ((tick - min) / range) * height;
}

function interpolateY(points: PlotPoint[], targetX: number) {
  if (!points.length) {
    return 0;
  }

  if (targetX <= points[0].x) {
    return points[0].y;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];

    if (targetX >= current.x && targetX <= next.x) {
      const ratio = (targetX - current.x) / Math.max(next.x - current.x, 1);
      return current.y + (next.y - current.y) * ratio;
    }
  }

  return points[points.length - 1].y;
}

function matchesLift(name: string, liftKey: LiftKey) {
  const meta = LIFT_META.find((entry) => entry.key === liftKey);
  if (!meta) {
    return false;
  }

  const normalized = normalizeExerciseName(name);
  if (meta.exclude?.some((term) => normalized.includes(term))) {
    return false;
  }

  return meta.aliases.some((alias) => normalized.includes(alias));
}

function buildLiftPoints(workouts: CompletedWorkoutRecord[]) {
  const sorted = [...workouts].sort((left, right) => {
    return (
      new Date(left.completed_at).getTime() - new Date(right.completed_at).getTime()
    );
  });
  const byLift: Record<LiftKey, LiftPoint[]> = {
    bench: [],
    squat: [],
    deadlift: [],
    ohp: [],
  };

  for (const workout of sorted) {
    const maxByLift: Partial<Record<LiftKey, number>> = {};

    for (const exercise of workout.exercises) {
      for (const meta of LIFT_META) {
        if (!matchesLift(exercise.name, meta.key)) {
          continue;
        }

        for (const set of exercise.sets) {
          if (!set.completed) {
            continue;
          }

          const weight = parseWeight(set.loggedWeight);
          if (weight == null || weight <= 0) {
            continue;
          }

          const currentMax = maxByLift[meta.key];
          if (currentMax == null || weight > currentMax) {
            maxByLift[meta.key] = weight;
          }
        }
      }
    }

    for (const meta of LIFT_META) {
      const workoutMax = maxByLift[meta.key];
      if (workoutMax == null) {
        continue;
      }

      byLift[meta.key].push({
        label: formatChartDate(workout.completed_at),
        recordedAt: workout.completed_at,
        value: workoutMax,
      });
    }
  }

  return byLift;
}

function buildLiftChartSeries(points: LiftPoint[]) {
  const recentPoints = points.slice(-7);
  const values = recentPoints.map((point) => point.value);
  return {
    labels: recentPoints.map((point) => point.label),
    values,
    yTicks: buildTicks(values, 5),
  };
}

function buildPersonalRecords(liftPoints: Record<LiftKey, LiftPoint[]>) {
  const records: Record<LiftKey, PersonalRecord> = {
    bench: { exercise: "Bench Press", weight: null, date: null },
    squat: { exercise: "Squat", weight: null, date: null },
    deadlift: { exercise: "Deadlift", weight: null, date: null },
    ohp: { exercise: "Overhead Press", weight: null, date: null },
  };

  for (const meta of LIFT_META) {
    const points = liftPoints[meta.key];
    let bestPoint: LiftPoint | null = null;

    for (const point of points) {
      if (!bestPoint || point.value > bestPoint.value) {
        bestPoint = point;
      }
    }

    if (bestPoint) {
      records[meta.key] = {
        exercise: meta.cardTitle,
        weight: bestPoint.value,
        date: bestPoint.recordedAt,
      };
    }
  }

  return records;
}

function buildWeightHistory(
  weightEntries: BodyWeightEntryRecord[],
  profile: UserProfile,
) {
  const sortedEntries = [...weightEntries].sort((left, right) => {
    return (
      new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime()
    );
  });
  const hasOnboardingPoint = sortedEntries.some((entry) => entry.source === "onboarding");

  if (!hasOnboardingPoint && profile.onboarding) {
    sortedEntries.unshift({
      id: `onboarding-${profile.id}`,
      user_id: profile.id,
      weight_lbs: profile.onboarding.weight_lbs,
      source: "onboarding",
      recorded_at:
        profile.onboarding.completed_at ||
        profile.onboarding.created_at ||
        profile.created_at ||
        new Date().toISOString(),
      created_at: profile.onboarding.created_at,
      updated_at: profile.onboarding.updated_at,
    });
  }

  return sortedEntries.sort((left, right) => {
    return new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime();
  });
}

function buildWeightChartSeries(entries: BodyWeightEntryRecord[]) {
  const recentEntries = entries.slice(-8);
  const values = recentEntries.map((entry) => entry.weight_lbs);
  return {
    labels: recentEntries.map((entry) => formatChartDate(entry.recorded_at)),
    values,
    yTicks: buildTicks(values, 1),
  };
}

function buildWeightChange(entries: BodyWeightEntryRecord[]) {
  if (!entries.length) {
    return null;
  }

  const latest = entries[entries.length - 1];
  const latestDate = new Date(latest.recorded_at);
  const monthStart = new Date(
    latestDate.getFullYear(),
    latestDate.getMonth(),
    1,
  ).getTime();
  const firstThisMonth = entries.find((entry) => {
    const entryDate = new Date(entry.recorded_at);
    return (
      entryDate.getFullYear() === latestDate.getFullYear() &&
      entryDate.getMonth() === latestDate.getMonth()
    );
  });
  const beforeMonth = [...entries]
    .reverse()
    .find((entry) => new Date(entry.recorded_at).getTime() < monthStart);
  const baseline = beforeMonth || firstThisMonth || entries[0];
  const delta = Number((latest.weight_lbs - baseline.weight_lbs).toFixed(1));

  return {
    current: latest.weight_lbs,
    delta,
  };
}

function buildDayStreak(workouts: CompletedWorkoutRecord[]) {
  if (!workouts.length) {
    return 0;
  }

  const uniqueDays = Array.from(
    new Set(
      workouts.map((workout) => {
        const date = new Date(workout.completed_at);
        const month = `${date.getMonth() + 1}`.padStart(2, "0");
        const day = `${date.getDate()}`.padStart(2, "0");
        return `${date.getFullYear()}-${month}-${day}`;
      }),
    ),
  ).sort((left, right) => {
    return new Date(right).getTime() - new Date(left).getTime();
  });

  let streak = 1;
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const previous = new Date(uniqueDays[index - 1]);
    const current = new Date(uniqueDays[index]);
    const difference = Math.round(
      (previous.getTime() - current.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (difference !== 1) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function SectionHeader({ title }: { title: string }) {
  const { styles } = useChartsTheme();
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function ChartCard({
  children,
}: {
  children: ReactNode;
}) {
  const { styles } = useChartsTheme();
  return <View style={styles.chartCard}>{children}</View>;
}

function QuoteCard() {
  const { styles } = useChartsTheme();
  return (
    <View style={styles.quoteCard}>
      <View style={styles.quoteOrb} />
      <Text style={styles.quoteText}>"{QUOTE_TEXT}"</Text>
      <Text style={styles.quoteAuthor}>- Unknown</Text>
      <View style={styles.quoteDots}>
        <View style={[styles.quoteDot, styles.quoteDotActive]} />
        <View style={styles.quoteDot} />
        <View style={styles.quoteDot} />
      </View>
    </View>
  );
}

function FeedbackCard({
  actionLabel,
  body,
  isLoading = false,
  onAction,
  title,
}: {
  actionLabel?: string;
  body: string;
  isLoading?: boolean;
  onAction?: () => void;
  title: string;
}) {
  const { styles, theme } = useChartsTheme();
  return (
    <View style={styles.feedbackCard}>
      {isLoading ? (
        <ActivityIndicator color={theme.colors.primaryBright} size="small" />
      ) : null}
      <Text style={styles.feedbackTitle}>{title}</Text>
      <Text style={styles.feedbackBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PRCard({ exercise, weight, date }: PersonalRecord) {
  const { styles } = useChartsTheme();
  return (
    <View style={styles.prCard}>
      <Text style={styles.prExercise}>{exercise}</Text>
      <View style={styles.prValueRow}>
        <Text style={styles.prWeight}>{formatWeight(weight)}</Text>
        <Text style={styles.prUnit}>lbs</Text>
      </View>
      <Text style={styles.prDate}>{formatShortDate(date)}</Text>
      <View style={styles.prBadge}>
        <Text style={styles.prBadgeText}>ALL-TIME PR</Text>
      </View>
    </View>
  );
}

function ChartTabs({
  activeTab,
  onChange,
}: {
  activeTab: LiftKey;
  onChange: (key: LiftKey) => void;
}) {
  const { styles } = useChartsTheme();
  return (
    <View style={styles.chartTabs}>
      {LIFT_META.map((lift) => {
        const isActive = lift.key === activeTab;

        return (
          <Pressable
            key={lift.key}
            onPress={() => onChange(lift.key)}
            style={[
              styles.chartTabButton,
              isActive ? styles.chartTabButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.chartTabText,
                isActive ? styles.chartTabTextActive : null,
              ]}
            >
              {lift.chartLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AreaLineChart({
  emptyBody,
  emptyTitle,
  fillColor,
  gridColor,
  height = 180,
  labels,
  lineColor,
  pointFill,
  pointStroke,
  values,
  yTicks,
}: {
  emptyBody: string;
  emptyTitle: string;
  fillColor: string;
  gridColor: string;
  height?: number;
  labels: string[];
  lineColor: string;
  pointFill: string;
  pointStroke: string;
  values: number[];
  yTicks: number[];
}) {
  const { styles } = useChartsTheme();
  const [plotWidth, setPlotWidth] = useState(0);

  if (!values.length || !labels.length || !yTicks.length) {
    return <FeedbackCard body={emptyBody} title={emptyTitle} />;
  }

  const resolvedPlotWidth = plotWidth || 280;
  const points = buildPlotPoints(resolvedPlotWidth, height, values, yTicks);
  const sampleCount = Math.max(values.length * 12, 48);
  const fillSamples = Array.from({ length: sampleCount }, (_, index) => {
    const x = (resolvedPlotWidth / Math.max(sampleCount - 1, 1)) * index;
    return { x, y: interpolateY(points, x) };
  });

  return (
    <View style={styles.chartFrame}>
      <View style={[styles.yAxis, { height }]}>
        {yTicks.map((tick) => {
          const top = getTickPosition(height, tick, values, yTicks) - 8;
          return (
            <Text key={`tick-${tick}`} style={[styles.yAxisLabel, { top }]}>
              {`${formatWeight(tick)} lbs`}
            </Text>
          );
        })}
      </View>

      <View style={styles.chartMain}>
        <View
          onLayout={(event) => {
            const nextWidth = Math.max(
              0,
              Math.round(event.nativeEvent.layout.width),
            );
            if (nextWidth !== plotWidth) {
              setPlotWidth(nextWidth);
            }
          }}
          style={[styles.plotArea, { height }]}
        >
          {yTicks.map((tick) => {
            const top = getTickPosition(height, tick, values, yTicks);
            return (
              <View
                key={`grid-${tick}`}
                style={[
                  styles.gridLine,
                  {
                    top,
                    backgroundColor: gridColor,
                  },
                ]}
              />
            );
          })}

          {fillSamples.map((sample, index) => (
            <View
              key={`fill-${index}`}
              style={[
                styles.fillBar,
                {
                  left: sample.x - 3,
                  top: sample.y,
                  bottom: 0,
                  backgroundColor: fillColor,
                },
              ]}
            />
          ))}

          {points.slice(0, -1).map((point, index) => {
            const nextPoint = points[index + 1];
            const dx = nextPoint.x - point.x;
            const dy = nextPoint.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            return (
              <View
                key={`segment-${index}`}
                style={[
                  styles.lineSegment,
                  {
                    width: distance,
                    left: (point.x + nextPoint.x) / 2 - distance / 2,
                    top: (point.y + nextPoint.y) / 2 - 1.5,
                    backgroundColor: lineColor,
                    transform: [{ rotateZ: `${angle}rad` }],
                  },
                ]}
              />
            );
          })}

          {points.map((point, index) => (
            <View
              key={`point-${labels[index]}`}
              style={[
                styles.point,
                {
                  left: point.x - 5,
                  top: point.y - 5,
                  backgroundColor: pointFill,
                  borderColor: pointStroke,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.xAxisArea}>
          {points.map((point, index) => {
            const width = 44;
            const left = Math.max(
              0,
              Math.min(point.x - width / 2, resolvedPlotWidth - width),
            );

            return (
              <Text
                key={`label-${labels[index]}`}
                style={[styles.xAxisLabel, { left, width }]}
              >
                {labels[index]}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function AddWeightPointModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
  visible,
}: {
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (weightLbs: number) => Promise<void> | void;
  visible: boolean;
}) {
  const { palette, styles } = useChartsTheme();
  const [weightInput, setWeightInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const parsedWeight = parseWeight(weightInput);
  const canSubmit = parsedWeight != null && parsedWeight > 0 && !isSubmitting;

  useEffect(() => {
    if (!visible) {
      setWeightInput("");
      setSubmitError(null);
    }
  }, [visible]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>

          <Text style={styles.modalEyebrow}>Body Weight</Text>
          <Text style={styles.modalTitle}>Add a new point</Text>
          <Text style={styles.modalBody}>
            Save your latest body weight and the chart will update from your account data.
          </Text>

          <View style={styles.modalInputShell}>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={(value) => setWeightInput(sanitizeWeightInput(value))}
              placeholder="178"
              placeholderTextColor={palette.inputPlaceholder}
              style={styles.modalInput}
              value={weightInput}
            />
            <Text style={styles.modalInputUnit}>lbs</Text>
          </View>

          {submitError || error ? (
            <View style={styles.inlineErrorCard}>
              <Text style={styles.inlineErrorText}>{submitError || error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit}
            onPress={() => {
              if (parsedWeight == null || parsedWeight <= 0) {
                return;
              }

              Promise.resolve(onSubmit(parsedWeight))
                .then(() => {
                  onClose();
                })
                .catch((submissionError: unknown) => {
                  setSubmitError(
                    submissionError instanceof Error
                      ? submissionError.message
                      : "Unable to save your weight right now.",
                  );
                });
            }}
            style={[
              styles.modalPrimaryButton,
              !canSubmit ? styles.modalPrimaryButtonDisabled : null,
            ]}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.modalPrimaryButtonText}>Saving</Text>
              </>
            ) : (
              <Text style={styles.modalPrimaryButtonText}>Save Weight Point</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LiftProgressCard({
  activeLift,
  onChangeLift,
  series,
}: {
  activeLift: LiftKey;
  onChangeLift: (key: LiftKey) => void;
  series: ChartSeries;
}) {
  const { palette, theme } = useChartsTheme();
  return (
    <ChartCard>
      <ChartTabs activeTab={activeLift} onChange={onChangeLift} />
      <AreaLineChart
        emptyBody="Log completed sets with weight to start building your lift history."
        emptyTitle="No lift data yet"
        fillColor={palette.liftFill}
        gridColor={palette.liftGrid}
        labels={series.labels}
        lineColor={theme.colors.primaryBright}
        pointFill={theme.colors.primaryBright}
        pointStroke={theme.colors.surface}
        values={series.values}
        yTicks={series.yTicks}
      />
    </ChartCard>
  );
}

function WeightTrackingCard({
  currentWeight,
  delta,
  isSubmitting,
  onAddPointPress,
  series,
}: {
  currentWeight: number | null;
  delta: number | null;
  isSubmitting: boolean;
  onAddPointPress: () => void;
  series: ChartSeries;
}) {
  const { palette, styles, theme } = useChartsTheme();
  const isLoss = (delta || 0) <= 0;
  const changeText =
    delta == null
      ? "No monthly change yet"
      : `${isLoss ? "▼" : "▲"} ${formatWeight(Math.abs(delta))} lbs this month`;

  return (
    <ChartCard>
      <View style={styles.weightHeader}>
        <View style={styles.weightCopy}>
          <Text style={styles.weightLabel}>CURRENT</Text>
          <View style={styles.weightValueRow}>
            <Text style={styles.weightValue}>{formatWeight(currentWeight)}</Text>
            <Text style={styles.weightUnit}>lbs</Text>
          </View>
        </View>

        <View style={styles.weightHeaderActions}>
          <View
            style={[
              styles.weightPill,
              !isLoss ? styles.weightPillGain : null,
            ]}
          >
            <Text
              style={[
                styles.weightPillText,
                !isLoss ? styles.weightPillTextGain : null,
              ]}
            >
              {changeText}
            </Text>
          </View>

          <Pressable onPress={onAddPointPress} style={styles.addPointButton}>
            <Text style={styles.addPointButtonText}>
              {isSubmitting ? "Saving..." : "Add Point"}
            </Text>
          </Pressable>
        </View>
      </View>

      <AreaLineChart
        emptyBody="Your signup weight will show up first, and each new entry will extend the chart."
        emptyTitle="No body weight history yet"
        fillColor={palette.weightFill}
        gridColor={palette.weightGrid}
        height={160}
        labels={series.labels}
        lineColor={palette.weightLine}
        pointFill={palette.weightLine}
        pointStroke={theme.colors.surface}
        values={series.values}
        yTicks={series.yTicks}
      />
    </ChartCard>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const { styles } = useChartsTheme();
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ProgressChartsScreen({
  bodyWeightError,
  completedWorkouts,
  error,
  isLoading,
  isSubmittingWeightEntry,
  onAddWeightEntry,
  onRetry,
  profile,
  themeMode = "light",
  weightEntries,
}: ProgressChartsScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const [activeLift, setActiveLift] = useState<LiftKey>("bench");
  const [isAddWeightVisible, setIsAddWeightVisible] = useState(false);
  const theme = themeMode === "dark" ? DARK_THEME : LIGHT_THEME;
  const palette = themeMode === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = themeMode === "dark" ? DARK_STYLES : LIGHT_STYLES;

  const liftPoints = buildLiftPoints(completedWorkouts);
  const personalRecords = buildPersonalRecords(liftPoints);
  const activeLiftSeries = buildLiftChartSeries(liftPoints[activeLift]);
  const resolvedWeightHistory = buildWeightHistory(weightEntries, profile);
  const weightSeries = buildWeightChartSeries(resolvedWeightHistory);
  const weightChange = buildWeightChange(resolvedWeightHistory);
  const totalSets = completedWorkouts.reduce((count, workout) => {
    return count + getCompletedWorkoutSetCount(workout.exercises);
  }, 0);
  const consistencyStats = [
    { label: "DAY STREAK", value: `${buildDayStreak(completedWorkouts)}` },
    { label: "SESSIONS", value: `${completedWorkouts.length}` },
    { label: "TOTAL SETS", value: `${totalSets}` },
  ];

  return (
    <ChartsThemeContext.Provider value={{ palette, styles, theme }}>
      <>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarScrollPad },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.container}
        >
          <View style={styles.header}>
            

            <Text style={styles.eyebrow}>PROGRESS</Text>
            <Text style={styles.pageTitle}>
              Your <Text style={styles.pageTitleAccent}>Charts.</Text>
            </Text>
          </View>


          {isLoading ? (
            <View style={styles.section}>
              <FeedbackCard
                body="Pulling your workout logs and body weight history from your account."
                isLoading
                title="Loading progress data"
              />
            </View>
          ) : null}

          {!isLoading && error ? (
            <View style={styles.section}>
              <FeedbackCard
                actionLabel="Try Again"
                body={error}
                onAction={onRetry}
                title="Some progress data could not load"
              />
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Your Best PRs" />
            <View style={styles.prGrid}>
              {LIFT_META.map((lift) => (
                <PRCard key={lift.key} {...personalRecords[lift.key]} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Lift Progress" />
            <LiftProgressCard
              activeLift={activeLift}
              onChangeLift={setActiveLift}
              series={activeLiftSeries}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Weight Tracking" />
            <WeightTrackingCard
              currentWeight={weightChange?.current ?? null}
              delta={weightChange?.delta ?? null}
              isSubmitting={isSubmittingWeightEntry}
              onAddPointPress={() => setIsAddWeightVisible(true)}
              series={weightSeries}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Consistency" />
            <View style={styles.statRow}>
              {consistencyStats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </View>
          </View>
        </ScrollView>

        <AddWeightPointModal
          error={bodyWeightError}
          isSubmitting={isSubmittingWeightEntry}
          onClose={() => setIsAddWeightVisible(false)}
          onSubmit={onAddWeightEntry}
          visible={isAddWeightVisible}
        />
      </>
    </ChartsThemeContext.Provider>
  );
}
