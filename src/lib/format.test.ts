import { expect, test } from "vitest";
import { formatClock, formatElapsed, pad2 } from "./format";

test("pad2", () => {
  expect(pad2(3)).toBe("03");
  expect(pad2(12)).toBe("12");
});

test("formatElapsed renders hh:mm:ss and clamps negatives", () => {
  expect(formatElapsed(0)).toBe("00:00:00");
  expect(formatElapsed(4_472_000)).toBe("01:14:32");
  expect(formatElapsed(-5)).toBe("00:00:00");
  expect(formatElapsed(36 * 3_600_000)).toBe("36:00:00");
});

test("formatClock renders local hh:mm", () => {
  const ts = new Date(2026, 8, 18, 19, 5).getTime();
  expect(formatClock(ts)).toBe("19:05");
});
