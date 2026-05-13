"use client";

import { useEffect, useId, useMemo, useRef } from "react";

const ORANGE = "#FF5A14";
const ORANGE_HI = "#FF6A2C";
const BG = "#000";
const DURATION = 2400;
const HOLD = 900;
const FADE = 600;
/** One draw + hold + fade (ms); synced with splash minimum duration */
export const FITFO_LOADING_CYCLE_MS = DURATION + HOLD + FADE;
const SPARK_COUNT = 10;

const PTS = [
  { x: 190, y: 720 },
  { x: 430, y: 470 },
  { x: 560, y: 600 },
  { x: 834, y: 310 },
];

type Point = (typeof PTS)[number];

interface Segment {
  from: Point;
  to: Point;
  len: number;
  start: number;
}

interface SparkState {
  bornAt: number;
  lifetime: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r0: number;
}

interface FitfoLoadingAnimationProps {
  caption?: string;
  className?: string;
  label?: string;
}

const { segs, total } = polyLengths(PTS);
const fullPath = `M ${PTS.map((point) => `${point.x} ${point.y}`).join(" L ")}`;

export function FitfoLoadingAnimation({
  caption = "loading",
  className = "",
  label = "Fitfo is loading",
}: FitfoLoadingAnimationProps) {
  const clipId = useDomId("fitfo-loader-clip");
  const corePathRef = useRef<SVGPathElement | null>(null);
  const headRef = useRef<SVGCircleElement | null>(null);
  const apexDotRef = useRef<SVGCircleElement | null>(null);
  const sparkRefs = useRef<Array<SVGCircleElement | null>>([]);
  const sparks = useMemo<SparkState[]>(
    () =>
      Array.from({ length: SPARK_COUNT }, () => ({
        bornAt: -1,
        lifetime: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r0: 0,
      })),
    [],
  );

  useEffect(() => {
    const corePath = corePathRef.current;
    const head = headRef.current;
    const apexDot = apexDotRef.current;

    if (!corePath || !head || !apexDot) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      corePath.setAttribute("d", pathUpTo(total));
      apexDot.setAttribute("opacity", "1");
      return;
    }

    let animationFrame = 0;
    let start = performance.now();
    let lastSparkTime = 0;

    const spawnSpark = (now: number, x: number, y: number) => {
      const spark = sparks.find((candidate) => {
        return now > candidate.bornAt + candidate.lifetime;
      });

      if (!spark) return;

      spark.bornAt = now;
      spark.lifetime = 400 + Math.random() * 300;
      spark.x = x + (Math.random() - 0.5) * 16;
      spark.y = y + (Math.random() - 0.5) * 16;
      spark.vx = (Math.random() - 0.5) * 0.4;
      spark.vy = (Math.random() - 0.2) * 0.4 - 0.2;
      spark.r0 = 3 + Math.random() * 5;
    };

    const updateSparks = (now: number) => {
      sparks.forEach((spark, index) => {
        const el = sparkRefs.current[index];
        if (!el || spark.bornAt < 0) return;

        const age = now - spark.bornAt;
        if (age > spark.lifetime) {
          el.setAttribute("opacity", "0");
          return;
        }

        const t = age / spark.lifetime;
        const x = spark.x + spark.vx * age;
        const y = spark.y + spark.vy * age + 0.0008 * age * age;
        const r = spark.r0 * (1 - t);
        const opacity = 1 - t;

        el.setAttribute("cx", String(x));
        el.setAttribute("cy", String(y));
        el.setAttribute("r", String(r));
        el.setAttribute("opacity", String(opacity));
      });
    };

    const frame = (now: number) => {
      let elapsed = now - start;
      if (elapsed > FITFO_LOADING_CYCLE_MS) {
        start = now;
        elapsed = 0;
      }

      if (elapsed <= DURATION) {
        const t = elapsed / DURATION;
        const distance = easeInOutCubic(t) * total;
        const d = pathUpTo(distance);
        const point = pointAt(distance);

        corePath.setAttribute("d", d);
        corePath.setAttribute("stroke-opacity", "1");
        head.setAttribute("cx", String(point.x));
        head.setAttribute("cy", String(point.y));
        head.setAttribute("opacity", String(Math.min(1, t * 8)));
        apexDot.setAttribute("opacity", "0");

        if (now - lastSparkTime > 40) {
          spawnSpark(now, point.x, point.y);
          lastSparkTime = now;
        }
      } else if (elapsed <= DURATION + HOLD) {
        const endPoint = PTS[PTS.length - 1];
        const holdT = (elapsed - DURATION) / HOLD;

        corePath.setAttribute("d", pathUpTo(total));
        corePath.setAttribute("stroke-opacity", "1");
        head.setAttribute("opacity", "0");
        apexDot.setAttribute("opacity", "1");

        if (holdT < 0.15 && now - lastSparkTime > 20) {
          spawnSpark(now, endPoint.x, endPoint.y);
          lastSparkTime = now;
        }
      } else {
        const fadeT = (elapsed - DURATION - HOLD) / FADE;
        const opacity = Math.max(0, 1 - fadeT);

        corePath.setAttribute("stroke-opacity", String(opacity));
        head.setAttribute("opacity", "0");
        apexDot.setAttribute("opacity", String(opacity));
      }

      updateSparks(now);
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(animationFrame);
  }, [sparks]);

  return (
    <div
      aria-label={label}
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
    >
      <div className="relative aspect-square w-full max-w-36">
        <svg
          aria-hidden
          className="block h-full w-full rounded-[22.37%]"
          viewBox="0 0 1024 1024"
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={squircle(1024)} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <rect width="1024" height="1024" fill={BG} />
            <path
              d={fullPath}
              fill="none"
              stroke={ORANGE}
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeOpacity="0.06"
              strokeWidth="88"
            />
            <path
              ref={corePathRef}
              d=""
              fill="none"
              stroke={ORANGE}
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth="88"
            />
            <g>
              {sparks.map((_, index) => (
                <circle
                  key={index}
                  ref={(node) => {
                    sparkRefs.current[index] = node;
                  }}
                  fill={ORANGE}
                  opacity="0"
                  r="0"
                />
              ))}
            </g>
            <circle
              ref={headRef}
              cx="0"
              cy="0"
              fill={ORANGE_HI}
              opacity="0"
              r="36"
            />
            <circle
              ref={apexDotRef}
              cx={PTS[PTS.length - 1].x}
              cy={PTS[PTS.length - 1].y}
              fill={ORANGE_HI}
              opacity="0"
              r="36"
            />
          </g>
        </svg>
      </div>
      {caption ? (
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.24em] text-text-muted">
          <span className="text-primary-bright">Fitfo</span> · {caption}
        </p>
      ) : null}
    </div>
  );
}

function useDomId(prefix: string) {
  const id = useId();

  return `${prefix}-${id.replace(/:/g, "")}`;
}

function polyLengths(pts: Point[]) {
  const nextSegs: Segment[] = [];
  let nextTotal = 0;

  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);

    nextSegs.push({
      from: pts[i - 1],
      to: pts[i],
      len,
      start: nextTotal,
    });
    nextTotal += len;
  }

  return { segs: nextSegs, total: nextTotal };
}

function pointAt(distance: number) {
  const clamped = Math.max(0, Math.min(total, distance));

  for (const seg of segs) {
    if (clamped <= seg.start + seg.len) {
      const t = (clamped - seg.start) / seg.len;

      return {
        x: seg.from.x + (seg.to.x - seg.from.x) * t,
        y: seg.from.y + (seg.to.y - seg.from.y) * t,
      };
    }
  }

  return PTS[PTS.length - 1];
}

function pathUpTo(distance: number) {
  const clamped = Math.max(0, Math.min(total, distance));
  let d = `M ${PTS[0].x} ${PTS[0].y}`;
  let covered = 0;

  for (const seg of segs) {
    if (covered + seg.len <= clamped) {
      d += ` L ${seg.to.x} ${seg.to.y}`;
      covered += seg.len;
    } else {
      const remaining = clamped - covered;
      const t = remaining / seg.len;
      const x = seg.from.x + (seg.to.x - seg.from.x) * t;
      const y = seg.from.y + (seg.to.y - seg.from.y) * t;

      d += ` L ${x} ${y}`;
      break;
    }
  }

  return d;
}

function squircle(size: number) {
  const r = size * 0.2237;

  return `M ${r},0 L ${size - r},0 C ${size - r / 2.5},0 ${size},${
    r / 2.5
  } ${size},${r}
    L ${size},${size - r} C ${size},${size - r / 2.5} ${
      size - r / 2.5
    },${size} ${size - r},${size}
    L ${r},${size} C ${r / 2.5},${size} 0,${size - r / 2.5} 0,${size - r}
    L 0,${r} C 0,${r / 2.5} ${r / 2.5},0 ${r},0 Z`;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
