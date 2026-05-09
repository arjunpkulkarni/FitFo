"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/app/id6762418380";

const NAV_LINKS = [
  { label: "Home", href: "/#top" },
  { label: "How it works", href: "/#how" },
  { label: "Demo", href: "/#demo" },
  { label: "Download", href: APP_STORE_URL, external: true },
  { label: "Support", href: "/support" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,backdrop-filter,border-color] duration-300 ease-out ${
        scrolled
          ? "border-b border-white/[0.06] bg-black/55 backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between px-4 py-2 sm:min-h-16 sm:px-6 md:min-h-[4.25rem] md:py-2.5 lg:px-10 xl:px-12">
        {/* App logo + wordmark */}
        <Link
          href="/#top"
          aria-label="Fitfo home"
          className="logo-mark-wrap group flex items-center gap-2.5 transition-opacity hover:opacity-95"
        >
          <span className="logo-mark relative inline-flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
            <Image
              src="/fitfo-logo.png"
              alt=""
              width={64}
              height={64}
              className="h-full w-full object-contain"
              priority
            />
          </span>
          <span
            className="text-[15px] font-bold tracking-[-0.04em] text-white sm:text-base"
            style={{ fontFamily: "var(--font-display)" }}
          >
            fitfo
          </span>
        </Link>

        {/* Center links (desktop only) */}
        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 md:flex"
        >
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-medium tracking-[0.01em] text-white/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-[13px] font-medium tracking-[0.01em] text-white/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        {/* Right: glassy download button */}
        <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="nav-download inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold tracking-[0.01em] text-white sm:px-5 sm:text-[13px]"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
