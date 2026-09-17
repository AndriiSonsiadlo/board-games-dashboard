"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { GameEditSheet } from "./GameEditSheet";
import { useRunner } from "./useRunner";

export function GamesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const [editing, setEditing] = useState<GameFact | "new" | null>(null);
  const floor = snapshot.event.scoring.participationFloor;
  const games = [...snapshot.games].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.games.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.games.weightHint}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t.games.add}
        </Button>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((game) => (
          <GameCard key={game.id} game={game} floor={floor} onEdit={() => setEditing(game)} />
        ))}
      </ul>
      {editing ? (
        <GameEditSheet
          key={editing === "new" ? "new" : editing.id}
          game={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.68rem] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular">{value}</dd>
    </div>
  );
}

function GameCard({ game, floor, onEdit }: { game: GameFact; floor: number; onEdit: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useRunner();

  return (
    <li className={cn("flex flex-col gap-4 rounded-md border border-line bg-surface p-4", !game.active && "opacity-50")}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
          <GameIcon name={game.icon} className="size-5 text-accent" />
        </span>
        <button type="button" onClick={onEdit} className="group min-w-0 flex-1 text-left">
          <div className="truncate font-display text-lg uppercase leading-tight tracking-wide group-hover:text-accent">{game.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-sm border border-line-strong px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
              {game.category}
            </span>
            {game.family !== game.slug ? (
              <span className="rounded-sm border border-accent/40 px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-accent">
                {game.family}
              </span>
            ) : null}
          </div>
        </button>
        <Switch
          checked={game.active}
          disabled={pending}
          onCheckedChange={(active) => run(() => updateGameAction(game.id, { active }))}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
        <Stat label={t.games.weight} value={`${formatPoints(game.weight)}/${formatPoints(game.weight * floor)}`} />
        <Stat label={t.games.players} value={`${game.minPlayers}–${game.maxPlayers}`} />
        <Stat label={t.games.minutes} value={game.durationMin} />
        <Stat label={t.games.ties} value={game.allowTies ? "✓" : "–"} />
      </dl>
    </li>
  );
}
