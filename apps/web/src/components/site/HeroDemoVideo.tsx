"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

interface HeroDemoVideoProps {
  /** Optional poster; omit when the image still shows unwanted device chrome. */
  poster?: string;
  src: string;
  label: string;
}

/** Looping muted hero demo — gentle object-cover (~110%) so reels aren’t sheared off top/bottom. */
export function HeroDemoVideo({ poster, src, label }: HeroDemoVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (reduce.matches) {
        el.pause();
      } else {
        el.muted = true;
        void el.play().catch(() => {
          /* autoplay denied — keep poster / black */
        });
      }
    };

    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, []);

  return (
    <div
      className="float relative mx-auto w-[min(268px,88vw)]"
      style={
        {
          "--float-rotate": "-3deg",
        } as CSSProperties
      }
    >
      {/* Slightly taller than classic 9:16 + modest scale so object-cover trims less top/bottom */}
      <div className="relative aspect-[9/16.85] w-full overflow-hidden rounded-[20px] bg-black shadow-[0_18px_52px_-32px_rgba(0,0,0,0.55)]">
        <video
          ref={ref}
          aria-label={label}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-cover object-[50%_50%]"
          style={{
            height: "110%",
            minHeight: "100%",
            width: "106%",
          }}
          muted
          loop
          playsInline
          preload="metadata"
          {...(poster ? { poster } : {})}
        >
          <source src={src} type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
