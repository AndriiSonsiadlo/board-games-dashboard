import { expect, test } from "vitest";
import { makeGame } from "@/domain/fixtures";
import type { AdminPlayerView, AdminSeatView, TableView } from "@/domain/snapshot";
import { busyPlayers, matchesQuery, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";

const player = (id: number, name: string, active = true): AdminPlayerView => ({
  id,
  name,
  nickname: null,
  color: "#fff",
  source: "admin",
  active,
  isDemo: false,
  jokerUsed: false,
  createdAt: 0,
});

const table = (tableId: number, sessionId: number, status: "setup" | "playing", playerIds: number[]): TableView<AdminSeatView> => ({
  tableId,
  number: tableId,
  label: null,
  state: status === "setup" ? "preparing" : "playing",
  session: {
    id: sessionId,
    gameId: 1,
    status,
    startedAt: null,
    finishedAt: null,
    notes: null,
    players: playerIds.map((playerId, seat) => ({ playerId, seat, jokerDeclared: false })),
  },
});

test("orderGamesByRecency puts recently played active games first", () => {
  const games = [makeGame(1, 4), makeGame(2, 6), makeGame(3, 10), makeGame(4, 15, { active: false })];
  const ordered = orderGamesByRecency(games, [{ gameId: 3 }, { gameId: 1 }, { gameId: 3 }]);
  expect(ordered.map((g) => g.id)).toEqual([3, 1, 2]);
});

test("busyPlayers maps players at open tables, excluding one session", () => {
  const busy = busyPlayers([table(1, 10, "setup", [1, 2]), table(2, 11, "playing", [3])], 10);
  expect([...busy.entries()]).toEqual([[3, { tableNumber: 2, status: "playing" }]]);
});

test("playerRecency uses index of newest result", () => {
  const recency = playerRecency([
    { placements: [{ playerId: 5 }, { playerId: 6 }] },
    { placements: [{ playerId: 6 }, { playerId: 7 }] },
  ]);
  expect([...recency.entries()]).toEqual([
    [5, 0],
    [6, 0],
    [7, 1],
  ]);
});

test("matchesQuery ignores case and diacritics", () => {
  expect(matchesQuery("Łukasz", "luk")).toBe(true);
  expect(matchesQuery("Max", "")).toBe(true);
  expect(matchesQuery("Max", "and")).toBe(false);
});

test("sortCandidates: active + matching, free before busy, recent first, then name", () => {
  const players = [player(1, "Zoe"), player(2, "Amy"), player(3, "Bob"), player(4, "Cat", false), player(5, "Dan")];
  const busy = new Map([[5, { tableNumber: 1, status: "playing" as const }]]);
  const recency = new Map([[1, 0]]);
  expect(sortCandidates(players, recency, busy, "").map((p) => p.id)).toEqual([1, 2, 3, 5]);
  expect(sortCandidates(players, recency, busy, "a").map((p) => p.id)).toEqual([2, 5]);
});
