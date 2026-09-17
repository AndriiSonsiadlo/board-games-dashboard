import type { PlayerResult, ReplayResult, ReplayStep } from "./replay";
import type { StandingRow } from "./standings";
import type { GameFact } from "./types";

export const ACHIEVEMENT_IDS = [
  "catan-lord",
  "rail-baron",
  "gem-master",
  "music-master",
  "wonder-architect",
  "kingmaker",
  "rat-king",
  "last-card",
  "opening-move",
  "back-to-back",
  "hot-streak",
  "triple-threat",
  "phoenix",
  "all-rounder",
  "table-hopper",
  "social-butterfly",
  "marathon",
  "comeback",
  "underdog",
  "giant-slayer",
  "joker-master",
  "risk-taker",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];
export type Rarity = "legendary" | "epic" | "rare" | "common";

export interface ResultContext {
  /** 0-based position of this result among all results of the event. */
  index: number;
  result: ReplayResult;
  game: GameFact;
  before: StandingRow[];
  after: StandingRow[];
  /** A player's results up to and including this one, chronological. */
  historyOf: (playerId: number) => PlayerResult[];
}

export interface AchievementDef {
  id: AchievementId;
  /** lucide-react component name, rendered by components/common/AchievementIcon. */
  icon: string;
  sealed: boolean;
  check: (ctx: ResultContext, playerId: number) => boolean;
  progress?: (history: PlayerResult[]) => { current: number; target: number };
}

export interface Unlock {
  achievementId: AchievementId;
  playerId: number;
  sessionId: number;
  at: number;
}

const EPSILON = 1e-6;

const placementOf = (ctx: ResultContext, playerId: number) =>
  ctx.result.players.find((p) => p.playerId === playerId);
const won = (ctx: ResultContext, playerId: number) => placementOf(ctx, playerId)?.placement === 1;
const rankIn = (rows: StandingRow[], playerId: number) => rows.find((r) => r.playerId === playerId)?.rank ?? null;
const countedIn = (rows: StandingRow[], playerId: number) => rows.find((r) => r.playerId === playerId)?.counted ?? 0;

function winStreak(history: PlayerResult[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].placement === 1; i--) n++;
  return n;
}

function winGame(id: AchievementId, icon: string, family: string): AchievementDef {
  return { id, icon, sealed: false, check: (ctx, p) => won(ctx, p) && ctx.game.family === family };
}

function counter(
  id: AchievementId,
  icon: string,
  target: number,
  measure: (history: PlayerResult[]) => number,
): AchievementDef {
  return {
    id,
    icon,
    sealed: false,
    check: (ctx, p) => measure(ctx.historyOf(p)) >= target,
    progress: (history) => ({ current: Math.min(measure(history), target), target }),
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  winGame("catan-lord", "Hexagon", "catan"),
  winGame("rail-baron", "TrainFront", "ticket-to-ride"),
  winGame("gem-master", "Gem", "splendor"),
  winGame("music-master", "Music", "hitster"),
  winGame("wonder-architect", "Landmark", "seven-wonders"),
  winGame("kingmaker", "Castle", "citadels"),
  winGame("rat-king", "Rat", "rats-race"),
  winGame("last-card", "Layers", "uno"),
  { id: "opening-move", icon: "Flag", sealed: false, check: (ctx, p) => ctx.index === 0 && won(ctx, p) },
  { id: "back-to-back", icon: "Repeat", sealed: false, check: (ctx, p) => winStreak(ctx.historyOf(p)) >= 2 },
  { id: "hot-streak", icon: "Flame", sealed: false, check: (ctx, p) => winStreak(ctx.historyOf(p)) >= 3 },
  counter("triple-threat", "Trophy", 3, (h) => new Set(h.filter((r) => r.placement === 1).map((r) => r.family)).size),
  {
    id: "phoenix",
    icon: "Bird",
    sealed: false,
    check: (ctx, p) => {
      const h = ctx.historyOf(p);
      return h.length >= 2 && h[h.length - 1].placement === 1 && h[h.length - 2].last;
    },
  },
  counter("all-rounder", "Shapes", 5, (h) => new Set(h.map((r) => r.family)).size),
  counter("table-hopper", "Armchair", 4, (h) => new Set(h.flatMap((r) => (r.tableId === null ? [] : [r.tableId]))).size),
  counter("social-butterfly", "Users", 8, (h) => new Set(h.flatMap((r) => r.opponents)).size),
  counter("marathon", "Timer", 180, (h) => h.reduce((sum, r) => sum + (r.durationMin ?? 0), 0)),
  {
    id: "comeback",
    icon: "TrendingUp",
    sealed: true,
    check: (ctx, p) => {
      if (ctx.index < 9) return false;
      const before = rankIn(ctx.before, p);
      const after = rankIn(ctx.after, p);
      return before !== null && after !== null && before - after >= 3;
    },
  },
  {
    id: "underdog",
    icon: "Sprout",
    sealed: true,
    check: (ctx, p) => {
      if (!won(ctx, p)) return false;
      const mine = countedIn(ctx.before, p);
      const others = ctx.result.players.filter((x) => x.playerId !== p);
      return others.length > 0 && others.every((x) => countedIn(ctx.before, x.playerId) - mine > EPSILON);
    },
  },
  {
    id: "giant-slayer",
    icon: "Swords",
    sealed: true,
    check: (ctx, p) => {
      const leader = ctx.before.find((r) => r.rank === 1);
      if (!leader || leader.playerId === p) return false;
      const leaderPlace = placementOf(ctx, leader.playerId)?.placement;
      const myPlace = placementOf(ctx, p)?.placement;
      return leaderPlace !== undefined && myPlace !== undefined && myPlace < leaderPlace;
    },
  },
  {
    id: "joker-master",
    icon: "Spade",
    sealed: true,
    check: (ctx, p) => won(ctx, p) && Boolean(placementOf(ctx, p)?.jokerDeclared),
  },
  {
    id: "risk-taker",
    icon: "Zap",
    sealed: true,
    check: (ctx, p) => Boolean(placementOf(ctx, p)?.jokerDeclared) && ctx.result.players.length >= 5,
  },
];

const byId = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));

export function achievementDef(id: AchievementId): AchievementDef {
  return byId.get(id)!;
}

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === "string" && byId.has(value as AchievementId);
}

/** The admin's per-achievement choice wins over the built-in default. */
export function isSealed(id: AchievementId, overrides: Readonly<Record<string, boolean>>): boolean {
  return overrides[id] ?? achievementDef(id).sealed;
}

export const unlockKey = (u: Pick<Unlock, "achievementId" | "playerId">) => `${u.achievementId}:${u.playerId}`;

/** Walks the replay in order; the first result where a check passes records the unlock. */
export function computeUnlocks(
  input: { results: ReplayResult[]; steps: ReplayStep[]; byPlayer: Map<number, PlayerResult[]> },
  gamesById: Map<number, GameFact>,
  disabled: ReadonlySet<string>,
): Unlock[] {
  const defs = ACHIEVEMENTS.filter((d) => !disabled.has(d.id));
  const seen = new Set<string>();
  const consumed = new Map<number, number>();
  const unlocks: Unlock[] = [];

  input.results.forEach((result, index) => {
    for (const p of result.players) consumed.set(p.playerId, (consumed.get(p.playerId) ?? 0) + 1);
    const game = gamesById.get(result.gameId);
    const step = input.steps[index];
    if (!game || !step) return;
    const ctx: ResultContext = {
      index,
      result,
      game,
      before: step.before,
      after: step.after,
      historyOf: (playerId) => (input.byPlayer.get(playerId) ?? []).slice(0, consumed.get(playerId) ?? 0),
    };
    for (const p of result.players) {
      for (const def of defs) {
        const key = unlockKey({ achievementId: def.id, playerId: p.playerId });
        if (seen.has(key) || !def.check(ctx, p.playerId)) continue;
        seen.add(key);
        unlocks.push({ achievementId: def.id, playerId: p.playerId, sessionId: result.sessionId, at: result.finishedAt });
      }
    }
  });
  return unlocks;
}

/** Legendary < 5% or unique, Epic 5-15%, Rare 15-40%, Common > 40%. */
export function rarityOf(count: number, eligiblePlayers: number): Rarity | null {
  if (count <= 0 || eligiblePlayers <= 0) return null;
  const share = count / eligiblePlayers;
  if (count === 1 || share < 0.05) return "legendary";
  if (share < 0.15) return "epic";
  if (share <= 0.4) return "rare";
  return "common";
}

export function newUnlocks(before: Unlock[], after: Unlock[]): Unlock[] {
  const known = new Set(before.map(unlockKey));
  return after.filter((u) => !known.has(unlockKey(u)));
}

export type AchievementVisibility = "full" | "titleOnly";

/** Sealed achievements show title, icon and holders during the event; the description waits for the finale reveal. */
export function achievementVisibility(sealed: boolean, revealed: boolean): AchievementVisibility {
  return sealed && !revealed ? "titleOnly" : "full";
}
