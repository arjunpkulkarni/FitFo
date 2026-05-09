import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  HelpCircle,
  LineChart,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wand2,
} from "lucide-react";

import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { PhoneFrame } from "@/components/site/PhoneFrame";
import { Reveal } from "@/components/site/Reveal";

const APP_STORE_URL = "https://apps.apple.com/app/id6762418380";

// Existing screenshot assets in apps/web/public/assets, mapped to the
// placeholder slot names from the brief so we don't ship missing image paths.
const IMG = {
  import: "/assets/IMG_4970.PNG",
  coach: "/assets/IMG_4969.PNG",
  library: "/assets/IMG_4966.PNG",
  session: "/assets/IMG_4967.PNG",
  calendar: "/assets/IMG_4971.PNG",
  logs: "/assets/IMG_4968.PNG",
};

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="top" className="relative flex flex-1 flex-col">
        <Hero />
        <HowItWorks />
        <ImportSection />
        <LibraryAndSession />
        <Rhythm />
        <StraightTalk />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Left-side dark veil so the headline copy stays readable over the haze. */}
      <div
        aria-hidden
        className="fitfo-hero-veil pointer-events-none absolute inset-0 -z-10"
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-16 px-4 pb-14 pt-10 sm:px-6 sm:pt-12 lg:flex-row lg:items-center lg:justify-center lg:gap-32 lg:pb-16 lg:pt-14 xl:gap-44 2xl:gap-56 xl:px-12">
        <div className="w-full max-w-xl lg:w-auto lg:shrink-0">
          {/* Top pill */}
          <div
            className="animate-blur-fade-up glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{ animationDelay: "80ms", marginBottom: "12px" }}
          >
            <span
              aria-hidden
              className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--primary-bright)]"
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/80">
              Now on iOS
            </span>
          </div>

          {/* Main heading */}
          <h1
            className="animate-blur-fade-up text-[clamp(2rem,4.8vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white"
            style={{
              fontFamily: "var(--font-display)",
              animationDelay: "180ms",
            }}
          >
            Turn fitness videos
            <br />
            into workouts you actually do.
          </h1>

          {/* Subheading (short) */}
          <p
            className="animate-blur-fade-up max-w-[480px] text-[14px] font-light leading-[1.55] tracking-[0.01em] text-white/80 sm:text-[15px]"
            style={{ animationDelay: "300ms", marginTop: "8px" }}
          >
            Share a TikTok or Reel to Fitfo. AI builds a structured workout.
            Edit it, train it, log every set.
          </p>

          {/* CTAs */}
          <div
            className="animate-blur-fade-up flex flex-wrap items-center gap-3"
            style={{ animationDelay: "420ms", marginTop: "24px" }}
          >
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="group glass-cta-primary inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold sm:h-11 sm:text-[14px]"
            >
              Download on the App Store
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 sm:h-4 sm:w-4"
                strokeWidth={2.4}
              />
            </a>
            <Link
              href="/#how"
              className="glass-cta-secondary inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-medium sm:h-11 sm:text-[14px]"
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Right: phone hugs copy (flex row). No wide empty column. */}
        <div className="relative flex shrink-0 justify-center">
          <div
            className="animate-blur-fade-up relative"
            style={{ animationDelay: "260ms" }}
          >
            {/* Soft orange glow behind the device */}
            <div
              aria-hidden
              className="bg-orange-glow glow-breathe pointer-events-none absolute -inset-10 -z-10"
            />
            <PhoneFrame
              src={IMG.import}
              alt="Fitfo iOS app screenshot showing a TikTok workout converted into a structured training session"
              width={252}
              priority
              float
              rotate={-3}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 01 · How it works ───────────────────────────────────────────────────── */

const STEPS = [
  {
    n: "01",
    title: "Share a fitness video",
    body: "From any public TikTok or Reel. Tap Share, pick Fitfo. No copy-paste.",
    icon: Share2,
  },
  {
    n: "02",
    title: "Our AI does the work",
    body: "Exercises, sets, reps, and rest land in one card. Edit or start now.",
    icon: Wand2,
  },
  {
    n: "03",
    title: "Train it, log it, repeat",
    body: "Run the session in-app, log sets, resume the same plan anytime.",
    icon: LineChart,
  },
];

function HowItWorks() {
  return (
    <FlowSection
      id="how"
      index="01"
      eyebrow="How it works"
      title={
        <>
          From <span className="text-[var(--primary-bright)]">scroll</span> to{" "}
          <span className="text-[var(--primary-bright)]">sets</span>, three{" "}
          steps.
        </>
      }
      subtitle="Share a video, get a structured plan, train and log like a real app."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-7">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <Reveal
              key={step.n}
              delay={80 + i * 80}
              variant="scale"
              className="glass-card group rounded-2xl p-6 sm:p-7"
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--primary-bright)]"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Step {step.n}
                </span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition-colors duration-300 group-hover:border-[var(--primary-bright)]/40 group-hover:text-white">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
              </div>
              <h3
                className="mt-4 text-[16px] font-semibold tracking-[-0.018em] text-white sm:text-[17px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {step.title}
              </h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
                {step.body}
              </p>
            </Reveal>
          );
        })}
      </div>
    </FlowSection>
  );
}

/* ─── 02 · Import ─────────────────────────────────────────────────────────── */

function ImportSection() {
  return (
    <FlowSection
      id="demo"
      index="02"
      eyebrow="Import"
      title={
        <>
          Share a video once.{" "}
          <span className="text-[var(--primary-bright)]">Fitfo</span> builds the
          card.
        </>
      }
      subtitle="Share sheet in. We transcribe and read on-screen text. You edit, then train."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-7">
        {/* Hero feature card */}
        <Reveal
          delay={100}
          variant="scale"
          className="glass-card overflow-hidden rounded-2xl p-6 sm:p-8 lg:col-span-7"
        >
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-10">
            <div className="min-w-0 flex-1">
              <Eyebrow>Import</Eyebrow>
              <h3
                className="mt-3 text-[18px] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance sm:text-[20px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Share a video, get a workout
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70 text-pretty sm:text-[14px]">
                Tap Share on TikTok or a Reel. Fitfo reads audio and what&apos;s
                on screen into one structured session.
              </p>
            </div>
            <div className="flex shrink-0 justify-center lg:justify-end">
              <PhoneFrame
                src={IMG.import}
                alt="Fitfo iOS app screenshot showing a TikTok workout converted into a structured training session"
                width={178}
                float="slow"
                rotate={-2}
              />
            </div>
          </div>
        </Reveal>

        {/* Mini feature stack */}
        <div className="flex flex-col gap-5 lg:col-span-5 lg:gap-6">
          <MiniFeatureCard
            delay={140}
            eyebrow="Platforms"
            title="TikTok & Instagram Reels"
            body="The same share sheet, no link dumps or screen recordings."
          />
          <MiniFeatureCard
            delay={200}
            eyebrow="How parsing works"
            title="Audio + on-screen text"
            body="Voice and reps on screen merge into one workout card."
          />
        </div>

        {/* Built-in AI coach feature (full width) */}
        <Reveal
          delay={220}
          variant="scale"
          className="glass-card relative overflow-hidden rounded-2xl p-6 sm:p-8 lg:col-span-12"
        >
          <div
            aria-hidden
            className="bg-orange-glow pointer-events-none absolute -right-16 -top-16 h-64 w-64 opacity-60 blur-2xl"
          />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-11">
            <div className="min-w-0 flex-1">
              <Eyebrow>
                <span className="inline-flex items-center gap-2">
                  <Sparkles
                    className="h-3.5 w-3.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                  Built-in AI coach
                </span>
              </Eyebrow>
              <h3
                className="mt-3 text-[18px] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance sm:text-[20px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Training advice that knows what you&apos;re{" "}
                <span className="text-[var(--primary-bright)]">training.</span>
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70 text-pretty sm:text-[14px]">
                Form cues and swaps tied to your{" "}
                <strong className="text-white">current session</strong>, not
                generic chat.
              </p>
            </div>
            <div className="flex shrink-0 justify-center lg:justify-end">
              <PhoneFrame
                src={IMG.coach}
                alt="Fitfo in-app coach during an active workout session"
                width={178}
                float
                rotate={2}
              />
            </div>
          </div>
        </Reveal>
      </div>
    </FlowSection>
  );
}

function MiniFeatureCard({
  delay,
  eyebrow,
  title,
  body,
}: {
  delay: number;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Reveal
      delay={delay}
      variant="scale"
      className="glass-card flex flex-1 flex-col rounded-2xl p-6 sm:p-7"
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3
        className="mt-2.5 text-[15px] font-semibold tracking-[-0.018em] text-white sm:text-[16px]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
        {body}
      </p>
    </Reveal>
  );
}

/* ─── 03 · Library & session ──────────────────────────────────────────────── */

function LibraryAndSession() {
  return (
    <FlowSection
      index="03"
      eyebrow="Library & session"
      title={
        <>
          Organize the mess.{" "}
          <span className="text-[var(--primary-bright)]">Train</span> the plan.
        </>
      }
      subtitle="Tagged library, live session view. Move set to set without thinking."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
        <SplitPanel
          delay={100}
          eyebrow="Organize"
          title="A library that knows what it is"
          body="Saved plans and history, tagged by muscle. Find what you need fast."
          image={IMG.library}
          imageAlt="Fitfo workout library with saved fitness videos from TikTok organized by muscle group"
          rotate={-2}
        />
        <SplitPanel
          delay={180}
          eyebrow="Train"
          title="Edit, follow, log, no friction"
          body="Change reps or weight in a tap. Log a set. The next move opens for you."
          image={IMG.session}
          imageAlt="Fitfo active workout screen logging sets and reps from an imported Instagram Reel plan"
          rotate={2}
          reverse
        />
      </div>
    </FlowSection>
  );
}

function SplitPanel({
  delay,
  eyebrow,
  title,
  body,
  image,
  imageAlt,
  rotate,
  reverse = false,
}: {
  delay: number;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  rotate?: number;
  reverse?: boolean;
}) {
  return (
    <Reveal
      delay={delay}
      variant="scale"
      className="glass-card relative overflow-hidden rounded-2xl p-6 sm:p-8"
    >
      <div
        aria-hidden
        className={`bg-orange-glow pointer-events-none absolute h-60 w-60 opacity-50 blur-2xl ${
          reverse ? "-left-14 bottom-0" : "-right-14 top-0"
        }`}
      />
      <div
        className={`relative flex flex-col gap-7 sm:flex-row sm:items-center sm:gap-9 ${
          reverse ? "sm:flex-row-reverse" : ""
        }`}
      >
        <div className="flex flex-1 justify-center sm:justify-start">
          <PhoneFrame
            src={image}
            alt={imageAlt}
            width={168}
            float={reverse ? "slow" : true}
            rotate={rotate}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3
            className="mt-3 text-[16px] font-semibold leading-[1.15] tracking-[-0.02em] text-white text-balance sm:text-[17px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
            {body}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

/* ─── 04 · Rhythm ─────────────────────────────────────────────────────────── */

function Rhythm() {
  return (
    <FlowSection
      index="04"
      eyebrow="Rhythm"
      title={
        <>
          <span className="text-[var(--primary-bright)]">Schedule</span> the
          week. <span className="text-[var(--primary-bright)]">Log</span> every
          rep.
        </>
      }
      subtitle="Plan the week. Archive every session, still tied to the clip you imported."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
        <RhythmCard
          delay={80}
          icon={CalendarDays}
          eyebrow="Calendar"
          titleA="Schedule the week."
          titleB="Show up to it."
          body="Drop workouts on days. See what&apos;s ahead without re-deciding every morning."
          image={IMG.calendar}
          imageAlt="Fitfo training calendar showing scheduled workouts imported from Instagram Reels"
        />
        <RhythmCard
          delay={160}
          icon={ClipboardList}
          eyebrow="Logs"
          titleA="Every rep,"
          titleB="on the record."
          body="Completed sessions stay searchable. Re-run a great week in one tap."
          image={IMG.logs}
          imageAlt="Fitfo workout history and archive of completed sessions from saved TikTok plans"
        />
      </div>
    </FlowSection>
  );
}

function RhythmCard({
  delay,
  icon: Icon,
  eyebrow,
  titleA,
  titleB,
  body,
  image,
  imageAlt,
}: {
  delay: number;
  icon: typeof CalendarDays;
  eyebrow: string;
  titleA: string;
  titleB: string;
  body: string;
  image: string;
  imageAlt: string;
}) {
  return (
    <Reveal
      delay={delay}
      variant="scale"
      className="glass-card relative overflow-hidden rounded-2xl p-6 sm:p-8"
    >
      <div
        aria-hidden
        className="bg-orange-glow pointer-events-none absolute -right-16 -top-16 h-64 w-64 opacity-50 blur-2xl"
      />
      <div className="relative flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h3
        className="relative mt-3.5 text-[16px] font-semibold leading-[1.15] tracking-[-0.02em] text-white text-balance sm:text-[18px]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {titleA}{" "}
        <span className="text-[var(--primary-bright)]">{titleB}</span>
      </h3>
      <p className="relative mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
        {body}
      </p>
      <div className="relative mt-6 flex justify-center">
        <PhoneFrame
          src={image}
          alt={imageAlt}
          width={168}
          float="slow"
          rotate={-1}
        />
      </div>
    </Reveal>
  );
}

/* ─── 05 · Straight talk ──────────────────────────────────────────────────── */

function StraightTalk() {
  return (
    <FlowSection
      index="05"
      eyebrow="Straight talk"
      title={
        <>
          Privacy, platform, and{" "}
          <span className="text-[var(--primary-bright)]">humans</span> when you
          need them.
        </>
      }
      subtitle="No ad networks or workout data resale. App Store only, with real support."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-7">
        <Reveal
          delay={60}
          variant="scale"
          className="glass-card flex flex-col rounded-2xl p-6 sm:p-7"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <Eyebrow>Privacy</Eyebrow>
          </div>
          <h3
            className="mt-3.5 text-[15px] font-semibold tracking-[-0.018em] text-white sm:text-[16px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            No ads, no data sales
          </h3>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
            No ad SDKs. We don&apos;t sell your training data. See our{" "}
            <Link
              href="/privacy"
              className="text-[var(--primary-bright)] underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </Reveal>

        <Reveal
          delay={120}
          variant="scale"
          className="glass-card relative flex flex-col overflow-hidden rounded-2xl p-6 sm:p-7"
        >
          <div
            aria-hidden
            className="bg-orange-glow pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 opacity-60 blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary-bright)]">
              <Smartphone className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <Eyebrow>Availability</Eyebrow>
          </div>
          <h3
            className="relative mt-3.5 text-[15px] font-semibold tracking-[-0.018em] text-white sm:text-[16px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Built for iPhone
          </h3>
          <p className="relative mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
            App Store. Share your first video in seconds.
          </p>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="group relative mt-4 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[var(--primary-bright)]"
          >
            Get the app
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
              strokeWidth={2.4}
            />
          </a>
        </Reveal>

        <Reveal
          delay={180}
          variant="scale"
          className="glass-card flex flex-col rounded-2xl p-6 sm:p-7"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80">
              <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <Eyebrow>Help</Eyebrow>
          </div>
          <h3
            className="mt-3.5 text-[15px] font-semibold tracking-[-0.018em] text-white sm:text-[16px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Questions?
          </h3>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/65 sm:text-[14px]">
            Imports, accounts, creators. It&apos;s all documented.
          </p>
          <Link
            href="/support"
            className="group mt-4 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[var(--primary-bright)]"
          >
            Support center
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
              strokeWidth={2.4}
            />
          </Link>
        </Reveal>
      </div>
    </FlowSection>
  );
}

/* ─── 06 · Final CTA ──────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section id="download" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 lg:px-10 xl:px-12">
        <Reveal delay={80} className="mb-7 lg:mb-9">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-10 lg:gap-12">
            <span
              aria-hidden
              className="shrink-0 text-3xl font-semibold leading-none tracking-[-0.05em] text-white/[0.18] sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              06
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow>You&apos;re in</Eyebrow>
              <h2
                className="mt-2.5 max-w-2xl text-[22px] font-semibold leading-[1.08] tracking-[-0.025em] text-white text-balance sm:text-2xl lg:text-[32px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Start with the content you{" "}
                <span className="text-[var(--primary-bright)]">
                  already watch.
                </span>
              </h2>
            </div>
          </div>
        </Reveal>

        <Reveal
          delay={120}
          variant="scale"
          className="glass-card relative overflow-hidden rounded-[28px] p-7 sm:p-10 lg:p-12"
        >
          {/* Cinematic ambient glow + dark gradient */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 100% at 50% 0%, rgba(255,120,60,0.18), transparent 60%)," +
                "linear-gradient(180deg, rgba(20,15,25,0.8), rgba(8,8,10,0.95))",
            }}
          />
          <div
            aria-hidden
            className="bg-orange-glow glow-breathe pointer-events-none absolute -bottom-24 left-1/2 h-[300px] w-[380px] -translate-x-1/2 opacity-70 blur-3xl"
          />

          <div className="relative grid grid-cols-1 items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-32 xl:gap-44 2xl:gap-56">
            <div>
              <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5">
                <span
                  aria-hidden
                  className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--primary-bright)]"
                />
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/85">
                  Live on iOS
                </span>
              </div>
              <h2
                className="mt-4 text-[22px] font-semibold leading-[1.08] tracking-[-0.025em] text-white text-balance sm:text-2xl lg:text-[32px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Train with the content{" "}
                <span className="text-[var(--primary-bright)]">
                  you already love.
                </span>
              </h2>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-white/70 text-pretty sm:text-[15px]">
                Share a clip. Start training in under a minute.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="group glass-cta-primary inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold sm:h-11 sm:text-[14px]"
                >
                  Download on the App Store
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 sm:h-4 sm:w-4"
                    strokeWidth={2.4}
                  />
                </a>
                <Link
                  href="/support"
                  className="glass-cta-secondary inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-medium sm:h-11 sm:text-[14px]"
                >
                  Questions? Hit support
                </Link>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <div
                  aria-hidden
                  className="bg-orange-glow glow-breathe pointer-events-none absolute -inset-10 -z-10"
                />
                <PhoneFrame
                  src={IMG.session}
                  alt="Fitfo iOS app screenshot showing a TikTok workout converted into a structured training session"
                  width={204}
                  float
                  rotate={3}
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Section primitives ──────────────────────────────────────────────────── */

function FlowSection({
  id,
  index,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 sm:py-14 lg:px-10 lg:py-[4.5rem] xl:px-12">
        <Reveal className="mb-8 lg:mb-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-10 lg:gap-12">
            <span
              aria-hidden
              className="shrink-0 text-3xl font-semibold leading-none tracking-[-0.05em] text-white/[0.18] sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {index}
            </span>
            <div className="min-w-0 flex-1">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h2
                className="mt-2.5 max-w-2xl text-xl font-semibold leading-[1.1] tracking-[-0.022em] text-white text-balance sm:text-2xl lg:text-[30px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-white/65 text-pretty sm:text-[15px]">
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

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--primary-bright)]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {children}
    </p>
  );
}
