import { computeUnlocks, type Unlock } from "./achievements";
import { scoreResult, type ScoredPlacement } from "./scoring";
import { rankStandings, selectCounted, type PlayerTotals, type StandingRow } from "./standings";
import type { GameFact, PlayerFact, ScoringSettings, SessionFact } from "./types";

export interface PlayerResult {
  sessionId: number;
  gameId: number;
  family: string;
  tableId: number | null;
  finishedAt: number;
  durationMin: number | null;
  placement: number;
  playerCount: number;
  /** Other players in the same result. */
  opponents: number[];
  /** Finished in the lowest placement of a result that has more than one placement value. */
  last: boolean;
  base: number;
  points: number;
  jokerDeclared: boolean;
}

export interface ReplayResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  startedAt: number | null;
  finishedAt: number;
  durationMin: number | null;
  players: ScoredPlacement[];
}

export interface ReplayStep {
  sessionId: number;
  before: StandingRow[];
  after: StandingRow[];
}

export interface HistoryPoint {
  sessionId: number;
  finishedAt: number;
  rank: number | null;
  counted: number;
}

export interface Replay {
  results: ReplayResult[];
  steps: ReplayStep[];
  standings: StandingRow[];
  byPlayer: Map<number, PlayerResult[]>;
  rankHistory: Map<number, HistoryPoint[]>;
  trends: Map<number, number | null>;
  unlocks: Unlock[];
}

export interface ReplayInput {
  players: PlayerFact[];
  games: GameFact[];
  sessions: SessionFact[];
  disabledAchievements?: string[];
}

export function isCompleteResult(session: SessionFact): boolean {
  return (
    session.status === "done" &&
    session.finishedAt !== null &&
    session.players.length >= 2 &&
    session.players.every((p) => p.placement !== null)
  );
}

export function durationMinutes(session: SessionFact): number | null {
  if (session.startedAt === null || session.finishedAt === null) return null;
  if (session.finishedAt <= session.startedAt) return null;
  return Math.round((session.finishedAt - session.startedAt) / 60_000);
}

function totalsOf(player: PlayerFact, results: PlayerResult[], settings: ScoringSettings): PlayerTotals {
  const selection = selectCounted(
    results.map((r) => ({ sessionId: r.sessionId, points: r.points, finishedAt: r.finishedAt })),
    settings.strategy,
    settings.bestN,
  );
  return {
    playerId: player.id,
    name: player.name,
    raw: results.reduce((sum, r) => sum + r.points, 0),
    counted: selection.counted,
    wins: results.filter((r) => r.placement === 1).length,
    podiums: results.filter((r) => r.placement <= 3).length,
    gamesPlayed: results.length,
    countedSessionIds: selection.countedIds,
    excludedSessionIds: selection.excludedIds,
  };
}

const rankOf = (rows: StandingRow[], playerId: number) =>
  rows.find((r) => r.playerId === playerId)?.rank ?? null;

export function replay(input: ReplayInput, settings: ScoringSettings): Replay {
  const gamesById = new Map(input.games.map((g) => [g.id, g]));
  const done = input.sessions
    .filter(isCompleteResult)
    .filter((s) => gamesById.has(s.gameId))
    .sort((a, b) => a.finishedAt! - b.finishedAt! || a.id - b.id);

  const participants = new Set(done.flatMap((s) => s.players.map((p) => p.playerId)));
  const universe = input.players.filter((p) => p.active || participants.has(p.id));
  const byPlayer = new Map<number, PlayerResult[]>(universe.map((p) => [p.id, []]));
  const rankHistory = new Map<number, HistoryPoint[]>(universe.map((p) => [p.id, []]));
  const lastStepIndex = new Map<number, number>();

  const computeStandings = () =>
    rankStandings(universe.map((p) => totalsOf(p, byPlayer.get(p.id) ?? [], settings)));

  const results: ReplayResult[] = [];
  const steps: ReplayStep[] = [];
  let current = computeStandings();

  for (const session of done) {
    const game = gamesById.get(session.gameId)!;
    let scored: ScoredPlacement[];
    try {
      scored = scoreResult(
        game.weight,
        session.players.map((p) => ({
          playerId: p.playerId,
          placement: p.placement!,
          jokerDeclared: p.jokerDeclared,
        })),
        settings,
      );
    } catch (error) {
      // A single malformed stored result (bad manual edit, a prior data bug, ...)
      // must not crash every consumer of replay(); skip it and keep going.
      console.error(`replay: skipping malformed result for session ${session.id}`, error);
      continue;
    }
    const finishedAt = session.finishedAt!;
    const durationMin = durationMinutes(session);
    results.push({
      sessionId: session.id,
      gameId: session.gameId,
      tableId: session.tableId,
      startedAt: session.startedAt,
      finishedAt,
      durationMin,
      players: scored,
    });

    const lowest = Math.max(...scored.map((s) => s.placement));
    for (const s of scored) {
      byPlayer.get(s.playerId)?.push({
        sessionId: session.id,
        gameId: session.gameId,
        family: game.family,
        tableId: session.tableId,
        finishedAt,
        durationMin,
        placement: s.placement,
        playerCount: scored.length,
        opponents: scored.filter((o) => o.playerId !== s.playerId).map((o) => o.playerId),
        last: lowest > 1 && s.placement === lowest,
        base: s.base,
        points: s.points,
        jokerDeclared: s.jokerDeclared,
      });
    }

    const before = current;
    current = computeStandings();
    steps.push({ sessionId: session.id, before, after: current });

    for (const s of scored) {
      const history = rankHistory.get(s.playerId);
      if (!history) continue;
      const row = current.find((r) => r.playerId === s.playerId)!;
      history.push({ sessionId: session.id, finishedAt, rank: row.rank, counted: row.counted });
      lastStepIndex.set(s.playerId, steps.length - 1);
    }
  }

  const trends = new Map<number, number | null>();
  for (const player of universe) {
    const index = lastStepIndex.get(player.id);
    if (index === undefined) {
      trends.set(player.id, null);
      continue;
    }
    const before = rankOf(steps[index].before, player.id);
    const now = rankOf(current, player.id);
    trends.set(player.id, before === null || now === null ? null : before - now);
  }

  const unlocks = computeUnlocks({ results, steps, byPlayer }, gamesById, new Set(input.disabledAchievements ?? []));
  return { results, steps, standings: current, byPlayer, rankHistory, trends, unlocks };
}
