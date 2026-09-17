import { expect, test } from "vitest";
import { makeDoneSession, makeGame, makeOpenSession, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import { buildTimeline } from "./timeline";

const MIN = 60_000;
const players = [1, 2, 3].map((id) => makePlayer(id, `P${id}`));
const games = [makeGame(1, 10)];
const sessions = [
  ...Array.from({ length: 10 }, (_, i) =>
    makeDoneSession(
      i + 1,
      1,
      (i + 1) * 100 * MIN,
      [[1, 1, i === 1], [2, 2]],
      // session 1 is a direct result: no real start
      i === 0 ? { startedAt: 100 * MIN } : {},
    ),
  ),
  makeOpenSession(20, 2, 1, "playing", [[3]], 1050 * MIN),
  makeOpenSession(21, 3, 1, "setup", [[3]]),
];
const facts = { sessions, sealedOverrides: {} };
const rp = replay({ players, games, sessions }, makeSettings());

test("newest first with started, result, unlock and milestone items", () => {
  const items = buildTimeline(facts, rp);
  expect(items[0]).toEqual({ kind: "started", at: 1050 * MIN, sessionId: 20, gameId: 1, tableId: 2, playerIds: [3] });
  const started = items.flatMap((i) => (i.kind === "started" ? [i.sessionId] : []));
  expect(started).toEqual([20, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  expect(items.filter((i) => i.kind === "result")).toHaveLength(10);
  expect(items.find((i) => i.kind === "result" && i.sessionId === 1)).toEqual({
    kind: "result",
    at: 100 * MIN,
    sessionId: 1,
    gameId: 1,
    tableId: 1,
    winnerIds: [1],
    playerCount: 2,
  });
  expect(items.filter((i) => i.kind === "milestone")).toEqual([{ kind: "milestone", at: 1000 * MIN, count: 10 }]);
  const atTen = items.filter((i) => i.at === 1000 * MIN).map((i) => i.kind);
  expect(atTen[0]).toBe("milestone");
  expect(atTen.at(-1)).toBe("result");
  expect(items.some((i) => i.kind === "unlock" && i.achievementId === "opening-move")).toBe(true);
});

test("sealed unlocks are part of the timeline", () => {
  expect(buildTimeline(facts, rp).some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(true);
});

test("limit keeps the newest items", () => {
  const items = buildTimeline(facts, rp, { limit: 3 });
  expect(items).toHaveLength(3);
  expect(items[0].kind).toBe("started");
});
