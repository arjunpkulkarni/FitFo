"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { FitfoLoadingAnimation } from "@/components/FitfoLoadingAnimation";

const SPLASH_DONE_KEY = "fitfo:splash-complete:v2";
const MIN_VISIBLE_MS = 1000;
const EXIT_MS = 480;

type Phase = "idle" | "show" | "exit" | "gone";

export function SplashGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const dismissDelayRef = useRef<number | undefined>(undefined);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const dismissedRef = useRef(false);
  const splashRanRef = useRef(false);

  useLayoutEffect(() => {
    dismissedRef.current = false;

    if (pathname.startsWith("/admin")) {
      setPhase("gone");
      return;
    }

    const home = pathname === "/" || pathname === "";
    if (!home) {
      setPhase("idle");
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setPhase("gone");
      return;
    }

    let alreadyDone = false;
    try {
      alreadyDone = sessionStorage.getItem(SPLASH_DONE_KEY) === "1";
    } catch {
      alreadyDone = false;
    }

    if (alreadyDone) {
      setPhase("gone");
      return;
    }

    splashRanRef.current = true;
    setPhase("show");

    let cancelled = false;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    const waitFonts = (): Promise<void> => {
      if (typeof document === "undefined" || !document.fonts?.ready) {
        return Promise.resolve();
      }
      return Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2600)),
      ]);
    };

    async function dismiss() {
      await waitFonts();
      if (cancelled) return;
      await new Promise<void>((resolve) => {
        if (typeof document !== "undefined" && document.readyState === "complete") {
          queueMicrotask(resolve);
          return;
        }
        if (typeof window !== "undefined") {
          window.addEventListener("load", () => resolve(), { once: true });
          return;
        }
        resolve();
      });
      if (cancelled) return;

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - t0;
      dismissDelayRef.current = window.setTimeout(() => {
        if (cancelled || dismissedRef.current) return;
        dismissedRef.current = true;
        setPhase("exit");
      }, Math.max(0, MIN_VISIBLE_MS - elapsed));
    }

    void dismiss();

    return () => {
      cancelled = true;
      if (dismissDelayRef.current !== undefined) {
        clearTimeout(dismissDelayRef.current);
        dismissDelayRef.current = undefined;
      }
    };
  }, [pathname]);

  useEffect(() => {
    if (phase !== "exit") return;
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = undefined;
      setPhase("gone");
    }, EXIT_MS);
    return () => {
      if (exitTimerRef.current !== undefined) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = undefined;
      }
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "gone" || !splashRanRef.current) return;
    try {
      if (pathname === "/" || pathname === "") {
        sessionStorage.setItem(SPLASH_DONE_KEY, "1");
      }
    } catch {
      /* quota / privacy mode */
    }
  }, [phase, pathname]);

  const overlay =
    phase === "show" || phase === "exit" ? (
      <div
        aria-busy={phase === "show"}
        aria-hidden={phase === "exit"}
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black px-6 transition-opacity ease-out motion-reduce:!transition-none ${
          phase === "exit"
            ? "pointer-events-none opacity-0 duration-[480ms]"
            : "opacity-100 duration-[320ms]"
        }`}
      >
        <FitfoLoadingAnimation className="w-full max-w-44" caption="loading" />
      </div>
    ) : null;

  return (
    <>
      {children}
      {overlay}
    </>
  );
}
