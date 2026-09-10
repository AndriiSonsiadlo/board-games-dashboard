import { describe, expect, test } from "vitest";
import {
  basePoints,
  formatPoints,
  placementShare,
  scoreResult,
  validatePlacements,
  type PlacementInput,
} from "./scoring";

const params = (participationFloor: number, jokerMultiplier = 1.5) => ({
  participationFloor,
  jokerMultiplier,
});

function order(n: number, jokerFor: number[] = []): PlacementInput[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: i + 1,
    placement: i + 1,
    jokerDeclared: jokerFor.includes(i + 1),
  }));
}

function points(weight: number, placements: PlacementInput[], floor: number, joker = 1.5) {
  return scoreResult(weight, placements, params(floor, joker)).map((p) => p.points);
}

function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));
}

describe("placementShare", () => {
  test("first place always 1, last place equals floor", () => {
    expect(placementShare(5, 1, 0.2)).toBeCloseTo(1);
    expect(placementShare(5, 5, 0.2)).toBeCloseTo(0.2);
  });

  test("throws for fewer than 2 players or out-of-range placement", () => {
    expect(() => placementShare(1, 1, 0.2)).toThrow(RangeError);
    expect(() => placementShare(4, 0, 0.2)).toThrow(RangeError);
    expect(() => placementShare(4, 5, 0.2)).toThrow(RangeError);
  });

  test("basePoints multiplies share by weight", () => {
    expect(basePoints(15, 6, 2, 0)).toBeCloseTo(12);
  });
});

describe("scoreResult without floor (original formula)", () => {
  test("4 players, weight 6", () => expectClose(points(6, order(4), 0), [6, 4, 2, 0]));
  test("6 players, weight 15", () => expectClose(points(15, order(6), 0), [15, 12, 9, 6, 3, 0]));
});

describe("scoreResult with 20% participation floor", () => {
  test("2 players, weight 10", () => expectClose(points(10, order(2), 0.2), [10, 2]));
  test("3 players, weight 8", () => expectClose(points(8, order(3), 0.2), [8, 4.8, 1.6]));
  test("4 players, weight 6", () => expectClose(points(6, order(4), 0.2), [6, 4.4, 2.8, 1.2]));
  test("6 players, weight 15", () =>
    expectClose(points(15, order(6), 0.2), [15, 12.6, 10.2, 7.8, 5.4, 3]));
  test("different weights scale linearly", () =>
    expectClose(points(4, order(4), 0.2), [4, 2.9333333333, 1.8666666667, 0.8]));
});

describe("ties", () => {
  test("tie for first shares the mean of positions 1 and 2", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 1, jokerDeclared: false },
      { playerId: 3, placement: 3, jokerDeclared: false },
      { playerId: 4, placement: 4, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0), [5, 5, 2, 0]);
  });

  test("tie for last shares the mean of the last positions", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 2, jokerDeclared: false },
      { playerId: 3, placement: 3, jokerDeclared: false },
      { playerId: 4, placement: 3, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0.2), [6, 4.4, 2, 2]);
  });

  test("three-way tie spans three positions", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 1, jokerDeclared: false },
      { playerId: 3, placement: 1, jokerDeclared: false },
      { playerId: 4, placement: 4, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0), [4, 4, 4, 0]);
  });

  test("a tied player's Joker multiplies their averaged tie share", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: true },
      { playerId: 2, placement: 1, jokerDeclared: false },
      { playerId: 3, placement: 3, jokerDeclared: false },
      { playerId: 4, placement: 4, jokerDeclared: false },
    ];
    const scored = scoreResult(6, placements, params(0));
    expect(scored[0].base).toBeCloseTo(5); // tie-for-first share, same as non-Joker tie
    expect(scored[0].points).toBeCloseTo(7.5); // 5 * 1.5 Joker multiplier
    expect(scored[1].points).toBeCloseTo(5); // untouched tied partner
  });
});

describe("joker", () => {
  test("multiplies only the declaring player's points", () => {
    const scored = scoreResult(6, order(4, [1]), params(0.2, 1.5));
    expect(scored[0].base).toBeCloseTo(6);
    expect(scored[0].points).toBeCloseTo(9);
    expect(scored[0].jokerBonus).toBeCloseTo(3);
    expect(scored[1].points).toBeCloseTo(4.4);
    expect(scored[1].jokerBonus).toBe(0);
  });

  test("joker on last place with no floor earns nothing", () => {
    expectClose(points(6, order(4, [4]), 0), [6, 4, 2, 0]);
  });

  test("custom multiplier", () => {
    expectClose(points(10, order(2, [2]), 0.2, 2), [10, 4]);
  });

  test("keeps player order and ids", () => {
    const scored = scoreResult(6, order(3), params(0.2));
    expect(scored.map((s) => s.playerId)).toEqual([1, 2, 3]);
  });
});

describe("validatePlacements", () => {
  test("accepts a permutation", () => expect(validatePlacements([2, 1, 3], false)).toBeNull());
  test("rejects fewer than 2 players", () =>
    expect(validatePlacements([1], true)).toBe("too_few_players"));
  test("rejects gaps and duplicates", () => {
    expect(validatePlacements([1, 3], false)).toBe("invalid_placements");
    expect(validatePlacements([1, 1, 2], true)).toBe("invalid_placements");
    expect(validatePlacements([0, 1], true)).toBe("invalid_placements");
  });
  test("competition ranking ties need allowTies", () => {
    expect(validatePlacements([1, 1, 3], false)).toBe("ties_not_allowed");
    expect(validatePlacements([1, 1, 3], true)).toBeNull();
  });
  test("scoreResult throws on invalid placements", () => {
    expect(() =>
      scoreResult(6, [{ playerId: 1, placement: 1, jokerDeclared: false }], params(0.2)),
    ).toThrow(RangeError);
  });
});

describe("formatPoints", () => {
  test("one decimal", () => {
    expect(formatPoints(4.4000000001)).toBe("4.4");
    expect(formatPoints(15)).toBe("15.0");
    expect(formatPoints(2.9333)).toBe("2.9");
    expect(formatPoints(0.05)).toBe("0.1");
  });
});
