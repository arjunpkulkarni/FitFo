import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";

import { ApiError } from "../lib/api";
import { openFeatureSuggestion } from "../lib/featureSuggestion";
import { useTabBarScrollPadding } from "../lib/tabBarLayout";
import { ProfileAvatarCircle } from "../components/ProfileAvatarCircle";
import { getTheme, type ThemeMode } from "../theme";
import type { UserProfile } from "../types";

interface ProfileScreenProps {
  onClose?: () => void;
  onLogout: () => void;
  onDeleteAccount: () => Promise<void>;
  onManageSubscription?: () => Promise<boolean>;
  /** When set, the Settings dark-mode toggle persists via App and updates the shell. */
  onThemeModeChange?: (mode: ThemeMode) => void;
  onUpdateFullName: (fullName: string) => Promise<void>;
  /** Opens photo options (library / camera / remove). Optional so older shells keep working during rollout. */
  onManageProfilePhoto?: () => void;
  /** True while uploading or deleting the profile photo. */
  isProfilePhotoBusy?: boolean;
  isDeletingAccount?: boolean;
  isFreePlan?: boolean;
  onRequireUpgrade?: (message: string) => void;
  profile: UserProfile;
  themeMode?: ThemeMode;
}

export function ProfileScreen({
  onClose,
  onLogout,
  onDeleteAccount,
  onManageSubscription,
  onThemeModeChange,
  onUpdateFullName,
  onManageProfilePhoto,
  isProfilePhotoBusy = false,
  isDeletingAccount = false,
  isFreePlan = false,
  onRequireUpgrade,
  profile,
  themeMode = "dark",
}: ProfileScreenProps) {
  const tabBarScrollPad = useTabBarScrollPadding();
  const posthog = usePostHog();

  const handleSuggestFeatures = () => {
    if (isFreePlan) {
      onRequireUpgrade?.("Suggesting features is a Fitfo Pro feature.");
      return;
    }
    openFeatureSuggestion((event) => posthog.capture(event));
  };

  // Two-step confirmation: App Store reviewers look for this, and it protects
  // users from accidentally wiping their account. First Alert explains the
  // consequences; second Alert is the "really really?" confirm.
  const handleDeletePressed = () => {
    if (isDeletingAccount) {
      return;
    }
    Alert.alert(
      "Delete your account?",
      "This permanently removes your profile, saved workouts, schedule, completed sessions, and all body-weight history. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Once you confirm, all of your Fitfo data will be deleted and you'll be signed out. For Sign in with Apple, Fitfo will also be unlinked from your Apple ID.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Account",
                  style: "destructive",
                  onPress: () => {
                    void onDeleteAccount();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  function errorMessage(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Something went wrong. Try again.";
  }

  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [draftFullName, setDraftFullName] = useState(profile.full_name);
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (isNameModalOpen) {
      setDraftFullName(profile.full_name);
    }
  }, [isNameModalOpen, profile.full_name]);

  const trimmedDraft = draftFullName.trim();
  const canSaveName =
    trimmedDraft.length > 0 && trimmedDraft !== profile.full_name.trim();

  const handleSaveName = async () => {
    if (!trimmedDraft || isSavingName) {
      return;
    }
    setIsSavingName(true);
    try {
      await onUpdateFullName(trimmedDraft);
      setIsNameModalOpen(false);
    } catch (error) {
      Alert.alert("Could not update name", errorMessage(error));
    } finally {
      setIsSavingName(false);
    }
  };

  const initials = profile.full_name
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarScrollPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        {onClose ? (
          <Pressable onPress={onClose} style={styles.backButton} hitSlop={10}>
            <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={22} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View>
            <Text style={styles.eyebrow}>Settings</Text>
          </View>
        )}
      </View>

      <View style={styles.profileHero}>
          <View style={styles.profileIdentity}>
            <View style={styles.avatarRing}>
              <Pressable
                accessibilityHint={
                  onManageProfilePhoto
                    ? "Choose a photo from your library or camera."
                    : undefined
                }
                accessibilityLabel="Profile photo"
                accessibilityRole={onManageProfilePhoto ? "button" : "image"}
                disabled={isProfilePhotoBusy || !onManageProfilePhoto}
                hitSlop={8}
                onPress={onManageProfilePhoto}
                style={({ pressed }) => [
                  styles.avatar,
                  pressed && onManageProfilePhoto ? styles.avatarPressed : null,
                  isProfilePhotoBusy ? styles.avatarMuted : null,
                ]}
              >
                <ProfileAvatarCircle
                  diameter={62}
                  fallbackInitials={initials || "F"}
                  initialsBackgroundColor={theme.colors.surface}
                  initialsColor={theme.colors.primary}
                  revision={profile.updated_at}
                  uri={profile.avatar_url}
                />
                {isProfilePhotoBusy ? (
                  <View style={styles.avatarBusyOverlay}>
                    <ActivityIndicator color={theme.colors.surface} />
                  </View>
                ) : null}
              </Pressable>
            </View>

            <Pressable
              accessibilityHint="Opens a screen to edit your display name."
              accessibilityLabel={`Name, ${profile.full_name}`}
              accessibilityRole="button"
              disabled={isSavingName}
              onPress={() => setIsNameModalOpen(true)}
              style={[styles.profileCopy, styles.profileNamePress]}
            >
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={2}>
                  {profile.full_name}
                </Text>
                <Ionicons color={theme.colors.primary} name="pencil" size={18} />
              </View>
              <Text style={styles.profilePhone}>{profile.phone ?? ""}</Text>
            </Pressable>
          </View>
      </View>

      <View style={styles.infoList}>
        {onThemeModeChange ? (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons color={theme.colors.primary} name="moon-outline" size={18} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Dark mode</Text>
              <Text style={styles.infoBody}>
                Easier on the eyes in low light. Turn off anytime for the bright canvas.
              </Text>
            </View>
            <Switch
              accessibilityHint="Uses dark colors across Fitfo."
              accessibilityLabel="Dark mode"
              accessibilityRole="switch"
              ios_backgroundColor={theme.colors.track}
              onValueChange={(enabled) => {
                onThemeModeChange(enabled ? "dark" : "light");
              }}
              thumbColor={theme.mode === "dark" ? theme.colors.surfaceStrong : "#FFFFFF"}
              trackColor={{
                false: theme.colors.track,
                true:
                  theme.mode === "dark"
                    ? theme.colors.primary
                    : theme.colors.primaryBright,
              }}
              value={themeMode === "dark"}
            />
          </View>
        ) : null}
        <Pressable onPress={handleSuggestFeatures} style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons color={theme.colors.primary} name="mail-outline" size={18} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>Suggest features</Text>
            <Text style={styles.infoBody}>
              Tell us what would make Fitfo feel more useful for your training.
            </Text>
          </View>
          <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
        </Pressable>
        {onManageSubscription ? (
          <Pressable
            onPress={() => {
              void onManageSubscription();
            }}
            style={styles.infoCard}
          >
            <View style={styles.infoIcon}>
              <Ionicons color={theme.colors.primary} name="card-outline" size={18} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Manage Fitfo Pro</Text>
              <Text style={styles.infoBody}>
                View, restore, cancel, or update your Apple subscription.
              </Text>
            </View>
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Ionicons color={theme.colors.error} name="log-out-outline" size={18} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerEyebrow}>Danger Zone</Text>
        <Pressable
          disabled={isDeletingAccount}
          onPress={handleDeletePressed}
          style={[
            styles.deleteButton,
            isDeletingAccount ? styles.deleteButtonDisabled : null,
          ]}
        >
          {isDeletingAccount ? (
            <>
              <ActivityIndicator color={theme.colors.error} size="small" />
              <Text style={styles.deleteText}>Deleting…</Text>
            </>
          ) : (
            <>
              <Ionicons
                color={theme.colors.error}
                name="trash-outline"
                size={18}
              />
              <Text style={styles.deleteText}>Delete Account</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.dangerBody}>
          Permanently remove your profile, saved workouts, schedule, and
          history. This cannot be undone.
        </Text>
      </View>
    </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingName) {
            setIsNameModalOpen(false);
          }
        }}
        transparent
        visible={isNameModalOpen}
      >
        <View style={styles.modalOuter}>
          <Pressable
            disabled={isSavingName}
            onPress={() => setIsNameModalOpen(false)}
            style={styles.modalBackdrop}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalRoot}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Your name</Text>
              <Text style={styles.modalCaption}>
                This is how you appear in Fitfo. You can change it anytime.
              </Text>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                editable={!isSavingName}
                maxLength={120}
                onChangeText={setDraftFullName}
                placeholder="Full name"
                placeholderTextColor={theme.colors.textMuted}
                selectionColor={theme.colors.primary}
                style={styles.modalInput}
                value={draftFullName}
              />
              <View style={styles.modalActions}>
                <Pressable
                  disabled={isSavingName}
                  hitSlop={8}
                  onPress={() => setIsNameModalOpen(false)}
                  style={({ pressed }) => [
                    styles.modalButtonGhost,
                    pressed && !isSavingName ? styles.modalButtonGhostPressed : null,
                  ]}
                >
                  <Text style={styles.modalButtonGhostText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSavingName || !canSaveName}
                  hitSlop={8}
                  onPress={() => {
                    void handleSaveName();
                  }}
                  style={({ pressed }) => [
                    styles.modalButtonPrimary,
                    (!canSaveName || isSavingName) ? styles.modalButtonPrimaryDisabled : null,
                    pressed && canSaveName && !isSavingName
                      ? styles.modalButtonPrimaryPressed
                      : null,
                  ]}
                >
                  {isSavingName ? (
                    <ActivityIndicator color={theme.colors.surface} size="small" />
                  ) : (
                    <Text style={styles.modalButtonPrimaryText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
      gap: 24,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 2,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingRight: 10,
      marginLeft: -4,
    },
    backButtonText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    title: {
      marginTop: 6,
      color: theme.colors.textPrimary,
      fontSize: 36,
      lineHeight: 40,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: -1.6,
    },
    brandBadge: {
      width: 42,
      height: 42,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    brandBadgeText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
    },
    profileHero: {
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      paddingVertical: 22,
      paddingHorizontal: 22,
      gap: 18,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    profileIdentity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    avatarRing: {
      width: 72,
      height: 72,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      overflow: "hidden",
    },
    avatarPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    avatarMuted: {
      opacity: 0.82,
    },
    avatarBusyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.38)",
      borderRadius: 999,
    },
    profileNamePress: {
      flex: 1,
    },
    profileCopy: {
      flex: 1,
      gap: 4,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    profileHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    profileName: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 22,
      lineHeight: 26,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    profilePhone: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    profileBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    infoList: {
      gap: 14,
    },
    infoCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      paddingVertical: 18,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.softCard,
    },
    infoIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceMuted,
    },
    infoCopy: {
      flex: 1,
      gap: 4,
    },
    infoTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    infoBody: {
      color: theme.colors.textSecondary,
      fontFamily: "satoshi",
      fontSize: 13,
      lineHeight: 19,
    },
    logoutButton: {
      marginTop: 4,
      minHeight: 58,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.error,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 105, 60, 0.08)" : theme.colors.errorSoft,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    logoutText: {
      color: theme.colors.error,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    dangerZone: {
      marginTop: 28,
      gap: 10,
    },
    dangerEyebrow: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      paddingHorizontal: 4,
    },
    deleteButton: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.error,
      backgroundColor: "transparent",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    deleteButtonDisabled: {
      opacity: 0.55,
    },
    deleteText: {
      color: theme.colors.error,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    dangerBody: {
      color: theme.colors.textMuted,
      fontFamily: "satoshi",
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 4,
    },
    modalOuter: {
      flex: 1,
    },
    modalRoot: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
    },
    modalCard: {
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      padding: 22,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    modalTitle: {
      color: theme.colors.textPrimary,
      fontSize: 22,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    modalCaption: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontFamily: "Satoshi-Regular",
      fontWeight: "400",
      lineHeight: 20,
      marginTop: -6,
    },
    modalInput: {
      marginTop: 4,
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: theme.colors.textPrimary,
      fontSize: 17,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 6,
    },
    modalButtonGhost: {
      minHeight: 48,
      paddingHorizontal: 18,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    modalButtonGhostPressed: {
      opacity: 0.72,
    },
    modalButtonGhostText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    modalButtonPrimary: {
      minHeight: 48,
      minWidth: 100,
      paddingHorizontal: 20,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    modalButtonPrimaryDisabled: {
      opacity: 0.45,
    },
    modalButtonPrimaryPressed: {
      opacity: 0.92,
    },
    modalButtonPrimaryText: {
      color: theme.colors.surface,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
  });
