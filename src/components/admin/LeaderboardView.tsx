"use client";

import { useMemo } from "react";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { Leaderboard } from "../common/Leaderboard";
import { useAdminLive } from "../live/LiveProvider";

export function LeaderboardView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const players = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);
  const scoring = snapshot.event.scoring;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.standings.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {scoring.strategy === "bestN" ? fmt(t.standings.strategyBestN, { n: scoring.bestN }) : t.standings.strategyTotal}
        </p>
      </header>
      <Leaderboard rows={snapshot.leaderboard} players={players} showJoker />
    </div>
  );
}
