import { beforeEach, expect, test } from "vitest";
import { lockRemainingMs, recordLoginFailure, recordLoginSuccess, resetLoginLimits } from "./rateLimit";

beforeEach(() => resetLoginLimits());

test("five failures within 5 minutes lock for 30 seconds", () => {
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", 1000 + i);
  expect(lockRemainingMs("ip", 1010)).toBe(0);
  recordLoginFailure("ip", 1010);
  expect(lockRemainingMs("ip", 1010)).toBe(30_000);
  expect(lockRemainingMs("ip", 31_009)).toBe(1);
  expect(lockRemainingMs("ip", 41_010)).toBe(0);
});

test("old failures fall out of the window and success clears", () => {
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", i);
  recordLoginFailure("ip", 5 * 60_000 + 10);
  expect(lockRemainingMs("ip", 5 * 60_000 + 10)).toBe(0);
  recordLoginSuccess("ip");
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", 400_000 + i);
  expect(lockRemainingMs("ip", 400_010)).toBe(0);
});
