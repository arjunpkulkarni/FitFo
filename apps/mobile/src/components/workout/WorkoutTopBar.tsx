import React, { type RefObject } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";
import { formatClock } from "./workoutUtils";

const C = darkColors;

interface WorkoutTopBarProps {
  title: string;
  elapsed: number;
  done: number;
  total: number;
  isPaused: boolean;
  onTogglePause: () => void;
  /** When set, renders a "view source video" button that opens the URL. */
  sourceUrl?: string | null;
  onOpenSource?: () => void;
  onCoach: () => void;
  onOverview: () => void;
  onFinish: () => void;
  coachButtonRef?: RefObject<View | null>;
}

export default function WorkoutTopBar({
  title,
  elapsed,
  done,
  total,
  isPaused,
  onTogglePause,
  sourceUrl,
  onOpenSource,
  onCoach,
  onOverview,
  onFinish,
  coachButtonRef,
}: WorkoutTopBarProps) {
  const progress = total > 0 ? done / total : 0;
  const finishActive = done > 0;
  const showSourceButton = Boolean(sourceUrl) && Boolean(onOpenSource);

  return (
    <View style={styles.container}>
      {/* Row 1: pause | coach + overview + finish */}
      <View style={styles.row1}>
        <View style={styles.leftButtons}>
          <Pressable
            onPress={onTogglePause}
            style={[styles.iconBtn, isPaused && styles.iconBtnActive]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isPaused ? "Resume workout" : "Pause workout"}
          >
            {isPaused ? (
              <View style={styles.playIcon} />
            ) : (
              <View style={styles.pauseIcon}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            )}
          </Pressable>

          {showSourceButton ? (
            <Pressable
              onPress={onOpenSource}
              style={styles.iconBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open original source video"
            >
              <Text style={styles.iconBtnText}>🎬</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.rightButtons}>
          <Pressable
            ref={coachButtonRef as RefObject<View>}
            onPress={onCoach}
            style={styles.iconBtn}
          >
            <Text style={styles.iconBtnText}>💬</Text>
          </Pressable>

          <Pressable onPress={onOverview} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>≡</Text>
          </Pressable>

          <Pressable
            onPress={onFinish}
            style={[styles.finishBtn, finishActive && styles.finishBtnActive]}
          >
            <Text
              style={[styles.finishBtnText, finishActive && styles.finishBtnTextActive]}
            >
              FINISH
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Row 2: timer + title | sets counter */}
      <View style={styles.row2}>
        <View style={styles.row2Left}>
          <Text style={[styles.eyebrow, isPaused && styles.eyebrowPaused]}>
            {formatClock(elapsed)} · {isPaused ? "PAUSED" : "IN PROGRESS"}
          </Text>
          <Text style={styles.workoutTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={styles.setsCounter}>
          {done}/{total} SETS
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(0, progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
  },
  leftButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  iconBtnText: {
    fontSize: 14,
    color: C.textMuted,
  },
  pauseIcon: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  pauseBar: {
    width: 3,
    height: 11,
    borderRadius: 2,
    backgroundColor: C.textMuted,
  },
  playIcon: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#fff",
    marginLeft: 2,
  },
  rightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  finishBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  finishBtnActive: {
    backgroundColor: C.primary,
  },
  finishBtnText: {
    fontFamily: F.bold,
    fontSize: 12,
    letterSpacing: 0.3,
    color: C.textMuted,
  },
  finishBtnTextActive: {
    color: "#fff",
  },
  row2: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },
  row2Left: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.primary,
  },
  eyebrowPaused: {
    color: C.textMuted,
  },
  workoutTitle: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: C.textPrimary,
    marginTop: 1,
  },
  setsCounter: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: C.textMuted,
  },
  progressTrack: {
    height: 3,
    backgroundColor: C.surfaceMuted,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: 3,
    borderRadius: 999,
    backgroundColor: C.primary,
  },
});
