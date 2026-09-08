"use client";

import { Spade, X } from "lucide-react";
import { useMemo, useState } from "react";
import { seatTableAction, updateSeatingAction } from "@/app/admin/actions";
import type { AdminSeatView, TableView } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import type { SeatInput } from "@/server/services/sessions";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { GamePicker } from "./GamePicker";
import { PlayerPicker } from "./PlayerPicker";
import { busyPlayers, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";
import { useRunner } from "./useRunner";

export function SeatSheet({
  open,
  onOpenChange,
  table,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: TableView<AdminSeatView>;
}) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const editing = table.session?.status === "setup" ? table.session : null;

  const [gameId, setGameId] = useState<number | null>(editing?.gameId ?? null);
  const [seats, setSeats] = useState<SeatInput[]>(
    editing?.players.map((p) => ({ playerId: p.playerId, jokerDeclared: p.jokerDeclared })) ?? [],
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [query, setQuery] = useState("");

  const games = useMemo(() => orderGamesByRecency(snapshot.games, snapshot.results), [snapshot.games, snapshot.results]);
  const busy = useMemo(() => busyPlayers(snapshot.tables, editing?.id), [snapshot.tables, editing?.id]);
  const recency = useMemo(() => playerRecency(snapshot.results), [snapshot.results]);
  const candidates = useMemo(
    () => sortCandidates(snapshot.players, recency, busy, query),
    [snapshot.players, recency, busy, query],
  );
  const playersById = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);

  const game = snapshot.games.find((g) => g.id === gameId);
  const selected = new Set(seats.map((s) => s.playerId));
  const needsMove = seats.some((s) => busy.get(s.playerId)?.status === "setup");
  const tooMany = game ? seats.length > game.maxPlayers : false;

  const jokerElsewhere = (playerId: number) =>
    Boolean(playersById.get(playerId)?.jokerUsed) &&
    !editing?.players.some((p) => p.playerId === playerId && p.jokerDeclared);

  const togglePlayer = (playerId: number) => {
    setSeats((current) =>
      current.some((s) => s.playerId === playerId)
        ? current.filter((s) => s.playerId !== playerId)
        : [...current, { playerId, jokerDeclared: false }],
    );
  };

  const toggleJoker = (playerId: number) =>
    setSeats((current) => current.map((s) => (s.playerId === playerId ? { ...s, jokerDeclared: !s.jokerDeclared } : s)));

  const submit = () => {
    if (!gameId) return;
    const close = () => onOpenChange(false);
    const payload = { gameId, players: seats, notes, moveFromOtherTables: needsMove };
    if (editing) run(() => updateSeatingAction(editing.id, payload), { onOk: close });
    else run(() => seatTableAction({ tableId: table.tableId, ...payload }), { onOk: close });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={fmt(editing ? t.seat.editTitle : t.seat.title, { n: table.number })}
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {fmt(t.seat.selected, { n: seats.length })}
              {game ? (
                <span className={cn(seats.length > 0 && seats.length < game.minPlayers && "text-accent")}>
                  {` · ${fmt(t.seat.range, { min: game.minPlayers, max: game.maxPlayers })}`}
                </span>
              ) : null}
            </span>
            {needsMove ? <span className="text-accent">{t.seat.moveNote}</span> : null}
          </div>
          <Button variant="primary" size="lg" block loading={pending} disabled={!gameId || seats.length === 0 || tooMany} onClick={submit}>
            {editing ? t.seat.save : t.seat.submit}
          </Button>
        </div>
      }
    >
      <section className="space-y-3">
        <h3 className="label-caps">{t.seat.game}</h3>
        <GamePicker games={games} value={gameId} onChange={setGameId} />
      </section>

      {seats.length > 0 ? (
        <section className="mt-6 space-y-2">
          <h3 className="label-caps">{t.seat.players}</h3>
          <ol className="divide-y divide-line rounded-md border border-line">
            {seats.map((s) => {
              const p = playersById.get(s.playerId);
              if (!p) return null;
              const locked = jokerElsewhere(s.playerId);
              return (
                <li key={s.playerId} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={p.name} color={p.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => toggleJoker(s.playerId)}
                    aria-pressed={s.jokerDeclared}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-display text-[0.68rem] uppercase tracking-[0.12em] transition-colors",
                      s.jokerDeclared ? "border-accent bg-accent/15 text-accent" : "border-line text-muted",
                      locked && "opacity-40",
                    )}
                  >
                    <Spade className="size-3.5" strokeWidth={1.75} />
                    {locked ? t.seat.jokerUsed : t.seat.joker}
                  </button>
                  <button type="button" onClick={() => togglePlayer(s.playerId)} className="grid size-9 place-items-center text-muted hover:text-text" aria-label={t.common.delete}>
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="mt-6">
        <PlayerPicker
          players={candidates}
          selected={selected}
          busy={busy}
          onToggle={togglePlayer}
          query={query}
          onQueryChange={setQuery}
          allowSetupBusy
        />
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="label-caps">{t.seat.notes}</h3>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.seat.notesPlaceholder}
          className="h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
        />
      </section>
    </Sheet>
  );
}
