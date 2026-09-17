import { ACHIEVEMENTS, isSealed, type AchievementId } from "./achievements";
import type { PlayerResult, Replay } from "./replay";
import type { PlayerView } from "./snapshot";
import type { Facts } from "./types";

export interface ProfileResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  finishedAt: number;
  placement: number;
  playerCount: number;
  points?: number;
  counted?: boolean;
}

export interface ProfileAchievement {
  id: AchievementId;
  sealed: boolean;
  unlockedAt: number | null;
  progress: { current: number; target: number } | null;
}

export interface ProfileStanding {
  rank: number | null;
  counted: number;
  raw: number;
  wins: number;
  podiums: number;
  gamesPlayed: number;
  winRate: number;
  excludedSessionIds: number[];
  strongestGameId: number | null;
  weakestGameId: number | null;
  rankHistory: { finishedAt: number; rank: number | null }[];
}

export interface PlayerProfile {
  player: PlayerView;
  revealed: boolean;
  results: ProfileResult[];
  favoriteGameId: number | null;
  tablesPlayed: number;
  achievements: ProfileAchievement[];
  standing: ProfileStanding | null;
}

function favoriteGame(history: PlayerResult[]): number | null {
  const stats = new Map<number, { count: number; lastAt: number }>();
  for (const r of history) {
    const s = stats.get(r.gameId) ?? { count: 0, lastAt: 0 };
    stats.set(r.gameId, { count: s.count + 1, lastAt: Math.max(s.lastAt, r.finishedAt) });
  }
  let best: { gameId: number; count: number; lastAt: number } | null = null;
  for (const [gameId, s] of stats) {
    if (!best || s.count > best.count || (s.count === best.count && s.lastAt > best.lastAt)) best = { gameId, ...s };
  }
  return best?.gameId ?? null;
}

function gameExtremes(history: PlayerResult[], weights: Map<number, number>): { strongest: number | null; weakest: number | null } {
  const groups = new Map<number, { sum: number; count: number }>();
  for (const r of history) {
    const weight = weights.get(r.gameId) ?? 0;
    if (weight <= 0) continue;
    const g = groups.get(r.gameId) ?? { sum: 0, count: 0 };
    groups.set(r.gameId, { sum: g.sum + r.base / weight, count: g.count + 1 });
  }
  if (groups.size < 2) return { strongest: null, weakest: null };
  const rows = [...groups].map(([gameId, g]) => ({ gameId, mean: g.sum / g.count, count: g.count }));
  const order = (dir: 1 | -1) =>
    [...rows].sort((a, b) => dir * (b.mean - a.mean) || b.count - a.count || a.gameId - b.gameId)[0].gameId;
  return { strongest: order(1), weakest: order(-1) };
}

export function buildProfile(
  facts: Facts,
  rp: Replay,
  playerId: number,
  audience: "public" | "admin",
): PlayerProfile | null {
  const player = facts.players.find((p) => p.id === playerId);
  if (!player) return null;
  const history = rp.byPlayer.get(playerId) ?? [];
  if (audience === "public" && !player.active && history.length === 0) return null;

  const revealed = audience === "admin" || facts.event.finaleRevealed;
  const row = rp.standings.find((r) => r.playerId === playerId);
  const countedIds = new Set(row?.countedSessionIds ?? []);
  const disabled = new Set(facts.disabledAchievements);
  const unlockedAt = new Map(rp.unlocks.filter((u) => u.playerId === playerId).map((u) => [u.achievementId, u.at]));

  const results: ProfileResult[] = [...history].reverse().map((r) => ({
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    finishedAt: r.finishedAt,
    placement: r.placement,
    playerCount: r.playerCount,
    ...(revealed ? { points: r.points, counted: countedIds.has(r.sessionId) } : {}),
  }));

  const sealed = (id: AchievementId) => isSealed(id, facts.sealedOverrides);
  const achievements: ProfileAchievement[] = ACHIEVEMENTS.filter((d) => !disabled.has(d.id) && (revealed || !sealed(d.id))).map((d) => ({
    id: d.id,
    sealed: sealed(d.id),
    unlockedAt: unlockedAt.get(d.id) ?? null,
    progress: d.progress ? d.progress(history) : null,
  }));

  let standing: ProfileStanding | null = null;
  if (revealed) {
    const extremes = gameExtremes(history, new Map(facts.games.map((g) => [g.id, g.weight])));
    standing = {
      rank: row?.rank ?? null,
      counted: row?.counted ?? 0,
      raw: row?.raw ?? 0,
      wins: row?.wins ?? 0,
      podiums: row?.podiums ?? 0,
      gamesPlayed: row?.gamesPlayed ?? 0,
      winRate: history.length > 0 ? (row?.wins ?? 0) / history.length : 0,
      excludedSessionIds: row?.excludedSessionIds ?? [],
      strongestGameId: extremes.strongest,
      weakestGameId: extremes.weakest,
      rankHistory: (rp.rankHistory.get(playerId) ?? []).map((h) => ({ finishedAt: h.finishedAt, rank: h.rank })),
    };
  }

  return {
    player: { id: player.id, name: player.name, nickname: player.nickname, color: player.color },
    revealed,
    results,
    favoriteGameId: favoriteGame(history),
    tablesPlayed: new Set(history.flatMap((r) => (r.tableId === null ? [] : [r.tableId]))).size,
    achievements,
    standing,
  };
}
