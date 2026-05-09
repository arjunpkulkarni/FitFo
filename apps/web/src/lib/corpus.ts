/**
 * Typed client for the /admin/corpus/* endpoints.
 *
 * Every request goes through the FastAPI backend at NEXT_PUBLIC_API_URL.
 * The admin endpoints are gated server-side by CORPUS_ADMIN_ENABLED=1; if
 * that's not set, every call returns 503 with `detail`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ChunkApprovalStatus =
  | "pending"
  | "needs_review"
  | "approved"
  | "rejected";

export type ChunkType =
  | "tip"
  | "cue"
  | "programming"
  | "form"
  | "mindset"
  | "nutrition"
  | "other";

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
] as const;

export const GOALS = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "endurance",
  "mobility",
  "mindset",
  "recovery",
] as const;

export const CHUNK_TYPES: ChunkType[] = [
  "tip",
  "cue",
  "programming",
  "form",
  "mindset",
  "nutrition",
  "other",
];

export interface ContentChunk {
  id: string;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  chunk_type: ChunkType | null;
  exercise: string[];
  muscle_group: string[];
  equipment: string[];
  goal: string[];
  approval_status: ChunkApprovalStatus;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  content_sources?: {
    original_url: string;
    creator_id: string;
  };
}

export interface ContentSource {
  id: string;
  creator_id: string;
  platform: string;
  platform_video_id: string;
  original_url: string;
  caption: string | null;
  transcript: string | null;
  transcript_model: string | null;
  transcript_language: string | null;
  processed_status: string;
  approval_status: string;
  error: string | null;
  apify_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface IngestCreatorResponse {
  creator_id: string;
  discovered: number;
  new_sources: number;
  skipped_no_url: number;
  transcribed: number | null;
  chunks_inserted: number | null;
  chunks_tagged: number | null;
  chunks_embedded: number | null;
}

export class CorpusApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CorpusApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      message = parsed.detail || message;
    } catch {
      if (body) message = body;
    }
    throw new CorpusApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function listChunks(
  status: ChunkApprovalStatus[] = ["pending"],
  limit = 50,
  offset = 0,
): Promise<{ items: ContentChunk[]; limit: number; offset: number }> {
  const params = new URLSearchParams({
    status: status.join(","),
    limit: String(limit),
    offset: String(offset),
  });
  return request(`/admin/corpus/chunks?${params.toString()}`);
}

export interface ChunkReviewBody {
  action: "approve" | "reject" | "needs_review";
  chunk_text?: string;
  chunk_type?: ChunkType | null;
  exercise?: string[];
  muscle_group?: string[];
  equipment?: string[];
  goal?: string[];
  reviewer_notes?: string | null;
}

export async function reviewChunk(
  chunkId: string,
  body: ChunkReviewBody,
): Promise<ContentChunk> {
  return request<ContentChunk>(`/admin/corpus/chunks/${chunkId}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface BulkChunkReviewBody {
  action: "approve" | "reject" | "needs_review";
  ids: string[];
  reviewer_notes?: string | null;
}

export async function bulkReviewChunks(
  body: BulkChunkReviewBody,
): Promise<{ updated: number }> {
  return request<{ updated: number }>(`/admin/corpus/chunks/bulk-review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function ingestCreator(args: {
  handle: string;
  results_per_page?: number;
  run_full_pipeline?: boolean;
}): Promise<IngestCreatorResponse> {
  return request<IngestCreatorResponse>(`/admin/corpus/ingest-creator`, {
    method: "POST",
    body: JSON.stringify({
      handle: args.handle,
      results_per_page: args.results_per_page ?? 100,
      run_full_pipeline: args.run_full_pipeline ?? true,
    }),
  });
}

export async function listSources(
  creator_id?: string,
  processed_status?: string,
  limit = 100,
): Promise<{ items: ContentSource[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (creator_id) params.set("creator_id", creator_id);
  if (processed_status) params.set("processed_status", processed_status);
  return request(`/admin/corpus/sources?${params.toString()}`);
}

export async function getSource(
  sourceId: string,
): Promise<{ source: ContentSource; chunks: ContentChunk[] }> {
  return request(`/admin/corpus/sources/${sourceId}`);
}
