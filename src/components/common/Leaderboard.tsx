"use client";

import { ArrowDown, ArrowUp, Crown, Minus, Spade } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatPoints } from "@/domain/scoring";
import type { LeaderboardRow, PlayerView } from "@/domain/snapshot";
import { fmt, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { EASE } from "../motion/FadeRise";
import { Avatar } from "./Avatar";
import { diffStandings, type StandingsMemory } from "./leaderboardDiff";

function useStandingsChanges(rows: LeaderboardRow[]) {
  const memory = useRef<StandingsMemory | null>(null);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [newLeader, setNewLeader] = useState<number | null>(null);

  useEffect(() => {
    const diff = diffStandings(memory.current, rows);
    memory.current = diff.memory;
    if (diff.changed.length > 0) setChanged(new Set(diff.changed));
    if (diff.newLeader !== null) setNewLeader(diff.newLeader);
  }, [rows]);

  useEffect(() => {
    if (changed.size === 0) return;
    const id = setTimeout(() => setChanged(new Set()), 2000);
    return () => clearTimeout(id);
  }, [changed]);

  useEffect(() => {
    if (newLeader === null) return;
    const id = setTimeout(() => setNewLeader(null), 5000);
    return () => clearTimeout(id);
  }, [newLeader]);

  return { changed, newLeader };
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">·</span>;
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-up">
        <ArrowUp className="size-3.5" />
        {value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-down">
        <ArrowDown className="size-3.5" />
        {Math.abs(value)}
      </span>
    );
  }
  return <Minus className="size-3.5 text-muted" />;
}

export function Leaderboard({
  rows,
  players,
  showJoker = false,
}: {
  rows: LeaderboardRow[];
  players: Map<number, PlayerView>;
  showJoker?: boolean;
}) {
  const { t, lang } = useI18n();
  const { changed, newLeader } = useStandingsChanges(rows);
  const ranked = rows.filter((r) => r.rank !== null);
  const unranked = rows.filter((r) => r.rank === null);

  if (ranked.length === 0) return <p className="text-muted">{t.standings.empty}</p>;

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {newLeader !== null ? (
          <motion.div
            key={newLeader}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex items-center gap-3 rounded-md border border-accent/60 bg-accent/10 px-4 py-3"
          >
            <Crown className="size-5 text-accent" strokeWidth={1.5} />
            <span className="label-caps text-accent">{t.standings.newLeader}</span>
            <span className="font-display text-xl uppercase tracking-wide">{players.get(newLeader)?.name}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="label-caps hidden grid-cols-[3.5rem_1fr_7rem_4rem_4rem_4rem] gap-3 px-3 md:grid">
        <span>{t.standings.rank}</span>
        <span>{t.standings.player}</span>
        <span className="text-right">{t.standings.counted}</span>
        <span className="text-right">{t.standings.games}</span>
        <span className="text-right">{t.standings.wins}</span>
        <span className="text-right">{t.standings.trend}</span>
      </div>

      <ol className="divide-y divide-line border-y border-line">
        {ranked.map((row) => {
          const player = players.get(row.playerId);
          return (
            <motion.li
              key={row.playerId}
              layout
              transition={{ layout: { duration: 0.6, ease: EASE } }}
              className={cn(
                "grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 px-3 py-3 transition-colors duration-700 md:grid-cols-[3.5rem_1fr_7rem_4rem_4rem_4rem]",
                changed.has(row.playerId) && "bg-accent/10",
              )}
            >
              <span className={cn("font-display text-3xl leading-none tabular", row.rank === 1 ? "text-accent" : "text-text/80")}>
                {row.rank}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                {player ? <Avatar name={player.name} color={player.color} /> : null}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-lg uppercase tracking-wide">{player?.name}</span>
                    {showJoker && row.jokerUsed ? <Spade className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} /> : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted md:hidden">
                    <span>
                      {row.gamesPlayed} {plural(lang, row.gamesPlayed, t.plurals.games)} · {t.standings.wins} {row.wins}
                    </span>
                    <Trend value={row.trend} />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn("font-mono text-xl tabular", row.rank === 1 && "text-accent")}>{formatPoints(row.counted)}</div>
                {row.excludedSessionIds.length > 0 ? (
                  <div className="text-[0.68rem] text-muted">
                    {t.standings.raw} {formatPoints(row.raw)} · {fmt(t.standings.excluded, { n: row.excludedSessionIds.length })}
                  </div>
                ) : null}
              </div>
              <span className="hidden text-right font-mono text-muted tabular md:block">{row.gamesPlayed}</span>
              <span className="hidden text-right font-mono text-muted tabular md:block">{row.wins}</span>
              <span className="hidden justify-end md:flex">
                <Trend value={row.trend} />
              </span>
            </motion.li>
          );
        })}
      </ol>

      {unranked.length > 0 ? (
        <p className="text-xs text-muted">
          {unranked
            .map((r) => players.get(r.playerId)?.name)
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}
