"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { LANDING_CONTENT_MAX } from "@/lib/landingLayout";
import { APP_STORE_URL, SITE_LOGO_SRC } from "@/lib/siteUrls";

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
      className={`sticky top-0 z-40 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out ${
        scrolled
          ? "border-b border-white/[0.06] bg-black/55 backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150"
          : "border-b border-transparent bg-transparent shadow-none backdrop-blur-none"
      }`}
    >
      <div
        className={`mx-auto flex min-h-14 w-full ${LANDING_CONTENT_MAX} items-center justify-between gap-4 px-4 py-2 sm:min-h-16 sm:px-6 md:min-h-[4.25rem] md:py-2.5`}
      >
        <Link
          href="/#top"
          aria-label="Fitfo home"
          className="logo-mark-wrap group flex shrink-0 items-center transition-opacity hover:opacity-95"
        >
          <span className="logo-mark relative inline-flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12 md:h-[3.25rem] md:w-[3.25rem]">
            <Image
              src={SITE_LOGO_SRC}
              alt=""
              width={104}
              height={104}
              className="h-full w-full object-contain"
              priority
            />
          </span>
        </Link>

        <div className="flex items-center gap-5 sm:gap-7">
          <Link
            href="/support"
            className="hidden text-[13px] font-medium text-white/55 transition-colors hover:text-white/85 sm:block"
          >
            Help
          </Link>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="group glass-cta-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold sm:px-6 sm:text-[14px]"
          >
            App Store
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
