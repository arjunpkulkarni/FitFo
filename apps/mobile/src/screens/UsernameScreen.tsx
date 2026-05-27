import { useEffect, useMemo, useState } from "react";
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

import { checkUsername } from "../lib/api";
import { getTheme, type ThemeMode } from "../theme";

interface UsernameScreenProps {
  /**
   * Bearer token used for the live availability lookup. When omitted, the
   * screen still works — it just skips the live check and relies on the
   * server's 409 response when the user submits.
   */
  accessToken?: string | null;
  error?: string | null;
  isSubmitting?: boolean;
  onSubmit: (username: string) => void;
  themeMode?: ThemeMode;
}

const AVAILABILITY_DEBOUNCE_MS = 350;

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])$/;

function normalizeUsernameInput(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function getResolvedHint(
  username: string,
  isFormatValid: boolean,
  availability: "checking" | "available" | "taken" | "error" | null,
): string {
  if (!username) {
    return "Use 3-20 letters, numbers, or underscores.";
  }
  if (username.length < 3) {
    return "Username is too short.";
  }
  if (username.length > 20) {
    return "Username is too long.";
  }
  if (username.startsWith("_") || username.endsWith("_")) {
    return "Do not start or end with an underscore.";
  }
  if (!isFormatValid) {
    return "Only letters, numbers, and underscores are allowed.";
  }
  if (availability === "checking") {
    return "Checking availability…";
  }
  if (availability === "taken") {
    return "Already taken — pick a different handle.";
  }
  if (availability === "error") {
    return "Could not verify right now — we'll try again on submit.";
  }
  if (availability === "available") {
    return "Available.";
  }
  return "Looks good.";
}

export function UsernameScreen({
  accessToken,
  error,
  isSubmitting = false,
  onSubmit,
  themeMode = "dark",
}: UsernameScreenProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<
    "checking" | "available" | "taken" | "error" | null
  >(null);

  const cleanUsername = useMemo(() => normalizeUsernameInput(username), [username]);
  const isFormatValid = USERNAME_RE.test(cleanUsername);
  // We allow submit when the format is valid even if the live check failed
  // (network blip, etc) — the server's unique index is the source of truth.
  const canSubmit = isFormatValid && availability !== "taken" && !isSubmitting;
  const hint = getResolvedHint(cleanUsername, isFormatValid, availability);

  useEffect(() => {
    if (!isFormatValid || !accessToken) {
      setAvailability(null);
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const response = await checkUsername(accessToken, cleanUsername);
        if (cancelled) {
          return;
        }
        setAvailability(response.available ? "available" : "taken");
      } catch {
        if (!cancelled) {
          setAvailability("error");
        }
      }
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [accessToken, cleanUsername, isFormatValid]);

  const handleChange = (value: string) => {
    setUsername(normalizeUsernameInput(value));
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(cleanUsername);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.card}>
        <View style={styles.iconShell}>
          <Ionicons color={theme.colors.primary} name="at-outline" size={28} />
        </View>
        <Text style={styles.eyebrow}>One last step</Text>
        <Text style={styles.title}>Claim your username.</Text>
        <Text style={styles.subtitle}>
          This handle is unique to you. Nobody else can take it once it is saved.
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
            placeholder="fitfo_lifter"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            style={styles.input}
            value={username}
          />
          {availability === "checking" ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : availability === "available" ? (
            <Ionicons
              color={theme.colors.success}
              name="checkmark-circle"
              size={22}
            />
          ) : availability === "taken" ? (
            <Ionicons color={theme.colors.error} name="close-circle" size={22} />
          ) : null}
        </View>

        <Text
          style={[
            styles.hint,
            availability === "available" && styles.hintValid,
            availability === "taken" && styles.hintError,
          ]}
        >
          {hint}
        </Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.colors.surface} size="small" />
          ) : (
            <>
              <Text style={styles.buttonText}>Continue</Text>
              <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
            </>
          )}
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
    eyebrow: {
      marginTop: 4,
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.6,
      textTransform: "uppercase",
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
    hintError: {
      color: theme.colors.error,
    },
    errorCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: theme.colors.errorSoft,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    button: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...theme.shadows.primary,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonPressed: {
      transform: [{ scale: 0.99 }],
    },
    buttonText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
