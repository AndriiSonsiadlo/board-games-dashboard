"use client";

import type { TableState } from "@/domain/tables";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { LivePulse } from "../motion/LivePulse";

export function StateLabel({ state, className }: { state: TableState; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display text-[0.68rem] uppercase tracking-[0.16em]",
        state === "available" && "text-muted",
        state === "preparing" && "text-text/70",
        state === "playing" && "text-text",
        state === "pending" && "text-accent",
        className,
      )}
    >
      {state === "playing" ? <LivePulse /> : null}
      {state === "pending" ? <span className="size-2 rounded-full bg-accent" aria-hidden /> : null}
      {t.tableState[state]}
    </span>
  );
}
