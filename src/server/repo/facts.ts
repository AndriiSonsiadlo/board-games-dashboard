import { asc, desc, eq } from "drizzle-orm";
import type { AuditEntry, Facts, SessionFact } from "@/domain/types";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

type SessionRow = typeof s.sessions.$inferSelect;
type SessionPlayerRow = typeof s.sessionPlayers.$inferSelect;

function toSessionFact(row: SessionRow, players: SessionPlayerRow[]): SessionFact {
  return {
    id: row.id,
    tableId: row.tableId,
    gameId: row.gameId,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    notes: row.notes,
    isDemo: row.isDemo,
    players: players
      .filter((p) => p.sessionId === row.id)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        playerId: p.playerId,
        seat: p.seat,
        jokerDeclared: p.jokerDeclared,
        placement: p.placement,
      })),
  };
}

export function getEventRow(tx: Tx) {
  const row = tx.select().from(s.event).where(eq(s.event.id, 1)).get();
  if (!row) throw new Error("Event row missing. Run `npm run setup` first.");
  return row;
}

export function getDataVersion(tx: Tx): number {
  const row = tx.select({ v: s.event.dataVersion }).from(s.event).where(eq(s.event.id, 1)).get();
  if (!row) throw new Error("Event row missing. Run `npm run setup` first.");
  return row.v;
}

export function loadSecrets(tx: Tx): { adminPinHash: string; sessionSecret: string } {
  const row = getEventRow(tx);
  return { adminPinHash: row.adminPinHash, sessionSecret: row.sessionSecret };
}

export function loadSession(tx: Tx, id: number): SessionFact | null {
  const row = tx.select().from(s.sessions).where(eq(s.sessions.id, id)).get();
  if (!row) return null;
  const players = tx.select().from(s.sessionPlayers).where(eq(s.sessionPlayers.sessionId, id)).all();
  return toSessionFact(row, players);
}

export function loadFacts(tx: Tx): Facts {
  const e = getEventRow(tx);
  const sessionRows = tx.select().from(s.sessions).orderBy(asc(s.sessions.id)).all();
  const seatRows = tx.select().from(s.sessionPlayers).all();
  const announcementRows = tx
    .select()
    .from(s.announcements)
    .orderBy(desc(s.announcements.id))
    .limit(20)
    .all();

  return {
    event: {
      name: e.name,
      city: e.city,
      year: e.year,
      status: e.status,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      finaleRevealed: e.finaleRevealed,
      scoring: {
        strategy: e.scoringStrategy,
        bestN: e.bestN,
        participationFloor: e.participationFloor,
        jokerMultiplier: e.jokerMultiplier,
      },
      sceneDurationSec: e.sceneDurationSec,
      enabledScenes: e.enabledScenes,
      showPointsInReveals: e.showPointsInReveals,
      screenLang: e.screenLang,
      accentColor: e.accentColor,
      publicBaseUrl: e.publicBaseUrl,
      screenControl: e.screenControl,
      dataVersion: e.dataVersion,
    },
    players: tx.select().from(s.players).orderBy(asc(s.players.id)).all(),
    games: tx.select().from(s.games).orderBy(asc(s.games.weight), asc(s.games.name)).all(),
    tables: tx.select().from(s.tables).orderBy(asc(s.tables.number)).all(),
    sessions: sessionRows.map((row) => toSessionFact(row, seatRows)),
    announcements: announcementRows.map((a) =>
      a.type === "milestone"
        ? { id: a.id, type: "milestone" as const, payload: { count: a.payload.count ?? 0 }, createdAt: a.createdAt }
        : { id: a.id, type: "result_reveal" as const, payload: { sessionId: a.payload.sessionId ?? 0 }, createdAt: a.createdAt },
    ),
  };
}

export function listAudit(tx: Tx, limit = 50): AuditEntry[] {
  return tx.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(limit).all();
}
