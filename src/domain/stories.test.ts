import { expect, test } from "vitest";
import type { AchievementId, Unlock } from "./achievements";
import type { PublicStats } from "./stats";
import { buildStories } from "./stories";

const stats: PublicStats = {
  gamesCompleted: 8,
  distinctGames: 2,
  popularity: [{ family: "catan", gameId: 1, count: 5 }],
  tableSize: null,
  longest: { sessionId: 3, gameId: 1, tableId: 2, durationMin: 95 },
  fastest: null,
  rivals: { playerIds: [2, 5], count: 3 },
  heatmap: null,
};
const unlock = (playerId: number, achievementId: AchievementId, at: number): Unlock => ({
  achievementId,
  playerId,
  sessionId: at,
  at,
});

test("all stories in priority order", () => {
  const stories = buildStories({
    streaks: [
      { playerId: 4, streak: 3 },
      { playerId: 1, streak: 2 },
    ],
    stats,
    unlocks: [unlock(7, "phoenix", 1), unlock(7, "marathon", 2), unlock(7, "opening-move", 3), unlock(1, "phoenix", 4)],
  });
  expect(stories).toEqual([
    { kind: "streak", playerId: 4, streak: 3 },
    { kind: "milestone", next: 10, remaining: 2 },
    { kind: "rivals", playerIds: [2, 5], count: 3 },
    { kind: "collector", playerId: 7, count: 3 },
    { kind: "popular", gameId: 1, count: 5 },
    { kind: "longest", gameId: 1, tableId: 2, durationMin: 95 },
  ]);
});

test("a quiet evening has no stories", () => {
  expect(
    buildStories({
      streaks: [],
      stats: { ...stats, gamesCompleted: 4, popularity: [{ family: "catan", gameId: 1, count: 1 }], longest: null, rivals: null },
      unlocks: [unlock(1, "phoenix", 1)],
    }),
  ).toEqual([]);
});

test("milestone story only when the next milestone is close", () => {
  const kinds = (gamesCompleted: number) =>
    buildStories({ streaks: [], stats: { ...stats, gamesCompleted, longest: null, rivals: null, popularity: [] }, unlocks: [] });
  expect(kinds(99)).toEqual([{ kind: "milestone", next: 100, remaining: 1 }]);
  expect(kinds(100)).toEqual([]);
  expect(kinds(0)).toEqual([]);
});
