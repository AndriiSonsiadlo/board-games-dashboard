"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/LangProvider";
import { Leaderboard } from "../common/Leaderboard";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

export function PublicLeaderboard() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const players = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.leaderboard.back}
      </Link>
      {snapshot.leaderboard ? (
        <>
          <h1 className="font-display text-4xl uppercase tracking-tight">{t.leaderboard.title}</h1>
          <Leaderboard rows={snapshot.leaderboard} players={players} />
        </>
      ) : (
        <FadeRise className="space-y-5 border-y border-line py-12 text-center">
          <Lock className="mx-auto size-8 text-accent" strokeWidth={1.25} />
          <h1 className="font-display text-3xl uppercase tracking-tight">{t.leaderboard.lockedTitle}</h1>
          <p className="mx-auto max-w-sm text-muted">{t.leaderboard.lockedBody}</p>
        </FadeRise>
      )}
    </div>
  );
}
