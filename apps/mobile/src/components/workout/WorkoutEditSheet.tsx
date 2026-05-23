import React, { useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
} from "react-native";
import type { ActiveExercisePreview } from "../../types";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";

const C = darkColors;

interface WorkoutEditSheetProps {
  exercise: ActiveExercisePreview | null;
  onClose: () => void;
  onUpdate: (exercise: ActiveExercisePreview) => void;
  onRemove: () => void;
}

export default function WorkoutEditSheet({
  exercise,
  onClose,
  onUpdate,
  onRemove,
}: WorkoutEditSheetProps) {
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (exercise) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [exercise]);

  if (!exercise) return null;

  const isTimed = exercise.sets.some((s) => s.targetDurationSec != null);
  const refSet = exercise.sets[0];

  const setTargetReps = (v: number) => {
    onUpdate({
      ...exercise,
      sets: exercise.sets.map((s) => ({ ...s, targetReps: v })),
    });
  };

  const setTargetWeight = (_v: number) => {
    // targetWeight not in types — no-op kept for parity with design
  };

  const setTargetDuration = (v: number) => {
    onUpdate({
      ...exercise,
      sets: exercise.sets.map((s) => ({ ...s, targetDurationSec: v })),
    });
  };

  const setRest = (v: number) => {
    onUpdate({ ...exercise, restSeconds: v });
  };

  const setSetCount = (v: number) => {
    const current = exercise.sets;
    if (v > current.length) {
      const last = current[current.length - 1];
      const newSets = [...current];
      for (let i = current.length; i < v; i++) {
        newSets.push({
          id: `s-${exercise.id}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          label: `Set ${i + 1}`,
          targetReps: last.targetReps,
          targetDurationSec: last.targetDurationSec,
          loggedWeight: "",
          loggedReps: "",
          completed: false,
        });
      }
      onUpdate({ ...exercise, sets: newSets });
    } else if (v < current.length && v >= 1) {
      onUpdate({ ...exercise, sets: current.slice(0, v) });
    }
  };

  const setMode = (mode: "reps" | "time") => {
    onUpdate({
      ...exercise,
      sets: exercise.sets.map((s) =>
        mode === "time"
          ? {
              ...s,
              targetDurationSec: s.targetDurationSec ?? 30,
              targetReps: null,
              loggedWeight: "",
            }
          : { ...s, targetReps: s.targetReps ?? 10, targetDurationSec: null },
      ),
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>EDIT EXERCISE</Text>
                <Text style={styles.sheetTitle}>{exercise.name}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Mode toggle */}
            <View style={styles.modeRow}>
              <Text style={styles.rowLabel}>TRACK BY</Text>
              <View style={styles.modeToggle}>
                <Pressable
                  onPress={() => setMode("reps")}
                  style={[styles.modeBtn, !isTimed && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeBtnText, !isTimed && styles.modeBtnTextActive]}>
                    Sets · Reps
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("time")}
                  style={[styles.modeBtn, isTimed && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeBtnText, isTimed && styles.modeBtnTextActive]}>
                    Sets · Time
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Set count */}
              <StepperRow
                label="Number of sets"
                hint="Use +/− on the card too"
                value={exercise.sets.length}
                min={1}
                max={20}
                onChange={setSetCount}
              />

              {isTimed ? (
                <StepperRow
                  label="Target hold time"
                  hint="seconds"
                  value={refSet.targetDurationSec ?? 30}
                  min={5}
                  max={600}
                  step={5}
                  suffix="s"
                  onChange={setTargetDuration}
                />
              ) : (
                <>
                  <StepperRow
                    label="Target reps"
                    hint="Applied to every set"
                    value={refSet.targetReps ?? 10}
                    min={1}
                    max={50}
                    onChange={setTargetReps}
                  />
                  <StepperRow
                    label="Target weight"
                    hint="Used as placeholder"
                    value={0}
                    min={0}
                    max={1000}
                    step={5}
                    suffix="lb"
                    onChange={setTargetWeight}
                  />
                </>
              )}

              <StepperRow
                label="Rest between sets"
                hint="seconds"
                value={exercise.restSeconds ?? 0}
                min={0}
                max={600}
                step={15}
                suffix="s"
                onChange={setRest}
              />

              <Pressable onPress={onRemove} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>Remove exercise from workout</Text>
              </Pressable>

              <Pressable onPress={onClose} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function StepperRow({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperLeft}>
        <Text style={styles.stepperLabel}>{label}</Text>
        <Text style={styles.stepperHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          style={[styles.stepBtn, value <= min && { opacity: 0.35 }]}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <View style={styles.stepValue}>
          <Text style={styles.stepValueText}>
            {value}
            {suffix ? (
              <Text style={styles.stepSuffix}> {suffix}</Text>
            ) : null}
          </Text>
        </View>
        <Pressable
          onPress={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          style={[styles.stepBtn, value >= max && { opacity: 0.35 }]}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderBottomWidth: 0,
    padding: 14,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "85%",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.surfaceStrong,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  sheetEyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.primary,
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: F.bold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: C.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 14,
    color: C.textMuted,
  },
  modeRow: {
    marginBottom: 14,
  },
  rowLabel: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.textMuted,
    marginBottom: 6,
  },
  modeToggle: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    backgroundColor: C.surfaceMuted,
    borderRadius: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
  },
  modeBtnActive: {
    backgroundColor: C.primary,
  },
  modeBtnText: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.textMuted,
  },
  modeBtnTextActive: {
    color: "#fff",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSoft,
    gap: 12,
  },
  stepperLeft: {
    flex: 1,
  },
  stepperLabel: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.textMuted,
    marginBottom: 2,
  },
  stepperHint: {
    fontFamily: F.regular,
    fontSize: 11,
    color: "#5b524b",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.textPrimary,
  },
  stepValue: {
    minWidth: 56,
    alignItems: "center",
  },
  stepValueText: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.textPrimary,
  },
  stepSuffix: {
    fontFamily: F.medium,
    fontSize: 11,
    color: C.textMuted,
  },
  removeBtn: {
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.error,
    alignItems: "center",
  },
  removeBtnText: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.error,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: "center",
  },
  doneBtnText: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: "#fff",
  },
});
