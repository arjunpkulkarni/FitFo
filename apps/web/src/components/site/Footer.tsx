import Image from "next/image";
import Link from "next/link";

import { LANDING_CONTENT_MAX } from "@/lib/landingLayout";
import { APP_STORE_URL } from "@/lib/siteUrls";

export function Footer() {
  return (
    <footer
      id="support"
      className="relative border-t border-white/[0.06] bg-black/40 backdrop-blur-2xl"
    >
      <div className={`mx-auto w-full ${LANDING_CONTENT_MAX} px-4 py-14 sm:px-6 sm:py-16 lg:px-6`}>
        <div className="flex flex-col gap-11 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link href="/" aria-label="Fitfo home" className="inline-flex items-center">
              <Image
                src="/fitfo-logo.png"
                alt=""
                width={180}
                height={180}
                className="h-8 w-8 sm:h-9 sm:w-9"
              />
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-white/65 text-pretty">
              TikTok &amp; Reels → real workouts on your phone. Tap share. Hit
              the gym.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-9 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={[
                { label: "App Store", href: APP_STORE_URL, external: true },
                { label: "See screenshots", href: "/#see" },
              ]}
            />
            <FooterCol
              title="Support"
              links={[
                { label: "Help center", href: "/support" },
                { label: "FAQ", href: "/support#faq" },
                { label: "Contact", href: "mailto:nirv@fitfo.app" },
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ]}
            />
          </div>
        </div>

        <div className="mt-11 flex flex-col gap-2.5 border-t border-white/[0.06] pt-6 text-[12px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Vaayu Athletics LLC. All rights reserved.</p>
          <p>
            Questions?{" "}
            <a
              href="mailto:nirv@fitfo.app"
              className="text-[var(--primary-bright)] transition hover:underline"
            >
              nirv@fitfo.app
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      <h4
        className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--primary-bright)]"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {title}
      </h4>
      <ul className="mt-3.5 space-y-2.5">
        {links.map((link) => (
          <li key={`${link.label}-${link.href}`}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-white/65 transition hover:text-white"
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                className="text-[13px] text-white/65 transition hover:text-white"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
