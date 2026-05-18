import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { FITFO_PRODUCT_FAQ } from "@/content/fitfoProductFaq";

export const metadata: Metadata = {
  title: "Support, FAQ, and Account Help",
  description:
    "Fitfo FAQ: video imports, logging, AI coach, scheduling, free trial and pricing. Plus SMS sign-in, account deletion, creator takedowns, and privacy.",
  alternates: {
    canonical: "/support",
  },
};

const ACCOUNT_FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "I'm not receiving my SMS sign-in code.",
    a: (
      <>
        <p>
          SMS codes are sent via Twilio Verify and usually arrive within 10
          seconds. If yours hasn&apos;t shown up after a minute:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Confirm the phone number includes your country code (e.g. +1 for US).</li>
          <li>Check your carrier isn&apos;t filtering short-code messages.</li>
          <li>Tap &ldquo;Send code&rdquo; again after a 60-second wait.</li>
          <li>
            Still nothing? Email us at{" "}
            <a
              href="mailto:nirv@fitfo.app"
              className="text-[var(--primary-bright)] underline underline-offset-2"
            >
              nirv@fitfo.app
            </a>{" "}
            with the number you tried and we&apos;ll fix it.
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "My video import failed or the workout came out wrong.",
    a: (
      <>
        <p>
          Fitfo uses audio transcription and on-screen text OCR to extract
          workouts, so short, heavily-edited, or music-only videos can be tough.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Make sure the source post is public in the app you shared from.</li>
          <li>
            Longer videos with clear voice-over or visible text work best. Think
            creator explanations rather than 10-second montages.
          </li>
          <li>
            You can always edit the parsed workout: tap the title, exercise
            names, sets, reps, or notes and change them inline.
          </li>
          <li>
            If a specific video consistently parses wrong, tap &ldquo;Report an
            issue&rdquo; on the workout card and we&apos;ll get the link.
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "How do I delete my account and my data?",
    a: (
      <>
        <p>
          Open the Fitfo app → <strong>Profile</strong> tab →{" "}
          <strong>Delete Account</strong>. This permanently removes your
          profile, every saved and scheduled workout, every logged session, and
          any body-weight entries. For users signed in with Apple we also
          revoke the Apple Sign-In refresh token so the app disappears from
          Settings → Apple ID → Apps Using Apple ID.
        </p>
        <p className="mt-3">
          Can&apos;t sign in to delete? Email{" "}
          <a
            href="mailto:nirv@fitfo.app"
            className="text-[var(--primary-bright)] underline underline-offset-2"
          >
            nirv@fitfo.app
          </a>{" "}
          from the email associated with your account and we&apos;ll action it
          within 72 hours.
        </p>
      </>
    ),
  },
  {
    q: "Is my data private? What do you collect?",
    a: (
      <>
        <p>
          Fitfo collects only what it needs to run the app: your phone number
          (for sign-in), name/email (if you use Apple Sign-In), the workouts
          you save, the sessions you log, and body-weight entries you add. We
          do not sell data, share it with advertisers, or run third-party ad
          SDKs. Full details are on our{" "}
          <a
            href="/privacy"
            className="text-[var(--primary-bright)] underline underline-offset-2"
          >
            Privacy Policy
          </a>
          .
        </p>
      </>
    ),
  },
  {
    q: "Do Fitfo workouts belong to the original creator?",
    a: (
      <>
        <p>
          Yes. Fitfo does not host or redistribute any third-party video
          content. When you share a video into Fitfo, we extract factual
          exercise data (names, sets, reps) and always link back to the
          original post on every imported workout. If you&apos;re a creator and want your content removed, email{" "}
          <a
            href="mailto:nirv@fitfo.app"
            className="text-[var(--primary-bright)] underline underline-offset-2"
          >
            nirv@fitfo.app
          </a>{" "}
          with the URL and we&apos;ll remove it from our systems.
        </p>
      </>
    ),
  },
  {
    q: "Does Fitfo give medical or training advice?",
    a: (
      <>
        <p>
          No. Fitfo turns the content of videos into structured data. Workouts
          parsed from videos are labeled <strong>AI-Parsed</strong> and may
          contain errors, so always verify sets, reps, and weights before
          training and talk to a doctor or qualified coach if you have any
          concerns about a particular exercise or load.
        </p>
      </>
    ),
  },
];

const ANDROID_FAQ_INDEX = FITFO_PRODUCT_FAQ.findIndex((item) =>
  item.question.includes("Android"),
);

const PRODUCT_FAQ_ENTRIES: { q: string; a: ReactNode }[] =
  FITFO_PRODUCT_FAQ.map((faq, i) => ({
    q: faq.question,
    a:
      ANDROID_FAQ_INDEX !== -1 && i === ANDROID_FAQ_INDEX ? (
        <p>
          Not yet. Fitfo is currently iOS-only on the App Store. We don&apos;t
          have a waitlist, but if you want to know when Android launches, follow{" "}
          <a
            href="https://www.instagram.com/fitfo.app/"
            className="text-[var(--primary-bright)] underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            @fitfo.app on Instagram
          </a>{" "}
          and you&apos;ll see it the moment it ships.
        </p>
      ) : (
        <p>{faq.answer}</p>
      ),
  }));

export default function SupportPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-4xl px-5 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
            <p
              className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--primary-bright)]"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Support
            </p>
            <h1
              className="mt-3 text-4xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-5xl text-balance"
              style={{ fontFamily: "var(--font-display)" }}
            >
              We&apos;re on call, <span className="text-[var(--primary)]">mostly</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)] text-pretty sm:text-base">
              Something broken? A workout parsed wrong? Want your creator
              content removed? This page has the most common fixes. For
              anything else we respond fast at{" "}
              <a
                href="mailto:nirv@fitfo.app"
                className="text-[var(--primary-bright)] underline underline-offset-2"
              >
                nirv@fitfo.app
              </a>
              .
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <ContactCard
                title="Email support"
                body="Best for account issues, takedowns, and anything that needs a reply."
                cta="nirv@fitfo.app"
                href="mailto:nirv@fitfo.app"
              />
              <ContactCard
                title="Report a workout"
                body="If an AI-parsed workout is wrong, use the Report link inside the app."
                cta="Open the app"
                href="/"
              />
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-28">
          <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
            <p
              className="text-[10px] font-black uppercase tracking-[0.27em] text-[var(--primary-bright)]"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Fitfo FAQ
            </p>
            <h2
              className="mt-3 text-2xl font-bold tracking-[-0.015em] sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Product & app
            </h2>

            <FaqList entries={PRODUCT_FAQ_ENTRIES} />

            <h2
              className="mt-16 text-2xl font-bold tracking-[-0.015em] sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Account & technical help
            </h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--text-secondary)]">
              Sign-in, privacy, troubleshooting, and safety.
            </p>

            <FaqList entries={ACCOUNT_FAQS} />

            <p className="mt-10 text-sm text-[var(--text-muted)]">
              Didn&apos;t find what you needed? Email us at{" "}
              <a
                href="mailto:nirv@fitfo.app"
                className="text-[var(--primary-bright)] underline underline-offset-2"
              >
                nirv@fitfo.app
              </a>{" "}
              and we&apos;ll get back to you within a business day.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function FaqList({ entries }: { entries: { q: string; a: ReactNode }[] }) {
  return (
    <div className="mt-10 divide-y divide-[var(--border-soft)] rounded-3xl border border-[var(--border-soft)] bg-[var(--surface)]">
      {entries.map((faq) => (
        <details key={faq.q} className="group p-6 sm:p-7">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left">
            <h3
              className="text-base font-semibold tracking-[-0.005em] text-[var(--text-primary)] sm:text-lg"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {faq.q}
            </h3>
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] text-[var(--text-secondary)] transition group-open:rotate-45 group-open:border-[var(--primary)] group-open:text-[var(--primary)]">
              +
            </span>
          </summary>
          <div className="mt-4 max-w-3xl text-[13px] leading-relaxed text-[var(--text-secondary)] [&_strong]:font-semibold [&_strong]:text-[var(--text-primary)] [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            {faq.a}
          </div>
        </details>
      ))}
    </div>
  );
}

function ContactCard({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group block rounded-3xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 transition hover:border-[var(--primary)]/60 hover:bg-[var(--surface-muted)]"
    >
      <h3
        className="text-base font-bold tracking-[-0.005em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
      <p className="mt-4 text-[12px] font-semibold text-[var(--primary-bright)]">
        {cta} <span aria-hidden>→</span>
      </p>
    </a>
  );
}
