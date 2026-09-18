"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { autoScrollPlan } from "./scrollPlan";

const FADE = "linear-gradient(to bottom, transparent 0, black 56px, black calc(100% - 56px), transparent 100%)";

/** Fills its flex parent. When the content is taller, it glides between the edges in a slow loop. */
export function AutoScroll({
  children,
  className,
  from = "top",
  startDelayMs = 1500,
  windowMs,
  align = "center",
  loop = true,
}: {
  children: React.ReactNode;
  className?: string;
  from?: "top" | "bottom";
  startDelayMs?: number;
  windowMs?: number;
  align?: "center" | "start";
  /** false glides once and holds at the far edge instead of looping back and forth forever. */
  loop?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ viewport: 0, content: 0 });
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const measure = () =>
      setSize((s) => {
        const next = { viewport: viewport.clientHeight, content: content.offsetHeight };
        return next.viewport === s.viewport && next.content === s.content ? s : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const plan = reduce || size.viewport === 0 ? null : autoScrollPlan({ ...size, from, startDelayMs, windowMs, loop });

  return (
    <div
      ref={viewportRef}
      data-autoscroll
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      style={plan ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
    >
      <motion.div
        ref={contentRef}
        className={cn("shrink-0", align === "center" && "my-auto")}
        initial={false}
        animate={plan ? { y: plan.offsets.map((o) => -o) } : { y: 0 }}
        transition={
          plan
            ? { duration: plan.durationMs / 1000, times: plan.times, ease: "easeInOut", repeat: plan.loop ? Infinity : 0 }
            : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
