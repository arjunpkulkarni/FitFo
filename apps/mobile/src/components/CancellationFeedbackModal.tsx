/**
 * "Help us improve before you cancel" sheet shown when an active subscriber
 * taps Manage / Cancel. Captures one reason + free-text and posts to a
 * Google Sheet via the Apps Script webhook. Per Apple's guidelines we must
 * NOT block cancellation if the user skips feedback — both buttons proceed
 * to Apple Subscriptions.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

import { CANCEL_REASONS, type CancelReasonId } from "../lib/cancelFeedback";
import { getTheme, type ThemeMode } from "../theme";

export interface CancellationFeedbackSubmit {
  reason: CancelReasonId;
  freeText: string;
}

interface CancellationFeedbackModalProps {
  visible: boolean;
  isSubmitting?: boolean;
  /**
   * Fired with the chosen reason + free text. Caller is responsible for
   * posting to the webhook AND continuing to Apple Subscriptions.
   */
  onSubmit: (payload: CancellationFeedbackSubmit) => void;
  /** Fired when the user taps "Skip and continue to cancellation". */
  onSkip: () => void;
  /** Fired on backdrop tap / hardware back: dismiss without proceeding. */
  onClose: () => void;
  themeMode?: ThemeMode;
}

const MAX_FREE_TEXT = 600;

export function CancellationFeedbackModal({
  visible,
  isSubmitting = false,
  onSubmit,
  onSkip,
  onClose,
  themeMode = "dark",
}: CancellationFeedbackModalProps) {
  const theme = getTheme(themeMode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [freeText, setFreeText] = useState("");
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!visible) {
      // Reset selection only after the modal animates out so the user sees
      // their tapped chip stay highlighted through the fade.
      const handle = setTimeout(() => {
        setReason(null);
        setFreeText("");
      }, 280);
      cardOpacity.setValue(0);
      cardTranslate.setValue(16);
      return () => clearTimeout(handle);
    }

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslate, {
        toValue: 0,
        friction: 7,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardTranslate, visible]);

  const handleSubmit = () => {
    if (!reason || isSubmitting) {
      return;
    }
    onSubmit({ reason, freeText: freeText.trim() });
  };

  const characterCounter = `${freeText.length}/${MAX_FREE_TEXT}`;
  const submitDisabled = !reason || isSubmitting;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdropPressable}
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 48 : 72}
            style={styles.blur}
            tint={theme.mode === "dark" ? "dark" : "light"}
          />
          <View
            pointerEvents="none"
            style={[
              styles.blurTint,
              theme.mode === "dark"
                ? { backgroundColor: "rgba(0, 0, 0, 0.42)" }
                : { backgroundColor: "rgba(18, 25, 48, 0.22)" },
            ]}
          />
        </Pressable>

        <View pointerEvents="box-none" style={styles.cardRail}>
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslate }],
              },
            ]}
          >
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons
                color={theme.colors.textMuted}
                name="close"
                size={20}
              />
            </Pressable>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.headerIcon}>
                <Ionicons
                  color={theme.colors.primary}
                  name="megaphone-outline"
                  size={22}
                />
              </View>
              <Text accessibilityRole="header" style={styles.title}>
                Help us improve before you cancel
              </Text>
              <Text style={styles.subtitle}>
                We just launched and your honest feedback shapes what we
                build next. Mind sharing why?
              </Text>

              <View style={styles.reasonsList}>
                {CANCEL_REASONS.map((entry) => {
                  const isSelected = entry.id === reason;
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setReason(entry.id)}
                      style={({ pressed }) => [
                        styles.reasonChip,
                        isSelected ? styles.reasonChipSelected : null,
                        pressed ? styles.reasonChipPressed : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.reasonRadio,
                          isSelected ? styles.reasonRadioSelected : null,
                        ]}
                      >
                        {isSelected ? (
                          <View style={styles.reasonRadioDot} />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.reasonLabel,
                          isSelected ? styles.reasonLabelSelected : null,
                        ]}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.textBoxBlock}>
                <Text style={styles.textBoxLabel}>
                  Anything else? (optional)
                </Text>
                <TextInput
                  editable={!isSubmitting}
                  maxLength={MAX_FREE_TEXT}
                  multiline
                  numberOfLines={4}
                  onChangeText={setFreeText}
                  placeholder="We're a tiny team and we read every word. Tell us what would have made Fitfo great for your training."
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.textBox}
                  textAlignVertical="top"
                  value={freeText}
                />
                <Text style={styles.charCounter}>{characterCounter}</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitDisabled }}
                disabled={submitDisabled}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  submitDisabled ? styles.primaryButtonDisabled : null,
                  pressed && !submitDisabled
                    ? styles.primaryButtonPressed
                    : null,
                ]}
              >
                {isSubmitting ? (
                  <View style={styles.buttonRow}>
                    <ActivityIndicator color="#1A0A02" size="small" />
                    <Text style={styles.primaryButtonText}>Sending…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Submit feedback & continue
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onSkip}
                style={({ pressed }) => [
                  styles.skipButton,
                  pressed && !isSubmitting ? styles.skipButtonPressed : null,
                ]}
              >
                <Text style={styles.skipButtonText}>
                  Skip and continue to cancellation
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    backdropPressable: {
      ...StyleSheet.absoluteFillObject,
    },
    blur: {
      ...StyleSheet.absoluteFillObject,
    },
    blurTint: {
      ...StyleSheet.absoluteFillObject,
    },
    cardRail: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 28,
    },
    card: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "92%",
      alignSelf: "center",
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
      overflow: "hidden",
    },
    scrollContent: {
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 22,
    },
    closeButton: {
      position: "absolute",
      top: 14,
      right: 14,
      zIndex: 5,
      height: 32,
      width: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
    },
    headerIcon: {
      height: 46,
      width: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      backgroundColor: theme.colors.surfaceMuted,
      marginBottom: 14,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 22,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.35,
      textAlign: "center",
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 18,
    },
    reasonsList: {
      gap: 8,
    },
    reasonChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    reasonChipSelected: {
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 138, 76, 0.16)"
          : "rgba(255, 138, 76, 0.12)",
      borderColor: theme.colors.primary,
    },
    reasonChipPressed: {
      opacity: 0.85,
    },
    reasonRadio: {
      height: 20,
      width: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    reasonRadioSelected: {
      borderColor: theme.colors.primary,
    },
    reasonRadioDot: {
      height: 10,
      width: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
    },
    reasonLabel: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "satoshi",
      fontWeight: "500",
    },
    reasonLabelSelected: {
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    textBoxBlock: {
      marginTop: 16,
      gap: 6,
    },
    textBoxLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    textBox: {
      minHeight: 96,
      maxHeight: 160,
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.colors.textPrimary,
      fontSize: 15,
      lineHeight: 21,
    },
    charCounter: {
      color: theme.colors.textMuted,
      fontSize: 11,
      textAlign: "right",
    },
    primaryButton: {
      marginTop: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonPressed: {
      opacity: 0.92,
    },
    primaryButtonText: {
      color: "#1A0A02",
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    skipButton: {
      marginTop: 10,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },
    skipButtonPressed: {
      opacity: 0.7,
    },
    skipButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      fontFamily: "satoshi",
      fontWeight: "500",
      textDecorationLine: "underline",
    },
  });
