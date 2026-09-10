"use client";

import { ListPlus, Pencil, Spade } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { addPlayerAction, bulkAddPlayersAction } from "@/app/admin/actions";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { PlayerEditSheet } from "./PlayerEditSheet";
import { matchesQuery } from "./seating";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-display text-[0.6rem] uppercase tracking-[0.12em]",
        tone === "accent" ? "border-accent/50 text-accent" : "border-line text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function PlayersView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const closeEdit = useCallback(() => setEditingId(null), []);

  const players = useMemo(
    () =>
      snapshot.players
        .filter((p) => matchesQuery(p.name, query) || (p.nickname !== null && matchesQuery(p.nickname, query)))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [snapshot.players, query],
  );
  const editing = snapshot.players.find((p) => p.id === editingId);
  const activeCount = snapshot.players.filter((p) => p.active).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(() => addPlayerAction({ name, nickname }), {
      onOk: () => {
        setName("");
        setNickname("");
        nameRef.current?.focus();
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.players.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmt(t.players.total, { n: activeCount })}</p>
        </div>
        <Button variant="ghost" onClick={() => setBulkOpen((o) => !o)} aria-expanded={bulkOpen}>
          <ListPlus className="size-4" />
          {t.players.bulk}
        </Button>
      </header>

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.players.namePlaceholder} className={inputClass} />
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.players.nicknamePlaceholder} className={inputClass} />
        <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
          {t.players.add}
        </Button>
      </form>

      {bulkOpen ? (
        <div className="space-y-2">
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={t.players.bulkPlaceholder}
            rows={6}
            className="w-full rounded-md border border-line bg-surface-2 p-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
          />
          <Button
            disabled={!bulk.trim() || pending}
            onClick={() =>
              run(() => bulkAddPlayersAction(bulk), {
                onOk: (count) => {
                  toast.success(fmt(t.players.bulkAdded, { n: count }));
                  setBulk("");
                  setBulkOpen(false);
                },
              })
            }
          >
            {t.players.bulkSubmit}
          </Button>
        </div>
      ) : null}

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.players.search} className={inputClass} />

      <ul className="divide-y divide-line border-y border-line">
        {players.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 py-2.5", !p.active && "opacity-50")}>
            <Avatar name={p.name} color={p.color} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate">{p.name}</span>
                {p.nickname ? <span className="text-sm text-muted">{p.nickname}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.source === "checkin" ? <Badge>{t.players.checkin}</Badge> : null}
                {p.isDemo ? <Badge>{t.players.demo}</Badge> : null}
                {!p.active ? <Badge>{t.players.inactive}</Badge> : null}
                {p.jokerUsed ? (
                  <Badge tone="accent">
                    <span className="inline-flex items-center gap-1">
                      <Spade className="size-2.5" strokeWidth={2} />
                      {t.seat.jokerUsed}
                    </span>
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)} aria-label={t.common.edit}>
              <Pencil className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {editing ? <PlayerEditSheet key={editing.id} player={editing} onClose={closeEdit} /> : null}
    </div>
  );
}
