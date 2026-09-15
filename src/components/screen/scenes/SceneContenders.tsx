"use client";

import { motion } from "motion/react";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { AutoScroll } from "../AutoScroll";
import { SceneHeading } from "./SceneRoom";

export function SceneContenders({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="07" title={t.screen.contenders} note={t.screen.contendersNote} />
      <AutoScroll className="mt-10" startDelayMs={1800} windowMs={snapshot.event.sceneDurationSec * 1000}>
        <div className="flex flex-col gap-5">
          {(snapshot.contenders ?? []).map((id, i) => {
            const p = lookups.players.get(id);
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.18 }}
                className="flex items-center gap-10 border-b border-line pb-5"
              >
                <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: p?.color }} />
                <span className="truncate font-display text-[96px] uppercase leading-none tracking-tight">{p?.name}</span>
              </motion.div>
            );
          })}
        </div>
      </AutoScroll>
    </div>
  );
}
