import { afterEach, beforeEach, expect, test } from "vitest";
import { replay } from "@/domain/replay";
import { isOpenSession } from "@/domain/tables";
import { loadFacts } from "../repo/facts";
import { deleteDemoData } from "../repo/writes";
import { createTestDb } from "../testDb";
import { DEMO_NAMES, seedDemo } from "./demo";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

test("creates 22 players, 15 valid results and 2 open tables", () => {
  const summary = seedDemo(ctx.db, 1_800_000_000_000);
  expect(summary).toEqual({ players: 22, results: 15 });
  expect(DEMO_NAMES).toHaveLength(22);

  const facts = loadFacts(ctx.db);
  expect(facts.players.every((p) => p.isDemo)).toBe(true);
  const done = facts.sessions.filter((s) => s.status === "done");
  expect(done).toHaveLength(15);
  expect(facts.sessions.filter(isOpenSession).map((s) => s.status).sort()).toEqual(["playing", "setup"]);

  const rp = replay(facts, facts.event.scoring);
  expect(rp.results).toHaveLength(15);

  const jokerCounts = new Map<number, number>();
  for (const s of facts.sessions) {
    for (const p of s.players) if (p.jokerDeclared) jokerCounts.set(p.playerId, (jokerCounts.get(p.playerId) ?? 0) + 1);
  }
  expect(jokerCounts.size).toBeGreaterThan(0);
  expect([...jokerCounts.values()].every((n) => n === 1)).toBe(true);

  const hasTie = done.some((s) => new Set(s.players.map((p) => p.placement)).size < s.players.length);
  expect(hasTie).toBe(true);

  const openPlayers = facts.sessions.filter(isOpenSession).flatMap((s) => s.players.map((p) => p.playerId));
  expect(new Set(openPlayers).size).toBe(openPlayers.length);
});

test("refuses to seed twice and is fully removable", () => {
  seedDemo(ctx.db);
  expect(() => seedDemo(ctx.db)).toThrow(/already present/);
  deleteDemoData(ctx.db);
  const facts = loadFacts(ctx.db);
  expect(facts.players).toEqual([]);
  expect(facts.sessions).toEqual([]);
});
