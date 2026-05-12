import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as StoreReview from "expo-store-review";
import {
  ActivityIndicator,
  Alert,
  AppState,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { PostHogProvider } from "posthog-react-native";

import { posthog } from "./src/lib/posthog";
import { applyDefaultFont } from "./src/lib/fonts";
import { AddWorkoutModal } from "./src/components/AddWorkoutModal";
import type { CoachChatMessage } from "./src/components/CoachSheet";
import { FirstHubTipModal } from "./src/components/FirstHubTipModal";
import { PostPaywallWelcomeModal } from "./src/components/PostPaywallWelcomeModal";
import {
  SavedWorkoutsCoachmark,
  type CoachmarkPlacement,
  type CoachmarkRect,
} from "./src/components/SavedWorkoutsCoachmark";
import { FitfoLoadingAnimation } from "./src/components/FitfoLoadingAnimation";
import { BottomNav } from "./src/components/BottomNav";
import { ScheduleAgainModal } from "./src/components/ScheduleAgainModal";
import { useShareIntent } from "expo-share-intent";
import { useIngestionJob } from "./src/hooks/useIngestionJob";
import { useRevenueCat } from "./src/hooks/useRevenueCat";
import {
  extractIngestibleUrlFromSharePayload,
  useSharedIngestUrl,
} from "./src/hooks/useSharedIngestUrl";
import {
  clearAuthSession,
  getStoredAuthSession,
  storeAuthSession,
} from "./src/lib/authStorage";
import {
  clearPendingIngestJob,
  readPendingIngestJob,
  writePendingIngestJob,
} from "./src/lib/ingestJobStorage";
import { getStoredThemeMode, storeThemeMode } from "./src/lib/themeStorage";
import {
  ApiError,
  appleSignIn,
  checkAccountStatus,
  createBodyWeightEntry,
  createCompletedWorkout,
  createIngestionJob,
  createScheduledWorkout,
  deleteAccount,
  deleteSavedWorkout,
  deleteScheduledWorkout,
  getCompletedWorkout,
  getCurrentUser,
  listBodyWeightEntries,
  listCompletedWorkouts,
  listSavedWorkouts,
  listScheduledWorkouts,
  patchProfile,
  saveOnboarding,
  saveWorkoutForLater,
  sendOtp,
  updateSavedWorkout,
  updateScheduledWorkout,
  verifyOtp,
} from "./src/lib/api";
import { humanizeIngestError } from "./src/lib/ingestErrors";
import { hasBillingBypassForUser } from "./src/lib/billingBypass";
import { signInWithApple } from "./src/lib/appleAuth";
import {
  buildCompletedWorkoutRequest,
  createActiveSessionFromCompletedWorkout,
  createActiveSessionFromPlan,
  createDefaultActiveSession,
  createImportedRoutinePreview,
  createSavedRoutinePreviewFromRecord,
  createScheduledRoutinePreview,
  getCompletedWorkoutMeta,
  getCompletedWorkoutSetCount,
  getCreatorDisplayLabel,
  getRoutineDisplayTitle,
} from "./src/lib/fitfo";
import {
  ensureStarterWorkoutsSeeded,
  getFirstHubTipModalBody,
  getFirstHubTipModalTitle,
  getFirstHubTipStorageKey,
  getHubTourDoneStorageKey,
  getHubTourFinishCoachmarkBody,
  getHubTourFinishCoachmarkTitle,
  getHubTourLibraryCoachmarkBody,
  getHubTourLibraryCoachmarkTitle,
  getHubTourScrollCoachmarkBody,
  getHubTourScrollCoachmarkTitle,
  getHubTourStartSessionCoachmarkBody,
  getHubTourStartSessionCoachmarkTitle,
  getHubTourStepStorageKey,
  getPostPaywallWelcomeDismissedStorageKey,
  getSavedWorkoutsCoachmarkBody,
  getSavedWorkoutsCoachmarkTitle,
  getStarterDemoTitleForSex,
  type HubTourStep,
  isStarterDemoWorkoutTitle,
} from "./src/lib/starterHubWelcome";
import * as Notifications from "expo-notifications";
import {
  INGESTION_READY_NOTIFICATION_KIND,
  TRIAL_PRE_CHARGE_NOTIFICATION_KIND,
  cancelWorkoutReminder,
  getAutoNotifyImportsPreference,
  notifyWorkoutReady,
  reconcileScheduledNotifications,
  requestNotificationPermissionForOnboarding,
  scheduleWorkoutReminder,
  setAutoNotifyImportsPreference,
  syncExpoPushTokenWithBackend,
} from "./src/lib/notifications";
import { ActiveWorkoutScreen } from "./src/screens/ActiveWorkoutScreen";
import { AuthLandingScreen } from "./src/screens/AuthLandingScreen";
import { LogsScreen } from "./src/screens/LogsScreen";
import { OtpVerificationScreen } from "./src/screens/OtpVerificationScreen";
import { PaywallScreen } from "./src/screens/PaywallScreen";
import { TrialExplainerScreen } from "./src/screens/TrialExplainerScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ProgressChartsScreen } from "./src/screens/ProgressChartsScreen";
import {
  SavedWorkoutDetailScreen,
  type SavedRoutineUpdate,
} from "./src/screens/SavedWorkoutDetailScreen";
import { SavedLibraryScreen } from "./src/screens/SavedLibraryScreen";
import { SavedWorkoutsScreen } from "./src/screens/SavedWorkoutsScreen";
import { ScheduledConfirmationScreen } from "./src/screens/ScheduledConfirmationScreen";
import { WorkoutSummaryScreen } from "./src/screens/WorkoutSummaryScreen";
import { getTheme, type ThemeMode } from "./src/theme";
import type {
  ActiveSessionPreview,
  AppTab,
  AuthMode,
  BodyWeightEntryRecord,
  CompletedWorkoutRecord,
  OtpIntent,
  PendingOtpChallenge,
  SaveOnboardingRequest,
  SavedRoutinePreview,
  ScheduledWorkoutRecord,
  UserProfile,
  WorkoutPlan,
} from "./src/types";

// Fabric: skipped inside `fonts.ts`; Paper legacy may patch Text/TextInput.
applyDefaultFont();

interface ScheduleAgainTarget {
  id: string;
  title: string;
  description: string | null;
  workoutId: string | null;
  jobId: string | null;
  sourceUrl: string | null;
  workoutPlan: WorkoutPlan | null;
  metaLeft: string;
  metaRight: string;
  badgeLabel: string | null;
  thumbnailUrl?: string | null;
  // When set, the workout already lives in the user's saved library and we
  // should reuse that row as the schedule's source instead of round-tripping
  // through saveWorkoutForLater again (which would create a duplicate).
  savedWorkoutId: string | null;
}

type AuthSubmitMode = "login" | "signup" | "otp" | "apple" | "bootstrap";

interface ScheduledConfirmationState {
  title: string;
  scheduledFor: string;
  origin: "share" | "manual";
}

const AUTH_LANDING_AUTH_INDEX = 8;
const POST_SIGNUP_HUB_GUIDANCE_ENABLED = false;
const STORE_REVIEW_COMPLETION_RATIO_THRESHOLD = 0.7;

function getStoreReviewPromptStorageKey(userId: string) {
  return `@fitfo/store-review-prompted/${userId}`;
}

function getCoachCoachmarkStorageKey(userId: string) {
  return `@fitfo:coach-coachmark-shown:${userId}`;
}

function getWorkoutCompletionRatio(session: ActiveSessionPreview) {
  const totalSetCount = session.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );
  if (totalSetCount === 0) {
    return 0;
  }

  const completedSetCount = session.exercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  return completedSetCount / totalSetCount;
}

export default function App() {
  const { width: windowWidth } = useWindowDimensions();
  const splashLogoSize = Math.round(
    Math.min(176, Math.max(120, windowWidth * 0.38)),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [fontsLoaded] = useFonts({
    // Body family — Satoshi (Fontshare). Replaces Barlow.
    "Satoshi-Regular": require("./assets/fonts/Satoshi-Regular.ttf"),
    "Satoshi-Medium": require("./assets/fonts/Satoshi-Medium.ttf"),
    "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.ttf"),
    "Satoshi-Black": require("./assets/fonts/Satoshi-Black.ttf"),
    // Display family — Clash Display (Fontshare). Used for hero headlines.
    "ClashDisplay-Medium": require("./assets/fonts/ClashDisplay-Medium.ttf"),
    "ClashDisplay-Semibold": require("./assets/fonts/ClashDisplay-Semibold.ttf"),
    "ClashDisplay-Bold": require("./assets/fonts/ClashDisplay-Bold.ttf"),
  });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [authLandingIndex, setAuthLandingIndex] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authSubmittingMode, setAuthSubmittingMode] =
    useState<AuthSubmitMode | null>(null);
  const [authPrefillPhone, setAuthPrefillPhone] = useState("");
  const [authPrefillFullName, setAuthPrefillFullName] = useState("");
  const [authLandingOnboardingPayload, setAuthLandingOnboardingPayload] =
    useState<SaveOnboardingRequest | null>(null);
  const [pendingOtpChallenge, setPendingOtpChallenge] =
    useState<PendingOtpChallenge | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isMinSplashDone, setIsMinSplashDone] = useState(false);
  useEffect(() => {
    // Keep the launch loading animation on screen for at least 2s so the
    // brand moment doesn't flash by even when auth restore is instant.
    const timeout = setTimeout(() => setIsMinSplashDone(true), 2000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let alive = true;
    void getStoredThemeMode().then((stored) => {
      if (alive && stored) {
        setThemeMode(stored);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    InteractionManager.runAfterInteractions(() => {
      void import("./src/lib/reportAppleSearchAdsAttribution").then(
        ({ reportAppleSearchAdsAttribution }) => {
          if (!cancelled) {
            void reportAppleSearchAdsAttribution(posthog);
          }
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    void storeThemeMode(mode);
  }, []);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("saved");
  const hubPreviousTabRef = useRef<AppTab>("saved");
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [isSavedLibraryVisible, setIsSavedLibraryVisible] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSessionPreview | null>(
    null,
  );
  const [isActiveWorkoutVisible, setIsActiveWorkoutVisible] = useState(false);
  const prevActiveWorkoutVisibleRef = useRef(isActiveWorkoutVisible);
  /** AI coach turns per in-progress session (`startedAt`), survives hub ↔ workout navigation. */
  const [coachMessagesByStartedAt, setCoachMessagesByStartedAt] = useState<
    Record<string, CoachChatMessage[]>
  >({});
  const [selectedCompletedWorkout, setSelectedCompletedWorkout] =
    useState<CompletedWorkoutRecord | null>(null);
  const [selectedSavedRoutine, setSelectedSavedRoutine] =
    useState<SavedRoutinePreview | null>(null);
  const [isAddWorkoutVisible, setIsAddWorkoutVisible] = useState(false);
  const [isExtractSubmitting, setIsExtractSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [latestImportedRoutine, setLatestImportedRoutine] =
    useState<SavedRoutinePreview | null>(null);
  // True while a slow import is running with the modal closed. We keep
  // polling alive in `useIngestionJob` and fire a local notification on
  // completion. Cleared when the user opens the modal again or the job
  // resolves.
  const [isImportRunningInBackground, setIsImportRunningInBackground] =
    useState(false);
  /** After we finish reading `readPendingIngestJob` for the signed-in user. */
  const [pendingIngestHydrated, setPendingIngestHydrated] = useState(false);
  // Persisted user choice — once true, future slow imports auto-promote to
  // background mode at the threshold without showing the inline opt-in card.
  const [autoNotifyImports, setAutoNotifyImports] = useState(false);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedRoutinePreview[]>([]);
  const [savedWorkoutsLoading, setSavedWorkoutsLoading] = useState(false);
  const [savedWorkoutsError, setSavedWorkoutsError] = useState<string | null>(null);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<
    ScheduledWorkoutRecord[]
  >([]);
  const [scheduledWorkoutsLoading, setScheduledWorkoutsLoading] = useState(false);
  const [scheduledWorkoutsError, setScheduledWorkoutsError] = useState<string | null>(
    null,
  );
  const [isSchedulingWorkout, setIsSchedulingWorkout] = useState(false);
  const [scheduleAgainTarget, setScheduleAgainTarget] =
    useState<ScheduleAgainTarget | null>(null);
  const [isSchedulingAgain, setIsSchedulingAgain] = useState(false);
  const [scheduleAgainError, setScheduleAgainError] = useState<string | null>(null);
  const [isSavingImportedWorkout, setIsSavingImportedWorkout] = useState(false);
  const [isSavingActiveSession, setIsSavingActiveSession] = useState(false);
  // Tracks the startedAt of any active session that was just persisted to the
  // saved library, so the in-session button can flip to "Saved" without
  // letting the athlete accidentally re-save the same session twice.
  const [savedActiveSessionStartedAt, setSavedActiveSessionStartedAt] =
    useState<number | null>(null);
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkoutRecord[]>(
    [],
  );
  const [completedWorkoutsLoading, setCompletedWorkoutsLoading] = useState(false);
  const [completedWorkoutsLoaded, setCompletedWorkoutsLoaded] = useState(false);
  const [completedWorkoutsError, setCompletedWorkoutsError] = useState<string | null>(
    null,
  );
  const [bodyWeightEntries, setBodyWeightEntries] = useState<BodyWeightEntryRecord[]>(
    [],
  );
  const [bodyWeightEntriesLoading, setBodyWeightEntriesLoading] = useState(false);
  const [bodyWeightEntriesError, setBodyWeightEntriesError] = useState<string | null>(
    null,
  );
  const [isBodyWeightSubmitting, setIsBodyWeightSubmitting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [sharedIngestUrl, setSharedIngestUrl] = useState<string | null>(null);
  const [isShareDrivenIngest, setIsShareDrivenIngest] = useState(false);
  const [scheduledConfirmation, setScheduledConfirmation] = useState<
    ScheduledConfirmationState | null
  >(null);
  const [isFirstHubTipVisible, setIsFirstHubTipVisible] = useState(false);
  const [isPostPaywallWelcomeVisible, setIsPostPaywallWelcomeVisible] =
    useState(false);
  const [hubTourStep, setHubTourStep] = useState<HubTourStep | null>(null);
  const [hubTourCoachRect, setHubTourCoachRect] = useState<CoachmarkRect | null>(null);
  const hubTourStepRef = useRef<HubTourStep | null>(null);

  // One-time overlay teaching users where the AI Coach button lives.
  const [coachCoachmarkVisible, setCoachCoachmarkVisible] = useState(false);
  const [coachCoachmarkRect, setCoachCoachmarkRect] =
    useState<CoachmarkRect | null>(null);
  const [coachOpenRequestId, setCoachOpenRequestId] = useState(0);
  const coachCoachmarkHydratedRef = useRef(false);

  /** Calendar + upcoming only show rows still waiting to be trained. */
  const upcomingScheduledRows = useMemo(
    () => scheduledWorkouts.filter((row) => row.status === "scheduled"),
    [scheduledWorkouts],
  );

  const handledImportedWorkoutId = useRef<string | null>(null);
  const handledNativeShareUrls = useRef(new Set<string>());
  const handledImportLaunchNotificationRef = useRef(false);
  const pendingPostPaywallWelcomeRef = useRef(false);
  const storeReviewPromptQueuedUserIdsRef = useRef(new Set<string>());
  // Tracks any pending post-close cleanup of AddWorkoutModal so we can cancel
  // it if the user re-opens the modal before the cleanup fires (otherwise a
  // late reset would wipe out freshly re-populated state).
  const pendingAddWorkoutCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { isReady: isShareIntentReady, hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntent();
  const { job, workout, error: pollError } = useIngestionJob(jobId, accessToken);

  useEffect(() => {
    if (!isAuthReady || !accessToken || !currentUser?.id) {
      setPendingIngestHydrated(false);
      return;
    }
    let cancelled = false;
    setPendingIngestHydrated(false);
    const uid = currentUser.id;
    void (async () => {
      const pending = await readPendingIngestJob();
      if (cancelled) {
        return;
      }
      let restored = false;
      setJobId((currentJobId) => {
        if (currentJobId != null) {
          return currentJobId;
        }
        if (
          pending?.userId === uid &&
          pending.jobId &&
          pending.jobId.trim().length > 0
        ) {
          restored = true;
          return pending.jobId;
        }
        return currentJobId;
      });
      if (restored && pending) {
        setIsImportRunningInBackground(pending.background);
      }
      if (!cancelled) {
        setPendingIngestHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, accessToken, currentUser?.id]);

  useEffect(() => {
    if (!accessToken) {
      handledImportLaunchNotificationRef.current = false;
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthReady || !accessToken?.trim() || !currentUser?.id) {
      return;
    }
    void syncExpoPushTokenWithBackend(accessToken);
  }, [isAuthReady, accessToken, currentUser?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && isAuthReady && accessToken?.trim() && currentUser?.id) {
        void syncExpoPushTokenWithBackend(accessToken);
      }
    });
    return () => sub.remove();
  }, [isAuthReady, accessToken, currentUser?.id]);

  useEffect(() => {
    if (!pendingIngestHydrated || !currentUser?.id || !accessToken) {
      return;
    }
    if (!jobId) {
      void clearPendingIngestJob();
      return;
    }
    void writePendingIngestJob({
      jobId,
      background: isImportRunningInBackground,
      userId: currentUser.id,
    });
  }, [
    pendingIngestHydrated,
    jobId,
    isImportRunningInBackground,
    currentUser?.id,
    accessToken,
  ]);

  const theme = getTheme(themeMode);
  const styles = createStyles(theme);
  const revenueCat = useRevenueCat(currentUser);
  const isAccountBillingBypass = hasBillingBypassForUser(currentUser);
  const isServerProBypass = currentUser?.fitfo_pro_bypass === true;
  const hasBillingAccess =
    isAccountBillingBypass ||
    isServerProBypass ||
    revenueCat.hasPro;

  const userPastOnboarding = Boolean(currentUser?.onboarding);

  const [billingCheckGiveUp, setBillingCheckGiveUp] = useState(false);
  const [billingCheckShowBuyNow, setBillingCheckShowBuyNow] = useState(false);
  /**
   * Two-step paywall flow: post-onboarding users first see the trial explainer,
   * then the paywall. Persisted per-user so subsequent launches skip the
   * explainer (the paywall itself still gates access until purchase).
   */
  const [hasSeenTrialExplainer, setHasSeenTrialExplainer] = useState(false);

  const needsBillingVerification =
    Boolean(currentUser && userPastOnboarding) &&
    !isAccountBillingBypass &&
    !isServerProBypass;

  const isBillingCheckStalled =
    needsBillingVerification &&
    (revenueCat.isLoading ||
      (!revenueCat.isConfigured && !revenueCat.error));

  useEffect(() => {
    if (!isBillingCheckStalled) {
      setBillingCheckGiveUp(false);
    }
  }, [isBillingCheckStalled]);

  const isBillingCheckPending =
    isBillingCheckStalled && !billingCheckGiveUp;

  useEffect(() => {
    if (!isBillingCheckPending) {
      setBillingCheckShowBuyNow(false);
      return;
    }
    const id = setTimeout(() => setBillingCheckShowBuyNow(true), 10_000);
    return () => clearTimeout(id);
  }, [isBillingCheckPending]);

  const trialExplainerStorageKey = currentUser?.id
    ? `@fitfo:trial-explainer-seen:v1:${currentUser.id}`
    : null;

  // Hydrate "saw explainer" from disk so we don't replay it on every relaunch.
  // Reset to false when the user signs out so the next signup sees it again.
  useEffect(() => {
    if (!trialExplainerStorageKey) {
      setHasSeenTrialExplainer(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const flag = await AsyncStorage.getItem(trialExplainerStorageKey);
        if (!cancelled) {
          setHasSeenTrialExplainer(flag === "1");
        }
      } catch {
        if (!cancelled) {
          setHasSeenTrialExplainer(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trialExplainerStorageKey]);

  const handleAcceptTrialExplainer = useCallback(() => {
    setHasSeenTrialExplainer(true);
    if (!trialExplainerStorageKey) {
      return;
    }
    void AsyncStorage.setItem(trialExplainerStorageKey, "1").catch(() => undefined);
  }, [trialExplainerStorageKey]);

  const handleDismissPostPaywallWelcome = useCallback(async () => {
    const userId = currentUser?.id;
    setIsPostPaywallWelcomeVisible(false);
    if (!userId) {
      return;
    }
    try {
      await AsyncStorage.setItem(
        getPostPaywallWelcomeDismissedStorageKey(userId),
        "1",
      );
    } catch {
      // non-fatal
    }
    posthog.capture("post_paywall_welcome_dismissed");
  }, [currentUser?.id]);

  /**
   * After the paywall success screen taps through, we refresh entitlement state,
   * then show a one-time welcome sheet once `hasBillingAccess` flips true.
   */
  useEffect(() => {
    if (!hasBillingAccess || !currentUser?.id || isBillingCheckPending) {
      return;
    }
    if (!pendingPostPaywallWelcomeRef.current) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(
          getPostPaywallWelcomeDismissedStorageKey(currentUser.id),
        );
        if (cancelled) {
          return;
        }
        if (dismissed === "1") {
          pendingPostPaywallWelcomeRef.current = false;
          return;
        }
        if (!pendingPostPaywallWelcomeRef.current) {
          return;
        }
        pendingPostPaywallWelcomeRef.current = false;
        setIsPostPaywallWelcomeVisible(true);
      } catch {
        pendingPostPaywallWelcomeRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, hasBillingAccess, isBillingCheckPending]);

  const resetPostLoginState = useCallback(() => {
    setActiveTab("saved");
    setActiveSession(null);
    setIsActiveWorkoutVisible(false);
    setCoachMessagesByStartedAt({});
    setSelectedCompletedWorkout(null);
    setSelectedSavedRoutine(null);
  }, []);

  useEffect(() => {
    const wasVisible = prevActiveWorkoutVisibleRef.current;
    prevActiveWorkoutVisibleRef.current = isActiveWorkoutVisible;

    if (!activeSession) {
      return;
    }

    if (wasVisible && !isActiveWorkoutVisible) {
      setActiveSession((current) =>
        current ? { ...current, hubTimerFrozenWallMs: Date.now() } : current,
      );
      return;
    }

    if (!wasVisible && isActiveWorkoutVisible) {
      setActiveSession((current) =>
        current && current.hubTimerFrozenWallMs != null
          ? {
              ...current,
              hubTimerFrozenWallMs: undefined,
            }
          : current,
      );
    }
  }, [activeSession, isActiveWorkoutVisible]);

  useEffect(() => {
    if (!workout || handledImportedWorkoutId.current === workout.id) {
      return;
    }

    handledImportedWorkoutId.current = workout.id;
    setLatestImportedRoutine(
      createImportedRoutinePreview(workout, {
        job,
      }),
    );
    posthog.capture("workout_import_completed", {
      workout_id: workout.id,
      job_id: job?.id ?? null,
      source_url: job?.source_url ?? null,
    });
  }, [job, workout]);

  // Background-import completion → local notification. Fires only when the
  // job finishes while the modal is closed (foreground users already see the
  // preview card and don't need a banner) and the routine is fully built.
  // The flag is cleared either way so the effect doesn't re-fire on every
  // poll tick after completion.
  useEffect(() => {
    if (!isImportRunningInBackground) {
      return;
    }
    if (job?.status === "complete" && latestImportedRoutine && jobId) {
      setIsImportRunningInBackground(false);
      if (!isAddWorkoutVisible) {
        void notifyWorkoutReady({
          title: latestImportedRoutine.title,
          creatorHandle: getCreatorDisplayLabel(
            latestImportedRoutine.sourceUrl ?? null,
            latestImportedRoutine.title,
          ),
          jobId,
        });
      }
      return;
    }
    // Silent fail: clear background state and reset the import flow so the
    // user gets a fresh slate next time they open the modal. We could surface
    // a "your import didn't finish" notification here, but for v1 we keep
    // failures invisible to avoid notification fatigue.
    if (job?.status === "failed" && !isAddWorkoutVisible) {
      setIsImportRunningInBackground(false);
      setJobId(null);
      setLatestImportedRoutine(null);
      handledImportedWorkoutId.current = null;
      void clearPendingIngestJob();
    }
  }, [
    isAddWorkoutVisible,
    isImportRunningInBackground,
    job?.status,
    jobId,
    latestImportedRoutine,
  ]);

  const resetImportFlow = useCallback(() => {
    setIsExtractSubmitting(false);
    setJobId(null);
    setSubmitError(null);
    setLatestImportedRoutine(null);
    setIsImportRunningInBackground(false);
    handledImportedWorkoutId.current = null;
    void clearPendingIngestJob();
  }, []);

  const applyIncomingIngestUrl = useCallback(
    (sharedUrl: string) => {
      if (!accessToken) {
        setSharedIngestUrl(sharedUrl);
        setIsShareDrivenIngest(true);
        return;
      }
      setSharedIngestUrl(sharedUrl);
      setIsShareDrivenIngest(true);
      resetImportFlow();
      setIsAddWorkoutVisible(true);
    },
    [accessToken, resetImportFlow],
  );

  const cancelPendingAddWorkoutCleanup = useCallback(() => {
    if (pendingAddWorkoutCleanupRef.current) {
      clearTimeout(pendingAddWorkoutCleanupRef.current);
      pendingAddWorkoutCleanupRef.current = null;
    }
  }, []);

  // Clears state that feeds AddWorkoutModal's preview content after a short
  // delay so the modal can fade out cleanly without its body visibly snapping
  // back to the URL-import form mid-animation. Matches the iOS Modal fade-out
  // duration (~300ms) with a small buffer.
  const scheduleAddWorkoutCleanup = useCallback(() => {
    cancelPendingAddWorkoutCleanup();
    pendingAddWorkoutCleanupRef.current = setTimeout(() => {
      pendingAddWorkoutCleanupRef.current = null;
      resetImportFlow();
    }, 320);
  }, [cancelPendingAddWorkoutCleanup, resetImportFlow]);

  const handleCloseAddWorkout = useCallback(() => {
    cancelPendingAddWorkoutCleanup();
    setIsAddWorkoutVisible(false);
    setSharedIngestUrl(null);
    setIsShareDrivenIngest(false);
    resetImportFlow();
  }, [cancelPendingAddWorkoutCleanup, resetImportFlow]);

  const handleOpenAddWorkout = useCallback(() => {
    cancelPendingAddWorkoutCleanup();
    setIsAddWorkoutVisible(true);
    setSharedIngestUrl(null);
    setIsShareDrivenIngest(false);
    resetImportFlow();
  }, [cancelPendingAddWorkoutCleanup, resetImportFlow]);

  // Slow-import → "notify me" path. Closes the modal but keeps `jobId` /
  // `latestImportedRoutine` alive so `useIngestionJob` keeps polling. The
  // completion effect below fires the local notification when the job
  // finishes while the modal is closed. `remember` persists the auto-notify
  // preference so subsequent slow imports skip the inline opt-in card.
  const handleSendImportToBackground = useCallback(
    ({ remember }: { remember: boolean }) => {
      cancelPendingAddWorkoutCleanup();
      setIsImportRunningInBackground(true);
      setIsAddWorkoutVisible(false);
      setSharedIngestUrl(null);
      setIsShareDrivenIngest(false);
      if (remember) {
        setAutoNotifyImports(true);
        void setAutoNotifyImportsPreference(true);
      }
    },
    [cancelPendingAddWorkoutCleanup],
  );

  // Re-opens the AddWorkoutModal when the user taps the "Workout's ready"
  // notification (local or server push). Optionally restores `jobId` from payload.
  const handleReopenImportFromNotification = useCallback(
    (jobIdFromNotification?: string | null) => {
      cancelPendingAddWorkoutCleanup();
      const trimmed = jobIdFromNotification?.trim();
      if (trimmed) {
        setJobId(trimmed);
      }
      setIsImportRunningInBackground(false);
      setIsAddWorkoutVisible(true);
    },
    [cancelPendingAddWorkoutCleanup],
  );

  // Cold start: user opened the app by tapping an import-ready or trial
  // lifecycle push. Each `kind` routes to its own handler — the import case
  // pops the AddWorkoutModal, the 48h pre-charge case opens Manage Subscription.
  useEffect(() => {
    if (
      !isAuthReady ||
      !accessToken?.trim() ||
      !currentUser?.id ||
      handledImportLaunchNotificationRef.current
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last?.notification?.request?.content?.data) {
        return;
      }
      const raw = last.notification.request.content.data as Record<string, unknown>;
      if (
        raw?.kind === INGESTION_READY_NOTIFICATION_KIND &&
        typeof raw.jobId === "string" &&
        raw.jobId.trim()
      ) {
        handledImportLaunchNotificationRef.current = true;
        handleReopenImportFromNotification(raw.jobId.trim());
        return;
      }
      if (raw?.kind === TRIAL_PRE_CHARGE_NOTIFICATION_KIND) {
        handledImportLaunchNotificationRef.current = true;
        void revenueCat.openCustomerCenter();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isAuthReady,
    accessToken,
    currentUser?.id,
    handleReopenImportFromNotification,
    revenueCat,
  ]);

  // Load the persisted auto-notify preference once on mount.
  useEffect(() => {
    let isMounted = true;
    void getAutoNotifyImportsPreference().then((value) => {
      if (isMounted) {
        setAutoNotifyImports(value);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Foreground tap routing. Import-ready → AddWorkoutModal preview card.
  // Trial 48h pre-charge → RC Customer Center (Apple subscription page on
  // fallback). Scheduled-workout reminders fall through to the no-op default.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { kind?: string; jobId?: string }
          | undefined;
        if (data?.kind === INGESTION_READY_NOTIFICATION_KIND) {
          const jid = typeof data.jobId === "string" ? data.jobId : null;
          handleReopenImportFromNotification(jid);
          return;
        }
        if (data?.kind === TRIAL_PRE_CHARGE_NOTIFICATION_KIND) {
          void revenueCat.openCustomerCenter();
        }
      },
    );
    return () => subscription.remove();
  }, [handleReopenImportFromNotification, revenueCat]);

  useEffect(
    () => () => {
      cancelPendingAddWorkoutCleanup();
    },
    [cancelPendingAddWorkoutCleanup],
  );

  const loadSavedWorkouts = useCallback(async (token: string) => {
    setSavedWorkoutsLoading(true);
    setSavedWorkoutsError(null);

    try {
      // Saved workouts come from the signed-in account so the backend stays the source of truth.
      const rows = await listSavedWorkouts(token);
      setSavedWorkouts(rows.map(createSavedRoutinePreviewFromRecord));
    } catch (error) {
      setSavedWorkoutsError(
        error instanceof Error ? error.message : "Unable to load saved workouts.",
      );
    } finally {
      setSavedWorkoutsLoading(false);
    }
  }, []);

  const loadScheduledWorkouts = useCallback(async (token: string) => {
    setScheduledWorkoutsLoading(true);
    setScheduledWorkoutsError(null);

    try {
      const rows = await listScheduledWorkouts(token);
      setScheduledWorkouts(rows);
      // Clear any local notifications whose schedule rows were removed elsewhere.
      void reconcileScheduledNotifications(
        rows.filter((row) => row.status === "scheduled").map((row) => row.id),
      );
    } catch (error) {
      setScheduledWorkoutsError(
        error instanceof Error
          ? error.message
          : "Unable to load scheduled workouts.",
      );
    } finally {
      setScheduledWorkoutsLoading(false);
    }
  }, []);

  const loadCompletedWorkouts = useCallback(async (token: string) => {
    setCompletedWorkoutsLoading(true);
    setCompletedWorkoutsError(null);

    try {
      // Completed workout history is account-backed and should survive logout/login and device switches.
      const rows = await listCompletedWorkouts(token);
      setCompletedWorkouts(rows);
      setCompletedWorkoutsLoaded(true);
    } catch (error) {
      setCompletedWorkoutsError(
        error instanceof Error ? error.message : "Unable to load workout history.",
      );
    } finally {
      setCompletedWorkoutsLoading(false);
    }
  }, []);

  const loadBodyWeightEntries = useCallback(async (token: string) => {
    setBodyWeightEntriesLoading(true);
    setBodyWeightEntriesError(null);

    try {
      const rows = await listBodyWeightEntries(token);
      setBodyWeightEntries(rows);
    } catch (error) {
      setBodyWeightEntriesError(
        error instanceof Error ? error.message : "Unable to load body weight history.",
      );
    } finally {
      setBodyWeightEntriesLoading(false);
    }
  }, []);

  const applyAuthLandingOnboarding = useCallback(
    async (profile: UserProfile, token: string) => {
      if (!authLandingOnboardingPayload || profile.onboarding) {
        return profile;
      }

      const response = await saveOnboarding(token, authLandingOnboardingPayload);
      setAuthLandingOnboardingPayload(null);
      posthog.capture("onboarding_completed", { user_id: response.profile.id });
      await loadBodyWeightEntries(token);
      setTimeout(() => {
        void requestNotificationPermissionForOnboarding().then(() => {
          void syncExpoPushTokenWithBackend(token);
        });
      }, 400);
      return response.profile;
    },
    [authLandingOnboardingPayload, loadBodyWeightEntries],
  );

  useEffect(() => {
    if (!currentUser || !accessToken) {
      setSavedWorkouts([]);
      setSavedWorkoutsError(null);
      setScheduledWorkouts([]);
      setScheduledWorkoutsError(null);
      setCompletedWorkouts([]);
      setCompletedWorkoutsLoaded(false);
      setCompletedWorkoutsError(null);
      setBodyWeightEntries([]);
      setBodyWeightEntriesError(null);
      hubPreviousTabRef.current = "saved";
      return;
    }

    // The backend/database is the source of truth for per-user workout data.
    void loadSavedWorkouts(accessToken);
    void loadScheduledWorkouts(accessToken);
    void loadCompletedWorkouts(accessToken);
    void loadBodyWeightEntries(accessToken);
  }, [
    accessToken,
    currentUser,
    loadBodyWeightEntries,
    loadCompletedWorkouts,
    loadSavedWorkouts,
    loadScheduledWorkouts,
  ]);

  useEffect(() => {
    const cameBackToHub =
      activeTab === "saved" && hubPreviousTabRef.current !== "saved";
    hubPreviousTabRef.current = activeTab;

    if (!accessToken || !currentUser || !cameBackToHub) {
      return;
    }
    void loadCompletedWorkouts(accessToken);
  }, [accessToken, activeTab, currentUser, loadCompletedWorkouts]);

  const refreshHubWorkoutData = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    await Promise.all([
      loadSavedWorkouts(accessToken),
      loadScheduledWorkouts(accessToken),
      loadCompletedWorkouts(accessToken),
    ]);
  }, [
    accessToken,
    loadCompletedWorkouts,
    loadSavedWorkouts,
    loadScheduledWorkouts,
  ]);

  const onboardingSex = currentUser?.onboarding?.sex ?? null;
  const starterDemoTitle = getStarterDemoTitleForSex(onboardingSex);

  const markHubTourComplete = useCallback(async () => {
    const userId = currentUser?.id;
    setHubTourStep(null);
    setHubTourCoachRect(null);
    if (!userId) {
      return;
    }
    try {
      await AsyncStorage.setItem(getHubTourDoneStorageKey(userId), "1");
      await AsyncStorage.removeItem(getHubTourStepStorageKey(userId));
    } catch {
      // Best-effort persistence.
    }
  }, [currentUser?.id]);

  const handleDismissFirstHubTip = useCallback(async () => {
    const userId = currentUser?.id;
    if (!userId) {
      setIsFirstHubTipVisible(false);
      return;
    }
    try {
      await AsyncStorage.setItem(getFirstHubTipStorageKey(userId), "1");
    } catch {
      // Still close the sheet so onboarding never traps the hub.
    } finally {
      setIsFirstHubTipVisible(false);
      try {
        const tourDone = await AsyncStorage.getItem(getHubTourDoneStorageKey(userId));
        if (tourDone === "1") {
          return;
        }
        const savedStep = await AsyncStorage.getItem(getHubTourStepStorageKey(userId));
        const nextStep = (savedStep as HubTourStep) || "saved_card";
        setHubTourStep(nextStep);
      } catch {
        setHubTourStep("saved_card");
      }
    }
  }, [currentUser?.id]);

  useEffect(() => {
    hubTourStepRef.current = hubTourStep;
  }, [hubTourStep]);

  useEffect(() => {
    if (!currentUser?.id || !activeSession || !isActiveWorkoutVisible) {
      coachCoachmarkHydratedRef.current = false;
      setCoachCoachmarkVisible(false);
      setCoachCoachmarkRect(null);
      return;
    }
    if (coachCoachmarkHydratedRef.current) {
      return;
    }
    coachCoachmarkHydratedRef.current = true;
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(
          getCoachCoachmarkStorageKey(currentUser.id),
        );
        if (done === "1") {
          setCoachCoachmarkVisible(false);
          return;
        }
        setCoachCoachmarkVisible(true);
      } catch {
        setCoachCoachmarkVisible(true);
      }
    })();
  }, [activeSession, currentUser?.id, isActiveWorkoutVisible]);

  useEffect(() => {
    if (!currentUser?.id || !hubTourStep) {
      return;
    }
    void AsyncStorage.setItem(
      getHubTourStepStorageKey(currentUser.id),
      hubTourStep,
    ).catch(() => undefined);
  }, [hubTourStep, currentUser?.id]);

  useEffect(() => {
    if (
      !POST_SIGNUP_HUB_GUIDANCE_ENABLED ||
      !currentUser?.id ||
      !hasBillingAccess ||
      isBillingCheckPending
    ) {
      return undefined;
    }
    let alive = true;
    void (async () => {
      try {
        const tourDone = await AsyncStorage.getItem(
          getHubTourDoneStorageKey(currentUser.id),
        );
        if (!alive || tourDone === "1") {
          return;
        }
        const tipDone = await AsyncStorage.getItem(
          getFirstHubTipStorageKey(currentUser.id),
        );
        if (tipDone !== "1") {
          return;
        }
        const savedStep = await AsyncStorage.getItem(
          getHubTourStepStorageKey(currentUser.id),
        );
        if (
          savedStep === "saved_card" ||
          savedStep === "library_demo" ||
          savedStep === "start_session" ||
          savedStep === "active_scroll" ||
          savedStep === "finish_workout"
        ) {
          setHubTourStep((current) => current ?? (savedStep as HubTourStep));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUser?.id, hasBillingAccess, isBillingCheckPending]);

  useEffect(() => {
    if (hubTourStep !== "saved_card") {
      return;
    }
    if (isSavedLibraryVisible) {
      setHubTourStep("library_demo");
      setHubTourCoachRect(null);
    }
  }, [hubTourStep, isSavedLibraryVisible]);

  useEffect(() => {
    if (hubTourStep !== "library_demo" || !selectedSavedRoutine) {
      return;
    }
    if (isStarterDemoWorkoutTitle(selectedSavedRoutine.title, onboardingSex)) {
      setHubTourStep("start_session");
      setHubTourCoachRect(null);
    }
  }, [hubTourStep, selectedSavedRoutine, onboardingSex]);

  useEffect(() => {
    if (hubTourStep !== "library_demo") {
      return;
    }
    if (!isSavedLibraryVisible && !selectedSavedRoutine) {
      setHubTourStep("saved_card");
      setHubTourCoachRect(null);
    }
  }, [hubTourStep, isSavedLibraryVisible, selectedSavedRoutine]);

  const handleHubTourFinishButtonVisible = useCallback(
    () => {
      if (hubTourStep !== "active_scroll") {
        return;
      }
      setHubTourStep("finish_workout");
      setHubTourCoachRect(null);
    },
    [hubTourStep],
  );

  useEffect(() => {
    if (!currentUser) {
      setIsFirstHubTipVisible(false);
      setIsPostPaywallWelcomeVisible(false);
      pendingPostPaywallWelcomeRef.current = false;
    }
  }, [currentUser]);

  useEffect(() => {
    if (!accessToken || !currentUser?.onboarding) {
      return undefined;
    }

    let alive = true;
    void (async () => {
      try {
        await ensureStarterWorkoutsSeeded(
          accessToken,
          async () => {
            if (!alive) {
              return;
            }
            await loadSavedWorkouts(accessToken);
          },
          currentUser.onboarding?.sex ?? null,
          currentUser.id,
        );
        if (!alive) {
          return;
        }
        // Hub guidance (coachmarks + tip modal) remains opt-in and can be
        // gated by billing access, but seeding starter workouts should happen
        // for all onboarded users.
        if (
          !POST_SIGNUP_HUB_GUIDANCE_ENABLED ||
          !hasBillingAccess ||
          isBillingCheckPending
        ) {
          setIsFirstHubTipVisible(false);
          setHubTourStep(null);
          setHubTourCoachRect(null);
          return;
        }
        const tipKey = getFirstHubTipStorageKey(currentUser.id);
        const tipDone = await AsyncStorage.getItem(tipKey);
        if (tipDone === "1") {
          return;
        }

        // Show the nudge immediately after seed completes so users see it
        // right when they land in the hub.
        setIsFirstHubTipVisible(true);
      } catch {
        // Starter rows + deferred hub tip remain best-effort.
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    accessToken,
    currentUser?.id,
    currentUser?.onboarding,
    currentUser?.onboarding?.sex,
    hasBillingAccess,
    isBillingCheckPending,
    loadSavedWorkouts,
  ]);

  const handleExtractWorkout = useCallback(async (url: string) => {
    if (!accessToken) {
      setSubmitError("You need to be logged in to import workouts.");
      return;
    }

    setSubmitError(null);
    setLatestImportedRoutine(null);
    setJobId(null);
    setIsExtractSubmitting(true);

    try {
      const response = await createIngestionJob(url, accessToken);

      if (!response.ok || !response.job_id) {
        const detail = response.error?.trim();
        setSubmitError(
          detail ? humanizeIngestError(detail) : "Failed to start extraction",
        );
        return;
      }

      setJobId(response.job_id);
      posthog.capture("workout_import_initiated", { source_url: url, job_id: response.job_id });
    } catch (error) {
      setSubmitError(
        humanizeIngestError(
          error instanceof Error ? error.message : "Something went wrong",
        ),
      );
    } finally {
      setIsExtractSubmitting(false);
    }
  }, [accessToken]);

  useSharedIngestUrl(applyIncomingIngestUrl);

  useEffect(() => {
    if (!isShareIntentReady || !hasShareIntent) {
      return;
    }
    const candidate = extractIngestibleUrlFromSharePayload(
      shareIntent.webUrl,
      shareIntent.text,
    );
    if (!candidate) {
      resetShareIntent();
      return;
    }
    if (handledNativeShareUrls.current.has(candidate)) {
      resetShareIntent();
      return;
    }
    handledNativeShareUrls.current.add(candidate);
    applyIncomingIngestUrl(candidate);
    resetShareIntent();
  }, [
    applyIncomingIngestUrl,
    hasShareIntent,
    isShareIntentReady,
    resetShareIntent,
    shareIntent.text,
    shareIntent.webUrl,
  ]);

  // If the share hand-off arrived before auth was ready, replay it as soon as
  // the user is authenticated so their brainrot-to-workout pipeline keeps
  // flowing without them having to open the app manually.
  useEffect(() => {
    if (!accessToken || !sharedIngestUrl || isAddWorkoutVisible) {
      return;
    }
    setIsAddWorkoutVisible(true);
  }, [accessToken, isAddWorkoutVisible, sharedIngestUrl]);

  const handleReplayCompletedWorkout = useCallback(
    (record: CompletedWorkoutRecord) => {
      setActiveSession(createActiveSessionFromCompletedWorkout(record));
      setActiveTab("logs");
      setIsActiveWorkoutVisible(true);
      setSelectedCompletedWorkout(null);
      setSelectedSavedRoutine(null);
      setIsAddWorkoutVisible(false);
      setSharedIngestUrl(null);
      setIsShareDrivenIngest(false);
      resetImportFlow();
    },
    [resetImportFlow],
  );

  const handleStartSession = useCallback(
    (routine?: SavedRoutinePreview) => {
      const sourceRoutine = routine || latestImportedRoutine;
      const tourStepNow = hubTourStepRef.current;
      const advanceTourToActiveScroll =
        POST_SIGNUP_HUB_GUIDANCE_ENABLED &&
        (tourStepNow === "start_session" || tourStepNow === "library_demo") &&
        Boolean(
          sourceRoutine &&
            isStarterDemoWorkoutTitle(sourceRoutine.title, onboardingSex),
        );

      if (sourceRoutine?.workoutPlan) {
        setActiveSession(
          createActiveSessionFromPlan(sourceRoutine.workoutPlan, {
            description: sourceRoutine.description,
            scheduledWorkoutId: sourceRoutine.scheduledWorkoutId ?? null,
            sourceJobId: sourceRoutine.jobId ?? null,
            sourceUrl: sourceRoutine.sourceUrl ?? null,
            sourceWorkoutId: sourceRoutine.workoutId ?? null,
            title: sourceRoutine.title,
          }),
        );
      } else {
        setActiveSession(
          createDefaultActiveSession({
            description: sourceRoutine?.description,
            scheduledWorkoutId: sourceRoutine?.scheduledWorkoutId ?? null,
            sourceJobId: sourceRoutine?.jobId ?? null,
            sourceUrl: sourceRoutine?.sourceUrl ?? null,
            sourceWorkoutId: sourceRoutine?.workoutId ?? null,
            title: sourceRoutine?.title,
            workoutPlan: sourceRoutine?.workoutPlan ?? null,
          }),
        );
      }

      posthog.capture("workout_started", {
        title: sourceRoutine?.title ?? null,
        source_url: sourceRoutine?.sourceUrl ?? null,
      });
      setActiveTab("logs");
      setIsActiveWorkoutVisible(true);
      setSelectedCompletedWorkout(null);
      setSelectedSavedRoutine(null);
      setIsAddWorkoutVisible(false);
      // Clear the share-driven state too so the auto-replay effect below
      // doesn't re-open the modal and kick off a second ingestion job.
      setSharedIngestUrl(null);
      setIsShareDrivenIngest(false);
      resetImportFlow();

      if (advanceTourToActiveScroll) {
        setHubTourStep("active_scroll");
        setHubTourCoachRect(null);
      }
    },
    [latestImportedRoutine, onboardingSex, resetImportFlow],
  );

  const handleScheduleImportedWorkout = useCallback(
    async (scheduledFor: string) => {
      if (!accessToken || !latestImportedRoutine) {
        return;
      }

      setIsSchedulingWorkout(true);
      try {
        const importThumbnailUrl =
          job?.thumbnail_url ?? latestImportedRoutine.thumbnailUrl ?? null;
        // Always mirror the imported workout into the saved library first so schedules
        // point at a persistent source record that the user can edit or reuse later.
        const saved = await saveWorkoutForLater(accessToken, {
          workout_id: workout?.id ?? latestImportedRoutine.workoutId ?? null,
          job_id: job?.id ?? latestImportedRoutine.jobId ?? null,
          source_url: job?.source_url ?? latestImportedRoutine.sourceUrl ?? null,
          thumbnail_url: importThumbnailUrl,
          title: latestImportedRoutine.title,
          description: latestImportedRoutine.description,
          meta_left: latestImportedRoutine.metaLeft,
          meta_right: latestImportedRoutine.metaRight,
          badge_label: latestImportedRoutine.badgeLabel ?? null,
          workout_plan: latestImportedRoutine.workoutPlan ?? null,
        });
        const savedPreview = createSavedRoutinePreviewFromRecord(saved);
        setSavedWorkouts((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== savedPreview.id,
          );
          return [savedPreview, ...withoutDuplicate];
        });

        const scheduled = await createScheduledWorkout(accessToken, {
          source_workout_id: saved.id,
          workout_id: saved.workout_id ?? null,
          job_id: saved.job_id ?? null,
          source_url: saved.source_url ?? null,
          thumbnail_url: importThumbnailUrl,
          scheduled_for: scheduledFor,
          title: latestImportedRoutine.title,
          description: latestImportedRoutine.description,
          meta_left: latestImportedRoutine.metaLeft,
          meta_right: latestImportedRoutine.metaRight,
          badge_label: latestImportedRoutine.badgeLabel ?? null,
          workout_plan: latestImportedRoutine.workoutPlan ?? null,
        });
        setScheduledWorkouts((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== scheduled.id,
          );
          return [...withoutDuplicate, scheduled].sort((left, right) =>
            left.scheduled_for.localeCompare(right.scheduled_for),
          );
        });

        // Fire-and-forget local reminders for the day before and day of.
        void scheduleWorkoutReminder(scheduled);

        setSavedWorkoutsError(null);
        setScheduledWorkoutsError(null);
        setSubmitError(null);
        setActiveTab("saved");
        // Clear the share replay trigger before closing the modal. Otherwise
        // the shared-URL effect can see "URL present + modal closed" and reopen
        // the import form on top of the scheduled confirmation screen.
        posthog.capture("workout_scheduled", {
          scheduled_workout_id: scheduled.id,
          title: latestImportedRoutine.title ?? null,
          scheduled_for: scheduled.scheduled_for,
          origin: isShareDrivenIngest ? "share" : "manual",
        });
        setSharedIngestUrl(null);
        setIsShareDrivenIngest(false);
        setIsAddWorkoutVisible(false);
        setScheduledConfirmation({
          title: latestImportedRoutine.title,
          scheduledFor: scheduled.scheduled_for,
          origin: isShareDrivenIngest ? "share" : "manual",
        });
        // Defer clearing the state that feeds AddWorkoutModal's rendered
        // preview content (routine/job) until after the modal has finished its
        // fade-out animation.
        scheduleAddWorkoutCleanup();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Unable to schedule this workout right now.",
        );
      } finally {
        setIsSchedulingWorkout(false);
      }
    },
    [
      accessToken,
      isShareDrivenIngest,
      job,
      latestImportedRoutine,
      scheduleAddWorkoutCleanup,
      workout,
    ],
  );

  const handleSaveImportedWorkout = useCallback(async () => {
    if (!accessToken || !latestImportedRoutine) {
      return;
    }

    setIsSavingImportedWorkout(true);
    try {
      const importThumbnailUrl =
        job?.thumbnail_url ?? latestImportedRoutine.thumbnailUrl ?? null;
      const saved = await saveWorkoutForLater(accessToken, {
        workout_id: workout?.id ?? latestImportedRoutine.workoutId ?? null,
        job_id: job?.id ?? latestImportedRoutine.jobId ?? null,
        source_url: job?.source_url ?? latestImportedRoutine.sourceUrl ?? null,
        thumbnail_url: importThumbnailUrl,
        title: latestImportedRoutine.title,
        description: latestImportedRoutine.description,
        meta_left: latestImportedRoutine.metaLeft,
        meta_right: latestImportedRoutine.metaRight,
        badge_label: latestImportedRoutine.badgeLabel ?? null,
        workout_plan: latestImportedRoutine.workoutPlan ?? null,
      });
      const savedPreview = createSavedRoutinePreviewFromRecord(saved);
      setSavedWorkouts((current) => {
        const withoutDuplicate = current.filter(
          (item) => item.id !== savedPreview.id,
        );
        return [savedPreview, ...withoutDuplicate];
      });

      posthog.capture("workout_saved", {
        saved_workout_id: savedPreview.id,
        title: savedPreview.title ?? null,
        source_url: savedPreview.sourceUrl ?? null,
      });
      setSavedWorkoutsError(null);
      setSubmitError(null);
      setActiveTab("saved");
      setSharedIngestUrl(null);
      setIsShareDrivenIngest(false);
      setIsAddWorkoutVisible(false);
      // Same rationale as handleScheduleImportedWorkout: defer clearing the
      // modal's preview props (routine/job) until the fade-out is done,
      // otherwise the preview visibly snaps back to the URL form while the
      // modal is still animating closed.
      scheduleAddWorkoutCleanup();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to save this workout right now.",
      );
    } finally {
      setIsSavingImportedWorkout(false);
    }
  }, [
    accessToken,
    job,
    latestImportedRoutine,
    scheduleAddWorkoutCleanup,
    workout,
  ]);

  const handleUnscheduleWorkout = useCallback(
    (
      scheduledWorkoutId: string,
      options?: { afterConfirm?: () => void },
    ) => {
      if (!accessToken) {
        return;
      }

      Alert.alert(
        "Unschedule this workout?",
        "It will be removed from your calendar. Saved copies stay in your library.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unschedule",
            style: "destructive",
            onPress: () => {
              options?.afterConfirm?.();

              let previous: ScheduledWorkoutRecord[] = [];
              setScheduledWorkouts((current) => {
                previous = current;
                return current.filter((item) => item.id !== scheduledWorkoutId);
              });
              setScheduledWorkoutsError(null);
              void cancelWorkoutReminder(scheduledWorkoutId);

              void deleteScheduledWorkout(accessToken, scheduledWorkoutId)
                .then(() => {
                  setScheduledWorkoutsError(null);
                })
                .catch((error) => {
                  setScheduledWorkouts(previous);
                  setScheduledWorkoutsError(
                    error instanceof Error
                      ? error.message
                      : "Unable to remove that scheduled workout.",
                  );
                });
            },
          },
        ],
      );
    },
    [accessToken],
  );

  const handleUpdateSavedRoutine = useCallback(
    (updates: SavedRoutineUpdate) => {
      if (!accessToken) {
        return;
      }
      const targetId = selectedSavedRoutine?.id;
      if (!targetId) {
        return;
      }
      const scheduledId = selectedSavedRoutine?.scheduledWorkoutId ?? null;
      const savedId = selectedSavedRoutine?.savedWorkoutId ?? null;
      // Editing a scheduled view should patch the scheduled_workouts row (so
      // the calendar stays correct). Editing a plain saved view should patch
      // saved_workouts. If neither id is present there's nothing to persist.
      if (!scheduledId && !savedId) {
        return;
      }

      // Optimistically merge the edit into the currently-displayed routine
      // and all cached lists so the UI reflects the change instantly while
      // the PATCH is in flight. On failure we refetch to snap back.
      const mergeIntoPreview = (
        preview: SavedRoutinePreview,
      ): SavedRoutinePreview => ({
        ...preview,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.description !== undefined
          ? { description: updates.description }
          : {}),
        ...(updates.metaLeft !== undefined ? { metaLeft: updates.metaLeft } : {}),
        ...(updates.metaRight !== undefined ? { metaRight: updates.metaRight } : {}),
        ...(updates.workoutPlan !== undefined
          ? { workoutPlan: updates.workoutPlan }
          : {}),
      });

      setSelectedSavedRoutine((current) =>
        current && current.id === targetId ? mergeIntoPreview(current) : current,
      );
      if (savedId) {
        setSavedWorkouts((current) =>
          current.map((item) =>
            item.id === savedId || item.savedWorkoutId === savedId
              ? mergeIntoPreview(item)
              : item,
          ),
        );
      }
      if (scheduledId) {
        setScheduledWorkouts((current) =>
          current.map((record) => {
            if (record.id !== scheduledId) {
              return record;
            }
            return {
              ...record,
              title: updates.title ?? record.title,
              description:
                updates.description !== undefined
                  ? updates.description
                  : record.description,
              meta_left:
                updates.metaLeft !== undefined ? updates.metaLeft : record.meta_left,
              meta_right:
                updates.metaRight !== undefined ? updates.metaRight : record.meta_right,
              workout_plan:
                updates.workoutPlan !== undefined
                  ? updates.workoutPlan
                  : record.workout_plan,
            };
          }),
        );
      }

      // Build the actual PATCH body. We only send the fields that changed so
      // the server-side allowlists leave every other column untouched.
      const payload: {
        title?: string;
        description?: string | null;
        meta_left?: string | null;
        meta_right?: string | null;
        workout_plan?: WorkoutPlan | null;
      } = {};
      if (updates.title !== undefined) {
        payload.title = updates.title;
      }
      if (updates.description !== undefined) {
        payload.description = updates.description || null;
      }
      if (updates.metaLeft !== undefined) {
        payload.meta_left = updates.metaLeft || null;
      }
      if (updates.metaRight !== undefined) {
        payload.meta_right = updates.metaRight || null;
      }
      if (updates.workoutPlan !== undefined) {
        payload.workout_plan = updates.workoutPlan;
      }
      if (Object.keys(payload).length === 0) {
        return;
      }

      void (async () => {
        try {
          if (scheduledId) {
            await updateScheduledWorkout(accessToken, scheduledId, payload);
          } else if (savedId) {
            await updateSavedWorkout(accessToken, savedId, payload);
          }
        } catch (error) {
          // Best-effort recovery: surface the error on the relevant list and
          // reload authoritative data so the UI stops showing stale edits.
          const message =
            error instanceof Error
              ? error.message
              : "Couldn't save that change. Try again.";
          if (scheduledId) {
            setScheduledWorkoutsError(message);
            void loadScheduledWorkouts(accessToken);
          } else {
            setSavedWorkoutsError(message);
            void loadSavedWorkouts(accessToken);
          }
        }
      })();
    },
    [
      accessToken,
      loadSavedWorkouts,
      loadScheduledWorkouts,
      selectedSavedRoutine,
    ],
  );

  const handleRequestScheduleAgainForCompleted = useCallback(
    (record: CompletedWorkoutRecord) => {
      const meta = getCompletedWorkoutMeta(record);
      const displayTitle = getRoutineDisplayTitle({
        sourceUrl: record.source_url,
        title: record.title,
        workoutPlan: record.workout_plan,
      });
      setScheduleAgainError(null);
      setScheduleAgainTarget({
        id: record.id,
        title: displayTitle,
        description: record.description,
        workoutId: record.workout_id,
        jobId: record.job_id,
        sourceUrl: record.source_url,
        workoutPlan: record.workout_plan,
        metaLeft: meta.metaLeft,
        metaRight: meta.metaRight,
        badgeLabel: "Scheduled",
        savedWorkoutId: null,
      });
    },
    [],
  );

  const handleRequestScheduleAgainForActiveSession = useCallback(
    (session: ActiveSessionPreview) => {
      const setCount = getCompletedWorkoutSetCount(session.exercises);
      const metaLeft = session.workoutPlan?.workout_type
        ? session.workoutPlan.workout_type.replace(/_/g, " ")
        : "Workout";
      const metaRight = `${setCount} ${setCount === 1 ? "set" : "sets"}`;
      const displayTitle = getRoutineDisplayTitle({
        sourceUrl: session.sourceUrl ?? null,
        title: session.title,
        workoutPlan: session.workoutPlan ?? null,
      });
      setScheduleAgainError(null);
      setScheduleAgainTarget({
        id: `active-${session.startedAt}`,
        title: displayTitle,
        description: session.description,
        workoutId: session.sourceWorkoutId ?? null,
        jobId: session.sourceJobId ?? null,
        sourceUrl: session.sourceUrl ?? null,
        workoutPlan: session.workoutPlan ?? null,
        metaLeft,
        metaRight,
        badgeLabel: "Scheduled",
        savedWorkoutId: null,
      });
    },
    [],
  );

  // Persist the in-progress session to the saved library so the athlete
  // can re-run the same routine later. Mirrors handleSaveImportedWorkout
  // but reads from the active session's snapshot — including any
  // exercises edits made during the session — instead of the most
  // recent import preview.
  const handleSaveActiveSession = useCallback(
    async (session: ActiveSessionPreview) => {
      if (!accessToken) {
        return;
      }

      setIsSavingActiveSession(true);
      try {
        const setCount = getCompletedWorkoutSetCount(session.exercises);
        const metaLeft = session.workoutPlan?.workout_type
          ? session.workoutPlan.workout_type.replace(/_/g, " ")
          : "Workout";
        const metaRight = `${setCount} ${setCount === 1 ? "set" : "sets"}`;
        const displayTitle = getRoutineDisplayTitle({
          sourceUrl: session.sourceUrl ?? null,
          title: session.title,
          workoutPlan: session.workoutPlan ?? null,
        });

        const saved = await saveWorkoutForLater(accessToken, {
          workout_id: session.sourceWorkoutId ?? null,
          job_id: session.sourceJobId ?? null,
          source_url: session.sourceUrl ?? null,
          thumbnail_url: null,
          title: displayTitle,
          description: session.description || null,
          meta_left: metaLeft,
          meta_right: metaRight,
          badge_label: "Saved",
          workout_plan: session.workoutPlan ?? null,
        });
        const savedPreview = createSavedRoutinePreviewFromRecord(saved);
        setSavedWorkouts((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== savedPreview.id,
          );
          return [savedPreview, ...withoutDuplicate];
        });

        posthog.capture("workout_saved", {
          saved_workout_id: savedPreview.id,
          title: savedPreview.title ?? null,
          source_url: savedPreview.sourceUrl ?? null,
          source: "active_session",
        });
        setSavedWorkoutsError(null);
        setSavedActiveSessionStartedAt(session.startedAt);
      } catch (error) {
        setSavedWorkoutsError(
          error instanceof Error
            ? error.message
            : "Unable to save this workout right now.",
        );
      } finally {
        setIsSavingActiveSession(false);
      }
    },
    [accessToken, posthog],
  );

  // Schedule a workout that's already in the user's saved library. The
  // existing saved row is reused as the schedule's source — no need to
  // re-save it.
  const handleRequestScheduleSavedWorkout = useCallback(
    (routine: SavedRoutinePreview) => {
      const savedWorkoutId = routine.savedWorkoutId || routine.id;
      setScheduleAgainError(null);
      setScheduleAgainTarget({
        id: `saved-${savedWorkoutId}`,
        title: routine.title,
        description: routine.description ? routine.description : null,
        workoutId: routine.workoutId ?? null,
        jobId: routine.jobId ?? null,
        sourceUrl: routine.sourceUrl ?? null,
        workoutPlan: routine.workoutPlan ?? null,
        metaLeft: routine.metaLeft,
        metaRight: routine.metaRight,
        badgeLabel: routine.badgeLabel ?? "Scheduled",
        thumbnailUrl: routine.thumbnailUrl ?? null,
        savedWorkoutId,
      });
    },
    [],
  );

  const handleCloseScheduleAgain = useCallback(() => {
    if (isSchedulingAgain) {
      return;
    }
    setScheduleAgainTarget(null);
    setScheduleAgainError(null);
  }, [isSchedulingAgain]);

  const handleConfirmScheduleAgain = useCallback(
    async (scheduledFor: string) => {
      if (!accessToken || !scheduleAgainTarget) {
        return;
      }

      setIsSchedulingAgain(true);
      setScheduleAgainError(null);
      try {
        // If the target is already a saved-library row, skip the round trip
        // through saveWorkoutForLater (which would create a duplicate). Otherwise
        // mirror the workout into the saved library first so the schedule has a
        // persistent source record (same pattern as scheduling freshly
        // imported workouts).
        let sourceWorkoutId: string | null = scheduleAgainTarget.savedWorkoutId;
        let sourceWorkoutWorkoutId: string | null = scheduleAgainTarget.workoutId;
        let sourceJobId: string | null = scheduleAgainTarget.jobId;
        let sourceSourceUrl: string | null = scheduleAgainTarget.sourceUrl;
        let scheduleThumbnailUrl: string | null =
          scheduleAgainTarget.thumbnailUrl ?? null;

        if (!sourceWorkoutId) {
          const saved = await saveWorkoutForLater(accessToken, {
            workout_id: scheduleAgainTarget.workoutId,
            job_id: scheduleAgainTarget.jobId,
            source_url: scheduleAgainTarget.sourceUrl,
            thumbnail_url: scheduleAgainTarget.thumbnailUrl ?? null,
            title: scheduleAgainTarget.title,
            description: scheduleAgainTarget.description,
            meta_left: scheduleAgainTarget.metaLeft,
            meta_right: scheduleAgainTarget.metaRight,
            badge_label: scheduleAgainTarget.badgeLabel,
            workout_plan: scheduleAgainTarget.workoutPlan,
          });
          sourceWorkoutId = saved.id;
          sourceWorkoutWorkoutId = saved.workout_id ?? null;
          sourceJobId = saved.job_id ?? null;
          sourceSourceUrl = saved.source_url ?? null;
          scheduleThumbnailUrl = saved.thumbnail_url ?? scheduleThumbnailUrl;
          const savedPreview = createSavedRoutinePreviewFromRecord(saved);
          setSavedWorkouts((current) => {
            const withoutDuplicate = current.filter(
              (item) => item.id !== savedPreview.id,
            );
            return [savedPreview, ...withoutDuplicate];
          });
        }

        const scheduled = await createScheduledWorkout(accessToken, {
          source_workout_id: sourceWorkoutId,
          workout_id: sourceWorkoutWorkoutId,
          job_id: sourceJobId,
          source_url: sourceSourceUrl,
          thumbnail_url: scheduleThumbnailUrl,
          scheduled_for: scheduledFor,
          title: scheduleAgainTarget.title,
          description: scheduleAgainTarget.description,
          meta_left: scheduleAgainTarget.metaLeft,
          meta_right: scheduleAgainTarget.metaRight,
          badge_label: scheduleAgainTarget.badgeLabel,
          workout_plan: scheduleAgainTarget.workoutPlan,
        });
        setScheduledWorkouts((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== scheduled.id,
          );
          return [...withoutDuplicate, scheduled].sort((left, right) =>
            left.scheduled_for.localeCompare(right.scheduled_for),
          );
        });
        void scheduleWorkoutReminder(scheduled);

        setSavedWorkoutsError(null);
        setScheduledWorkoutsError(null);
        setScheduleAgainTarget(null);
        setScheduledConfirmation({
          title: scheduleAgainTarget.title,
          scheduledFor: scheduled.scheduled_for,
          origin: "manual",
        });
      } catch (error) {
        setScheduleAgainError(
          error instanceof Error
            ? error.message
            : "Unable to schedule that workout right now.",
        );
      } finally {
        setIsSchedulingAgain(false);
      }
    },
    [accessToken, scheduleAgainTarget],
  );

  const handleCreateManualWorkout = useCallback(() => {
    if (!accessToken) {
      return;
    }

    setSubmitError(null);
    setIsAddWorkoutVisible(false);
    resetImportFlow();

    void (async () => {
      try {
        const saved = await saveWorkoutForLater(accessToken, {
          title: "Custom Routine Draft",
          description: "Fresh template for a manually created workout session.",
          meta_left: "Draft",
          meta_right: "Editable",
          badge_label: "Saved",
          workout_plan: null,
        });
        const preview = createSavedRoutinePreviewFromRecord(saved);
        setSavedWorkouts((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== preview.id);
          return [preview, ...withoutDuplicate];
        });
        // Immediately open the manual draft editor so "Create manually" feels
        // like a navigation action (not a silent save).
        setSelectedSavedRoutine(preview);
        setActiveTab("saved");
        setIsSavedLibraryVisible(false);
        setSavedWorkoutsError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to create that workout right now.";
        setSavedWorkoutsError(message);
        Alert.alert("Couldn't create workout", message);
      }
    })();
  }, [accessToken, resetImportFlow]);

  const maybeRequestStoreReviewAfterFirstWorkout = useCallback(
    async (userId: string) => {
      if (storeReviewPromptQueuedUserIdsRef.current.has(userId)) {
        return;
      }

      try {
        const storageKey = getStoreReviewPromptStorageKey(userId);
        const alreadyPrompted = await AsyncStorage.getItem(storageKey);
        if (alreadyPrompted === "1") {
          return;
        }

        const canRequestReview = await StoreReview.hasAction();
        if (!canRequestReview) {
          return;
        }

        storeReviewPromptQueuedUserIdsRef.current.add(userId);
        await AsyncStorage.setItem(storageKey, "1");
        posthog.capture("store_review_prompt_shown", {
          trigger: "first_workout_completed",
        });

        setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            Alert.alert("Loving Fitfo?", "Leave a review.", [
              {
                text: "Maybe Later",
                style: "cancel",
                onPress: () =>
                  posthog.capture("store_review_prompt_dismissed", {
                    trigger: "first_workout_completed",
                  }),
              },
              {
                text: "Leave Review",
                onPress: () => {
                  posthog.capture("store_review_requested", {
                    trigger: "first_workout_completed",
                  });
                  void StoreReview.requestReview().catch((error) => {
                    posthog.capture("store_review_request_failed", {
                      message:
                        error instanceof Error
                          ? error.message
                          : "Unknown store review error",
                    });
                  });
                },
              },
            ]);
          });
        }, 1200);
      } catch {
        // Review prompts are opportunistic; never block workout completion.
      }
    },
    [],
  );

  const handleFinishWorkout = useCallback(
    async (finishedSession?: ActiveSessionPreview) => {
      const session = finishedSession ?? activeSession;
      const scheduledWorkoutIdToComplete = session?.scheduledWorkoutId ?? null;
      const finishedCoachKey = session ? String(session.startedAt) : null;
      const shouldCompleteHubTour = hubTourStepRef.current === "finish_workout";
      const shouldPromptForReview =
        Boolean(currentUser?.id) &&
        session != null &&
        getWorkoutCompletionRatio(session) >= STORE_REVIEW_COMPLETION_RATIO_THRESHOLD;

      if (shouldCompleteHubTour) {
        void markHubTourComplete();
      }

      setActiveSession(null);
      setIsActiveWorkoutVisible(false);
      setActiveTab("logs");

      if (finishedCoachKey) {
        setCoachMessagesByStartedAt((prev) => {
          if (!(finishedCoachKey in prev)) {
            return prev;
          }
          const { [finishedCoachKey]: _removed, ...rest } = prev;
          return rest;
        });
      }

      if (!session || !accessToken) {
        return;
      }

      try {
        // Persist the finished session to the current authenticated account before showing it in history.
        const completed = await createCompletedWorkout(
          accessToken,
          buildCompletedWorkoutRequest(session),
        );
        setCompletedWorkouts((current) => [completed, ...current]);
        setCompletedWorkoutsLoaded(true);
        setCompletedWorkoutsError(null);
        posthog.capture("workout_completed", {
          workout_id: completed.id,
          title: completed.title ?? null,
          duration_seconds: session
            ? Math.round((Date.now() - session.startedAt) / 1000)
            : null,
          exercise_count: completed.exercises?.length ?? null,
        });
        if (shouldPromptForReview && currentUser?.id) {
          void maybeRequestStoreReviewAfterFirstWorkout(currentUser.id);
        }

        if (scheduledWorkoutIdToComplete) {
          void cancelWorkoutReminder(scheduledWorkoutIdToComplete);
          try {
            await updateScheduledWorkout(accessToken, scheduledWorkoutIdToComplete, {
              status: "completed",
            });
            setScheduledWorkouts((prev) =>
              prev.filter((item) => item.id !== scheduledWorkoutIdToComplete),
            );
          } catch {
            // Row may still appear until the next hub refresh patches state.
            void loadScheduledWorkouts(accessToken);
          }
        }
      } catch (error) {
        setCompletedWorkoutsError(
          error instanceof Error ? error.message : "Unable to save your workout log.",
        );
      }
    },
    [
      accessToken,
      activeSession,
      completedWorkouts.length,
      completedWorkoutsLoaded,
      currentUser?.id,
      loadScheduledWorkouts,
      markHubTourComplete,
      maybeRequestStoreReviewAfterFirstWorkout,
    ],
  );

  const applyAuthenticatedSession = useCallback(
    (profile: UserProfile, token: string) => {
      setAccessToken(token);
      setCurrentUser(profile);
      setAuthPrefillPhone(profile.phone ?? "");
      setAuthPrefillFullName(profile.full_name);
      setAuthError(null);
      setAuthNotice(null);
      setPendingOtpChallenge(null);
      setAuthLandingIndex(0);
      setAuthMode("signup");
      resetPostLoginState();
    },
    [resetPostLoginState],
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      setAuthSubmittingMode("bootstrap");

      try {

        const storedSession = await getStoredAuthSession();
        if (!storedSession?.accessToken) {
          if (isMounted) {
            setCurrentUser(null);
          }
          return;
        }

        const response = await getCurrentUser(storedSession.accessToken);
        await storeAuthSession(storedSession.accessToken, response.profile);

        if (isMounted) {
          applyAuthenticatedSession(response.profile, storedSession.accessToken);
          posthog.identify(response.profile.id, {
            $set: { name: response.profile.full_name, phone: response.profile.phone },
          });
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearAuthSession().catch(() => undefined);
        }

        if (isMounted) {
          setAccessToken(null);
          setCurrentUser(null);
          if (!(error instanceof ApiError && error.status === 401)) {
            setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
            setAuthError(
              error instanceof Error
                ? error.message
                : "Unable to restore your session right now.",
            );
          }
        }
      } finally {
        if (isMounted) {
          setAuthSubmittingMode(null);
          setIsAuthReady(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [applyAuthenticatedSession]);

  const handleShowSignUp = useCallback((notice?: string) => {
    setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
    setAuthMode("signup");
    setPendingOtpChallenge(null);
    setAuthError(null);
    setAuthNotice(notice || null);
  }, []);

  const handleShowLogin = useCallback((notice?: string, phone?: string) => {
    setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
    setAuthMode("login");
    setPendingOtpChallenge(null);
    setAuthError(null);
    setAuthNotice(notice || null);
    setAuthLandingOnboardingPayload(null);
    setAuthPrefillFullName("");
    if (phone) {
      setAuthPrefillPhone(phone);
    }
  }, []);

  const beginOtpChallenge = useCallback(
    async ({
      intent,
      phone,
      fullName,
    }: {
      intent: OtpIntent;
      phone: string;
      fullName: string | null;
    }) => {
      const response = await sendOtp({
        phone,
        intent,
        ...(fullName ? { full_name: fullName } : {}),
      });

      setPendingOtpChallenge({
        intent,
        phone: response.normalized_phone,
        fullName,
        sentAt: Date.now(),
      });
      setAuthMode("otp");
      setAuthNotice(response.message);
    },
    [],
  );

  const handleAppleSignIn = useCallback(async () => {
    setAuthSubmittingMode("apple");
    setAuthError(null);
    setAuthNotice(null);

    try {
      const credential = await signInWithApple();
      if (!credential) {
        // User dismissed the Apple sheet — silent no-op.
        return;
      }

      const response = await appleSignIn({
        identity_token: credential.identityToken,
        raw_nonce: credential.rawNonce,
        full_name: credential.fullName ?? undefined,
        email: credential.email ?? undefined,
      });

      const profile = await applyAuthLandingOnboarding(
        response.profile,
        response.access_token,
      );
      await storeAuthSession(response.access_token, profile);
      applyAuthenticatedSession(profile, response.access_token);
      posthog.identify(profile.id, {
        $set: { name: profile.full_name, phone: profile.phone },
        $set_once: { first_sign_in_date: new Date().toISOString() },
      });
      posthog.capture("apple_sign_in_completed", { user_id: profile.id });
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Unable to sign in with Apple right now.",
      );
    } finally {
      setAuthSubmittingMode(null);
    }
  }, [applyAuthLandingOnboarding, applyAuthenticatedSession]);

  const handleLogin = useCallback(
    async (phone: string) => {
      setAuthSubmittingMode("login");
      setAuthError(null);
      setAuthNotice(null);
      setAuthPrefillPhone(phone);

      try {
        const response = await checkAccountStatus(phone);
        setAuthPrefillPhone(response.normalized_phone);

        if (!response.exists) {
          setAuthError(
            response.message || "No account found. Please sign up first.",
          );
          return;
        }

        await beginOtpChallenge({
          intent: "login",
          phone: response.normalized_phone,
          fullName: null,
        });
        posthog.capture("login_initiated");
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : "Unable to send the login code.",
        );
      } finally {
        setAuthSubmittingMode(null);
      }
    },
    [beginOtpChallenge],
  );

  const handleCreateAccount = useCallback(
    async (fullName: string, phone: string) => {
      setAuthSubmittingMode("signup");
      setAuthError(null);
      setAuthNotice(null);
      setAuthPrefillFullName(fullName);

      try {
        const response = await checkAccountStatus(phone);
        setAuthPrefillPhone(response.normalized_phone);

        if (response.exists) {
          handleShowLogin(
            response.message || "You already have an account. Please log in.",
            response.normalized_phone,
          );
          return;
        }

        await beginOtpChallenge({
          intent: "signup",
          phone: response.normalized_phone,
          fullName,
        });
        posthog.capture("sign_up_initiated");
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : "Unable to send the signup code.",
        );
      } finally {
        setAuthSubmittingMode(null);
      }
    },
    [beginOtpChallenge, handleShowLogin],
  );

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (!pendingOtpChallenge) {
        return;
      }

      setAuthSubmittingMode("otp");
      setAuthError(null);

      try {
        const response = await verifyOtp({
          phone: pendingOtpChallenge.phone,
          code,
          intent: pendingOtpChallenge.intent,
          ...(pendingOtpChallenge.fullName
            ? { full_name: pendingOtpChallenge.fullName }
            : {}),
        });

        const profile = await applyAuthLandingOnboarding(
          response.profile,
          response.access_token,
        );
        await storeAuthSession(response.access_token, profile);
        applyAuthenticatedSession(profile, response.access_token);
        posthog.identify(profile.id, {
          $set: { name: profile.full_name, phone: profile.phone },
          $set_once: { first_sign_in_date: new Date().toISOString() },
        });
        posthog.capture(
          pendingOtpChallenge.intent === "signup" ? "sign_up_completed" : "login_completed",
          { user_id: profile.id },
        );
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : "Unable to verify that code.",
        );
      } finally {
        setAuthSubmittingMode(null);
      }
    },
    [applyAuthLandingOnboarding, applyAuthenticatedSession, pendingOtpChallenge],
  );

  const handleResendOtp = useCallback(async () => {
    if (!pendingOtpChallenge) {
      return;
    }

    setIsResendingOtp(true);
    setAuthError(null);

    try {
      await beginOtpChallenge({
        intent: pendingOtpChallenge.intent,
        phone: pendingOtpChallenge.phone,
        fullName: pendingOtpChallenge.fullName,
      });
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to resend the code.",
      );
    } finally {
      setIsResendingOtp(false);
    }
  }, [beginOtpChallenge, pendingOtpChallenge]);

  const handleBackFromOtp = useCallback(() => {
    if (!pendingOtpChallenge) {
      setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
      setAuthMode("signup");
      return;
    }

    setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
    setAuthError(null);
    setAuthNotice(null);
    setAuthPrefillPhone(pendingOtpChallenge.phone);
    setAuthPrefillFullName(pendingOtpChallenge.fullName || "");
    setPendingOtpChallenge(null);

    if (pendingOtpChallenge.intent === "signup") {
      setAuthMode("signup");
      return;
    }

    setAuthMode("login");
  }, [pendingOtpChallenge]);

  const resetAuthenticatedState = useCallback(() => {
    setAccessToken(null);
    setCurrentUser(null);
    setSavedWorkouts([]);
    setSavedWorkoutsError(null);
    setScheduledWorkouts([]);
    setScheduledWorkoutsError(null);
    setCompletedWorkouts([]);
    setCompletedWorkoutsError(null);
    setBodyWeightEntries([]);
    setBodyWeightEntriesError(null);
    setIsBodyWeightSubmitting(false);
    setPendingOtpChallenge(null);
    setAuthLandingIndex(0);
    setAuthMode("signup");
    setAuthNotice(null);
    setAuthPrefillPhone("");
    setAuthPrefillFullName("");
    setAuthSubmittingMode(null);
  }, []);

  const handleLogout = useCallback(async () => {
    setAuthSubmittingMode("bootstrap");

    try {
      posthog.reset();
      await revenueCat.logOut();
      await clearAuthSession();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to log out right now.",
      );
    } finally {
      resetAuthenticatedState();
      handleCloseAddWorkout();
      resetPostLoginState();
    }
  }, [
    handleCloseAddWorkout,
    resetAuthenticatedState,
    resetPostLoginState,
    revenueCat,
  ]);

  // App Store Guideline 5.1.1(v): users must be able to delete their account
  // from inside the app. Calls the backend cascade-delete, clears local
  // session storage, and drops the UI back to the auth landing.
  const handleDeleteAccount = useCallback(async () => {
    if (!accessToken || isDeletingAccount) {
      return;
    }
    setIsDeletingAccount(true);
    try {
      await deleteAccount(accessToken);
      try {
        await clearAuthSession();
        await revenueCat.logOut();
      } catch {
        // Keep deletion successful even if local storage clear fails; the
        // session token is already invalidated server-side.
      }
      posthog.capture("account_deleted");
      setIsProfileVisible(false);
      resetAuthenticatedState();
      handleCloseAddWorkout();
      resetPostLoginState();
      Alert.alert(
        "Account deleted",
        "Your account and all associated data have been permanently removed.",
      );
    } catch (error) {
      Alert.alert(
        "Couldn't delete your account",
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again or contact support.",
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }, [
    accessToken,
    handleCloseAddWorkout,
    isDeletingAccount,
    revenueCat,
    resetAuthenticatedState,
    resetPostLoginState,
  ]);

  const handleResumeActiveWorkout = useCallback(() => {
    if (!activeSession) {
      return;
    }

    setSelectedCompletedWorkout(null);
    setSelectedSavedRoutine(null);
    setActiveTab("logs");
    setIsActiveWorkoutVisible(true);
  }, [activeSession]);


  const handleUpdateFullName = useCallback(
    async (fullName: string) => {
      const trimmed = fullName.trim();
      if (!accessToken) {
        throw new Error("You need to be logged in to update your name.");
      }
      if (!trimmed) {
        throw new Error("Enter a name to save.");
      }
      const response = await patchProfile(accessToken, { full_name: trimmed });
      posthog.capture("profile_name_updated");
      setCurrentUser(response.profile);
      setAuthPrefillFullName(response.profile.full_name);
      await storeAuthSession(accessToken, response.profile);
    },
    [accessToken],
  );

  const handleAddBodyWeightEntry = useCallback(
    async (weightLbs: number) => {
      if (!accessToken) {
        throw new Error("You need to be logged in to save weight.");
      }

      setIsBodyWeightSubmitting(true);
      setBodyWeightEntriesError(null);

      try {
        const created = await createBodyWeightEntry(accessToken, {
          weight_lbs: weightLbs,
        });
        posthog.capture("weight_entry_logged", { weight_lbs: weightLbs });
        setBodyWeightEntries((current) => [...current, created].sort((left, right) => {
          return (
            new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime()
          );
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to save body weight.";
        setBodyWeightEntriesError(message);
        throw error instanceof Error ? error : new Error(message);
      } finally {
        setIsBodyWeightSubmitting(false);
      }
    },
    [accessToken],
  );

  const handleRemoveSavedWorkout = useCallback(
    (savedWorkoutId: string, options?: { afterConfirm?: () => void }) => {
      if (!accessToken) {
        return;
      }

      Alert.alert(
        "Remove this workout?",
        "It will be deleted from your saved library. This can't be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              options?.afterConfirm?.();

              let previous: SavedRoutinePreview[] = [];
              setSavedWorkouts((current) => {
                previous = current;
                return current.filter(
                  (routine) =>
                    routine.id !== savedWorkoutId &&
                    routine.savedWorkoutId !== savedWorkoutId,
                );
              });
              setSavedWorkoutsError(null);

              void deleteSavedWorkout(accessToken, savedWorkoutId)
                .then(() => {
                  setSavedWorkoutsError(null);
                })
                .catch((error) => {
                  setSavedWorkouts(previous);
                  setSavedWorkoutsError(
                    error instanceof Error
                      ? error.message
                      : "Unable to remove that workout.",
                  );
                });
            },
          },
        ],
      );
    },
    [accessToken],
  );

  const handleOpenCompletedWorkout = useCallback(
    async (record: CompletedWorkoutRecord) => {
      setSelectedCompletedWorkout(record);

      if (!accessToken) {
        return;
      }

      try {
        const freshRecord = await getCompletedWorkout(accessToken, record.id);
        setSelectedCompletedWorkout(freshRecord);
        setCompletedWorkouts((current) =>
          current.map((item) => (item.id === freshRecord.id ? freshRecord : item)),
        );
      } catch {
        // The list already contains enough data to render the summary screen.
      }
    },
    [accessToken],
  );

  const renderAuthenticatedScreen = () => {
    if (activeSession && isActiveWorkoutVisible) {
      const activeCoachKey = String(activeSession.startedAt);
      return (
        <ActiveWorkoutScreen
          session={activeSession}
          coachMessages={coachMessagesByStartedAt[activeCoachKey] ?? []}
          setCoachMessages={(update) =>
            setCoachMessagesByStartedAt((prev) => {
              const current = prev[activeCoachKey] ?? [];
              const next =
                typeof update === "function"
                  ? (update as (c: CoachChatMessage[]) => CoachChatMessage[])(
                      current,
                    )
                  : update;
              return { ...prev, [activeCoachKey]: next };
            })
          }
          coachOpenRequestId={coachOpenRequestId}
          onCoachButtonMeasured={(rect) => {
            setCoachCoachmarkRect(rect);
          }}
          hubTourStep={
            POST_SIGNUP_HUB_GUIDANCE_ENABLED &&
            (hubTourStep === "active_scroll" || hubTourStep === "finish_workout")
              ? hubTourStep
              : null
          }
          onBack={() => {
            // Keep the session alive so the user can resume from the Logs tab.
            setIsActiveWorkoutVisible(false);
            setActiveTab("logs");
          }}
          onFinish={handleFinishWorkout}
          onHubTourFinishButtonMeasured={(rect) => {
            if (hubTourStep === "finish_workout") {
              setHubTourCoachRect(rect);
            }
          }}
          onHubTourListViewportMeasured={(rect) => {
            if (hubTourStep === "active_scroll") {
              setHubTourCoachRect(rect);
            }
          }}
          onHubTourFinishButtonVisible={handleHubTourFinishButtonVisible}
          onScheduleAgain={() =>
            handleRequestScheduleAgainForActiveSession(activeSession)
          }
          isSchedulingAgain={
            isSchedulingAgain &&
            scheduleAgainTarget?.id === `active-${activeSession.startedAt}`
          }
          onSave={(latestSession) =>
            void handleSaveActiveSession(latestSession)
          }
          isSaving={isSavingActiveSession}
          hasSaved={
            savedActiveSessionStartedAt === activeSession.startedAt
          }
          themeMode={themeMode}
        />
      );
    }

    if (selectedCompletedWorkout) {
      return (
        <WorkoutSummaryScreen
          workout={selectedCompletedWorkout}
          onBack={() => setSelectedCompletedWorkout(null)}
          onRepeatWorkout={() =>
            handleReplayCompletedWorkout(selectedCompletedWorkout)
          }
          onScheduleAgain={() =>
            handleRequestScheduleAgainForCompleted(selectedCompletedWorkout)
          }
          isSchedulingAgain={
            isSchedulingAgain &&
            scheduleAgainTarget?.id === selectedCompletedWorkout.id
          }
          themeMode={themeMode}
        />
      );
    }

    if (selectedSavedRoutine) {
      const routine = selectedSavedRoutine;
      const isScheduledView = Boolean(routine.scheduledWorkoutId);
      const removeTargetId = isScheduledView
        ? routine.scheduledWorkoutId
        : routine.savedWorkoutId;
      return (
        <SavedWorkoutDetailScreen
          routine={routine}
          onBack={() => {
            setSelectedSavedRoutine(null);
            if (hubTourStep === "start_session") {
              setHubTourStep("library_demo");
              setHubTourCoachRect(null);
            }
          }}
          onStart={() => {
            setSelectedSavedRoutine(null);
            handleStartSession(routine);
          }}
          onStartSessionMeasured={(rect) => {
            if (hubTourStep === "start_session") {
              setHubTourCoachRect(rect);
            }
          }}
          onRemove={
            removeTargetId
              ? () => {
                  if (isScheduledView) {
                    handleUnscheduleWorkout(removeTargetId, {
                      afterConfirm: () => setSelectedSavedRoutine(null),
                    });
                  } else {
                    handleRemoveSavedWorkout(removeTargetId, {
                      afterConfirm: () => setSelectedSavedRoutine(null),
                    });
                  }
                }
              : undefined
          }
          onSchedule={
            isScheduledView
              ? undefined
              : () => handleRequestScheduleSavedWorkout(routine)
          }
          onUpdate={handleUpdateSavedRoutine}
          removeLabel={isScheduledView ? "Unschedule" : "Unsave"}
          themeMode={themeMode}
        />
      );
    }

    if (isProfileVisible && currentUser) {
      return (
        <ProfileScreen
          onClose={() => setIsProfileVisible(false)}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          onManageSubscription={revenueCat.openCustomerCenter}
          onThemeModeChange={handleThemeModeChange}
          onUpdateFullName={handleUpdateFullName}
          isDeletingAccount={isDeletingAccount}
          profile={currentUser}
          themeMode={themeMode}
        />
      );
    }

    if (activeTab === "saved") {
      if (isSavedLibraryVisible) {
        return (
          <SavedLibraryScreen
            error={savedWorkoutsError}
            importedWorkouts={savedWorkouts}
            isLoading={savedWorkoutsLoading}
            onAddWorkout={handleOpenAddWorkout}
            onBack={() => {
              setIsSavedLibraryVisible(false);
              if (hubTourStep === "library_demo") {
                setHubTourStep("saved_card");
                setHubTourCoachRect(null);
              }
            }}
            onOpenWorkout={(routine) => setSelectedSavedRoutine(routine)}
            onRemoveWorkout={handleRemoveSavedWorkout}
            onRetry={() => {
              if (accessToken) {
                void loadSavedWorkouts(accessToken);
                void loadCompletedWorkouts(accessToken);
              }
            }}
            onScheduleWorkout={handleRequestScheduleSavedWorkout}
            onStartSession={handleStartSession}
            onStarterDemoCardMeasured={(rect) => {
              if (hubTourStep === "library_demo") {
                setHubTourCoachRect(rect);
              }
            }}
            scheduledWorkouts={upcomingScheduledRows.map(
              createScheduledRoutinePreview,
            )}
            starterDemoTitle={starterDemoTitle}
            themeMode={themeMode}
          />
        );
      }
      return (
        <SavedWorkoutsScreen
          completedWorkouts={completedWorkouts}
          completedWorkoutsError={completedWorkoutsError}
          completedWorkoutsLoading={completedWorkoutsLoading}
          importedWorkouts={savedWorkouts}
          isScheduleLoading={scheduledWorkoutsLoading}
          onAddWorkout={handleOpenAddWorkout}
          onOpenProfile={() => setIsProfileVisible(true)}
          onOpenSavedList={() => setIsSavedLibraryVisible(true)}
          onSavedWorkoutsCardMeasured={(rect) => {
            if (hubTourStep === "saved_card") {
              setHubTourCoachRect(rect);
            }
          }}
          tourSpotlightsSavedWorkoutsCard={
            POST_SIGNUP_HUB_GUIDANCE_ENABLED && hubTourStep === "saved_card"
          }
          onOpenWorkout={(routine) => setSelectedSavedRoutine(routine)}
          onPullToRefresh={refreshHubWorkoutData}
          onRemoveWorkout={handleRemoveSavedWorkout}
          onOpenCompletedSession={handleOpenCompletedWorkout}
          onRetry={() => {
            if (accessToken) {
              void loadSavedWorkouts(accessToken);
              void loadScheduledWorkouts(accessToken);
              void loadCompletedWorkouts(accessToken);
            }
          }}
          onScheduleWorkout={handleRequestScheduleSavedWorkout}
          onStartSession={handleStartSession}
          onUnschedule={handleUnscheduleWorkout}
          scheduledError={scheduledWorkoutsError}
          scheduledWorkouts={upcomingScheduledRows.map(createScheduledRoutinePreview)}
          themeMode={themeMode}
        />
      );
    }

    if (activeTab === "logs") {
      return (
        <LogsScreen
          activeWorkout={activeSession}
          error={completedWorkoutsError}
          isLoading={completedWorkoutsLoading}
          onOpenWorkout={handleOpenCompletedWorkout}
          onResumeWorkout={handleResumeActiveWorkout}
          onRetry={() => {
            if (accessToken) {
              void loadCompletedWorkouts(accessToken);
            }
          }}
          onScheduleAgain={handleRequestScheduleAgainForCompleted}
          onStartFromCompleted={handleReplayCompletedWorkout}
          schedulingWorkoutId={
            isSchedulingAgain ? scheduleAgainTarget?.id ?? null : null
          }
          workouts={completedWorkouts}
          themeMode={themeMode}
        />
      );
    }

    if (activeTab === "charts") {
      return currentUser ? (
        <ProgressChartsScreen
          bodyWeightError={bodyWeightEntriesError}
          completedWorkouts={completedWorkouts}
          error={bodyWeightEntriesError || completedWorkoutsError}
          isLoading={bodyWeightEntriesLoading || completedWorkoutsLoading}
          isSubmittingWeightEntry={isBodyWeightSubmitting}
          onAddWeightEntry={handleAddBodyWeightEntry}
          onRetry={() => {
            if (accessToken) {
              void loadCompletedWorkouts(accessToken);
              void loadBodyWeightEntries(accessToken);
            }
          }}
          profile={currentUser}
          themeMode={themeMode}
          weightEntries={bodyWeightEntries}
        />
      ) : null;
    }

    return null;
  };

  const importError = submitError || pollError;

  const hubTourCoachmarkPlacement = useMemo<CoachmarkPlacement>(() => {
    return hubTourStep === "active_scroll" ? "topBanner" : "auto";
  }, [hubTourStep]);

  const hubTourCoachmarkCopy = useMemo(() => {
    switch (hubTourStep) {
      case "saved_card":
        return {
          title: getSavedWorkoutsCoachmarkTitle(onboardingSex),
          body: getSavedWorkoutsCoachmarkBody(onboardingSex),
        };
      case "library_demo":
        return {
          title: getHubTourLibraryCoachmarkTitle(onboardingSex),
          body: getHubTourLibraryCoachmarkBody(onboardingSex),
        };
      case "start_session":
        return {
          title: getHubTourStartSessionCoachmarkTitle(onboardingSex),
          body: getHubTourStartSessionCoachmarkBody(onboardingSex),
        };
      case "active_scroll":
        return {
          title: getHubTourScrollCoachmarkTitle(onboardingSex),
          body: getHubTourScrollCoachmarkBody(onboardingSex),
        };
      case "finish_workout":
        return {
          title: getHubTourFinishCoachmarkTitle(onboardingSex),
          body: getHubTourFinishCoachmarkBody(onboardingSex),
        };
      default:
        return { title: "", body: "" };
    }
  }, [hubTourStep, onboardingSex]);

  const hubTourCoachmarkShows = useMemo(() => {
    if (
      !POST_SIGNUP_HUB_GUIDANCE_ENABLED ||
      hubTourStep == null ||
      !hasBillingAccess ||
      isFirstHubTipVisible ||
      isPostPaywallWelcomeVisible ||
      isAddWorkoutVisible
    ) {
      return false;
    }
    switch (hubTourStep) {
      case "saved_card":
        return (
          activeTab === "saved" &&
          !isSavedLibraryVisible &&
          !selectedSavedRoutine &&
          !selectedCompletedWorkout &&
          !isProfileVisible &&
          !(activeSession && isActiveWorkoutVisible) &&
          hubTourCoachRect != null
        );
      case "library_demo":
        return isSavedLibraryVisible && !selectedSavedRoutine;
      case "start_session":
        return (
          selectedSavedRoutine != null &&
          isStarterDemoWorkoutTitle(selectedSavedRoutine.title, onboardingSex)
        );
      case "active_scroll":
      case "finish_workout":
        return Boolean(activeSession && isActiveWorkoutVisible);
      default:
        return false;
    }
  }, [
    activeSession,
    activeTab,
    hasBillingAccess,
    hubTourCoachRect,
    hubTourStep,
    isActiveWorkoutVisible,
    isAddWorkoutVisible,
    isFirstHubTipVisible,
    isPostPaywallWelcomeVisible,
    isProfileVisible,
    isSavedLibraryVisible,
    onboardingSex,
    selectedCompletedWorkout,
    selectedSavedRoutine,
  ]);

  const handleHubTourTargetPress = useCallback(() => {
    switch (hubTourStep) {
      case "saved_card":
        setIsSavedLibraryVisible(true);
        return;
      case "library_demo": {
        const starterRoutine = savedWorkouts.find((routine) =>
          isStarterDemoWorkoutTitle(routine.title, onboardingSex),
        );
        if (starterRoutine) {
          handleStartSession(starterRoutine);
        }
        return;
      }
      case "start_session":
        if (selectedSavedRoutine) {
          setSelectedSavedRoutine(null);
          handleStartSession(selectedSavedRoutine);
        }
        return;
      default:
        return;
    }
  }, [
    handleStartSession,
    hubTourStep,
    onboardingSex,
    savedWorkouts,
    selectedSavedRoutine,
  ]);

  const hubTourCoachmarkTargetPress =
    hubTourStep === "saved_card" ||
    hubTourStep === "library_demo" ||
    hubTourStep === "start_session"
      ? handleHubTourTargetPress
      : undefined;

  return (
    <PostHogProvider client={posthog} debug={__DEV__} autocapture={{ captureTouches: true, captureScreens: false }}>
    <SafeAreaProvider>
    <GestureHandlerRootView style={styles.flexRoot}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <View style={styles.appShell}>
        {!isAuthReady || !fontsLoaded || !isMinSplashDone ? (
          <View style={styles.loadingScreen}>
            <FitfoLoadingAnimation
              caption="loading"
              label="Fitfo is loading"
              size={splashLogoSize}
              themeMode={themeMode}
            />
          </View>
        ) : currentUser ? (
          isBillingCheckPending ? (
            <View style={styles.loadingScreen}>
              <FitfoLoadingAnimation
                caption="checking access"
                label="Checking your Fitfo Pro status"
                size={splashLogoSize}
                themeMode={themeMode}
              />
              {billingCheckShowBuyNow ? (
                <View style={styles.billingCheckActions}>
                  <Text style={styles.billingCheckHint}>
                    Taking longer than usual? Continue to subscribe.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Buy Fitfo Pro now"
                    onPress={() => setBillingCheckGiveUp(true)}
                    style={({ pressed }) => [
                      styles.billingCheckBuyNowButton,
                      pressed ? styles.billingCheckBuyNowButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.billingCheckBuyNowText}>Buy now</Text>
                    <Ionicons
                      color={theme.colors.surface}
                      name="arrow-forward"
                      size={18}
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : !hasBillingAccess ? (
            !hasSeenTrialExplainer ? (
              <TrialExplainerScreen
                onContinue={handleAcceptTrialExplainer}
                themeMode={themeMode}
              />
            ) : (
              <PaywallScreen
                error={revenueCat.error}
                isLoading={revenueCat.isLoading}
                onManageSubscription={revenueCat.openCustomerCenter}
                onPurchasePackage={revenueCat.purchasePackage}
                onRestorePurchases={revenueCat.restorePurchases}
                onUnlocked={() => {
                  pendingPostPaywallWelcomeRef.current = true;
                  void revenueCat.refreshCustomerInfo();
                }}
                themeMode={themeMode}
              />
            )
          ) : (
            <>
              <View style={styles.screenArea}>
                {renderAuthenticatedScreen()}
                <SavedWorkoutsCoachmark
                  body="Tap here for cues, weight guidance, and substitutions during your workout."
                  onTargetPress={() => {
                    if (!currentUser?.id) {
                      setCoachCoachmarkVisible(false);
                      return;
                    }
                    setCoachCoachmarkVisible(false);
                    void AsyncStorage.setItem(
                      getCoachCoachmarkStorageKey(currentUser.id),
                      "1",
                    ).catch(() => undefined);
                    setCoachOpenRequestId((value) => value + 1);
                  }}
                  rect={coachCoachmarkRect}
                  themeMode={themeMode}
                  title="AI Coach"
                  visible={
                    Boolean(
                      currentUser?.id &&
                        activeSession &&
                        isActiveWorkoutVisible &&
                        coachCoachmarkVisible &&
                        coachCoachmarkRect,
                    )
                  }
                />
                <SavedWorkoutsCoachmark
                  body={hubTourCoachmarkCopy.body}
                  onTargetPress={hubTourCoachmarkTargetPress}
                  placement={hubTourCoachmarkPlacement}
                  rect={hubTourCoachRect}
                  themeMode={themeMode}
                  title={hubTourCoachmarkCopy.title}
                  visible={
                    POST_SIGNUP_HUB_GUIDANCE_ENABLED && hubTourCoachmarkShows
                  }
                />
              </View>
              <BottomNav
                activeTab={activeTab}
                onChangeTab={(tab) => {
                  setIsActiveWorkoutVisible(false);
                  setSelectedCompletedWorkout(null);
                  setIsProfileVisible(false);
                  setIsSavedLibraryVisible(false);
                  setActiveTab(tab);
                }}
                onImportWorkout={() => {
                  setIsProfileVisible(false);
                  handleOpenAddWorkout();
                }}
                themeMode={themeMode}
              />
            </>
          )
        ) : authMode === "otp" && pendingOtpChallenge ? (
          <OtpVerificationScreen
            error={authError}
            intent={pendingOtpChallenge.intent}
            isResending={isResendingOtp}
            isSubmitting={authSubmittingMode === "otp"}
            notice={authNotice}
            onBack={handleBackFromOtp}
            onResend={handleResendOtp}
            onVerify={handleVerifyOtp}
            phone={pendingOtpChallenge.phone}
            sentAt={pendingOtpChallenge.sentAt}
            themeMode={themeMode}
          />
        ) : (
          <AuthLandingScreen
            activeIndex={authLandingIndex}
            error={authError}
            initialFullName={authPrefillFullName}
            initialPhoneNumber={authPrefillPhone}
            isAppleSubmitting={authSubmittingMode === "apple"}
            isSubmitting={
              authMode === "signup"
                ? authSubmittingMode === "signup"
                : authSubmittingMode === "login"
            }
            notice={authNotice}
            onAppleSignIn={handleAppleSignIn}
            onChangeIndex={setAuthLandingIndex}
            onCreateAccount={handleCreateAccount}
            onLogin={handleLogin}
            onOnboardingPayloadChange={setAuthLandingOnboardingPayload}
            onSelectMode={(mode) => {
              setAuthLandingIndex(AUTH_LANDING_AUTH_INDEX);
              setPendingOtpChallenge(null);
              setAuthError(null);
              setAuthNotice(null);
              if (mode === "login") {
                setAuthLandingOnboardingPayload(null);
              }
              setAuthMode(mode);
            }}
            authMode={authMode === "signup" ? "signup" : "login"}
            themeMode={themeMode}
          />
        )}
      </View>

      <AddWorkoutModal
        autoNotifyImports={autoNotifyImports}
        autoSubmit={isShareDrivenIngest}
        error={importError}
        initialUrl={sharedIngestUrl}
        isSaving={isSavingImportedWorkout}
        isScheduling={isSchedulingWorkout}
        isSubmitting={isExtractSubmitting}
        job={job}
        ingestionJobId={jobId}
        onClose={handleCloseAddWorkout}
        onContinueInBackground={handleSendImportToBackground}
        onCreateManual={handleCreateManualWorkout}
        onSaveImported={handleSaveImportedWorkout}
        onScheduleImported={handleScheduleImportedWorkout}
        onStartImported={() => handleStartSession()}
        onSubmit={handleExtractWorkout}
        routine={latestImportedRoutine}
        themeMode={themeMode}
        visible={hasBillingAccess && isAddWorkoutVisible}
      />

      <ScheduleAgainModal
        visible={scheduleAgainTarget != null}
        title={scheduleAgainTarget?.title || "Workout"}
        subtitle={scheduleAgainTarget?.description ?? undefined}
        isScheduling={isSchedulingAgain}
        error={scheduleAgainError}
        onClose={handleCloseScheduleAgain}
        onConfirm={handleConfirmScheduleAgain}
        themeMode={themeMode}
      />

      <FirstHubTipModal
        body={getFirstHubTipModalBody(currentUser?.onboarding?.sex ?? null)}
        title={getFirstHubTipModalTitle(currentUser?.onboarding?.sex ?? null)}
        themeMode={themeMode}
        visible={
          POST_SIGNUP_HUB_GUIDANCE_ENABLED &&
          isFirstHubTipVisible &&
          hasBillingAccess &&
          !isPostPaywallWelcomeVisible
        }
        onDismiss={handleDismissFirstHubTip}
      />

      <PostPaywallWelcomeModal
        themeMode={themeMode}
        visible={Boolean(currentUser && hasBillingAccess && isPostPaywallWelcomeVisible)}
        onDismiss={handleDismissPostPaywallWelcome}
      />

      {scheduledConfirmation ? (
        <View style={styles.confirmationOverlay}>
          <ScheduledConfirmationScreen
            title={scheduledConfirmation.title}
            scheduledFor={scheduledConfirmation.scheduledFor}
            origin={scheduledConfirmation.origin}
            onDismiss={() => setScheduledConfirmation(null)}
            themeMode={themeMode}
          />
        </View>
      ) : null}
    </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
    </PostHogProvider>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    flexRoot: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    appShell: {
      flex: 1,
    },
    screenArea: {
      flex: 1,
    },
    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 24,
    },
    billingCheckActions: {
      alignItems: "center",
      gap: 14,
      marginTop: 8,
      maxWidth: 320,
    },
    billingCheckHint: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
    },
    billingCheckBuyNowButton: {
      minHeight: 54,
      minWidth: 220,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.primary,
    },
    billingCheckBuyNowButtonPressed: {
      opacity: 0.9,
    },
    billingCheckBuyNowText: {
      color: theme.colors.surface,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    loadingTitle: {
      color: theme.colors.textPrimary,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
    },
    loadingBody: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      textAlign: "center",
    },
    confirmationOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
    },
  });
