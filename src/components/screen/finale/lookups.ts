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

/** Tailwind font-size class for a big stat value, shrunk by character count so it never crowds its column's divider. */
export function statFontSizeClass(text: string): string {
  if (text.length <= 3) return "text-[260px]";
  if (text.length === 4) return "text-[200px]";
  return "text-[150px]";
}
