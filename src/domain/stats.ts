import type { ReplayResult } from "./replay";

export interface GameCount {
  gameId: number;
  count: number;
}

export interface LongestResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  durationMin: number;
}

export interface TableCount {
  tableId: number;
  count: number;
}

export interface RivalPair {
  playerIds: [number, number];
  count: number;
}

function topCount(keys: number[]): { key: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let best: { key: number; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count || (count === best.count && key < best.key)) best = { key, count };
  }
  return best;
}

export function mostPlayedGame(results: ReplayResult[]): GameCount | null {
  const top = topCount(results.map((r) => r.gameId));
  return top ? { gameId: top.key, count: top.count } : null;
}

export function busiestTable(results: ReplayResult[]): TableCount | null {
  const top = topCount(results.flatMap((r) => (r.tableId === null ? [] : [r.tableId])));
  return top ? { tableId: top.key, count: top.count } : null;
}

/** Only sessions with a real duration; ties go to the earlier result. */
export function longestResult(results: ReplayResult[]): LongestResult | null {
  let best: LongestResult | null = null;
  for (const r of results) {
    if (r.durationMin === null) continue;
    if (!best || r.durationMin > best.durationMin) {
      best = { sessionId: r.sessionId, gameId: r.gameId, tableId: r.tableId, durationMin: r.durationMin };
    }
  }
  return best;
}

/** The pair of players who shared the most results (at least two). */
export function rivals(results: ReplayResult[]): RivalPair | null {
  const counts = new Map<string, number>();
  for (const r of results) {
    const ids = r.players.map((p) => p.playerId).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}:${ids[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  let best: RivalPair | null = null;
  for (const [key, count] of counts) {
    const [a, b] = key.split(":").map(Number) as [number, number];
    const better =
      !best ||
      count > best.count ||
      (count === best.count && (a < best.playerIds[0] || (a === best.playerIds[0] && b < best.playerIds[1])));
    if (better) best = { playerIds: [a, b], count };
  }
  return best && best.count >= 2 ? best : null;
}
