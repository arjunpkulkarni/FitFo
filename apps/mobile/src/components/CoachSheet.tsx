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
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const workoutRef = useRef(workout);
  useEffect(() => {
    workoutRef.current = workout;
  }, [workout]);

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
        const canOpen = Boolean(url);
        if (canOpen && url) {
          return (
            <Text
              accessibilityLabel={`Reference ${inline.index}, opens source`}
              accessibilityRole="link"
              key={key}
              onPress={() => {
                void Linking.openURL(url);
              }}
              style={styles.citationBadge}
            >
              <Ionicons
                name="link"
                size={12}
                color={theme.colors.primaryBright}
              />
              <Text> view here</Text>
            </Text>
          );
        }
        return null;
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
                <View style={styles.statusDot} />
                <Text style={styles.headerTitle}>Personal Coach</Text>
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
              contentContainerStyle={styles.messagesContent}
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
                return (
                  <View key={idx} style={styles.assistantRow}>
                    <View style={styles.assistantBubble}>
                      {renderMarkdown(message.content, `m${idx}`, message.citations)}
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

function createStyles(theme: ReturnType<typeof getTheme>) {
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
      paddingBottom: Platform.OS === "ios" ? 34 : 16,
      minHeight: "65%",
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
      backgroundColor: colors.primary,
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
      fontFamily: F.semiBold,
      fontSize: 13,
      lineHeight: 21,
      textDecorationLine: "underline",
    },
    citationMuted: {
      color: colors.textMuted,
      fontFamily: F.medium,
      fontSize: 13,
      lineHeight: 21,
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
