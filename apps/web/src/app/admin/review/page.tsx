"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CHUNK_TYPES,
  ChunkType,
  ContentChunk,
  CorpusApiError,
  GOALS,
  MUSCLE_GROUPS,
  bulkReviewChunks,
  ingestCreator,
  listChunks,
  reviewChunk,
} from "@/lib/corpus";

const ADMIN_ENABLED =
  process.env.NEXT_PUBLIC_CORPUS_ADMIN_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_CORPUS_ADMIN_ENABLED === "true";

const APP_HEALTH_DASHBOARD_ENABLED =
  process.env.NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED === "true";

type StatusFilter = "pending" | "needs_review" | "approved" | "rejected";

type Edits = {
  chunk_text: string;
  chunk_type: ChunkType | "";
  exercise: string;
  muscle_group: string[];
  equipment: string;
  goal: string[];
};

function chunkToEdits(chunk: ContentChunk): Edits {
  return {
    chunk_text: chunk.chunk_text,
    chunk_type: (chunk.chunk_type ?? "") as Edits["chunk_type"],
    exercise: chunk.exercise.join(", "),
    muscle_group: [...chunk.muscle_group],
    equipment: chunk.equipment.join(", "),
    goal: [...chunk.goal],
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

function chipClass(active: boolean): string {
  return [
    "rounded-full px-3 py-1 text-xs font-medium transition cursor-pointer select-none",
    active
      ? "bg-primary-soft text-primary-soft-text border border-primary-bright/40"
      : "bg-surface-muted text-text-secondary border border-border hover:border-border-soft",
  ].join(" ");
}

export default function AdminReviewPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [chunks, setChunks] = useState<ContentChunk[]>([]);
  const [editsById, setEditsById] = useState<Record<string, Edits>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<"approve" | "reject" | null>(null);

  // Ingest panel
  const [ingestHandle, setIngestHandle] = useState("jacoboestreichercoaching");
  const [ingestLimit, setIngestLimit] = useState(50);
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestSummary, setIngestSummary] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listChunks([statusFilter], 50, 0);
      setChunks(result.items);
      const edits: Record<string, Edits> = {};
      for (const chunk of result.items) edits[chunk.id] = chunkToEdits(chunk);
      setEditsById(edits);
    } catch (exc) {
      setError(exc instanceof CorpusApiError ? exc.message : String(exc));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!ADMIN_ENABLED) return;
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => ({ visible: chunks.length }), [chunks]);

  if (!ADMIN_ENABLED) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-3xl font-bold">Admin disabled</h1>
        <p className="mt-4 text-text-secondary">
          Set <code className="rounded bg-surface-muted px-1">NEXT_PUBLIC_CORPUS_ADMIN_ENABLED=1</code>{" "}
          in <code className="rounded bg-surface-muted px-1">apps/web/.env</code> to enable this
          page.
        </p>
      </main>
    );
  }

  const handleEdit = (chunkId: string, patch: Partial<Edits>) => {
    setEditsById((prev) => ({
      ...prev,
      [chunkId]: { ...prev[chunkId], ...patch },
    }));
  };

  const toggleArrayValue = (
    chunkId: string,
    field: "muscle_group" | "goal",
    value: string,
  ) => {
    setEditsById((prev) => {
      const existing = prev[chunkId];
      if (!existing) return prev;
      const current = existing[field];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [chunkId]: { ...existing, [field]: next } };
    });
  };

  const submitReview = async (
    chunk: ContentChunk,
    action: "approve" | "reject" | "needs_review",
  ) => {
    const edits = editsById[chunk.id];
    if (!edits) return;
    setActionPendingId(chunk.id);
    setError(null);
    try {
      await reviewChunk(chunk.id, {
        action,
        chunk_text: edits.chunk_text.trim(),
        chunk_type: edits.chunk_type === "" ? null : edits.chunk_type,
        exercise: splitCsv(edits.exercise),
        muscle_group: edits.muscle_group,
        equipment: splitCsv(edits.equipment),
        goal: edits.goal,
      });
      setChunks((prev) => prev.filter((c) => c.id !== chunk.id));
    } catch (exc) {
      setError(exc instanceof CorpusApiError ? exc.message : String(exc));
    } finally {
      setActionPendingId(null);
    }
  };

  const submitBulk = async (action: "approve" | "reject") => {
    if (chunks.length === 0 || bulkRunning) return;
    const verb = action === "approve" ? "approve" : "reject";
    if (
      !window.confirm(
        `${verb[0].toUpperCase()}${verb.slice(1)} all ${chunks.length} visible chunks?`,
      )
    ) {
      return;
    }
    setBulkRunning(action);
    setError(null);
    try {
      const ids = chunks.map((c) => c.id);
      const result = await bulkReviewChunks({ action, ids });
      setChunks([]);
      setEditsById({});
      // Surface the count via the existing error/info channel (cheap and
      // doesn't require a new banner component.
      setError(null);
      console.info(`bulk ${action}: ${result.updated} updated`);
    } catch (exc) {
      setError(exc instanceof CorpusApiError ? exc.message : String(exc));
    } finally {
      setBulkRunning(null);
    }
  };

  const triggerIngest = async () => {
    if (!ingestHandle.trim()) return;
    setIngestRunning(true);
    setIngestSummary(null);
    setIngestError(null);
    try {
      const result = await ingestCreator({
        handle: ingestHandle.trim(),
        results_per_page: ingestLimit,
        run_full_pipeline: true,
      });
      setIngestSummary(
        `discovered ${result.discovered} · new ${result.new_sources} · transcribed ${
          result.transcribed ?? 0
        } · chunks +${result.chunks_inserted ?? 0} · tagged ${
          result.chunks_tagged ?? 0
        } · embedded ${result.chunks_embedded ?? 0}`,
      );
      await refresh();
    } catch (exc) {
      setIngestError(exc instanceof CorpusApiError ? exc.message : String(exc));
    } finally {
      setIngestRunning(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Corpus review</h1>
        <p className="mt-2 text-text-secondary">
          Approve, reject, or edit creator chunks before they enter retrieval.
        </p>
        {APP_HEALTH_DASHBOARD_ENABLED ? (
          <p className="mt-3 text-sm">
            <Link
              href="/admin/dashboard"
              className="font-medium text-primary hover:underline"
            >
              App health dashboard →
            </Link>{" "}
            <span className="text-text-muted">PostHog · Shot · store links</span>
          </p>
        ) : null}
      </header>

      <section className="mb-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-display text-lg font-semibold">Ingest creator</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm text-text-secondary">
            TikTok handle
            <input
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary outline-none focus:border-primary-bright"
              value={ingestHandle}
              onChange={(e) => setIngestHandle(e.target.value)}
              placeholder="jacoboestreichercoaching"
              disabled={ingestRunning}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary sm:w-32">
            Videos
            <input
              type="number"
              min={1}
              max={1000}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary outline-none focus:border-primary-bright"
              value={ingestLimit}
              onChange={(e) => setIngestLimit(Number(e.target.value) || 50)}
              disabled={ingestRunning}
            />
          </label>
          <button
            onClick={triggerIngest}
            disabled={ingestRunning}
            className="cta-lift rounded-lg bg-primary px-4 py-2 font-medium text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ingestRunning ? "Ingesting…" : "Ingest"}
          </button>
        </div>
        {ingestSummary && (
          <p className="mt-3 text-sm text-text-secondary">{ingestSummary}</p>
        )}
        {ingestError && (
          <p className="mt-3 text-sm text-red-400">Error: {ingestError}</p>
        )}
        <p className="mt-3 text-xs text-text-muted">
          Ingestion runs the full pipeline (Apify → transcribe → chunk → tag → embed) inline. For
          large crawls, prefer the CLI: <code>python -m app.scripts.ingest_creator …</code>
        </p>
      </section>

      <section className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-text-secondary">Filter:</span>
        {(["pending", "needs_review", "approved", "rejected"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={chipClass(statusFilter === status)}
          >
            {status}
          </button>
        ))}
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto rounded-lg border border-border px-3 py-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className="text-sm text-text-muted">{counts.visible} chunks</span>
      </section>

      {chunks.length > 0 && (
        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-sm text-text-secondary">
            Bulk action on the {chunks.length} visible chunks:
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => submitBulk("approve")}
              disabled={bulkRunning !== null}
              className="cta-lift rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:opacity-50"
            >
              {bulkRunning === "approve" ? "Approving…" : `Approve all ${chunks.length}`}
            </button>
            <button
              onClick={() => submitBulk("reject")}
              disabled={bulkRunning !== null}
              className="rounded-lg bg-red-700/80 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {bulkRunning === "reject" ? "Rejecting…" : `Reject all ${chunks.length}`}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-700/60 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {chunks.length === 0 && !loading && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-text-secondary">
          No chunks at status <code>{statusFilter}</code>.
        </div>
      )}

      <ul className="space-y-4">
        {chunks.map((chunk) => {
          const edits = editsById[chunk.id];
          if (!edits) return null;
          const sourceUrl = chunk.content_sources?.original_url;
          const isPending = actionPendingId === chunk.id;
          return (
            <li
              key={chunk.id}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                <span>
                  chunk #{chunk.chunk_index} ·{" "}
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-soft-text underline-offset-2 hover:underline"
                    >
                      open source
                    </a>
                  ) : (
                    "no source url"
                  )}
                </span>
                <span>{chunk.id}</span>
              </div>

              <textarea
                className="min-h-[120px] w-full resize-y rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary outline-none focus:border-primary-bright"
                value={edits.chunk_text}
                onChange={(e) => handleEdit(chunk.id, { chunk_text: e.target.value })}
                disabled={isPending}
              />

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  chunk_type
                  <select
                    className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary"
                    value={edits.chunk_type}
                    onChange={(e) =>
                      handleEdit(chunk.id, {
                        chunk_type: e.target.value as Edits["chunk_type"],
                      })
                    }
                    disabled={isPending}
                  >
                    <option value="">(none)</option>
                    {CHUNK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  exercise (comma-separated)
                  <input
                    className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary"
                    value={edits.exercise}
                    onChange={(e) => handleEdit(chunk.id, { exercise: e.target.value })}
                    disabled={isPending}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  equipment (comma-separated)
                  <input
                    className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-text-primary"
                    value={edits.equipment}
                    onChange={(e) => handleEdit(chunk.id, { equipment: e.target.value })}
                    disabled={isPending}
                  />
                </label>

                <div className="flex flex-col gap-1 text-sm text-text-secondary">
                  muscle_group
                  <div className="flex flex-wrap gap-2">
                    {MUSCLE_GROUPS.map((mg) => (
                      <button
                        key={mg}
                        type="button"
                        onClick={() => toggleArrayValue(chunk.id, "muscle_group", mg)}
                        className={chipClass(edits.muscle_group.includes(mg))}
                        disabled={isPending}
                      >
                        {mg}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-sm text-text-secondary">
                  goal
                  <div className="flex flex-wrap gap-2">
                    {GOALS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleArrayValue(chunk.id, "goal", g)}
                        className={chipClass(edits.goal.includes(g))}
                        disabled={isPending}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => submitReview(chunk, "approve")}
                  disabled={isPending}
                  className="cta-lift rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => submitReview(chunk, "needs_review")}
                  disabled={isPending}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  Needs review
                </button>
                <button
                  onClick={() => submitReview(chunk, "reject")}
                  disabled={isPending}
                  className="rounded-lg bg-red-700/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  Reject
                </button>
                {isPending && (
                  <span className="self-center text-sm text-text-muted">working…</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
