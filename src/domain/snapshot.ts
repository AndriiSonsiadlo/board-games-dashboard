import { ACHIEVEMENTS, isAchievementId, isSealed, type AchievementId, type Unlock } from "./achievements";
import { resolveBrand, type Brand, type BrandFields } from "./brand";
import { buildFinaleScript, clampStep, revealStepOf, type FinaleBeat } from "./finale";
import type { Replay, ReplayResult } from "./replay";
import type { StandingRow } from "./standings";
import { buildFinaleStats, buildPublicStats, hotStreaks, type FinaleStats, type PublicStats, type Streak } from "./stats";
import { buildStories, type Story } from "./stories";
import { isOpenSession, tableState, type TableState } from "./tables";
import { buildTimeline, type TimelineItem } from "./timeline";
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
  brand: Brand;
  screenControl: ScreenControl;
}

export interface AdminEventView extends PublicEventView {
  scoring: ScoringSettings;
  brandFields: BrandFields;
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
  achievementsUnlocked: number;
}

export interface AchievementsView {
  enabled: AchievementId[];
  sealed: AchievementId[];
  /** Newest first. */
  unlocks: Unlock[];
  sealedUnlockCount: number;
  /** Players with at least one result; the denominator for rarity. */
  eligiblePlayers: number;
}

export interface FinaleView {
  step: number;
  total: number;
  current: FinaleBeat | null;
}

export interface AdminFinaleView extends FinaleView {
  beats: FinaleBeat[];
  revealStep: number;
}

export type ScreenAnnouncement =
  | { id: number; createdAt: number; type: "result_reveal"; result: ResultView<PublicPlacementView> }
  | { id: number; createdAt: number; type: "milestone"; count: number }
  | { id: number; createdAt: number; type: "achievement"; achievementId: AchievementId; playerId: number; sessionId: number };

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
  achievements: AchievementsView;
  finale: FinaleView | null;
  contenders: number[] | null;
  leaderboard: LeaderboardRow[] | null;
  stats: PublicStats;
  /** Only after the finale reveal. */
  finaleStats: FinaleStats | null;
  streaks: Streak[];
  stories: Story[];
  /** Newest first. */
  timeline: TimelineItem[];
}

export interface AdminSnapshot {
  audience: "admin";
  version: number;
  event: AdminEventView;
  players: AdminPlayerView[];
  games: GameFact[];
  playedGameIds: number[];
  allTables: TableFact[];
  tables: TableView<AdminSeatView>[];
  results: ResultView<ScoredPlacementView>[];
  counters: Counters;
  announcements: ScreenAnnouncement[];
  achievements: AchievementsView;
  finale: AdminFinaleView | null;
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
    brand: resolveBrand(e.brandFields),
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
    achievementsUnlocked: rp.unlocks.length,
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

function announcements(
  facts: Facts,
  rp: Replay,
  now: number,
  opts: { withPoints: boolean; includeSealed: boolean },
): ScreenAnnouncement[] {
  const results = new Map(rp.results.map((r) => [r.sessionId, r]));
  const unlocked = new Set(rp.unlocks.map((u) => `${u.achievementId}:${u.playerId}`));
  return facts.announcements
    .filter((a) => a.createdAt >= now - ANNOUNCEMENT_WINDOW_MS)
    .sort((a, b) => a.id - b.id)
    .flatMap((a): ScreenAnnouncement[] => {
      if (a.type === "milestone") {
        return [{ id: a.id, createdAt: a.createdAt, type: "milestone", count: a.payload.count }];
      }
      if (a.type === "achievement") {
        const { achievementId, playerId, sessionId } = a.payload;
        if (!isAchievementId(achievementId)) return [];
        if (isSealed(achievementId, facts.sealedOverrides) && !opts.includeSealed) return [];
        if (!unlocked.has(`${achievementId}:${playerId}`)) return [];
        return [{ id: a.id, createdAt: a.createdAt, type: "achievement", achievementId, playerId, sessionId }];
      }
      const result = results.get(a.payload.sessionId);
      return result
        ? [{ id: a.id, createdAt: a.createdAt, type: "result_reveal", result: publicResult(result, opts.withPoints) }]
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

function achievementsView(facts: Facts, rp: Replay, includeSealed: boolean): AchievementsView {
  const disabled = new Set(facts.disabledAchievements);
  const sealed = (u: Unlock) => isSealed(u.achievementId, facts.sealedOverrides);
  return {
    enabled: ACHIEVEMENTS.filter((d) => !disabled.has(d.id)).map((d) => d.id),
    sealed: ACHIEVEMENTS.filter((d) => isSealed(d.id, facts.sealedOverrides)).map((d) => d.id),
    unlocks: rp.unlocks
      .filter((u) => includeSealed || !sealed(u))
      .map((u, i) => ({ u, i }))
      .sort((a, b) => b.u.at - a.u.at || b.i - a.i)
      .map(({ u }) => u),
    sealedUnlockCount: rp.unlocks.filter(sealed).length,
    eligiblePlayers: rp.standings.filter((r) => r.rank !== null).length,
  };
}

function finaleScript(facts: Facts, rp: Replay): FinaleBeat[] | null {
  return facts.event.status === "finished" ? buildFinaleScript(facts, rp) : null;
}

function finaleView(beats: FinaleBeat[], requested: number): FinaleView {
  const step = clampStep(requested, beats);
  return { step, total: beats.length, current: step > 0 ? beats[step - 1] : null };
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
  const script = finaleScript(facts, rp);
  const finaleStep = facts.event.screenControl.finaleStep;
  const achievements = achievementsView(facts, rp, revealed);
  const stats = buildPublicStats(facts, rp);
  const streaks = hotStreaks(rp.byPlayer);

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
    announcements: announcements(facts, rp, now, {
      withPoints: revealed || facts.event.showPointsInReveals,
      includeSealed: revealed,
    }),
    achievements,
    finale: script && finaleStep > 0 ? finaleView(script, finaleStep) : null,
    contenders,
    leaderboard: revealed ? leaderboard(facts, rp) : null,
    stats,
    finaleStats: revealed ? buildFinaleStats(rp) : null,
    streaks,
    stories: buildStories({ streaks, stats, unlocks: achievements.unlocks }),
    timeline: buildTimeline(facts, rp, { includeSealed: revealed }),
  };
}

export function buildAdminSnapshot(facts: Facts, rp: Replay, now: number): AdminSnapshot {
  const jokers = jokerUsers(facts.sessions);
  const tables = buildTables<AdminSeatView>(facts, (p) => ({
    playerId: p.playerId,
    seat: p.seat,
    jokerDeclared: p.jokerDeclared,
  }));
  const script = finaleScript(facts, rp);
  return {
    audience: "admin",
    version: facts.event.dataVersion,
    event: { ...eventView(facts.event), scoring: facts.event.scoring, brandFields: facts.event.brandFields },
    players: facts.players.map((p) => ({
      ...playerView(p),
      source: p.source,
      active: p.active,
      isDemo: p.isDemo,
      jokerUsed: jokers.has(p.id),
      createdAt: p.createdAt,
    })),
    games: facts.games,
    playedGameIds: [...new Set(facts.sessions.map((s) => s.gameId))].sort((a, b) => a - b),
    allTables: [...facts.tables].sort((a, b) => a.number - b.number),
    tables,
    results: [...rp.results].reverse().map(adminResult),
    counters: counters(facts, rp, tables),
    announcements: announcements(facts, rp, now, { withPoints: true, includeSealed: true }),
    achievements: achievementsView(facts, rp, true),
    finale: script
      ? { ...finaleView(script, facts.event.screenControl.finaleStep), beats: script, revealStep: revealStepOf(script) }
      : null,
    leaderboard: leaderboard(facts, rp),
  };
}
