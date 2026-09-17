"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { rarityOf } from "@/domain/achievements";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

export function AchievementsView() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { enabled, unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const revealed = snapshot.event.finaleRevealed;
  const sealed = new Set(snapshot.achievements.sealed);

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.achievements.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.achievements.title}</h1>
        <p className="mt-1 text-muted">{t.achievements.subtitle}</p>
        {!revealed && sealedUnlockCount > 0 ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm">
            <Lock className="size-4 text-accent" strokeWidth={1.5} />
            {t.achievements.sealedCount}: <span className="font-mono">{sealedUnlockCount}</span>
          </p>
        ) : null}
      </FadeRise>

      <ul className="divide-y divide-line border-y border-line">
        {enabled.map((id) => {
          const sealedHidden = sealed.has(id) && !revealed;
          const holders = unlocks.filter((u) => u.achievementId === id).reverse();
          const rarity = rarityOf(holders.length, eligiblePlayers);
          const text = t.achievements.defs[id];
          return (
            <li key={id} className={cn("space-y-2 py-4", holders.length === 0 && !sealedHidden && "opacity-70")}>
              <div className="flex items-center gap-3">
                {sealedHidden ? (
                  <Lock className="size-5 shrink-0 text-muted" strokeWidth={1.5} />
                ) : (
                  <AchievementIcon id={id} className={cn("size-5 shrink-0", holders.length > 0 ? "text-accent" : "text-muted")} />
                )}
                <span className="font-display text-lg uppercase tracking-wide">{text.title}</span>
                {sealedHidden ? (
                  <span className="ml-auto label-caps">{t.achievements.sealed}</span>
                ) : rarity ? (
                  <span className="ml-auto label-caps text-accent">{t.achievements.rarity[rarity]}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted">{sealedHidden ? t.achievements.sealedBody : text.description}</p>
              {!sealedHidden ? (
                holders.length === 0 ? (
                  <p className="text-xs text-muted">{t.achievements.nobodyYet}</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {holders.map((u) => (
                      <li key={u.playerId}>
                        <Link href={`/players/${u.playerId}`} className="hover:text-accent">
                          {lookups.players.get(u.playerId)?.name}
                        </Link>{" "}
                        <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                          {formatClock(u.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
