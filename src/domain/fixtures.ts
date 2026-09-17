import {
  DEFAULT_SCENES,
  type EventFact,
  type GameFact,
  type PlayerFact,
  type ScoringSettings,
  type SessionFact,
  type TableFact,
} from "./types";

export function makePlayer(id: number, name: string, overrides: Partial<PlayerFact> = {}): PlayerFact {
  return {
    id,
    name,
    nickname: null,
    color: "#8b8b90",
    source: "admin",
    active: true,
    isDemo: false,
    createdAt: 0,
    ...overrides,
  };
}

export function makeGame(id: number, weight: number, overrides: Partial<GameFact> = {}): GameFact {
  return {
    id,
    slug: `game-${id}`,
    name: `Game ${id}`,
    family: `game-${id}`,
    descriptionEn: "",
    descriptionRu: "",
    icon: "Dices",
    category: "strategy",
    durationMin: 30,
    weight,
    minPlayers: 2,
    maxPlayers: 8,
    allowTies: false,
    active: true,
    ...overrides,
  };
}

/** placements: [playerId, placement, jokerDeclared?] */
export function makeDoneSession(
  id: number,
  gameId: number,
  finishedAt: number,
  placements: Array<[number, number, boolean?]>,
  overrides: Partial<SessionFact> = {},
): SessionFact {
  return {
    id,
    tableId: 1,
    gameId,
    status: "done",
    createdAt: finishedAt - 1000,
    startedAt: finishedAt - 30 * 60_000,
    finishedAt,
    notes: null,
    isDemo: false,
    players: placements.map(([playerId, placement, joker], seat) => ({
      playerId,
      seat,
      placement,
      jokerDeclared: joker ?? false,
    })),
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<ScoringSettings> = {}): ScoringSettings {
  return { strategy: "total", bestN: 4, participationFloor: 0, jokerMultiplier: 1.5, ...overrides };
}


export function makeEvent(overrides: Partial<EventFact> = {}): EventFact {
  return {
    name: "Board Games Cup",
    city: "Warsaw",
    year: 2026,
    status: "live",
    startedAt: 0,
    finishedAt: null,
    finaleRevealed: false,
    scoring: makeSettings({ strategy: "bestN", participationFloor: 0.2 }),
    sceneDurationSec: 12,
    enabledScenes: [...DEFAULT_SCENES],
    showPointsInReveals: false,
    screenLang: "en",
    accentColor: "#c9a45c",
    publicBaseUrl: null,
    brandFields: { brandTopEn: null, brandMainEn: null, brandTopRu: null, brandMainRu: null },
    screenControl: { paused: false, skipNonce: 0, finaleStep: 0 },
    showFollowLink: true,
    showFollowQr: true,
    followText: null,
    showTicker: true,
    showAchievementCards: true,
    showPodium: true,
    achievementOrder: "recent",
    finaleShowcaseRarities: [],
    dataVersion: 1,
    ...overrides,
  };
}

export function makeTable(id: number, number = id, overrides: Partial<TableFact> = {}): TableFact {
  return { id, number, label: null, active: true, ...overrides };
}

/** Keys the public audience must never receive before the finale reveal. */
export const FORBIDDEN_PUBLIC_KEYS = [
  "points",
  "base",
  "rank",
  "counted",
  "raw",
  "jokerDeclared",
  "jokerUsed",
  "gamesPlayed",
  "wins",
  "podiums",
  "trend",
  "countedSessionIds",
  "excludedSessionIds",
];

export function keysDeep(value: unknown, path = "$"): Array<[string, string]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysDeep(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [[k, `${path}.${k}`] as [string, string], ...keysDeep(v, `${path}.${k}`)]);
  }
  return [];
}

/** players: [playerId, jokerDeclared?] */
export function makeOpenSession(
  id: number,
  tableId: number,
  gameId: number,
  status: "setup" | "playing" | "pending",
  players: Array<[number, boolean?]>,
  startedAt: number | null = 1000,
): SessionFact {
  return {
    id,
    tableId,
    gameId,
    status,
    createdAt: 500,
    startedAt: status === "setup" ? null : startedAt,
    finishedAt: status === "pending" ? (startedAt ?? 0) + 60_000 : null,
    notes: null,
    isDemo: false,
    players: players.map(([playerId, joker], seat) => ({
      playerId,
      seat,
      jokerDeclared: joker ?? false,
      placement: null,
    })),
  };
}
