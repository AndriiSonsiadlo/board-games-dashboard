import type { AchievementId } from "./achievements";
import type { Replay } from "./replay";
import { MILESTONES, type Facts, type SessionStatus } from "./types";

export const TIMELINE_LIMIT = 200;

export type TimelineItem =
  | { kind: "started"; at: number; sessionId: number; gameId: number; tableId: number | null; playerIds: number[] }
  | { kind: "result"; at: number; sessionId: number; gameId: number; tableId: number | null; winnerIds: number[]; playerCount: number }
  | { kind: "unlock"; at: number; sessionId: number; achievementId: AchievementId; playerId: number }
  | { kind: "milestone"; at: number; count: number };

/** At the same moment the bigger news goes first. */
const KIND_ORDER: Record<TimelineItem["kind"], number> = { milestone: 0, unlock: 1, result: 2, started: 3 };
const STARTED: SessionStatus[] = ["playing", "pending", "done"];
const sessionOf = (item: TimelineItem) => (item.kind === "milestone" ? 0 : item.sessionId);

export function buildTimeline(
  facts: Pick<Facts, "sessions">,
  rp: Pick<Replay, "results" | "unlocks">,
  opts: { limit?: number } = {},
): TimelineItem[] {
  const timed = new Map(rp.results.map((r) => [r.sessionId, r.durationMin !== null]));
  const items: TimelineItem[] = [];

  for (const s of facts.sessions) {
    if (!STARTED.includes(s.status) || s.startedAt === null) continue;
    // Direct results have no real start; a done session must also be a valid result.
    if (s.status === "done" && !timed.get(s.id)) continue;
    items.push({
      kind: "started",
      at: s.startedAt,
      sessionId: s.id,
      gameId: s.gameId,
      tableId: s.tableId,
      playerIds: [...s.players].sort((a, b) => a.seat - b.seat).map((p) => p.playerId),
    });
  }

  for (const r of rp.results) {
    items.push({
      kind: "result",
      at: r.finishedAt,
      sessionId: r.sessionId,
      gameId: r.gameId,
      tableId: r.tableId,
      winnerIds: r.players
        .filter((p) => p.placement === 1)
        .map((p) => p.playerId)
        .sort((a, b) => a - b),
      playerCount: r.players.length,
    });
  }

  for (const u of rp.unlocks) {
    items.push({ kind: "unlock", at: u.at, sessionId: u.sessionId, achievementId: u.achievementId, playerId: u.playerId });
  }

  for (const count of MILESTONES) {
    if (count > rp.results.length) break;
    items.push({ kind: "milestone", at: rp.results[count - 1].finishedAt, count });
  }

  return items
    .sort((a, b) => b.at - a.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || sessionOf(b) - sessionOf(a))
    .slice(0, opts.limit ?? TIMELINE_LIMIT);
}
