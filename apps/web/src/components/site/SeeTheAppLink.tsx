"use client";

import { useCallback, useRef } from "react";

const TARGET_ID = "see";
const STRIP_HIT_CLASS = "see-strip-hit";
const ARROW_HIT_CLASS = "see-app-link-arrow-hit";

interface SeeTheAppLinkProps {
  className?: string;
}

/** Hero CTA → smooth scroll + short motion on `#see`. Falls back to default jump if reduced-motion. */
export function SeeTheAppLink({ className }: SeeTheAppLinkProps) {
  const arrowElRef = useRef<HTMLSpanElement | null>(null);
  const stripClearRef = useRef<number | undefined>(undefined);
  const arrowClearRef = useRef<number | undefined>(undefined);

  const onClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
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

    const arrow = arrowElRef.current;
    if (arrow) {
      arrow.classList.remove(ARROW_HIT_CLASS);
      void arrow.offsetWidth;
      arrow.classList.add(ARROW_HIT_CLASS);
      window.clearTimeout(arrowClearRef.current);
      arrowClearRef.current = window.setTimeout(() => {
        arrowClearRef.current = undefined;
        arrow.classList.remove(ARROW_HIT_CLASS);
      }, 680);
    }

    queueMicrotask(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <a href={`#${TARGET_ID}`} onClick={onClick} className={className}>
      See the app{" "}
      <span
        ref={arrowElRef}
        aria-hidden
        className="inline-block motion-reduce:inline"
      >
        ↓
      </span>
    </a>
  );
}
