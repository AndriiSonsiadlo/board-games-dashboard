"use client";

import { setAchievementEnabledAction, setAchievementSealedAction } from "@/app/admin/actions";
import { ACHIEVEMENTS } from "@/domain/achievements";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { AchievementIcon } from "../common/AchievementIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Switch } from "../ui/Switch";
import { UnlockFeed } from "./UnlockFeed";
import { useRunner } from "./useRunner";

export function AchievementsAdmin() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const enabled = new Set(snapshot.achievements.enabled);
  const sealedIds = new Set(snapshot.achievements.sealed);
  const counts = new Map<string, number>();
  for (const u of snapshot.achievements.unlocks) counts.set(u.achievementId, (counts.get(u.achievementId) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.adminAchievements.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.adminAchievements.hint}</p>
      </header>

      <ul className="divide-y divide-line border-y border-line">
        {ACHIEVEMENTS.map((def) => {
          const on = enabled.has(def.id);
          const sealed = sealedIds.has(def.id);
          const text = t.achievements.defs[def.id];
          return (
            <li key={def.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <AchievementIcon id={def.id} className={cn("size-5 shrink-0 text-accent", !on && "opacity-50")} />
              <div className={cn("min-w-0 flex-1", !on && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display uppercase tracking-wide">{text.title}</span>
                  {sealed ? (
                    <span className="rounded-sm border border-line-strong px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                      {t.adminAchievements.sealed}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted">
                  {text.description} · {fmt(t.adminAchievements.unlockCount, { n: counts.get(def.id) ?? 0 })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Switch
                  checked={sealed}
                  disabled={pending}
                  onCheckedChange={(next) => run(() => setAchievementSealedAction({ achievementId: def.id, sealed: next }))}
                  label={<span className="text-xs text-muted">{t.adminAchievements.sealed}</span>}
                />
                <Switch
                  checked={on}
                  disabled={pending}
                  onCheckedChange={(next) => run(() => setAchievementEnabledAction({ achievementId: def.id, enabled: next }))}
                  label={<span className="text-xs text-muted">{t.adminAchievements.enabled}</span>}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <UnlockFeed limit={500} />
    </div>
  );
}
