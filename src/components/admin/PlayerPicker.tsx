"use client";

import { Check } from "lucide-react";
import type { AdminPlayerView } from "@/domain/snapshot";
import type { SessionStatus } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";

/** Players at open tables are blocked; with allowSetupBusy, players at preparing tables stay selectable (they get moved). */
export function PlayerPicker({
  players,
  selected,
  busy,
  onToggle,
  query,
  onQueryChange,
  allowSetupBusy = false,
}: {
  players: AdminPlayerView[];
  selected: Set<number>;
  busy: Map<number, { tableNumber: number; status: SessionStatus }>;
  onToggle: (playerId: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  allowSetupBusy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t.seat.search}
        className="h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
      />
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => {
          const b = busy.get(p.id);
          const blocked = b !== undefined && !(allowSetupBusy && b.status === "setup") && !selected.has(p.id);
          const isSelected = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={blocked}
              onClick={() => onToggle(p.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-35",
                isSelected ? "border-accent/70 bg-accent/10" : "border-line hover:border-line-strong",
              )}
            >
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                {b ? <span className="block text-[0.68rem] text-muted">{fmt(t.seat.busyAt, { n: b.tableNumber })}</span> : null}
              </span>
              {isSelected ? <Check className="size-4 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
