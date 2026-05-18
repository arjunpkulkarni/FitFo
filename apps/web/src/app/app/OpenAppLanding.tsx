"use client";

import { useEffect } from "react";

import Image from "next/image";

import {
  APP_STORE_URL,
  FITFO_SCHEME_OPEN_URL,
  PLAY_STORE_URL,
  SITE_LOGO_SRC,
  SITE_URL,
} from "@/lib/siteUrls";

function storeFallbackHref(): string {
  if (typeof navigator === "undefined") {
    return APP_STORE_URL;
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/u.test(ua)) {
    return APP_STORE_URL;
  }
  if (/Android/u.test(ua) && PLAY_STORE_URL.length > 0) {
    return PLAY_STORE_URL;
  }
  return "";
}

export default function OpenAppLanding() {
  useEffect(() => {
    window.location.href = FITFO_SCHEME_OPEN_URL;
    const fallback = storeFallbackHref();
    if (!fallback) {
      return;
    }
    const id = window.setTimeout(() => {
      window.location.replace(fallback);
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <Image
        src={SITE_LOGO_SRC}
        alt="Fitfo"
        width={120}
        height={120}
        className="rounded-3xl shadow-lg shadow-black/40"
        priority
      />

      <div className="space-y-3">
        <p className="text-sm font-semibold tracking-wide text-primary">
          Opening Fitfo…
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          Get the Fitfo app
        </h1>
        <p className="text-pretty text-text-secondary">
          If Fitfo doesn&apos;t open automatically, tap the button below.
          Embedded and in-app browsers often handle HTTPS links more reliably
          than custom URL schemes—that&apos;s why you landed here before the
          App&nbsp;Store.
        </p>
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-3">
        <a
          href={FITFO_SCHEME_OPEN_URL}
          className="rounded-xl bg-primary px-5 py-3.5 text-center text-base font-semibold text-black transition-colors hover:bg-primary-bright"
        >
          Open in app
        </a>
        <a
          href={APP_STORE_URL}
          className="rounded-xl border border-border-soft bg-surface-muted px-5 py-3.5 text-center text-base font-medium text-text-primary transition-colors hover:border-primary/35 hover:bg-surface-raised"
        >
          Download on the App Store
        </a>
        <a href={SITE_URL} className="mt-4 text-center text-sm text-text-muted hover:text-primary-soft-text underline-offset-4 hover:underline">
          Go to fitfo.app
        </a>
      </nav>

      <noscript>
        <p className="text-sm text-text-secondary">
          JavaScript is off. Continue to{" "}
          <a href={APP_STORE_URL} className="text-primary">
            Fitfo on the App Store
          </a>
          .
        </p>
      </noscript>
    </main>
  );
}
