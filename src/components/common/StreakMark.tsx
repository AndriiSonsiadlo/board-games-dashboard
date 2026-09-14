"use client";

import { Flame } from "lucide-react";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function StreakMark({ streak, className }: { streak: number | undefined; className?: string }) {
  const { t } = useI18n();
  if (!streak) return null;
  const label = fmt(t.home.hotStreak, { n: streak });
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-accent", className)} title={label} aria-label={label}>
      <Flame className="size-[1em]" strokeWidth={1.75} aria-hidden />
      {streak}
    </span>
  );
}
