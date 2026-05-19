import AsyncStorage from "@react-native-async-storage/async-storage";

export type CoachChatMessageLike = {
  role: "user" | "assistant";
  content: string;
  variant?: "feature_feedback";
  citations?: unknown[];
};

const SHOWN_KEY_PREFIX = "@fitfo:coach-feature-feedback-shown:v1:";
const LIFETIME_SENDS_KEY_PREFIX = "@fitfo:coach-user-message-count:v1:";

/** Shown once per account after a qualifying coach interaction. */
export const COACH_FEATURE_FEEDBACK_LINK_LABEL = "Suggest features";

export const COACH_FEATURE_FEEDBACK_MESSAGE =
  "We're building Fitfo to be the best training app it can be, and a lot of that comes from people like you. If there's a feature you wish existed, we'd genuinely love to hear it. Tap your profile icon, hit \"Suggest features,\" and tell us what you're thinking. Our team reviews every suggestion. This is just the beginning, and thanks for trusting us to be part of your training.";

const MISSING_CAPABILITY_PATTERNS: RegExp[] = [
  /\b(can|could|does|do|will)\s+(you|fitfo|the app)\b/i,
  /\b(is there a way to)\b/i,
  /\b(feature|integration|sync|connect)\b/i,
  /\b(wish|hoped|want)\b.{0,48}\b(existed|had|supported?)\b/i,
  /\b(don'?t|doesn'?t)\s+(have|support|offer|include|allow)\b/i,
  /\b(not yet|not available|missing|coming soon)\b/i,
  /\bapple\s*health\b/i,
  /\bgoogle\s*fit\b/i,
  /\b(strava|garmin|whoop|myfitnesspal)\b/i,
  /\bexport\b.{0,24}\b(data|csv)\b/i,
  /\bremind(er)?\b/i,
  /\boffline\b/i,
];

function storageKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`;
}

export function transcriptHasFeatureFeedback(
  messages: CoachChatMessageLike[],
): boolean {
  return messages.some((message) => message.variant === "feature_feedback");
}

export function userMessageImpliesMissingCapability(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return MISSING_CAPABILITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export async function getCoachLifetimeUserMessageCount(
  userId: string,
): Promise<number> {
  const raw = await AsyncStorage.getItem(
    storageKey(LIFETIME_SENDS_KEY_PREFIX, userId),
  );
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function incrementCoachLifetimeUserMessageCount(
  userId: string,
): Promise<number> {
  const next = (await getCoachLifetimeUserMessageCount(userId)) + 1;
  await AsyncStorage.setItem(
    storageKey(LIFETIME_SENDS_KEY_PREFIX, userId),
    String(next),
  );
  return next;
}

export async function hasShownCoachFeatureFeedback(
  userId: string,
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(storageKey(SHOWN_KEY_PREFIX, userId));
  return raw === "1";
}

export async function markCoachFeatureFeedbackShown(userId: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(SHOWN_KEY_PREFIX, userId), "1");
}

export type CoachFeatureFeedbackTrigger =
  | "missing_capability"
  | "lifetime_engagement";

export function resolveCoachFeatureFeedbackTrigger(
  userMessage: string,
  lifetimeUserMessageCount: number,
): CoachFeatureFeedbackTrigger | null {
  if (userMessageImpliesMissingCapability(userMessage)) {
    return "missing_capability";
  }
  if (lifetimeUserMessageCount >= 3) {
    return "lifetime_engagement";
  }
  return null;
}

export async function shouldInjectCoachFeatureFeedback(params: {
  userId: string | null | undefined;
  messages: CoachChatMessageLike[];
  userMessage: string;
  lifetimeUserMessageCount: number;
}): Promise<CoachFeatureFeedbackTrigger | null> {
  const { userId, messages, userMessage, lifetimeUserMessageCount } = params;
  if (!userId) {
    return null;
  }
  if (transcriptHasFeatureFeedback(messages)) {
    return null;
  }
  if (await hasShownCoachFeatureFeedback(userId)) {
    return null;
  }
  return resolveCoachFeatureFeedbackTrigger(
    userMessage,
    lifetimeUserMessageCount,
  );
}

export function buildCoachFeatureFeedbackMessage(): CoachChatMessageLike {
  return {
    role: "assistant",
    variant: "feature_feedback",
    content: COACH_FEATURE_FEEDBACK_MESSAGE,
  };
}
