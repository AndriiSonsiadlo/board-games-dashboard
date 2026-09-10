"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { formatPoints } from "@/domain/scoring";
import type { PublicPlacementView, PublicSnapshot, ResultView } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { revealTimeline } from "./logic";

export function ResultReveal({
  snapshot,
  result,
  onDone,
}: {
  snapshot: PublicSnapshot;
  result: ResultView<PublicPlacementView>;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const game = lookups.games.get(result.gameId);
  const table = result.tableId !== null ? lookups.tables.get(result.tableId) : undefined;
  const winners = result.placements.filter((p) => p.placement === 1);
  const others = result.placements.filter((p) => p.placement !== 1);
  const [phase, setPhase] = useState<"title" | "places" | "winner">("title");
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timeline = revealTimeline(others.length);
    const timers = [
      setTimeout(() => setPhase("places"), timeline.titleMs),
      ...others.map((_, i) => setTimeout(() => setRevealed(i + 1), timeline.firstPlaceMs + i * timeline.stepMs)),
      setTimeout(() => setPhase("winner"), timeline.winnerMs),
      setTimeout(onDone, timeline.doneMs),
    ];
    return () => timers.forEach(clearTimeout);
    // `others` is derived fresh each render from `result.placements`; re-running on every
    // reference change would restart the reveal timeline on each live-poll re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others.length, onDone]);

  // Reveal from last place upwards: the last `revealed` entries of the descending list are visible.
  const descending = [...others].sort((a, b) => b.placement - a.placement);
  const visible = new Set(descending.slice(0, revealed).map((p) => p.playerId));

  return (
    <motion.div
      className="absolute inset-0 z-20 bg-[#070708]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="grid h-full grid-cols-[1fr_780px] gap-20 px-[120px] py-[120px]">
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="flex items-center gap-6 font-display text-[36px] uppercase tracking-[0.3em] text-accent"
          >
            {game ? <GameIcon name={game.icon} className="size-[48px]" /> : null}
            {t.screen.result}
            {table ? <span className="text-muted">· {fmt(t.common.tableN, { n: table.number })}</span> : null}
          </motion.div>
          <motion.h2
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
            className="mt-6 font-display text-[170px] uppercase leading-[0.9] tracking-tight"
          >
            {game?.name}
          </motion.h2>

          {phase === "winner" ? (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE }}
              className="relative mt-16 overflow-hidden border-t border-accent/60 pt-10"
            >
              <div className="font-display text-[40px] uppercase tracking-[0.3em] text-accent">{t.screen.winner}</div>
              {winners.map((w) => (
                <div key={w.playerId} className="mt-2 flex items-baseline gap-10">
                  <span className="font-display text-[190px] uppercase leading-none tracking-tight">
                    {lookups.players.get(w.playerId)?.name}
                  </span>
                  {w.points !== undefined ? (
                    <span className="font-mono text-[60px] text-accent">{formatPoints(w.points)}</span>
                  ) : null}
                </div>
              ))}
              <span
                aria-hidden
                className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-24 bg-accent/25 blur-2xl"
              />
            </motion.div>
          ) : null}
        </div>

        <div className="flex flex-col justify-center">
          <ol className="space-y-7">
            {[...others]
              .sort((a, b) => a.placement - b.placement)
              .map((p) => {
                const shown = phase !== "title" && visible.has(p.playerId);
                return (
                  <motion.li
                    key={p.playerId}
                    initial={false}
                    animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : 40 }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="flex items-baseline gap-8 border-b border-line pb-5"
                  >
                    <span className="w-[120px] font-mono text-[44px] text-muted">{ordinal(lang, p.placement)}</span>
                    <span className="flex-1 truncate font-display text-[64px] uppercase tracking-wide">
                      {lookups.players.get(p.playerId)?.name}
                    </span>
                    {p.points !== undefined ? (
                      <span className={cn("font-mono text-[40px] text-muted")}>{formatPoints(p.points)}</span>
                    ) : null}
                  </motion.li>
                );
              })}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}
