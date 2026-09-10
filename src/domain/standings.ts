import type { ScoringStrategy } from "./types";

export interface CountableResult {
  sessionId: number;
  points: number;
  finishedAt: number;
}

export interface PlayerTotals {
  playerId: number;
  name: string;
  raw: number;
  counted: number;
  wins: number;
  podiums: number;
  gamesPlayed: number;
  countedSessionIds: number[];
  excludedSessionIds: number[];
}

export interface StandingRow extends Omit<PlayerTotals, "name"> {
  rank: number | null;
}

const chronological = (a: CountableResult, b: CountableResult) =>
  a.finishedAt - b.finishedAt || a.sessionId - b.sessionId;

export function selectCounted(
  results: CountableResult[],
  strategy: ScoringStrategy,
  bestN: number,
): { counted: number; countedIds: number[]; excludedIds: number[] } {
  const ordered = [...results].sort(chronological);
  if (strategy === "total") {
    return {
      counted: ordered.reduce((sum, r) => sum + r.points, 0),
      countedIds: ordered.map((r) => r.sessionId),
      excludedIds: [],
    };
  }
  const best = [...ordered]
    .sort((a, b) => b.points - a.points || chronological(a, b))
    .slice(0, Math.max(0, bestN));
  const chosen = new Set(best.map((r) => r.sessionId));
  return {
    counted: best.reduce((sum, r) => sum + r.points, 0),
    countedIds: ordered.filter((r) => chosen.has(r.sessionId)).map((r) => r.sessionId),
    excludedIds: ordered.filter((r) => !chosen.has(r.sessionId)).map((r) => r.sessionId),
  };
}

/** Rounds to 6 decimals so floating noise never decides a rank. */
const pts = (value: number) => Math.round(value * 1e6);

export function pointsEqual(a: number, b: number): boolean {
  return pts(a) === pts(b);
}

export function compareTotals(a: PlayerTotals, b: PlayerTotals): number {
  const aPlayed = a.gamesPlayed > 0;
  const bPlayed = b.gamesPlayed > 0;
  if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
  return (
    pts(b.counted) - pts(a.counted) ||
    b.wins - a.wins ||
    pts(b.raw) - pts(a.raw) ||
    a.gamesPlayed - b.gamesPlayed ||
    a.name.localeCompare(b.name) ||
    a.playerId - b.playerId
  );
}

export function rankStandings(totals: PlayerTotals[]): StandingRow[] {
  let rank = 0;
  return [...totals].sort(compareTotals).map(({ name: _name, ...row }) => ({
    ...row,
    rank: row.gamesPlayed > 0 ? ++rank : null,
  }));
}
