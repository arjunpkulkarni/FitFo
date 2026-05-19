import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getTheme, type ThemeMode } from "../theme";

interface InstagramHandleScreenProps {
  error?: string | null;
  isSubmitting?: boolean;
  onContinue: (handle: string) => void;
  onSkip: () => void;
  themeMode?: ThemeMode;
}

const INSTAGRAM_HANDLE_RE = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;

function normalizeInstagramInput(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "");
}

function getInstagramHint(handle: string): string {
  if (!handle) {
    return "Letters, numbers, periods, and underscores only.";
  }
  if (handle.length > 30) {
    return "Handle is too long (30 characters max).";
  }
  if (!INSTAGRAM_HANDLE_RE.test(handle)) {
    return "Cannot start or end with a period or underscore.";
  }
  return "Looks good.";
}

export function InstagramHandleScreen({
  error,
  isSubmitting = false,
  onContinue,
  onSkip,
  themeMode = "dark",
}: InstagramHandleScreenProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const [handle, setHandle] = useState("");

  const cleanHandle = useMemo(() => normalizeInstagramInput(handle), [handle]);
  const isValid = INSTAGRAM_HANDLE_RE.test(cleanHandle);
  const hint = getInstagramHint(cleanHandle);

  const handleChange = (value: string) => {
    setHandle(normalizeInstagramInput(value));
  };

  const handleSubmit = () => {
    if (!isValid || isSubmitting) {
      return;
    }
    onContinue(cleanHandle);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.card}>
        <View style={styles.iconShell}>
          <Ionicons color={theme.colors.primary} name="logo-instagram" size={28} />
        </View>
        <Text style={styles.title}>Add your Instagram?</Text>
        <Text style={styles.subtitle}>
          Connect your handle so Fitfo can personalize your profile and future social
          features.
        </Text>

        <View style={styles.inputShell}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            keyboardAppearance={theme.mode === "dark" ? "dark" : "light"}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            placeholder="yourhandle"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            style={styles.input}
            value={handle}
          />
        </View>

        <Text style={[styles.hint, isValid ? styles.hintValid : null]}>{hint}</Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!isValid || isSubmitting}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            (!isValid || isSubmitting) && styles.primaryButtonDisabled,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.colors.surface} size="small" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
            </>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.skipButton,
            isSubmitting && styles.skipButtonDisabled,
            pressed && styles.skipButtonPressed,
          ]}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      paddingHorizontal: 24,
    },
    card: {
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      padding: 24,
      gap: 14,
      ...theme.shadows.card,
    },
    iconShell: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 34,
      lineHeight: 38,
      fontFamily: "ClashDisplay-Semibold",
      fontWeight: "800",
      letterSpacing: -1,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    inputShell: {
      minHeight: 58,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      gap: 4,
    },
    atSign: {
      color: theme.colors.textMuted,
      fontSize: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    input: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 19,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      paddingVertical: 12,
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    hintValid: {
      color: theme.colors.success,
    },
    errorCard: {
      borderRadius: 14,
      backgroundColor: theme.colors.errorSoft,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonPressed: {
      opacity: 0.88,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    skipButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    skipButtonDisabled: {
      opacity: 0.5,
    },
    skipButtonPressed: {
      opacity: 0.7,
    },
    skipButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
  });
