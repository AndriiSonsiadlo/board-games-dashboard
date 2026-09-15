import { expect, test } from "vitest";
import { autoScrollPlan } from "./scrollPlan";

test("no plan when the content fits", () => {
  expect(autoScrollPlan({ viewport: 800, content: 800.5, from: "top", startDelayMs: 1000, windowMs: 12_000 })).toBeNull();
});

test("top: rest, glide down, rest, glide back, fitted to the scene window", () => {
  const plan = autoScrollPlan({ viewport: 800, content: 1400, from: "top", startDelayMs: 2000, windowMs: 20_000 })!;
  // travel = (20000 - 2000 - 2 * 1500) / 2 = 7500 ms for 600 px = 80 px/s, inside the readable range
  expect(plan.distance).toBe(600);
  expect(plan.offsets).toEqual([0, 0, 600, 600, 0, 0]);
  expect(plan.durationMs).toBe(20_000);
  expect(plan.times[0]).toBe(0);
  expect(plan.times[2]).toBeCloseTo(9500 / 20_000);
  expect(plan.times[5]).toBe(1);
});

test("bottom starts at the far edge (lists revealed from last place)", () => {
  const plan = autoScrollPlan({ viewport: 800, content: 1400, from: "bottom", startDelayMs: 2000, windowMs: 20_000 })!;
  expect(plan.offsets).toEqual([600, 600, 0, 0, 600, 600]);
});

test("speed stays readable when the window is too short, too long or unknown", () => {
  // 1200 px at no more than 120 px/s -> 10 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 2000, from: "top", startDelayMs: 0, windowMs: 5000 })!.durationMs).toBe(23_000);
  // 60 px at no less than 30 px/s -> 2 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 860, from: "top", startDelayMs: 0, windowMs: 120_000 })!.durationMs).toBe(7000);
  // no window: 300 px at 60 px/s -> 5 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 1100, from: "top", startDelayMs: 0 })!.durationMs).toBe(13_000);
});
