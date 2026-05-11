import { useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { openInstagramApp, openTikTokApp } from "../lib/openSocialApps";
import { getTheme, type ThemeMode } from "../theme";

interface PostPaywallWelcomeModalProps {
  visible: boolean;
  onDismiss: () => void;
  themeMode?: ThemeMode;
}

export function PostPaywallWelcomeModal({
  visible,
  onDismiss,
  themeMode = "dark",
}: PostPaywallWelcomeModalProps) {
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const iconScale = useRef(new Animated.Value(0.7)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      iconScale.setValue(0.7);
      iconOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [iconOpacity, iconScale, visible]);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          onPress={onDismiss}
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
                ? { backgroundColor: "rgba(0, 0, 0, 0.38)" }
                : { backgroundColor: "rgba(18, 25, 48, 0.22)" },
            ]}
          />
        </Pressable>

        <View pointerEvents="box-none" style={styles.cardRail}>
          <View style={styles.card}>
            <Animated.View
              style={[
                styles.headerIcon,
                {
                  opacity: iconOpacity,
                  transform: [{ scale: iconScale }],
                },
              ]}
            >
              <Ionicons
                color={theme.colors.primary}
                name="heart"
                size={22}
              />
            </Animated.View>

            <Text accessibilityRole="header" style={styles.title}>
              Welcome to Fitfo
            </Text>

            <View style={styles.bodyWrap}>
              <Text style={styles.body}>
                Your Workout screen is your fitness hub—everything you import and
                train lives there.
              </Text>
              <Text style={[styles.body, styles.bodyParagraph]}>
                Get back to scrolling! When you spot workout or fitness videos you
                love, share them straight to Fitfo so we can turn them into real
                routines.
              </Text>
            </View>

            <View style={styles.socialRow}>
              <Pressable
                accessibilityLabel="Open Instagram"
                accessibilityRole="button"
                onPress={() => {
                  void openInstagramApp();
                }}
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed ? styles.socialButtonPressed : null,
                ]}
              >
                <Ionicons color="#E4405F" name="logo-instagram" size={22} />
                <Text style={styles.socialButtonText}>Instagram</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Open TikTok"
                accessibilityRole="button"
                onPress={() => {
                  void openTikTokApp();
                }}
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed ? styles.socialButtonPressed : null,
                ]}
              >
                <Ionicons
                  color={theme.colors.textPrimary}
                  name="logo-tiktok"
                  size={22}
                />
                <Text style={styles.socialButtonText}>TikTok</Text>
              </Pressable>
            </View>

            <Text style={styles.hint}>
              Jump into the feed, then use Share → Fitfo when you find something
              worth training.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue in Fitfo"
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.primaryButtonPressed : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>Continue in Fitfo</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      alignSelf: "center",
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 16,
      borderWidth: 1,
      borderColor:
        theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
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
      marginBottom: 14,
    },
    bodyWrap: {
      gap: 0,
      marginBottom: 16,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },
    bodyParagraph: {
      marginTop: 12,
    },
    socialRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 12,
    },
    socialButton: {
      flex: 1,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.colors.borderSoft,
      backgroundColor:
        theme.mode === "dark"
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(71, 88, 240, 0.04)",
    },
    socialButtonPressed: {
      opacity: 0.88,
    },
    socialButtonText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      marginBottom: 14,
    },
    primaryButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
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
  });
