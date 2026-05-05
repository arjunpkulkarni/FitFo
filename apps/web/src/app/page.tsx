import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { PhoneFrame } from "@/components/site/PhoneFrame";
import { Reveal } from "@/components/site/Reveal";

const APP_STORE_URL = "https://apps.apple.com/app/id6762418380";

/** Shared shell for bento tiles; glass on the site gradient */
const bento =
  "rounded-3xl border border-[var(--border-soft)] bg-[var(--surface)]/78 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition duration-300 hover:border-[var(--primary)]/40";

const FEATURES = [
  {
    eyebrow: "Import",
    title: "Share a video, get a workout",
    copy: "Hit share on any TikTok or Reel and send it straight to Fitfo, the same way you'd send it to a friend. Our AI pulls the audio, reads the on-screen text, and turns it into a clean, structured session.",
    image: "/assets/IMG_4970.PNG",
    imageAlt:
      "Fitfo iOS app screenshot showing a TikTok workout converted into a structured training session",
  },
  {
    eyebrow: "Organize",
    title: "A library that knows what it is",
    copy: "Saved workouts, scheduled sessions, and logged history, each one tagged by muscle group and block so you can find them fast.",
    image: "/assets/IMG_4966.PNG",
    imageAlt:
      "Fitfo workout library with saved fitness videos from TikTok organized by muscle group",
  },
  {
    eyebrow: "Train",
    title: "Edit, follow, log, no friction",
    copy: "Tap any field to change reps, weights, or notes. Start a session, log every set, and the next one opens automatically.",
    image: "/assets/IMG_4967.PNG",
    imageAlt:
      "Fitfo active workout screen logging sets and reps from an imported Instagram Reel plan",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Share a fitness video",
    body: "Hit the share button on any public TikTok or Reel and pick Fitfo. No copy-pasting, no leaving the app you were scrolling.",
  },
  {
    n: "02",
    title: "Our AI does the work",
    body: "Exercises, sets, reps, rest, notes, all extracted into a card you can edit, save, or start immediately.",
  },
  {
    n: "03",
    title: "Train it, log it, repeat",
    body: "Follow the workout in-app, log every set, and come back to the same plan any day of the week.",
  },
];

export default function LandingPage() {
  const [importFeature, organizeFeature, trainFeature] = FEATURES;

  return (
    <>
      <Nav />
      <main id="top" className="flex flex-1 flex-col">
        {/* Hero: editorial top-left alignment, airy padding */}
        <section className="relative isolate min-h-[min(92dvh,52rem)] overflow-hidden lg:min-h-[min(88dvh,56rem)]">
          <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-14 px-4 pb-20 pt-16 text-left sm:gap-16 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-start lg:gap-12 lg:pb-24 lg:pt-24 xl:gap-20 xl:px-10 xl:pt-28">
            <div className="max-w-xl lg:max-w-lg xl:max-w-xl">
              <div
                className="animate-blur-fade-up inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-3 py-1 backdrop-blur-sm"
                style={{ animationDelay: "80ms" }}
              >
                <span
                  aria-hidden
                  className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--primary-bright)]"
                />
                <span
                  className="text-[10px] font-black uppercase tracking-[0.24em] text-white"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Now available on iOS
                </span>
              </div>
              <h1
                className="animate-blur-fade-up mt-6 text-[clamp(2.35rem,5.5vw,3.85rem)] font-bold leading-[0.94] tracking-[-0.042em] text-white [text-shadow:0_1px_32px_rgba(15,12,29,0.35)]"
                style={{
                  fontFamily: "var(--font-display)",
                  animationDelay: "180ms",
                }}
              >
                Turn fitness videos
                <br className="hidden sm:block" /> into workouts{" "}
                <span className="text-[#ffdcc4]">you actually do.</span>
              </h1>
              <p
                className="animate-blur-fade-up mt-6 max-w-md text-[15px] leading-[1.55] text-white/80 text-pretty sm:text-base [text-shadow:0_1px_20px_rgba(15,12,29,0.25)]"
                style={{ animationDelay: "300ms" }}
              >
                See a workout on TikTok or Reels? Share it straight to Fitfo,
                the same way you&apos;d send it to a friend. Our AI parses the
                video, pulls the exercises, sets, and reps, and builds a clean
                workout you can follow, edit, and track.
              </p>

              <div
                className="animate-blur-fade-up mt-8 flex flex-wrap items-center gap-2.5"
                style={{ animationDelay: "420ms" }}
              >
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="cta-lift inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-[13px] font-bold text-white shadow-[0_20px_45px_-15px_rgba(255,90,20,0.6)] hover:bg-[var(--primary-bright)] hover:shadow-[0_24px_55px_-12px_rgba(255,90,20,0.75)]"
                >
                  Download on the App Store
                  <span aria-hidden className="arrow-nudge">
                    →
                  </span>
                </a>
                <Link
                  href="/#demo"
                  className="cta-lift inline-flex min-h-10 items-center justify-center rounded-full border border-white/55 bg-transparent px-6 text-[13px] font-medium text-white transition-colors hover:border-white/90 hover:bg-white/10"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <div className="relative flex justify-center lg:justify-end lg:pt-4">
              <div
                className="animate-blur-fade-up flex w-full max-w-[320px] justify-center sm:max-w-[360px] lg:max-w-none xl:scale-105 xl:origin-top-right"
                style={{ animationDelay: "280ms" }}
              >
                <PhoneFrame
                  src="/assets/IMG_4970.PNG"
                  alt="Fitfo iOS app screenshot showing a TikTok workout converted into a structured training session"
                  width={280}
                  priority
                  float
                  rotate={-3}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Product story: numbered flow sections */}
        <FlowSection
          id="how"
          index="01"
          compactBelowHeader
          eyebrow="How it works"
          title={
            <>
              From <span className="text-[var(--primary)]">scroll</span> to{" "}
              <span className="text-[var(--primary)]">sets</span>, three steps,
              no setup drama.
            </>
          }
          subtitle="Share a public TikTok or Reel, let the AI structure it, then train and log like any serious app."
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            {STEPS.map((step, i) => (
              <Reveal
                key={step.n}
                delay={80 + i * 70}
                variant="scale"
                className={`${bento} p-6 sm:p-7 lg:col-span-4`}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Step {step.n}
                </p>
                <h3
                  className="mt-3 text-lg font-bold tracking-[-0.015em] sm:text-xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {step.body}
                </p>
              </Reveal>
            ))}
          </div>
        </FlowSection>

        <FlowSection
          id="demo"
          index="02"
          eyebrow="Import"
          title={
            <>
              Share a video once.{" "}
              <span className="text-[var(--primary)]">Fitfo</span> builds the
              card.
            </>
          }
          subtitle="Same share sheet you already use. We handle transcription, OCR, and a clean workout you can edit before you train."
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            <Reveal
              delay={120}
              variant="scale"
              className={`${bento} p-6 sm:p-8 lg:col-span-8`}
            >
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-10">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {importFeature.eyebrow}
                  </p>
                  <h3
                    className="mt-3 text-2xl font-bold leading-[1.08] tracking-[-0.025em] sm:text-3xl text-balance"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {importFeature.title}
                  </h3>
                  <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-secondary)] text-pretty sm:text-[15px]">
                    {importFeature.copy}
                  </p>
                </div>
                <div className="flex shrink-0 justify-center lg:justify-end">
                  <PhoneFrame
                    src={importFeature.image}
                    alt={importFeature.imageAlt}
                    width={220}
                    float="slow"
                    rotate={-2}
                  />
                </div>
              </div>
            </Reveal>

            <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-5">
              <Reveal
                delay={140}
                variant="scale"
                className={`${bento} p-6 sm:p-7`}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Platforms
                </p>
                <h3
                  className="mt-2.5 text-lg font-bold tracking-[-0.02em]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  TikTok &amp; Instagram Reels
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  Share from the same sheet you&apos;d use for a friend, with no
                  link hoarding or screen recordings.
                </p>
              </Reveal>
              <Reveal
                delay={200}
                variant="scale"
                className={`${bento} p-6 sm:p-7`}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  How parsing works
                </p>
                <h3
                  className="mt-2.5 text-lg font-bold tracking-[-0.02em]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Audio + on-screen text
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  We transcribe what&apos;s said and read reps shown in-frame,
                  then merge into one structured workout card.
                </p>
              </Reveal>
            </div>
          </div>
        </FlowSection>

        <CoachHighlightSection />

        <FlowSection
          index="03"
          eyebrow="Library & session"
          title={
            <>
              Organize the mess.{" "}
              <span className="text-[var(--primary)]">Train</span> the plan.
            </>
          }
          subtitle="Saved workouts, muscle tags, and a live session view that keeps you moving set to set."
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            <Reveal
              delay={100}
              variant="scale"
              className={`${bento} p-6 sm:p-8 lg:col-span-6`}
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
                <div className="flex flex-1 justify-center sm:justify-start">
                  <PhoneFrame
                    src={organizeFeature.image}
                    alt={organizeFeature.imageAlt}
                    width={200}
                    float="slow"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {organizeFeature.eyebrow}
                  </p>
                  <h3
                    className="mt-3 text-xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-2xl text-balance"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {organizeFeature.title}
                  </h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:text-[14px]">
                    {organizeFeature.copy}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal
              delay={180}
              variant="scale"
              className={`${bento} p-6 sm:p-8 lg:col-span-6`}
            >
              <div className="flex flex-col gap-6 sm:flex-row-reverse sm:items-center sm:gap-8">
                <div className="flex flex-1 justify-center sm:justify-end">
                  <PhoneFrame
                    src={trainFeature.image}
                    alt={trainFeature.imageAlt}
                    width={200}
                    float
                    rotate={2}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {trainFeature.eyebrow}
                  </p>
                  <h3
                    className="mt-3 text-xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-2xl text-balance"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {trainFeature.title}
                  </h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:text-[14px]">
                    {trainFeature.copy}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </FlowSection>

        <FlowSection
          index="04"
          eyebrow="Rhythm"
          title={
            <>
              <span className="text-[var(--primary)]">Schedule</span> the week.{" "}
              <span className="text-[var(--primary)]">Log</span> every rep.
            </>
          }
          subtitle="Calendar for what’s next, archive for what you’ve already crushed, both tied back to the same TikTok or Reel."
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            <Reveal
              variant="scale"
              delay={80}
              className={`${bento} p-6 sm:p-8 lg:col-span-6`}
            >
              <Eyebrow>Calendar</Eyebrow>
              <h3
                className="mt-3 text-xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-2xl text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Schedule the week.{" "}
                <span className="text-[var(--primary)]">Show up to it.</span>
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Drop any saved workout onto a day. Clean view of what&apos;s
                ahead so you stop re-deciding every morning.
              </p>
              <div className="mt-6 flex justify-center">
                <PhoneFrame
                  src="/assets/IMG_4971.PNG"
                  alt="Fitfo training calendar showing scheduled workouts imported from Instagram Reels"
                  width={200}
                  float="slow"
                />
              </div>
            </Reveal>

            <Reveal
              variant="scale"
              delay={140}
              className={`${bento} p-6 sm:p-8 lg:col-span-6`}
            >
              <Eyebrow>Logs</Eyebrow>
              <h3
                className="mt-3 text-xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-2xl text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Every rep,{" "}
                <span className="text-[var(--primary)]">on the record.</span>
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Completed sessions become a searchable archive. Re-run your
                best weeks with one tap.
              </p>
              <div className="mt-6 flex justify-center">
                <PhoneFrame
                  src="/assets/IMG_4968.PNG"
                  alt="Fitfo workout history and archive of completed sessions from saved TikTok plans"
                  width={200}
                  float
                />
              </div>
            </Reveal>
          </div>
        </FlowSection>

        <FlowSection
          index="05"
          eyebrow="Straight talk"
          title={
            <>
              Privacy, platform, and{" "}
              <span className="text-[var(--primary)]">humans</span> when you
              need them.
            </>
          }
          subtitle="No ad networks, no workout-data resale, just the App Store, your phone, and a support inbox that actually replies."
        >
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
            <Reveal
              delay={60}
              className={`${bento} p-6 sm:p-7 lg:col-span-5`}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Privacy
              </p>
              <h3
                className="mt-2.5 text-lg font-bold tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                No ads, no data sales
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                We don&apos;t run ad SDKs or sell your workout data. See the
                full picture in our{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--primary-bright)] underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Reveal>

            <Reveal
              delay={120}
              className={`${bento} flex flex-col justify-center p-6 sm:p-7 lg:col-span-4`}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Availability
              </p>
              <h3
                className="mt-2.5 text-lg font-bold tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Built for iPhone
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Download on the App Store and share your first video in
                seconds.
              </p>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="cta-lift mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-[12px] font-bold text-white sm:text-[13px]"
              >
                Get the app
                <span aria-hidden className="arrow-nudge">
                  →
                </span>
              </a>
            </Reveal>

            <Reveal
              delay={160}
              className={`${bento} p-6 sm:p-7 lg:col-span-3`}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Help
              </p>
              <h3
                className="mt-2.5 text-lg font-bold tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Questions?
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Imports, account, or creators: we&apos;ve documented it all.
              </p>
              <Link
                href="/support"
                className="mt-4 inline-flex text-[13px] font-semibold text-[var(--primary-bright)] underline-offset-4 hover:underline"
              >
                Support center →
              </Link>
            </Reveal>
          </div>
        </FlowSection>

        <section id="download" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-4 sm:px-6 sm:pb-24 xl:px-10">
            <Reveal delay={80} className="mb-8 lg:mb-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-10 lg:gap-14">
                <span
                  className="shrink-0 text-4xl font-bold leading-none tracking-[-0.05em] text-white/[0.22] sm:text-5xl lg:text-6xl"
                  style={{ fontFamily: "var(--font-display)" }}
                  aria-hidden
                >
                  06
                </span>
                <div className="min-w-0 flex-1">
                  <Eyebrow>You&apos;re in</Eyebrow>
                  <h2
                    className="mt-3 max-w-3xl text-2xl font-bold leading-[1.08] tracking-[-0.025em] sm:text-3xl lg:text-4xl text-balance"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Start with the content you{" "}
                    <span className="text-[var(--primary)]">already watch.</span>
                  </h2>
                </div>
              </div>
            </Reveal>

            <Reveal
              delay={100}
              className={`${bento} border-[var(--primary)]/25 bg-[var(--surface)]/88 p-8 text-center sm:p-10`}
            >
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-3 py-1">
                <span
                  aria-hidden
                  className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--primary-bright)]"
                />
                <span
                  className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--primary-bright)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Live on iOS
                </span>
              </div>
              <h2
                className="mt-5 text-3xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-4xl text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Train with the content{" "}
                <span className="text-[var(--primary)]">
                  you already love.
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[14px] text-[var(--text-secondary)] text-pretty sm:text-[15px]">
                Open Fitfo, share a TikTok or Reel, and lift off a real plan
                in under a minute.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="cta-lift inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-[13px] font-bold text-white shadow-[0_20px_45px_-15px_rgba(255,90,20,0.5)] hover:bg-[var(--primary-bright)]"
                >
                  Download on the App Store
                  <span aria-hidden className="arrow-nudge">
                    →
                  </span>
                </a>
                <Link
                  href="/support"
                  className="cta-lift inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border-soft)] bg-transparent px-5 text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--primary)]/45 hover:bg-[var(--surface-muted)]/80"
                >
                  Questions? Hit support
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function FlowSection({
  id,
  index,
  eyebrow,
  title,
  subtitle,
  compactBelowHeader,
  children,
}: {
  id?: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  /** Pull the bento grid closer to the section title (e.g. step cards under "How it works"). */
  compactBelowHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20 xl:px-10">
        <Reveal
          className={
            compactBelowHeader ? "mb-4 sm:mb-5 lg:mb-6" : "mb-8 lg:mb-10"
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-10 lg:gap-14">
            <span
              className="shrink-0 text-4xl font-bold leading-none tracking-[-0.05em] text-white/[0.22] sm:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-display)" }}
              aria-hidden
            >
              {index}
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h2
                className="mt-3 max-w-3xl text-2xl font-bold leading-[1.08] tracking-[-0.025em] sm:text-3xl lg:text-4xl text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {title}
              </h2>
              {subtitle ? (
                <p
                  className={`max-w-2xl text-pretty text-[14px] leading-relaxed text-neutral-800 sm:text-[15px] ${compactBelowHeader ? "mt-3" : "mt-4"}`}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function Eyebrow({
  children,
  center = false,
}: {
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <p
      className={`text-[10px] font-black uppercase tracking-[0.3em] text-[var(--primary-bright)] ${
        center ? "text-center" : ""
      }`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {children}
    </p>
  );
}

function CoachHighlightSection() {
  const [, , trainFeature] = FEATURES;

  return (
    <section id="coach" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:py-14 xl:px-10">
        <Reveal delay={90} variant="scale" className={`${bento} p-6 sm:p-8`}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-10">
            <div className="min-w-0 flex-1">
              <Eyebrow>Built-in AI coach</Eyebrow>
              <h2
                className="mt-3 text-2xl font-bold leading-[1.08] tracking-[-0.025em] sm:text-3xl text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Training advice that knows what you&apos;re{" "}
                <span className="text-[var(--primary)]">training.</span>
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-secondary)] text-pretty sm:text-[15px]">
                Ask the in-app coach about form cues, swaps, or why a lift is
                programmed. It uses your{" "}
                <strong className="text-[var(--text-primary)]">
                  current session
                </strong>
                , not generic chat.
              </p>
            </div>
            <div className="flex shrink-0 justify-center lg:justify-end">
              <PhoneFrame
                src={trainFeature.image}
                alt="Fitfo in-app coach during an active workout session"
                width={220}
                float
                rotate={2}
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
