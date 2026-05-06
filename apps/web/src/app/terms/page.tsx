import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Fitfo by Vaayu Athletics LLC. Covers acceptable use, subscriptions, intellectual property, limitations, and governing law (Florida).",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-3xl px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-28">
            <p
              className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--primary-bright)]"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Legal
            </p>
            <h1
              className="mt-3 text-4xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-5xl text-balance"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Terms of Service.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-secondary)] text-pretty sm:text-base">
              These Terms govern your use of the Fitfo mobile application and
              website operated by{" "}
              <strong>Vaayu Athletics LLC</strong> (&ldquo;Fitfo,&rdquo;
              &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using
              the service, you agree to them.
            </p>
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">
              Effective date: May 6, 2026
            </p>
          </div>
        </section>

        <section>
          <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
            <Prose>
              <H2>1. The service</H2>
              <p>
                Fitfo provides tools to import factual workout information from
                public TikTok and Instagram content you choose to share into the
                app, organize and schedule training, and log sessions. The
                service may change as we improve the product; we may add or
                remove features with reasonable notice when material.
              </p>

              <H2>2. Eligibility and accounts</H2>
              <p>
                You must be able to form a binding contract in your jurisdiction
                and meet the minimum age required by the App Store in your
                region. You are responsible for your account credentials and
                for all activity under your account. Notify us at{" "}
                <a href="mailto:nirv@fitfo.app">nirv@fitfo.app</a> if you
                suspect unauthorized access.
              </p>

              <H2>3. User content and third-party videos</H2>
              <p>
                You retain ownership of content you create in Fitfo (for example,
                logged sets, edits, and notes). You grant us a limited license
                to host, process, and display that content solely to operate the
                service for you.
              </p>
              <p>
                <strong>Third-party media.</strong> Fitfo does not claim
                ownership of TikTok, Instagram, or other third-party videos or
                posts. You represent that you only submit URLs or shares you are
                permitted to use and that your use complies with the platforms’
                terms. We extract factual exercise data (e.g. names, sets,
                reps, rest) and link back to the original source; we do not host
                or redistribute full video files as a replacement for those
                platforms.
              </p>

              <H2>4. Acceptable use</H2>
              <p>You agree not to:</p>
              <ul>
                <li>
                  Use Fitfo in violation of law or the rights of others.
                </li>
                <li>
                  Attempt to scrape, reverse engineer, or overload our systems.
                </li>
                <li>
                  Submit malware, unlawful content, or content you do not have a
                  right to analyze.
                </li>
                <li>
                  Circumvent payment, access controls, or security measures.
                </li>
                <li>
                  Use the service to harass creators or misuse their content
                  beyond personal training.
                </li>
              </ul>

              <H2>5. AI-generated and parsed workouts</H2>
              <p>
                Workouts produced from video or audio are generated using
                automated methods and may be incomplete or inaccurate. They are
                for informational purposes only and are{" "}
                <strong>not</strong> medical, physical therapy, or professional
                coaching advice. You alone are responsible for how you train.
                Always consult a qualified professional if you have health
                concerns.
              </p>

              <H2>6. Subscriptions, billing, and refunds</H2>
              <p>
                <strong>6.1 Subscription plans.</strong> Fitfo offers
                auto-renewable subscriptions that provide full access to the
                app&apos;s features. Current subscription options are:
              </p>
              <ul>
                <li>
                  <strong>Fitfo Monthly:</strong> $5.99 USD per month
                </li>
                <li>
                  <strong>Fitfo Annual:</strong> $39.99 USD per year
                  (equivalent to $3.33 per month)
                </li>
              </ul>
              <p>
                Prices may vary by region and are displayed in your local
                currency on the App Store before purchase. Pricing in regions
                outside the United States is set by Apple&apos;s regional
                pricing tiers.
              </p>

              <p>
                <strong>6.2 Free trial.</strong> New subscribers may be
                eligible for a 7-day free trial. To start a trial, you will
                be required to provide payment information through
                Apple&apos;s In-App Purchase system at the time of sign-up.
                No charge will be made during the 7-day trial period. The
                free trial is available only to new subscribers; users who
                have previously subscribed or trialed Fitfo are not eligible
                for an additional free trial.
              </p>

              <p>
                <strong>6.3 Automatic renewal.</strong> Your subscription
                will automatically renew at the end of each billing period
                (monthly or annual) at the then-current price unless you
                cancel at least 24 hours before the end of the current
                period. Your Apple ID account will be charged for renewal
                within 24 hours prior to the end of the current period.
              </p>

              <p>
                <strong>6.4 Conversion from free trial to paid
                subscription.</strong> If you do not cancel before the end of
                the 7-day free trial, your subscription will automatically
                convert to a paid subscription at the price shown at sign-up.
                You will receive a notification from Apple before your trial
                ends and before any charge is made.
              </p>

              <p>
                <strong>6.5 Managing and canceling your subscription.</strong>{" "}
                You can manage your subscription, turn off auto-renewal, or
                cancel at any time through your Apple ID subscription
                settings:
              </p>
              <ul>
                <li>
                  <strong>On iPhone or iPad:</strong> Settings → [Your Name]
                  → Subscriptions → Fitfo
                </li>
              </ul>
              <p>
                You may also visit{" "}
                <a
                  href="https://apps.apple.com/account/subscriptions"
                  target="_blank"
                  rel="noreferrer"
                >
                  apps.apple.com/account/subscriptions
                </a>{" "}
                on any device signed in with your Apple ID. Cancellation will
                take effect at the end of your current billing period, and
                you will retain access to paid features until that date.
                Deleting the Fitfo app does not cancel your subscription.
              </p>

              <p>
                <strong>6.6 Refunds.</strong> All subscription payments are
                processed by Apple. Refunds are handled by Apple in
                accordance with Apple&apos;s refund policies. To request a
                refund, visit{" "}
                <a
                  href="https://reportaproblem.apple.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  reportaproblem.apple.com
                </a>{" "}
                and follow the instructions. Vaayu Athletics LLC does not
                directly issue refunds for subscription payments, except
                where required by law. We do not store your full payment
                card details.
              </p>

              <p>
                <strong>6.7 Price changes.</strong> We may change subscription
                prices from time to time. Price changes will not affect your
                current billing period. If the price of your subscription
                increases at renewal, Apple will notify you of the change in
                advance and may require you to consent to the new price
                before continuing your subscription, in accordance with
                Apple&apos;s policies. If you do not consent, your
                subscription will not renew at the new price.
              </p>

              <p>
                <strong>6.8 Taxes.</strong> Subscription prices are exclusive
                of applicable taxes unless otherwise stated. Apple is
                responsible for collecting and remitting any applicable
                sales tax, VAT, GST, or similar taxes based on your billing
                location.
              </p>

              <H2>7. Intellectual property</H2>
              <p>
                Fitfo&apos;s name, logo, UI, and software (excluding your data)
                are owned by Vaayu Athletics LLC or its licensors. We grant you a
                personal, non-exclusive, non-transferable license to use the app
                according to these Terms. You may not copy our product,
                trademarks, or branding except as allowed by law or with our
                written consent.
              </p>

              <H2>8. Disclaimers</H2>
              <p>
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                AVAILABLE.&rdquo; TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE
                DISCLAIM ALL WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
                ERROR-FREE OR UNINTERRUPTED.
              </p>

              <H2>9. Limitation of liability</H2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, VAAYU ATHLETICS LLC AND
                ITS AFFILIATES WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
                PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF FITFO.
                OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR
                THE SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID
                US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) FIFTY U.S.
                DOLLARS (USD $50). SOME JURISDICTIONS DO NOT ALLOW CERTAIN
                LIMITATIONS; IN THOSE CASES, OUR LIABILITY IS LIMITED TO THE
                FULLEST EXTENT PERMITTED BY LAW.
              </p>

              <H2>10. Indemnity</H2>
              <p>
                You will defend and indemnify Vaayu Athletics LLC and its
                officers, directors, and employees against any third-party
                claims, damages, or expenses (including reasonable attorneys’
                fees) arising from your misuse of the service, your user
                content, or your violation of these Terms or applicable law.
              </p>

              <H2>11. Suspension and termination</H2>
              <p>
                We may suspend or terminate your access if you breach these
                Terms, create risk or legal exposure, or if we discontinue the
                service. You may stop using Fitfo at any time. Provisions that by
                their nature should survive (disclaimers, limitations, indemnity,
                governing law) will survive termination.
              </p>

              <H2>12. Dispute resolution and governing law</H2>
              <p>
                These Terms are governed by the laws of the{" "}
                <strong>State of Florida</strong>, without regard to conflict-of-law
                rules, except where mandatory consumer protections in your country
                apply. You agree that the state and federal courts located in{" "}
                <strong>Miami-Dade County, Florida</strong> have exclusive
                jurisdiction over disputes, subject to any non-waivable rights you
                have to bring claims in your home jurisdiction under applicable law.
              </p>
              <p>
                If you are a consumer in the EU, UK, or another region with
                mandatory venue rules, nothing here limits your ability to bring
                a dispute in your country of residence where required by law.
              </p>

              <H2>13. Changes</H2>
              <p>
                We may update these Terms from time to time. We will post the
                revised version on this page and update the effective date.
                Material changes, including changes to subscription pricing
                or billing terms, will also be communicated through the app
                or by email. If you continue to use Fitfo after changes take
                effect, you accept the updated Terms.
              </p>

              <H2>14. Contact</H2>
              <p>
                Questions about these Terms? Email{" "}
                <a href="mailto:nirv@fitfo.app">nirv@fitfo.app</a>. For privacy
                matters, see our{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--primary-bright)] underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Prose>
          </article>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        space-y-4 text-[14px] leading-[1.7] text-[var(--text-secondary)]
        [&_strong]:text-[var(--text-primary)]
        [&_a]:text-[var(--primary-bright)] [&_a]:underline [&_a]:underline-offset-2
        [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-[var(--primary)]
        [&_li]:pl-1
      "
    >
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-10 scroll-mt-24 text-xl font-bold tracking-[-0.015em] text-[var(--text-primary)] sm:text-2xl"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </h2>
  );
}
