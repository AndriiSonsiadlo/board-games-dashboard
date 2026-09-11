import { describe, expect, test } from "vitest";
import { FORBIDDEN_PUBLIC_KEYS, keysDeep, makeDoneSession, makeEvent, makeGame, makePlayer, makeSettings } from "./fixtures";
import { buildProfile } from "./profile";
import { replay } from "./replay";
import type { EventFact, Facts } from "./types";

const MIN = 60_000;

function facts(event: Partial<EventFact> = {}): Facts {
  return {
    event: makeEvent({ scoring: makeSettings({ strategy: "bestN", bestN: 2 }), ...event }),
    players: [makePlayer(1, "Amy"), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Old", { active: false })],
    games: [makeGame(1, 10), makeGame(2, 6)],
    tables: [],
    sessions: [
      makeDoneSession(1, 1, 10 * MIN, [[1, 1, true], [2, 2]], { tableId: 1 }),
      makeDoneSession(2, 2, 20 * MIN, [[2, 1], [1, 2]], { tableId: 2 }),
      makeDoneSession(3, 1, 30 * MIN, [[1, 1], [3, 2]], { tableId: 2 }),
    ],
    announcements: [],
    disabledAchievements: [],
  };
}

const profileOf = (f: Facts, id: number, audience: "public" | "admin" = "public") =>
  buildProfile(f, replay(f, f.event.scoring), id, audience);

describe("public profile before the finale", () => {
  test("room facts only, no standings keys, no sealed achievements", () => {
    const p = profileOf(facts(), 1)!;
    expect(p.revealed).toBe(false);
    expect(p.player).toEqual({ id: 1, name: "Amy", nickname: null, color: "#8b8b90" });
    expect(p.results.map((r) => [r.sessionId, r.placement, r.playerCount])).toEqual([
      [3, 1, 2],
      [2, 2, 2],
      [1, 1, 2],
    ]);
    expect(p.favoriteGameId).toBe(1);
    expect(p.tablesPlayed).toBe(2);
    expect(p.standing).toBeNull();
    expect(p.achievements.some((a) => a.sealed)).toBe(false);
    expect(p.achievements.find((a) => a.id === "opening-move")?.unlockedAt).toBe(10 * MIN);
    expect(p.achievements.find((a) => a.id === "all-rounder")).toEqual({
      id: "all-rounder",
      sealed: false,
      unlockedAt: null,
      progress: { current: 2, target: 5 },
    });
    expect(keysDeep(p).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
  });

  test("unknown players and inactive players without results have no public profile", () => {
    expect(profileOf(facts(), 99)).toBeNull();
    expect(profileOf(facts(), 4)).toBeNull();
    expect(profileOf(facts(), 4, "admin")).not.toBeNull();
  });

  test("disabled achievements are not listed", () => {
    const f = { ...facts(), disabledAchievements: ["marathon"] };
    expect(profileOf(f, 1)!.achievements.some((a) => a.id === "marathon")).toBe(false);
  });
});

describe("revealed profile", () => {
  test("admin sees standing, points, excluded results and sealed achievements", () => {
    const p = profileOf(facts(), 1, "admin")!;
    expect(p.revealed).toBe(true);
    expect(p.standing).toMatchObject({ rank: 1, wins: 2, podiums: 3, gamesPlayed: 3 });
    expect(p.standing!.winRate).toBeCloseTo(2 / 3);
    expect(p.standing!.excludedSessionIds).toEqual([2]);
    expect(p.results.find((r) => r.sessionId === 2)).toMatchObject({ counted: false });
    expect(p.results.find((r) => r.sessionId === 1)?.points).toBeGreaterThan(10);
    expect(p.standing!.strongestGameId).toBe(1);
    expect(p.standing!.weakestGameId).toBe(2);
    expect(p.standing!.rankHistory.map((h) => h.finishedAt)).toEqual([10 * MIN, 20 * MIN, 30 * MIN]);
    expect(p.achievements.find((a) => a.id === "joker-master")?.unlockedAt).toBe(10 * MIN);
  });

  test("public after finaleRevealed equals admin view", () => {
    const f = facts({ status: "finished", finaleRevealed: true });
    expect(profileOf(f, 1)).toEqual(profileOf(f, 1, "admin"));
  });

  test("strongest/weakest need two different games", () => {
    expect(profileOf(facts(), 3, "admin")!.standing).toMatchObject({ strongestGameId: null, weakestGameId: null });
  });
});
