"use client";

import { Minus, Plus } from "lucide-react";

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  label?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="inline-flex h-10 items-stretch rounded-md border border-line-strong" aria-label={label}>
      <button
        type="button"
        className="grid w-10 place-items-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus className="size-4" />
      </button>
      <span className="grid min-w-14 place-items-center border-x border-line px-2 font-mono text-sm tabular">
        {format(value)}
      </span>
      <button
        type="button"
        className="grid w-10 place-items-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
