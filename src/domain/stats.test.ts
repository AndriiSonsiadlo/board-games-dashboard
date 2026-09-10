import { expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import { busiestTable, longestResult, mostPlayedGame, rivals } from "./stats";

const players = [1, 2, 3, 4].map((id) => makePlayer(id, `P${id}`));
const games = [makeGame(1, 6), makeGame(2, 10)];
const MIN = 60_000;

function results(sessions: Parameters<typeof makeDoneSession>[]) {
  return replay({ players, games, sessions: sessions.map((args) => makeDoneSession(...args)) }, makeSettings()).results;
}

test("empty event has no stats", () => {
  const none = results([]);
  expect(mostPlayedGame(none)).toBeNull();
  expect(longestResult(none)).toBeNull();
  expect(busiestTable(none)).toBeNull();
  expect(rivals(none)).toBeNull();
});

test("most played game, busiest table, longest game and rivals", () => {
  const rs = results([
    [1, 1, 60 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: 50 * MIN }],
    [2, 2, 90 * MIN, [[1, 1], [2, 2], [3, 3]], { tableId: 2, startedAt: 10 * MIN }],
    [3, 2, 120 * MIN, [[2, 1], [1, 2]], { tableId: 2, startedAt: 100 * MIN }],
    [4, 1, 130 * MIN, [[3, 1], [4, 2]], { tableId: null, startedAt: 130 * MIN }],
  ]);
  expect(mostPlayedGame(rs)).toEqual({ gameId: 1, count: 2 });
  expect(busiestTable(rs)).toEqual({ tableId: 2, count: 2 });
  expect(longestResult(rs)).toEqual({ sessionId: 2, gameId: 2, tableId: 2, durationMin: 80 });
  expect(rivals(rs)).toEqual({ playerIds: [1, 2], count: 3 });
});

test("rivals need at least two shared games", () => {
  expect(rivals(results([[1, 1, MIN, [[1, 1], [2, 2]]]]))).toBeNull();
});
