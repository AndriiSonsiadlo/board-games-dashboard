import { scoreResult, type ScoringParams } from "@/domain/scoring";

export interface OrderedEntry {
  playerId: number;
  tiedWithPrevious: boolean;
}

export function placementsFromOrder(order: OrderedEntry[]): { playerId: number; placement: number }[] {
  let placement = 0;
  return order.map((entry, index) => {
    if (index === 0 || !entry.tiedWithPrevious) placement = index + 1;
    return { playerId: entry.playerId, placement };
  });
}

export function orderFromPlacements(placements: { playerId: number; placement: number }[]): OrderedEntry[] {
  const sorted = [...placements].sort((a, b) => a.placement - b.placement);
  return sorted.map((p, i) => ({
    playerId: p.playerId,
    tiedWithPrevious: i > 0 && p.placement === sorted[i - 1].placement,
  }));
}

export function previewPoints(
  weight: number,
  placements: { playerId: number; placement: number }[],
  jokers: Set<number>,
  params: ScoringParams,
): Map<number, number> {
  if (placements.length < 2) return new Map();
  const scored = scoreResult(
    weight,
    placements.map((p) => ({ ...p, jokerDeclared: jokers.has(p.playerId) })),
    params,
  );
  return new Map(scored.map((s) => [s.playerId, s.points]));
}
