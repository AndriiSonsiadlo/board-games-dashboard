"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { GoldDust } from "@/components/motion/GoldDust";
import { MaskReveal } from "@/components/motion/MaskReveal";
import { formatPoints } from "@/domain/scoring";
import type { PublicPlacementView, PublicSnapshot, ResultView } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { AutoScroll } from "./AutoScroll";
import { podiumSlots, revealGroups, revealTimeline } from "./logic";

type Phase = "title" | "places" | "winner" | "podium";

const PODIUM_HEIGHT = { 1: 360, 2: 250, 3: 180 } as const;

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
  const groups = revealGroups(result.placements);
  const [phase, setPhase] = useState<Phase>("title");
  const [revealed, setRevealed] = useState(0);
  const name = (playerId: number) => lookups.players.get(playerId)?.name ?? "";

  useEffect(() => {
    const timeline = revealTimeline(groups.length);
    const timers = [
      setTimeout(() => setPhase("places"), timeline.titleMs),
      ...groups.map((_, i) => setTimeout(() => setRevealed(i + 1), timeline.firstPlaceMs + i * timeline.stepMs)),
      setTimeout(() => setPhase("winner"), timeline.winnerMs),
      setTimeout(() => setPhase("podium"), timeline.podiumMs),
      setTimeout(onDone, timeline.doneMs),
    ];
    return () => timers.forEach(clearTimeout);
    // `groups` is derived fresh each render from `result.placements`; re-running on every
    // reference change would restart the reveal timeline on each live-poll re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, onDone]);

  const visible = new Set(groups.slice(0, revealed).flat().map((p) => p.playerId));
  const listTimeline = revealTimeline(groups.length);
  const showPodiumPhase = phase === "podium" && snapshot.event.showPodium;

  return (
    <motion.div
      className="absolute inset-0 z-20 bg-[#070708]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {phase === "winner" || showPodiumPhase ? <GoldDust count={32} /> : null}

      {showPodiumPhase ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative flex h-full flex-col px-[120px] pt-[110px] pb-[120px]"
        >
          <div className="flex items-center gap-6 font-display text-[36px] uppercase tracking-[0.3em] text-accent">
            {game ? <GameIcon name={game.icon} className="size-[44px]" /> : null}
            {game?.name}
            <span className="text-muted">· {t.screen.podium}</span>
          </div>
          <div className="mt-auto grid grid-cols-3 items-end gap-10">
            {podiumSlots(result.placements).map((slot, i) => (
              <div key={slot.placement} className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "mb-6 font-display uppercase leading-[0.95] tracking-tight",
                    slot.placement === 1 ? "text-[96px] text-text" : "text-[64px] text-text/85",
                  )}
                >
                  {slot.playerIds.map((id) => (
                    <div key={id}>{name(id)}</div>
                  ))}
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: PODIUM_HEIGHT[slot.placement] }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.12 }}
                  className={cn(
                    "flex w-full items-start justify-center border-t pt-6",
                    slot.placement === 1 ? "border-accent bg-accent/10" : "border-line-strong bg-white/[0.03]",
                  )}
                >
                  <span className={cn("font-mono text-[56px]", slot.placement === 1 ? "text-accent" : "text-muted")}>
                    {ordinal(lang, slot.placement)}
                  </span>
                </motion.div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="relative grid h-full grid-cols-[1fr_780px] gap-20 px-[120px] py-[120px]">
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
            <MaskReveal delay={0.2} duration={1.1} className="mt-6">
              <h2 className="font-display text-[170px] uppercase leading-[0.9] tracking-tight">{game?.name}</h2>
            </MaskReveal>

            <motion.div
              initial={false}
              animate={{ opacity: phase === "winner" ? 1 : 0, y: phase === "winner" ? 0 : 40 }}
              transition={{ duration: 0.9, ease: EASE }}
              className="relative mt-16 overflow-hidden border-t border-accent/60 pt-10"
            >
              <div className="font-display text-[40px] uppercase tracking-[0.3em] text-accent">{t.screen.winner}</div>
              {winners.map((w) => (
                <div key={w.playerId} className="mt-2 flex items-baseline gap-10">
                  <span className="font-display text-[190px] uppercase leading-none tracking-tight">
                    <span className={cn(phase === "winner" && "animate-text-shimmer")} style={{ animationDelay: "0.9s" }}>
                      {name(w.playerId)}
                    </span>
                  </span>
                  {w.points !== undefined ? (
                    <span className="font-mono text-[60px] text-accent">{formatPoints(w.points)}</span>
                  ) : null}
                </div>
              ))}
            </motion.div>
          </div>

          <div className="flex min-h-0 flex-col">
            <AutoScroll from="bottom" startDelayMs={listTimeline.firstPlaceMs} windowMs={listTimeline.winnerMs} loop={false}>
            <ol className="space-y-7">
              {[...groups]
                .reverse()
                .flat()
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
                      <span className="flex-1 truncate font-display text-[64px] uppercase tracking-wide">{name(p.playerId)}</span>
                      {p.points !== undefined ? (
                        <span className="font-mono text-[40px] text-muted">{formatPoints(p.points)}</span>
                      ) : null}
                    </motion.li>
                  );
                })}
            </ol>
            </AutoScroll>
          </div>
        </div>
      )}
    </motion.div>
  );
}
