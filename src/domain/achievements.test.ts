import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  achievementDef,
  achievementVisibility,
  isAchievementId,
  isSealed,
  newUnlocks,
  rarityOf,
  rarityRank,
  type AchievementId,
  type Unlock,
} from "./achievements";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import type { ScoringSettings, SessionFact } from "./types";

const players = Array.from({ length: 12 }, (_, i) => makePlayer(i + 1, `P${String(i + 1).padStart(2, "0")}`));
const FAMILY_GAMES: Array<[number, string]> = [
  [1, "catan"],
  [2, "ticket-to-ride"],
  [3, "splendor"],
  [4, "hitster"],
  [5, "seven-wonders"],
  [6, "citadels"],
  [7, "rats-race"],
  [8, "uno"],
];
const games = [
  ...FAMILY_GAMES.map(([id, family]) => makeGame(id, 10, { family, allowTies: family === "hitster" })),
  makeGame(9, 1, { family: "filler" }),
  makeGame(10, 10, { family: "big" }),
];
const MIN = 60_000;

function unlocksOf(sessions: SessionFact[], opts: { disabled?: string[]; settings?: Partial<ScoringSettings> } = {}) {
  return replay({ players, games, sessions, disabledAchievements: opts.disabled }, makeSettings(opts.settings)).unlocks;
}
const has = (unlocks: Unlock[], id: AchievementId, playerId: number) =>
  unlocks.some((u) => u.achievementId === id && u.playerId === playerId);
/** Two-player result where `winner` beats `loser` at `at` minutes. */
const duel = (id: number, gameId: number, at: number, winner: number, loser: number, overrides: Partial<SessionFact> = {}) =>
  makeDoneSession(id, gameId, at * MIN, [
    [winner, 1],
    [loser, 2],
  ], overrides);

describe("definitions", () => {
  test("22 unique ids, five sealed", () => {
    expect(ACHIEVEMENT_IDS).toHaveLength(22);
    expect(ACHIEVEMENTS.map((d) => d.id)).toEqual([...ACHIEVEMENT_IDS]);
    expect(ACHIEVEMENTS.filter((d) => d.sealed).map((d) => d.id).sort()).toEqual(
      ["comeback", "giant-slayer", "joker-master", "risk-taker", "underdog"],
    );
    expect(isAchievementId("phoenix")).toBe(true);
    expect(isAchievementId("nope")).toBe(false);
  });
});

describe("game wins", () => {
  const byFamily: Record<string, AchievementId> = {
    catan: "catan-lord",
    "ticket-to-ride": "rail-baron",
    splendor: "gem-master",
    hitster: "music-master",
    "seven-wonders": "wonder-architect",
    citadels: "kingmaker",
    "rats-race": "rat-king",
    uno: "last-card",
  };
  test.each(FAMILY_GAMES)("game %i (%s) unlocks for the winner only", (gameId, family) => {
    const unlocks = unlocksOf([duel(1, gameId, 10, 1, 2)]);
    expect(has(unlocks, byFamily[family], 1)).toBe(true);
    expect(has(unlocks, byFamily[family], 2)).toBe(false);
  });

  test("a tie for first counts as a win for everyone tied", () => {
    const unlocks = unlocksOf([
      makeDoneSession(1, 4, 10 * MIN, [
        [1, 1],
        [2, 1],
        [3, 3],
      ]),
    ]);
    expect(has(unlocks, "music-master", 1)).toBe(true);
    expect(has(unlocks, "music-master", 2)).toBe(true);
    expect(has(unlocks, "music-master", 3)).toBe(false);
  });

  test("unlock records session and finish time, once per player", () => {
    const unlocks = unlocksOf([duel(1, 1, 10, 1, 2), duel(2, 1, 20, 1, 2)]);
    expect(unlocks.filter((u) => u.achievementId === "catan-lord")).toEqual([
      { achievementId: "catan-lord", playerId: 1, sessionId: 1, at: 10 * MIN },
    ]);
  });
});

describe("streaks and firsts", () => {
  test("opening move goes to the winner of the first result only", () => {
    const unlocks = unlocksOf([duel(2, 9, 20, 3, 4), duel(1, 9, 10, 1, 2)]);
    expect(has(unlocks, "opening-move", 1)).toBe(true);
    expect(has(unlocks, "opening-move", 3)).toBe(false);
  });

  test("back-to-back needs consecutive wins in the player's own results", () => {
    const yes = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 3, 4), duel(3, 9, 30, 1, 5)]);
    expect(yes.find((u) => u.achievementId === "back-to-back" && u.playerId === 1)?.sessionId).toBe(3);
    const broken = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 2, 1), duel(3, 9, 30, 1, 5)]);
    expect(has(broken, "back-to-back", 1)).toBe(false);
  });

  test("hot streak needs three wins in a row", () => {
    const two = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 1, 3)]);
    expect(has(two, "hot-streak", 1)).toBe(false);
    const three = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 1, 3), duel(3, 9, 30, 1, 4)]);
    expect(has(three, "hot-streak", 1)).toBe(true);
  });

  test("phoenix: win right after finishing last, ties for last count", () => {
    const afterLast = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [2, 1],
        [3, 2],
        [1, 2],
      ]),
      duel(2, 9, 20, 1, 4),
    ]);
    expect(has(afterLast, "phoenix", 1)).toBe(true);
    const afterSecond = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [2, 1],
        [1, 2],
        [3, 3],
      ]),
      duel(2, 9, 20, 1, 4),
    ]);
    expect(has(afterSecond, "phoenix", 1)).toBe(false);
  });
});

describe("progress achievements", () => {
  test("triple threat: wins in three families, with progress", () => {
    const sessions = [duel(1, 1, 10, 1, 2), duel(2, 2, 20, 1, 2), duel(3, 1, 30, 1, 2)];
    expect(has(unlocksOf(sessions), "triple-threat", 1)).toBe(false);
    const rp = replay({ players, games, sessions }, makeSettings());
    expect(achievementDef("triple-threat").progress!(rp.byPlayer.get(1)!)).toEqual({ current: 2, target: 3 });
    expect(has(unlocksOf([...sessions, duel(4, 3, 40, 1, 2)]), "triple-threat", 1)).toBe(true);
  });

  test("all-rounder: five families played", () => {
    const four = [1, 2, 3, 5].map((gameId, i) => duel(i + 1, gameId, (i + 1) * 10, 2, 1));
    expect(has(unlocksOf(four), "all-rounder", 1)).toBe(false);
    expect(has(unlocksOf([...four, duel(5, 6, 50, 2, 1)]), "all-rounder", 1)).toBe(true);
  });

  test("all-rounder counts families: a variant adds nothing, a new custom family does", () => {
    const withCustom = [...games, makeGame(11, 10, { family: "catan" }), makeGame(12, 10, { family: "azul" })];
    const unlocks = (gameIds: number[]) =>
      replay(
        { players, games: withCustom, sessions: gameIds.map((gameId, i) => duel(i + 1, gameId, (i + 1) * 10, 1, 2)) },
        makeSettings(),
      ).unlocks;
    expect(has(unlocks([1, 2, 3, 4, 11]), "all-rounder", 1)).toBe(false);
    expect(has(unlocks([1, 2, 3, 4, 12]), "all-rounder", 1)).toBe(true);
  });

  test("table hopper: four different tables, direct results without table ignored", () => {
    const sessions = [1, 2, 3].map((tableId) => duel(tableId, 9, tableId * 10, 1, 2, { tableId }));
    const noTable = duel(4, 9, 40, 1, 2, { tableId: null });
    expect(has(unlocksOf([...sessions, noTable]), "table-hopper", 1)).toBe(false);
    expect(has(unlocksOf([...sessions, duel(5, 9, 50, 1, 2, { tableId: 4 })]), "table-hopper", 1)).toBe(true);
  });

  test("social butterfly: eight distinct opponents", () => {
    const first = makeDoneSession(1, 9, 10 * MIN, [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
    const second = makeDoneSession(2, 9, 20 * MIN, [
      [1, 1],
      [2, 2],
      [6, 3],
      [7, 4],
    ]);
    expect(has(unlocksOf([first, second]), "social-butterfly", 1)).toBe(false);
    const third = makeDoneSession(3, 9, 30 * MIN, [
      [8, 1],
      [9, 2],
      [1, 3],
    ]);
    expect(has(unlocksOf([first, second, third]), "social-butterfly", 1)).toBe(true);
  });

  test("marathon: 180 minutes across sessions with a real duration", () => {
    const five = [1, 2, 3, 4, 5].map((i) => duel(i, 9, i * 60, 2, 1));
    const direct = duel(6, 9, 400, 2, 1, { startedAt: 400 * MIN });
    expect(has(unlocksOf([...five, direct]), "marathon", 1)).toBe(false);
    expect(has(unlocksOf([...five, duel(7, 9, 500, 2, 1)]), "marathon", 1)).toBe(true);
  });
});

describe("sealed achievements", () => {
  test("comeback: climb 3+ places among already-ranked players, once at least 8 are ranked", () => {
    /** Players 2.. each beat player 12 once, player 1 enters low, then player 1 wins big. `size` players are ranked before that win. */
    const field = (size: number) => {
      const sessions = Array.from({ length: size - 2 }, (_, i) => duel(i + 1, 9, i + 1, i + 2, 12));
      sessions.push(duel(sessions.length + 1, 9, sessions.length + 1, 2, 1));
      sessions.push(duel(sessions.length + 1, 10, sessions.length + 1, 1, 12));
      return sessions;
    };
    expect(has(unlocksOf(field(8)), "comeback", 1)).toBe(true);
    expect(has(unlocksOf(field(7)), "comeback", 1)).toBe(false);
    const newcomerWins = [...field(8).slice(0, -1), duel(99, 10, 99, 11, 12)];
    expect(has(unlocksOf(newcomerWins), "comeback", 11)).toBe(false);
  });

  test("underdog: win with the strictly lowest counted score at the table", () => {
    const opener = duel(1, 10, 10, 1, 2);
    expect(has(unlocksOf([opener, duel(2, 9, 20, 3, 1)]), "underdog", 3)).toBe(true);
    const tiedLowest = makeDoneSession(2, 9, 20 * MIN, [
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(has(unlocksOf([opener, tiedLowest]), "underdog", 3)).toBe(false);
  });

  test("giant slayer: finish above the leader, who must have a prior result", () => {
    const opener = duel(1, 10, 10, 1, 2);
    expect(has(unlocksOf([opener]), "giant-slayer", 1)).toBe(false);
    const unlocks = unlocksOf([opener, duel(2, 9, 20, 3, 1)]);
    expect(has(unlocks, "giant-slayer", 3)).toBe(true);
    expect(has(unlocks, "giant-slayer", 1)).toBe(false);
  });

  test("joker master: win with Joker declared", () => {
    const unlocks = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [1, 1, true],
        [2, 2, true],
      ]),
    ]);
    expect(has(unlocks, "joker-master", 1)).toBe(true);
    expect(has(unlocks, "joker-master", 2)).toBe(false);
  });

  test("risk taker: Joker at a table of five or more", () => {
    const five = makeDoneSession(1, 9, 10 * MIN, [
      [1, 5, true],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
    ]);
    expect(has(unlocksOf([five]), "risk-taker", 1)).toBe(true);
    const four = makeDoneSession(1, 9, 10 * MIN, [
      [1, 4, true],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
    expect(has(unlocksOf([four]), "risk-taker", 1)).toBe(false);
  });
});

describe("settings, rarity and diffs", () => {
  test("disabled achievements never unlock", () => {
    expect(has(unlocksOf([duel(1, 1, 10, 1, 2)], { disabled: ["catan-lord"] }), "catan-lord", 1)).toBe(false);
  });

  test("rarityOf uses unlock share among players with results", () => {
    expect(rarityOf(0, 20)).toBeNull();
    expect(rarityOf(1, 2)).toBe("legendary");
    expect(rarityOf(2, 50)).toBe("legendary");
    expect(rarityOf(2, 20)).toBe("epic");
    expect(rarityOf(3, 20)).toBe("rare");
    expect(rarityOf(8, 20)).toBe("rare");
    expect(rarityOf(9, 20)).toBe("common");
  });

  test("rarityRank orders still-locked first, then rarest to most common", () => {
    expect(rarityRank(null)).toBeLessThan(rarityRank("legendary"));
    expect(rarityRank("legendary")).toBeLessThan(rarityRank("epic"));
    expect(rarityRank("epic")).toBeLessThan(rarityRank("rare"));
    expect(rarityRank("rare")).toBeLessThan(rarityRank("common"));
  });

  test("newUnlocks returns every new unlock, sealed ones included", () => {
    const a: Unlock = { achievementId: "catan-lord", playerId: 1, sessionId: 1, at: 1 };
    const b: Unlock = { achievementId: "opening-move", playerId: 2, sessionId: 2, at: 2 };
    const sealed: Unlock = { achievementId: "underdog", playerId: 2, sessionId: 2, at: 2 };
    expect(newUnlocks([a], [a, b, sealed])).toEqual([b, sealed]);
    expect(newUnlocks([a, b], [b])).toEqual([]);
  });

  test("achievementVisibility hides only a sealed description, only before the reveal", () => {
    expect(achievementVisibility(true, false)).toBe("titleOnly");
    expect(achievementVisibility(true, true)).toBe("full");
    expect(achievementVisibility(false, false)).toBe("full");
  });

  test("isSealed prefers the admin override over the built-in default", () => {
    expect(isSealed("comeback", {})).toBe(true);
    expect(isSealed("comeback", { comeback: false })).toBe(false);
    expect(isSealed("phoenix", {})).toBe(false);
    expect(isSealed("phoenix", { phoenix: true })).toBe(true);
  });
});
