import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "bgc_admin";
export const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signToken(secret: string, expiresAt: number): string {
  const payload = String(expiresAt);
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyToken(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !/^\d+$/.test(payload)) return false;
  const expected = Buffer.from(signature(secret, payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(payload) > now;
}
