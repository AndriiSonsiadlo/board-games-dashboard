import { expect, test } from "vitest";
import { rankChart } from "./rankChart";

test("rank 1 is at the top, gaps break the line", () => {
  const chart = rankChart([{ rank: 3 }, { rank: 1 }, { rank: null }, { rank: 2 }], 100, 50, 0);
  expect(chart.maxRank).toBe(3);
  expect(chart.path).toBe("M0,50 L33.3,0 M100,25");
  expect(chart.points.map((p) => p.rank)).toEqual([3, 1, 2]);
});

test("a single point is centered at the top", () => {
  expect(rankChart([{ rank: 1 }], 100, 50, 0).path).toBe("M50,0");
  expect(rankChart([], 100, 50).path).toBe("");
});

test("a fixed max rank shares the scale between series", () => {
  const chart = rankChart([{ rank: 1 }, { rank: 2 }], 100, 100, 0, 4);
  expect(chart.maxRank).toBe(4);
  expect(chart.path).toBe("M0,0 L100,33.3");
});
