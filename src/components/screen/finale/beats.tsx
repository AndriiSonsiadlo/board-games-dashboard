"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { useBrand } from "@/components/brand/BrandProvider";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { GameIcon } from "@/components/common/GameIcon";
import { EASE } from "@/components/motion/FadeRise";
import { GoldDust } from "@/components/motion/GoldDust";
import { MaskReveal } from "@/components/motion/MaskReveal";
import { NumberRoll } from "@/components/motion/NumberRoll";
import { brandTitle } from "@/domain/brand";
import type { FinaleBeat } from "@/domain/finale";
import { formatPoints } from "@/domain/scoring";
import { fmt, ordinal, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";
import { formatHours, type FinaleLookups } from "./lookups";

type Beat<K extends FinaleBeat["kind"]> = Extract<FinaleBeat, { kind: K }>;

function Label({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, letterSpacing: "0.8em" }}
      animate={{ opacity: 1, letterSpacing: "0.34em" }}
      transition={{ duration: 1.2, ease: EASE, delay }}
      className="font-display text-[44px] uppercase text-accent"
    >
      {children}
    </motion.div>
  );
}

export function BeatComplete({ beat }: { beat: Beat<"complete"> }) {
  const { t } = useI18n();
  const items = [
    { label: t.finale.gamesPlayed, node: <NumberRoll value={beat.games} delay={0.6} /> },
    { label: t.finale.duration, node: <span>{formatHours(beat.minutes)}</span> },
    { label: t.finale.players, node: <NumberRoll value={beat.players} delay={0.9} /> },
  ];
  return (
    <div className="flex h-full flex-col justify-center px-[140px]">
      <Label>{t.finale.complete}</Label>
      <div className="mt-20 grid grid-cols-3 divide-x divide-line">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.4 + i * 0.25 }}
            className="px-14 first:pl-0"
          >
            <div className="font-display text-[260px] leading-none tabular">{item.node}</div>
            <div className="mt-6 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{item.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function BeatNumbers({ beat, lookups }: { beat: Beat<"numbers">; lookups: FinaleLookups }) {
  const { t, lang } = useI18n();
  const name = (id: number) => lookups.players.get(id)?.name ?? "";
  const gameName = (id: number) => lookups.games.get(id)?.name ?? "";
  const rows: { label: string; value: string; detail: string; icon?: string }[] = [];
  if (beat.mostPlayed) {
    rows.push({
      label: t.finale.mostPlayed,
      value: gameName(beat.mostPlayed.gameId),
      detail: `${beat.mostPlayed.count} ${plural(lang, beat.mostPlayed.count, t.plurals.games)}`,
      icon: lookups.games.get(beat.mostPlayed.gameId)?.icon,
    });
  }
  if (beat.longest) {
    rows.push({
      label: t.finale.longest,
      value: gameName(beat.longest.gameId),
      detail: fmt(t.common.minutesShort, { n: beat.longest.durationMin }),
      icon: lookups.games.get(beat.longest.gameId)?.icon,
    });
  }
  if (beat.busiestTable) {
    const number = lookups.tables.get(beat.busiestTable.tableId)?.number;
    rows.push({
      label: t.finale.busiestTable,
      value: number !== undefined ? fmt(t.common.tableN, { n: pad2(number) }) : "",
      detail: `${beat.busiestTable.count} ${plural(lang, beat.busiestTable.count, t.plurals.games)}`,
    });
  }
  if (beat.rivals) {
    rows.push({
      label: t.finale.rivals,
      value: `${name(beat.rivals.playerIds[0])} · ${name(beat.rivals.playerIds[1])}`,
      detail: `${beat.rivals.count} ${plural(lang, beat.rivals.count, t.plurals.games)}`,
    });
  }
  return (
    <div className="flex h-full flex-col justify-center px-[140px]">
      <Label>{t.finale.numbers}</Label>
      <ul className="mt-14 divide-y divide-line border-y border-line">
        {rows.map((row, i) => (
          <motion.li
            key={row.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 + i * 1.2 }}
            className="grid grid-cols-[520px_1fr_auto] items-center gap-10 py-9"
          >
            <span className="font-display text-[34px] uppercase tracking-[0.2em] text-muted">{row.label}</span>
            <MaskReveal delay={0.8 + i * 1.2}>
              <span className="flex items-center gap-6 font-display text-[84px] uppercase leading-none tracking-tight">
                {row.icon ? <GameIcon name={row.icon} className="size-[64px] text-accent" /> : null}
                {row.value}
              </span>
            </MaskReveal>
            <span className="font-mono text-[40px] text-muted">{row.detail}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function BeatSealed({ beat, lookups }: { beat: Beat<"sealed">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  const def = t.achievements.defs[beat.unlock.achievementId];
  return (
    <div className="flex h-full items-center px-[160px]">
      <div className="relative grid size-[380px] shrink-0 place-items-center rounded-md border border-accent/60">
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute inset-0 grid place-items-center"
        >
          <Lock className="size-[160px] text-muted" strokeWidth={1.25} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 1.5 }}
        >
          <AchievementIcon id={beat.unlock.achievementId} className="size-[200px] text-accent" />
        </motion.div>
      </div>
      <div className="ml-[100px] min-w-0">
        <Label>
          {t.finale.sealedAchievement} · {beat.order}/{beat.total}
        </Label>
        <MaskReveal delay={1.6} className="mt-4">
          <div className="font-display text-[150px] uppercase leading-[0.9] tracking-tight">{def.title}</div>
        </MaskReveal>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 2.2 }}
          className="mt-6 text-[40px] text-muted"
        >
          {def.description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 3.2 }}
          className="mt-12 border-t border-line pt-8 font-display text-[100px] uppercase leading-none tracking-tight"
        >
          {lookups.players.get(beat.unlock.playerId)?.name}
        </motion.div>
      </div>
    </div>
  );
}

export function BeatPlace({ beat, lookups }: { beat: Beat<"place">; lookups: FinaleLookups }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Label>{fmt(t.finale.place, { place: ordinal(lang, beat.place) })}</Label>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: EASE, delay: 2.2 }}
        className="mt-10 font-display text-[240px] uppercase leading-[0.85] tracking-tight"
      >
        {lookups.players.get(beat.playerId)?.name}
      </motion.div>
    </div>
  );
}

export function BeatChampion({ beat, lookups }: { beat: Beat<"champion">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.6, ease: EASE, delay: 3 }}
          className="h-[820px] w-[1600px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 20%, transparent), color-mix(in oklab, var(--color-accent) 7%, transparent) 55%, transparent)",
          }}
        />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 3.4 }}>
        <GoldDust count={40} />
      </motion.div>
      <div className="relative z-10 flex flex-col items-center">
        <Label delay={0.4}>{beat.co ? t.finale.coChampions : t.finale.champion}</Label>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2.4, ease: "linear", delay: 0.8 }}
          className="mt-10 h-px w-[900px] origin-left bg-accent/70"
        />
        <div className="mt-12">
          {beat.playerIds.map((id, i) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.6, ease: EASE, delay: 3.4 + i * 0.6 }}
              className={cn(
                "font-display uppercase leading-[0.85] tracking-tight",
                beat.playerIds.length > 1 ? "text-[200px]" : "text-[280px]",
              )}
            >
              <span className="animate-text-shimmer" style={{ animationDelay: `${4.8 + i * 0.6}s` }}>
                {lookups.players.get(id)?.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BeatPodium({ beat, lookups }: { beat: Beat<"podium">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  const champions = new Set(beat.championIds);
  return (
    <div className="relative flex h-full flex-col px-[140px] pt-[100px] pb-[90px]">
      <GoldDust count={24} />
      <Label>{t.finale.finalStandings}</Label>
      <ol className="relative mt-12 grid flex-1 grid-flow-col grid-cols-2 grid-rows-5 gap-x-20">
        {beat.rows.map((row, i) => (
          <motion.li
            key={row.playerId}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.3 + i * 0.12 }}
            className="grid grid-cols-[110px_1fr_auto] items-center gap-6 border-b border-line"
          >
            <span className={cn("font-display text-[64px] leading-none tabular", row.rank <= 3 ? "text-accent" : "text-text/70")}>
              {row.rank}
            </span>
            <span
              className={cn(
                "truncate font-display uppercase leading-none tracking-wide",
                champions.has(row.playerId) ? "text-[64px]" : "text-[52px]",
              )}
            >
              {lookups.players.get(row.playerId)?.name}
            </span>
            <span className="font-mono text-[44px] text-muted">
              {formatPoints(row.counted)} {t.common.points}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function BeatClosing({
  beat,
  lookups,
  event,
}: {
  beat: Beat<"closing">;
  lookups: FinaleLookups;
  event: { city: string; year: number };
}) {
  const { t } = useI18n();
  const brand = useBrand();
  const names = beat.championIds.map((id) => lookups.players.get(id)?.name).filter(Boolean).join(" · ");
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <GoldDust count={20} />
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.9em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ duration: 1.6, ease: EASE }}
        className="font-display text-[56px] uppercase text-muted"
      >
        {brandTitle(brand)}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="mt-10 font-display text-[44px] uppercase tracking-[0.34em] text-accent"
      >
        {t.finale.champion}
      </motion.div>
      <MaskReveal delay={1.2} duration={1.4} className="mt-6">
        <div className="font-display text-[220px] uppercase leading-[0.85] tracking-tight">{names}</div>
      </MaskReveal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.4 }}
        className="mt-14 flex items-center gap-10 font-display text-[40px] uppercase tracking-[0.3em] text-muted"
      >
        <span>{event.city}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span>{event.year}</span>
      </motion.div>
    </div>
  );
}
