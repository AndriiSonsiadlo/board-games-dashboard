"use client";

import type { PublicEventView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { LivePulse } from "../motion/LivePulse";
import { ElapsedClock } from "./ElapsedClock";

export function EventStatusBadge({ event }: { event: PublicEventView }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-3">
      {event.status === "live" ? <LivePulse /> : <span className="size-2 rounded-full bg-muted" aria-hidden />}
      <span className="font-display text-xs uppercase tracking-[0.16em]">{t.status[event.status]}</span>
      {event.startedAt ? (
        <ElapsedClock from={event.startedAt} to={event.finishedAt} className="font-mono text-xs text-muted" />
      ) : null}
    </div>
  );
}
