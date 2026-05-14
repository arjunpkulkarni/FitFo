import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";

import { AppleSignInButton } from "../components/AppleSignInButton";
import { isAppleSignInAvailable } from "../lib/appleAuth";
import { F } from "../lib/fonts";
import { getTheme, type ThemeMode } from "../theme";
import type { AuthMode, OnboardingGoal, OnboardingSex, SaveOnboardingRequest } from "../types";

const AUTH_SLIDE_INDEX = 8;
const ONBOARDING_STEP_COUNT = AUTH_SLIDE_INDEX - 1;
const AGE_ITEM_WIDTH = 56;
const AGE_ITEM_GAP = 8;
const AGE_SNAP_INTERVAL = AGE_ITEM_WIDTH + AGE_ITEM_GAP;
const TRY_DEMO_SLIDE_INDEX = 5;
const WORKOUT_VIDEO = require("../../assets/my-workout.mp4");
const NUNO_VIDEO = require("../../assets/nuno.mov");
const NICOLETTE_VIDEO = require("../../assets/nicolette.mp4");
const FITFO_APP_ICON = require("../../assets/vector-no-bg.png");
const COACH_DEMO = require("../../assets/coachDemo.png");

function createAuthColors(mode: ThemeMode) {
  const theme = getTheme(mode);
  const isDark = mode === "dark";
  return {
    mode,
    isDark,
    accent: theme.colors.primary,
    accentBright: theme.colors.primaryBright,
    accentLight: theme.colors.primaryLight,
    accentSoft: isDark ? "rgba(255, 111, 34, 0.12)" : "rgba(71, 88, 240, 0.12)",
    accentMedium: isDark ? "rgba(255, 111, 34, 0.20)" : "rgba(71, 88, 240, 0.18)",
    accentStrong: isDark ? "rgba(255, 111, 34, 0.34)" : "rgba(71, 88, 240, 0.28)",
    accentBorder: isDark ? "rgba(255, 111, 34, 0.34)" : "rgba(71, 88, 240, 0.28)",
    accentBorderStrong: isDark ? "rgba(255, 111, 34, 0.55)" : "rgba(71, 88, 240, 0.44)",
    background: theme.colors.background,
    welcomeBackground: isDark ? "#0F0802" : theme.colors.background,
    stepBackground: isDark ? "#080706" : theme.colors.background,
    authBackground: isDark ? "#090909" : theme.colors.background,
    surface: theme.colors.surface,
    surfaceMuted: theme.colors.surfaceMuted,
    surfaceStrong: theme.colors.surfaceStrong,
    darkSurface: isDark ? "#111111" : theme.colors.surface,
    border: theme.colors.borderSoft,
    borderStrong: theme.colors.border,
    text: theme.colors.textPrimary,
    textInverse: "#FFFFFF",
    textSecondary: theme.colors.textSecondary,
    textMuted: theme.colors.textMuted,
    textFaint: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(22, 40, 103, 0.42)",
    onAccent: isDark ? "#150803" : "#FFFFFF",
    onAccentDark: "#150803",
    buttonText: isDark ? "#080808" : "#FFFFFF",
    inputPlaceholder: theme.colors.textMuted,
    error: theme.colors.error,
    errorSoft: theme.colors.errorSoft,
    noticeSoft: isDark ? "rgba(255, 111, 34, 0.12)" : "rgba(71, 88, 240, 0.10)",
  };
}

type AuthColors = ReturnType<typeof createAuthColors>;

function createAuthTheme(mode: ThemeMode) {
  const colors = createAuthColors(mode);
  return {
    colors,
    styles: createAuthStyles(colors),
  };
}

type AuthThemeValue = ReturnType<typeof createAuthTheme>;

const AuthThemeContext = createContext<AuthThemeValue>(createAuthTheme("dark"));

function useAuthTheme() {
  return useContext(AuthThemeContext);
}

interface AuthLandingScreenProps {
  activeIndex: number;
  authMode: Exclude<AuthMode, "otp">;
  error?: string | null;
  initialFullName?: string;
  initialPhoneNumber?: string;
  isAppleSubmitting?: boolean;
  isSubmitting?: boolean;
  notice?: string | null;
  onAppleSignIn: () => void;
  onChangeIndex: (index: number) => void;
  onCreateAccount: (fullName: string, phone: string) => void;
  onLogin: (phone: string) => void;
  onOnboardingPayloadChange?: (payload: SaveOnboardingRequest | null) => void;
  onSelectMode: (mode: Exclude<AuthMode, "otp">) => void;
  themeMode?: ThemeMode;
}

const goals: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: OnboardingGoal;
}> = [
  { icon: "barbell-outline", label: "Build strength", value: "get_stronger" },
  { icon: "body-outline", label: "Gain muscle", value: "build_muscle" },
  { icon: "flame-outline", label: "Lose body fat", value: "lose_fat" },
  { icon: "walk-outline", label: "Improve cardio", value: "improve_cardio" },
  { icon: "trophy-outline", label: "Sport performance", value: "athletic_performance" },
  { icon: "checkmark-circle-outline", label: "Stay consistent", value: "stay_active" },
];

const sexOptions: Array<{ label: string; sub: string; value: OnboardingSex }> = [
  { label: "Male", sub: "He / him", value: "male" },
  { label: "Female", sub: "She / her", value: "female" },
  { label: "Prefer not to say", sub: "Skip creator matching", value: "prefer_not_to_say" },
];

const ageOptions = Array.from({ length: 57 }, (_, index) => index + 14);

export function AuthLandingScreen({
  activeIndex,
  authMode,
  error,
  initialFullName,
  initialPhoneNumber,
  isAppleSubmitting = false,
  isSubmitting = false,
  notice,
  onAppleSignIn,
  onChangeIndex,
  onCreateAccount,
  onLogin,
  onOnboardingPayloadChange,
  onSelectMode,
  themeMode = "dark",
}: AuthLandingScreenProps) {
  const { width, height: windowHeight } = useWindowDimensions();
  /** Short phones (e.g. iPhone SE): tighten TikTok demo so the share control stays tappable. */
  const tryDemoTight = windowHeight < 720;
  const authTheme = useMemo(() => createAuthTheme(themeMode), [themeMode]);
  const { colors, styles } = authTheme;
  const scrollRef = useRef<ScrollView>(null);
  const ageScrollRef = useRef<ScrollView>(null);
  const workoutVideoPlayer = useVideoPlayer(WORKOUT_VIDEO, (player) => {
    player.loop = true;
    player.muted = true;
    player.playbackRate = 1.5;
    player.play();
  });
  const nunoVideoPlayer = useVideoPlayer(NUNO_VIDEO, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });
  const nicoletteVideoPlayer = useVideoPlayer(NICOLETTE_VIDEO, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber ?? "");
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [age, setAge] = useState(22);
  const [sex, setSex] = useState<OnboardingSex | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<OnboardingGoal[]>([]);
  const [weightLbs, setWeightLbs] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [tryStage, setTryStage] = useState<"tiktok" | "share" | "import" | "workout">("tiktok");
  const isNicoletteDemo = sex === "female";
  const tryDemoVideoPlayer = isNicoletteDemo ? nicoletteVideoPlayer : nunoVideoPlayer;
  const demoCreatorName = isNicoletteDemo ? "Nicolette" : "Nuno";
  const demoCreatorHandle = isNicoletteDemo ? "@npfit2" : "@nunoliftz";
  const demoWorkoutTitle = isNicoletteDemo
    ? "Nicolette leg day"
    : "Nuno push workout";
  const demoCaption = isNicoletteDemo
    ? "Leg day from a saved reel. Share it into Fitfo."
    : "Push workout from a saved reel. Share it into Fitfo.";
  const demoWorkoutTag = isNicoletteDemo ? "leg day" : "push workout";
  const demoExerciseNames = isNicoletteDemo
    ? [
        { name: "Hip thrust", sets: 4, reps: 8 },
        { name: "Plate-loaded RDLs", sets: 4, reps: 8 },
        { name: "DB sumo squats", sets: 3, reps: 10 },
        { name: "Hamstring curls", sets: 3, reps: 12 },
        { name: "Hip abductors", sets: 3, reps: 12 },
      ]
    : [
        { name: "Single arm lateral raise", sets: 3, reps: 8 },
        { name: "Pec dec", sets: 3, reps: 8 },
        { name: "Incline press", sets: 3, reps: 8 },
        { name: "Shoulder press machine", sets: 3, reps: 8 },
        { name: "Tricep dip machine", sets: 2, reps: 8 },
        { name: "Single arm cable extension", sets: 2, reps: 10 },
      ];
  const demoTotalSets = demoExerciseNames.reduce((total, exercise) => total + exercise.sets, 0);
  // Viral-range mock counts (20k–40k), TikTok-style abbreviations.
  const demoLikeCountLabel = isNicoletteDemo ? "29.2K" : "34.8K";

  useEffect(() => { setFullName(initialFullName ?? ""); }, [initialFullName]);
  useEffect(() => { setPhoneNumber(initialPhoneNumber ?? ""); }, [initialPhoneNumber]);

  useEffect(() => {
    let alive = true;
    isAppleSignInAvailable().then((value) => {
      if (alive) {
        setIsAppleAvailable(value);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!width) {
      return;
    }
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: activeIndex * width, animated: true });
    }, 0);
    return () => clearTimeout(id);
  }, [activeIndex, width]);

  useEffect(() => {
    const id = setTimeout(() => {
      ageScrollRef.current?.scrollTo({
        animated: false,
        x: Math.max(0, ageOptions.indexOf(age)) * AGE_SNAP_INTERVAL,
      });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const totalHeightInches =
    Number.parseInt(heightFeet, 10) * 12 + Number.parseInt(heightInches, 10);
  const numericWeight = Number.parseFloat(weightLbs);

  const onboardingPayload = useMemo<SaveOnboardingRequest | null>(() => {
    if (
      !sex ||
      selectedGoals.length === 0 ||
      !Number.isFinite(numericWeight) ||
      !Number.isFinite(totalHeightInches)
    ) {
      return null;
    }

    return {
      age,
      days_per_week: 4,
      experience_level: "intermediate",
      goals: selectedGoals,
      height_inches: totalHeightInches,
      sex,
      training_split: "ppl",
      custom_split_notes: null,
      weight_lbs: numericWeight,
    };
  }, [age, numericWeight, selectedGoals, sex, totalHeightInches]);

  useEffect(() => {
    onOnboardingPayloadChange?.(onboardingPayload);
  }, [onOnboardingPayloadChange, onboardingPayload]);

  const ageWheelSidePadding = Math.max(0, (width - 48 - AGE_ITEM_WIDTH) / 2);
  const canSubmit =
    authMode === "signup"
      ? Boolean(fullName.trim() && phoneNumber.trim()) && !isSubmitting
      : Boolean(phoneNumber.trim()) && !isSubmitting;

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) {
      return;
    }
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== activeIndex) {
      // Dismiss any keyboard left over from the previous slide's TextInput
      // (e.g. step 4 number-pad, step 8 phone-pad). Without this, iOS keeps
      // the keyboard up over slides that don't have focused inputs.
      Keyboard.dismiss();
      onChangeIndex(next);
    }
  };

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, AUTH_SLIDE_INDEX));
    if (clamped !== activeIndex) {
      Keyboard.dismiss();
    }
    onChangeIndex(clamped);
  };
  const next = () => goTo(activeIndex + 1);
  const back = () => goTo(activeIndex - 1);

  const handleSubmit = () => {
    const phone = phoneNumber.trim();
    const name = fullName.trim();
    if (authMode === "signup") {
      onCreateAccount(name, phone);
      return;
    }
    onLogin(phone);
  };

  const toggleGoal = (goal: OnboardingGoal) => {
    setSelectedGoals((current) =>
      current.includes(goal) ? current.filter((value) => value !== goal) : [...current, goal],
    );
  };

  const handleAgeScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(
      0,
      Math.min(
        ageOptions.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / AGE_SNAP_INTERVAL),
      ),
    );
    setAge(ageOptions[nextIndex]);
  };

  const selectAge = (value: number) => {
    setAge(value);
    ageScrollRef.current?.scrollTo({
      animated: true,
      x: Math.max(0, ageOptions.indexOf(value)) * AGE_SNAP_INTERVAL,
    });
  };

  useEffect(() => {
    if (tryStage !== "import") {
      return undefined;
    }

    const timer = setTimeout(() => {
      setTryStage("workout");
    }, 3000);

    return () => clearTimeout(timer);
  }, [tryStage]);

  const openTryShareSheet = () => setTryStage("share");
  const startTryImport = () => setTryStage("import");
  const resetTryDemo = () => {
    setTryStage("tiktok");
    tryDemoVideoPlayer.replay();
  };

  useEffect(() => {
    if (activeIndex === TRY_DEMO_SLIDE_INDEX && tryStage === "tiktok") {
      tryDemoVideoPlayer.replay();
    }
  }, [activeIndex, tryDemoVideoPlayer, tryStage]);

  return (
    <AuthThemeContext.Provider value={authTheme}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
      <ScrollView
        ref={scrollRef}
        bounces={false}
        horizontal
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={handleMomentumEnd}
        pagingEnabled
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.carousel}
      >
        <View style={[styles.slide, { width }]}>
          <LinearGradient
            colors={colors.isDark ? ["#050505", "#130906", "#080808"] : [colors.background, colors.background]}
            style={styles.welcome}
          >
            <View style={styles.centerCopy}>
              <Text style={styles.wordmark}>fit<Text style={styles.wordmarkAccent}>fo</Text></Text>
              <Text style={styles.welcomeTitle}>
                Save a workout video.{"\n"}
                <Text style={styles.welcomeAccent}>Train it tomorrow.</Text>
              </Text>
            </View>
            <View style={styles.welcomeVideoStage}>
              <View style={styles.welcomeVideoCard}>
                <VideoView
                  allowsPictureInPicture={false}
                  contentFit="contain"
                  fullscreenOptions={{ enable: false }}
                  nativeControls={false}
                  player={workoutVideoPlayer}
                  playsInline
                  style={styles.welcomeVideo}
                />
                <LinearGradient
                  colors={["rgba(0,0,0,0.02)", "transparent", "rgba(0,0,0,0.38)"]}
                  pointerEvents="none"
                  style={styles.welcomeVideoScrim}
                />
              </View>
            </View>
            <View style={styles.bottomStack}>
              <PrimaryButton label="Get started" onPress={next} />
              <SecondaryButton label="Log in" onPress={() => onSelectMode("login")} />
              <Text style={styles.welcomeTrust}>Works with TikTok and Instagram.</Text>
              <Text style={styles.welcomeLegal}>By continuing you agree to the Terms and Privacy Policy.</Text>
            </View>
          </LinearGradient>
        </View>

        <StepSlide
          back={back}
          canContinue
          index={1}
          next={next}
          title="How old are you?"
          subtitle="So we can keep intensity, examples, and progress defaults grounded."
          width={width}
        >
          <View style={styles.ageCard}>
            <View style={styles.ageWheelWindow}>
              <View pointerEvents="none" style={styles.ageWheelCenter} />
              <ScrollView
                ref={ageScrollRef}
                contentContainerStyle={[
                  styles.ageRow,
                  { paddingHorizontal: ageWheelSidePadding },
                ]}
                decelerationRate="fast"
                horizontal
                onMomentumScrollEnd={handleAgeScrollEnd}
                onScrollEndDrag={handleAgeScrollEnd}
                showsHorizontalScrollIndicator={false}
                snapToInterval={AGE_SNAP_INTERVAL}
                snapToAlignment="start"
              >
                {ageOptions.map((option) => {
                  const selected = age === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => selectAge(option)}
                      style={[styles.ageWheelItem, selected && styles.ageWheelItemActive]}
                    >
                      <Text style={[styles.ageWheelText, selected && styles.ageWheelTextActive]}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <Text style={styles.ageReadout}>{age}</Text>
            <Text style={styles.mutedCaps}>years old</Text>
          </View>
        </StepSlide>

        <StepSlide
          back={back}
          canContinue={Boolean(sex)}
          index={2}
          next={next}
          title="What's your sex?"
          subtitle="Used for creator-style previews and personalization. You can skip the signal."
          width={width}
        >
          <View style={styles.optionList}>
            {sexOptions.map((option) => (
              <OptionRow
                key={option.value}
                active={sex === option.value}
                label={option.label}
                onPress={() => setSex(option.value)}
                sub={option.sub}
              />
            ))}
          </View>
        </StepSlide>

        <StepSlide
          back={back}
          canContinue={selectedGoals.length > 0}
          index={3}
          next={next}
          title="What drives you?"
          subtitle="Pick all that fit. Fitfo will bias your setup around these goals."
          width={width}
        >
          <View style={styles.goalGrid}>
            {goals.map((goal) => {
              const active = selectedGoals.includes(goal.value);
              return (
                <Pressable
                  key={goal.value}
                  onPress={() => toggleGoal(goal.value)}
                  style={[styles.goalChip, active && styles.goalChipActive]}
                >
                  <Ionicons color={active ? colors.onAccent : colors.accent} name={goal.icon} size={17} />
                  <Text style={[styles.goalText, active && styles.goalTextActive]}>{goal.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </StepSlide>

        <StepSlide
          back={back}
          canContinue={Number.isFinite(numericWeight) && Number.isFinite(totalHeightInches)}
          index={4}
          next={next}
          title="Height and weight"
          subtitle="This gives progress charts a baseline. You can edit it any time."
          width={width}
        >
          <View style={styles.statsCard}>
            <View style={styles.fieldGrid}>
              <StatInput label="Weight" onChange={setWeightLbs} suffix="lb" value={weightLbs} />
            </View>
            <View style={styles.fieldGrid}>
              <StatInput label="Feet" onChange={setHeightFeet} suffix="ft" value={heightFeet} />
              <StatInput label="Inches" onChange={setHeightInches} suffix="in" value={heightInches} />
            </View>
          </View>
        </StepSlide>

        <StepSlide
          back={back}
          canContinue
          compact
          index={5}
          next={next}
          showContinue={tryStage === "workout"}
          title="Take it for a spin."
          subtitle="Tap Share, choose Fitfo, and watch the workout appear."
          width={width}
        >
          <View style={styles.tryPhoneShell}>
            <View style={styles.tryPhoneScreen}>
              <VideoView
                allowsPictureInPicture={false}
                contentFit="cover"
                fullscreenOptions={{ enable: false }}
                nativeControls={false}
                player={tryDemoVideoPlayer}
                playsInline
                pointerEvents="none"
                style={styles.tiktokVideo}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.04)", "rgba(0,0,0,0.7)"]}
                pointerEvents="none"
                style={styles.tiktokScrim}
              />

              <View style={styles.tiktokStatus}>
                <Text style={styles.tiktokTime}>8:57</Text>
                <View style={styles.tiktokStatusIcons}>
                  <Ionicons color="#FFFFFF" name="cellular" size={14} />
                  <Ionicons color="#FFFFFF" name="wifi" size={14} />
                  <Ionicons color="#FFFFFF" name="battery-full" size={18} />
                </View>
              </View>

              <View style={styles.tiktokTabs}>
                <Text style={styles.tiktokTabMuted}>Explore</Text>
                <Text style={styles.tiktokTabMuted}>Following</Text>
                <View style={styles.tiktokTabActiveWrap}>
                  <Text style={styles.tiktokTabActive}>For You</Text>
                  <View style={styles.tiktokTabUnderline} />
                </View>
                <Ionicons color="#FFFFFF" name="search" size={24} />
              </View>

              <View
                style={[
                  styles.tiktokSideRail,
                  tryDemoTight && styles.tiktokSideRailTight,
                ]}
              >
                <View
                  style={[
                    styles.tiktokAvatar,
                    tryDemoTight && styles.tiktokAvatarTight,
                  ]}
                >
                  <Text
                    style={[
                      styles.tiktokAvatarText,
                      tryDemoTight && styles.tiktokAvatarTextTight,
                    ]}
                  >
                    {demoCreatorName[0]}
                  </Text>
                  <View
                    style={[
                      styles.tiktokAvatarPlus,
                      tryDemoTight && styles.tiktokAvatarPlusTight,
                    ]}
                  >
                    <Ionicons
                      color="#FFFFFF"
                      name="add"
                      size={tryDemoTight ? 11 : 13}
                    />
                  </View>
                </View>
                <TikTokAction
                  icon="heart"
                  iconSize={tryDemoTight ? 26 : 30}
                  label={demoLikeCountLabel}
                  labelStyle={tryDemoTight ? styles.tiktokActionTextTight : undefined}
                />
                <TikTokAction
                  icon="chatbubble-ellipses"
                  iconSize={tryDemoTight ? 26 : 30}
                  label="Add 1st"
                  labelStyle={tryDemoTight ? styles.tiktokActionTextTight : undefined}
                />
                <TikTokAction
                  icon="bookmark"
                  iconSize={tryDemoTight ? 26 : 30}
                  label="6"
                  labelStyle={tryDemoTight ? styles.tiktokActionTextTight : undefined}
                />
                <Pressable
                  hitSlop={12}
                  onPress={openTryShareSheet}
                  style={({ pressed }) => [
                    styles.tiktokAction,
                    styles.tiktokShareAction,
                    tryStage === "tiktok" && styles.tiktokShareActionPrompt,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    color="#FFFFFF"
                    name="arrow-redo"
                    size={tryDemoTight ? 28 : 32}
                  />
                  <Text
                    style={[
                      styles.tiktokActionText,
                      tryDemoTight && styles.tiktokActionTextTight,
                    ]}
                  >
                    Share
                  </Text>
                </Pressable>
              </View>

              <View style={styles.tiktokCaption}>
                <Text style={styles.tiktokCreator}>{demoCreatorHandle}</Text>
                <Text style={styles.tiktokCaptionText}>{demoCaption}</Text>
              </View>

              <View style={styles.tiktokBottomNav}>
                <View style={styles.tiktokNavItem}>
                  <Ionicons color="#FFFFFF" name="home" size={22} />
                  <Text style={styles.tiktokNavTextActive}>Home</Text>
                </View>
                <View style={styles.tiktokNavItem}>
                  <Ionicons color="rgba(255,255,255,0.72)" name="people-outline" size={22} />
                  <Text style={styles.tiktokNavText}>Friends</Text>
                </View>
                <View style={styles.tiktokPostButton}>
                  <Ionicons color="#050505" name="add" size={24} />
                </View>
                <View style={styles.tiktokNavItem}>
                  <Ionicons color="rgba(255,255,255,0.72)" name="chatbox-outline" size={22} />
                  <Text style={styles.tiktokNavText}>Inbox</Text>
                </View>
                <View style={styles.tiktokNavItem}>
                  <Ionicons color="rgba(255,255,255,0.72)" name="person-outline" size={22} />
                  <Text style={styles.tiktokNavText}>Profile</Text>
                </View>
              </View>

              {tryStage === "tiktok" ? (
                <View
                  pointerEvents="box-none"
                  style={[
                    styles.tapShareCallout,
                    tryDemoTight && styles.tapShareCalloutTight,
                  ]}
                >
                  <Text style={styles.tapShareTitle}>Tap Share</Text>
                  <Text style={styles.tapShareBody}>Start like you would in TikTok.</Text>
                </View>
              ) : null}

              {tryStage === "share" ? (
                <View style={styles.tiktokShareSheet}>
                  <View style={styles.shareSheetHandle} />
                  <View style={styles.shareSheetHeader}>
                    <Ionicons color="#FFFFFF" name="search" size={24} />
                    <Text style={styles.shareSheetTitle}>Send to</Text>
                    <Pressable onPress={() => setTryStage("tiktok")} hitSlop={10}>
                      <Ionicons color="#FFFFFF" name="close" size={26} />
                    </Pressable>
                  </View>
                  <View style={styles.shareContactRow}>
                    {["Maya", "Sam", "Ari", "Dev"].map((name) => (
                      <View key={name} style={styles.shareContact}>
                        <View style={styles.shareContactAvatar}>
                          <Text style={styles.shareContactInitial}>{name[0]}</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.shareContactName}>{name}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.shareAppRow}>
                    <ShareAppButton color={colors.isDark ? colors.surfaceStrong : colors.accent} icon="chatbubble" label="SMS" />
                    <ShareAppButton color={colors.isDark ? colors.surfaceStrong : colors.accent} icon="link" label="Copy link" />
                    <Pressable onPress={startTryImport} style={({ pressed }) => [styles.fitfoShareButton, pressed && styles.pressed]}>
                      <View style={styles.fitfoShareIcon}>
                        <Image resizeMode="cover" source={FITFO_APP_ICON} style={styles.fitfoShareLogoImage} />
                      </View>
                      <Text style={styles.fitfoShareText}>Fitfo</Text>
                    </Pressable>
                    <ShareAppButton color={colors.isDark ? colors.surfaceStrong : colors.accent} icon="logo-instagram" label="Instagram" />
                  </View>
                  <Text style={styles.fitfoPrompt}>Tap Fitfo to import this workout.</Text>
                </View>
              ) : null}

              {tryStage === "import" ? (
                <View style={styles.importOverlay}>
                  <View style={styles.importModal}>
                    <View style={styles.importBadge}>
                      <ActivityIndicator color={colors.onAccent} size="small" />
                    </View>
                    <Text style={styles.importTitle}>Importing to Fitfo</Text>
                    <Text style={styles.importBody}>Reading caption, frames, and exercises...</Text>
                    <View style={styles.importPulseRow}>
                      <View style={[styles.importPulseDot, styles.importPulseDotHot]} />
                      <View style={styles.importPulseDot} />
                      <View style={styles.importPulseDot} />
                    </View>
                  </View>
                </View>
              ) : null}

              {tryStage === "workout" ? (
                <View style={styles.importedWorkoutSheet}>
                  <View style={styles.importedTopBar}>
                    <Pressable onPress={resetTryDemo} style={({ pressed }) => [styles.importedRoundButton, pressed && styles.pressed]}>
                      <Ionicons color={colors.accent} name="chevron-back" size={20} />
                    </Pressable>
                    <Image resizeMode="cover" source={FITFO_APP_ICON} style={styles.importedLogo} />
                    <View style={[styles.importedRoundButton, styles.importedCoachButton]}>
                      <Ionicons color="#FFFFFF" name="barbell-outline" size={18} />
                    </View>
                  </View>

                  <View style={styles.importedWorkoutContent}>
                    <View style={styles.importedHeader}>
                      <Text style={styles.importedKicker}>Current session</Text>
                      <View style={styles.importedStatusPill}>
                        <Ionicons color={colors.accent} name="checkmark-circle" size={13} />
                        <Text style={styles.importedStatusText}>Imported</Text>
                      </View>
                    </View>
                    <Text style={styles.importedTitle}>{demoWorkoutTitle}</Text>
                    <Text style={styles.importedSubtitle}>
                      Imported from TikTok and tagged as {demoWorkoutTag}.
                    </Text>
                    <View style={styles.originalReelPill}>
                      <Ionicons color={colors.accent} name="play-circle-outline" size={15} />
                      <Text style={styles.originalReelText}>View original reel</Text>
                      <Ionicons color={colors.accent} name="open-outline" size={13} />
                    </View>
                    <View style={styles.importedTimerCard}>
                      <Text style={styles.importedTimerLabel}>Time elapsed</Text>
                      <Text style={styles.importedTimerValue}>00:17</Text>
                      <Text style={styles.importedTimerMeta}>0 of {demoTotalSets} sets logged</Text>
                    </View>
                    <ScrollView
                      contentContainerStyle={styles.importedExerciseList}
                      showsVerticalScrollIndicator={false}
                      style={styles.importedExerciseScroll}
                    >
                      {demoExerciseNames.map((exercise) => (
                        <View key={exercise.name} style={styles.importedExerciseCard}>
                          <View style={styles.importedExerciseIcon}>
                            <Ionicons
                              color={colors.accent}
                              name={isNicoletteDemo ? "body-outline" : "barbell-outline"}
                              size={18}
                            />
                          </View>
                          <View style={styles.importedExerciseCopy}>
                            <Text numberOfLines={1} style={styles.importedExerciseName}>{exercise.name}</Text>
                            <Text style={styles.importedExerciseSub}>Follow coach notes</Text>
                          </View>
                          <Text style={styles.importedSetPill}>
                            {exercise.sets}x{exercise.reps}
                          </Text>
                          <View style={styles.importedTrash}>
                            <Ionicons color={colors.accent} name="trash-outline" size={16} />
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    <Pressable onPress={resetTryDemo} style={({ pressed }) => [styles.tryAgainButton, pressed && styles.pressed]}>
                      <Ionicons color={colors.onAccent} name="refresh" size={18} />
                      <Text style={styles.tryAgainText}>Try it again</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </StepSlide>

        <StepSlide
          back={back}
          canContinue
          index={6}
          next={next}
          title="Schedule it. Show up to it."
          subtitle="Drop imported workouts into your week and get a nudge when it is time."
          width={width}
        >
          <FeatureCard title={demoWorkoutTitle} type="calendar" />
        </StepSlide>

        <StepSlide
          back={back}
          canContinue
          index={7}
          next={next}
          title="Coach in your pocket."
          subtitle="Once you start a workout, open the coach and ask about form, swaps, progression, reps, weights, or anything about the session you're in."
          width={width}
        >
          <FeatureCard type="coach" />
        </StepSlide>

        <View style={[styles.slide, { width }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.authSlideScroll}
            contentContainerStyle={styles.authSlideScrollContent}
          >
            <View style={styles.authSlideMain}>
              <Text style={styles.authTitle}>
                {authMode === "login" ? "Welcome\nBack" : "Save\nYour Setup"}
                <Text style={styles.authDot}>.</Text>
              </Text>
              <Text style={styles.authSub}>
                {authMode === "login"
                  ? "Log in to pick up where you left off."
                  : "Create an account so your imports and progress sync everywhere."}
              </Text>

              <View style={styles.tabs}>
                <Pressable onPress={() => onSelectMode("signup")} style={[styles.tab, authMode === "signup" && styles.tabActive]}>
                  <Text style={[styles.tabText, authMode === "signup" && styles.tabTextActive]}>Sign Up</Text>
                </Pressable>
                <Pressable onPress={() => onSelectMode("login")} style={[styles.tab, authMode === "login" && styles.tabActive]}>
                  <Text style={[styles.tabText, authMode === "login" && styles.tabTextActive]}>Log In</Text>
                </Pressable>
              </View>

              <View style={styles.authCard}>
                {isAppleAvailable ? (
                  <>
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
                  </>
                ) : null}

                {authMode === "signup" ? (
                  <Field
                    icon="person-outline"
                    label="Full Name"
                    onChangeText={setFullName}
                    placeholder="Alex Rivera"
                    value={fullName}
                  />
                ) : null}

                <Field
                  icon="call-outline"
                  keyboardType="phone-pad"
                  label="Phone Number"
                  onChangeText={setPhoneNumber}
                  placeholder="+1 (555) 000-0000"
                  value={phoneNumber}
                />

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
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    !canSubmit && styles.submitBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {isSubmitting ? (
                    <>
                      <ActivityIndicator color={colors.buttonText} size="small" />
                      <Text style={styles.submitBtnText}>Sending Code</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.submitBtnText}>Send Code</Text>
                      <Ionicons color={colors.buttonText} name="arrow-forward" size={18} />
                    </>
                  )}
                </Pressable>
              </View>
            </View>
            <Text style={styles.legal}>Privacy Policy & Terms</Text>
          </ScrollView>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </AuthThemeContext.Provider>
  );
}

function StepSlide({
  back,
  canContinue,
  children,
  compact,
  index,
  next,
  showContinue = true,
  subtitle,
  title,
  width,
}: {
  back: () => void;
  canContinue: boolean;
  children: ReactNode;
  compact?: boolean;
  index: number;
  next: () => void;
  showContinue?: boolean;
  subtitle: string;
  title: string;
  width: number;
}) {
  const { colors, styles } = useAuthTheme();
  const { height: stepWindowHeight } = useWindowDimensions();
  const onboardingTight = stepWindowHeight < 720;
  return (
    <View style={[styles.slide, { width }]}>
      <View
        style={[
          styles.stepSlide,
          compact && styles.stepSlideCompact,
          onboardingTight && styles.stepSlideTight,
        ]}
      >
        <View style={styles.progressShell}>
          <Text style={styles.progressText}>
            Step {index} of {ONBOARDING_STEP_COUNT}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(index / ONBOARDING_STEP_COUNT) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepTitle, onboardingTight && styles.stepTitleTight]}>
            {title}
          </Text>
          <Text style={[styles.bodyText, onboardingTight && styles.stepSubtitleTight]}>
            {subtitle}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.stepBodyScrollContent,
            compact && styles.stepBodyScrollContentCompact,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.stepBodyScroll}
        >
          {children}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable onPress={back} style={styles.backButton}>
            <Ionicons color={colors.text} name="arrow-back" size={18} />
          </Pressable>
          {showContinue ? <PrimaryButton disabled={!canContinue} label="Continue" onPress={next} /> : null}
        </View>
      </View>
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useAuthTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, disabled && styles.primaryButtonDisabled, pressed && styles.pressed]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Ionicons color={colors.buttonText} name="arrow-forward" size={18} />
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useAuthTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
      <Ionicons color={colors.text} name="log-in-outline" size={18} />
    </Pressable>
  );
}

function TikTokAction({
  icon,
  iconSize = 30,
  label,
  labelStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  label: string;
  labelStyle?: TextStyle;
}) {
  const { styles } = useAuthTheme();
  return (
    <View style={styles.tiktokAction}>
      <Ionicons color="#FFFFFF" name={icon} size={iconSize} />
      <Text style={[styles.tiktokActionText, labelStyle]}>{label}</Text>
    </View>
  );
}

function ShareAppButton({
  color,
  icon,
  label,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const { styles } = useAuthTheme();
  return (
    <View style={styles.shareAppButton}>
      <View style={[styles.shareAppIcon, { backgroundColor: color }]}>
        <Ionicons color="#FFFFFF" name={icon} size={24} />
      </View>
      <Text numberOfLines={2} style={styles.shareAppText}>{label}</Text>
    </View>
  );
}

function OptionRow({
  active,
  label,
  meter,
  onPress,
  sub,
  weekDots,
}: {
  active: boolean;
  label: string;
  meter?: number;
  onPress: () => void;
  sub: string;
  weekDots?: number;
}) {
  const { colors, styles } = useAuthTheme();
  return (
    <Pressable onPress={onPress} style={[styles.optionRow, active && styles.optionRowActive]}>
      {meter ? (
        <View style={styles.meter}>
          {[1, 2, 3].map((bar) => (
            <View key={bar} style={[styles.meterBar, { height: 9 + bar * 8 }, bar <= meter && styles.meterBarActive]} />
          ))}
        </View>
      ) : null}
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
      {weekDots !== undefined ? (
        <View style={styles.weekDots}>
          {Array.from({ length: 7 }, (_, index) => (
            <View key={index} style={[styles.weekDot, index < weekDots && styles.weekDotActive]} />
          ))}
        </View>
      ) : (
        <View style={[styles.radio, active && styles.radioActive]}>
          {active ? <Ionicons color={colors.onAccent} name="checkmark" size={13} /> : null}
        </View>
      )}
    </Pressable>
  );
}

function StatInput({
  label,
  onChange,
  suffix,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  suffix: string;
  value: string;
}) {
  const { colors, styles } = useAuthTheme();
  return (
    <View style={styles.statInputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.statInputShell}>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(text) => onChange(text.replace(/[^0-9.]/g, "").slice(0, 5))}
          placeholderTextColor={colors.inputPlaceholder}
          style={styles.statInput}
          value={value}
        />
        <Text style={styles.statSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function Field({
  icon,
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, styles } = useAuthTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldShell}>
        <Ionicons color={colors.accent} name={icon} size={18} />
        <TextInput
          autoCapitalize={label === "Full Name" ? "words" : "none"}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          style={styles.fieldInput}
          value={value}
        />
      </View>
    </View>
  );
}

function FeatureCard({ title, type }: { title?: string; type: "calendar" | "coach" }) {
  const { colors, styles } = useAuthTheme();
  const { height: featureWindowHeight } = useWindowDimensions();
  const featureTight = featureWindowHeight < 720;

  if (type === "calendar") {
    return (
      <View style={styles.featureCard}>
        <Text style={styles.mutedCaps}>This week</Text>
        <View style={styles.calendarRow}>
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => {
            const active = index === 2 || index === 4;
            return (
              <View
                key={`${day}-${index}`}
                style={[
                  styles.calendarDay,
                  featureTight && styles.calendarDayTight,
                  active && styles.calendarDayActive,
                ]}
              >
                <Text style={[styles.calendarText, active && styles.calendarTextActive]}>{day}</Text>
                <Text style={[styles.calendarDate, active && styles.calendarTextActive]}>{index + 1}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.eventCard}>
          <Ionicons color={colors.accent} name="barbell-outline" size={20} />
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{title ?? "Imported workout"}</Text>
            <Text style={styles.optionSub}>6:30 PM · 5 exercises</Text>
          </View>
          <Text style={styles.eventBadge}>QUEUED</Text>
        </View>
      </View>
    );
  }

  const coachDemoHeight = Math.round(
    Math.min(Math.max(featureWindowHeight * 0.38, 260), 460),
  );

  return (
    <View style={styles.coachDemoCard}>
      <View style={[styles.coachDemoFrame, { height: coachDemoHeight }]}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Preview of the in-workout Fitfo AI Coach chat"
          resizeMode="contain"
          source={COACH_DEMO}
          style={styles.coachDemoImage}
        />
      </View>
    </View>
  );
}

function createAuthStyles(colors: AuthColors) {
  return StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  carousel: {
    flex: 1,
  },
  slide: {
    flex: 1,
  },
  welcome: {
    backgroundColor: colors.welcomeBackground,
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: Platform.OS === "ios" ? 24 : 18,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 28 : 22,
  },
  centerCopy: {
    alignItems: "flex-start",
    gap: 12,
    marginTop: 0,
    width: "100%",
  },
  wordmark: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 32,
  },
  wordmarkAccent: {
    color: colors.accent,
  },
  welcomeTitle: {
    color: colors.text,
    fontFamily: F.display,
    fontSize: 38,
    letterSpacing: 0,
    lineHeight: 42,
    maxWidth: 380,
    textAlign: "left",
  },
  welcomeAccent: {
    color: colors.accent,
    fontFamily: F.display,
  },
  welcomeVideoStage: {
    alignItems: "center",
    flex: 1,
    flexBasis: 0,
    justifyContent: "center",
    maxHeight: 438,
    minHeight: 220,
    width: "100%",
  },
  welcomeVideoCard: {
    aspectRatio: 306 / 438,
    backgroundColor: "transparent",
    borderRadius: 0,
    height: "100%",
    maxWidth: 306,
    overflow: "hidden",
  },
  welcomeVideo: {
    height: "100%",
    width: "100%",
  },
  welcomeVideoScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  bodyText: {
    color: colors.textSecondary,
    fontFamily: F.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "left",
  },
  bottomStack: {
    gap: 8,
  },
  welcomeTrust: {
    color: colors.textSecondary,
    fontFamily: F.medium,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  welcomeLegal: {
    color: colors.textMuted,
    fontFamily: F.medium,
    fontSize: 10,
    textAlign: "center",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: colors.text,
    fontFamily: F.bold,
    fontSize: 15,
  },
  stepSlide: {
    backgroundColor: colors.stepBackground,
    flex: 1,
    gap: 20,
    paddingBottom: Platform.OS === "ios" ? 24 : 20,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 58 : 34,
  },
  stepSlideCompact: {
    gap: 12,
    paddingTop: Platform.OS === "ios" ? 32 : 22,
  },
  stepSlideTight: {
    gap: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 14,
    paddingTop: Platform.OS === "ios" ? 24 : 16,
  },
  progressShell: {
    gap: 9,
  },
  progressText: {
    color: colors.accent,
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  stepHeader: {
    gap: 10,
  },
  stepTitle: {
    color: colors.text,
    fontFamily: F.display,
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 39,
    textAlign: "left",
  },
  stepTitleTight: {
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  stepSubtitleTight: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepBody: {
    flex: 1,
    justifyContent: "center",
  },
  stepBodyCompact: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  stepBodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  stepBodyScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 8,
    paddingTop: 4,
  },
  stepBodyScrollContentCompact: {
    justifyContent: "flex-start",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
  },
  backButton: {
    width: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 22,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontFamily: F.black,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  ageCard: {
    alignItems: "center",
    gap: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 20,
    overflow: "hidden",
  },
  ageWheelWindow: {
    height: 84,
    justifyContent: "center",
    width: "100%",
  },
  ageWheelCenter: {
    alignSelf: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorderStrong,
    borderRadius: 18,
    borderWidth: 1,
    height: 62,
    position: "absolute",
    width: AGE_ITEM_WIDTH,
  },
  ageRow: {
    gap: AGE_ITEM_GAP,
    alignItems: "center",
  },
  ageWheelItem: {
    width: AGE_ITEM_WIDTH,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.42,
  },
  ageWheelItemActive: {
    opacity: 1,
  },
  ageWheelText: {
    color: colors.textMuted,
    fontFamily: F.black,
    fontSize: 18,
    lineHeight: 22,
  },
  ageWheelTextActive: {
    color: colors.accent,
    fontSize: 26,
    lineHeight: 30,
  },
  ageReadout: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 20,
    lineHeight: 24,
  },
  mutedCaps: {
    color: colors.textMuted,
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  optionList: {
    gap: 10,
  },
  optionRow: {
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  optionRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionCopy: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 16,
    lineHeight: 21,
  },
  optionSub: {
    color: colors.textSecondary,
    fontFamily: F.bold,
    fontSize: 12,
    lineHeight: 17,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  meter: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    gap: 4,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 8,
  },
  meterBar: {
    width: 6,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  meterBarActive: {
    backgroundColor: colors.accent,
  },
  weekDots: {
    flexDirection: "row",
    gap: 4,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  weekDotActive: {
    backgroundColor: colors.accent,
  },
  exerciseRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
  },
  exerciseIndex: {
    width: 22,
    color: colors.accent,
    fontFamily: F.black,
  },
  exerciseName: {
    flex: 1,
    color: colors.text,
    fontFamily: F.bold,
    fontSize: 13,
  },
  exerciseMeta: {
    color: colors.textSecondary,
    fontFamily: F.bold,
    fontSize: 11,
  },
  goalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  goalChip: {
    width: "48%",
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
  },
  goalChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  goalText: {
    flex: 1,
    color: colors.text,
    fontFamily: F.black,
    fontSize: 13,
    lineHeight: 17,
  },
  goalTextActive: {
    color: colors.onAccent,
  },
  statsCard: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  fieldGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statInputGroup: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  statInputShell: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statInput: {
    flex: 1,
    color: colors.text,
    fontFamily: F.black,
    fontSize: 18,
  },
  statSuffix: {
    color: colors.textSecondary,
    fontFamily: F.bold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  tryPhoneShell: {
    alignSelf: "center",
    aspectRatio: 300 / 500,
    backgroundColor: "#070707",
    borderColor: colors.border,
    borderRadius: 38,
    borderWidth: 1,
    flexShrink: 1,
    height: "100%",
    maxHeight: 500,
    maxWidth: 300,
    padding: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
  },
  tryPhoneScreen: {
    backgroundColor: "#000000",
    borderRadius: 32,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  tiktokVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  tiktokScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  tiktokStatus: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: "6%",
    position: "absolute",
    right: "6%",
    top: "2.6%",
    zIndex: 2,
  },
  tiktokTime: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 15,
  },
  tiktokStatusIcons: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  tiktokTabs: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    left: "5.5%",
    position: "absolute",
    right: "4.5%",
    top: "9.4%",
    zIndex: 2,
  },
  tiktokTabMuted: {
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: F.black,
    fontSize: 13,
  },
  tiktokTabActiveWrap: {
    alignItems: "center",
    gap: 5,
  },
  tiktokTabActive: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 14,
  },
  tiktokTabUnderline: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 2,
    width: 28,
  },
  tiktokSideRail: {
    alignItems: "center",
    gap: 13,
    position: "absolute",
    right: "3.5%",
    top: "31%",
    zIndex: 5,
  },
  tiktokSideRailTight: {
    gap: 7,
  },
  tiktokAvatar: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 3,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  tiktokAvatarTight: {
    height: 40,
    width: 40,
  },
  tiktokAvatarText: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 22,
  },
  tiktokAvatarTextTight: {
    fontSize: 18,
  },
  tiktokAvatarPlus: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 999,
    bottom: -9,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    width: 22,
  },
  tiktokAvatarPlusTight: {
    bottom: -7,
    height: 19,
    width: 19,
  },
  tiktokAction: {
    alignItems: "center",
    gap: 2,
    minWidth: 52,
  },
  tiktokShareAction: {
    borderColor: "transparent",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  tiktokShareActionPrompt: {
    backgroundColor: colors.accentMedium,
    borderColor: colors.accent,
  },
  tiktokActionText: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 10,
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tiktokActionTextTight: {
    fontSize: 9,
  },
  tiktokCaption: {
    bottom: "10.8%",
    gap: 4,
    left: "5.5%",
    position: "absolute",
    right: "27%",
    zIndex: 2,
  },
  tiktokCreator: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 15,
  },
  tiktokCaptionText: {
    color: "#FFFFFF",
    fontFamily: F.bold,
    fontSize: 13,
    lineHeight: 17,
  },
  tiktokBottomNav: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    height: "9.6%",
    justifyContent: "space-around",
    left: 0,
    minHeight: 44,
    paddingHorizontal: 8,
    position: "absolute",
    right: 0,
    zIndex: 2,
  },
  tiktokNavItem: {
    alignItems: "center",
    gap: 1,
    width: 45,
  },
  tiktokNavText: {
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: F.bold,
    fontSize: 9,
  },
  tiktokNavTextActive: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 9,
  },
  tiktokPostButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: colors.accent,
    borderRadius: 10,
    borderRightWidth: 3,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    height: 31,
    justifyContent: "center",
    width: 44,
  },
  tapShareCallout: {
    backgroundColor: "rgba(8, 8, 8, 0.78)",
    borderColor: colors.accentBorderStrong,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: "46%",
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: "absolute",
    right: "23%",
    top: "62%",
    width: "46%",
    zIndex: 4,
  },
  tapShareCalloutTight: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    right: "28%",
    top: "58%",
    width: "42%",
  },
  tapShareTitle: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 12,
    textTransform: "uppercase",
  },
  tapShareBody: {
    color: "#FFFFFF",
    fontFamily: F.bold,
    fontSize: 11,
    lineHeight: 14,
  },
  tiktokShareSheet: {
    backgroundColor: "#1B1B1D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    gap: 7,
    left: 0,
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 6,
    position: "absolute",
    right: 0,
    zIndex: 6,
  },
  shareSheetHandle: {
    alignSelf: "center",
    backgroundColor: "#404043",
    borderRadius: 999,
    height: 4,
    marginBottom: -2,
    width: 42,
  },
  shareSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: -2,
  },
  shareSheetTitle: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 18,
  },
  shareContactRow: {
    flexDirection: "row",
    gap: 11,
    marginTop: -2,
  },
  shareContact: {
    alignItems: "center",
    flex: 1,
    gap: 5,
  },
  shareContactAvatar: {
    alignItems: "center",
    backgroundColor: "#37373A",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  shareContactInitial: {
    color: "#FFFFFF",
    fontFamily: F.black,
    fontSize: 15,
  },
  shareContactName: {
    color: "#E8E8E8",
    fontFamily: F.medium,
    fontSize: 10,
    maxWidth: 56,
  },
  shareAppRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: -2,
  },
  shareAppButton: {
    alignItems: "center",
    flex: 1,
    gap: 5,
  },
  shareAppIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  shareAppText: {
    color: "#E8E8E8",
    fontFamily: F.medium,
    fontSize: 10,
    lineHeight: 12,
    minHeight: 16,
    textAlign: "center",
  },
  fitfoShareButton: {
    alignItems: "center",
    flex: 1,
    gap: 5,
  },
  fitfoShareIcon: {
    alignItems: "center",
    backgroundColor: "#050505",
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    overflow: "hidden",
    width: 52,
  },
  fitfoShareLogoImage: {
    height: 52,
    width: 52,
  },
  fitfoShareText: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 11,
  },
  fitfoPrompt: {
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: F.bold,
    fontSize: 12,
    textAlign: "center",
  },
  importBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  importOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.68)",
    justifyContent: "center",
    zIndex: 8,
  },
  importModal: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.accentBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 18,
    width: "78%",
  },
  importTitle: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 19,
    textAlign: "center",
  },
  importBody: {
    color: colors.textSecondary,
    fontFamily: F.medium,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  importPulseRow: {
    flexDirection: "row",
    gap: 6,
    paddingTop: 2,
  },
  importPulseDot: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  importPulseDotHot: {
    backgroundColor: colors.accent,
    width: 20,
  },
  importedWorkoutSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.stepBackground,
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    position: "absolute",
    zIndex: 7,
  },
  importedTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  importedRoundButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  importedCoachButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
  },
  importedLogo: {
    borderRadius: 10,
    height: 34,
    width: 34,
  },
  importedWorkoutContent: {
    flex: 1,
    gap: 7,
  },
  importedHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  importedKicker: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  importedStatusPill: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  importedStatusText: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 9,
  },
  importedTitle: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 24,
    lineHeight: 27,
  },
  importedSubtitle: {
    color: colors.textSecondary,
    fontFamily: F.medium,
    fontSize: 10,
    lineHeight: 13,
  },
  originalReelPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  originalReelText: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 10,
  },
  importedTimerCard: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 17,
    gap: 2,
    marginTop: 2,
    paddingVertical: 9,
  },
  importedTimerLabel: {
    color: colors.onAccent,
    fontFamily: F.black,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  importedTimerValue: {
    color: colors.onAccent,
    fontFamily: F.black,
    fontSize: 30,
    lineHeight: 34,
  },
  importedTimerMeta: {
    color: colors.onAccent,
    fontFamily: F.bold,
    fontSize: 10,
  },
  importedExerciseList: {
    paddingBottom: 8,
    gap: 8,
  },
  importedExerciseScroll: {
    flex: 1,
    minHeight: 96,
  },
  importedExerciseCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 51,
    paddingHorizontal: 10,
  },
  importedExerciseIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    height: 35,
    justifyContent: "center",
    width: 35,
  },
  importedExerciseCopy: {
    flex: 1,
    gap: 2,
  },
  importedExerciseName: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 14,
    lineHeight: 18,
  },
  importedExerciseSub: {
    color: colors.textSecondary,
    fontFamily: F.bold,
    fontSize: 10,
  },
  importedSetPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  importedTrash: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorderStrong,
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  tryAgainButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 2,
    minHeight: 40,
  },
  tryAgainText: {
    color: colors.onAccent,
    fontFamily: F.black,
    fontSize: 16,
  },
  featureCard: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  coachDemoCard: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 0,
    // stepSlide uses paddingHorizontal 24; bleed so the screenshot reads wider.
    marginHorizontal: -24,
    padding: 0,
  },
  coachDemoFrame: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  coachDemoImage: {
    height: "100%",
    width: "100%",
  },
  calendarRow: {
    flexDirection: "row",
    gap: 6,
  },
  calendarDay: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  calendarDayTight: {
    minHeight: 50,
    borderRadius: 12,
  },
  calendarDayActive: {
    backgroundColor: colors.accent,
  },
  calendarText: {
    color: colors.textSecondary,
    fontFamily: F.black,
    fontSize: 10,
  },
  calendarDate: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 18,
    marginTop: 2,
  },
  calendarTextActive: {
    color: colors.onAccent,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: 14,
  },
  eventBadge: {
    color: colors.accent,
    fontFamily: F.black,
    fontSize: 10,
    letterSpacing: 1,
  },
  statCards: {
    flexDirection: "row",
    gap: 10,
  },
  smallStat: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 16,
  },
  smallStatValue: {
    color: colors.text,
    fontFamily: F.black,
    fontSize: 34,
    marginTop: 6,
  },
  orangeText: {
    color: colors.accent,
  },
  chart: {
    height: 110,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 16,
  },
  chartBar: {
    flex: 1,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  chartBarHot: {
    backgroundColor: colors.accent,
  },
  authSlideScroll: {
    backgroundColor: colors.authBackground,
    flex: 1,
  },
  authSlideScrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingBottom: 36,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === "ios" ? 56 : 36,
  },
  authSlideMain: {
    flexShrink: 0,
  },
  authTitle: {
    color: colors.text,
    fontFamily: F.display,
    fontSize: 52,
    letterSpacing: -1.6,
    lineHeight: 52,
  },
  authDot: {
    color: colors.accent,
    fontFamily: F.display,
  },
  authSub: {
    color: colors.textSecondary,
    fontFamily: F.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  tabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    flexDirection: "row",
    marginTop: 24,
    padding: 4,
  },
  tab: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.textMuted,
    fontFamily: F.extraBold,
    fontSize: 14,
  },
  tabTextActive: {
    color: colors.onAccent,
  },
  authCard: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderColor: colors.border,
    borderWidth: 1,
    gap: 16,
    marginTop: 20,
    padding: 22,
  },
  orRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  orLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  orText: {
    color: colors.textMuted,
    fontFamily: F.extraBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  fieldGroup: {
    gap: 7,
  },
  fieldShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  fieldInput: {
    color: colors.text,
    flex: 1,
    fontFamily: F.bold,
    fontSize: 16,
  },
  noticeCard: {
    backgroundColor: colors.noticeSoft,
    borderRadius: 14,
    padding: 14,
  },
  noticeText: {
    color: colors.accent,
    fontFamily: F.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: colors.errorSoft,
    borderRadius: 14,
    padding: 14,
  },
  errorText: {
    color: colors.error,
    fontFamily: F.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  submitBtn: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: colors.buttonText,
    fontFamily: F.black,
    fontSize: 17,
    letterSpacing: 0.3,
  },
  legal: {
    color: colors.textFaint,
    fontFamily: F.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textAlign: "center",
    textTransform: "uppercase",
  },
  });
}
