"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSnapshot, ScreenAnnouncement } from "@/domain/snapshot";
import { AchievementCard } from "./AchievementCard";
import { nextAnnouncements, pickNext } from "./logic";
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
  const [current, setCurrent] = useState<ScreenAnnouncement | null>(null);
  const [tick, setTick] = useState(0);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (seen.current === null) seen.current = readSeen();
    const fresh = nextAnnouncements(snapshot.announcements, seen.current, Date.now());
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    writeSeen(seen.current);
    setQueue((q) => [...q, ...fresh]);
  }, [snapshot.announcements]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const id = setTimeout(() => {
      const next = pickNext(queue, Date.now());
      if (!next) {
        setTick((n) => n + 1);
        return;
      }
      setQueue((q) => q.filter((item) => item.id !== next.id));
      setCurrent(next);
    }, 400);
    return () => clearTimeout(id);
  }, [current, queue, tick]);

  useEffect(() => {
    onActiveChange(Boolean(current));
  }, [current, onActiveChange]);

  const done = useCallback(() => setCurrent(null), []);

  return (
    <AnimatePresence>
      {current?.type === "result_reveal" ? (
        <ResultReveal key={current.id} snapshot={snapshot} result={current.result} onDone={done} />
      ) : null}
      {current?.type === "milestone" ? <MilestoneCard key={current.id} count={current.count} onDone={done} /> : null}
      {current?.type === "achievement" ? (
        <AchievementCard
          key={current.id}
          snapshot={snapshot}
          achievementId={current.achievementId}
          playerId={current.playerId}
          onDone={done}
        />
      ) : null}
    </AnimatePresence>
  );
}
