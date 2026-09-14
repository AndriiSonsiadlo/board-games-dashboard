"use client";

import { Award, Flag, Play, Trophy, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { TimelineItem } from "@/domain/timeline";
import { useI18n } from "@/i18n/LangProvider";
import { formatClock } from "@/lib/format";
import { nameLookup, timelineKey, timelineText } from "../common/timelineText";
import { EASE } from "../motion/FadeRise";

const TICKER_ITEMS = 8;
const TICKER_MS = 6000;

const ICONS: Record<TimelineItem["kind"], LucideIcon> = { started: Play, result: Trophy, unlock: Award, milestone: Flag };

/** One recent timeline item at a time, in a strip just above the footer. */
export function ScreenTicker({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICKER_MS);
    return () => clearInterval(id);
  }, []);

  const items = snapshot.timeline.slice(0, TICKER_ITEMS);
  if (items.length === 0) return null;
  const item = items[tick % items.length];
  const Icon = ICONS[item.kind];

  return (
    <div className="absolute inset-x-0 bottom-[110px] z-10 h-[40px] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${timelineKey(item)}-${tick}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-y-0 right-[120px] left-[120px] flex items-center gap-4"
        >
          <span className="font-mono text-[22px] text-muted" suppressHydrationWarning>
            {formatClock(item.at)}
          </span>
          <Icon className="size-[24px] shrink-0 text-accent" strokeWidth={1.5} />
          <span className="truncate text-[26px] text-text/90">{timelineText(item, t, names)}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
