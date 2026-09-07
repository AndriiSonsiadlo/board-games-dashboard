export interface ScoringParams {
  participationFloor: number;
  jokerMultiplier: number;
}

export interface PlacementInput {
  playerId: number;
  placement: number;
  jokerDeclared: boolean;
}

export interface ScoredPlacement extends PlacementInput {
  base: number;
  points: number;
  jokerBonus: number;
}

export type PlacementError = "too_few_players" | "invalid_placements" | "ties_not_allowed";

export function placementShare(n: number, place: number, floor: number): number {
  if (n < 2) throw new RangeError("A result needs at least 2 players");
  if (!Number.isInteger(place) || place < 1 || place > n) {
    throw new RangeError(`Placement ${place} is outside 1..${n}`);
  }
  return floor + ((1 - floor) * (n - place)) / (n - 1);
}

export function basePoints(weight: number, n: number, place: number, floor: number): number {
  return weight * placementShare(n, place, floor);
}

/** Placements use competition ranking: ties share a value and the next value skips (1, 1, 3). */
export function validatePlacements(placements: number[], allowTies: boolean): PlacementError | null {
  if (placements.length < 2) return "too_few_players";
  const sorted = [...placements].sort((a, b) => a - b);
  let expected = 1;
  let i = 0;
  while (i < sorted.length) {
    const value = sorted[i];
    if (!Number.isInteger(value) || value !== expected) return "invalid_placements";
    let groupSize = 0;
    while (i < sorted.length && sorted[i] === value) {
      groupSize++;
      i++;
    }
    if (groupSize > 1 && !allowTies) return "ties_not_allowed";
    expected = value + groupSize;
  }
  return null;
}

export function scoreResult(
  weight: number,
  placements: PlacementInput[],
  params: ScoringParams,
): ScoredPlacement[] {
  const error = validatePlacements(
    placements.map((p) => p.placement),
    true,
  );
  if (error) throw new RangeError(`Invalid result: ${error}`);

  const n = placements.length;
  const groupSizes = new Map<number, number>();
  for (const p of placements) groupSizes.set(p.placement, (groupSizes.get(p.placement) ?? 0) + 1);

  return placements.map((p) => {
    const span = groupSizes.get(p.placement) ?? 1;
    let sum = 0;
    for (let position = p.placement; position < p.placement + span; position++) {
      sum += basePoints(weight, n, position, params.participationFloor);
    }
    const base = sum / span;
    const points = p.jokerDeclared ? base * params.jokerMultiplier : base;
    return { ...p, base, points, jokerBonus: points - base };
  });
}

export function formatPoints(value: number): string {
  return (Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1);
}
