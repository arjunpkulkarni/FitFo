/**
 * Typed client for the /chat endpoint.
 *
 * Same backend gate as the corpus admin endpoints: when
 * CORPUS_ADMIN_ENABLED is not set on the API, /chat returns 503.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export interface ChatResponse {
  answer: string;
  /** Always empty; user-facing coach hides source chips. */
  citations: ChatCitation[];
  retrieval: RetrievedChunk[];
  model: string;
}

export interface ChatRequestBody {
  message: string;
  history?: ChatTurn[];
  creator_id?: string;
  muscle_groups?: string[];
  goals?: string[];
  top_k?: number;
}

export class ChatApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
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
  return res.json() as Promise<ChatResponse>;
}
