"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneCounters({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const items = [
    { label: t.screen.gamesCompleted, value: snapshot.counters.gamesCompleted },
    { label: t.screen.tablesActive, value: snapshot.counters.tablesActive },
    { label: t.screen.players, value: snapshot.counters.players },
    { label: t.screen.achievementsUnlocked, value: snapshot.counters.achievementsUnlocked },
  ];

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="03" title={t.screen.liveEvent} />
      <div className="grid flex-1 grid-cols-4 items-center divide-x divide-line">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.2 + i * 0.2 }}
            className="px-14 first:pl-0"
          >
            <div className="font-display text-[230px] leading-none tabular">{item.value}</div>
            <div className="mt-6 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{item.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
