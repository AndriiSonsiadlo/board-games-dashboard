"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "./FadeRise";

const integer = (n: number) => String(Math.round(n));

export function NumberRoll({
  value,
  format = integer,
  duration = 1.4,
  delay = 0,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, { duration, delay, ease: EASE, onUpdate: setShown });
    return () => controls.stop();
  }, [value, duration, delay, reduce]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(reduce ? value : shown)}
    </span>
  );
}
