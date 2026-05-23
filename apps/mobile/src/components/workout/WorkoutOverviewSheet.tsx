import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Animated,
} from "react-native";
import type { ActiveExercisePreview } from "../../types";
import { darkColors } from "../../theme";
import { F } from "../../lib/fonts";

const C = darkColors;

interface WorkoutOverviewSheetProps {
  title: string;
  exercises: ActiveExercisePreview[];
  onClose: () => void;
  onEditExercise: (id: string) => void;
  onRemoveExercise: (id: string) => void;
  onAddExercise: (name: string) => void;
}

export default function WorkoutOverviewSheet({
  title,
  exercises,
  onClose,
  onEditExercise,
  onRemoveExercise,
  onAddExercise,
}: WorkoutOverviewSheetProps) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  useEffect(() => {
    if (adding) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [adding]);

  const submitAdd = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddExercise(trimmed);
      setNewName("");
      setAdding(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>WORKOUT</Text>
                <Text style={styles.sheetTitle}>{title}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.list}>
                {exercises.map((ex, idx) => {
                  const done = ex.sets.filter((s) => s.completed).length;
                  const skippedCount = ex.sets.filter((s) => s.skipped).length;
                  const total = ex.sets.length;
                  const allDone = done + skippedCount === total;
                  const isConfirming = confirmRemoveId === ex.id;

                  return (
                    <View
                      key={ex.id}
                      style={[
                        styles.exerciseRow,
                        isConfirming && styles.exerciseRowDanger,
                      ]}
                    >
                      <Pressable
                        onPress={() => onEditExercise(ex.id)}
                        style={styles.exerciseMain}
                      >
                        <View
                          style={[
                            styles.badge,
                            allDone && styles.badgeDone,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              allDone && styles.badgeTextDone,
                            ]}
                          >
                            {allDone ? "✓" : String(idx + 1).padStart(2, "0")}
                          </Text>
                        </View>
                        <View style={styles.exerciseInfo}>
                          <Text style={styles.exerciseName} numberOfLines={1}>
                            {ex.name}
                          </Text>
                          <Text style={styles.exerciseMeta}>
                            {done}/{total} sets · {ex.restSeconds ?? 0}s rest
                            {skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}
                          </Text>
                        </View>
                        <View style={styles.exDots}>
                          {ex.sets.map((s) => {
                            let bg: string = C.borderSoft;
                            if (s.completed) bg = C.success;
                            else if (s.skipped) bg = "#5b524b";
                            return (
                              <View
                                key={s.id}
                                style={[styles.exDot, { backgroundColor: bg }]}
                              />
                            );
                          })}
                        </View>
                      </Pressable>

                      {isConfirming ? (
                        <View style={styles.confirmBtns}>
                          <Pressable
                            onPress={() => setConfirmRemoveId(null)}
                            style={styles.keepBtn}
                          >
                            <Text style={styles.keepBtnText}>Keep</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              onRemoveExercise(ex.id);
                              setConfirmRemoveId(null);
                            }}
                            style={styles.confirmRemoveBtn}
                          >
                            <Text style={styles.confirmRemoveBtnText}>🗑</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => setConfirmRemoveId(ex.id)}
                          style={styles.trashBtn}
                          hitSlop={4}
                        >
                          <Text style={styles.trashBtnText}>🗑</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}

                {adding ? (
                  <View style={styles.addRow}>
                    <View style={styles.addBadge}>
                      <Text style={styles.addBadgeText}>+</Text>
                    </View>
                    <TextInput
                      ref={inputRef}
                      value={newName}
                      onChangeText={setNewName}
                      onSubmitEditing={submitAdd}
                      returnKeyType="done"
                      placeholder="Exercise name (e.g. Lat Pulldown)"
                      placeholderTextColor={C.textMuted}
                      style={styles.addInput}
                    />
                    <Pressable
                      onPress={() => {
                        setAdding(false);
                        setNewName("");
                      }}
                      style={styles.cancelAddBtn}
                      hitSlop={4}
                    >
                      <Text style={styles.cancelAddBtnText}>✕</Text>
                    </Pressable>
                    <Pressable
                      onPress={submitAdd}
                      disabled={!newName.trim()}
                      style={[
                        styles.confirmAddBtn,
                        !newName.trim() && styles.confirmAddBtnDisabled,
                      ]}
                      hitSlop={4}
                    >
                      <Text style={styles.confirmAddBtnText}>✓</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setAdding(true)}
                    style={styles.addExerciseBtn}
                  >
                    <View style={styles.addExerciseBadge}>
                      <Text style={styles.addExercisePlus}>+</Text>
                    </View>
                    <View>
                      <Text style={styles.addExerciseTitle}>Add exercise</Text>
                      <Text style={styles.addExerciseHint}>Append to this workout</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
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
    paddingHorizontal: 18,
    paddingBottom: 34,
    maxHeight: "88%",
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
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetEyebrow: {
    fontFamily: F.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: C.primary,
  },
  sheetTitle: {
    fontFamily: F.bold,
    fontSize: 18,
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
  list: {
    gap: 8,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1,
    borderColor: C.borderSoft,
  },
  exerciseRowDanger: {
    backgroundColor: C.errorSoft,
    borderColor: "rgba(255,90,76,0.4)",
  },
  exerciseMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgeDone: {
    backgroundColor: C.successSoft,
  },
  badgeText: {
    fontFamily: F.bold,
    fontSize: 12,
    color: C.textMuted,
  },
  badgeTextDone: {
    color: C.success,
  },
  exerciseInfo: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    fontFamily: F.bold,
    fontSize: 14,
    color: C.textPrimary,
  },
  exerciseMeta: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  exDots: {
    flexDirection: "row",
    gap: 3,
    flexShrink: 0,
  },
  exDot: {
    width: 14,
    height: 4,
    borderRadius: 999,
  },
  trashBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trashBtnText: {
    fontSize: 14,
  },
  confirmBtns: {
    flexDirection: "row",
    gap: 4,
    flexShrink: 0,
  },
  keepBtn: {
    width: 40,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  keepBtnText: {
    fontFamily: F.bold,
    fontSize: 11,
    color: C.textMuted,
  },
  confirmRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.error,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmRemoveBtnText: {
    fontSize: 14,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: C.surfaceMuted,
    borderWidth: 1.5,
    borderColor: C.primary,
    marginTop: 4,
  },
  addBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#2a1a10",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addBadgeText: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.primaryBright,
  },
  addInput: {
    flex: 1,
    fontFamily: F.medium,
    fontSize: 14,
    color: C.textPrimary,
    padding: 0,
    minWidth: 0,
  },
  cancelAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cancelAddBtnText: {
    fontSize: 12,
    color: C.textMuted,
  },
  confirmAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  confirmAddBtnDisabled: {
    backgroundColor: C.surfaceStrong,
  },
  confirmAddBtnText: {
    fontSize: 14,
    color: "#fff",
  },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.borderSoft,
    marginTop: 4,
  },
  addExerciseBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addExercisePlus: {
    fontSize: 20,
    fontFamily: F.bold,
    color: C.primary,
  },
  addExerciseTitle: {
    fontFamily: F.bold,
    fontSize: 14,
    color: C.textPrimary,
  },
  addExerciseHint: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
});
