import type { Replay, ReplayResult } from "./replay";
import type { StandingRow } from "./standings";
import { isOpenSession, tableState, type TableState } from "./tables";
import type {
  EventFact,
  EventStatus,
  Facts,
  GameFact,
  Lang,
  PlayerFact,
  PlayerSource,
  SceneId,
  ScoringSettings,
  ScreenControl,
  SessionFact,
  SessionPlayerFact,
  SessionStatus,
  TableFact,
} from "./types";

export const ANNOUNCEMENT_WINDOW_MS = 120_000;
export const RECENT_RESULTS_LIMIT = 20;

export interface PublicEventView {
  name: string;
  city: string;
  year: number;
  status: EventStatus;
  startedAt: number | null;
  finishedAt: number | null;
  finaleRevealed: boolean;
  sceneDurationSec: number;
  enabledScenes: SceneId[];
  showPointsInReveals: boolean;
  screenLang: Lang;
  accentColor: string;
  publicBaseUrl: string | null;
  screenControl: ScreenControl;
}

export interface AdminEventView extends PublicEventView {
  scoring: ScoringSettings;
}

export interface PlayerView {
  id: number;
  name: string;
  nickname: string | null;
  color: string;
}

export interface AdminPlayerView extends PlayerView {
  source: PlayerSource;
  active: boolean;
  isDemo: boolean;
  jokerUsed: boolean;
  createdAt: number;
}

export interface SeatView {
  playerId: number;
  seat: number;
}

export interface AdminSeatView extends SeatView {
  jokerDeclared: boolean;
}

export interface TableSessionView<S> {
  id: number;
  gameId: number;
  status: SessionStatus;
  startedAt: number | null;
  finishedAt: number | null;
  notes: string | null;
  players: S[];
}

export interface TableView<S> {
  tableId: number;
  number: number;
  label: string | null;
  state: TableState;
  session: TableSessionView<S> | null;
}

export interface PublicPlacementView {
  playerId: number;
  placement: number;
  points?: number;
}

export interface ScoredPlacementView {
  playerId: number;
  placement: number;
  base: number;
  points: number;
  jokerDeclared: boolean;
}

export interface ResultView<P> {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  startedAt: number | null;
  finishedAt: number;
  durationMin: number | null;
  placements: P[];
}

export interface LeaderboardRow extends StandingRow {
  trend: number | null;
  jokerUsed: boolean;
}

export interface Counters {
  gamesCompleted: number;
  tablesActive: number;
  players: number;
}

export type ScreenAnnouncement =
  | { id: number; createdAt: number; type: "result_reveal"; result: ResultView<PublicPlacementView> }
  | { id: number; createdAt: number; type: "milestone"; count: number };

export interface PublicSnapshot {
  audience: "public";
  version: number;
  event: PublicEventView;
  players: PlayerView[];
  games: GameFact[];
  tables: TableView<SeatView>[];
  recentResults: ResultView<PublicPlacementView>[];
  counters: Counters;
  announcements: ScreenAnnouncement[];
  contenders: number[] | null;
  leaderboard: LeaderboardRow[] | null;
}

export interface AdminSnapshot {
  audience: "admin";
  version: number;
  event: AdminEventView;
  players: AdminPlayerView[];
  games: GameFact[];
  allTables: TableFact[];
  tables: TableView<AdminSeatView>[];
  results: ResultView<ScoredPlacementView>[];
  counters: Counters;
  announcements: ScreenAnnouncement[];
  leaderboard: LeaderboardRow[];
}

export type Snapshot = PublicSnapshot | AdminSnapshot;

function eventView(e: EventFact): PublicEventView {
  return {
    name: e.name,
    city: e.city,
    year: e.year,
    status: e.status,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    finaleRevealed: e.finaleRevealed,
    sceneDurationSec: e.sceneDurationSec,
    enabledScenes: e.enabledScenes,
    showPointsInReveals: e.showPointsInReveals,
    screenLang: e.screenLang,
    accentColor: e.accentColor,
    publicBaseUrl: e.publicBaseUrl,
    screenControl: e.screenControl,
  };
}

const playerView = (p: PlayerFact): PlayerView => ({
  id: p.id,
  name: p.name,
  nickname: p.nickname,
  color: p.color,
});

export function jokerUsers(sessions: SessionFact[]): Set<number> {
  const ids = new Set<number>();
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    for (const p of s.players) if (p.jokerDeclared) ids.add(p.playerId);
  }
  return ids;
}

function buildTables<S>(facts: Facts, seat: (p: SessionPlayerFact) => S): TableView<S>[] {
  const openByTable = new Map<number, SessionFact>();
  for (const s of facts.sessions) {
    if (s.tableId === null || !isOpenSession(s)) continue;
    const existing = openByTable.get(s.tableId);
    if (!existing || s.createdAt > existing.createdAt) openByTable.set(s.tableId, s);
  }
  return facts.tables
    .filter((t) => t.active || openByTable.has(t.id))
    .sort((a, b) => a.number - b.number)
    .map((t) => {
      const s = openByTable.get(t.id);
      return {
        tableId: t.id,
        number: t.number,
        label: t.label,
        state: tableState(s?.status),
        session: s
          ? {
              id: s.id,
              gameId: s.gameId,
              status: s.status,
              startedAt: s.startedAt,
              finishedAt: s.finishedAt,
              notes: s.notes,
              players: [...s.players].sort((a, b) => a.seat - b.seat).map(seat),
            }
          : null,
      };
    });
}

function counters(facts: Facts, rp: Replay, tables: TableView<unknown>[]): Counters {
  return {
    gamesCompleted: rp.results.length,
    tablesActive: tables.filter((t) => t.state !== "available").length,
    players: facts.players.filter((p) => p.active).length,
  };
}

const byPlacement = (a: { placement: number; playerId: number }, b: { placement: number; playerId: number }) =>
  a.placement - b.placement || a.playerId - b.playerId;

function publicResult(r: ReplayResult, withPoints: boolean): ResultView<PublicPlacementView> {
  return {
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMin: r.durationMin,
    placements: [...r.players]
      .sort(byPlacement)
      .map((p) =>
        withPoints
          ? { playerId: p.playerId, placement: p.placement, points: p.points }
          : { playerId: p.playerId, placement: p.placement },
      ),
  };
}

function adminResult(r: ReplayResult): ResultView<ScoredPlacementView> {
  return {
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMin: r.durationMin,
    placements: [...r.players].sort(byPlacement).map((p) => ({
      playerId: p.playerId,
      placement: p.placement,
      base: p.base,
      points: p.points,
      jokerDeclared: p.jokerDeclared,
    })),
  };
}

function announcements(facts: Facts, rp: Replay, now: number, withPoints: boolean): ScreenAnnouncement[] {
  const results = new Map(rp.results.map((r) => [r.sessionId, r]));
  return facts.announcements
    .filter((a) => a.createdAt >= now - ANNOUNCEMENT_WINDOW_MS)
    .sort((a, b) => a.id - b.id)
    .flatMap((a): ScreenAnnouncement[] => {
      if (a.type === "achievement") return [];
      if (a.type === "milestone") {
        return [{ id: a.id, createdAt: a.createdAt, type: "milestone", count: a.payload.count }];
      }
      const result = results.get(a.payload.sessionId);
      return result
        ? [{ id: a.id, createdAt: a.createdAt, type: "result_reveal", result: publicResult(result, withPoints) }]
        : [];
    });
}

function leaderboard(facts: Facts, rp: Replay): LeaderboardRow[] {
  const jokers = jokerUsers(facts.sessions);
  return rp.standings.map((row) => ({
    ...row,
    trend: rp.trends.get(row.playerId) ?? null,
    jokerUsed: jokers.has(row.playerId),
  }));
}

export function buildPublicSnapshot(facts: Facts, rp: Replay, now: number): PublicSnapshot {
  const revealed = facts.event.finaleRevealed;
  const tables = buildTables<SeatView>(facts, (p) => ({ playerId: p.playerId, seat: p.seat }));
  const visibleIds = new Set<number>([
    ...rp.results.flatMap((r) => r.players.map((p) => p.playerId)),
    ...facts.sessions.filter(isOpenSession).flatMap((s) => s.players.map((p) => p.playerId)),
  ]);
  const names = new Map(facts.players.map((p) => [p.id, p.name]));
  const contenders = facts.event.enabledScenes.includes("contenders")
    ? rp.standings
        .filter((r) => r.rank !== null && r.rank <= 5)
        .map((r) => r.playerId)
        .sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""))
    : null;

  return {
    audience: "public",
    version: facts.event.dataVersion,
    event: eventView(facts.event),
    players: facts.players.filter((p) => p.active || visibleIds.has(p.id)).map(playerView),
    games: facts.games,
    tables,
    recentResults: [...rp.results]
      .reverse()
      .slice(0, RECENT_RESULTS_LIMIT)
      .map((r) => publicResult(r, revealed)),
    counters: counters(facts, rp, tables),
    announcements: announcements(facts, rp, now, revealed || facts.event.showPointsInReveals),
    contenders,
    leaderboard: revealed ? leaderboard(facts, rp) : null,
  };
}

export function buildAdminSnapshot(facts: Facts, rp: Replay, now: number): AdminSnapshot {
  const jokers = jokerUsers(facts.sessions);
  const tables = buildTables<AdminSeatView>(facts, (p) => ({
    playerId: p.playerId,
    seat: p.seat,
    jokerDeclared: p.jokerDeclared,
  }));
  return {
    audience: "admin",
    version: facts.event.dataVersion,
    event: { ...eventView(facts.event), scoring: facts.event.scoring },
    players: facts.players.map((p) => ({
      ...playerView(p),
      source: p.source,
      active: p.active,
      isDemo: p.isDemo,
      jokerUsed: jokers.has(p.id),
      createdAt: p.createdAt,
    })),
    games: facts.games,
    allTables: [...facts.tables].sort((a, b) => a.number - b.number),
    tables,
    results: [...rp.results].reverse().map(adminResult),
    counters: counters(facts, rp, tables),
    announcements: announcements(facts, rp, now, true),
    leaderboard: leaderboard(facts, rp),
  };
}
