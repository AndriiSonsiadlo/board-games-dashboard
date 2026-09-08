"use client";

import { formatElapsed } from "@/lib/format";
import { useNow } from "./useNow";

export function ElapsedClock({ from, to, className }: { from: number | null; to?: number | null; className?: string }) {
  const now = useNow();
  const text = from === null || now === null ? "--:--:--" : formatElapsed((to ?? now) - from);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} suppressHydrationWarning>
      {text}
    </span>
  );
}
