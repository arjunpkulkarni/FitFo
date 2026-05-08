import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppleSignInButton } from "../components/AppleSignInButton";
import { getTheme, type ThemeMode } from "../theme";

interface LoginScreenProps {
  onLogin: (phone: string) => void;
  onAppleSignIn: () => void;
  onSwitchToSignUp: () => void;
  notice?: string | null;
  error?: string | null;
  isSubmitting?: boolean;
  isAppleSubmitting?: boolean;
  initialPhoneNumber?: string;
  themeMode?: ThemeMode;
}

export function LoginScreen({
  onLogin,
  onAppleSignIn,
  onSwitchToSignUp,
  notice,
  error,
  isSubmitting = false,
  isAppleSubmitting = false,
  initialPhoneNumber,
  themeMode = "light",
}: LoginScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber || "");
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  useEffect(() => {
    setPhoneNumber(initialPhoneNumber || "");
  }, [initialPhoneNumber]);

  const trimmedPhoneNumber = phoneNumber.trim();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.textContent}>
            <Text
              style={styles.title}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              Welcome{"\n"}
              Back
              <Text style={styles.titleDot}>.</Text>
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <AppleSignInButton
            disabled={isSubmitting || isAppleSubmitting}
            onPress={onAppleSignIn}
            themeMode={themeMode}
          />

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputShell}>
              <Ionicons color={theme.colors.primary} name="call-outline" size={20} />
              <TextInput
                keyboardType="phone-pad"
                onChangeText={setPhoneNumber}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={phoneNumber}
              />
            </View>
          </View>

          {notice ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!trimmedPhoneNumber || isSubmitting}
            onPress={() => onLogin(trimmedPhoneNumber)}
            style={({ pressed }) => [
              styles.primaryButton,
              (!trimmedPhoneNumber || isSubmitting) ? styles.primaryButtonDisabled : null,
              pressed ? styles.primaryButtonPressed : null,
            ]}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator color={theme.colors.surface} size="small" />
                <Text style={styles.primaryButtonText}>Sending Code</Text>
              </>
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Send Code</Text>
                <Ionicons color={theme.colors.surface} name="arrow-forward" size={18} />
              </>
            )}
          </Pressable>

          <Text style={styles.footerText}>
            New to fitfo?{" "}
            <Text style={styles.footerLink} onPress={onSwitchToSignUp}>
              Sign Up
            </Text>
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    shell: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: Platform.OS === "ios" ? 20 : 16,
      paddingBottom: 16,
      gap: 20,
    },
    hero: {
      gap: 6,
      alignItems: 'center',
    },
    logo: {
      width: 50,
      height: 50,
      marginBottom: 6,
    },
    textContent: {
      alignSelf: 'stretch',
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: "ClashDisplay-Bold",
      fontWeight: "900",
      letterSpacing: 3,
      textTransform: "uppercase",
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 42,
      lineHeight: 44,
      fontFamily: "ClashDisplay-Bold",
      fontWeight: "900",
      letterSpacing: -2.0,
    },
    titleDot: {
      color: theme.colors.heroDot,
    },
    orRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    orLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.borderSoft,
    },
    orText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    card: {
      borderRadius: 32,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 28,
      paddingVertical: 36,
      gap: 22,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    fieldGroup: {
      gap: 10,
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 3,
      textTransform: "uppercase",
    },
    inputShell: {
      minHeight: 72,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
    },
    input: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    noticeCard: {
      borderRadius: 18,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 111, 34, 0.12)" : "rgba(47, 88, 217, 0.08)",
      padding: 14,
    },
    noticeText: {
      color: theme.colors.primary,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    errorCard: {
      borderRadius: 18,
      backgroundColor: theme.colors.errorSoft,
      padding: 14,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    primaryButton: {
      minHeight: 76,
      borderRadius: 24,
      backgroundColor: theme.colors.primaryBright,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      ...theme.shadows.primary,
    },
    primaryButtonDisabled: {
      opacity: 0.58,
    },
    primaryButtonPressed: {
      opacity: 0.88,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 18,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 0.2,
    },
    footerText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Medium",
      fontWeight: "600",
      textAlign: "center",
    },
    footerLink: {
      color: theme.colors.primary,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
  });
