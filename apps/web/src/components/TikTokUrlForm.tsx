"use client";

import { useState } from "react";

interface TikTokUrlFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export function TikTokUrlForm({ onSubmit, isLoading }: TikTokUrlFormProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a workout video link…"
          required
          disabled={isLoading}
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="rounded-xl bg-zinc-900 px-6 py-3 text-base font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isLoading ? "Processing…" : "Get Workout"}
        </button>
      </div>
    </form>
  );
}
