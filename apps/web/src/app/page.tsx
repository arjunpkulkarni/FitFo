import Image from "next/image";
import { ArrowRight } from "lucide-react";

import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { HeroDemoVideo } from "@/components/site/HeroDemoVideo";
import { PhoneFrame } from "@/components/site/PhoneFrame";
import { Reveal } from "@/components/site/Reveal";
import { SeeTheAppLink } from "@/components/site/SeeTheAppLink";

import { LANDING_CONTENT_MAX } from "@/lib/landingLayout";
import { APP_STORE_URL } from "@/lib/siteUrls";

const IMG = {
  import: "/assets/IMG_4970.PNG",
  coach: "/assets/IMG_4969.PNG",
  session: "/assets/IMG_4967.PNG",
} as const;

const HERO_DEMO_MP4 = "/assets/my-workout.mp4";
const STRIP_LOGO = "/assets/logo.png";

/** Approx. combined reach on social. Update from profiles periodically. */
const TEAM = [
  { src: "/assets/team/jacob.jpg", name: "Jacob", followersApprox: 1_000_000 },
  { src: "/assets/team/nirv.png", name: "Nirv", followersApprox: 40_000 },
  { src: "/assets/team/nuno.png", name: "Nuno", followersApprox: 500_000 },
] as const;

function sumTeamFollowers(
  members: readonly { followersApprox: number }[],
): number {
  return members.reduce((acc, m) => acc + m.followersApprox, 0);
}

const TEAM_COMBINED_FOLLOWERS_APPROX = sumTeamFollowers(TEAM);

function formatFollowerShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const label = m >= 10 ? Math.round(m).toString() : m.toFixed(1).replace(/\.0$/, "");
    return `${label}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  return `${n}`;
}

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="top" className="relative flex flex-1 flex-col">
        <Hero />
        <VisualStrip />
        <CoachSection />
        <Team />
      </main>
      <Reveal when="load" delay={920} variant="up" className="w-full shrink-0">
        <Footer />
      </Reveal>
    </>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-12 pt-10 sm:pb-14 sm:pt-12 lg:pb-16 lg:pt-14">
      <div
        aria-hidden
        className="fitfo-hero-veil fitfo-hero-veil-enter pointer-events-none absolute inset-0 -z-10"
      />

      <div
        className={`mx-auto flex w-full flex-col items-center gap-9 px-4 sm:gap-10 sm:px-6 lg:flex-row lg:items-center lg:justify-center lg:gap-16 xl:gap-24 2xl:gap-28 ${LANDING_CONTENT_MAX}`}
      >
        <div className="w-full max-w-xl lg:max-w-[26rem]">
          <div
            className="animate-blur-fade-up glass-pill mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 sm:mb-7"
            style={{ animationDelay: "60ms" }}
          >
            <span
              aria-hidden
              className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary-bright)]"
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85">
              iPhone · free to try
            </span>
          </div>

          <h1
            className="animate-blur-fade-up flex flex-col gap-3 text-[clamp(2.1rem,5.2vw,3.85rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:gap-[0.875rem]"
            style={{
              fontFamily: "var(--font-display)",
              animationDelay: "140ms",
            }}
          >
            <span>Stop watching.</span>
            <span className="text-[var(--primary-bright)]">Start lifting.</span>
          </h1>

          <p
            className="animate-blur-fade-up mt-7 max-w-[440px] text-[15px] font-normal leading-relaxed text-white/82 sm:mt-8 sm:text-[16px]"
            style={{ animationDelay: "240ms" }}
          >
            Videos from your feed → a real workout in the app.
            Tap share. Train it. Done.
          </p>

          <div
            className="animate-blur-fade-up mt-11 flex flex-col gap-5 sm:mt-12 sm:flex-row sm:items-center sm:gap-6"
            style={{ animationDelay: "360ms" }}
          >
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="group glass-cta-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-8 text-[15px] font-bold sm:w-auto sm:min-h-[52px] sm:px-9 sm:text-base"
            >
              Get Fitfo · App&nbsp;Store
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                strokeWidth={2.5}
              />
            </a>
            <SeeTheAppLink className="hidden text-center text-[13px] font-medium text-white/50 underline-offset-4 transition-colors hover:text-white/85 hover:text-primary-bright hover:underline focus-visible:text-primary-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bright/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:inline sm:text-left" />
          </div>
        </div>

        <div className="relative flex w-full shrink-0 justify-center lg:w-auto lg:justify-end">
          <div
            className="animate-blur-fade-up relative"
            style={{ animationDelay: "200ms" }}
          >
            <div
              aria-hidden
              className="bg-orange-glow glow-breathe pointer-events-none absolute -inset-8 -z-10 scale-[1.06] opacity-90 sm:-inset-10"
            />
            <HeroDemoVideo
              src={HERO_DEMO_MP4}
              label="Fitfo turning a workout video into sets and reps"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const STRIP = [
  {
    img: IMG.import as string,
    label: "Share",
    sub: "one tap",
  },
  {
    img: IMG.coach as string,
    label: "Train",
    sub: "in the gym",
  },
  {
    img: IMG.session as string,
    label: "Log",
    sub: "every set",
  },
] as const;

function VisualStrip() {
  return (
    <section
      id="see"
      className="scroll-mt-20 border-t border-white/[0.06] bg-black/25 py-14 sm:py-16 lg:py-20"
    >
      <div className={`mx-auto ${LANDING_CONTENT_MAX} px-4 sm:px-6`}>
        <Reveal when="load" delay={380} variant="up">
          <div className="mx-auto mb-5 flex flex-col items-center sm:mb-6">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary-bright)] opacity-[0.12] blur-2xl"
              />
              <div className="relative overflow-hidden rounded-full bg-gradient-to-b from-white/[0.09] to-transparent p-px shadow-[0_14px_36px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.14]">
                <div className="relative overflow-hidden rounded-full bg-black/90">
                  <Image
                    src={STRIP_LOGO}
                    alt="Fitfo"
                    width={52}
                    height={52}
                    className="h-[52px] w-[52px] object-cover"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  />
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.34em] text-[var(--primary-bright)]">
            Why it feels unfair
          </p>
          <h2
            className="mx-auto mt-3 max-w-2xl text-center text-[clamp(1.35rem,3.5vw,1.875rem)] font-semibold leading-tight tracking-[-0.028em] text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Video in.{" "}
            <span className="text-[var(--primary-bright)]">Training plan</span>{" "}
            out.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-[14px] text-white/60">
            No typing sets. No guesswork. Built for scrolling, made for squatting.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6 lg:gap-10">
          {STRIP.map((item, i) => (
            <Reveal
              key={item.label}
              when="load"
              delay={480 + i * 92}
              variant="scale"
              className="flex flex-col items-center text-center"
            >
              <div className="relative mb-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-full opacity-40 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 60%, rgba(255,106,44,0.35), transparent 65%)",
                  }}
                />
                <PhoneFrame
                  src={item.img}
                  alt=""
                  width={156}
                  float={i === 1 ? "slow" : true}
                  rotate={i === 0 ? -4 : i === 2 ? 4 : 0}
                />
              </div>
              <p
                className="text-xl font-bold tracking-[-0.03em] text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {item.label}
              </p>
              <p className="mt-1 text-sm text-white/50">{item.sub}</p>
            </Reveal>
          ))}
        </div>

        <Reveal
          when="load"
          delay={780}
          className="mt-14 flex justify-center"
        >
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="group glass-cta-primary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-8 text-[15px] font-bold sm:min-h-[50px]"
          >
            Download free
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              strokeWidth={2.5}
            />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function CoachSection() {
  return (
    <section
      id="coach"
      className="scroll-mt-20 border-t border-white/[0.06] bg-black/[0.12] py-14 sm:py-16 lg:py-20"
    >
      <div className={`mx-auto ${LANDING_CONTENT_MAX} px-4 sm:px-6`}>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <Reveal when="load" delay={520} variant="up" className="max-w-xl lg:max-w-none">
            <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-[var(--primary-bright)]">
              Coach
            </p>
            <h2
              className="mt-3 text-[clamp(1.45rem,3.8vw,2.125rem)] font-semibold leading-tight tracking-[-0.028em] text-white text-balance"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ask your workout{" "}
              <span className="text-[var(--primary-bright)]">anything.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65 text-pretty">
              Fitfo Coach is tied to the session on your screen: exercises, sets,
              rest, and the video you imported, so cues and swaps actually match
              what you&apos;re doing right now.
            </p>
            <ul className="mt-8 space-y-3 text-[14px] leading-snug text-white/72">
              <li className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary-bright)]"
                />
                Form checks and coaching cues for the lift you&apos;re on
              </li>
              <li className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary-bright)]"
                />
                Weight, swaps, and &ldquo;what&apos;s next?&rdquo; without
                leaving the floor
              </li>
              <li className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary-bright)]"
                />
                Chat history stays with the workout when you come back
              </li>
            </ul>
          </Reveal>

          <Reveal
            when="load"
            delay={620}
            variant="scale"
            className="relative mx-auto flex w-full max-w-[min(380px,100%)] justify-center lg:mx-0 lg:max-w-none lg:justify-end"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[min(420px,70vw)] w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle at 50% 45%, rgba(255,106,44,0.28), transparent 68%)",
              }}
            />
            <div className="relative w-[min(100%,280px)] sm:w-[300px]">
              <PhoneFrame
                src={IMG.session}
                alt=""
                width={300}
                float="slow"
                rotate={5}
                glow
                className="mx-auto"
              />
              <div className="absolute -bottom-1 left-0 right-0 z-10 sm:-bottom-2 sm:left-[-4%] sm:right-auto sm:max-w-[290px] lg:left-[-8%]">
                <div className="rounded-2xl border border-white/[0.12] bg-black/65 px-4 py-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md supports-[backdrop-filter]:bg-black/45">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-bright)]">
                    Coach
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/88">
                    Hinge it right: you&apos;re pushing the floor away, bar rides
                    your legs the whole way.
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/88">
                    Low back starts to go? Strip weight, slow the rep, and clean
                    it up. No ugly grinders.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Team() {
  return (
    <section
      id="team"
      className="scroll-mt-20 border-t border-white/[0.06] bg-black/[0.18] py-14 sm:py-16 lg:py-20"
    >
      <div className={`mx-auto ${LANDING_CONTENT_MAX} px-4 sm:px-6`}>
        <Reveal when="load" delay={660} variant="up">
          <h2
            className="mx-auto max-w-xl px-2 text-center text-[clamp(1.05rem,3.4vw,1.35rem)] font-semibold leading-snug tracking-[-0.035em] text-white sm:max-w-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Used by your{" "}
            <span className="text-[var(--primary-bright)] drop-shadow-[0_0_32px_rgba(255,106,44,0.35)]">
              favorite fitness influencers
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-[13px] tabular-nums text-white/50">
            <span className="font-semibold text-white/75">
              ~{formatFollowerShort(TEAM_COMBINED_FOLLOWERS_APPROX)}+
            </span>{" "}
            combined followers{" "}
            <span className="text-white/40">(social)</span>
          </p>
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-12 sm:max-w-none sm:grid-cols-3 sm:gap-10">
          {TEAM.map((member, i) => (
            <Reveal
              key={member.name}
              when="load"
              delay={730 + i * 90}
              variant="up"
              className="flex flex-col items-center text-center"
            >
              <div className="relative mb-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full opacity-35 blur-2xl"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(255,106,44,0.32), transparent 70%)",
                  }}
                />
                <Image
                  src={member.src}
                  alt=""
                  width={160}
                  height={160}
                  className="h-40 w-40 rounded-full border border-white/[0.1] object-cover shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                />
              </div>
              <p
                className="text-lg font-semibold tracking-[-0.02em] text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {member.name}
              </p>
              <p className="mt-1.5 text-[13px] font-medium tabular-nums tracking-wide text-white/42">
                ~{formatFollowerShort(member.followersApprox)}+
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
