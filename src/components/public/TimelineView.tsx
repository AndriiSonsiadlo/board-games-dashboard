"use client";

import { ArrowLeft, Award, Flag, Play, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { TimelineItem } from "@/domain/timeline";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { nameLookup, timelineKey, timelineText } from "../common/timelineText";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

const ICONS: Record<TimelineItem["kind"], LucideIcon> = { started: Play, result: Trophy, unlock: Award, milestone: Flag };

export function TimelineView() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.timeline.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.timeline.title}</h1>
        <p className="mt-1 text-muted">{t.timeline.subtitle}</p>
      </FadeRise>
      {snapshot.timeline.length === 0 ? <p className="text-muted">{t.timeline.empty}</p> : null}
      <ol className="ml-2 border-l border-line pl-5">
        {snapshot.timeline.map((item) => {
          const Icon = ICONS[item.kind];
          const strong = item.kind === "result" || item.kind === "milestone";
          return (
            <li key={timelineKey(item)} className="relative py-3">
              <span className="absolute top-[0.95rem] -left-7 grid size-4 place-items-center bg-bg">
                <Icon className={cn("size-3.5", strong ? "text-accent" : "text-muted")} strokeWidth={1.75} />
              </span>
              <div className="flex items-baseline gap-3">
                <span className="w-11 shrink-0 font-mono text-xs text-muted" suppressHydrationWarning>
                  {formatClock(item.at)}
                </span>
                <span className={cn("text-sm", strong ? "text-text" : "text-text/75")}>{timelineText(item, t, names)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
