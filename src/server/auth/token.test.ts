import { expect, test } from "vitest";
import { signToken, verifyToken } from "./token";

const secret = "a".repeat(64);

test("valid token verifies until expiry", () => {
  const token = signToken(secret, 2000);
  expect(verifyToken(secret, token, 1999)).toBe(true);
  expect(verifyToken(secret, token, 2000)).toBe(false);
});

test("tampered, foreign or malformed tokens fail", () => {
  const token = signToken(secret, 5000);
  expect(verifyToken(secret, token.replace(/^5000/, "9000"), 1)).toBe(false);
  expect(verifyToken("b".repeat(64), token, 1)).toBe(false);
  expect(verifyToken(secret, "garbage", 1)).toBe(false);
  expect(verifyToken(secret, undefined, 1)).toBe(false);
});
