/**
 * Mobile client for the /chat endpoint.
 *
 * Same shape as the web client, but mobile sends a structured `workout`
 * snapshot of the user's current/queued session so the in-app coach can
 * answer questions about THIS workout (e.g. "what's my next set?",
 * "should I bump bench?") without needing to retrieve a chunk for every
 * fact.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatCitation {
  index: number;
  chunk_id: string;
  source_url: string;
  snippet: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  source_id: string;
  source_url: string;
  chunk_text: string;
  chunk_type: string | null;
  exercise: string[];
  muscle_group: string[];
  equipment: string[];
  goal: string[];
  similarity: number;
}

export interface WorkoutExerciseContext {
  name: string;
  sets?: number | null;
  reps?: number | null;
  duration_sec?: number | null;
  rest_sec?: number | null;
  notes?: string | null;
  /** Completed sets within this lift (coach sees lift-level progress). */
  sets_completed?: number | null;
}

export interface WorkoutContext {
  title?: string | null;
  description?: string | null;
  workout_type?: string | null;
  muscle_groups?: string[] | null;
  equipment?: string[] | null;
  exercises?: WorkoutExerciseContext[] | null;
  /** Millis since epoch when this training session began (same as active session identity). */
  session_started_at_ms?: number | null;
  elapsed_sec?: number | null;
  timer_paused?: boolean | null;
  completed_set_count?: number | null;
  total_set_count?: number | null;
  /** 1-based exercise index within this workout session. */
  current_exercise_index?: number | null;
  /** Exercise the athlete is treating as primary focus (expanded or next incomplete work). */
  current_exercise_name?: string | null;
  /** 1-based set within the focus exercise (selected row, else next incomplete set). */
  current_set_number?: number | null;
  current_set_target_summary?: string | null;
  /** Typed weight/reps while logging (not necessarily marked complete yet). */
  current_set_logged_summary?: string | null;
  /** Saved/template workout id when the session originated from the library (optional). */
  source_workout_id?: string | null;
  /** Import/job id when the session came from TikTok ingest (optional). */
  source_job_id?: string | null;
  /** Original shared link for this workout (TikTok, Instagram, etc.); drives coach “reference” taps. */
  source_url?: string | null;
}

export interface ChatRequestBody {
  message: string;
  history?: ChatTurn[];
  creator_id?: string;
  muscle_groups?: string[];
  goals?: string[];
  workout?: WorkoutContext | null;
  top_k?: number;
}

export interface ChatResponse {
  answer: string;
  /** Maps to `[N]` in `answer`; use `snippet`/`source_url` for reference UI. */
  citations: ChatCitation[];
  retrieval: RetrievedChunk[];
  model: string;
}

export class ChatApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

export async function sendChatMessage(body: ChatRequestBody): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.detail || message;
    } catch {
      if (raw) message = raw;
    }
    throw new ChatApiError(res.status, message);
  }
  return (await res.json()) as ChatResponse;
}
