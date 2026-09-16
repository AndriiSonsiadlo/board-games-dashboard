import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  UNDOABLE_ACTIONS,
  type AuditAction,
  type AuditEntry,
  type PlayerSource,
  type SessionFact,
  type SessionPlayerFact,
} from "@/domain/types";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "../services/errors";

type EventPatch = Partial<Omit<typeof s.event.$inferInsert, "id">>;
type PlayerPatch = Partial<Omit<typeof s.players.$inferInsert, "id">>;
type GamePatch = Partial<Omit<typeof s.games.$inferInsert, "id" | "slug">>;
type TablePatch = Partial<Omit<typeof s.tables.$inferInsert, "id">>;
type SessionPatch = Partial<Omit<typeof s.sessions.$inferInsert, "id">>;

export function bumpVersion(tx: Tx): void {
  tx.update(s.event)
    .set({ dataVersion: sql`${s.event.dataVersion} + 1` })
    .where(eq(s.event.id, 1))
    .run();
}

export function updateEventRow(tx: Tx, patch: EventPatch): void {
  tx.update(s.event).set(patch).where(eq(s.event.id, 1)).run();
}

export function insertPlayer(
  tx: Tx,
  values: { name: string; nickname: string | null; color: string; source: PlayerSource; isDemo?: boolean; createdAt: number },
): number {
  const row = tx
    .insert(s.players)
    .values({ ...values, isDemo: values.isDemo ?? false })
    .returning({ id: s.players.id })
    .get();
  return row.id;
}

export function updatePlayerRow(tx: Tx, id: number, patch: PlayerPatch): void {
  tx.update(s.players).set(patch).where(eq(s.players.id, id)).run();
}

export function deletePlayerRow(tx: Tx, id: number): void {
  tx.delete(s.players).where(eq(s.players.id, id)).run();
}

export function reassignPlayerSeats(tx: Tx, fromId: number, toId: number): void {
  tx.update(s.sessionPlayers).set({ playerId: toId }).where(eq(s.sessionPlayers.playerId, fromId)).run();
}

export function updateGameRow(tx: Tx, id: number, patch: GamePatch): void {
  tx.update(s.games).set(patch).where(eq(s.games.id, id)).run();
}

export function insertGame(tx: Tx, values: Omit<typeof s.games.$inferInsert, "id">): number {
  return tx.insert(s.games).values(values).returning({ id: s.games.id }).get().id;
}

export function deleteGameRow(tx: Tx, id: number): void {
  tx.delete(s.games).where(eq(s.games.id, id)).run();
}

export function gameHasSessions(tx: Tx, gameId: number): boolean {
  return Boolean(tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.gameId, gameId)).get());
}

export function insertTable(tx: Tx, values: { number: number; label: string | null }): number {
  return tx.insert(s.tables).values(values).returning({ id: s.tables.id }).get().id;
}

export function updateTableRow(tx: Tx, id: number, patch: TablePatch): void {
  tx.update(s.tables).set(patch).where(eq(s.tables.id, id)).run();
}

export function deleteTableRow(tx: Tx, id: number): void {
  tx.delete(s.tables).where(eq(s.tables.id, id)).run();
}

export function tableHasSessions(tx: Tx, tableId: number): boolean {
  return Boolean(tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.tableId, tableId)).get());
}

export function insertSession(
  tx: Tx,
  values: Omit<typeof s.sessions.$inferInsert, "id">,
  players: SessionPlayerFact[],
): number {
  const id = tx.insert(s.sessions).values(values).returning({ id: s.sessions.id }).get().id;
  replaceSessionPlayers(tx, id, players);
  return id;
}

export function updateSessionRow(tx: Tx, id: number, patch: SessionPatch): void {
  tx.update(s.sessions).set(patch).where(eq(s.sessions.id, id)).run();
}

export function deleteSessionRow(tx: Tx, id: number): void {
  tx.delete(s.sessions).where(eq(s.sessions.id, id)).run();
}

export function replaceSessionPlayers(tx: Tx, sessionId: number, players: SessionPlayerFact[]): void {
  tx.delete(s.sessionPlayers).where(eq(s.sessionPlayers.sessionId, sessionId)).run();
  if (players.length === 0) return;
  tx.insert(s.sessionPlayers)
    .values(players.map((p) => ({ sessionId, ...p })))
    .run();
}

/** Upsert a full session (row + seats) by id. Used for undo and edits. */
export function writeSession(tx: Tx, fact: SessionFact): void {
  const { players, id, ...row } = fact;
  tx.insert(s.sessions)
    .values({ id, ...row })
    .onConflictDoUpdate({ target: s.sessions.id, set: row })
    .run();
  replaceSessionPlayers(tx, id, players);
}

export function insertAnnouncement(
  tx: Tx,
  value:
    | { type: "result_reveal"; payload: { sessionId: number } }
    | { type: "milestone"; payload: { count: number } }
    | { type: "achievement"; payload: { sessionId: number; playerId: number; achievementId: string } },
  createdAt: number,
): number {
  return tx
    .insert(s.announcements)
    .values({ type: value.type, payload: value.payload, createdAt })
    .returning({ id: s.announcements.id })
    .get().id;
}

export function milestoneExists(tx: Tx, count: number): boolean {
  return tx
    .select()
    .from(s.announcements)
    .where(eq(s.announcements.type, "milestone"))
    .all()
    .some((a) => a.payload.count === count);
}

export function upsertAchievementSetting(tx: Tx, achievementId: string, enabled: boolean): void {
  tx.insert(s.achievementSettings)
    .values({ achievementId, enabled })
    .onConflictDoUpdate({ target: s.achievementSettings.achievementId, set: { enabled } })
    .run();
}

export function insertAudit(
  tx: Tx,
  entry: { action: AuditAction; summary: string; before: SessionFact | null; after: SessionFact | null; at: number },
): number {
  return tx.insert(s.auditLog).values(entry).returning({ id: s.auditLog.id }).get().id;
}

export function lastUndoableAudit(tx: Tx): AuditEntry | null {
  return (
    tx
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.undone, false), inArray(s.auditLog.action, UNDOABLE_ACTIONS)))
      .orderBy(desc(s.auditLog.id))
      .get() ?? null
  );
}

export function markAuditUndone(tx: Tx, id: number): void {
  tx.update(s.auditLog).set({ undone: true }).where(eq(s.auditLog.id, id)).run();
}

/** Announcements about deleted demo games/players, and milestones the remaining results have not reached. */
function deleteDemoAnnouncements(tx: Tx, sessionIds: Set<number>, playerIds: Set<number>): void {
  const remainingResults = tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.status, "done")).all().length;
  const stale = tx
    .select()
    .from(s.announcements)
    .all()
    .filter((a) => {
      const payload = a.payload;
      if (a.type === "milestone") return typeof payload.count === "number" && payload.count > remainingResults;
      if (typeof payload.sessionId === "number" && sessionIds.has(payload.sessionId)) return true;
      return typeof payload.playerId === "number" && playerIds.has(payload.playerId);
    })
    .map((a) => a.id);
  if (stale.length > 0) tx.delete(s.announcements).where(inArray(s.announcements.id, stale)).run();
}

export function deleteDemoData(tx: Tx): void {
  const demoIds = tx
    .select({ id: s.players.id })
    .from(s.players)
    .where(eq(s.players.isDemo, true))
    .all()
    .map((p) => p.id);

  if (demoIds.length > 0) {
    // A demo player can also hold a seat in a non-demo session (e.g. a rehearsal game
    // that included a real player never marks the session isDemo). Hand-deleting that
    // seat here would silently corrupt or vanish real session data, so refuse instead.
    const seatedElsewhere = tx
      .select({ sessionId: s.sessionPlayers.sessionId })
      .from(s.sessionPlayers)
      .innerJoin(s.sessions, eq(s.sessionPlayers.sessionId, s.sessions.id))
      .where(and(inArray(s.sessionPlayers.playerId, demoIds), eq(s.sessions.isDemo, false)))
      .get();
    if (seatedElsewhere) throw new ServiceError("demo_player_in_use");
  }

  const demoSessionIds = tx
    .select({ id: s.sessions.id })
    .from(s.sessions)
    .where(eq(s.sessions.isDemo, true))
    .all()
    .map((r) => r.id);

  tx.delete(s.sessions).where(eq(s.sessions.isDemo, true)).run();
  if (demoIds.length > 0) {
    tx.delete(s.sessionPlayers).where(inArray(s.sessionPlayers.playerId, demoIds)).run();
    tx.delete(s.players).where(inArray(s.players.id, demoIds)).run();
  }
  deleteDemoAnnouncements(tx, new Set(demoSessionIds), new Set(demoIds));
}
