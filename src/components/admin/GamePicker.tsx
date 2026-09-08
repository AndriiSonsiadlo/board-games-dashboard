"use client";

import type { GameFact } from "@/domain/types";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";

export function GamePicker({
  games,
  value,
  onChange,
}: {
  games: GameFact[];
  value: number | null;
  onChange: (gameId: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          aria-pressed={g.id === value}
          className={cn(
            "flex min-h-14 items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
            g.id === value ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
          )}
        >
          <GameIcon name={g.icon} className={cn("size-4 shrink-0", g.id === value ? "text-accent" : "text-muted")} />
          <span className="min-w-0 flex-1 text-sm leading-tight">{g.name}</span>
          <span className="font-mono text-[0.68rem] text-muted tabular">{g.weight}</span>
        </button>
      ))}
    </div>
  );
}
