"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { NumberRoll } from "@/components/motion/NumberRoll";
import { achievementVisibility, rarityOf } from "@/domain/achievements";
import type { PublicSnapshot } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { AutoScroll } from "../AutoScroll";
import { holdersByAchievement, orderAchievementGroups } from "../logic";
import { SceneHeading } from "./SceneRoom";

const HOLDERS_SHOWN = 6;

export function SceneAchievements({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const { unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const groups = orderAchievementGroups(holdersByAchievement(unlocks), snapshot.event.achievementOrder, eligiblePlayers);
  const sealed = new Set(snapshot.achievements.sealed);

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="04" title={t.screen.achievements} />
      <div className="mt-14 grid min-h-0 flex-1 grid-cols-[520px_1fr] gap-24">
        <div className="flex flex-col justify-center gap-16">
          <div>
            <NumberRoll value={unlocks.length} className="font-display text-[260px] leading-none" />
            <div className="mt-4 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{t.screen.achievementsUnlocked}</div>
          </div>
          {sealedUnlockCount > 0 ? (
            <div className="flex items-center gap-6 border-t border-line pt-10">
              <Lock className="size-[56px] text-accent" strokeWidth={1.25} />
              <span className="font-display text-[110px] leading-none">{sealedUnlockCount}</span>
              <span className="font-display text-[34px] uppercase tracking-[0.18em] text-muted">{t.screen.sealedUntilFinale}</span>
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col">
          <AutoScroll startDelayMs={1500} windowMs={snapshot.event.sceneDurationSec * 1000}>
            <ul className="divide-y divide-line">
              {groups.map((group, i) => {
                const rarity = rarityOf(group.playerIds.length, eligiblePlayers);
                const shown = group.playerIds.slice(0, HOLDERS_SHOWN);
                const more = group.playerIds.length - shown.length;
                return (
                  <motion.li
                    key={group.achievementId}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.2 + Math.min(i, 8) * 0.1 }}
                    className="grid grid-cols-[90px_1fr_auto] items-center gap-8 py-6"
                  >
                    <AchievementIcon id={group.achievementId} className="size-[64px] text-accent" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                          {t.achievements.defs[group.achievementId].title}
                        </span>
                        {achievementVisibility(sealed.has(group.achievementId), snapshot.event.finaleRevealed) === "titleOnly" ? (
                          <Lock className="size-[36px] shrink-0 text-muted" strokeWidth={1.5} />
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[30px] text-muted">
                        {shown.map((id) => {
                          const p = lookups.players.get(id);
                          return (
                            <span key={id} className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: p?.color }} />
                              {p?.name}
                            </span>
                          );
                        })}
                        {more > 0 ? <span className="text-text/70">{fmt(t.screen.moreHolders, { n: more })}</span> : null}
                      </div>
                    </div>
                    {rarity ? (
                      <span className="font-display text-[26px] uppercase tracking-[0.2em] text-muted">{t.achievements.rarity[rarity]}</span>
                    ) : null}
                  </motion.li>
                );
              })}
            </ul>
          </AutoScroll>
        </div>
      </div>
    </div>
  );
}
