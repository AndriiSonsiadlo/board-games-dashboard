import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestDb } from "../testDb";
import { seedBase } from "../seed/base";
import { getDataVersion, loadFacts, loadSession } from "./facts";
import {
  bumpVersion,
  deleteDemoData,
  insertAnnouncement,
  insertAudit,
  insertPlayer,
  insertSession,
  lastUndoableAudit,
  markAuditUndone,
  milestoneExists,
  writeSession,
} from "./writes";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

describe("base seed", () => {
  test("creates event, tables and games; is idempotent", () => {
    seedBase(ctx.db, { adminPin: "9999", tableCount: 10 });
    const facts = loadFacts(ctx.db);
    expect(facts.event.status).toBe("draft");
    expect(facts.event.scoring).toEqual({
      strategy: "bestN",
      bestN: 4,
      participationFloor: 0.2,
      jokerMultiplier: 1.5,
    });
    expect(facts.event.enabledScenes).toEqual(["title", "room", "recent", "counters"]);
    expect(facts.tables).toHaveLength(3);
    expect(facts.games).toHaveLength(9);
    expect(facts.games[0].slug).toBe("uno");
    expect(facts.games.find((g) => g.slug === "hitster")?.allowTies).toBe(true);
  });
});

describe("sessions round trip", () => {
  test("insert, load, upsert with seats", () => {
    const now = Date.now();
    const a = insertPlayer(ctx.db, { name: "Amy", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const b = insertPlayer(ctx.db, { name: "Bob", nickname: "B", color: "#fff", source: "checkin", createdAt: now });
    const id = insertSession(
      ctx.db,
      { tableId: 1, gameId: 1, status: "setup", createdAt: now, isDemo: false },
      [
        { playerId: b, seat: 1, jokerDeclared: false, placement: null },
        { playerId: a, seat: 0, jokerDeclared: true, placement: null },
      ],
    );
    const loaded = loadSession(ctx.db, id)!;
    expect(loaded.players.map((p) => p.playerId)).toEqual([a, b]);
    expect(loaded.players[0].jokerDeclared).toBe(true);

    writeSession(ctx.db, {
      ...loaded,
      status: "done",
      finishedAt: now + 1,
      players: loaded.players.map((p, i) => ({ ...p, placement: i + 1 })),
    });
    const facts = loadFacts(ctx.db);
    expect(facts.sessions[0].status).toBe("done");
    expect(facts.sessions[0].players.map((p) => p.placement)).toEqual([1, 2]);
  });
});

describe("version, announcements, audit, demo cleanup", () => {
  test("bumpVersion increments", () => {
    const v = getDataVersion(ctx.db);
    bumpVersion(ctx.db);
    expect(getDataVersion(ctx.db)).toBe(v + 1);
  });

  test("milestones and announcements load", () => {
    insertAnnouncement(ctx.db, { type: "milestone", payload: { count: 10 } }, 5);
    insertAnnouncement(ctx.db, { type: "result_reveal", payload: { sessionId: 3 } }, 6);
    expect(milestoneExists(ctx.db, 10)).toBe(true);
    expect(milestoneExists(ctx.db, 25)).toBe(false);
    expect(loadFacts(ctx.db).announcements.map((a) => a.type)).toEqual(["result_reveal", "milestone"]);
  });

  test("lastUndoableAudit skips undone and non-undoable entries", () => {
    const first = insertAudit(ctx.db, { action: "result.create", summary: "a", before: null, after: null, at: 1 });
    insertAudit(ctx.db, { action: "player.merge", summary: "b", before: null, after: null, at: 2 });
    const third = insertAudit(ctx.db, { action: "result.delete", summary: "c", before: null, after: null, at: 3 });
    expect(lastUndoableAudit(ctx.db)?.id).toBe(third);
    markAuditUndone(ctx.db, third);
    expect(lastUndoableAudit(ctx.db)?.id).toBe(first);
  });

  test("deleteDemoData removes demo players and sessions only", () => {
    const now = Date.now();
    const real = insertPlayer(ctx.db, { name: "Real", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const demo = insertPlayer(ctx.db, { name: "Demo", nickname: null, color: "#fff", source: "admin", isDemo: true, createdAt: now });
    insertSession(ctx.db, { gameId: 1, status: "done", createdAt: now, isDemo: true }, [
      { playerId: demo, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: real, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    insertSession(ctx.db, { gameId: 1, status: "setup", createdAt: now, isDemo: false }, [
      { playerId: demo, seat: 0, jokerDeclared: false, placement: null },
      { playerId: real, seat: 1, jokerDeclared: false, placement: null },
    ]);
    deleteDemoData(ctx.db);
    const facts = loadFacts(ctx.db);
    expect(facts.players.map((p) => p.name)).toEqual(["Real"]);
    expect(facts.sessions).toHaveLength(1);
    expect(facts.sessions[0].players.map((p) => p.playerId)).toEqual([real]);
  });
});
