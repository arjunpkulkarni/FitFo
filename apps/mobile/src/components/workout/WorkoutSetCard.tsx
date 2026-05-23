import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import type { ActiveExercisePreview, ActiveSetPreview } from "../../types";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";

const C = darkColors;
const SWIPE_THRESHOLD = 110;
const CARD_BG = "#1c1815";

interface WorkoutSetCardProps {
  exercise: ActiveExercisePreview;
  set: ActiveSetPreview;
  setIndexInExercise: number;
  exerciseIndex: number;
  isTopCard: boolean;
  offsetY: number;
  scale: number;
  zIndex: number;
  isFirstOfWorkout: boolean;
  onLog: () => void;
  onSkip: () => void;
  onBack: () => void;
  canGoBack: boolean;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onEditExercise: () => void;
  lastLiftLabel?: string | null;
  personalRecordLabel?: string | null;
}

export default function WorkoutSetCard({
  exercise,
  set,
  setIndexInExercise,
  exerciseIndex,
  isTopCard,
  offsetY,
  scale,
  zIndex,
  isFirstOfWorkout,
  onLog,
  onSkip,
  onBack,
  canGoBack,
  onWeightChange,
  onRepsChange,
  onAddSet,
  onRemoveSet,
  onEditExercise,
  lastLiftLabel,
  personalRecordLabel,
}: WorkoutSetCardProps) {
  const isTimed = set.targetDurationSec != null;
  const canCommit = isTimed
    ? Boolean(String(set.loggedReps).trim())
    : Boolean(String(set.loggedWeight).trim()) && Boolean(String(set.loggedReps).trim());

  const [hasDragged, setHasDragged] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const canCommitSV = useSharedValue(canCommit);
  useEffect(() => {
    canCommitSV.value = canCommit;
  }, [canCommit]);

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetX([-8, 8])
    .onStart(() => {
      runOnJS(setHasDragged)(true);
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.3;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD && canCommitSV.value) {
        translateX.value = withTiming(600, { duration: 240 }, () => {
          runOnJS(onLog)();
        });
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-600, { duration: 240 }, () => {
          runOnJS(onSkip)();
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardAnimStyle = useAnimatedStyle(() => {
    if (!isTopCard) {
      return {
        transform: [{ translateY: offsetY }, { scale }],
        opacity: 1,
      };
    }
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${(translateX.value * 0.04).toFixed(3)}deg` },
      ],
    };
  });

  const logHintStyle = useAnimatedStyle(() => {
    const opacity = Math.max(0, Math.min(1, translateX.value / SWIPE_THRESHOLD));
    return {
      opacity,
      transform: [
        { rotate: "12deg" },
        { scale: 0.9 + opacity * 0.2 },
      ],
    };
  });

  const skipHintStyle = useAnimatedStyle(() => {
    const opacity = Math.max(0, Math.min(1, -translateX.value / SWIPE_THRESHOLD));
    return {
      opacity,
      transform: [
        { rotate: "-12deg" },
        { scale: 0.9 + opacity * 0.2 },
      ],
    };
  });

  const totalSets = exercise.sets.length;
  const prText = getPersonalRecordText(lastLiftLabel, personalRecordLabel);

  const handleBackPress = () => {
    if (!canGoBack) return;
    onBack();
  };

  const handleLogPress = () => {
    if (!canCommit) return;
    translateX.value = withTiming(600, { duration: 240 }, () => {
      runOnJS(onLog)();
    });
  };

  if (!isTopCard) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { zIndex }, cardAnimStyle]}
      >
        <View style={[styles.card, styles.cardBackplate]} />
      </Animated.View>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        pointerEvents="auto"
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex },
          cardAnimStyle,
        ]}
      >
        <View style={styles.card}>
          {/* SKIP hint (fades in on left swipe) */}
          <Animated.View style={[styles.skipHint, skipHintStyle]} pointerEvents="none">
            <Text style={styles.skipHintText}>SKIP</Text>
          </Animated.View>

          {/* LOG hint (fades in on right swipe) */}
          <Animated.View style={[styles.logHint, logHintStyle]} pointerEvents="none">
            <Text style={styles.logHintText}>LOG</Text>
          </Animated.View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.eyebrow}>
                {exercise.blockName || "Exercise"} · {String(exerciseIndex + 1).padStart(2, "0")}
              </Text>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
            </View>
            <Pressable onPress={onEditExercise} style={styles.editBtn} hitSlop={8}>
              <Text style={styles.editBtnDots}>•••</Text>
            </Pressable>
          </View>

          {/* Set pill + dots + +/− buttons */}
          <View style={styles.setRow}>
            <View style={styles.setPill}>
              <Text style={styles.setPillText}>
                SET {setIndexInExercise + 1} OF {totalSets}
              </Text>
            </View>
            <View style={styles.dots}>
              {exercise.sets.map((s, i) => {
                const isCurrent = i === setIndexInExercise;
                let dotColor: string = C.surfaceStrong;
                if (s.completed) dotColor = C.success;
                else if (s.skipped) dotColor = C.textMuted;
                else if (isCurrent) dotColor = C.primary;
                return (
                  <View
                    key={s.id}
                    style={[
                      styles.dot,
                      { width: isCurrent ? 18 : 6, backgroundColor: dotColor },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.setCountBtns}>
              <Pressable
                onPress={onRemoveSet}
                disabled={totalSets <= 1}
                style={[styles.setCountBtn, totalSets <= 1 && styles.setCountBtnDisabled]}
                hitSlop={4}
              >
                <Text style={styles.setCountBtnText}>−</Text>
              </Pressable>
              <Pressable onPress={onAddSet} style={styles.setCountBtn} hitSlop={4}>
                <Text style={styles.setCountBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* Last lift hint */}
          {lastLiftLabel || prText ? (
            <View style={styles.lastLiftRow}>
              {lastLiftLabel ? (
                <View style={styles.lastLiftLeft}>
                  <Text style={styles.lastLiftLabel}>LAST</Text>
                  <Text style={styles.lastLiftValue} numberOfLines={1}>
                    {lastLiftLabel}
                  </Text>
                </View>
              ) : null}
              {prText ? (
                <Text style={styles.personalRecordValue} numberOfLines={1}>
                  {prText}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Inputs */}
          <View style={styles.inputsArea}>
            {isTimed ? (
              <BigInput
                label="HOLD TIME"
                unit="sec"
                value={set.loggedReps}
                placeholder={String(set.targetDurationSec ?? 0)}
                onChangeText={(v) => onRepsChange(v.replace(/\D/g, ""))}
              />
            ) : (
              <View style={styles.inputRow}>
                <BigInput
                  label="WEIGHT"
                  unit="lb"
                  value={set.loggedWeight}
                  placeholder="0"
                  onChangeText={(v) => onWeightChange(v.replace(/[^0-9.]/g, ""))}
                  flex={1.2}
                />
                <View style={{ width: 8 }} />
                <BigInput
                  label="REPS"
                  unit={set.targetReps ? `/ ${set.targetReps}` : ""}
                  value={set.loggedReps}
                  placeholder={set.targetReps ? String(set.targetReps) : "0"}
                  onChangeText={(v) => onRepsChange(v.replace(/\D/g, ""))}
                  flex={1}
                />
              </View>
            )}
            {isFirstOfWorkout && isTopCard && !hasDragged ? <SwipeHint /> : null}
          </View>

          {/* Bottom buttons */}
          <View style={styles.bottomRow}>
            <Pressable
              onPress={handleBackPress}
              disabled={!canGoBack}
              style={[styles.backBtn, !canGoBack && styles.backBtnDisabled]}
            >
              <Text style={[styles.backBtnText, !canGoBack && styles.backBtnTextDisabled]}>
                ← Back
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogPress}
              disabled={!canCommit}
              style={[styles.logBtn, !canCommit && styles.logBtnDisabled]}
            >
              <Text style={[styles.logBtnText, !canCommit && styles.logBtnTextDisabled]}>
                LOG SET →
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function getPersonalRecordText(
  lastLiftLabel?: string | null,
  personalRecordLabel?: string | null,
) {
  const pr = personalRecordLabel?.trim();
  if (!pr) return null;
  return normalizeLiftLabel(pr) === normalizeLiftLabel(lastLiftLabel)
    ? "PR"
    : `PR · ${pr}`;
}

function normalizeLiftLabel(label?: string | null) {
  return String(label ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*×\s*/g, "x")
    .replace(/\s+reps?\b/g, "")
    .trim();
}

function BigInput({
  label,
  unit,
  value,
  placeholder,
  onChangeText,
  flex,
}: {
  label: string;
  unit: string;
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  flex?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.bigInput,
        focused && styles.bigInputFocused,
        flex != null ? { flex } : {},
      ]}
    >
      <Text style={styles.bigInputLabel}>{label}</Text>
      <View style={styles.bigInputValueRow}>
        <TextInput
          style={styles.bigInputValue}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectTextOnFocus
        />
        {unit ? <Text style={styles.bigInputUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function SwipeHint() {
  return (
    <View style={styles.swipeHint}>
      <Text style={[styles.swipeHintPart, { color: C.textMuted }]}>← SKIP</Text>
      <Text style={[styles.swipeHintPart, { color: C.primaryBright }]}>SWIPE</Text>
      <Text style={[styles.swipeHintPart, { color: C.success }]}>LOG →</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.borderSoft,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 10,
    padding: 18,
    paddingBottom: 14,
    overflow: "hidden",
  },
  cardBackplate: {
    backgroundColor: "#14110f",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 1,
  },
  skipHint: {
    position: "absolute",
    top: 22,
    left: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.error,
    backgroundColor: "rgba(255,90,76,0.08)",
    zIndex: 10,
  },
  skipHintText: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: C.error,
  },
  logHint: {
    position: "absolute",
    top: 22,
    right: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.success,
    backgroundColor: "rgba(49,196,141,0.08)",
    zIndex: 10,
  },
  logHintText: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: C.success,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: C.primary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  exerciseName: {
    fontFamily: F.bold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: C.textPrimary,
  },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editBtnDots: {
    fontSize: 14,
    color: C.textMuted,
    letterSpacing: 1,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  setPill: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  setPillText: {
    fontFamily: F.bold,
    fontSize: 12,
    letterSpacing: 0.2,
    color: "#fff",
  },
  dots: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    flex: 1,
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
  setCountBtns: {
    flexDirection: "row",
    gap: 4,
    marginLeft: "auto",
  },
  setCountBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  setCountBtnDisabled: {
    opacity: 0.35,
  },
  setCountBtnText: {
    fontSize: 16,
    fontFamily: F.bold,
    color: C.textPrimary,
  },
  lastLiftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: C.borderSoft,
    marginTop: 12,
  },
  lastLiftLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lastLiftLabel: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: C.textMuted,
  },
  lastLiftValue: {
    fontFamily: F.medium,
    fontSize: 13,
    color: C.textPrimary,
  },
  personalRecordValue: {
    marginLeft: "auto",
    flexShrink: 0,
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: C.primaryBright,
  },
  inputsArea: {
    flex: 1,
    justifyContent: "center",
    marginTop: 12,
    gap: 12,
  },
  inputRow: {
    flexDirection: "row",
  },
  bigInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.borderSoft,
  },
  bigInputFocused: {
    backgroundColor: "rgba(255,111,34,0.06)",
    borderColor: C.primary,
  },
  bigInputLabel: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.textMuted,
    marginBottom: 4,
  },
  bigInputValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  bigInputValue: {
    flex: 1,
    fontFamily: F.black,
    fontSize: 40,
    letterSpacing: -1.2,
    color: C.textPrimary,
    padding: 0,
    lineHeight: 48,
  },
  bigInputUnit: {
    fontFamily: F.medium,
    fontSize: 13,
    color: C.textMuted,
  },
  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,111,34,0.06)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,111,34,0.35)",
    marginTop: 4,
  },
  swipeHintPart: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  backBtn: {
    paddingHorizontal: 16,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnDisabled: {
    opacity: 0.35,
  },
  backBtnText: {
    fontFamily: F.medium,
    fontSize: 13,
    color: C.textPrimary,
  },
  backBtnTextDisabled: {
    color: C.textMuted,
  },
  logBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 11,
    elevation: 4,
  },
  logBtnDisabled: {
    backgroundColor: C.surfaceMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  logBtnText: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: 0.3,
    color: "#fff",
  },
  logBtnTextDisabled: {
    color: "#5b524b",
  },
});
