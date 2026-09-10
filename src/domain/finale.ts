import { achievementDef, type Unlock } from "./achievements";
import type { Replay } from "./replay";
import type { PlayerView } from "./snapshot";
import { pointsEqual, type StandingRow } from "./standings";
import { busiestTable, longestResult, mostPlayedGame, rivals, type GameCount, type LongestResult, type RivalPair, type TableCount } from "./stats";
import type { Facts, GameFact } from "./types";

export interface PodiumRow {
  playerId: number;
  rank: number;
  counted: number;
  wins: number;
  gamesPlayed: number;
}

export type FinaleBeat =
  | { kind: "complete"; games: number; minutes: number | null; players: number }
  | { kind: "numbers"; mostPlayed: GameCount | null; longest: LongestResult | null; busiestTable: TableCount | null; rivals: RivalPair | null }
  | { kind: "sealed"; unlock: Unlock; order: number; total: number }
  | { kind: "place"; place: number; playerId: number }
  | { kind: "champion"; playerIds: number[]; co: boolean }
  | { kind: "podium"; championIds: number[]; rows: PodiumRow[] }
  | { kind: "closing"; championIds: number[] };

export const TOP_ROWS = 10;

export function podiumGroups(standings: StandingRow[]): {
  champions: StandingRow[];
  second: StandingRow | null;
  third: StandingRow | null;
} {
  const ranked = standings.filter((r) => r.rank !== null);
  const [first, runnerUp] = ranked;
  if (!first) return { champions: [], second: null, third: null };
  const co =
    runnerUp !== undefined &&
    pointsEqual(first.counted, runnerUp.counted) &&
    first.wins === runnerUp.wins &&
    pointsEqual(first.raw, runnerUp.raw);
  const champions = co ? [first, runnerUp] : [first];
  const rest = ranked.slice(champions.length);
  return { champions, second: rest[0] ?? null, third: rest[1] ?? null };
}

export function buildFinaleScript(facts: Facts, rp: Replay): FinaleBeat[] {
  const { startedAt, finishedAt } = facts.event;
  const ranked = rp.standings.filter((r) => r.rank !== null);
  const beats: FinaleBeat[] = [
    {
      kind: "complete",
      games: rp.results.length,
      minutes: startedAt !== null && finishedAt !== null ? Math.round((finishedAt - startedAt) / 60_000) : null,
      players: ranked.length,
    },
    {
      kind: "numbers",
      mostPlayed: mostPlayedGame(rp.results),
      longest: longestResult(rp.results),
      busiestTable: busiestTable(rp.results),
      rivals: rivals(rp.results),
    },
  ];

  const sealed = rp.unlocks.filter((u) => achievementDef(u.achievementId).sealed);
  sealed.forEach((unlock, i) => beats.push({ kind: "sealed", unlock, order: i + 1, total: sealed.length }));

  const groups = podiumGroups(rp.standings);
  const firstPlaceAfterChampions = groups.champions.length + 1;
  if (groups.third) beats.push({ kind: "place", place: firstPlaceAfterChampions + 1, playerId: groups.third.playerId });
  if (groups.second) beats.push({ kind: "place", place: firstPlaceAfterChampions, playerId: groups.second.playerId });

  const championIds = groups.champions.map((r) => r.playerId);
  if (championIds.length > 0) beats.push({ kind: "champion", playerIds: championIds, co: championIds.length > 1 });
  beats.push({
    kind: "podium",
    championIds,
    rows: ranked.slice(0, TOP_ROWS).map((r) => ({
      playerId: r.playerId,
      rank: r.rank!,
      counted: r.counted,
      wins: r.wins,
      gamesPlayed: r.gamesPlayed,
    })),
  });
  beats.push({ kind: "closing", championIds });
  return beats;
}

/** 1-based step of the beat that makes standings public. */
export function revealStepOf(beats: FinaleBeat[]): number {
  return beats.findIndex((b) => b.kind === "podium") + 1;
}

export function clampStep(step: number, beats: FinaleBeat[]): number {
  return Math.max(0, Math.min(step, beats.length));
}

export interface RehearsalData {
  beats: FinaleBeat[];
  players: PlayerView[];
  games: GameFact[];
  tables: { id: number; number: number }[];
  city: string;
  year: number;
}

const REHEARSAL_NAMES = ["Player A", "Player B", "Player C", "Player D", "Player E", "Player F", "Player G", "Player H", "Player I", "Player J", "Player K", "Player L"];

/** Placeholder ceremony for `/screen?rehearsal=1`. Reads no real state. */
export function buildRehearsal(): RehearsalData {
  const players: PlayerView[] = REHEARSAL_NAMES.map((name, i) => ({ id: i + 1, name, nickname: null, color: "#8b8b90" }));
  const game = (id: number, name: string, icon: string): GameFact => ({
    id,
    slug: `rehearsal-${id}`,
    name,
    family: `rehearsal-${id}`,
    descriptionEn: "",
    descriptionRu: "",
    icon,
    category: "rehearsal",
    durationMin: 60,
    weight: 10,
    minPlayers: 2,
    maxPlayers: 6,
    allowTies: false,
    active: true,
  });
  const rows: PodiumRow[] = players.slice(0, TOP_ROWS).map((p, i) => ({
    playerId: p.id,
    rank: i + 1,
    counted: 48 - i * 3.4,
    wins: Math.max(0, 4 - Math.floor(i / 2)),
    gamesPlayed: 5,
  }));
  const at = 0;
  return {
    players,
    games: [game(1, "Catan", "Hexagon"), game(2, "Ticket to Ride", "TrainFront")],
    tables: [{ id: 1, number: 3 }],
    city: "Warsaw",
    year: 2026,
    beats: [
      { kind: "complete", games: 42, minutes: 245, players: 22 },
      {
        kind: "numbers",
        mostPlayed: { gameId: 2, count: 9 },
        longest: { sessionId: 1, gameId: 1, tableId: 1, durationMin: 112 },
        busiestTable: { tableId: 1, count: 11 },
        rivals: { playerIds: [4, 7], count: 5 },
      },
      { kind: "sealed", unlock: { achievementId: "giant-slayer", playerId: 6, sessionId: 1, at }, order: 1, total: 2 },
      { kind: "sealed", unlock: { achievementId: "joker-master", playerId: 3, sessionId: 1, at }, order: 2, total: 2 },
      { kind: "place", place: 3, playerId: 3 },
      { kind: "place", place: 2, playerId: 2 },
      { kind: "champion", playerIds: [1], co: false },
      { kind: "podium", championIds: [1], rows },
      { kind: "closing", championIds: [1] },
    ],
  };
}
