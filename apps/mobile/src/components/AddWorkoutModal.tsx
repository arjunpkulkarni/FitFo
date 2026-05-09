import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

import { FitfoLoadingAnimation } from "./FitfoLoadingAnimation";
import { getCreatorDisplayLabel } from "../lib/fitfo";
import { getStatusInfo } from "../lib/status";
import { getTheme, type ThemeMode } from "../theme";
import type { JobResponse, SavedRoutinePreview } from "../types";

interface AddWorkoutModalProps {
  visible: boolean;
  isSubmitting: boolean;
  isScheduling?: boolean;
  isSaving?: boolean;
  job: JobResponse | null;
  /** Canonical job id we're polling (must match job.id whenever job is shown). */
  ingestionJobId?: string | null;
  routine: SavedRoutinePreview | null;
  error: string | null;
  initialUrl?: string | null;
  autoSubmit?: boolean;
  // When the user opts to "be notified when this is ready", we close the
  // modal but keep the polling alive in the background. `remember=true` means
  // the user checked "always notify me" so future slow imports still show this
  // sheet but arrive with that checkbox already selected — they explicitly tap
  // "Notify me" to minimize; nothing auto-dismisses mid-compile.
  onContinueInBackground?: (opts: { remember: boolean }) => void;
  // True once the user has opted into auto-notify-on-slow-imports. Pre-checks
  // that preference on the slow-import sheet; modal stays visible until they
  // choose "Notify me" or the workout finishes.
  autoNotifyImports?: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  onCreateManual: () => void;
  onSaveImported: () => void;
  onScheduleImported: (scheduledFor: string) => void;
  onStartImported: () => void;
  themeMode?: ThemeMode;
}

// Wall-clock fallback: how long to wait before offering to keep building in
// the background when the predictive signal is unavailable. Short enough
// that users see it on genuinely slow imports (>=60s of pipeline work) but
// long enough that fast (<15s) ones never see it.
const SLOW_IMPORT_THRESHOLD_MS = 15_000;
// Predictive threshold: any video whose source duration exceeds this is
// expected to take >25s of total pipeline time (Whisper runs at ~1/4 real
// time plus ~20s of fixed overhead for fetch/OCR/parse). When we know the
// duration up front we surface the opt-in immediately, before the wall
// clock reaches the fallback threshold.
const PREDICTED_SLOW_DURATION_SEC = 30;
// Statuses that justify the slow-import opt-in. Once the job moves to
// `parsing` the work is almost done so prompting the user to leave is
// counter-productive.
const SLOW_IMPORT_STATUSES = new Set(["pending", "fetching", "transcribing"]);

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildUpcomingDates(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = new Date(today);
    next.setDate(today.getDate() + index);
    days.push(next);
  }
  return days;
}

function formatReadableDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reference = new Date(date);
  reference.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (reference.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Tomorrow";
  }
  return `${DAY_LABELS[reference.getDay()]}, ${MONTH_LABELS[reference.getMonth()]} ${reference.getDate()}`;
}

export function AddWorkoutModal({
  visible,
  isSubmitting,
  isScheduling = false,
  isSaving = false,
  job,
  routine,
  error,
  onClose,
  onSubmit,
  onCreateManual,
  onSaveImported,
  onScheduleImported,
  onStartImported,
  onContinueInBackground,
  autoNotifyImports = false,
  initialUrl = null,
  autoSubmit = false,
  ingestionJobId = null,
  themeMode = "light",
}: AddWorkoutModalProps) {
  const [url, setUrl] = useState("");
  const [isPickingDate, setIsPickingDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Slow-import opt-in card state. `compileStartedAt` flips on when the
  // first compiling render happens; the timer flips `slowImport` true after
  // the threshold. `slowImportDismissed` hides the card if the user picked
  // "Keep waiting" so it doesn't keep flapping back. `rememberAutoNotify`
  // backs the "Always notify me" checkbox.
  const [compileStartedAt, setCompileStartedAt] = useState<number | null>(null);
  const [slowImportElapsed, setSlowImportElapsed] = useState(false);
  const [slowImportDismissed, setSlowImportDismissed] = useState(false);
  const [rememberAutoNotify, setRememberAutoNotify] = useState(false);
  // Guards duplicate "Notify me" taps firing `onContinueInBackground` twice.
  const autoPromotedRef = useRef(false);
  const autoSubmittedRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(visible);
  const theme = getTheme(themeMode);
  const styles = createStyles(theme);

  // Reset transient local state when the modal transitions from closed -> open
  // (not the other way around). Resetting on close would cause the visible
  // content to flip (e.g. date picker snapping back to the URL form) while the
  // modal is still fading out, which reads as the modal "popping" a second
  // time. Parent-driven props (routine, job, etc.) are held stable for the
  // same reason via a delayed cleanup in App.tsx.
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      // Opening with `initialUrl` (share/deep link) must keep the staged URL —
      // otherwise the reset below races the prefilled-effect and ingest goes blank.
      if (!initialUrl) {
        setUrl("");
      }
      setIsPickingDate(false);
      setSelectedDate(null);
      autoSubmittedRef.current = null;
    }
    wasVisibleRef.current = visible;
  }, [initialUrl, visible]);

  useEffect(() => {
    if (!visible || !initialUrl) {
      return;
    }
    setUrl(initialUrl);

    if (!autoSubmit) {
      return;
    }
    if (autoSubmittedRef.current === initialUrl) {
      return;
    }
    autoSubmittedRef.current = initialUrl;
    // Defer to the next tick so React flushes the URL state first.
    const handle = setTimeout(() => {
      onSubmit(initialUrl);
    }, 0);
    return () => clearTimeout(handle);
  }, [autoSubmit, initialUrl, onSubmit, visible]);

  const trimmedUrl = useMemo(() => url.trim(), [url]);

  const effectiveJob =
    ingestionJobId != null && job != null && job.id === ingestionJobId
      ? job
      : null;
  const isPolling =
    effectiveJob != null &&
    effectiveJob.status !== "complete" &&
    effectiveJob.status !== "failed";
  const info = getStatusInfo(effectiveJob?.status ?? "pending", themeMode);
  const workoutPlan = routine?.workoutPlan ?? null;
  const hasImportedWorkout = workoutPlan != null;
  // First poll round-trip: avoid briefly treating the job as "not running".
  const buildInFlight =
    ingestionJobId != null &&
    effectiveJob === null &&
    (error ?? "").trim() === "";

  // While the import job is running we hide the URL input + title and show
  // a focused "compiling" view instead. As soon as the parsed workout comes
  // back (`hasImportedWorkout` flips true) we transition to the preview card.
  const isCompiling =
    !hasImportedWorkout && (isSubmitting || isPolling || buildInFlight);

  // Track when this compile started so we can flip `slowImportElapsed` after
  // the threshold. Reset whenever we leave the compiling state so a future
  // import gets a fresh clock.
  useEffect(() => {
    if (isCompiling) {
      if (compileStartedAt === null) {
        setCompileStartedAt(Date.now());
      }
    } else if (compileStartedAt !== null) {
      setCompileStartedAt(null);
      setSlowImportElapsed(false);
      setSlowImportDismissed(false);
      setRememberAutoNotify(false);
      autoPromotedRef.current = false;
    }
  }, [compileStartedAt, isCompiling]);

  useEffect(() => {
    if (!isCompiling || compileStartedAt === null || slowImportElapsed) {
      return;
    }
    const remaining = Math.max(
      0,
      SLOW_IMPORT_THRESHOLD_MS - (Date.now() - compileStartedAt),
    );
    const timeout = setTimeout(() => setSlowImportElapsed(true), remaining);
    return () => clearTimeout(timeout);
  }, [compileStartedAt, isCompiling, slowImportElapsed]);

  // Predictive signal: once the fetch phase resolves the backend exposes
  // the source video duration, which lets us surface the opt-in *before* the
  // 15s wall clock would have caught it. When duration is missing (older
  // jobs, provider hiccup) we fall back to the timer below.
  const predictedSlow =
    effectiveJob?.video_duration_sec != null &&
    effectiveJob.video_duration_sec > PREDICTED_SLOW_DURATION_SEC;

  // Long-running import UX: offer to keep building in the background.
  const shouldOfferBackground =
    isCompiling &&
    (predictedSlow || slowImportElapsed) &&
    SLOW_IMPORT_STATUSES.has(effectiveJob?.status ?? "pending") &&
    onContinueInBackground != null;

  useEffect(() => {
    if (shouldOfferBackground && autoNotifyImports) {
      setRememberAutoNotify(true);
    }
  }, [autoNotifyImports, shouldOfferBackground]);

  const showSlowImportCard = shouldOfferBackground && !slowImportDismissed;

  const handleNotifyMe = () => {
    if (!onContinueInBackground || autoPromotedRef.current) {
      return;
    }
    autoPromotedRef.current = true;
    onContinueInBackground({ remember: rememberAutoNotify });
  };

  const handleKeepWaiting = () => {
    setSlowImportDismissed(true);
  };
  const creatorHandle = useMemo(
    () => getCreatorDisplayLabel(routine?.sourceUrl ?? null, routine?.title),
    [routine?.sourceUrl, routine?.title],
  );
  const upcomingDates = useMemo(() => buildUpcomingDates(14), []);
  const defaultDateIso = upcomingDates[0] ? toIsoDate(upcomingDates[0]) : null;
  const activeSelectedDate = selectedDate ?? defaultDateIso;
  const readableSelectedDate = useMemo(() => {
    if (!activeSelectedDate) {
      return "Pick a date";
    }
    const match = upcomingDates.find((date) => toIsoDate(date) === activeSelectedDate);
    if (!match) {
      return activeSelectedDate;
    }
    return formatReadableDate(match);
  }, [activeSelectedDate, upcomingDates]);

  const handleBeginScheduling = () => {
    if (isScheduling) {
      return;
    }
    setSelectedDate(defaultDateIso);
    setIsPickingDate(true);
  };

  const handleCancelScheduling = () => {
    setIsPickingDate(false);
    setSelectedDate(null);
  };

  const handleConfirmSchedule = () => {
    if (!activeSelectedDate || isScheduling) {
      return;
    }
    onScheduleImported(activeSelectedDate);
  };

  return (
    <Modal
      animationType="fade"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons color={theme.colors.textMuted} name="close" size={20} />
          </Pressable>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.cardScroll}
          >
            {isCompiling ? (
              <View style={styles.compilingBlock}>
                <FitfoLoadingAnimation
                  caption={info.label.toLowerCase()}
                  label="Compiling your workout"
                  size={156}
                  themeMode={themeMode}
                />
                <Text style={styles.compilingTitle}>Compiling workout</Text>
                <Text style={styles.compilingDescription}>{info.description}</Text>
                <View style={styles.compilingProgress}>
                  <View style={styles.statusHeader}>
                    <Text style={[styles.statusLabel, { color: info.color }]}>
                      {info.label}
                    </Text>
                    <Text style={styles.statusPercent}>
                      {info.progressPercent}%
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${info.progressPercent}%`,
                          backgroundColor: info.color,
                        },
                      ]}
                    />
                  </View>
                </View>
                {/* v1: "Notify me" / slow-import escape hatch hidden.
                    Re-enable by uncommenting this block. The supporting state
                    (showSlowImportCard, handleNotifyMe, handleKeepWaiting,
                    rememberAutoNotify, autoNotifyImports effect) is left
                    intact so flipping it back on is a pure UI change. */}
                {/* {showSlowImportCard ? (
                  <View style={styles.slowImportCard}>
                    <Text style={styles.slowImportTitle}>
                      {predictedSlow && effectiveJob?.video_duration_sec != null
                        ? `This is a ${Math.round(effectiveJob.video_duration_sec)}-second video.`
                        : "This one\u2019s taking a minute."}
                    </Text>
                    <Text style={styles.slowImportBody}>
                      {predictedSlow
                        ? "Transcribing will take about a minute. Keep scrolling; we'll notify you when it's built."
                        : "Long reels need 60-90 seconds to transcribe. Keep scrolling; we'll notify you when it's built."}
                    </Text>
                    <Pressable
                      onPress={() => setRememberAutoNotify((prev) => !prev)}
                      style={styles.slowImportCheckRow}
                      hitSlop={8}
                    >
                      <View
                        style={[
                          styles.slowImportCheckbox,
                          rememberAutoNotify && styles.slowImportCheckboxOn,
                        ]}
                      >
                        {rememberAutoNotify ? (
                          <Ionicons
                            color={theme.colors.surface}
                            name="checkmark"
                            size={14}
                          />
                        ) : null}
                      </View>
                      <Text style={styles.slowImportCheckLabel}>
                        Always notify me, don't ask again
                      </Text>
                    </Pressable>
                    <View style={styles.slowImportActions}>
                      <Pressable
                        onPress={handleKeepWaiting}
                        style={({ pressed }) => [
                          styles.slowImportSecondary,
                          pressed && styles.slowImportSecondaryPressed,
                        ]}
                      >
                        <Text style={styles.slowImportSecondaryText}>
                          Keep waiting
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={handleNotifyMe}
                        style={({ pressed }) => [
                          styles.slowImportPrimary,
                          pressed && styles.slowImportPrimaryPressed,
                        ]}
                      >
                        <Text style={styles.slowImportPrimaryText}>
                          Notify me
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null} */}
              </View>
            ) : !hasImportedWorkout ? (
              <>
                <View style={styles.headerIcon}>
                  <MaterialIcons
                    color={theme.colors.primary}
                    name="fitness-center"
                    size={24}
                  />
                </View>
                <Text style={styles.title}>Import Workout</Text>
                <Text style={styles.subtitle}>
                  Share from TikTok or Instagram, or paste a link.
                </Text>

                <View style={styles.formBlock}>
                  <Text style={styles.label}>Link</Text>
                  <View style={styles.inputShell}>
                    <Ionicons
                      color={theme.colors.textMuted}
                      name="link-outline"
                      size={18}
                    />
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable
                      keyboardType="url"
                      onChangeText={setUrl}
                      placeholder="Paste link…"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={url}
                    />
                  </View>

                  <Pressable
                    disabled={!trimmedUrl}
                    onPress={() => onSubmit(trimmedUrl)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !trimmedUrl && styles.primaryButtonDisabled,
                      pressed ? styles.primaryButtonPressed : null,
                    ]}
                  >
                    <View style={styles.buttonRow}>
                      <Ionicons
                        color={theme.colors.surface}
                        name="flash"
                        size={16}
                      />
                      <Text style={styles.primaryButtonText}>Import Workout</Text>
                    </View>
                  </Pressable>
                </View>
              </>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Import failed</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {hasImportedWorkout ? (
              <View style={styles.previewCard}>
                {effectiveJob?.thumbnail_url ? (
                  <View style={styles.previewThumbnailWrap}>
                    <Image
                      accessibilityIgnoresInvertColors
                      key={`import-thumb:${effectiveJob?.id}:${effectiveJob?.updated_at ?? ""}:${effectiveJob.thumbnail_url}`}
                      source={{ uri: effectiveJob.thumbnail_url }}
                      style={styles.previewThumbnail}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
                
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={2}
                  style={styles.previewTitle}
                >
                  {routine?.title}
                </Text>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={2}
                  style={styles.previewDescription}
                >
                  {routine?.description}
                </Text>
                
                {creatorHandle ? (
                  <View style={styles.previewTags}>
                    <View style={styles.previewChip}>
                      <Ionicons
                        color={theme.colors.primary}
                        name="person-circle-outline"
                        size={14}
                      />
                      <Text
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        style={styles.previewChipText}
                      >
                        {creatorHandle}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.previewActionColumn}>
                  {!isPickingDate ? (
                    <>
                      <Pressable
                        disabled={isScheduling || isSaving}
                        onPress={onStartImported}
                        style={[
                          styles.secondaryAction,
                          isScheduling || isSaving ? styles.actionDisabled : null,
                        ]}
                      >
                        <Text style={styles.secondaryActionText}>Start Workout</Text>
                      </Pressable>

                      <Pressable
                        disabled={isScheduling || isSaving}
                        onPress={handleBeginScheduling}
                        style={[
                          styles.tertiaryAction,
                          isScheduling || isSaving ? styles.actionDisabled : null,
                        ]}
                      >
                        <View style={styles.buttonRow}>
                          <Ionicons
                            color={theme.colors.primary}
                            name="calendar-outline"
                            size={16}
                          />
                          <Text style={styles.tertiaryActionText}>Schedule Workout</Text>
                        </View>
                      </Pressable>

                      <Pressable
                        disabled={isScheduling || isSaving}
                        onPress={onSaveImported}
                        style={[
                          styles.tertiaryAction,
                          isScheduling || isSaving ? styles.actionDisabled : null,
                        ]}
                      >
                        {isSaving ? (
                          <View style={styles.buttonRow}>
                            <ActivityIndicator
                              color={theme.colors.primary}
                              size="small"
                            />
                            <Text style={styles.tertiaryActionText}>Saving...</Text>
                          </View>
                        ) : (
                          <View style={styles.buttonRow}>
                            <Ionicons
                              color={theme.colors.primary}
                              name="bookmark-outline"
                              size={16}
                            />
                            <Text style={styles.tertiaryActionText}>Save for Later</Text>
                          </View>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.schedulerBlock}>
                      <View style={styles.schedulerHeader}>
                        <Text style={styles.schedulerEyebrow}>Pick a day</Text>
                        <Text style={styles.schedulerSelectedText}>
                          {readableSelectedDate}
                        </Text>
                      </View>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.dayStripContent}
                      >
                        {upcomingDates.map((date) => {
                          const iso = toIsoDate(date);
                          const isSelected = activeSelectedDate === iso;
                          return (
                            <Pressable
                              key={iso}
                              onPress={() => setSelectedDate(iso)}
                              style={[
                                styles.dayPill,
                                isSelected ? styles.dayPillSelected : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayPillLabel,
                                  isSelected ? styles.dayPillLabelSelected : null,
                                ]}
                              >
                                {DAY_LABELS[date.getDay()].toUpperCase()}
                              </Text>
                              <Text
                                style={[
                                  styles.dayPillNumber,
                                  isSelected ? styles.dayPillNumberSelected : null,
                                ]}
                              >
                                {date.getDate()}
                              </Text>
                              <Text
                                style={[
                                  styles.dayPillMonth,
                                  isSelected ? styles.dayPillMonthSelected : null,
                                ]}
                              >
                                {MONTH_LABELS[date.getMonth()]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>

                      <Pressable
                        disabled={!activeSelectedDate || isScheduling}
                        onPress={handleConfirmSchedule}
                        style={[
                          styles.secondaryAction,
                          (!activeSelectedDate || isScheduling)
                            ? styles.actionDisabled
                            : null,
                        ]}
                      >
                        {isScheduling ? (
                          <View style={styles.buttonRow}>
                            <ActivityIndicator
                              color={theme.colors.surface}
                              size="small"
                            />
                            <Text style={styles.secondaryActionText}>Scheduling...</Text>
                          </View>
                        ) : (
                          <Text style={styles.secondaryActionText}>
                            Schedule for {readableSelectedDate}
                          </Text>
                        )}
                      </Pressable>

                      <Pressable
                        disabled={isScheduling}
                        onPress={handleCancelScheduling}
                        style={styles.schedulerCancel}
                      >
                        <Text style={styles.schedulerCancelText}>Back</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            {!hasImportedWorkout && !isCompiling ? (
              <>
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.orLine} />
                </View>

                <Pressable onPress={onCreateManual}>
                  <Text style={styles.linkButton}>Create manually instead</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.overlay,
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      maxHeight: "92%",
      borderRadius: 30,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.borderSoft : "transparent",
      ...theme.shadows.card,
    },
    cardScroll: {
      width: "100%",
    },
    cardContent: {
      padding: 24,
      paddingBottom: 26,
    },
    closeButton: {
      position: "absolute",
      top: 18,
      right: 18,
      zIndex: 2,
      height: 32,
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIcon: {
      height: 48,
      width: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      marginBottom: 16,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: 31,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    subtitle: {
      marginTop: 4,
      color: theme.colors.textSecondary,
      fontSize: 17,
      fontFamily: "satoshi",
      lineHeight: 24,
    },
    formBlock: {
      marginTop: 22,
      gap: 12,
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 2.4,
      textTransform: "uppercase",
    },
    inputShell: {
      minHeight: 52,
      borderRadius: theme.radii.large,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 17,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 999,
      backgroundColor: theme.colors.primaryBright,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.primary,
    },
    primaryButtonDisabled: {
      opacity: 0.55,
    },
    primaryButtonPressed: {
      opacity: 0.88,
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    compilingBlock: {
      paddingTop: 8,
      paddingBottom: 4,
      alignItems: "center",
      gap: 16,
    },
    compilingTitle: {
      color: theme.colors.textPrimary,
      fontSize: 24,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.6,
      textAlign: "center",
    },
    compilingDescription: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
      marginTop: -8,
    },
    compilingProgress: {
      width: "100%",
      gap: 10,
      marginTop: 8,
    },
    slowImportCard: {
      width: "100%",
      marginTop: 16,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
      padding: 16,
      gap: 10,
    },
    slowImportTitle: {
      color: theme.colors.textPrimary,
      fontSize: 16,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    slowImportBody: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    slowImportCheckRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    slowImportCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    slowImportCheckboxOn: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    slowImportCheckLabel: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontFamily: "Satoshi-Medium",
      fontWeight: "500",
    },
    slowImportActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 4,
    },
    slowImportSecondary: {
      flex: 1,
      minHeight: 44,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    slowImportSecondaryPressed: {
      opacity: 0.7,
    },
    slowImportSecondaryText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    slowImportPrimary: {
      flex: 1,
      minHeight: 44,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    slowImportPrimaryPressed: {
      opacity: 0.85,
    },
    slowImportPrimaryText: {
      color: theme.colors.surface,
      fontSize: 14,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    statusCard: {
      marginTop: 18,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 16,
      gap: 10,
    },
    statusHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    statusLabel: {
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    statusPercent: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    progressTrack: {
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    statusText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    errorCard: {
      marginTop: 18,
      borderRadius: 20,
      backgroundColor: theme.colors.errorSoft,
      padding: 16,
      gap: 8,
    },
    errorTitle: {
      color: theme.colors.error,
      fontSize: 14,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 15,
      lineHeight: 23,
    },
    previewCard: {
      marginTop: 18,
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 16,
      gap: 8,
    },
    // Wrap the thumbnail in its own clipped container so we can keep the
    // outer card's padding while the image bleeds to the rounded edge.
    // Negative margins on the wrap pull it flush to the card's inner walls
    // and the explicit aspect ratio keeps portrait reels from squishing
    // landscape thumbnails.
    previewThumbnailWrap: {
      marginTop: -4,
      marginHorizontal: -4,
      marginBottom: 4,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: theme.colors.surface,
      aspectRatio: 16 / 9,
      maxHeight: 220,
    },
    previewThumbnail: {
      width: "100%",
      height: "100%",
    },
    previewHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    previewEyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    previewTitle: {
      color: theme.colors.textPrimary,
      fontSize: 24,
      lineHeight: 29,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      letterSpacing: -1,
    },
    previewDescription: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
    },
    previewAiNote: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontStyle: "italic",
    },
    previewTags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    previewChip: {
      maxWidth: "100%",
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    previewChipText: {
      flexShrink: 1,
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    previewActionColumn: {
      gap: 8,
      marginTop: 4,
    },
    secondaryAction: {
      minHeight: 50,
      borderRadius: 18,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryActionText: {
      color: theme.colors.surface,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    tertiaryAction: {
      minHeight: 46,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    tertiaryActionText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    actionDisabled: {
      opacity: 0.55,
    },
    schedulerBlock: {
      gap: 12,
    },
    schedulerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    schedulerEyebrow: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    schedulerSelectedText: {
      color: theme.colors.textPrimary,
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    dayStripContent: {
      gap: 8,
      paddingVertical: 4,
      paddingRight: 8,
    },
    dayPill: {
      minWidth: 62,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderSoft,
    },
    dayPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    dayPillLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontFamily: "Satoshi-Black",
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    dayPillLabelSelected: {
      color: theme.colors.surface,
    },
    dayPillNumber: {
      marginTop: 2,
      color: theme.colors.textPrimary,
      fontSize: 20,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
    },
    dayPillNumberSelected: {
      color: theme.colors.surface,
    },
    dayPillMonth: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    dayPillMonthSelected: {
      color: theme.colors.surface,
    },
    schedulerCancel: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
    },
    schedulerCancelText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: "Satoshi-Bold",
      fontWeight: "700",
    },
    orRow: {
      marginTop: 18,
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
      fontSize: 15,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textTransform: "uppercase",
    },
    linkButton: {
      marginTop: 18,
      color: theme.colors.primary,
      fontSize: 17,
      fontFamily: "Satoshi-Bold",
      fontWeight: "800",
      textAlign: "center",
    },
  });
