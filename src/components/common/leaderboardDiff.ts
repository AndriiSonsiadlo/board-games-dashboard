export interface StandingsMemory {
  counted: Map<number, number>;
  leader: number | null;
}

export function diffStandings(
  previous: StandingsMemory | null,
  rows: { playerId: number; counted: number; rank: number | null }[],
): { changed: number[]; newLeader: number | null; memory: StandingsMemory } {
  const memory: StandingsMemory = {
    counted: new Map(rows.map((r) => [r.playerId, r.counted])),
    leader: rows.find((r) => r.rank === 1)?.playerId ?? null,
  };
  if (!previous) return { changed: [], newLeader: null, memory };
  const changed = rows
    .filter((r) => Math.abs((previous.counted.get(r.playerId) ?? 0) - r.counted) > 1e-9)
    .map((r) => r.playerId);
  const newLeader =
    previous.leader !== null && memory.leader !== null && memory.leader !== previous.leader ? memory.leader : null;
  return { changed, newLeader, memory };
}
