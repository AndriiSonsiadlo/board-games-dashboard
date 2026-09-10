import { beforeEach, expect, test } from "vitest";
import {
  checkinLockRemainingMs,
  lockRemainingMs,
  recordCheckinAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  resetCheckinLimits,
  resetLoginLimits,
} from "./rateLimit";

beforeEach(() => {
  resetLoginLimits();
  resetCheckinLimits();
});

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

test("check-in locks out after 8 attempts within a minute, for 20 seconds", () => {
  for (let i = 0; i < 7; i++) recordCheckinAttempt("kiosk", 1000 + i);
  expect(checkinLockRemainingMs("kiosk", 1010)).toBe(0);
  recordCheckinAttempt("kiosk", 1010);
  expect(checkinLockRemainingMs("kiosk", 1010)).toBe(20_000);
  expect(checkinLockRemainingMs("kiosk", 21_009)).toBe(1);
  expect(checkinLockRemainingMs("kiosk", 21_010)).toBe(0);
});

test("check-in and login lockouts are independent buckets", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure("shared", 1000 + i);
  expect(lockRemainingMs("shared", 1005)).toBeGreaterThan(0);
  expect(checkinLockRemainingMs("shared", 1005)).toBe(0);
});
