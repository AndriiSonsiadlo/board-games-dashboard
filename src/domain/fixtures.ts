import type { GameFact, PlayerFact, ScoringSettings, SessionFact } from "./types";

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
