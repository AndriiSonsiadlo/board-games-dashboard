"use client";

import { motion } from "motion/react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { SceneHeading } from "./SceneRoom";

export function SceneRecent({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const results = snapshot.recentResults.slice(0, 3);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="02" title={t.screen.recentResults} />
      <div className="mt-16 grid flex-1 grid-cols-3 gap-16">
        {results.map((r, i) => {
          const game = lookups.games.get(r.gameId);
          const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
          return (
            <motion.div
              key={r.sessionId}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.2 + i * 0.15 }}
              className="flex flex-col border-t border-line pt-8"
            >
              <div className="flex items-center gap-4">
                {game ? <GameIcon name={game.icon} className="size-[44px] text-accent" /> : null}
                <span className="truncate font-display text-[56px] uppercase leading-none tracking-wide">{game?.name}</span>
              </div>
              <span className="mt-3 font-display text-[28px] uppercase tracking-[0.2em] text-muted">
                {table ? fmt(t.common.tableN, { n: table.number }) : ""}
              </span>
              <ol className="mt-10 space-y-5">
                {r.placements.slice(0, 5).map((p) => (
                  <li key={p.playerId} className="flex items-baseline gap-6">
                    <span className={cn("w-[90px] font-mono text-[32px]", p.placement === 1 ? "text-accent" : "text-muted")}>
                      {ordinal(lang, p.placement)}
                    </span>
                    <span className={cn("truncate font-display uppercase tracking-wide", p.placement === 1 ? "text-[56px]" : "text-[40px] text-text/80")}>
                      {lookups.players.get(p.playerId)?.name}
                    </span>
                  </li>
                ))}
              </ol>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
