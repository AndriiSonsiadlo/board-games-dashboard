"use client";

import { motion } from "motion/react";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneContenders({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="04" title={t.screen.contenders} note={t.screen.contendersNote} />
      <div className="flex flex-1 flex-col justify-center gap-6">
        {(snapshot.contenders ?? []).map((id, i) => {
          const p = lookups.players.get(id);
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.18 }}
              className="flex items-center gap-10 border-b border-line pb-6"
            >
              <span className="size-5 rounded-full" style={{ backgroundColor: p?.color }} />
              <span className="font-display text-[110px] uppercase leading-none tracking-tight">{p?.name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
