"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";

type RevealVariant = "up" | "scale";

/** `viewport` — animate when scrolled into view (default). `load` — animate on first paint after hydrate (stagger with `delay`). */
type RevealWhen = "viewport" | "load";

interface RevealProps {
  children: ReactNode;
  /** Delay in ms before this element animates. Useful for staggering siblings. */
  delay?: number;
  /** Which entrance shape to use , plain translate (`up`) or translate + scale (`scale`). */
  variant?: RevealVariant;
  /** When to run the entrance transition. */
  when?: RevealWhen;
  /** Element tag to render , defaults to `div`. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fade + slide into view. Default: IntersectionObserver fires once per element.
 * `when="load"` runs on mount (after layout) so the full page can choreograph
 * on first visit without waiting for scroll.
 */
export function Reveal({
  children,
  delay = 0,
  variant = "up",
  when = "viewport",
  as: Component = "div",
  className = "",
  style,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useLayoutEffect(() => {
    if (when !== "load") return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }

    setInView(true);
  }, [when]);

  useEffect(() => {
    if (when !== "viewport") return;

    const node = ref.current;
    if (!node) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -64px 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [when]);

  const variantClass = variant === "scale" ? "reveal-scale" : "reveal-up";
  const classes = [
    "reveal",
    variantClass,
    inView ? "in-view" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component
      ref={ref as React.RefObject<HTMLElement>}
      className={classes}
      style={{
        ...style,
        transitionDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </Component>
  );
}
