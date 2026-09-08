"use client";

import { Spade } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  correctJokerAction,
  editResultAction,
  recordDirectResultAction,
  recordResultAction,
  showOnScreenAction,
  undoLastAction,
} from "@/app/admin/actions";
import type { AdminSnapshot } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { handleResult } from "@/lib/notify";
import { Avatar } from "../common/Avatar";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { GamePicker } from "./GamePicker";
import { PlacementList } from "./PlacementList";
import { orderFromPlacements, placementsFromOrder, previewPoints, type OrderedEntry } from "./placement";
import { PlayerPicker } from "./PlayerPicker";
import { busyPlayers, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";
import { useRunner } from "./useRunner";

export type ResultTarget = { mode: "session"; sessionId: number } | { mode: "direct" } | { mode: "edit"; sessionId: number };

interface Draft {
  gameId: number | null;
  tableId: number | null;
  pool: number[];
  order: OrderedEntry[];
  jokers: number[];
}

function findOpenSession(snapshot: AdminSnapshot, sessionId: number) {
  for (const table of snapshot.tables) {
    if (table.session?.id === sessionId) return { table, session: table.session };
  }
  return null;
}

function initialDraft(snapshot: AdminSnapshot, target: ResultTarget): Draft {
  if (target.mode === "session") {
    const open = findOpenSession(snapshot, target.sessionId);
    return {
      gameId: open?.session.gameId ?? null,
      tableId: open?.table.tableId ?? null,
      pool: open?.session.players.map((p) => p.playerId) ?? [],
      order: [],
      jokers: [],
    };
  }
  if (target.mode === "edit") {
    const result = snapshot.results.find((r) => r.sessionId === target.sessionId);
    if (result) {
      return {
        gameId: result.gameId,
        tableId: result.tableId,
        pool: result.placements.map((p) => p.playerId),
        order: orderFromPlacements(result.placements),
        jokers: result.placements.filter((p) => p.jokerDeclared).map((p) => p.playerId),
      };
    }
  }
  return { gameId: null, tableId: null, pool: [], order: [], jokers: [] };
}

export function ResultSheet({ target, onClose }: { target: ResultTarget; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot, refresh } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(snapshot, target));
  const [originalJokers] = useState(() => new Set(draft.jokers));
  const [query, setQuery] = useState("");

  const open = target.mode === "session" ? findOpenSession(snapshot, target.sessionId) : null;
  const missing =
    (target.mode === "session" && !open) ||
    (target.mode === "edit" && !snapshot.results.some((r) => r.sessionId === target.sessionId));

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  const game = draft.gameId !== null ? lookups.games.get(draft.gameId) : undefined;
  const jokers = useMemo(
    () =>
      target.mode === "session"
        ? new Set(open?.session.players.filter((p) => p.jokerDeclared).map((p) => p.playerId) ?? [])
        : new Set(draft.jokers),
    [target.mode, open, draft.jokers],
  );
  const placements = useMemo(() => placementsFromOrder(draft.order), [draft.order]);
  const points = useMemo(
    () => (game ? previewPoints(game.weight, placements, jokers, snapshot.event.scoring) : new Map<number, number>()),
    [game, placements, jokers, snapshot.event.scoring],
  );

  const games = useMemo(() => orderGamesByRecency(snapshot.games, snapshot.results), [snapshot.games, snapshot.results]);
  const busy = useMemo(
    () => (target.mode === "direct" ? busyPlayers(snapshot.tables) : new Map()),
    [target.mode, snapshot.tables],
  );
  const recency = useMemo(() => playerRecency(snapshot.results), [snapshot.results]);
  const candidates = useMemo(
    () => sortCandidates(snapshot.players, recency, busy, query),
    [snapshot.players, recency, busy, query],
  );

  if (missing) return null;

  const placed = new Set(draft.order.map((e) => e.playerId));
  const unplaced = draft.pool.filter((id) => !placed.has(id));
  const editableSetup = target.mode !== "session";

  const togglePool = (playerId: number) =>
    setDraft((d) =>
      d.pool.includes(playerId)
        ? {
            ...d,
            pool: d.pool.filter((id) => id !== playerId),
            order: d.order.filter((e) => e.playerId !== playerId),
            jokers: d.jokers.filter((id) => id !== playerId),
          }
        : { ...d, pool: [...d.pool, playerId] },
    );

  const place = (playerId: number) =>
    setDraft((d) => ({ ...d, order: [...d.order, { playerId, tiedWithPrevious: false }] }));

  const toggleLocalJoker = (playerId: number) =>
    setDraft((d) => ({
      ...d,
      jokers: d.jokers.includes(playerId) ? d.jokers.filter((id) => id !== playerId) : [...d.jokers, playerId],
    }));

  const jokerTakenElsewhere = (playerId: number) =>
    Boolean(lookups.players.get(playerId)?.jokerUsed) && !originalJokers.has(playerId);

  const announce = (sessionId: number) =>
    toast.success(t.result.saved, {
      duration: 10_000,
      action: {
        label: t.result.showOnScreen,
        onClick: async () => {
          if (handleResult(await showOnScreenAction(sessionId), t, t.result.sentToScreen)) refresh();
        },
      },
      cancel: {
        label: t.common.undo,
        onClick: async () => {
          if (handleResult(await undoLastAction(), t, t.result.undone)) refresh();
        },
      },
    });

  const withJokers = placements.map((p) => ({ ...p, jokerDeclared: jokers.has(p.playerId) }));

  const submit = () => {
    if (!game || placements.length < 2) return;
    if (target.mode === "session") {
      run(() => recordResultAction({ sessionId: target.sessionId, placements }), {
        onOk: () => {
          onClose();
          announce(target.sessionId);
        },
      });
    } else if (target.mode === "direct") {
      run(() => recordDirectResultAction({ gameId: game.id, tableId: draft.tableId, placements: withJokers }), {
        onOk: (sessionId) => {
          onClose();
          announce(sessionId);
        },
      });
    } else {
      run(
        () => editResultAction({ sessionId: target.sessionId, gameId: game.id, tableId: draft.tableId, placements: withJokers }),
        { success: t.result.saved, onOk: onClose },
      );
    }
  };

  const tableNumber = draft.tableId !== null ? lookups.tables.get(draft.tableId)?.number : undefined;
  const title =
    target.mode === "session" && game
      ? `${game.name} · ${tableNumber !== undefined ? fmt(t.common.tableN, { n: tableNumber }) : t.common.noTable}`
      : target.mode === "edit"
        ? t.result.editTitle
        : t.result.newTitle;

  const tableChoices = target.mode === "edit" ? snapshot.allTables : snapshot.allTables.filter((x) => x.active);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <div className="space-y-2">
          {draft.order.length < 2 ? <p className="text-center text-xs text-muted">{t.result.needTwo}</p> : null}
          <Button variant="primary" size="lg" block loading={pending} disabled={!game || draft.order.length < 2} onClick={submit}>
            {target.mode === "edit" ? t.result.save : t.result.confirm}
          </Button>
        </div>
      }
    >
      {editableSetup ? (
        <>
          <section className="space-y-3">
            <h3 className="label-caps">{t.result.game}</h3>
            <GamePicker games={games} value={draft.gameId} onChange={(gameId) => setDraft((d) => ({ ...d, gameId }))} />
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="label-caps">{t.result.table}</h3>
            <div className="flex flex-wrap gap-2">
              {[{ id: null as number | null, label: t.common.noTable }, ...tableChoices.map((x) => ({ id: x.id as number | null, label: String(x.number).padStart(2, "0") }))].map(
                (choice) => (
                  <button
                    key={choice.id ?? "none"}
                    type="button"
                    aria-pressed={draft.tableId === choice.id}
                    onClick={() => setDraft((d) => ({ ...d, tableId: choice.id }))}
                    className={cn(
                      "h-10 min-w-12 rounded-md border px-3 font-display text-sm uppercase tracking-wide",
                      draft.tableId === choice.id ? "border-accent bg-accent/10 text-text" : "border-line text-muted",
                    )}
                  >
                    {choice.label}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="label-caps">{t.result.players}</h3>
            <PlayerPicker
              players={candidates}
              selected={new Set(draft.pool)}
              busy={busy}
              onToggle={togglePool}
              query={query}
              onQueryChange={setQuery}
            />
          </section>
        </>
      ) : null}

      <section className={cn("space-y-3", editableSetup && "mt-8")}>
        <div className="flex items-center justify-between">
          <h3 className="label-caps">{t.result.tapInOrder}</h3>
          {draft.order.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, order: [] }))}>
              {t.result.resetOrder}
            </Button>
          ) : null}
        </div>

        <PlacementList
          order={draft.order}
          onChange={(order) => setDraft((d) => ({ ...d, order }))}
          allowTies={game?.allowTies ?? false}
          points={points}
          jokers={jokers}
          players={lookups.players}
        />

        {unplaced.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {unplaced.map((id) => {
                const p = lookups.players.get(id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => place(id)}
                    className="flex min-h-12 items-center gap-2 rounded-md border border-dashed border-line-strong px-2.5 text-left hover:border-accent"
                  >
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {jokers.has(id) ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} /> : null}
                  </button>
                );
              })}
            </div>
            {target.mode === "session" && draft.order.length > 0 ? (
              <p className="text-xs text-muted">{t.result.unplacedHint}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {draft.pool.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h3 className="label-caps">{t.result.joker}</h3>
          <div className="flex flex-wrap gap-2">
            {draft.pool.map((id) => {
              const p = lookups.players.get(id);
              if (!p) return null;
              const on = jokers.has(id);
              const chipClass = cn(
                "h-9 gap-1.5 px-2.5 normal-case tracking-normal font-sans text-sm",
                on ? "border-accent text-accent" : "",
              );
              if (target.mode === "session" && open) {
                return (
                  <ConfirmButton
                    key={id}
                    size="sm"
                    variant="secondary"
                    className={chipClass}
                    label={
                      <>
                        <Spade className="size-3.5" strokeWidth={1.75} />
                        {p.name}
                      </>
                    }
                    confirmLabel={t.result.changeJoker}
                    disabled={pending || (!on && jokerTakenElsewhere(id))}
                    onConfirm={() => run(() => correctJokerAction({ sessionId: open.session.id, playerId: id, jokerDeclared: !on }))}
                  />
                );
              }
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="secondary"
                  className={chipClass}
                  aria-pressed={on}
                  disabled={!on && jokerTakenElsewhere(id)}
                  onClick={() => toggleLocalJoker(id)}
                >
                  <Spade className="size-3.5" strokeWidth={1.75} />
                  {p.name}
                </Button>
              );
            })}
          </div>
          {target.mode === "session" ? <p className="text-xs text-muted">{t.result.jokerLocked}</p> : null}
        </section>
      ) : null}
    </Sheet>
  );
}
