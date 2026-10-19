"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { deletePlayerAction, mergePlayersAction, updatePlayerAction } from "@/app/admin/actions";
import { PLAYER_COLORS } from "@/domain/players";
import type { AdminPlayerView } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { Switch } from "../ui/Switch";
import { matchesQuery } from "./seating";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function PlayerEditSheet({ player, onClose }: { player: AdminPlayerView; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname ?? "");
  const [color, setColor] = useState(player.color);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);

  const seated = snapshot.seatedPlayerIds.includes(player.id);
  const others = snapshot.players
    .filter((p) => p.id !== player.id && matchesQuery(p.name, mergeQuery))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={player.name}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          loading={pending}
          onClick={() => run(() => updatePlayerAction(player.id, { name, nickname, color }), { success: t.common.saved, onOk: onClose })}
        >
          {t.common.save}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || player.name} color={color} size="lg" />
          <div className="flex-1 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.players.namePlaceholder} className={inputClass} />
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.players.nicknamePlaceholder} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={c === color}
              className={cn("grid size-9 place-items-center rounded-full border-2", c === color ? "border-text" : "border-transparent")}
              style={{ backgroundColor: c }}
            >
              {c === color ? <Check className="size-4 text-bg" /> : null}
            </button>
          ))}
        </div>

        <Switch
          checked={player.active}
          onCheckedChange={(active) => run(() => updatePlayerAction(player.id, { active }))}
          label={player.active ? t.players.deactivate : t.players.activate}
          disabled={pending}
        />
      </div>

      <section className="mt-8 space-y-3 border-t border-line pt-6">
        <h3 className="label-caps">{fmt(t.players.mergeInto, { name: player.name })}</h3>
        <input value={mergeQuery} onChange={(e) => setMergeQuery(e.target.value)} placeholder={t.players.search} className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setMergeTarget(p.id)}
              aria-pressed={mergeTarget === p.id}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md border px-2.5 text-left text-sm",
                mergeTarget === p.id ? "border-accent bg-accent/10" : "border-line",
              )}
            >
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <ConfirmButton
          block
          disabled={mergeTarget === null || pending}
          label={t.players.merge}
          confirmLabel={t.common.tapToConfirm}
          onConfirm={() => {
            if (mergeTarget === null) return;
            run(() => mergePlayersAction({ keepId: mergeTarget, removeId: player.id }), { success: t.players.merged, onOk: onClose });
          }}
        />
      </section>

      <section className="mt-8 border-t border-line pt-6">
        {seated ? (
          <p className="border-l-2 border-line-strong pl-3 text-xs text-muted">{t.players.seatedNoDelete}</p>
        ) : (
          <ConfirmButton
            size="sm"
            disabled={pending}
            label={t.players.delete}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => deletePlayerAction(player.id), { success: t.players.deleted, onOk: onClose })}
          />
        )}
      </section>
    </Sheet>
  );
}
