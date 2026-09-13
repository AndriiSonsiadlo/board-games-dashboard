import { expect, test } from "vitest";
import type { ScreenAnnouncement } from "@/domain/snapshot";
import { availableScenes, nextAnnouncements, podiumSlots, revealTimeline } from "./logic";

const result = { sessionId: 1, gameId: 1, tableId: 1, startedAt: 0, finishedAt: 0, durationMin: null, placements: [] };

test("availableScenes drops empty scenes and never returns an empty list", () => {
  expect(availableScenes(["title", "recent", "contenders", "room"], { recentResults: [], contenders: null })).toEqual([
    "title",
    "room",
  ]);
  expect(availableScenes(["recent", "contenders"], { recentResults: [result], contenders: [3] })).toEqual([
    "recent",
    "contenders",
  ]);
  expect(availableScenes(["recent"], { recentResults: [], contenders: [] })).toEqual(["title"]);
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
