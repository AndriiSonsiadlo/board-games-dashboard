"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export const GOLD_DUST_MAX = 40;

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
}

/** Sparse rising gold particles. Winner reveal and finale only. */
export function GoldDust({ count = 32, className }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduce) return;
    const width = (canvas.width = canvas.clientWidth);
    const height = (canvas.height = canvas.clientHeight);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c9a45c";
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const particles: Particle[] = Array.from({ length: Math.max(0, Math.min(GOLD_DUST_MAX, Math.floor(count))) }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      size: rand(1, 3.2),
      speed: rand(18, 60),
      sway: rand(0.4, 1.4),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.35, 0.9),
    }));

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const p of particles) {
        p.y -= p.speed * dt;
        p.phase += dt;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = rand(0, width);
        }
        ctx.globalAlpha = p.alpha * (0.55 + 0.45 * Math.sin(p.phase * 2));
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(p.phase * p.sway) * 14, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count, reduce]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
