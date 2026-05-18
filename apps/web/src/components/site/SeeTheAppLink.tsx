"use client";

import {
  type MouseEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const TARGET_ID = "see";
const STRIP_HIT_CLASS = "see-strip-hit";
const ARROW_HIT_CLASS = "see-app-link-arrow-hit";

/** Hero “live lifting” ticker — bumps over time to feel credible. */
const LIVE_COUNT_TARGET = 3000;

interface SeeTheAppLinkProps {
  className?: string;
}

/** Hero CTA → smooth scroll + strip pulse on `#see`. Count-up + live dot replace “See the app ↓”. */
export function SeeTheAppLink({ className }: SeeTheAppLinkProps) {
  const rnHitRef = useRef<HTMLSpanElement | null>(null);
  const stripClearRef = useRef<number | undefined>(undefined);
  const rnHitClearRef = useRef<number | undefined>(undefined);

  const [displayCount, setDisplayCount] = useState(LIVE_COUNT_TARGET);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const reduceMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return;

    const start = LIVE_COUNT_TARGET - 162;
    setDisplayCount(start);

    let rafId = 0;
    const durationMs = 2000;
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(
        start + (LIVE_COUNT_TARGET - start) * eased,
      );
      setDisplayCount(v);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setDisplayCount(LIVE_COUNT_TARGET);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const onClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const el =
      typeof document !== "undefined" ? document.getElementById(TARGET_ID) : null;
    const motionOk =
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!el || !motionOk) return;

    e.preventDefault();

    el.classList.remove(STRIP_HIT_CLASS);
    void el.offsetWidth;
    el.classList.add(STRIP_HIT_CLASS);
    window.clearTimeout(stripClearRef.current);
    stripClearRef.current = window.setTimeout(() => {
      stripClearRef.current = undefined;
      el.classList.remove(STRIP_HIT_CLASS);
    }, 1200);

    const rn = rnHitRef.current;
    if (rn) {
      rn.classList.remove(ARROW_HIT_CLASS);
      void rn.offsetWidth;
      rn.classList.add(ARROW_HIT_CLASS);
      window.clearTimeout(rnHitClearRef.current);
      rnHitClearRef.current = window.setTimeout(() => {
        rnHitClearRef.current = undefined;
        rn.classList.remove(ARROW_HIT_CLASS);
      }, 680);
    }

    queueMicrotask(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <a
      href={`#${TARGET_ID}`}
      onClick={onClick}
      className={`inline-flex max-w-[100%] items-center gap-[0.42rem] underline-offset-4 ${className ?? ""}`}
      title="Right now — scroll to preview the app"
      aria-label={`Live: over ${LIVE_COUNT_TARGET}+ people lifting right now. Jump to preview the app.`}
    >
      <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="see-app-live-dot absolute inset-0 rounded-full bg-emerald-400"
        />
      </span>
      <span className="tabular-nums whitespace-nowrap">
        <span className="font-semibold text-white/78">{displayCount}</span>
        <span className="font-semibold text-white/78">+</span>
      </span>
      <span
        ref={rnHitRef}
        aria-hidden
        className="shrink-0 text-[13px] font-semibold lowercase tracking-[0.04em] text-white/52"
      >
        rn
      </span>
    </a>
  );
}
