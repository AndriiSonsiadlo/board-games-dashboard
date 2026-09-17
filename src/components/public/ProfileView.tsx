"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { achievementVisibility } from "@/domain/achievements";
import type { PlayerProfile } from "@/domain/profile";
import { formatPoints } from "@/domain/scoring";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { Avatar } from "../common/Avatar";
import { GameIcon } from "../common/GameIcon";
import { StreakMark } from "../common/StreakMark";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { RankChart } from "./RankChart";

/** Server-rendered profile; re-fetched whenever the live data version changes. */
function useRefreshOnVersion(version: number) {
  const router = useRouter();
  const first = useRef(version);
  useEffect(() => {
    if (version !== first.current) router.refresh();
  }, [version, router]);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="font-display text-3xl tabular">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

export function ProfileView({ profile }: { profile: PlayerProfile }) {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  useRefreshOnVersion(snapshot.version);
  const s = profile.standing;
  const gameName = (id: number | null) => (id === null ? "--" : (lookups.games.get(id)?.name ?? "--"));
  const unlocked = profile.achievements.filter((a) => a.unlockedAt !== null);
  const locked = profile.achievements.filter((a) => a.unlockedAt === null);

  return (
    <div className="space-y-10 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.profile.back}
      </Link>

      <FadeRise className="flex items-center gap-4">
        <Avatar name={profile.player.name} color={profile.player.color} size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate font-display text-4xl uppercase tracking-tight">{profile.player.name}</h1>
            <StreakMark streak={lookups.streaks.get(profile.player.id)} className="text-lg" />
          </div>
          {profile.player.nickname ? <p className="text-muted">{profile.player.nickname}</p> : null}
        </div>
        {s?.rank ? <span className="ml-auto font-display text-6xl leading-none text-accent tabular">{s.rank}</span> : null}
      </FadeRise>

      {s ? (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-x-4 border-y border-line sm:grid-cols-6">
            <Stat label={t.profile.points} value={formatPoints(s.counted)} />
            <Stat label={t.profile.raw} value={formatPoints(s.raw)} />
            <Stat label={t.profile.games} value={s.gamesPlayed} />
            <Stat label={t.profile.wins} value={s.wins} />
            <Stat label={t.profile.podiums} value={s.podiums} />
            <Stat label={t.profile.winRate} value={`${Math.round(s.winRate * 100)}%`} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="label-caps">{t.profile.strongest}</dt>
              <dd className="mt-1">{gameName(s.strongestGameId)}</dd>
            </div>
            <div>
              <dt className="label-caps">{t.profile.weakest}</dt>
              <dd className="mt-1">{gameName(s.weakestGameId)}</dd>
            </div>
          </dl>
          {s.rankHistory.length > 1 ? (
            <div>
              <h2 className="label-caps mb-2">{t.profile.rankHistory}</h2>
              <RankChart history={s.rankHistory} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">{t.profile.sealedNote}</p>
      )}

      <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
        <div>
          <dt className="label-caps">{t.profile.favoriteGame}</dt>
          <dd className="mt-1 font-display text-lg uppercase tracking-wide">{gameName(profile.favoriteGameId)}</dd>
        </div>
        <div>
          <dt className="label-caps">{t.profile.tablesPlayed}</dt>
          <dd className="mt-1 font-display text-lg tabular">{profile.tablesPlayed}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="label-caps text-text">{t.profile.achievements}</h2>
        <ul className="divide-y divide-line border-y border-line">
          {[...unlocked, ...locked].map((a) => {
            const text = t.achievements.defs[a.id];
            const done = a.unlockedAt !== null;
            const titleOnly = achievementVisibility(a.sealed, profile.revealed) === "titleOnly";
            return (
              <li key={a.id} className={cn("flex items-center gap-3 py-3", !done && "opacity-60")}>
                <AchievementIcon id={a.id} className={cn("size-5 shrink-0", done ? "text-accent" : "text-muted")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-display uppercase tracking-wide">
                    {text.title}
                    {titleOnly ? <Lock className="size-3.5 text-muted" strokeWidth={1.5} aria-label={t.achievements.sealed} /> : null}
                  </div>
                  <div className="text-xs text-muted">{titleOnly ? t.achievements.sealedBody : text.description}</div>
                  {!done && a.progress ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full bg-accent" style={{ width: `${(a.progress.current / a.progress.target) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[0.68rem] text-muted">
                        {a.progress.current}/{a.progress.target}
                      </span>
                    </div>
                  ) : null}
                </div>
                {done ? (
                  <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                    {formatClock(a.unlockedAt!)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="label-caps text-text">{t.profile.games}</h2>
        {profile.results.length === 0 ? <p className="text-muted">{t.profile.noGames}</p> : null}
        <ul className="divide-y divide-line border-y border-line">
          {profile.results.map((r) => {
            const game = lookups.games.get(r.gameId);
            const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
            return (
              <li key={r.sessionId} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                    <span className="truncate font-display uppercase tracking-wide">{game?.name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted" suppressHydrationWarning>
                    {table ? `${fmt(t.common.tableN, { n: table.number })} · ` : ""}
                    {formatClock(r.finishedAt)}
                    {r.counted === false ? ` · ${t.profile.notCounted}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("font-mono", r.placement === 1 ? "text-accent" : "text-text")}>
                    {ordinal(lang, r.placement)} <span className="text-xs text-muted">{fmt(t.profile.ofN, { n: r.playerCount })}</span>
                  </div>
                  {r.points !== undefined ? (
                    <div className={cn("font-mono text-xs", r.counted ? "text-text" : "text-muted line-through")}>
                      {formatPoints(r.points)} {t.common.points}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
