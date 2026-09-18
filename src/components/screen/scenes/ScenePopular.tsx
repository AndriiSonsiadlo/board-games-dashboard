"use client";

import { motion } from "motion/react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { AUTOSCROLL_FADE_SIZE, AutoScroll } from "../AutoScroll";
import { SceneHeading } from "./SceneRoom";

const ROWS = 8;

export function ScenePopular({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const rows = snapshot.stats.popularity.slice(0, ROWS);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = snapshot.stats.gamesCompleted;

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="06" title={t.screen.popular} note={`${total} ${plural(lang, total, t.plurals.games)}`} />
      <AutoScroll className="mt-12" startDelayMs={1500} windowMs={snapshot.event.sceneDurationSec * 1000}>
      <ul className="flex flex-col gap-7" style={{ paddingBlock: AUTOSCROLL_FADE_SIZE }}>
        {rows.map((row, i) => {
          const game = lookups.games.get(row.gameId);
          return (
            <li key={row.family} className="grid grid-cols-[64px_460px_1fr_140px] items-center gap-8">
              {game ? <GameIcon name={game.icon} className={cn("size-[52px]", i === 0 ? "text-accent" : "text-muted")} /> : <span />}
              <span className="truncate font-display text-[54px] uppercase leading-none tracking-wide">{game?.name}</span>
              <div className="h-[18px] bg-line">
                <motion.div
                  className={cn("h-full origin-left", i === 0 ? "bg-accent" : "bg-text/40")}
                  style={{ width: `${(row.count / max) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.3 + i * 0.12 }}
                />
              </div>
              <span className="text-right font-display text-[64px] leading-none tabular">{row.count}</span>
            </li>
          );
        })}
      </ul>
      </AutoScroll>
    </div>
  );
}
