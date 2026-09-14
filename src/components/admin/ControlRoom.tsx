"use client";

import { Plus, Spade } from "lucide-react";
import { useCallback, useState } from "react";
import { cancelSessionAction, finishSessionAction, resumeSessionAction, startSessionAction } from "@/app/admin/actions";
import type { AdminSeatView, TableView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { pad2 } from "@/lib/format";
import { Avatar } from "../common/Avatar";
import { ElapsedClock } from "../common/ElapsedClock";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { GameIcon } from "../common/GameIcon";
import { StateLabel } from "../common/StateLabel";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ResultSheet, type ResultTarget } from "./ResultSheet";
import { ScreenRemote } from "./ScreenRemote";
import { SeatSheet } from "./SeatSheet";
import { UnlockFeed } from "./UnlockFeed";
import { useRunner } from "./useRunner";

type AdminTable = TableView<AdminSeatView>;

export function ControlRoom() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const [seatTableId, setSeatTableId] = useState<number | null>(null);
  const [resultTarget, setResultTarget] = useState<ResultTarget | null>(null);
  const closeResult = useCallback(() => setResultTarget(null), []);
  const seatTable = snapshot.tables.find((x) => x.tableId === seatTableId) ?? null;
  const finished = snapshot.event.status === "finished";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{snapshot.event.name}</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-tight md:text-4xl">{t.room.title}</h1>
        </div>
        <EventStatusBadge event={snapshot.event} />
      </header>

      {snapshot.event.status !== "live" ? (
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">
          {snapshot.event.status === "draft" ? t.room.draftNotice : t.room.finishedNotice}
        </p>
      ) : null}

      <ScreenRemote />
      <UnlockFeed />

      {snapshot.tables.length === 0 ? (
        <p className="text-muted">{t.room.noTables}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {snapshot.tables.map((table) => (
            <TableRow
              key={table.tableId}
              table={table}
              onSeat={() => setSeatTableId(table.tableId)}
              onResult={(sessionId) => setResultTarget({ mode: "session", sessionId })}
            />
          ))}
        </ul>
      )}

      {!finished ? (
        <Button
          variant="primary"
          size="lg"
          className="fixed right-4 bottom-24 z-20 shadow-[0_12px_40px_rgba(0,0,0,0.5)] md:right-10 md:bottom-10"
          onClick={() => setResultTarget({ mode: "direct" })}
        >
          <Plus className="size-5" />
          {t.room.newResult}
        </Button>
      ) : null}

      {seatTable ? (
        <SeatSheet key={seatTable.tableId} open onOpenChange={(o) => !o && setSeatTableId(null)} table={seatTable} />
      ) : null}
      {resultTarget ? <ResultSheet target={resultTarget} onClose={closeResult} /> : null}
    </div>
  );
}

function TableRow({
  table,
  onSeat,
  onResult,
}: {
  table: AdminTable;
  onSeat: () => void;
  onResult: (sessionId: number) => void;
}) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const finished = snapshot.event.status === "finished";
  const session = table.session;
  const game = session ? lookups.games.get(session.gameId) : undefined;

  const cancel = session ? (
    <ConfirmButton
      size="sm"
      variant="ghost"
      label={t.room.cancelGame}
      confirmLabel={t.common.tapToConfirm}
      disabled={pending}
      onConfirm={() => run(() => cancelSessionAction(session.id))}
    />
  ) : null;

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[5rem_1fr_auto] md:items-center md:gap-6">
      <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
        <span className="font-display text-4xl leading-none tabular">{pad2(table.number)}</span>
        <StateLabel state={table.state} />
      </div>

      <div className="min-w-0">
        {session && game ? (
          <>
            <div className="flex items-center gap-2">
              <GameIcon name={game.icon} className="size-4 text-accent" />
              <span className="font-display text-lg uppercase tracking-wide">{game.name}</span>
              {session.startedAt ? (
                <ElapsedClock from={session.startedAt} to={session.finishedAt} className="ml-auto font-mono text-sm text-muted md:ml-3" />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {session.players.map((sp) => {
                const p = lookups.players.get(sp.playerId);
                if (!p) return null;
                return (
                  <span key={sp.playerId} className="flex items-center gap-1.5 text-sm">
                    <Avatar name={p.name} color={p.color} size="sm" />
                    {p.name}
                    {sp.jokerDeclared ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} aria-label={t.seat.joker} /> : null}
                  </span>
                );
              })}
            </div>
            {session.notes ? <p className="mt-1 text-xs text-muted">{session.notes}</p> : null}
          </>
        ) : (
          table.label ? <span className="text-sm text-muted">{table.label}</span> : null
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {table.state === "available" ? (
          <Button variant="primary" onClick={onSeat} disabled={finished}>
            {t.room.seat}
          </Button>
        ) : null}
        {table.state === "preparing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => startSessionAction(session.id))}>
              {t.room.start}
            </Button>
            <Button onClick={onSeat}>{t.room.editSeating}</Button>
            {cancel}
          </>
        ) : null}
        {table.state === "playing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => finishSessionAction(session.id))}>
              {t.room.finish}
            </Button>
            <Button disabled={finished} onClick={() => onResult(session.id)}>
              {t.room.enterResult}
            </Button>
            {cancel}
          </>
        ) : null}
        {table.state === "pending" && session ? (
          <>
            <Button variant="primary" disabled={finished} onClick={() => onResult(session.id)}>
              {t.room.enterResult}
            </Button>
            <Button disabled={pending} onClick={() => run(() => resumeSessionAction(session.id))}>
              {t.room.resume}
            </Button>
            {cancel}
          </>
        ) : null}
      </div>
    </li>
  );
}
