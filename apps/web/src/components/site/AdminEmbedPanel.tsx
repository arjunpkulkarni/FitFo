"use client";

import type { ReactNode } from "react";

import {
  isHttpsUrl,
  isPosthogEmbedUrl,
} from "@/lib/embedUrl";

export function envFlagTruthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function AdminEmbedPanel({
  title,
  subtitle,
  embedUrl,
  openUrl,
  emptyBody,
  hostLabel,
}: {
  title: string;
  subtitle: string;
  embedUrl: string | null;
  openUrl: string | null;
  emptyBody: ReactNode;
  hostLabel: string;
}) {
  return (
    <section className="flex min-h-[min(56vh,520px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border-soft bg-surface-muted/60 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-bold text-text-primary sm:text-xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          </div>
          {openUrl && isHttpsUrl(openUrl) ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 rounded-full border border-border-soft bg-surface-raised px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-primary/40 hover:text-primary"
            >
              Open in {hostLabel}
            </a>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-black/40">
        {embedUrl ? (
          <iframe
            title={title}
            src={embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            {emptyBody}
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminExternalTile({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group rounded-2xl border border-border bg-surface-muted/80 p-5 transition-colors hover:border-primary/35 hover:bg-surface-raised"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Open
      </p>
      <p
        className="mt-2 text-lg font-bold text-text-primary"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
        <span className="ml-1 inline-block text-primary transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        {description}
      </p>
    </a>
  );
}

export function resolvePosthogEmbedUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return isHttpsUrl(trimmed) && isPosthogEmbedUrl(trimmed) ? trimmed : null;
}
