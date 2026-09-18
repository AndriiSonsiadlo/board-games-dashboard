"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const GRAVITY = 420;
const DRAG = 0.35;
const LIFETIME_S = 3.2;
const FADE_FROM_S = 2.2;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  fill: string;
}

/** Canvas fillStyle doesn't resolve CSS custom properties (no element context) - GoldDust hits the same wall. */
function resolveColor(color: string): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(color.trim());
  if (!ref) return color;
  return getComputedStyle(document.documentElement).getPropertyValue(ref[1]).trim() || color;
}

/** One-shot confetti burst that fires outward from the top-center and falls with gravity. Medal reveals only. */
export function ConfettiBurst({
  count = 60,
  color,
  delayMs = 0,
  className,
}: {
  count?: number;
  color: string;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduce) return;
    const width = (canvas.width = canvas.clientWidth);
    const height = (canvas.height = canvas.clientHeight);
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const resolved = resolveColor(color);
    const originX = width / 2;
    const originY = height * 0.22;
    const pieces: Piece[] = Array.from({ length: Math.max(0, Math.floor(count)) }, () => {
      const angle = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const speed = rand(220, 620);
      const tint = rand(-16, 16);
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(6, 13),
        angle: rand(0, Math.PI * 2),
        spin: rand(-6, 6),
        fill: `color-mix(in oklab, ${resolved} 80%, ${tint >= 0 ? "white" : "black"} ${Math.abs(tint)}%)`,
      };
    });

    let frame = 0;
    const run = () => {
      const start = performance.now();
      let last = start;
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const elapsed = (now - start) / 1000;
        ctx.clearRect(0, 0, width, height);
        for (const p of pieces) {
          p.vy += GRAVITY * dt;
          p.vx *= 1 - DRAG * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.angle += p.spin * dt;
          const fade = elapsed < FADE_FROM_S ? 1 : Math.max(0, 1 - (elapsed - FADE_FROM_S) / (LIFETIME_S - FADE_FROM_S));
          if (fade <= 0) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.fill;
          ctx.fillRect(-p.size / 2, -p.size / 3.2, p.size, p.size / 1.6);
          ctx.restore();
        }
        if (elapsed < LIFETIME_S) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(run, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [count, color, delayMs, reduce]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
