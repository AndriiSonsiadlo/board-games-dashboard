"use client";

import { motion } from "motion/react";
import { ElapsedClock } from "@/components/common/ElapsedClock";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { LivePulse } from "@/components/motion/LivePulse";
import type { PublicSnapshot } from "@/domain/snapshot";
import { plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";

export function SceneRoom({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const tables = snapshot.tables.slice(0, 12);
  const dense = tables.length > 8;

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="01" title={t.screen.liveRoom} />
      <div className={cn("mt-14 grid flex-1 content-start gap-x-16", dense ? "grid-cols-3 gap-y-8" : "grid-cols-2 gap-y-10")}>
        {tables.map((table, i) => {
          const session = table.session;
          const game = session ? lookups.games.get(session.gameId) : undefined;
          const available = table.state === "available";
          return (
            <motion.div
              key={table.tableId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.07 }}
              className={cn("grid grid-cols-[150px_1fr] items-center border-t border-line pt-6", available && "opacity-40")}
            >
              <span className={cn("font-display leading-none tabular", dense ? "text-[84px]" : "text-[110px]")}>{pad2(table.number)}</span>
              <div className="min-w-0">
                {game && session ? (
                  <>
                    <div className="flex items-center gap-4">
                      <GameIcon name={game.icon} className="size-[40px] text-accent" />
                      <span className={cn("truncate font-display uppercase tracking-wide", dense ? "text-[44px]" : "text-[58px]")}>{game.name}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-6 text-[30px] text-muted">
                      {table.state === "playing" ? <LivePulse className="size-3.5" /> : null}
                      <span>
                        {session.players.length} {plural(lang, session.players.length, t.plurals.players)}
                      </span>
                      {session.startedAt ? (
                        <ElapsedClock from={session.startedAt} to={session.finishedAt} className="font-mono text-text/90" />
                      ) : (
                        <span>{t.tableState[table.state]}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className={cn("font-display uppercase tracking-[0.2em] text-muted", dense ? "text-[40px]" : "text-[48px]")}>
                    {table.label ?? t.tableState.available}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      {snapshot.counters.tablesActive === 0 ? (
        <p className="font-display text-[40px] uppercase tracking-[0.2em] text-muted">{t.screen.allTablesFree}</p>
      ) : null}
    </div>
  );
}

export function SceneHeading({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="flex items-end gap-8 border-b border-line-strong pb-6">
      <span className="font-mono text-[34px] text-accent">{index}</span>
      <motion.h2
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.9, ease: EASE }}
        className="font-display text-[88px] uppercase leading-none tracking-tight"
      >
        {title}
      </motion.h2>
      {note ? <span className="mb-2 ml-auto text-[30px] text-muted">{note}</span> : null}
    </div>
  );
}
