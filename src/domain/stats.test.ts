import { describe, expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings, makeTable } from "./fixtures";
import { replay } from "./replay";
import {
  bestJoker,
  biggestComeback,
  buildFinaleStats,
  buildPublicStats,
  busiestTable,
  commonTableSize,
  distinctGames,
  fastestResult,
  heatmap,
  hotStreaks,
  longestResult,
  mostGamesPlayed,
  mostPlayedGame,
  popularity,
  rankRace,
  rivals,
} from "./stats";

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

describe("public event stats", () => {
  const H = 3_600_000;
  const T0 = 100 * H;
  const eventGames = [
    makeGame(1, 6, { family: "catan", name: "Catan" }),
    makeGame(2, 10, { family: "catan", name: "Catan + Expansion" }),
    makeGame(3, 4, { family: "uno", name: "Uno" }),
  ];
  const tables = [makeTable(1), makeTable(2), makeTable(3)];
  const rp = replay(
    {
      players,
      games: eventGames,
      sessions: [
        makeDoneSession(1, 1, T0 + 50 * MIN, [[1, 1], [2, 2], [3, 3]], { tableId: 1, startedAt: T0 + 10 * MIN }),
        makeDoneSession(2, 2, T0 + H + 30 * MIN, [[2, 1], [1, 2], [3, 3]], { tableId: 2, startedAt: T0 + 20 * MIN }),
        // direct result: no real duration, counts in the hour it was entered
        makeDoneSession(3, 3, T0 + H + 40 * MIN, [[1, 1], [4, 2]], { tableId: 2, startedAt: T0 + H + 40 * MIN }),
        makeDoneSession(4, 1, T0 + 2 * H + 15 * MIN, [[1, 1], [2, 2]], { tableId: null, startedAt: T0 + 2 * H + 5 * MIN }),
      ],
    },
    makeSettings(),
  );
  const expectedHeatmap = {
    hours: [T0, T0 + H],
    rows: [
      { tableId: 1, number: 1, cells: [1, 0] },
      { tableId: 2, number: 2, cells: [1, 2] },
    ],
    max: 2,
  };

  test("popularity by family, table size, fastest game, distinct games", () => {
    expect(distinctGames(rp.results)).toBe(3);
    expect(popularity(rp.results, eventGames)).toEqual([
      { family: "catan", gameId: 1, count: 3 },
      { family: "uno", gameId: 3, count: 1 },
    ]);
    expect(commonTableSize(rp.results)).toEqual({ size: 2, count: 2 });
    expect(fastestResult(rp.results)).toEqual({ sessionId: 4, gameId: 1, tableId: null, durationMin: 10 });
  });

  test("heatmap counts games in play per table per hour", () => {
    expect(heatmap(rp.results, tables)).toEqual(expectedHeatmap);
  });

  test("heatmap keeps the latest 12 hours", () => {
    const long = replay(
      {
        players,
        games: eventGames,
        sessions: [
          makeDoneSession(1, 3, T0 + 10 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: T0 }),
          makeDoneSession(2, 3, T0 + 20 * H + 10 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: T0 + 20 * H }),
        ],
      },
      makeSettings(),
    ).results;
    const map = heatmap(long, tables)!;
    expect(map.hours).toHaveLength(12);
    expect(map.hours[0]).toBe(T0 + 9 * H);
    expect(map.rows).toEqual([{ tableId: 1, number: 1, cells: [...Array(11).fill(0), 1] }]);
    expect(map.max).toBe(1);
  });

  test("buildPublicStats combines everything", () => {
    expect(buildPublicStats({ games: eventGames, tables }, rp)).toEqual({
      gamesCompleted: 4,
      distinctGames: 3,
      popularity: [
        { family: "catan", gameId: 1, count: 3 },
        { family: "uno", gameId: 3, count: 1 },
      ],
      tableSize: { size: 2, count: 2 },
      longest: { sessionId: 2, gameId: 2, tableId: 2, durationMin: 70 },
      fastest: { sessionId: 4, gameId: 1, tableId: null, durationMin: 10 },
      rivals: { playerIds: [1, 2], count: 3 },
      heatmap: expectedHeatmap,
    });
  });

  test("an empty evening has empty stats and no streaks", () => {
    const empty = replay({ players, games: eventGames, sessions: [] }, makeSettings());
    expect(buildPublicStats({ games: eventGames, tables }, empty)).toEqual({
      gamesCompleted: 0,
      distinctGames: 0,
      popularity: [],
      tableSize: null,
      longest: null,
      fastest: null,
      rivals: null,
      heatmap: null,
    });
    expect(hotStreaks(empty.byPlayer)).toEqual([]);
  });

  test("hot streaks count only the latest unbroken wins, longest first", () => {
    expect(hotStreaks(rp.byPlayer)).toEqual([{ playerId: 1, streak: 2 }]);
    const duels = replay(
      {
        players,
        games: eventGames,
        sessions: [
          makeDoneSession(1, 3, 1 * MIN, [[3, 1], [4, 2]]),
          makeDoneSession(2, 3, 2 * MIN, [[3, 1], [4, 2]]),
          makeDoneSession(3, 3, 3 * MIN, [[3, 1], [1, 2]]),
          makeDoneSession(4, 3, 4 * MIN, [[2, 1], [4, 2]]),
          makeDoneSession(5, 3, 5 * MIN, [[2, 1], [1, 2]]),
          makeDoneSession(6, 3, 6 * MIN, [[4, 1], [1, 2]]),
        ],
      },
      makeSettings(),
    );
    expect(hotStreaks(duels.byPlayer)).toEqual([
      { playerId: 3, streak: 3 },
      { playerId: 2, streak: 2 },
    ]);
  });
});

describe("finale stats", () => {
  const four = [1, 2, 3, 4].map((id) => makePlayer(id, `P${id}`));
  const finaleGames = [makeGame(1, 10), makeGame(2, 8)];
  // weights 10 and 8, three players, floor 0: 1st = W, 2nd = W/2, 3rd = 0
  // totals after each result: s1 P1 10, P2 5, P3 0 | s2 P2 11, P1 10, P4 8, P3 0
  // s3 P1 17.5, P2 11, P3 10, P4 8 | s4 P4 18, P1 17.5, P2 16, P3 10
  const rp = replay(
    {
      players: four,
      games: finaleGames,
      sessions: [
        makeDoneSession(1, 1, 1 * MIN, [[1, 1], [2, 2], [3, 3]]),
        makeDoneSession(2, 2, 2 * MIN, [[4, 1], [2, 2, true], [3, 3]]),
        makeDoneSession(3, 1, 3 * MIN, [[3, 1], [1, 2, true], [4, 3]]),
        makeDoneSession(4, 1, 4 * MIN, [[4, 1], [2, 2], [3, 3]]),
      ],
    },
    makeSettings(),
  );

  test("biggest single-result rise", () => {
    expect(biggestComeback(rp)).toEqual({ playerId: 4, sessionId: 4, from: 4, to: 1 });
  });

  test("best Joker is the largest bonus", () => {
    expect(bestJoker(rp.results)).toEqual({ playerId: 1, sessionId: 3, gameId: 1, bonus: 2.5 });
  });

  test("most games played", () => {
    expect(mostGamesPlayed(rp.standings)).toEqual({ playerIds: [3], count: 4 });
  });

  test("rank race follows the final top players through every result", () => {
    expect(rankRace(rp)).toEqual([
      { playerId: 4, ranks: [null, 3, 4, 1] },
      { playerId: 1, ranks: [1, 2, 1, 2] },
      { playerId: 2, ranks: [2, 1, 2, 3] },
      { playerId: 3, ranks: [3, 4, 3, 4] },
    ]);
    expect(rankRace(rp, 2).map((s) => s.playerId)).toEqual([4, 1]);
  });

  test("buildFinaleStats on an empty evening", () => {
    const empty = replay({ players: four, games: finaleGames, sessions: [] }, makeSettings());
    expect(buildFinaleStats(empty)).toEqual({ comeback: null, bestJoker: null, mostGames: null, race: [] });
    expect(buildFinaleStats(rp).race).toHaveLength(4);
  });
});
