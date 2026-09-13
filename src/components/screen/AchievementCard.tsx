"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { MaskReveal } from "@/components/motion/MaskReveal";
import type { AchievementId } from "@/domain/achievements";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";

export const ACHIEVEMENT_CARD_MS = 5500;

export function AchievementCard({
  snapshot,
  achievementId,
  playerId,
  onDone,
}: {
  snapshot: PublicSnapshot;
  achievementId: AchievementId;
  playerId: number;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const player = lookups.players.get(playerId);
  const def = t.achievements.defs[achievementId];

  useEffect(() => {
    const id = setTimeout(onDone, ACHIEVEMENT_CARD_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center bg-[#070708]/95 px-[160px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="grid size-[340px] shrink-0 place-items-center rounded-md border border-accent/60"
      >
        <AchievementIcon id={achievementId} className="size-[180px] text-accent" />
      </motion.div>
      <div className="ml-[100px] min-w-0">
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.7em" }}
          animate={{ opacity: 1, letterSpacing: "0.32em" }}
          transition={{ duration: 1, ease: EASE }}
          className="font-display text-[40px] uppercase text-accent"
        >
          {t.screen.achievementUnlocked}
        </motion.div>
        <MaskReveal delay={0.35} className="mt-4">
          <div className="font-display text-[150px] uppercase leading-[0.9] tracking-tight">{def.title}</div>
        </MaskReveal>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-6 text-[40px] text-muted"
        >
          {def.description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 1.3 }}
          className="mt-12 flex items-center gap-6 border-t border-line pt-8"
        >
          <span className="h-[70px] w-[6px] rounded-sm" style={{ backgroundColor: player?.color }} />
          <span className="font-display text-[90px] uppercase leading-none tracking-tight">{player?.name}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
