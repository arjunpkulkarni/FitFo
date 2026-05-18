"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AdminEmbedPanel,
  AdminExternalTile,
  envFlagTruthy,
  resolvePosthogEmbedUrl,
} from "@/components/site/AdminEmbedPanel";
import {
  SITE_LOGO_SRC,
} from "@/lib/siteUrls";

import { isHttpsUrl } from "@/lib/embedUrl";

/**
 * PostHog embed share links — build dashboards in PostHog, then paste each
 * iframe embed URL:
 *   NEXT_PUBLIC_POSTHOG_EMBED_TRIAL_CONVERSION
 *   NEXT_PUBLIC_POSTHOG_EMBED_ACTIVATION
 *   NEXT_PUBLIC_POSTHOG_EMBED_WORKOUT_DROPOFF
 *   NEXT_PUBLIC_POSTHOG_EMBED_PAYWALL
 *   NEXT_PUBLIC_POSTHOG_EMBED_COUNTRY_SOURCE
 *
 * Same host rules as the app health dashboard (*.posthog.com).
 */

const POSTHOG_OPEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_URL?.trim() ?? "";

function embedFromEnv(raw: string | undefined | null) {
  return resolvePosthogEmbedUrl(raw ?? undefined);
}

function EmbedEmpty() {
  return (
    <p className="max-w-md text-sm text-text-secondary">
      In PostHog: open or create a dashboard → <strong>Share</strong> →{" "}
      <strong>Embed</strong>, then set the matching{" "}
      <code className="rounded bg-surface-muted px-1 text-xs">
        NEXT_PUBLIC_POSTHOG_EMBED_*
      </code>{" "}
      variable in{" "}
      <code className="rounded bg-surface-muted px-1 text-xs">
        apps/web/.env
      </code>
      . Host must be <code className="rounded bg-surface-muted px-1 text-xs">*.posthog.com</code>.
    </p>
  );
}

function EventTable({
  rows,
}: {
  rows: ReadonlyArray<{ event: string; notes: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-muted/80 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Intent / breakdown</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-soft text-text-secondary">
          {rows.map((row) => (
            <tr key={row.event} className="bg-surface/60">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] text-primary">
                {row.event}
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const enabled = envFlagTruthy(
    process.env.NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED,
  );

  const trialPaid = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_TRIAL_CONVERSION);
  const activation = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_ACTIVATION);
  const dropoff = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_WORKOUT_DROPOFF);
  const paywall = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_PAYWALL);
  const countrySource = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_COUNTRY_SOURCE);
  const onboarding = embedFromEnv(process.env.NEXT_PUBLIC_POSTHOG_EMBED_ONBOARDING);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1
          className="text-3xl font-bold text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Product analytics
        </h1>
        <p className="mt-4 text-text-secondary">
          Set{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-sm text-primary-soft-text">
            NEXT_PUBLIC_APP_HEALTH_DASHBOARD_ENABLED=1
          </code>{" "}
          in{" "}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-sm">
            apps/web/.env
          </code>{" "}
          to enable internal admin pages.
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
              Product analytics
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Priority PostHog dashboards for trial conversion, activation,
              in-workout drop-off, paywall experiments, and geo / source quality.
              The mobile app sends structured events (see catalog below)—build
              insights &amp; dashboards in PostHog, then paste embed URLs above.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/dashboard"
            className="rounded-full border border-border-soft bg-surface-muted px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary/35"
          >
            App health
          </Link>
          <Link
            href="/"
            className="rounded-full border border-border-soft bg-surface-muted px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border hover:text-text-primary"
          >
            Marketing site
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <AdminEmbedPanel
          title="1 · Trial → paid"
          subtitle="trial_started, subscription lifecycle, refunds, billing. Break down by country, plan period, source, activation."
          embedUrl={trialPaid}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
        <AdminEmbedPanel
          title="2 · Activation"
          subtitle="Import → start → complete; % with 1 workout in 24h; 2 workouts in 7d."
          embedUrl={activation}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
        <AdminEmbedPanel
          title="3 · Workout drop-off"
          subtitle="workout_started → completed; pauses, quit, progress through exercises/sets."
          embedUrl={dropoff}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
        <AdminEmbedPanel
          title="4 · Paywall behavior"
          subtitle="Views, CTA, plan selection, restore, errors; variants & timing vs first import."
          embedUrl={paywall}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
        <AdminEmbedPanel
          title="5 · Country + source quality"
          subtitle="Geo, install/referral source, funnel health by territory—not just downloads."
          embedUrl={countrySource}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
        <AdminEmbedPanel
          title="Onboarding funnel (optional)"
          subtitle="app_opened → signup → OTP → account; parallel to paywall & import start."
          embedUrl={onboarding}
          openUrl={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : null}
          hostLabel="PostHog"
          emptyBody={<EmbedEmpty />}
        />
      </div>

      <section className="mt-14 border-t border-border-soft pt-10">
        <h2
          className="text-xl font-bold text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Mobile event catalog (PostHog)
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          Common properties on many events:{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">app_version</code>,{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">app_build</code>,{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">os_version</code>,{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">device_model</code>,{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">user_country</code>,{" "}
          <code className="rounded bg-surface-muted px-1 text-xs">locale</code>. Core business metric:{" "}
          <strong className="text-text-primary">activated trial users</strong> — started a
          trial and completed ≥1 workout before trial ends (build as insight in PostHog).
        </p>

        <h3 className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-text-muted">
          Subscription &amp; billing
        </h3>
        <div className="mt-3">
          <EventTable
            rows={[
              { event: "trial_started", notes: "Intro/trial began (purchase path)." },
              { event: "trial_cancelled", notes: "User-cancel before conversion (when detectable via RC)." },
              { event: "subscription_started", notes: "Paid or trial subscription became active." },
              { event: "subscription_renewed", notes: "Renewal / period extended (CustomerInfo)." },
              { event: "subscription_expired", notes: "Entitlement lapsed." },
              { event: "billing_issue", notes: "RC billing issue detected." },
              { event: "refund_requested", notes: "Refund path (store / RC signals)." },
            ]}
          />
        </div>

        <h3 className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-text-muted">
          Activation &amp; workouts
        </h3>
        <div className="mt-3">
          <EventTable
            rows={[
              { event: "workout_import_started", notes: "Alias for import pipeline; with source_url." },
              { event: "workout_import_completed", notes: "Parsed plan ready." },
              { event: "workout_started", notes: "Session opened from a routine." },
              { event: "workout_completed", notes: "Logged to server; duration, exercise_count." },
              { event: "second_workout_completed", notes: "Second lifetime completion (retention)." },
            ]}
          />
        </div>

        <h3 className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-text-muted">
          Paywall
        </h3>
        <div className="mt-3">
          <EventTable
            rows={[
              { event: "paywall_viewed", notes: "+ paywall_variant, timing, default_plan, price_shown, imports count." },
              { event: "paywall_cta_tapped", notes: "Primary subscribe CTA." },
              { event: "plan_selected_monthly", notes: "User selected monthly." },
              { event: "plan_selected_annual", notes: "User selected annual." },
              { event: "paywall_closed", notes: "Screen unmounted / dismissed." },
              { event: "restore_purchase_tapped", notes: "Restore tapped." },
              { event: "paywall_error", notes: "Pricing or purchase error." },
            ]}
          />
        </div>

        <h3 className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-text-muted">
          Session (in progress)
        </h3>
        <div className="mt-3">
          <EventTable
            rows={[
              { event: "workout_paused", notes: "Timer pause." },
              { event: "workout_resumed", notes: "Timer resume." },
              { event: "set_completed", notes: "A set confirmed complete." },
              { event: "workout_quit", notes: "Exited active workout without finishing." },
            ]}
          />
        </div>

        <h3 className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-text-muted">
          Onboarding &amp; auth
        </h3>
        <div className="mt-3">
          <EventTable
            rows={[
              { event: "app_opened", notes: "Cold open / foreground bootstrap." },
              { event: "signup_started", notes: "Same session as sign-up flow start." },
              { event: "otp_sent", notes: "SMS code sent." },
              { event: "otp_verified", notes: "Code accepted." },
              { event: "account_created", notes: "New account from phone signup." },
              { event: "onboarding_completed", notes: "Profile onboarding saved." },
            ]}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2
          className="text-lg font-bold text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Quick link
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminExternalTile
            href={isHttpsUrl(POSTHOG_OPEN) ? POSTHOG_OPEN : "https://us.posthog.com/"}
            title="PostHog project"
            description="Build insights from the events above; subscribe to dashboard for email digests."
          />
        </div>
      </section>
    </main>
  );
}
