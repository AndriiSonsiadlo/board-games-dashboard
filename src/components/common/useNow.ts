"use client";

import { useEffect, useState } from "react";

/** Returns null during SSR and the first client render to avoid hydration mismatches. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seeds the clock on mount to avoid an SSR/client hydration mismatch, then ticks on an interval.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
