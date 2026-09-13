import type { PlayerResult, Replay, ReplayResult } from "./replay";
import type { Facts, GameFact, TableFact } from "./types";

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

export type TimedResult = LongestResult;

export interface FamilyCount {
  family: string;
  /** Representative game for the name and icon: shortest name, then lowest id. */
  gameId: number;
  count: number;
}

export interface SizeCount {
  size: number;
  count: number;
}

export interface HeatmapRow {
  tableId: number;
  number: number;
  cells: number[];
}

export interface Heatmap {
  /** Start of each hour bucket, epoch ms. */
  hours: number[];
  rows: HeatmapRow[];
  max: number;
}

export interface Streak {
  playerId: number;
  streak: number;
}

export interface PublicStats {
  gamesCompleted: number;
  distinctGames: number;
  popularity: FamilyCount[];
  tableSize: SizeCount | null;
  longest: TimedResult | null;
  fastest: TimedResult | null;
  rivals: RivalPair | null;
  heatmap: Heatmap | null;
}

export const HOUR_MS = 3_600_000;
export const HEATMAP_MAX_HOURS = 12;
export const HOT_STREAK_MIN = 2;

export function distinctGames(results: ReplayResult[]): number {
  return new Set(results.map((r) => r.gameId)).size;
}

export function popularity(results: ReplayResult[], games: GameFact[]): FamilyCount[] {
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const counts = new Map<string, number>();
  for (const r of results) {
    const game = gamesById.get(r.gameId);
    if (game) counts.set(game.family, (counts.get(game.family) ?? 0) + 1);
  }
  const representative = (family: string) =>
    games.filter((g) => g.family === family).sort((a, b) => a.name.length - b.name.length || a.id - b.id)[0].id;
  return [...counts]
    .map(([family, count]) => ({ family, gameId: representative(family), count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

export function commonTableSize(results: ReplayResult[]): SizeCount | null {
  const top = topCount(results.map((r) => r.players.length));
  return top ? { size: top.key, count: top.count } : null;
}

/** Only sessions with a real duration; ties go to the earlier result. */
export function fastestResult(results: ReplayResult[]): TimedResult | null {
  let best: TimedResult | null = null;
  for (const r of results) {
    if (r.durationMin === null) continue;
    if (!best || r.durationMin < best.durationMin) {
      best = { sessionId: r.sessionId, gameId: r.gameId, tableId: r.tableId, durationMin: r.durationMin };
    }
  }
  return best;
}

const hourOf = (ts: number) => Math.floor(ts / HOUR_MS) * HOUR_MS;

/** Games in play per table per hour (latest 12 hours). Direct results count in the hour they were entered. */
export function heatmap(results: ReplayResult[], tables: TableFact[]): Heatmap | null {
  const numbers = new Map(tables.map((t) => [t.id, t.number]));
  const spans = results.flatMap((r) =>
    r.tableId !== null && numbers.has(r.tableId)
      ? [
          {
            tableId: r.tableId,
            from: hourOf(r.durationMin !== null && r.startedAt !== null ? r.startedAt : r.finishedAt),
            to: hourOf(r.finishedAt),
          },
        ]
      : [],
  );
  if (spans.length === 0) return null;
  const last = Math.max(...spans.map((s) => s.to));
  const first = Math.max(Math.min(...spans.map((s) => s.from)), last - (HEATMAP_MAX_HOURS - 1) * HOUR_MS);
  const hours: number[] = [];
  for (let h = first; h <= last; h += HOUR_MS) hours.push(h);
  const rows = [...new Set(spans.map((s) => s.tableId))]
    .map((tableId) => ({
      tableId,
      number: numbers.get(tableId)!,
      cells: hours.map((h) => spans.filter((s) => s.tableId === tableId && s.from <= h && h <= s.to).length),
    }))
    .sort((a, b) => a.number - b.number);
  return { hours, rows, max: Math.max(...rows.flatMap((r) => r.cells)) };
}

export function hotStreaks(byPlayer: Map<number, PlayerResult[]>): Streak[] {
  const streaks: Streak[] = [];
  for (const [playerId, history] of byPlayer) {
    let streak = 0;
    for (let i = history.length - 1; i >= 0 && history[i].placement === 1; i--) streak++;
    if (streak >= HOT_STREAK_MIN) streaks.push({ playerId, streak });
  }
  return streaks.sort((a, b) => b.streak - a.streak || a.playerId - b.playerId);
}

export function buildPublicStats(facts: Pick<Facts, "games" | "tables">, rp: Pick<Replay, "results">): PublicStats {
  const { results } = rp;
  return {
    gamesCompleted: results.length,
    distinctGames: distinctGames(results),
    popularity: popularity(results, facts.games),
    tableSize: commonTableSize(results),
    longest: longestResult(results),
    fastest: fastestResult(results),
    rivals: rivals(results),
    heatmap: heatmap(results, facts.tables),
  };
}
