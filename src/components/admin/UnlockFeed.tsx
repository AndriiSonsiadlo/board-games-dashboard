"use client";

import { Lock } from "lucide-react";
import { useI18n } from "@/i18n/LangProvider";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";

export function UnlockFeed({ limit = 5 }: { limit?: number }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const sealed = new Set(snapshot.achievements.sealed);
  const unlocks = snapshot.achievements.unlocks.slice(0, limit);

  return (
    <section className="space-y-2">
      <h2 className="label-caps">{t.room.latestUnlocks}</h2>
      {unlocks.length === 0 ? <p className="text-sm text-muted">{t.room.noUnlocks}</p> : null}
      <ul className="divide-y divide-line border-y border-line">
        {unlocks.map((u) => (
          <li key={`${u.achievementId}:${u.playerId}`} className="flex items-center gap-3 py-2 text-sm">
            <AchievementIcon id={u.achievementId} className="size-4 shrink-0 text-accent" />
            <span className="truncate font-display uppercase tracking-wide">{t.achievements.defs[u.achievementId].title}</span>
            {sealed.has(u.achievementId) ? <Lock className="size-3.5 shrink-0 text-muted" aria-label={t.adminAchievements.sealed} /> : null}
            <span className="truncate text-muted">{lookups.players.get(u.playerId)?.name}</span>
            <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
              {formatClock(u.at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
