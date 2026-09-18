import { describe, expect, test } from "vitest";
import type { ScreenAnnouncement } from "@/domain/snapshot";
import {
  availableScenes,
  holdersByAchievement,
  nextAnnouncements,
  orderAchievementGroups,
  pickNext,
  podiumSlots,
  revealGroups,
  revealTimeline,
} from "./logic";

const result = { sessionId: 1, gameId: 1, tableId: 1, startedAt: 0, finishedAt: 0, durationMin: null, placements: [] };

const noAchievements = { enabled: [], sealed: [], unlocks: [], sealedUnlockCount: 0, eligiblePlayers: 0 };

const empty = { recentResults: [], contenders: null, achievements: noAchievements, stories: [], stats: { popularity: [] } };

test("availableScenes drops empty scenes, keeps canonical order and never returns an empty list", () => {
  expect(availableScenes(["title", "recent", "contenders", "room", "achievements", "story", "popular"], empty)).toEqual([
    "title",
    "room",
  ]);
  expect(
    availableScenes(["popular", "story", "recent", "contenders", "achievements"], {
      recentResults: [result],
      contenders: [3],
      achievements: { ...noAchievements, sealedUnlockCount: 1 },
      stories: [{ kind: "milestone", next: 10, remaining: 1 }],
      stats: { popularity: [{ family: "uno", gameId: 1, count: 1 }] },
    }),
  ).toEqual(["recent", "achievements", "story", "popular", "contenders"]);
  expect(availableScenes(["recent"], { ...empty, contenders: [] })).toEqual(["title"]);
});

test("nextAnnouncements keeps unseen, recent announcements in id order", () => {
  const all: ScreenAnnouncement[] = [
    { id: 5, createdAt: 9_000, type: "milestone", count: 10 },
    { id: 3, createdAt: 9_500, type: "milestone", count: 25 },
    { id: 7, createdAt: 1_000, type: "milestone", count: 50 },
    { id: 6, createdAt: 9_900, type: "result_reveal", result },
  ];
  expect(nextAnnouncements(all, 4, 10_000, 5_000).map((a) => a.id)).toEqual([5, 6]);
});

test("revealTimeline spaces placements, holds the winner, then the podium", () => {
  const t = revealTimeline(3);
  expect(t.titleMs).toBe(2200);
  expect(t.firstPlaceMs).toBe(2600);
  expect(t.winnerMs).toBe(2600 + 3 * 900 + 700);
  expect(t.podiumMs).toBe(t.winnerMs + 4000);
  expect(t.doneMs).toBe(t.podiumMs + 3000);
});

test("podiumSlots groups ties and orders 2nd, 1st, 3rd", () => {
  expect(
    podiumSlots([
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
      { playerId: 3, placement: 3 },
      { playerId: 4, placement: 4 },
    ]),
  ).toEqual([
    { placement: 2, playerIds: [2] },
    { placement: 1, playerIds: [1] },
    { placement: 3, playerIds: [3] },
  ]);
  expect(
    podiumSlots([
      { playerId: 5, placement: 1 },
      { playerId: 6, placement: 1 },
      { playerId: 7, placement: 3 },
    ]),
  ).toEqual([
    { placement: 1, playerIds: [5, 6] },
    { placement: 3, playerIds: [7] },
  ]);
});

describe("pickNext", () => {
  const card = (id: number, sessionId: number, createdAt: number): ScreenAnnouncement => ({
    id,
    createdAt,
    type: "achievement",
    achievementId: "catan-lord",
    playerId: 1,
    sessionId,
  });
  const revealOf = (id: number, sessionId: number): ScreenAnnouncement => ({
    id,
    createdAt: 0,
    type: "result_reveal",
    result: { ...result, sessionId },
  });
  const milestone: ScreenAnnouncement = { id: 9, createdAt: 0, type: "milestone", count: 10 };

  test("plays non-achievement items in order", () => {
    expect(pickNext([milestone], 0)?.id).toBe(9);
    expect(pickNext([], 0)).toBeNull();
  });

  test("holds a fresh achievement, then plays it", () => {
    expect(pickNext([card(1, 5, 10_000)], 20_000, 15_000)).toBeNull();
    expect(pickNext([card(1, 5, 10_000)], 25_000, 15_000)?.id).toBe(1);
  });

  test("a queued reveal of the same game always goes first", () => {
    expect(pickNext([card(1, 5, 0), revealOf(2, 5)], 60_000, 15_000)?.id).toBe(2);
    expect(pickNext([card(1, 5, 0), revealOf(2, 6)], 60_000, 15_000)?.id).toBe(1);
  });

  test("other announcements are not blocked by a held achievement", () => {
    expect(pickNext([card(1, 5, 10_000), milestone], 11_000, 15_000)?.id).toBe(9);
  });
});

test("holdersByAchievement groups unlocks, newest achievement first, holders in unlock order", () => {
  const u = (achievementId: "phoenix" | "marathon", playerId: number, at: number) => ({ achievementId, playerId, sessionId: 1, at });
  expect(holdersByAchievement([u("phoenix", 3, 50), u("marathon", 1, 40), u("phoenix", 2, 10)])).toEqual([
    { achievementId: "phoenix", playerIds: [2, 3], latestAt: 50 },
    { achievementId: "marathon", playerIds: [1], latestAt: 40 },
  ]);
  expect(holdersByAchievement([])).toEqual([]);
});

test("orderAchievementGroups keeps recency order by default, sorts rarest-first in rarity mode", () => {
  // Already in recency order (latestAt descending), as holdersByAchievement produces.
  const groups = [
    { achievementId: "underdog" as const, playerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9], latestAt: 50 }, // common: 9/20
    { achievementId: "marathon" as const, playerIds: [1, 2], latestAt: 30 }, // epic: 2/20
    { achievementId: "phoenix" as const, playerIds: [1], latestAt: 10 }, // legendary: 1/20
  ];
  expect(orderAchievementGroups(groups, "recent", 20).map((g) => g.achievementId)).toEqual(["underdog", "marathon", "phoenix"]);
  expect(orderAchievementGroups(groups, "rarity", 20).map((g) => g.achievementId)).toEqual(["phoenix", "marathon", "underdog"]);
});

test("revealGroups: last place first, ties revealed together, winners excluded", () => {
  const p = (playerId: number, placement: number) => ({ playerId, placement });
  expect(revealGroups([p(1, 1), p(7, 2), p(3, 2), p(9, 4)])).toEqual([[p(9, 4)], [p(3, 2), p(7, 2)]]);
  expect(revealGroups([p(1, 1), p(2, 2), p(3, 3)])).toEqual([[p(3, 3)], [p(2, 2)]]);
  expect(revealGroups([p(1, 1), p(2, 1)])).toEqual([]);
  expect(revealGroups([p(4, 3), p(1, 1), p(2, 1), p(5, 3)])).toEqual([[p(4, 3), p(5, 3)]]);
});
