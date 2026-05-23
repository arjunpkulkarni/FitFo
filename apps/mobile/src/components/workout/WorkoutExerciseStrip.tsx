import React, { useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import type { FlatList } from "react-native-gesture-handler";
import type { ActiveExercisePreview } from "../../types";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";

const C = darkColors;
const TEXT_DIM = "#5b524b";

interface WorkoutExerciseStripProps {
  exercises: ActiveExercisePreview[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  onReorder: (exercises: ActiveExercisePreview[]) => void;
}

export default function WorkoutExerciseStrip({
  exercises,
  currentExerciseIndex,
  currentSetIndex,
  onReorder,
}: WorkoutExerciseStripProps) {
  const listRef = useRef<FlatList<ActiveExercisePreview> | null>(null);
  const chipWidths = useRef<number[]>([]);

  const scrollToCurrent = () => {
    const offsets = chipWidths.current;
    if (!offsets.length) return;
    let offset = 0;
    for (let i = 0; i < currentExerciseIndex; i++) {
      offset += offsets[i] ?? 86;
    }
    listRef.current?.scrollToOffset({
      offset: Math.max(0, offset - 80),
      animated: true,
    });
  };

  useEffect(() => {
    const t = setTimeout(scrollToCurrent, 100);
    return () => clearTimeout(t);
  }, [currentExerciseIndex]);

  const renderItem = useCallback(
    ({ item: ex, drag, getIndex, isActive }: RenderItemParams<ActiveExercisePreview>) => {
      const idx = getIndex() ?? exercises.findIndex((item) => item.id === ex.id);
      const isCurrent = idx === currentExerciseIndex;
      const done = ex.sets.filter((s) => s.completed).length;
      const total = ex.sets.length;
      const allDone = done === total;

      return (
        <Pressable
          key={ex.id}
          onLongPress={drag}
          delayLongPress={140}
          onLayout={(e) => {
            chipWidths.current[idx] = e.nativeEvent.layout.width + 6;
          }}
          style={[
            styles.chip,
            isCurrent && styles.chipCurrent,
            isActive && styles.chipDragging,
          ]}
        >
          <View style={styles.chipTopRow}>
            <Text style={styles.chipIndex}>{String(idx + 1).padStart(2, "0")}</Text>
            {allDone ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.chipName} numberOfLines={1}>
            {ex.name}
          </Text>
          <View style={styles.chipDots}>
            {ex.sets.map((s, si) => {
              let bg: string = C.borderSoft;
              if (s.completed) bg = C.success;
              else if (s.skipped) bg = TEXT_DIM;
              else if (isCurrent && si === currentSetIndex) bg = C.primary;
              return (
                <View
                  key={s.id}
                  style={[styles.dot, { backgroundColor: bg }]}
                />
              );
            })}
          </View>
        </Pressable>
      );
    },
    [currentExerciseIndex, currentSetIndex, exercises],
  );

  return (
    <DraggableFlatList
      ref={listRef}
      horizontal
      data={exercises}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      activationDistance={12}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      onDragEnd={({ data, from, to }) => {
        if (from !== to) onReorder(data);
      }}
    />
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 6,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 7,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.borderSoft,
    minWidth: 80,
    gap: 4,
  },
  chipCurrent: {
    backgroundColor: C.surfaceStrong,
    borderColor: C.primary,
  },
  chipDragging: {
    backgroundColor: C.surfaceStrong,
    opacity: 0.92,
    transform: [{ scale: 1.03 }],
  },
  chipTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipIndex: {
    fontFamily: F.bold,
    fontSize: 9,
    letterSpacing: 1,
    color: C.textMuted,
  },
  checkmark: {
    fontSize: 10,
    color: C.success,
  },
  chipName: {
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: -0.1,
    color: C.textPrimary,
    maxWidth: 110,
  },
  chipDots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 12,
    height: 3,
    borderRadius: 999,
  },
});
