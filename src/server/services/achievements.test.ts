import { afterEach, beforeEach, expect, test } from "vitest";
import { replay } from "@/domain/replay";
import { loadFacts } from "../repo/facts";
import { seedDemo } from "../seed/demo";
import { createTestDb } from "../testDb";
import { setAchievementEnabled } from "./achievements";
import { ServiceError } from "./errors";
import { finishEvent, goLive } from "./event";
import { addPlayer } from "./players";
import { deleteResult, editResult, recordDirectResult, undoLast } from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
let ids: number[];
let catan: number;

beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  ids = ["Amy", "Bob", "Cat"].map((name) => addPlayer(ctx.db, { name }));
  catan = loadFacts(ctx.db).games.find((g) => g.slug === "catan")!.id;
});
afterEach(() => ctx.cleanup());

const achievementAnnouncements = () =>
  loadFacts(ctx.db)
    .announcements.filter((a) => a.type === "achievement")
    .map((a) => (a.type === "achievement" ? `${a.payload.achievementId}:${a.payload.playerId}` : ""))
    .sort();

const placements = (order: number[], jokerFor?: number) =>
  order.map((playerId, i) => ({ playerId, placement: i + 1, jokerDeclared: playerId === jokerFor }));

test("a new result queues public unlocks only, with its session id", () => {
  const sessionId = recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids, ids[0]) });
  expect(achievementAnnouncements()).toEqual([`catan-lord:${ids[0]}`, `opening-move:${ids[0]}`]);
  const first = loadFacts(ctx.db).announcements.find((a) => a.type === "achievement");
  expect(first?.type === "achievement" && first.payload.sessionId).toBe(sessionId);
});

test("corrections announce only unlocks that are new", () => {
  const sessionId = recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids) });
  editResult(ctx.db, { sessionId, gameId: catan, tableId: null, placements: placements([ids[1], ids[0], ids[2]]) });
  expect(achievementAnnouncements()).toEqual([
    `catan-lord:${ids[0]}`,
    `catan-lord:${ids[1]}`,
    `opening-move:${ids[0]}`,
    `opening-move:${ids[1]}`,
  ]);
  deleteResult(ctx.db, sessionId);
  undoLast(ctx.db);
  expect(achievementAnnouncements()).toHaveLength(6);
});

test("disabled achievements are not announced; toggling is allowed after finish", () => {
  setAchievementEnabled(ctx.db, { achievementId: "catan-lord", enabled: false });
  recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids) });
  expect(achievementAnnouncements()).toEqual([`opening-move:${ids[0]}`]);
  finishEvent(ctx.db);
  setAchievementEnabled(ctx.db, { achievementId: "catan-lord", enabled: true });
  expect(loadFacts(ctx.db).disabledAchievements).toEqual([]);
});

test("unknown achievement ids are rejected", () => {
  expect(() => setAchievementEnabled(ctx.db, { achievementId: "nope", enabled: false })).toThrow(ServiceError);
});

test("demo data unlocks several achievements", () => {
  const demo = createTestDb();
  try {
    seedDemo(demo.db);
    const facts = loadFacts(demo.db);
    expect(replay(facts, facts.event.scoring).unlocks.length).toBeGreaterThanOrEqual(5);
  } finally {
    demo.cleanup();
  }
});
