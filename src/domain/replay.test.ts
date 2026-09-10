import { describe, expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { durationMinutes, replay } from "./replay";
import type { SessionFact } from "./types";

const players = [makePlayer(1, "Amy"), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Dan")];
const games = [makeGame(1, 6), makeGame(2, 10)];
const r1 = makeDoneSession(1, 1, 1000, [
  [1, 1],
  [2, 2],
  [3, 3],
]);
const r2 = makeDoneSession(2, 2, 2000, [
  [3, 1],
  [2, 2],
]);

const ranks = (rows: { playerId: number; rank: number | null }[]) =>
  rows.map((r) => [r.playerId, r.rank]);

describe("replay", () => {
  test("computes final standings in chronological order regardless of input order", () => {
    const result = replay({ players, games, sessions: [r2, r1] }, makeSettings());
    expect(ranks(result.standings)).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
      [4, null],
    ]);
    expect(result.results.map((r) => r.sessionId)).toEqual([1, 2]);
    const cat = result.standings.find((r) => r.playerId === 3)!;
    expect(cat.counted).toBeCloseTo(10);
    expect(cat.wins).toBe(1);
    expect(cat.podiums).toBe(2);
    expect(cat.gamesPlayed).toBe(2);
  });

  test("records before/after standings per step and rank history", () => {
    const result = replay({ players, games, sessions: [r1, r2] }, makeSettings());
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].before.every((r) => r.rank === null)).toBe(true);
    expect(ranks(result.steps[1].before).slice(0, 3)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(result.rankHistory.get(3)).toEqual([
      { sessionId: 1, finishedAt: 1000, rank: 3, counted: 0 },
      { sessionId: 2, finishedAt: 2000, rank: 1, counted: 10 },
    ]);
    expect(result.rankHistory.get(4)).toEqual([]);
  });

  test("trend compares rank before the player's latest result to current rank", () => {
    const result = replay({ players, games, sessions: [r1, r2] }, makeSettings());
    expect(result.trends.get(1)).toBeNull();
    expect(result.trends.get(2)).toBe(-1);
    expect(result.trends.get(3)).toBe(2);
    expect(result.trends.get(4)).toBeNull();
  });

  test("editing a placement changes standings", () => {
    const edited = makeDoneSession(2, 2, 2000, [
      [2, 1],
      [3, 2],
    ]);
    const result = replay({ players, games, sessions: [r1, edited] }, makeSettings());
    expect(ranks(result.standings).slice(0, 3)).toEqual([
      [2, 1],
      [1, 2],
      [3, 3],
    ]);
  });

  test("deleting a result removes its points", () => {
    const result = replay({ players, games, sessions: [r1] }, makeSettings());
    expect(ranks(result.standings).slice(0, 3)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  test("ignores sessions that are not done", () => {
    const playing: SessionFact = { ...r2, status: "playing", finishedAt: null };
    const result = replay({ players, games, sessions: [r1, playing] }, makeSettings());
    expect(result.results).toHaveLength(1);
  });

  test("applies bestN and joker from settings", () => {
    const r3 = makeDoneSession(3, 1, 3000, [
      [1, 2, true],
      [2, 1],
    ]);
    const result = replay(
      { players, games, sessions: [r1, r2, r3] },
      makeSettings({ strategy: "bestN", bestN: 1, participationFloor: 0.2 }),
    );
    const amy = result.standings.find((r) => r.playerId === 1)!;
    // Amy: R1 6.0, R3 = 6 * 0.2 * 1.5 = 1.8; best 1 counts 6.0
    expect(amy.raw).toBeCloseTo(7.8);
    expect(amy.counted).toBeCloseTo(6);
    expect(amy.countedSessionIds).toEqual([1]);
    expect(amy.excludedSessionIds).toEqual([3]);
    const amyR3 = result.byPlayer.get(1)!.find((r) => r.sessionId === 3)!;
    expect(amyR3.jokerDeclared).toBe(true);
    expect(amyR3.points).toBeCloseTo(1.8);
    expect(amyR3.playerCount).toBe(2);
  });

  test("uses current game weight", () => {
    const heavier = [makeGame(1, 12), makeGame(2, 10)];
    const result = replay({ players, games: heavier, sessions: [r1] }, makeSettings());
    expect(result.standings[0].counted).toBeCloseTo(12);
  });

  test("inactive players without results are excluded, inactive with results stay", () => {
    const roster = [makePlayer(1, "Amy", { active: false }), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Dan", { active: false })];
    const result = replay({ players: roster, games, sessions: [r1] }, makeSettings());
    expect(result.standings.map((r) => r.playerId).sort()).toEqual([1, 2, 3]);
  });

  test("player results carry family, duration, opponents and last-place flag", () => {
    const tied = makeDoneSession(3, 2, 3000, [
      [1, 1],
      [2, 2],
      [4, 2],
    ], { tableId: null, startedAt: 3000 });
    const result = replay({ players, games, sessions: [r1, tied] }, makeSettings());
    const amyR1 = result.byPlayer.get(1)!.find((r) => r.sessionId === 1)!;
    expect(amyR1.family).toBe("game-1");
    expect(amyR1.durationMin).toBe(30);
    expect(amyR1.opponents).toEqual([2, 3]);
    expect(amyR1.last).toBe(false);
    expect(result.byPlayer.get(3)!.find((r) => r.sessionId === 1)!.last).toBe(true);
    const danTied = result.byPlayer.get(4)!.find((r) => r.sessionId === 3)!;
    expect(danTied.last).toBe(true);
    expect(danTied.durationMin).toBeNull();
    expect(danTied.tableId).toBeNull();
    expect(result.unlocks.length).toBeGreaterThan(0);
  });
});

describe("replay containment", () => {
  test("skips a session with a malformed stored result instead of throwing", () => {
    // Placements [1, 3] have a gap (no place 2) and are invalid for a 2-player
    // result; scoreResult throws RangeError("Invalid result: invalid_placements").
    // A single corrupted row like this (bad manual edit, prior bug, etc.) must
    // not take down every consumer of replay().
    const corrupt = makeDoneSession(5, 1, 3000, [
      [3, 1],
      [4, 3],
    ]);
    const result = replay({ players, games, sessions: [r1, corrupt] }, makeSettings());
    expect(result.results.map((r) => r.sessionId)).toEqual([1]);
    expect(ranks(result.standings).slice(0, 3)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("durationMinutes", () => {
  test("rounds elapsed minutes", () => {
    expect(durationMinutes(makeDoneSession(9, 1, 60 * 60_000, [[1, 1], [2, 2]], { startedAt: 0 }))).toBe(60);
  });
  test("null when start equals finish (direct result) or missing", () => {
    expect(durationMinutes(makeDoneSession(9, 1, 5000, [[1, 1], [2, 2]], { startedAt: 5000 }))).toBeNull();
    expect(durationMinutes(makeDoneSession(9, 1, 5000, [[1, 1], [2, 2]], { startedAt: null }))).toBeNull();
  });
});
