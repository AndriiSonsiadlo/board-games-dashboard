import { expect, test } from "vitest";
import { hashPin, randomSecret, verifyPin } from "./pin";

test("hash and verify a PIN", () => {
  const stored = hashPin("2468");
  expect(stored.startsWith("scrypt$")).toBe(true);
  expect(verifyPin("2468", stored)).toBe(true);
  expect(verifyPin("2469", stored)).toBe(false);
});

test("same PIN hashes differently (random salt)", () => {
  expect(hashPin("1111")).not.toBe(hashPin("1111"));
});

test("malformed stored hash never verifies", () => {
  expect(verifyPin("1234", "plain")).toBe(false);
});

test("random secret is 64 hex chars", () => {
  expect(randomSecret()).toMatch(/^[0-9a-f]{64}$/);
});
