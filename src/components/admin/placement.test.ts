import { expect, test } from "vitest";
import { orderFromPlacements, placementsFromOrder, previewPoints } from "./placement";

test("placementsFromOrder applies competition ranking for ties", () => {
  expect(
    placementsFromOrder([
      { playerId: 1, tiedWithPrevious: true },
      { playerId: 2, tiedWithPrevious: true },
      { playerId: 3, tiedWithPrevious: false },
      { playerId: 4, tiedWithPrevious: true },
    ]),
  ).toEqual([
    { playerId: 1, placement: 1 },
    { playerId: 2, placement: 1 },
    { playerId: 3, placement: 3 },
    { playerId: 4, placement: 3 },
  ]);
});

test("orderFromPlacements round-trips", () => {
  const placements = [
    { playerId: 2, placement: 1 },
    { playerId: 1, placement: 1 },
    { playerId: 3, placement: 3 },
  ];
  const order = orderFromPlacements(placements);
  expect(order).toEqual([
    { playerId: 2, tiedWithPrevious: false },
    { playerId: 1, tiedWithPrevious: true },
    { playerId: 3, tiedWithPrevious: false },
  ]);
  expect(placementsFromOrder(order)).toEqual(placements);
});

test("previewPoints scores with floor and joker, empty below 2 players", () => {
  const params = { participationFloor: 0.2, jokerMultiplier: 1.5 };
  const placements = [1, 2, 3, 4].map((id) => ({ playerId: id, placement: id }));
  const points = previewPoints(6, placements, new Set([1]), params);
  expect([...points.values()].map((v) => Number(v.toFixed(2)))).toEqual([9, 4.4, 2.8, 1.2]);
  expect(previewPoints(6, placements.slice(0, 1), new Set(), params).size).toBe(0);
});
