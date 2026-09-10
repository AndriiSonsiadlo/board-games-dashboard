"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSnapshot, ScreenAnnouncement } from "@/domain/snapshot";
import { nextAnnouncements } from "./logic";
import { MilestoneCard } from "./MilestoneCard";
import { ResultReveal } from "./ResultReveal";

const SEEN_KEY = "bgc_screen_seen";

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // ignore
  }
}

/** Plays queued announcements one at a time; reports whether something is on screen. */
export function AnnouncementPlayer({
  snapshot,
  onActiveChange,
}: {
  snapshot: PublicSnapshot;
  onActiveChange: (active: boolean) => void;
}) {
  const [queue, setQueue] = useState<ScreenAnnouncement[]>([]);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (seen.current === null) seen.current = readSeen();
    const fresh = nextAnnouncements(snapshot.announcements, seen.current, Date.now());
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    writeSeen(seen.current);
    setQueue((q) => [...q, ...fresh]);
  }, [snapshot.announcements]);

  const current = queue[0];

  useEffect(() => {
    onActiveChange(Boolean(current));
  }, [current, onActiveChange]);

  const done = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <AnimatePresence>
      {current?.type === "result_reveal" ? (
        <ResultReveal key={current.id} snapshot={snapshot} result={current.result} onDone={done} />
      ) : null}
      {current?.type === "milestone" ? <MilestoneCard key={current.id} count={current.count} onDone={done} /> : null}
    </AnimatePresence>
  );
}
