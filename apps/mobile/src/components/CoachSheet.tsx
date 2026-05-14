import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ChatApiError,
  ChatCitation,
  ChatTurn,
  WorkoutContext,
  sendChatMessage,
} from "../lib/chat";
import { F } from "../lib/fonts";
import { MarkdownBlock, MarkdownInline, parseMarkdown } from "../lib/markdown";
import { getTheme, radii, type ThemeMode } from "../theme";

export interface CoachChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Populated when the API returns grounding references for this reply. */
  citations?: ChatCitation[];
}

interface CoachSheetProps {
  visible: boolean;
  onClose: () => void;
  workout: WorkoutContext | null;
  messages: CoachChatMessage[];
  setMessages: Dispatch<SetStateAction<CoachChatMessage[]>>;
  themeMode?: ThemeMode;
}

const SUGGESTIONS = [
  "What should I focus on this set?",
  "Cue for the next exercise?",
  "Should I add or drop weight?",
];

function isLikelyTikTokUrl(raw: string): boolean {
  return raw.toLowerCase().includes("tiktok.com");
}

/** Prefer opening the workout’s TikTok reel; fallback to TikTok citations, then original reel / citation URLs. */
function resolveCoachCitationTapUrl(
  workoutSourceUrl: string | null | undefined,
  citationSourceUrl: string | null | undefined,
): string | undefined {
  const w = workoutSourceUrl?.trim();
  const c = citationSourceUrl?.trim();
  const httpW = w?.startsWith("http") ? w : undefined;
  const httpC = c?.startsWith("http") ? c : undefined;
  if (httpW && isLikelyTikTokUrl(httpW)) return httpW;
  if (httpC && isLikelyTikTokUrl(httpC)) return httpC;
  if (httpW) return httpW;
  if (httpC) return httpC;
  return undefined;
}

function clipReferenceSnippet(snippet: string, maxLen: number): string {
  const s = snippet.replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

export default function CoachSheet({
  visible,
  onClose,
  workout,
  messages,
  setMessages,
  themeMode = "dark",
}: CoachSheetProps) {
  const posthog = usePostHog();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();
  /** Modals occasionally read 0 inset; stay clear of the home indicator on tall iPhones. */
  const composerBottomInset = Math.max(
    insets.bottom,
    Platform.OS === "ios" ? 20 : 12,
  );
  const styles = useMemo(
    () => createStyles(theme, composerBottomInset),
    [theme, composerBottomInset],
  );

  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const workoutRef = useRef(workout);
  useEffect(() => {
    workoutRef.current = workout;
  }, [workout]);

  const coachStatusBlink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) {
      coachStatusBlink.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(coachStatusBlink, {
          toValue: 0.28,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(coachStatusBlink, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
      coachStatusBlink.setValue(1);
    };
  }, [visible, coachStatusBlink]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages, pending, visible]);

  const send = async (override?: string) => {
    const trimmed = (override ?? input).trim();
    if (!trimmed || pending) return;
    setError(null);

    const newUser: CoachChatMessage = { role: "user", content: trimmed };
    const updated = [...messages, newUser];
    setMessages(updated);
    setInput("");
    setPending(true);
    posthog.capture("coach_message_sent", { message_index: updated.length - 1, has_workout_context: Boolean(workoutRef.current) });

    const history: ChatTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const result = await sendChatMessage({
        message: trimmed,
        history,
        workout: workoutRef.current ?? undefined,
        top_k: 8,
      });
      setMessages([
        ...updated,
        {
          role: "assistant",
          content: result.answer,
          citations:
            result.citations.length > 0 ? [...result.citations] : undefined,
        },
      ]);
    } catch (exc) {
      if (exc instanceof ChatApiError) {
        setError(exc.message);
      } else if (exc instanceof Error && exc.message) {
        setError(exc.message);
      } else {
        setError("Coach is unavailable right now. Try again in a bit.");
      }
    } finally {
      setPending(false);
    }
  };

  const citationLookup = (
    citations: ChatCitation[] | undefined,
    index: number,
  ): ChatCitation | undefined => citations?.find((c) => c.index === index);

  const renderInline = (
    inlines: MarkdownInline[],
    keyPrefix: string,
    citations: ChatCitation[] | undefined,
  ) =>
    inlines.map((inline, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (inline.kind === "bold") {
        return (
          <Text key={key} style={styles.bold}>
            {inline.value}
          </Text>
        );
      }
      if (inline.kind === "citation") {
        const cite = citationLookup(citations, inline.index);
        const url = resolveCoachCitationTapUrl(
          workoutRef.current?.source_url,
          cite?.source_url,
        );
        const label = `[${inline.index}]`;
        return (
          <Text
            key={key}
            accessibilityHint={url ? "Opens creator source" : undefined}
            accessibilityLabel={`Reference ${inline.index}${url ? ", link" : ""}`}
            accessibilityRole={url ? "link" : "text"}
            onPress={
              url
                ? () => {
                    void Linking.openURL(url);
                  }
                : undefined
            }
            style={[styles.assistantText, url ? styles.citationBadge : styles.citationMutedInline]}
          >
            {label}
          </Text>
        );
      }
      return <Text key={key}>{inline.value}</Text>;
    });

  const renderMarkdown = (
    markdown: string,
    prefix: string,
    citations?: ChatCitation[],
  ) => {
    const blocks: MarkdownBlock[] = parseMarkdown(markdown);
    if (blocks.length === 0) {
      return <Text style={styles.assistantText}>{markdown}</Text>;
    }
    return (
      <View>
        {blocks.map((block, idx) => {
          if (block.kind === "bullet_list") {
            return (
              <View key={`${prefix}-${idx}`} style={styles.bulletList}>
                {block.items.map((item, itemIdx) => (
                  <View key={`${prefix}-${idx}-${itemIdx}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={[styles.assistantText, styles.bulletText]}>
                      {renderInline(item, `${prefix}-${idx}-${itemIdx}`, citations)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <Text
              key={`${prefix}-${idx}`}
              style={[styles.assistantText, idx > 0 ? styles.paragraphGap : null]}
            >
              {renderInline(block.inlines, `${prefix}-${idx}`, citations)}
            </Text>
          );
        })}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Animated.View
                  style={[styles.statusDot, { opacity: coachStatusBlink }]}
                />
                <Text style={styles.headerTitle}>Coach</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.messages}
              contentContainerStyle={[
                styles.messagesContent,
                messages.length === 0 && !pending
                  ? styles.messagesContentIntro
                  : null,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 && !pending && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Ask anything in this workout.</Text>
                  <Text style={styles.emptySub}>
                    Form cues, weight selection, swaps, programming. The coach
                    only answers training-related questions.
                  </Text>
                  <View style={styles.suggestionWrap}>
                    {SUGGESTIONS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => send(s)}
                        style={styles.suggestion}
                        disabled={pending}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {messages.map((message, idx) => {
                if (message.role === "user") {
                  return (
                    <View key={idx} style={styles.userRow}>
                      <View style={styles.userBubble}>
                        <Text style={styles.userText}>{message.content}</Text>
                      </View>
                    </View>
                  );
                }
                const sortedAssistantCitations =
                  message.citations && message.citations.length > 0
                    ? [...message.citations].sort((a, b) => a.index - b.index)
                    : [];
                return (
                  <View key={idx} style={styles.assistantRow}>
                    <View style={styles.assistantBubble}>
                      {renderMarkdown(message.content, `m${idx}`, message.citations)}
                      {sortedAssistantCitations.length > 0 ? (
                        <>
                          <View style={styles.refsDivider} />
                          <Text style={styles.refsHeading}>References</Text>
                          {sortedAssistantCitations.map((cite) => {
                            const tapUrl = resolveCoachCitationTapUrl(
                              workoutRef.current?.source_url,
                              cite.source_url,
                            );
                            const preview = clipReferenceSnippet(cite.snippet ?? "", 200);
                            return (
                              <Pressable
                                key={`m${idx}-ref-${cite.index}`}
                                accessibilityLabel={`Reference ${cite.index}. Open source`}
                                accessibilityRole={tapUrl ? "link" : "button"}
                                disabled={!tapUrl}
                                hitSlop={10}
                                onPress={
                                  tapUrl
                                    ? () => {
                                        posthog.capture("coach_reference_open", {
                                          citation_index: cite.index,
                                        });
                                        void Linking.openURL(tapUrl);
                                      }
                                    : undefined
                                }
                                style={[
                                  styles.refRow,
                                  !tapUrl && styles.refRowDisabled,
                                ]}
                              >
                                <View style={styles.refIndexBadge}>
                                  <Text style={styles.refIndexBadgeText}>
                                    {cite.index}
                                  </Text>
                                </View>
                                <View style={styles.refMiddle}>
                                  <Text style={styles.refSnippetText} numberOfLines={4}>
                                    {preview || cite.source_url || "Creator coaching tip"}
                                  </Text>
                                  {tapUrl ? (
                                    <View style={styles.refOpenRow}>
                                      <Ionicons
                                        color={theme.colors.primary}
                                        name="open-outline"
                                        size={14}
                                      />
                                      <Text style={styles.refOpenLink}>Open reel</Text>
                                    </View>
                                  ) : (
                                    <Text style={styles.refNoLinkText}>No link for this cite</Text>
                                  )}
                                </View>
                              </Pressable>
                            );
                          })}
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {pending && (
                <View style={styles.assistantRow}>
                  <View style={styles.assistantBubble}>
                    <View style={styles.thinking}>
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.textSecondary}
                      />
                      <Text style={styles.thinkingText}>Thinking…</Text>
                    </View>
                  </View>
                </View>
              )}

              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask the coach…"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                editable={!pending}
                multiline
                onSubmitEditing={() => send()}
                returnKeyType="send"
                blurOnSubmit
              />
              <Pressable
                onPress={() => send()}
                disabled={pending || !input.trim()}
                style={[
                  styles.sendButton,
                  (pending || !input.trim()) && styles.sendButtonDisabled,
                ]}
              >
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>, composerBottomInset: number) {
  const { colors } = theme;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    backdropTouch: {
      ...StyleSheet.absoluteFillObject,
    },
    sheetWrap: {
      width: "100%",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingBottom: 0,
      minHeight: "52%",
      maxHeight: "96%",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
    },
    handle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 8,
      marginBottom: 4,
      opacity: 0.7,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 12,
    },
    headerTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontFamily: F.bold,
      letterSpacing: -0.2,
    },
    closeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    messages: {
      flex: 1,
    },
    messagesContent: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 10,
    },
    /** Without chat history we don't consume the full viewport — tighter intro layout. */
    messagesContentIntro: {
      flexGrow: 0,
      justifyContent: "flex-start",
      paddingBottom: 12,
    },
    emptyState: {
      paddingVertical: 6,
      gap: 8,
      width: "100%",
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: F.semiBold,
      letterSpacing: -0.1,
    },
    emptySub: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: F.regular,
    },
    suggestionWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 6,
    },
    suggestion: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.borderSoft,
      borderWidth: 1,
    },
    suggestionText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontFamily: F.medium,
    },
    userRow: {
      alignItems: "flex-end",
    },
    userBubble: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 18,
      borderTopRightRadius: 6,
      maxWidth: "85%",
    },
    userText: {
      color: "#FFFFFF",
      fontSize: 14,
      lineHeight: 20,
      fontFamily: F.medium,
    },
    assistantRow: {
      alignItems: "flex-start",
      gap: 6,
      width: "100%",
    },
    assistantBubble: {
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 18,
      borderTopLeftRadius: 6,
      alignSelf: "stretch",
      maxWidth: "100%",
    },
    assistantText: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: F.regular,
    },
    paragraphGap: {
      marginTop: 8,
    },
    bulletList: {
      gap: 4,
      marginTop: 4,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    bulletDot: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: F.regular,
    },
    bulletText: {
      flex: 1,
    },
    bold: {
      color: colors.textPrimary,
      fontFamily: F.bold,
    },
    citationBadge: {
      color: colors.primaryBright,
      fontFamily: F.bold,
      textDecorationLine: "underline",
    },
    citationMutedInline: {
      color: colors.textMuted,
      fontFamily: F.medium,
    },
    refsDivider: {
      marginTop: 12,
      marginBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
    },
    refsHeading: {
      color: colors.textMuted,
      fontFamily: F.bold,
      fontSize: 11,
      letterSpacing: 0.14,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    refRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 8,
      borderRadius: radii.medium,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      marginBottom: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    refRowDisabled: {
      opacity: 0.92,
    },
    refIndexBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: colors.surfaceStrong,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    refIndexBadgeText: {
      color: colors.textPrimary,
      fontFamily: F.bold,
      fontSize: 12,
    },
    refMiddle: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    refSnippetText: {
      color: colors.textSecondary,
      fontFamily: F.regular,
      fontSize: 12,
      lineHeight: 17,
    },
    refOpenRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
    },
    refOpenLink: {
      color: colors.primary,
      fontFamily: F.bold,
      fontSize: 12,
    },
    refNoLinkText: {
      color: colors.textMuted,
      fontFamily: F.medium,
      fontSize: 11,
    },
    thinking: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    thinkingText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: F.medium,
    },
    errorBanner: {
      backgroundColor: colors.errorSoft,
      borderColor: colors.error,
      borderWidth: 1,
      borderRadius: radii.small,
      padding: 10,
    },
    errorText: {
      color: colors.error,
      fontSize: 12,
      fontFamily: F.medium,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: composerBottomInset + 2,
      flexShrink: 0,
      borderTopColor: colors.borderSoft,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: colors.textPrimary,
      fontSize: 14,
      maxHeight: 120,
      fontFamily: F.regular,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: {
      backgroundColor: colors.border,
      opacity: 0.6,
    },
  });
}
