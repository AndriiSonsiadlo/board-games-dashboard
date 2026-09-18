import { rarityOf, rarityRank, type AchievementId, type Unlock } from "@/domain/achievements";
import { ANNOUNCEMENT_WINDOW_MS, type PublicSnapshot, type ScreenAnnouncement } from "@/domain/snapshot";
import type { PublicStats } from "@/domain/stats";
import { ALL_SCENES, type AchievementOrder, type SceneId } from "@/domain/types";

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

/**
 * The "seen" cursor is a createdAt timestamp, not an id: a DB reseed or backup restore can
 * restart the announcement id sequence from 1, and an id-based cursor left over from before
 * that would then exceed every future id forever. Wall-clock time only moves forward, so it
 * survives resets that ids don't.
 */
export function nextAnnouncements(
  all: ScreenAnnouncement[],
  lastSeenAt: number,
  now: number,
  windowMs = ANNOUNCEMENT_WINDOW_MS,
): ScreenAnnouncement[] {
  return all.filter((a) => a.createdAt > lastSeenAt && a.createdAt >= now - windowMs).sort((a, b) => a.id - b.id);
}

export type RevealPhase = "title" | "places" | "winner" | "podium";

/**
 * When the podium scene is off, the reveal just holds on the winner layout through the whole
 * podium hold instead of swapping to a dedicated podium view — the winner name must stay shown
 * for that whole hold, not just during the "winner" phase, or it fades out well before the rest
 * of the overlay does.
 */
export function winnerVisible(phase: RevealPhase): boolean {
  return phase === "winner" || phase === "podium";
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

export interface AchievementHolders {
  achievementId: AchievementId;
  playerIds: number[];
  latestAt: number;
}

/** Unlocks grouped per achievement: the most recently unlocked achievement first, holders in unlock order. */
export function holdersByAchievement(unlocks: Unlock[]): AchievementHolders[] {
  const groups = new Map<AchievementId, AchievementHolders>();
  for (const u of [...unlocks].sort((a, b) => a.at - b.at)) {
    const group = groups.get(u.achievementId) ?? { achievementId: u.achievementId, playerIds: [], latestAt: u.at };
    group.playerIds.push(u.playerId);
    group.latestAt = Math.max(group.latestAt, u.at);
    groups.set(u.achievementId, group);
  }
  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt);
}

/** Recency (default, most recently unlocked first) or rarest-first for the projector's achievements scene. */
export function orderAchievementGroups(
  groups: AchievementHolders[],
  order: AchievementOrder,
  eligiblePlayers: number,
): AchievementHolders[] {
  if (order === "recent") return groups;
  return [...groups].sort(
    (a, b) => rarityRank(rarityOf(a.playerIds.length, eligiblePlayers)) - rarityRank(rarityOf(b.playerIds.length, eligiblePlayers)),
  );
}

/** Non-winning placements grouped by value, last place first; tied players share a group and appear together. */
export function revealGroups<P extends { playerId: number; placement: number }>(placements: P[]): P[][] {
  const groups = new Map<number, P[]>();
  for (const p of placements) {
    if (p.placement === 1) continue;
    groups.set(p.placement, [...(groups.get(p.placement) ?? []), p]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, group]) => [...group].sort((a, b) => a.playerId - b.playerId));
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
