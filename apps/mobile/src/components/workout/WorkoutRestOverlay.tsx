import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";
import { formatClock } from "./workoutUtils";

const C = darkColors;
const RING = 110;
const STROKE = 8;
const R = RING - STROKE;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface WorkoutRestOverlayProps {
  targetSeconds: number;
  exerciseName: string;
  nextSetLabel: string;
  onDone: () => void;
  onSkip: () => void;
}

export default function WorkoutRestOverlay({
  targetSeconds,
  exerciseName,
  nextSetLabel,
  onDone,
  onSkip,
}: WorkoutRestOverlayProps) {
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const e = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(e);
      if (e >= targetSeconds) {
        clearInterval(interval);
        onDone();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [targetSeconds]);

  const remaining = Math.max(0, targetSeconds - elapsed);
  const pct = Math.min(1, elapsed / Math.max(1, targetSeconds));
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const isReady = pct >= 1;

  const adjustTimer = (deltaSeconds: number) => {
    startedAtRef.current += deltaSeconds * 1000;
  };

  return (
    <View style={styles.overlay}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.restEyebrow}>REST</Text>
          <Text style={styles.setLogged}>Set logged ✓</Text>
        </View>
        <Pressable onPress={onSkip} style={styles.skipRestBtn}>
          <Text style={styles.skipRestText}>Skip rest</Text>
        </Pressable>
      </View>

      {/* Center content */}
      <View style={styles.center}>
        {/* SVG ring */}
        <View style={styles.ringContainer}>
          <Svg width={RING * 2} height={RING * 2} style={styles.ring}>
            {/* Track */}
            <Circle
              cx={RING}
              cy={RING}
              r={R}
              fill="none"
              stroke={C.surfaceMuted}
              strokeWidth={STROKE}
            />
            {/* Progress arc */}
            <Circle
              cx={RING}
              cy={RING}
              r={R}
              fill="none"
              stroke={C.primary}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.remainingText}>{formatClock(remaining)}</Text>
            <Text style={styles.restingLabel}>{isReady ? "READY" : "RESTING"}</Text>
          </View>
        </View>

        {/* ±15s buttons */}
        <View style={styles.adjustRow}>
          <Pressable onPress={() => adjustTimer(-15)} style={styles.adjustBtn}>
            <Text style={styles.adjustBtnText}>− 15s</Text>
          </Pressable>
          <Pressable onPress={() => adjustTimer(15)} style={styles.adjustBtn}>
            <Text style={styles.adjustBtnText}>+ 15s</Text>
          </Pressable>
        </View>

        {/* Up next card */}
        <View style={styles.upNextCard}>
          <Text style={styles.upNextLabel}>UP NEXT</Text>
          <Text style={styles.upNextExercise}>{exerciseName}</Text>
          <Text style={styles.upNextSet}>{nextSetLabel}</Text>
        </View>
      </View>

      {/* Continue button */}
      <Pressable onPress={onDone} style={styles.continueBtn}>
        <Text style={styles.continueBtnText}>I'm ready — continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,8,8,0.96)",
    zIndex: 90,
    padding: 24,
    paddingBottom: 26,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  restEyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.primary,
  },
  setLogged: {
    fontFamily: F.medium,
    fontSize: 14,
    color: C.textMuted,
    marginTop: 2,
  },
  skipRestBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  skipRestText: {
    fontFamily: F.medium,
    fontSize: 12,
    color: C.textMuted,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  ringContainer: {
    width: RING * 2,
    height: RING * 2,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    transform: [{ rotate: "-90deg" }],
  },
  ringCenter: {
    alignItems: "center",
    gap: 4,
  },
  remainingText: {
    fontFamily: F.black,
    fontSize: 56,
    letterSpacing: -2,
    color: C.textPrimary,
    lineHeight: 62,
  },
  restingLabel: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: C.textMuted,
  },
  adjustRow: {
    flexDirection: "row",
    gap: 10,
  },
  adjustBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  adjustBtnText: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.textPrimary,
  },
  upNextCard: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    minWidth: 240,
  },
  upNextLabel: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.textMuted,
    marginBottom: 4,
  },
  upNextExercise: {
    fontFamily: F.bold,
    fontSize: 16,
    color: C.textPrimary,
  },
  upNextSet: {
    fontFamily: F.medium,
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  continueBtn: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: C.textPrimary,
    alignItems: "center",
  },
  continueBtnText: {
    fontFamily: F.bold,
    fontSize: 15,
    letterSpacing: 0.2,
    color: C.background,
  },
});
