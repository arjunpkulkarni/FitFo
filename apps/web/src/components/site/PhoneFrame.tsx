"use client";

import Image from "next/image";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { useEffect, useRef } from "react";

interface PhoneFrameProps extends ComponentPropsWithoutRef<"div"> {
  src: string;
  alt: string;
  /** Looping poster video; when set, `src` is used as `poster`. */
  videoSrc?: string;
  /**
   * Width of the rendered frame in pixels. The phone aspect ratio (19.5:9ish
   * iPhone shape) is derived from this so the screenshot always sits cleanly
   * inside the bezel.
   */
  width?: number;
  /** Adds a soft orange radial glow behind the phone. */
  glow?: boolean;
  priority?: boolean;
  /**
   * Enable the ambient float animation. When `rotate` is also set, the
   * underlying keyframes compose around it via a CSS custom property so the
   * phone keeps its tilt while gently bobbing.
   */
  float?: boolean | "slow";
  /**
   * Persistent rotation applied to the phone (in degrees). Used both as the
   * resting transform and as the baseline for the float keyframes.
   */
  rotate?: number;
}

/**
 * A minimal iPhone-style frame used to showcase mobile screenshots on the
 * landing and marketing pages. The bezel is rendered in pure CSS so we don't
 * have to ship any extra image assets, and the inner content sits on a
 * rounded black surface to blend with screenshots that already have black
 * backgrounds.
 */
export function PhoneFrame({
  src,
  alt,
  videoSrc,
  width = 280,
  glow = false,
  priority = false,
  float = false,
  rotate,
  className = "",
  style,
  ...rest
}: PhoneFrameProps) {
  const height = Math.round(width * 2.17);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoSrc) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (reduce.matches) {
        el.pause();
        el.autoplay = false;
      } else {
        el.muted = true;
        void el.play().catch(() => {
          /* ignore autoplay rejection */
        });
      }
    };

    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, [videoSrc]);

  // The ambient float keyframes read `--float-rotate` so any phone with a
  // persistent tilt keeps its tilt while bobbing. If no rotation is set, the
  // variable falls back to 0 inside the keyframes.
  const floatClass = float === "slow" ? "float-slow" : float ? "float" : "";
  const rotateStyle: CSSProperties | undefined =
    rotate != null
      ? ({
          transform: `rotate(${rotate}deg)`,
          "--float-rotate": `${rotate}deg`,
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`relative mx-auto ${floatClass} ${className}`}
      style={{ width, ...rotateStyle, ...style }}
      {...rest}
    >
      {glow && (
        <div
          aria-hidden
          className="bg-orange-glow glow-breathe pointer-events-none absolute -inset-16 -z-10"
        />
      )}
      <div
        className="relative rounded-[44px] border border-white/12 bg-black p-2.5 shadow-[0_28px_80px_-24px_rgba(0,0,0,0.75),0_12px_36px_-16px_rgba(0,0,0,0.45)]"
        style={{ width, height }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-black">
          {videoSrc ? (
            <video
              ref={videoRef}
              aria-label={alt}
              className="absolute inset-0 h-full w-full object-cover object-top"
              muted
              loop
              playsInline
              preload="metadata"
              poster={src}
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          ) : (
            <Image
              src={src}
              alt={alt}
              fill
              sizes={`${width}px`}
              className="object-cover object-top"
              priority={priority}
            />
          )}
        </div>
        {/* Dynamic-island placeholder for a more iPhone-y silhouette. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-3 h-[18px] w-[88px] -translate-x-1/2 rounded-full bg-black"
        />
      </div>
    </div>
  );
}
