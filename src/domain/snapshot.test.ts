import { describe, expect, test } from "vitest";
import {
  makeDoneSession,
  makeEvent,
  makeGame,
  makeOpenSession,
  makePlayer,
  makeTable,
} from "./fixtures";
import { replay } from "./replay";
import { buildAdminSnapshot, buildPublicSnapshot } from "./snapshot";
import type { AnnouncementFact, EventFact, Facts } from "./types";

const FORBIDDEN = [
  "points",
  "base",
  "rank",
  "counted",
  "raw",
  "jokerDeclared",
  "jokerUsed",
  "gamesPlayed",
  "wins",
  "podiums",
  "trend",
  "countedSessionIds",
  "excludedSessionIds",
];

function keysDeep(value: unknown, path = "$"): Array<[string, string]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysDeep(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      [k, `${path}.${k}`] as [string, string],
      ...keysDeep(v, `${path}.${k}`),
    ]);
  }
  return [];
}

const NOW = 10_000_000;

function facts(event: Partial<EventFact> = {}, announcements: AnnouncementFact[] = []): Facts {
  return {
    event: makeEvent(event),
    players: [
      makePlayer(1, "Amy"),
      makePlayer(2, "Bob"),
      makePlayer(3, "Cat"),
      makePlayer(4, "Dan"),
      makePlayer(5, "Eve"),
      makePlayer(6, "Old", { active: false }),
    ],
    games: [makeGame(1, 6), makeGame(2, 10, { allowTies: true })],
    tables: [makeTable(1), makeTable(2), makeTable(3), makeTable(4, 4, { active: false })],
    sessions: [
      makeDoneSession(10, 1, NOW - 600_000, [
        [1, 1, true],
        [2, 2],
        [3, 3],
      ]),
      makeDoneSession(11, 2, NOW - 300_000, [
        [3, 1],
        [2, 2],
      ]),
      makeOpenSession(12, 1, 1, "playing", [[4, true], [5]]),
      makeOpenSession(13, 2, 2, "setup", [[1], [2]]),
    ],
    announcements,
  };
}

function build(f: Facts) {
  const rp = replay(f, f.event.scoring);
  return { pub: buildPublicSnapshot(f, rp, NOW), admin: buildAdminSnapshot(f, rp, NOW) };
}

const reveal = (id: number, sessionId: number, createdAt = NOW - 10_000): AnnouncementFact => ({
  id,
  type: "result_reveal",
  payload: { sessionId },
  createdAt,
});

describe("public snapshot before finale", () => {
  test("contains no standings, points or joker fields anywhere", () => {
    const { pub } = build(facts({}, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN.includes(key));
    expect(leaks).toEqual([]);
    expect(pub.leaderboard).toBeNull();
    expect(pub.contenders).toBeNull();
    expect(pub.audience).toBe("public");
  });

  test("shows room facts: tables, recent placements, counters", () => {
    const { pub } = build(facts());
    expect(pub.tables.map((t) => [t.number, t.state])).toEqual([
      [1, "playing"],
      [2, "preparing"],
      [3, "available"],
    ]);
    expect(pub.tables[0].session?.players).toEqual([
      { playerId: 4, seat: 0 },
      { playerId: 5, seat: 1 },
    ]);
    expect(pub.recentResults.map((r) => r.sessionId)).toEqual([11, 10]);
    expect(pub.recentResults[1].placements).toEqual([
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
      { playerId: 3, placement: 3 },
    ]);
    expect(pub.counters).toEqual({ gamesCompleted: 2, tablesActive: 2, players: 5 });
    expect(pub.players.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test("reveal points appear only inside announcements when enabled", () => {
    const { pub } = build(facts({ showPointsInReveals: true }, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN.includes(key));
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.every(([, path]) => path.startsWith("$.announcements"))).toBe(true);
    expect(leaks.every(([key]) => key === "points")).toBe(true);
  });

  test("contenders lists top 5 alphabetically when the scene is enabled", () => {
    const { pub } = build(facts({ enabledScenes: ["title", "contenders"] }));
    // ranked players: Cat, Amy, Bob (Dan, Eve have no results)
    expect(pub.contenders).toEqual([1, 2, 3]);
  });
});

describe("announcements", () => {
  test("keeps only the last 120 s, in id order, and drops missing results", () => {
    const { pub } = build(
      facts({}, [
        reveal(3, 11),
        reveal(1, 10, NOW - 200_000),
        reveal(2, 999),
        { id: 4, type: "milestone", payload: { count: 10 }, createdAt: NOW - 1000 },
      ]),
    );
    expect(pub.announcements.map((a) => [a.id, a.type])).toEqual([
      [3, "result_reveal"],
      [4, "milestone"],
    ]);
  });
});

describe("public snapshot after finale reveal", () => {
  test("includes leaderboard and result points", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.leaderboard?.[0]).toMatchObject({ playerId: 3, rank: 1 });
    expect(pub.recentResults[0].placements[0]).toHaveProperty("points");
  });
});

describe("admin snapshot", () => {
  test("has full leaderboard, jokers, scoring settings and results newest first", () => {
    const { admin } = build(facts());
    expect(admin.audience).toBe("admin");
    expect(admin.leaderboard.slice(0, 3).map((r) => [r.playerId, r.rank])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(admin.leaderboard.find((r) => r.playerId === 1)?.jokerUsed).toBe(true);
    expect(admin.leaderboard.find((r) => r.playerId === 4)?.jokerUsed).toBe(true);
    expect(admin.tables[0].session?.players[0]).toEqual({ playerId: 4, seat: 0, jokerDeclared: true });
    expect(admin.results.map((r) => r.sessionId)).toEqual([11, 10]);
    expect(admin.results[1].placements[0]).toMatchObject({ playerId: 1, jokerDeclared: true });
    expect(admin.event.scoring.bestN).toBe(4);
    expect(admin.players.find((p) => p.id === 6)).toMatchObject({ active: false, jokerUsed: false });
    expect(admin.allTables.map((t) => t.number)).toEqual([1, 2, 3, 4]);
  });
});
