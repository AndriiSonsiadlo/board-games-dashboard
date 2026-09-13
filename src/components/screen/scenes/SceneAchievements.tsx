"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { NumberRoll } from "@/components/motion/NumberRoll";
import { rarityOf } from "@/domain/achievements";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneAchievements({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const { unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const counts = new Map<string, number>();
  for (const u of unlocks) counts.set(u.achievementId, (counts.get(u.achievementId) ?? 0) + 1);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="04" title={t.screen.achievements} />
      <div className="mt-14 grid flex-1 grid-cols-[520px_1fr] gap-24">
        <div className="flex flex-col justify-center gap-16">
          <div>
            <NumberRoll value={unlocks.length} className="font-display text-[260px] leading-none" />
            <div className="mt-4 font-display text-[40px] uppercase tracking-[0.2em] text-muted">
              {t.screen.achievementsUnlocked}
            </div>
          </div>
          {sealedUnlockCount > 0 ? (
            <div className="flex items-center gap-6 border-t border-line pt-10">
              <Lock className="size-[56px] text-accent" strokeWidth={1.25} />
              <span className="font-display text-[110px] leading-none">{sealedUnlockCount}</span>
              <span className="font-display text-[34px] uppercase tracking-[0.18em] text-muted">{t.screen.sealedUntilFinale}</span>
            </div>
          ) : null}
        </div>
        <ul className="flex flex-col justify-center divide-y divide-line">
          {unlocks.slice(0, 6).map((u, i) => {
            const rarity = rarityOf(counts.get(u.achievementId) ?? 0, eligiblePlayers);
            return (
              <motion.li
                key={`${u.achievementId}:${u.playerId}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.2 + i * 0.1 }}
                className="grid grid-cols-[90px_1fr_auto] items-center gap-8 py-6"
              >
                <AchievementIcon id={u.achievementId} className="size-[64px] text-accent" />
                <div className="min-w-0">
                  <div className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                    {t.achievements.defs[u.achievementId].title}
                  </div>
                  <div className="mt-2 truncate text-[30px] text-muted">{lookups.players.get(u.playerId)?.name}</div>
                </div>
                {rarity ? (
                  <span className="font-display text-[26px] uppercase tracking-[0.2em] text-muted">
                    {t.achievements.rarity[rarity]}
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
