"use client";

import { useState } from "react";
import { updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );
}

export function GamesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const floor = snapshot.event.scoring.participationFloor;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.games.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.games.weightHint}</p>
      </header>
      <ul className="divide-y divide-line border-y border-line">
        {snapshot.games.map((game) => (
          <GameRow key={`${game.id}-${snapshot.version}`} game={game} floor={floor} />
        ))}
      </ul>
    </div>
  );
}

function GameRow({ game, floor }: { game: GameFact; floor: number }) {
  const { t } = useI18n();
  const { run } = useRunner();
  const [draft, setDraft] = useState(game);

  const update = (patch: Partial<GameFact>) => {
    setDraft((d) => ({ ...d, ...patch }));
    run(() => updateGameAction(game.id, patch));
  };

  return (
    <li className="grid gap-4 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex items-center gap-3">
        <GameIcon name={game.icon} className="size-5 text-accent" />
        <div>
          <div className="font-display text-lg uppercase tracking-wide">{game.name}</div>
          <div className="font-mono text-xs text-muted tabular">
            {formatPoints(draft.weight)} / {formatPoints(draft.weight * floor)} · {fmt(t.common.minutesShort, { n: draft.durationMin })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Field label={t.games.weight}>
          <Stepper value={draft.weight} min={1} max={50} onChange={(weight) => update({ weight })} label={t.games.weight} />
        </Field>
        <Field label={t.games.players}>
          <div className="flex items-center gap-1.5">
            <Stepper value={draft.minPlayers} min={2} max={draft.maxPlayers} onChange={(minPlayers) => update({ minPlayers })} />
            <Stepper value={draft.maxPlayers} min={draft.minPlayers} max={20} onChange={(maxPlayers) => update({ maxPlayers })} />
          </div>
        </Field>
        <Field label={t.games.minutes}>
          <Stepper value={draft.durationMin} min={5} max={240} step={5} onChange={(durationMin) => update({ durationMin })} />
        </Field>
        <Switch checked={draft.allowTies} onCheckedChange={(allowTies) => update({ allowTies })} label={t.games.ties} />
        <Switch checked={draft.active} onCheckedChange={(active) => update({ active })} label={t.games.active} />
      </div>
    </li>
  );
}
