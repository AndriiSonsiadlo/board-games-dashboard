import { describe, expect, test } from "vitest";
import { achievementDef } from "./achievements";
import {
  FORBIDDEN_PUBLIC_KEYS,
  keysDeep,
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
    disabledAchievements: [],
    sealedOverrides: {},
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

test("public snapshot carries the resolved brand; only admin sees the raw fields", () => {
  const f = facts({ brandFields: { brandTopEn: null, brandMainEn: null, brandTopRu: "HIS^", brandMainRu: "ВЕЧЕР НАСТОЛОК" } });
  const { pub, admin } = build(f);
  expect(pub.event.brand).toEqual({
    en: { top: "HIS^ BOARD GAMES", main: "CUP" },
    ru: { top: "HIS^", main: "ВЕЧЕР НАСТОЛОК" },
  });
  expect("brandFields" in pub.event).toBe(false);
  expect(admin.event.brandFields.brandMainRu).toBe("ВЕЧЕР НАСТОЛОК");
});

describe("public snapshot before finale", () => {
  test("contains no standings, points or joker fields anywhere", () => {
    const { pub } = build(facts({}, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key));
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
    expect(pub.counters).toEqual({
      gamesCompleted: 2,
      tablesActive: 2,
      players: 5,
      achievementsUnlocked: build(facts()).admin.achievements.unlocks.length,
    });
    expect(pub.players.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test("reveal points appear only inside announcements when enabled", () => {
    const { pub } = build(facts({ showPointsInReveals: true }, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key));
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

  test("admin snapshot lists games that have any session; the public one does not", () => {
    const { pub, admin } = build(facts());
    expect(admin.playedGameIds).toEqual([1, 2]);
    expect("playedGameIds" in pub).toBe(false);
  });
});

const achievementAnnouncement = (id: number, achievementId: string, playerId: number): AnnouncementFact => ({
  id,
  type: "achievement",
  payload: { sessionId: 10, playerId, achievementId },
  createdAt: NOW - 5_000,
});

describe("achievements in snapshots", () => {
  test("public sees public unlocks and only a sealed count; admin sees everything", () => {
    const { pub, admin } = build(facts());
    const sealed = (id: Parameters<typeof achievementDef>[0]) => achievementDef(id).sealed;
    expect(admin.achievements.unlocks.some((u) => u.achievementId === "joker-master" && u.playerId === 1)).toBe(true);
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "opening-move" && u.playerId === 1)).toBe(true);
    expect(pub.achievements.unlocks.every((u) => !sealed(u.achievementId))).toBe(true);
    expect(pub.achievements.sealedUnlockCount).toBe(admin.achievements.unlocks.filter((u) => sealed(u.achievementId)).length);
    expect(pub.achievements.sealedUnlockCount).toBeGreaterThan(0);
    expect(pub.achievements.eligiblePlayers).toBe(3);
    expect(pub.achievements.enabled).toHaveLength(22);
    expect(pub.counters.achievementsUnlocked).toBe(admin.achievements.unlocks.length);
  });

  test("unlocks are newest first", () => {
    const { admin } = build(facts());
    const times = admin.achievements.unlocks.map((u) => u.at);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test("disabled achievements disappear from the view", () => {
    const f = { ...facts(), disabledAchievements: ["opening-move"] };
    const { pub } = build(f);
    expect(pub.achievements.enabled).not.toContain("opening-move");
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "opening-move")).toBe(false);
  });

  test("after the reveal, public unlocks include sealed ones", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "joker-master")).toBe(true);
  });

  test("achievement announcements: sealed and stale ones never reach the public", () => {
    const f = facts({}, [
      achievementAnnouncement(1, "opening-move", 1),
      achievementAnnouncement(2, "joker-master", 1),
      achievementAnnouncement(3, "hot-streak", 2),
    ]);
    const { pub, admin } = build(f);
    expect(pub.announcements).toEqual([
      { id: 1, createdAt: NOW - 5_000, type: "achievement", achievementId: "opening-move", playerId: 1, sessionId: 10 },
    ]);
    expect(admin.announcements.map((a) => a.id)).toEqual([1, 2]);
  });

  test("sealed overrides decide which unlocks stay hidden before the reveal and are listed in the view", () => {
    const { pub } = build({ ...facts(), sealedOverrides: { "joker-master": false, phoenix: true } });
    expect(pub.achievements.sealed).toContain("phoenix");
    expect(pub.achievements.sealed).toContain("underdog");
    expect(pub.achievements.sealed).not.toContain("joker-master");
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "joker-master")).toBe(true);
  });
});

describe("finale views", () => {
  test("no finale before the event is finished", () => {
    const { pub, admin } = build(facts({ screenControl: { paused: false, skipNonce: 0, finaleStep: 3 } }));
    expect(pub.finale).toBeNull();
    expect(admin.finale).toBeNull();
  });

  test("finished at step 0: admin has the script, public has nothing", () => {
    const { pub, admin } = build(facts({ status: "finished" }));
    expect(pub.finale).toBeNull();
    expect(admin.finale?.step).toBe(0);
    expect(admin.finale?.current).toBeNull();
    expect(admin.finale?.revealStep).toBe(admin.finale!.beats.findIndex((b) => b.kind === "podium") + 1);
  });

  test("public carries only the current beat and no standings fields before the reveal", () => {
    const script = build(facts({ status: "finished" })).admin.finale!.beats;
    const placeStep = script.findIndex((b) => b.kind === "place") + 1;
    const championStep = script.findIndex((b) => b.kind === "champion") + 1;
    for (const step of [1, 2, 3, placeStep, championStep]) {
      const { pub } = build(facts({ status: "finished", screenControl: { paused: false, skipNonce: 0, finaleStep: step } }));
      expect(pub.finale).toEqual({ step, total: script.length, current: script[step - 1] });
      expect(pub.finale).not.toHaveProperty("beats");
      expect(keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
    }
  });

  test("step is clamped to the script length", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true, screenControl: { paused: false, skipNonce: 0, finaleStep: 99 } }));
    expect(pub.finale?.step).toBe(pub.finale?.total);
    expect(pub.finale?.current?.kind).toBe("closing");
  });
});

describe("stats, streaks, stories and timeline", () => {
  test("public before the reveal: stats and stories yes, finale stats and sealed timeline items no", () => {
    const { pub } = build(facts());
    expect(pub.stats.gamesCompleted).toBe(2);
    expect(pub.stats.rivals).toEqual({ playerIds: [2, 3], count: 2 });
    expect(pub.finaleStats).toBeNull();
    expect(pub.streaks).toEqual([]);
    expect(pub.stories.map((s) => s.kind)).toEqual(["rivals", "longest"]);
    expect(pub.timeline.flatMap((i) => (i.kind === "started" ? [i.sessionId] : []))).toEqual([11, 10, 12]);
    expect(pub.timeline.some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(false);
    expect(keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
  });

  test("after the reveal: finale stats and sealed unlocks join the public views", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.finaleStats?.race.map((s) => s.playerId)).toEqual(
      pub.leaderboard!.filter((r) => r.rank !== null).slice(0, 5).map((r) => r.playerId),
    );
    expect(pub.timeline.some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(true);
  });
});
