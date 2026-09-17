import { describe, expect, test } from "vitest";
import { priorFieldRise, rankStandings, selectCounted, type PlayerTotals, type StandingRow } from "./standings";

function totals(playerId: number, name: string, t: Partial<PlayerTotals>): PlayerTotals {
  return {
    playerId,
    name,
    raw: 0,
    counted: 0,
    wins: 0,
    podiums: 0,
    gamesPlayed: 0,
    countedSessionIds: [],
    excludedSessionIds: [],
    ...t,
  };
}

describe("selectCounted", () => {
  const results = [
    { sessionId: 1, points: 5, finishedAt: 100 },
    { sessionId: 2, points: 9, finishedAt: 200 },
    { sessionId: 3, points: 1, finishedAt: 300 },
    { sessionId: 4, points: 5, finishedAt: 400 },
  ];

  test("total counts everything", () => {
    expect(selectCounted(results, "total", 2)).toEqual({
      counted: 20,
      countedIds: [1, 2, 3, 4],
      excludedIds: [],
    });
  });

  test("bestN keeps the N highest, earlier result wins equal points", () => {
    expect(selectCounted(results, "bestN", 2)).toEqual({
      counted: 14,
      countedIds: [1, 2],
      excludedIds: [3, 4],
    });
  });

  test("bestN larger than result count counts all", () => {
    expect(selectCounted(results, "bestN", 10).excludedIds).toEqual([]);
    expect(selectCounted(results, "bestN", 10).counted).toBe(20);
  });

  test("ids are returned in chronological order", () => {
    expect(selectCounted(results, "bestN", 3).countedIds).toEqual([1, 2, 4]);
  });
});

describe("rankStandings", () => {
  test("orders by counted, wins, raw, fewer games, name; unplayed last and unranked", () => {
    const rows = rankStandings([
      totals(1, "Zed", { counted: 10, wins: 1, raw: 10, gamesPlayed: 2 }),
      totals(2, "Amy", { counted: 10, wins: 2, raw: 10, gamesPlayed: 2 }),
      totals(3, "Bob", { counted: 10, wins: 1, raw: 12, gamesPlayed: 3 }),
      totals(4, "Cat", { counted: 10, wins: 1, raw: 10, gamesPlayed: 1 }),
      totals(5, "Dan", {}),
      totals(6, "Abe", {}),
      totals(7, "Eve", { counted: 12, gamesPlayed: 4 }),
    ]);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([
      [7, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [1, 5],
      [6, null],
      [5, null],
    ]);
  });

  test("treats floating noise as equal points", () => {
    const rows = rankStandings([
      totals(1, "B", { counted: 4.4 + 2.8, gamesPlayed: 2 }),
      totals(2, "A", { counted: 7.2, gamesPlayed: 2 }),
    ]);
    expect(rows.map((r) => r.playerId)).toEqual([2, 1]);
  });

  test("does not leak name into rows", () => {
    const [row] = rankStandings([totals(1, "A", { gamesPlayed: 1 })]);
    expect(row).not.toHaveProperty("name");
  });
});

describe("priorFieldRise", () => {
  const row = (playerId: number, rank: number | null): StandingRow => ({
    playerId,
    rank,
    raw: 0,
    counted: 0,
    wins: 0,
    podiums: 0,
    gamesPlayed: rank === null ? 0 : 1,
    countedSessionIds: [],
    excludedSessionIds: [],
  });

  test("ranks only among players ranked before the result; newcomers count on neither side", () => {
    const before = [row(1, 1), row(2, 2), row(3, 3), row(4, null), row(5, null)];
    const after = [row(4, 1), row(5, 2), row(3, 3), row(1, 4), row(2, 5)];
    expect(priorFieldRise(before, after, 3)).toEqual({ from: 3, to: 1, field: 3 });
    expect(priorFieldRise(before, after, 1)).toEqual({ from: 1, to: 2, field: 3 });
    expect(priorFieldRise(before, after, 4)).toBeNull();
  });
});
