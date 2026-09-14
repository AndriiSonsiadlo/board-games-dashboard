"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { formatPoints } from "@/domain/scoring";
import type { TimedResult } from "@/domain/stats";
import { fmt, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { Heatmap } from "./Heatmap";
import { RaceChart } from "./RaceChart";
import { SectionTitle } from "./SectionTitle";

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-5 pr-3">
      <div className="font-display text-4xl tabular sm:text-5xl">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-baseline gap-3 py-3">
      <dt className="label-caps">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function StatsView() {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { stats, finaleStats } = snapshot;
  const name = (id: number) => lookups.players.get(id)?.name ?? t.stats.none;
  const gameName = (id: number) => lookups.games.get(id)?.name ?? t.stats.none;
  const games = (n: number) => `${n} ${plural(lang, n, t.plurals.games)}`;
  const timed = (r: TimedResult | null) =>
    r === null ? t.stats.none : `${gameName(r.gameId)} · ${fmt(t.common.minutesShort, { n: r.durationMin })}`;
  const maxPopularity = Math.max(1, ...stats.popularity.map((p) => p.count));

  return (
    <div className="space-y-12 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.stats.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.stats.title}</h1>
        <p className="mt-1 text-muted">{t.stats.subtitle}</p>
      </FadeRise>

      {stats.gamesCompleted === 0 ? (
        <p className="text-muted">{t.stats.empty}</p>
      ) : (
        <>
          <section className="grid grid-cols-3 border-y border-line">
            <Figure label={t.stats.gamesCompleted} value={stats.gamesCompleted} />
            <Figure label={t.stats.distinctGames} value={stats.distinctGames} />
            <Figure label={t.stats.tableSize} value={stats.tableSize ? stats.tableSize.size : t.stats.none} />
          </section>

          <section className="space-y-4">
            <SectionTitle index="01">{t.stats.popularity}</SectionTitle>
            <ul className="space-y-3">
              {stats.popularity.map((row, i) => {
                const game = lookups.games.get(row.gameId);
                return (
                  <li key={row.family} className="grid grid-cols-[1.25rem_7.5rem_1fr_2rem] items-center gap-3 text-sm">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : <span />}
                    <span className="truncate font-display uppercase tracking-wide">{game?.name}</span>
                    <span className="h-2 bg-line">
                      <span
                        className={cn("block h-full", i === 0 ? "bg-accent" : "bg-text/40")}
                        style={{ width: `${(row.count / maxPopularity) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-mono tabular">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <SectionTitle index="02">{t.stats.highlights}</SectionTitle>
            <dl className="divide-y divide-line">
              <Row label={t.stats.longest}>{timed(stats.longest)}</Row>
              <Row label={t.stats.fastest}>{timed(stats.fastest)}</Row>
              <Row label={t.stats.rivals}>
                {stats.rivals ? (
                  <>
                    {name(stats.rivals.playerIds[0])} &amp; {name(stats.rivals.playerIds[1])}{" "}
                    <span className="text-muted">
                      {games(stats.rivals.count)} {t.stats.together}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
            </dl>
          </section>

          {stats.heatmap ? (
            <section className="space-y-4">
              <SectionTitle index="03">{t.stats.heatmap}</SectionTitle>
              <p className="text-xs text-muted">{t.stats.heatmapHint}</p>
              <Heatmap data={stats.heatmap} />
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-4">
        <SectionTitle index="04">{t.stats.finale}</SectionTitle>
        {finaleStats === null ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted">
            <Lock className="size-4 text-accent" strokeWidth={1.5} />
            {t.stats.finaleLocked}
          </p>
        ) : (
          <>
            <dl className="divide-y divide-line">
              <Row label={t.stats.comeback}>
                {finaleStats.comeback ? (
                  <>
                    {name(finaleStats.comeback.playerId)}{" "}
                    <span className="text-muted">
                      {fmt(t.stats.comebackValue, { from: finaleStats.comeback.from, to: finaleStats.comeback.to })}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
              <Row label={t.stats.bestJoker}>
                {finaleStats.bestJoker ? (
                  <>
                    {name(finaleStats.bestJoker.playerId)}{" "}
                    <span className="text-muted">
                      {fmt(t.stats.bestJokerValue, {
                        points: formatPoints(finaleStats.bestJoker.bonus),
                        game: gameName(finaleStats.bestJoker.gameId),
                      })}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
              <Row label={t.stats.mostGames}>
                {finaleStats.mostGames ? (
                  <>
                    {finaleStats.mostGames.playerIds.map(name).join(", ")}{" "}
                    <span className="text-muted">{games(finaleStats.mostGames.count)}</span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
            </dl>
            {finaleStats.race.length > 0 ? (
              <div className="space-y-3">
                <h3 className="label-caps">{t.stats.race}</h3>
                <RaceChart race={finaleStats.race} colorOf={(id) => lookups.players.get(id)?.color ?? "var(--color-muted)"} />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {finaleStats.race.map((series, i) => (
                    <li key={series.playerId} className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: i === 0 ? "var(--color-accent)" : lookups.players.get(series.playerId)?.color }}
                      />
                      <Link href={`/players/${series.playerId}`} className="hover:text-accent">
                        {name(series.playerId)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
