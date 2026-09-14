import { ANNOUNCEMENT_WINDOW_MS, type PublicSnapshot, type ScreenAnnouncement } from "@/domain/snapshot";
import type { PublicStats } from "@/domain/stats";
import { ALL_SCENES, type SceneId } from "@/domain/types";

export function availableScenes(
  enabled: SceneId[],
  snapshot: Pick<PublicSnapshot, "recentResults" | "contenders" | "achievements" | "stories"> & {
    stats: Pick<PublicStats, "popularity">;
  },
): SceneId[] {
  const scenes = ALL_SCENES.filter((scene) => enabled.includes(scene)).filter((scene) => {
    if (scene === "recent") return snapshot.recentResults.length > 0;
    if (scene === "contenders") return (snapshot.contenders?.length ?? 0) > 0;
    if (scene === "achievements") {
      return snapshot.achievements.unlocks.length > 0 || snapshot.achievements.sealedUnlockCount > 0;
    }
    if (scene === "story") return snapshot.stories.length > 0;
    if (scene === "popular") return snapshot.stats.popularity.length > 0;
    return true;
  });
  return scenes.length > 0 ? scenes : ["title"];
}

export function nextAnnouncements(
  all: ScreenAnnouncement[],
  lastSeenId: number,
  now: number,
  windowMs = ANNOUNCEMENT_WINDOW_MS,
): ScreenAnnouncement[] {
  return all.filter((a) => a.id > lastSeenId && a.createdAt >= now - windowMs).sort((a, b) => a.id - b.id);
}

const TITLE_MS = 2200;
const FIRST_PLACE_MS = 2600;
const STEP_MS = 900;
const WINNER_PAUSE_MS = 700;
const WINNER_HOLD_MS = 4000;
const PODIUM_HOLD_MS = 3000;

export function revealTimeline(nonWinnerCount: number) {
  const winnerMs = FIRST_PLACE_MS + nonWinnerCount * STEP_MS + WINNER_PAUSE_MS;
  const podiumMs = winnerMs + WINNER_HOLD_MS;
  return {
    titleMs: TITLE_MS,
    firstPlaceMs: FIRST_PLACE_MS,
    stepMs: STEP_MS,
    winnerMs,
    podiumMs,
    doneMs: podiumMs + PODIUM_HOLD_MS,
  };
}

const PODIUM_ORDER = [2, 1, 3] as const;

export function podiumSlots(
  placements: { playerId: number; placement: number }[],
): { placement: 1 | 2 | 3; playerIds: number[] }[] {
  return PODIUM_ORDER.map((placement) => ({
    placement,
    playerIds: placements.filter((p) => p.placement === placement).map((p) => p.playerId),
  })).filter((slot) => slot.playerIds.length > 0);
}

export const ACHIEVEMENT_HOLD_MS = 15_000;

/**
 * Next announcement to play from a queue in id order. Achievement cards wait a moment after
 * they were created so that "Show on screen" for the same game can play the reveal first;
 * a reveal already queued for that game always goes first.
 */
export function pickNext(
  queue: ScreenAnnouncement[],
  now: number,
  holdMs = ACHIEVEMENT_HOLD_MS,
): ScreenAnnouncement | null {
  for (const item of queue) {
    if (item.type !== "achievement") return item;
    const revealQueued = queue.some((q) => q.type === "result_reveal" && q.result.sessionId === item.sessionId);
    if (!revealQueued && now - item.createdAt >= holdMs) return item;
  }
  return null;
}
