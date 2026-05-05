"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

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
      className={`sticky top-0 z-40 border-b transition-[background-color,backdrop-filter,border-color,-webkit-backdrop-filter] duration-300 ease-out ${
        scrolled
          ? "nav-surface border-white/[0.06]"
          : "border-transparent bg-transparent [backdrop-filter:none] [-webkit-backdrop-filter:none]"
      }`}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between px-4 py-2 sm:min-h-16 sm:px-6 sm:py-2.5 md:min-h-[4.5rem] md:py-3 xl:px-10">
        <Link
          href="/"
          aria-label="Fitfo home"
          className="flex items-center transition-opacity hover:opacity-90"
        >
          <Image
            src="/fitfo-logo.png"
            alt="Fitfo"
            width={512}
            height={512}
            className="h-11 w-11 sm:h-14 sm:w-14 md:h-16 md:w-16"
            priority
          />
        </Link>

        <nav
          aria-label="Primary"
          className="mr-6 hidden flex-1 flex-wrap justify-end gap-5 text-[13px] font-medium text-[var(--text-secondary)] sm:flex sm:gap-7 md:justify-center"
        >
          <Link
            href="/#how"
            className="transition hover:text-[var(--text-primary)]"
          >
            How it works
          </Link>
          <Link
            href="/#demo"
            className="transition hover:text-[var(--text-primary)]"
          >
            Demo
          </Link>
          <Link
            href="/support#faq"
            className="transition hover:text-[var(--text-primary)]"
          >
            FAQ
          </Link>
          <Link
            href="/support"
            className="transition hover:text-[var(--text-primary)]"
          >
            Support
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <a
            href="https://apps.apple.com/app/id6762418380"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-[12px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:px-4 sm:text-[13px]"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
