import { validatePlacements } from "@/domain/scoring";
import { isOpenSession } from "@/domain/tables";
import { MILESTONES, type AuditAction, type Facts, type GameFact, type SessionFact } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deleteSessionRow,
  insertAnnouncement,
  insertAudit,
  insertSession,
  lastUndoableAudit,
  markAuditUndone,
  milestoneExists,
  replaceSessionPlayers,
  updateSessionRow,
  writeSession,
} from "../repo/writes";
import { mutateResult } from "./achievements";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface SeatInput {
  playerId: number;
  jokerDeclared: boolean;
}

export interface PlacementEntry {
  playerId: number;
  placement: number;
}

export interface DirectPlacement extends PlacementEntry {
  jokerDeclared: boolean;
}

const fail = (code: ConstructorParameters<typeof ServiceError>[0]): never => {
  throw new ServiceError(code);
};

function requireSession(facts: Facts, id: number): SessionFact {
  return facts.sessions.find((s) => s.id === id) ?? fail("not_found");
}

function requireGame(facts: Facts, id: number, mustBeActive: boolean): GameFact {
  const game = facts.games.find((g) => g.id === id) ?? fail("not_found");
  if (mustBeActive && !game.active) fail("invalid_value");
  return game;
}

function requireTable(facts: Facts, id: number, mustBeActive: boolean): void {
  const table = facts.tables.find((t) => t.id === id) ?? fail("not_found");
  if (mustBeActive && !table.active) fail("invalid_value");
}

function requirePlayers(facts: Facts, ids: number[], mustBeActive: boolean): void {
  if (new Set(ids).size !== ids.length) fail("invalid_value");
  for (const id of ids) {
    const player = facts.players.find((p) => p.id === id) ?? fail("not_found");
    if (mustBeActive && !player.active) fail("invalid_value");
  }
}

function requireStatus(session: SessionFact, ...allowed: SessionFact["status"][]): void {
  if (!allowed.includes(session.status)) fail("invalid_status");
}

function assertJokersAvailable(facts: Facts, entries: SeatInput[], excludeSessionId?: number): void {
  for (const entry of entries.filter((e) => e.jokerDeclared)) {
    const usedElsewhere = facts.sessions.some(
      (s) =>
        s.id !== excludeSessionId &&
        s.status !== "cancelled" &&
        s.players.some((p) => p.playerId === entry.playerId && p.jokerDeclared),
    );
    if (usedElsewhere) fail("joker_used");
  }
}

function openSessionsWithPlayer(facts: Facts, playerId: number, excludeSessionId?: number): SessionFact[] {
  return facts.sessions.filter(
    (s) => s.id !== excludeSessionId && isOpenSession(s) && s.players.some((p) => p.playerId === playerId),
  );
}

/** Ensures every player is free; optionally pulls them out of other tables that are still in setup. */
function freePlayers(tx: Tx, facts: Facts, playerIds: number[], excludeSessionId: number | undefined, move: boolean): void {
  for (const playerId of playerIds) {
    const busy = openSessionsWithPlayer(facts, playerId, excludeSessionId);
    if (busy.length === 0) continue;
    if (!move || busy.some((s) => s.status !== "setup")) fail("player_busy");
    for (const other of busy) {
      const remaining = other.players.filter((p) => p.playerId !== playerId);
      replaceSessionPlayers(tx, other.id, remaining);
      other.players = remaining;
    }
  }
}

function assertTableFree(facts: Facts, tableId: number, excludeSessionId?: number): void {
  if (facts.sessions.some((s) => s.id !== excludeSessionId && s.tableId === tableId && isOpenSession(s))) {
    fail("table_busy");
  }
}

function summaryOf(facts: Facts, session: SessionFact): string {
  const game = facts.games.find((g) => g.id === session.gameId)?.name ?? "Game";
  const table = facts.tables.find((t) => t.id === session.tableId);
  const where = table ? `Table ${table.number}` : "No table";
  return `${game} · ${where} · ${session.players.length} players`;
}

function validateResult(game: GameFact, placements: PlacementEntry[]): void {
  if (placements.length > game.maxPlayers) fail("too_many_players");
  const error = validatePlacements(
    placements.map((p) => p.placement),
    game.allowTies,
  );
  if (error) fail(error);
}

function announceMilestone(tx: Tx): void {
  const completed = loadFacts(tx).sessions.filter((s) => s.status === "done").length;
  if ((MILESTONES as readonly number[]).includes(completed) && !milestoneExists(tx, completed)) {
    insertAnnouncement(tx, { type: "milestone", payload: { count: completed } }, Date.now());
  }
}

const seatsFrom = (players: SeatInput[]) =>
  players.map((p, seat) => ({ playerId: p.playerId, seat, jokerDeclared: p.jokerDeclared, placement: null }));

export function seatTable(
  db: Db,
  input: { tableId: number; gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): number {
  return mutate(db, (tx) => {
    const facts = loadFacts(tx);
    requireTable(facts, input.tableId, true);
    const game = requireGame(facts, input.gameId, true);
    const ids = input.players.map((x) => x.playerId);
    requirePlayers(facts, ids, true);
    if (input.players.length > game.maxPlayers) fail("too_many_players");
    assertTableFree(facts, input.tableId);
    assertJokersAvailable(facts, input.players);
    freePlayers(tx, facts, ids, undefined, input.moveFromOtherTables ?? false);
    return insertSession(
      tx,
      {
        tableId: input.tableId,
        gameId: input.gameId,
        status: "setup",
        createdAt: Date.now(),
        notes: input.notes?.trim() || null,
      },
      seatsFrom(input.players),
    );
  });
}

export function updateSeating(
  db: Db,
  sessionId: number,
  input: { gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const session = requireSession(facts, sessionId);
    requireStatus(session, "setup");
    const game = requireGame(facts, input.gameId, true);
    const ids = input.players.map((x) => x.playerId);
    requirePlayers(facts, ids, true);
    if (input.players.length > game.maxPlayers) fail("too_many_players");
    assertJokersAvailable(facts, input.players, sessionId);
    freePlayers(tx, facts, ids, sessionId, input.moveFromOtherTables ?? false);
    updateSessionRow(tx, sessionId, {
      gameId: input.gameId,
      notes: input.notes === undefined ? session.notes : input.notes?.trim() || null,
    });
    replaceSessionPlayers(tx, sessionId, seatsFrom(input.players));
  });
}

export function startSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "setup");
    if (session.players.length < 2) fail("too_few_players");
    updateSessionRow(tx, sessionId, { status: "playing", startedAt: Date.now() });
  });
}

export function finishSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "playing");
    updateSessionRow(tx, sessionId, { status: "pending", finishedAt: Date.now() });
  });
}

export function resumeSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "pending");
    updateSessionRow(tx, sessionId, { status: "playing", finishedAt: null });
  });
}

export function cancelSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const session = requireSession(facts, sessionId);
    requireStatus(session, "setup", "playing", "pending");
    updateSessionRow(tx, sessionId, { status: "cancelled" });
    insertAudit(tx, {
      action: "session.cancel",
      summary: summaryOf(facts, session),
      before: session,
      after: { ...session, status: "cancelled" },
      at: Date.now(),
    });
  });
}

export function recordResult(db: Db, input: { sessionId: number; placements: PlacementEntry[] }): void {
  mutateResult(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    requireStatus(before, "playing", "pending");
    const game = requireGame(facts, before.gameId, false);
    const seated = new Map(before.players.map((x) => [x.playerId, x]));
    if (input.placements.some((x) => !seated.has(x.playerId))) fail("invalid_placements");
    if (new Set(input.placements.map((x) => x.playerId)).size !== input.placements.length) fail("invalid_placements");
    validateResult(game, input.placements);

    const after: SessionFact = {
      ...before,
      status: "done",
      finishedAt: before.finishedAt ?? Date.now(),
      players: input.placements
        .map((x) => ({ ...seated.get(x.playerId)!, placement: x.placement }))
        .sort((a, b) => a.seat - b.seat),
    };
    writeSession(tx, after);
    insertAudit(tx, { action: "result.create", summary: summaryOf(facts, after), before, after, at: Date.now() });
    announceMilestone(tx);
  });
}

export function recordDirectResult(
  db: Db,
  input: { gameId: number; tableId: number | null; placements: DirectPlacement[] },
): number {
  return mutateResult(db, (tx) => {
    const facts = loadFacts(tx);
    const game = requireGame(facts, input.gameId, false);
    if (input.tableId !== null) requireTable(facts, input.tableId, false);
    const ids = input.placements.map((x) => x.playerId);
    requirePlayers(facts, ids, false);
    validateResult(game, input.placements);
    assertJokersAvailable(facts, input.placements);
    freePlayers(tx, facts, ids, undefined, false);

    const now = Date.now();
    const players = input.placements.map((x, seat) => ({
      playerId: x.playerId,
      seat,
      jokerDeclared: x.jokerDeclared,
      placement: x.placement,
    }));
    const id = insertSession(
      tx,
      { tableId: input.tableId, gameId: input.gameId, status: "done", createdAt: now, startedAt: now, finishedAt: now },
      players,
    );
    const after: SessionFact = {
      id,
      tableId: input.tableId,
      gameId: input.gameId,
      status: "done",
      createdAt: now,
      startedAt: now,
      finishedAt: now,
      notes: null,
      isDemo: false,
      players,
    };
    insertAudit(tx, { action: "result.create", summary: summaryOf(facts, after), before: null, after, at: now });
    announceMilestone(tx);
    return id;
  });
}

export function editResult(
  db: Db,
  input: { sessionId: number; gameId: number; tableId: number | null; placements: DirectPlacement[] },
): void {
  mutateResult(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    requireStatus(before, "done");
    const game = requireGame(facts, input.gameId, false);
    if (input.tableId !== null) requireTable(facts, input.tableId, false);
    requirePlayers(
      facts,
      input.placements.map((x) => x.playerId),
      false,
    );
    validateResult(game, input.placements);
    assertJokersAvailable(facts, input.placements, before.id);

    const after: SessionFact = {
      ...before,
      gameId: input.gameId,
      tableId: input.tableId,
      players: input.placements.map((x, seat) => ({
        playerId: x.playerId,
        seat,
        jokerDeclared: x.jokerDeclared,
        placement: x.placement,
      })),
    };
    writeSession(tx, after);
    insertAudit(tx, { action: "result.update", summary: summaryOf(facts, after), before, after, at: Date.now() });
  });
}

export function deleteResult(db: Db, sessionId: number): void {
  mutateResult(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, sessionId);
    requireStatus(before, "done");
    deleteSessionRow(tx, sessionId);
    insertAudit(tx, { action: "result.delete", summary: summaryOf(facts, before), before, after: null, at: Date.now() });
  });
}

export function correctJoker(db: Db, input: { sessionId: number; playerId: number; jokerDeclared: boolean }): void {
  mutateResult(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    if (before.status === "cancelled") fail("invalid_status");
    if (!before.players.some((x) => x.playerId === input.playerId)) fail("not_found");
    assertJokersAvailable(facts, [{ playerId: input.playerId, jokerDeclared: input.jokerDeclared }], before.id);
    const after: SessionFact = {
      ...before,
      players: before.players.map((x) =>
        x.playerId === input.playerId ? { ...x, jokerDeclared: input.jokerDeclared } : x,
      ),
    };
    writeSession(tx, after);
    const name = facts.players.find((x) => x.id === input.playerId)?.name ?? "Player";
    insertAudit(tx, {
      action: "joker.correct",
      summary: `${name}: joker ${input.jokerDeclared ? "on" : "off"} · ${summaryOf(facts, after)}`,
      before,
      after,
      at: Date.now(),
    });
  });
}

function assertRestorable(facts: Facts, target: SessionFact): void {
  const others = facts.sessions.filter((s) => s.id !== target.id);
  if (!facts.games.some((g) => g.id === target.gameId)) fail("undo_conflict");
  if (target.players.some((x) => !facts.players.some((p) => p.id === x.playerId))) fail("undo_conflict");
  if (isOpenSession(target)) {
    if (target.tableId !== null && others.some((s) => s.tableId === target.tableId && isOpenSession(s))) {
      fail("undo_conflict");
    }
    const busy = target.players.some((x) =>
      others.some((s) => isOpenSession(s) && s.players.some((p) => p.playerId === x.playerId)),
    );
    if (busy) fail("undo_conflict");
  }
  const jokerTaken = target.players.some(
    (x) =>
      x.jokerDeclared &&
      others.some((s) => s.status !== "cancelled" && s.players.some((p) => p.playerId === x.playerId && p.jokerDeclared)),
  );
  if (jokerTaken) fail("undo_conflict");
}

export function undoLast(db: Db): { action: AuditAction; summary: string } {
  return mutateResult(db, (tx) => {
    const entry = lastUndoableAudit(tx) ?? fail("nothing_to_undo");
    const facts = loadFacts(tx);
    const reference = entry.before ?? entry.after ?? fail("undo_conflict");

    if (entry.before === null) {
      deleteSessionRow(tx, reference.id);
    } else {
      assertRestorable(facts, entry.before);
      writeSession(tx, entry.before);
    }

    markAuditUndone(tx, entry.id);
    insertAudit(tx, {
      action: "undo",
      summary: `Undo: ${entry.summary}`,
      before: entry.after,
      after: entry.before,
      at: Date.now(),
    });
    return { action: entry.action, summary: entry.summary };
  });
}

export function showOnScreen(db: Db, sessionId: number): void {
  mutate(
    db,
    (tx) => {
      const session = requireSession(loadFacts(tx), sessionId);
      requireStatus(session, "done");
      insertAnnouncement(tx, { type: "result_reveal", payload: { sessionId } }, Date.now());
    },
    { allowWhenFinished: true },
  );
}

export function replayLastReveal(db: Db): void {
  mutate(
    db,
    (tx) => {
      const last = loadFacts(tx)
        .sessions.filter((s) => s.status === "done" && s.finishedAt !== null)
        .sort((a, b) => b.finishedAt! - a.finishedAt! || b.id - a.id)[0];
      if (!last) fail("not_found");
      insertAnnouncement(tx, { type: "result_reveal", payload: { sessionId: last.id } }, Date.now());
    },
    { allowWhenFinished: true },
  );
}
