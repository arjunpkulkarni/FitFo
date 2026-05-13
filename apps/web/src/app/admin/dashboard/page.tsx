"use client";

import Image from "next/image";
import Link from "next/link";

import {
  APP_STORE_ID,
  APP_STORE_URL,
  SITE_LOGO_SRC,
} from "@/lib/siteUrls";

import {
  isHttpsUrl,
  isPosthogEmbedUrl,
} from "@/lib/embedUrl";

function envFlagTruthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function ExternalTile({
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

function EmbedPanel({
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
  emptyBody: React.ReactNode;
  hostLabel: string;
}) {
  return (
    <section className="flex min-h-[min(70vh,720px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
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
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            {emptyBody}
          </div>
        )}
      </div>
    </section>
  );
}

export default function AppHealthDashboardPage() {
  const enabled = envFlagTruthy(
    process.env.NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED,
  );
  const corpusAdmin = envFlagTruthy(
    process.env.NEXT_PUBLIC_CORPUS_ADMIN_ENABLED,
  );

  const posthogEmbedRaw =
    process.env.NEXT_PUBLIC_POSTHOG_DASHBOARD_EMBED_URL?.trim() ?? "";
  const shotEmbedRaw =
    process.env.NEXT_PUBLIC_SHOT_DASHBOARD_EMBED_URL?.trim() ?? "";
  const posthogOpen =
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_URL?.trim() ?? "";
  const shotOpen = process.env.NEXT_PUBLIC_SHOT_DASHBOARD_URL?.trim() ?? "";
  const expoOpen = process.env.NEXT_PUBLIC_EXPO_PROJECT_URL?.trim() ?? "";

  const posthogEmbed =
    isHttpsUrl(posthogEmbedRaw) && isPosthogEmbedUrl(posthogEmbedRaw)
      ? posthogEmbedRaw
      : null;
  const shotEmbed =
    isHttpsUrl(shotEmbedRaw) ? shotEmbedRaw : null;

  const ascMetrics = `https://appstoreconnect.apple.com/apps/${APP_STORE_ID}/distribution/metrics`;

  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1
          className="text-3xl font-bold text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          App health dashboard
        </h1>
        <p className="mt-4 text-text-secondary">
          Set{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-sm text-primary-soft-text">
            NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED=1
          </code>{" "}
          in <code className="rounded bg-surface-muted px-1.5 py-0.5 text-sm">apps/web/.env</code>{" "}
          to enable this page (and configure PostHog / Shot embed URLs below).
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-6 border-b border-border-soft pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <Image
            src={SITE_LOGO_SRC}
            alt=""
            width={48}
            height={48}
            className="mt-0.5 rounded-xl"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Internal
            </p>
            <h1
              className="mt-1 text-3xl font-bold text-text-primary sm:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              App health
            </h1>
            <p className="mt-2 max-w-xl text-sm text-text-secondary">
              Product analytics (PostHog) and your Shot workspace side by side.
              Embeds use public share links only—never paste private API keys
              here.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {corpusAdmin ? (
            <Link
              href="/admin/review"
              className="rounded-full border border-border-soft bg-surface-muted px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary/35"
            >
              Corpus review
            </Link>
          ) : null}
          <Link
            href="/"
            className="rounded-full border border-border-soft bg-surface-muted px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border hover:text-text-primary"
          >
            Marketing site
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <EmbedPanel
          title="PostHog"
          subtitle="Funnels, retention, feature usage, and Apple Search Ads attribution events."
          embedUrl={posthogEmbed}
          openUrl={isHttpsUrl(posthogOpen) ? posthogOpen : null}
          hostLabel="PostHog"
          emptyBody={
            <>
              <p className="max-w-sm text-sm text-text-secondary">
                In PostHog: open a dashboard → <strong>Share</strong> →{" "}
                <strong>Embed</strong>, then paste the HTTPS embed URL into{" "}
                <code className="rounded bg-surface-muted px-1 text-xs">
                  NEXT_PUBLIC_POSTHOG_DASHBOARD_EMBED_URL
                </code>
                . Host must be{" "}
                <code className="rounded bg-surface-muted px-1 text-xs">
                  *.posthog.com
                </code>
                .
              </p>
              {isHttpsUrl(posthogOpen) ? (
                <a
                  href={posthogOpen}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  Open PostHog project →
                </a>
              ) : null}
            </>
          }
        />
        <EmbedPanel
          title="Shot"
          subtitle="Your Shot workspace, status page, or second analytics surface (any HTTPS embed)."
          embedUrl={shotEmbed}
          openUrl={isHttpsUrl(shotOpen) ? shotOpen : null}
          hostLabel="Shot"
          emptyBody={
            <>
              <p className="max-w-sm text-sm text-text-secondary">
                Set{" "}
                <code className="rounded bg-surface-muted px-1 text-xs">
                  NEXT_PUBLIC_SHOT_DASHBOARD_EMBED_URL
                </code>{" "}
                to an iframe-friendly HTTPS URL, or use{" "}
                <code className="rounded bg-surface-muted px-1 text-xs">
                  NEXT_PUBLIC_SHOT_DASHBOARD_URL
                </code>{" "}
                for a quick link tile only.
              </p>
              {isHttpsUrl(shotOpen) ? (
                <a
                  href={shotOpen}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  Open Shot →
                </a>
              ) : null}
            </>
          }
        />
      </div>

      <section className="mt-12">
        <h2
          className="text-lg font-bold text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Quick links
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Opens in a new tab. Does not authenticate you—stay signed into each
          product in your browser.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ExternalTile
            href={
              isHttpsUrl(posthogOpen)
                ? posthogOpen
                : "https://us.posthog.com/"
            }
            title="PostHog project"
            description={
              isHttpsUrl(posthogOpen)
                ? "Your Fitfo workspace (insights, dashboards, replay)."
                : "Set NEXT_PUBLIC_POSTHOG_PROJECT_URL to jump straight into your EU/US project."
            }
          />
          {isHttpsUrl(shotOpen) ? (
            <ExternalTile
              href={shotOpen}
              title="Shot (direct)"
              description="Opens your configured Shot (or partner) dashboard."
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface-muted/40 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                Not linked
              </p>
              <p
                className="mt-2 text-lg font-bold text-text-primary/80"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Shot URL
              </p>
              <p className="mt-1.5 text-sm text-text-secondary">
                Add{" "}
                <code className="rounded bg-surface-muted px-1 text-xs">
                  NEXT_PUBLIC_SHOT_DASHBOARD_URL
                </code>{" "}
                for a one-click shortcut.
              </p>
            </div>
          )}
          <ExternalTile
            href={ascMetrics}
            title="App Store Connect"
            description="Acquisition, crashes (Xcode Organizer), impressions, and version metrics."
          />
          <ExternalTile
            href={APP_STORE_URL}
            title="App Store listing"
            description="Public store page for Fitfo (reviews, ratings, screenshots)."
          />
          <ExternalTile
            href={
              isHttpsUrl(expoOpen)
                ? expoOpen
                : "https://expo.dev/accounts"
            }
            title="Expo / EAS"
            description={
              isHttpsUrl(expoOpen)
                ? "Your linked Expo project (builds, updates, credentials)."
                : "Set NEXT_PUBLIC_EXPO_PROJECT_URL to deep-link your Fitfo project."
            }
          />
        </div>
      </section>
    </main>
  );
}
