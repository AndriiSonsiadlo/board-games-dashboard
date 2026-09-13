import type { RehearsalData } from "@/domain/finale";
import type { PlayerView, PublicSnapshot } from "@/domain/snapshot";
import type { GameFact } from "@/domain/types";

export interface FinaleLookups {
  players: Map<number, PlayerView>;
  games: Map<number, GameFact>;
  tables: Map<number, { number: number }>;
}

export function lookupsFromSnapshot(s: PublicSnapshot): FinaleLookups {
  return {
    players: new Map(s.players.map((p) => [p.id, p])),
    games: new Map(s.games.map((g) => [g.id, g])),
    tables: new Map(s.tables.map((t) => [t.tableId, { number: t.number }])),
  };
}

export function lookupsFromRehearsal(r: RehearsalData): FinaleLookups {
  return {
    players: new Map(r.players.map((p) => [p.id, p])),
    games: new Map(r.games.map((g) => [g.id, g])),
    tables: new Map(r.tables.map((t) => [t.id, { number: t.number }])),
  };
}

export function formatHours(minutes: number | null): string {
  if (minutes === null) return "--";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
