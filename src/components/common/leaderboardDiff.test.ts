import { expect, test } from "vitest";
import { diffStandings } from "./leaderboardDiff";

const row = (playerId: number, counted: number, rank: number | null) => ({ playerId, counted, rank });

test("first observation reports nothing", () => {
  const out = diffStandings(null, [row(1, 10, 1), row(2, 5, 2)]);
  expect(out.changed).toEqual([]);
  expect(out.newLeader).toBeNull();
  expect(out.memory.leader).toBe(1);
});

test("reports players whose counted points changed", () => {
  const first = diffStandings(null, [row(1, 10, 1), row(2, 5, 2), row(3, 0, null)]);
  const second = diffStandings(first.memory, [row(1, 10, 1), row(2, 7.5, 2), row(3, 2, 3)]);
  expect(second.changed.sort()).toEqual([2, 3]);
  expect(second.newLeader).toBeNull();
});

test("reports a new leader only when an existing leader is overtaken", () => {
  const first = diffStandings(null, [row(1, 0, null), row(2, 0, null)]);
  const firstResult = diffStandings(first.memory, [row(1, 10, 1), row(2, 5, 2)]);
  expect(firstResult.newLeader).toBeNull();
  const overtaken = diffStandings(firstResult.memory, [row(2, 12, 1), row(1, 10, 2)]);
  expect(overtaken.newLeader).toBe(2);
});
