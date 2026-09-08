import { normalizeName } from "@/domain/players";
import type { AdminPlayerView, TableView } from "@/domain/snapshot";
import type { GameFact, SessionStatus } from "@/domain/types";

export function orderGamesByRecency(games: GameFact[], resultsNewestFirst: { gameId: number }[]): GameFact[] {
  const firstSeen = new Map<number, number>();
  resultsNewestFirst.forEach((r, i) => {
    if (!firstSeen.has(r.gameId)) firstSeen.set(r.gameId, i);
  });
  return games
    .filter((g) => g.active)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (firstSeen.get(a.g.id) ?? Infinity) - (firstSeen.get(b.g.id) ?? Infinity) || a.i - b.i)
    .map(({ g }) => g);
}

export function busyPlayers(
  tables: TableView<{ playerId: number }>[],
  excludeSessionId?: number,
): Map<number, { tableNumber: number; status: SessionStatus }> {
  const busy = new Map<number, { tableNumber: number; status: SessionStatus }>();
  for (const t of tables) {
    if (!t.session || t.session.id === excludeSessionId) continue;
    for (const p of t.session.players) busy.set(p.playerId, { tableNumber: t.number, status: t.session.status });
  }
  return busy;
}

export function playerRecency(resultsNewestFirst: { placements: { playerId: number }[] }[]): Map<number, number> {
  const recency = new Map<number, number>();
  resultsNewestFirst.forEach((r, i) => {
    for (const p of r.placements) if (!recency.has(p.playerId)) recency.set(p.playerId, i);
  });
  return recency;
}

export function matchesQuery(name: string, query: string): boolean {
  const q = normalizeName(query);
  return q.length === 0 || normalizeName(name).includes(q);
}

export function sortCandidates(
  players: AdminPlayerView[],
  recency: Map<number, number>,
  busy: Map<number, { status: SessionStatus }>,
  query: string,
): AdminPlayerView[] {
  const blocked = (id: number) => {
    const b = busy.get(id);
    return b !== undefined && b.status !== "setup" ? 1 : 0;
  };
  return players
    .filter((p) => p.active && matchesQuery(p.name, query))
    .sort(
      (a, b) =>
        blocked(a.id) - blocked(b.id) ||
        (recency.get(a.id) ?? Infinity) - (recency.get(b.id) ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}
