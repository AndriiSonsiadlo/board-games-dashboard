import type { Unlock } from "./achievements";
import type { PublicStats, Streak } from "./stats";
import { MILESTONES } from "./types";

export const MILESTONE_NEAR = 3;
export const COLLECTOR_MIN = 3;

export type Story =
  | { kind: "streak"; playerId: number; streak: number }
  | { kind: "milestone"; next: number; remaining: number }
  | { kind: "rivals"; playerIds: [number, number]; count: number }
  | { kind: "collector"; playerId: number; count: number }
  | { kind: "popular"; gameId: number; count: number }
  | { kind: "longest"; gameId: number; tableId: number | null; durationMin: number };

function topCollector(unlocks: Unlock[]): { playerId: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const u of unlocks) counts.set(u.playerId, (counts.get(u.playerId) ?? 0) + 1);
  let best: { playerId: number; count: number } | null = null;
  for (const [playerId, count] of counts) {
    if (!best || count > best.count || (count === best.count && playerId < best.playerId)) best = { playerId, count };
  }
  return best;
}

/** Headlines from public facts, most exciting first. `unlocks` must already be filtered for the audience. */
export function buildStories(input: { streaks: Streak[]; stats: PublicStats; unlocks: Unlock[] }): Story[] {
  const { streaks, stats, unlocks } = input;
  const stories: Story[] = [];

  const streak = streaks[0];
  if (streak) stories.push({ kind: "streak", playerId: streak.playerId, streak: streak.streak });

  const next = MILESTONES.find((m) => m > stats.gamesCompleted);
  if (next !== undefined && stats.gamesCompleted > 0 && next - stats.gamesCompleted <= MILESTONE_NEAR) {
    stories.push({ kind: "milestone", next, remaining: next - stats.gamesCompleted });
  }

  if (stats.rivals) stories.push({ kind: "rivals", playerIds: stats.rivals.playerIds, count: stats.rivals.count });

  const collector = topCollector(unlocks);
  if (collector && collector.count >= COLLECTOR_MIN) stories.push({ kind: "collector", ...collector });

  const popular = stats.popularity[0];
  if (popular && popular.count >= 2) stories.push({ kind: "popular", gameId: popular.gameId, count: popular.count });

  if (stats.longest) {
    const { gameId, tableId, durationMin } = stats.longest;
    stories.push({ kind: "longest", gameId, tableId, durationMin });
  }
  return stories;
}
