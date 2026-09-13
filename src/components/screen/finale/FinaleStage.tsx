"use client";

import { AnimatePresence, motion } from "motion/react";
import { EASE } from "@/components/motion/FadeRise";
import type { FinaleBeat } from "@/domain/finale";
import { BeatChampion, BeatClosing, BeatComplete, BeatNumbers, BeatPlace, BeatPodium, BeatSealed } from "./beats";
import type { FinaleLookups } from "./lookups";

export function FinaleStage({
  current,
  step,
  lookups,
  event,
}: {
  current: FinaleBeat | null;
  step: number;
  lookups: FinaleLookups;
  event: { city: string; year: number };
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, filter: "blur(8px)" }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {current?.kind === "complete" ? <BeatComplete beat={current} /> : null}
        {current?.kind === "numbers" ? <BeatNumbers beat={current} lookups={lookups} /> : null}
        {current?.kind === "sealed" ? <BeatSealed beat={current} lookups={lookups} /> : null}
        {current?.kind === "place" ? <BeatPlace beat={current} lookups={lookups} /> : null}
        {current?.kind === "champion" ? <BeatChampion beat={current} lookups={lookups} /> : null}
        {current?.kind === "podium" ? <BeatPodium beat={current} lookups={lookups} /> : null}
        {current?.kind === "closing" ? <BeatClosing beat={current} lookups={lookups} event={event} /> : null}
      </motion.div>
    </AnimatePresence>
  );
}
