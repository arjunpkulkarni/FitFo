import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import type { ActiveExercisePreview } from "../../types";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";
import { countProgress, computeVolume, formatClock } from "./workoutUtils";

const C = darkColors;

interface WorkoutFinishModalProps {
  exercises: ActiveExercisePreview[];
  elapsed: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WorkoutFinishModal({
  exercises,
  elapsed,
  onConfirm,
  onCancel,
}: WorkoutFinishModalProps) {
  const progress = countProgress(exercises);
  const totalVolume = computeVolume(exercises);
  const roundedVolume = Math.round(totalVolume);
  const skippedCount = exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => s.skipped).length,
    0,
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.eyebrow}>WORKOUT SUMMARY</Text>
            <Text style={styles.title}>Finish workout?</Text>
          </View>

          <View style={styles.statsGrid}>
            <StatCell label="Sets" value={String(progress.done)} />
            <StatCell label="Time" value={formatClock(elapsed)} />
            <StatCell
              label="Volume"
              value={roundedVolume > 0 ? roundedVolume.toLocaleString() : "—"}
              suffix={roundedVolume > 0 ? "lb" : undefined}
            />
          </View>

          {skippedCount > 0 ? (
            <View style={styles.skippedWarning}>
              <Text style={styles.skippedText}>
                {skippedCount} {skippedCount === 1 ? "set" : "sets"} skipped — that's okay.
              </Text>
            </View>
          ) : null}

          <Pressable onPress={onConfirm} style={styles.confirmBtn}>
            <Text style={styles.confirmBtnText}>Save & finish</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Keep going</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StatCell({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>
        {value}
        {suffix ? <Text style={styles.statSuffix}> {suffix}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: 22,
    gap: 14,
  },
  modalHeader: {
    alignItems: "center",
  },
  eyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.primary,
    marginBottom: 4,
  },
  title: {
    fontFamily: F.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: C.textPrimary,
  },
  statsGrid: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 4,
    backgroundColor: C.surfaceMuted,
    borderRadius: 16,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: F.black,
    fontSize: 20,
    letterSpacing: -0.5,
    color: C.textPrimary,
  },
  statSuffix: {
    fontFamily: F.medium,
    fontSize: 10,
    color: C.textMuted,
  },
  statLabel: {
    fontFamily: F.bold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: C.textMuted,
    marginTop: 2,
  },
  skippedWarning: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.errorSoft,
    borderWidth: 1,
    borderColor: "rgba(255,90,76,0.25)",
    alignItems: "center",
  },
  skippedText: {
    fontFamily: F.medium,
    fontSize: 12,
    color: C.textMuted,
    textAlign: "center",
  },
  confirmBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: "center",
    marginTop: 4,
  },
  confirmBtnText: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: "#fff",
  },
  cancelBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: F.medium,
    fontSize: 13,
    color: C.textMuted,
  },
});
