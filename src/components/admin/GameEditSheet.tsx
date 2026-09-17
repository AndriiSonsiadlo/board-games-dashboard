"use client";

import { useState } from "react";
import { createGameAction, deleteGameAction, updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { IconPicker } from "./IconPicker";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );
}

const EMPTY = {
  name: "",
  descriptionEn: "",
  descriptionRu: "",
  icon: "Dices",
  category: "",
  durationMin: 30,
  weight: 6,
  minPlayers: 2,
  maxPlayers: 6,
  allowTies: false,
  active: true,
};

/** `game: null` adds a new game. */
export function GameEditSheet({ game, onClose }: { game: GameFact | null; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [draft, setDraft] = useState(() => {
    if (!game) return EMPTY;
    const { id: _id, slug: _slug, family: _family, ...fields } = game;
    return fields;
  });
  const [family, setFamily] = useState<string | null>(game && game.family !== game.slug ? game.family : null);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const floor = snapshot.event.scoring.participationFloor;
  const played = game !== null && snapshot.playedGameIds.includes(game.id);

  const families = new Map<string, string>();
  for (const g of snapshot.games) {
    if (g.id === game?.id) continue;
    if (!families.has(g.family) || g.slug === g.family) families.set(g.family, g.name);
  }
  const categories = [...new Set(snapshot.games.map((g) => g.category))].sort();

  const save = () => {
    if (game) {
      run(() => updateGameAction(game.id, { ...draft, family: family ?? game.slug }), { success: t.common.saved, onOk: onClose });
    } else {
      run(() => createGameAction({ ...draft, family }), { success: t.games.created, onOk: onClose });
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={game ? t.games.edit : t.games.add}
      footer={
        <Button variant="primary" size="lg" block loading={pending} disabled={draft.name.trim().length === 0} onClick={save}>
          {t.common.save}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
            <GameIcon name={draft.icon} className="size-6 text-accent" />
          </span>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t.games.name}
            maxLength={40}
            className={inputClass}
            aria-label={t.games.name}
          />
        </div>

        <Field label={t.games.icon}>
          <IconPicker value={draft.icon} onChange={(icon) => set("icon", icon)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.games.category}>
            <input
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              list="game-categories"
              maxLength={30}
              className={inputClass}
            />
            <datalist id="game-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t.games.family}>
            <select value={family ?? ""} onChange={(e) => setFamily(e.target.value || null)} className={inputClass}>
              <option value="">{t.games.ownFamily}</option>
              {[...families].map(([value, name]) => (
                <option key={value} value={value}>
                  {fmt(t.games.variantOf, { name })}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <Field label={`${t.games.weight} · ${formatPoints(draft.weight)} / ${formatPoints(draft.weight * floor)}`}>
            <Stepper value={draft.weight} min={1} max={50} onChange={(v) => set("weight", v)} label={t.games.weight} />
          </Field>
          <Field label={t.games.players}>
            <div className="flex items-center gap-1.5">
              <Stepper value={draft.minPlayers} min={2} max={draft.maxPlayers} onChange={(v) => set("minPlayers", v)} />
              <Stepper value={draft.maxPlayers} min={draft.minPlayers} max={20} onChange={(v) => set("maxPlayers", v)} />
            </div>
          </Field>
          <Field label={t.games.minutes}>
            <Stepper value={draft.durationMin} min={5} max={240} step={5} onChange={(v) => set("durationMin", v)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6">
          <Switch checked={draft.allowTies} onCheckedChange={(v) => set("allowTies", v)} label={t.games.ties} />
          <Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} label={t.games.active} />
        </div>

        <Field label={t.games.descriptionEn}>
          <textarea
            value={draft.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
            maxLength={300}
            rows={2}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
        <Field label={t.games.descriptionRu}>
          <textarea
            value={draft.descriptionRu}
            onChange={(e) => set("descriptionRu", e.target.value)}
            maxLength={300}
            rows={2}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>

        {game ? (
          played ? (
            <p className="border-l-2 border-line-strong pl-3 text-xs text-muted">{t.games.playedNoDelete}</p>
          ) : (
            <ConfirmButton
              size="sm"
              disabled={pending}
              label={t.games.delete}
              confirmLabel={t.common.tapToConfirm}
              onConfirm={() => run(() => deleteGameAction(game.id), { success: t.games.deleted, onOk: onClose })}
            />
          )
        ) : null}
      </div>
    </Sheet>
  );
}
