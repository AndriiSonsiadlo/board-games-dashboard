"use client";

import { ArrowRight, Award, Lock, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { ordinal, fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock, pad2 } from "@/lib/format";
import { BrandMark } from "../brand/Wordmark";
import { AchievementIcon } from "../common/AchievementIcon";
import { ElapsedClock } from "../common/ElapsedClock";
import { GameIcon } from "../common/GameIcon";
import { StateLabel } from "../common/StateLabel";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { FindMe } from "./FindMe";
import { useCheckedIn } from "./useCheckedIn";

function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 border-b border-line pb-3">
      <span className="font-mono text-xs text-accent">{index}</span>
      <span className="label-caps text-text">{children}</span>
    </h2>
  );
}

export function HomeView() {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { me } = useCheckedIn(snapshot.players);
  const activeTables = snapshot.tables.filter((x) => x.state !== "available");
  const freeCount = snapshot.tables.length - activeTables.length;

  return (
    <div className="space-y-14 pt-10">
      <FadeRise className="space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="label-caps">
            {snapshot.event.city} · {snapshot.event.year}
          </span>
        </div>
        <h1 className="font-display uppercase leading-[0.85] tracking-tight">
          <span className="block text-2xl tracking-[0.3em] text-muted sm:text-3xl">Board Games</span>
          <span className="block text-[5.5rem] sm:text-[8rem]">Cup</span>
        </h1>
        <p className="max-w-md text-muted">{t.home.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {me ? (
            <Link
              href={`/players/${me.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm"
            >
              <UserRound className="size-4 text-up" />
              {t.home.myProfile}
              <span className="text-muted">· {me.name}</span>
            </Link>
          ) : snapshot.event.status !== "finished" ? (
            <Link
              href="/checkin"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-display text-sm uppercase tracking-[0.08em] text-bg"
            >
              <UserPlus className="size-4" />
              {t.home.checkIn}
            </Link>
          ) : null}
          <Link
            href="/leaderboard"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            {snapshot.leaderboard ? null : <Lock className="size-3.5" />}
            {t.home.standings}
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/achievements"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            <Award className="size-4" />
            {t.home.achievements}
          </Link>
        </div>
      </FadeRise>

      <section className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
        {[
          { label: t.home.gamesCompleted, value: snapshot.counters.gamesCompleted },
          { label: t.home.tablesActive, value: snapshot.counters.tablesActive },
          { label: t.home.players, value: snapshot.counters.players },
          { label: t.home.achievementsUnlocked, value: snapshot.counters.achievementsUnlocked },
        ].map((c) => (
          <div key={c.label} className="py-5 pr-3">
            <div className="font-display text-4xl tabular sm:text-5xl">{c.value}</div>
            <div className="mt-1 text-xs text-muted">{c.label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <SectionTitle index="01">{t.home.liveRoom}</SectionTitle>
        {activeTables.length === 0 ? <p className="text-muted">{t.home.allTablesFree}</p> : null}
        <ul className="divide-y divide-line">
          {activeTables.map((table) => {
            const session = table.session;
            const game = session ? lookups.games.get(session.gameId) : undefined;
            return (
              <li key={table.tableId} className="grid grid-cols-[3.5rem_1fr] gap-3 py-4">
                <span className="font-display text-3xl leading-none tabular text-text/80">{pad2(table.number)}</span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                    <span className="font-display text-lg uppercase tracking-wide">{game?.name}</span>
                    <StateLabel state={table.state} />
                    {session?.startedAt ? (
                      <ElapsedClock from={session.startedAt} to={session.finishedAt} className="ml-auto font-mono text-sm text-muted" />
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">
                    {session?.players.map((p) => lookups.players.get(p.playerId)?.name).filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {activeTables.length > 0 && freeCount > 0 ? (
          <p className="text-xs text-muted">
            {freeCount} × {t.tableState.available}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionTitle index="02">{t.home.recentResults}</SectionTitle>
        {snapshot.recentResults.length === 0 ? <p className="text-muted">{t.home.noResults}</p> : null}
        <ul className="divide-y divide-line">
          {snapshot.recentResults.slice(0, 5).map((r) => {
            const game = lookups.games.get(r.gameId);
            const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
            return (
              <li key={r.sessionId} className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                  <span className="font-display uppercase tracking-wide">{game?.name}</span>
                  {table ? <span className="text-xs text-muted">{fmt(t.common.tableN, { n: table.number })}</span> : null}
                  <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
                    {formatClock(r.finishedAt)}
                  </span>
                </div>
                <ol className="flex flex-wrap gap-x-5 gap-y-1">
                  {r.placements.slice(0, 3).map((p) => (
                    <li key={p.playerId} className="flex items-baseline gap-1.5 text-sm">
                      <span className={cn("font-mono text-xs", p.placement === 1 ? "text-accent" : "text-muted")}>
                        {ordinal(lang, p.placement)}
                      </span>
                      <Link
                        href={`/players/${p.playerId}`}
                        className={cn("hover:text-accent", p.placement === 1 ? "text-text" : "text-text/80")}
                      >
                        {lookups.players.get(p.playerId)?.name}
                      </Link>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <SectionTitle index="03">{t.home.latestUnlocks}</SectionTitle>
        {snapshot.achievements.unlocks.length === 0 ? <p className="text-muted">{t.achievements.none}</p> : null}
        <ul className="divide-y divide-line">
          {snapshot.achievements.unlocks.slice(0, 5).map((u) => (
            <li key={`${u.achievementId}:${u.playerId}`} className="flex items-center gap-3 py-3">
              <AchievementIcon id={u.achievementId} className="size-4 shrink-0 text-accent" />
              <span className="font-display uppercase tracking-wide">{t.achievements.defs[u.achievementId].title}</span>
              <Link href={`/players/${u.playerId}`} className="truncate text-sm text-muted hover:text-text">
                {lookups.players.get(u.playerId)?.name}
              </Link>
              <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
                {formatClock(u.at)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <SectionTitle index="04">{t.home.findMe}</SectionTitle>
        <FindMe players={snapshot.players} />
      </section>
    </div>
  );
}
