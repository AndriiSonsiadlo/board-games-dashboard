"use client";

import { LoaderCircle, MonitorPlay, Pencil, RotateCcw, Spade, Trash } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteResultAction, getAuditAction, showOnScreenAction, undoLastAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { AuditEntry } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { GameIcon } from "../common/GameIcon";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ResultSheet } from "./ResultSheet";
import { useRunner } from "./useRunner";

export function ResultsView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [tab, setTab] = useState<"results" | "audit">("results");
  const [editing, setEditing] = useState<number | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.results.title}</h1>
        <Button
          disabled={pending || snapshot.event.status === "finished"}
          onClick={() => run(() => undoLastAction(), { onOk: ({ summary }) => toast.success(fmt(t.results.undone, { summary })) })}
        >
          <RotateCcw className="size-4" />
          {t.results.undoLast}
        </Button>
      </header>

      <div role="tablist" className="inline-flex rounded-md border border-line p-0.5">
        {(["results", "audit"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-9 rounded px-4 font-display text-xs uppercase tracking-[0.14em]",
              tab === key ? "bg-white/10 text-text" : "text-muted",
            )}
          >
            {key === "results" ? t.results.list : t.results.audit}
          </button>
        ))}
      </div>

      {tab === "results" ? <ResultList onEdit={setEditing} /> : <AuditList version={snapshot.version} />}
      {editing !== null ? <ResultSheet target={{ mode: "edit", sessionId: editing }} onClose={closeEdit} /> : null}
    </div>
  );
}

function ResultList({ onEdit }: { onEdit: (sessionId: number) => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const finished = snapshot.event.status === "finished";

  if (snapshot.results.length === 0) return <p className="text-muted">{t.results.empty}</p>;

  return (
    <ul className="divide-y divide-line border-y border-line">
      {snapshot.results.map((r) => {
        const game = lookups.games.get(r.gameId);
        const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
        return (
          <li key={r.sessionId} className="py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                {formatClock(r.finishedAt)}
              </span>
              {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
              <span className="font-display uppercase tracking-wide">{game?.name}</span>
              <span className="text-xs text-muted">
                {table ? fmt(t.common.tableN, { n: table.number }) : t.results.directEntry}
                {r.durationMin !== null ? ` · ${fmt(t.common.minutesShort, { n: r.durationMin })}` : ""}
              </span>
            </div>
            <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {r.placements.map((p) => (
                <li key={p.playerId} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-5 font-display tabular", p.placement === 1 ? "text-accent" : "text-muted")}>{p.placement}</span>
                  <span className="min-w-0 flex-1 truncate">{lookups.players.get(p.playerId)?.name}</span>
                  {p.jokerDeclared ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} /> : null}
                  <span className="font-mono text-xs text-muted tabular">{formatPoints(p.points)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={finished} onClick={() => onEdit(r.sessionId)}>
                <Pencil className="size-3.5" />
                {t.common.edit}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => showOnScreenAction(r.sessionId), { success: t.result.sentToScreen })}
              >
                <MonitorPlay className="size-3.5" />
                {t.results.showOnScreen}
              </Button>
              <ConfirmButton
                size="sm"
                variant="ghost"
                disabled={pending || finished}
                label={
                  <>
                    <Trash className="size-3.5" />
                    {t.common.delete}
                  </>
                }
                confirmLabel={t.common.tapToConfirm}
                onConfirm={() => run(() => deleteResultAction(r.sessionId), { success: t.results.deleted })}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AuditList({ version }: { version: number }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAuditAction().then((result) => {
      if (!cancelled && result.ok) setEntries(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (entries === null) return <LoaderCircle className="size-5 animate-spin text-muted" />;
  if (entries.length === 0) return <p className="text-muted">{t.results.auditEmpty}</p>;

  return (
    <ul className="divide-y divide-line border-y border-line">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
          <span className="font-mono text-xs text-muted" suppressHydrationWarning>
            {formatClock(e.at)}
          </span>
          <span className="font-mono text-xs text-accent">{e.action}</span>
          <span className="min-w-0 flex-1 text-sm">{e.summary}</span>
          {e.undone ? (
            <span className="rounded-sm border border-line px-1.5 py-0.5 font-display text-[0.62rem] uppercase tracking-[0.12em] text-muted">
              {t.results.undoneTag}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
