import { afterEach, beforeEach, expect, test } from "vitest";
import { getAdminSnapshot, getLiveState, getPublicSnapshot } from "./live";
import { addPlayer } from "./services/players";
import { createTestDb } from "./testDb";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

test("replay is cached per data version", () => {
  const first = getLiveState(ctx.db);
  expect(getLiveState(ctx.db)).toBe(first);
  addPlayer(ctx.db, { name: "Amy" });
  const second = getLiveState(ctx.db);
  expect(second).not.toBe(first);
  expect(second.facts.players).toHaveLength(1);
});

test("snapshots carry audience and version", () => {
  addPlayer(ctx.db, { name: "Amy" });
  const pub = getPublicSnapshot(ctx.db);
  const admin = getAdminSnapshot(ctx.db);
  expect(pub.audience).toBe("public");
  expect(admin.audience).toBe("admin");
  expect(pub.version).toBe(admin.version);
  expect(pub.leaderboard).toBeNull();
});
