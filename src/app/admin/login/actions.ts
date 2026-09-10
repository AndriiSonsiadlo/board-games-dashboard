"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { verifyPin } from "@/server/auth/pin";
import { lockRemainingMs, recordLoginFailure, recordLoginSuccess } from "@/server/auth/rateLimit";
import { ADMIN_COOKIE, ADMIN_TTL_MS, signToken } from "@/server/auth/token";
import { getDb } from "@/server/db/client";
import { loadSecrets } from "@/server/repo/facts";

// This deployment runs `next start -H 0.0.0.0` directly with no reverse proxy in
// front of it, so X-Forwarded-For / X-Real-IP are attacker-supplied on every
// request and cannot be used to key the lockout. A single shared key is a global
// "someone is hammering the login" guard, which is what actually protects the PIN
// in this topology.
const LOGIN_RATE_LIMIT_KEY = "local";

export async function loginAction(pin: string): Promise<ActionResult> {
  const key = LOGIN_RATE_LIMIT_KEY;
  if (lockRemainingMs(key) > 0) return { ok: false, error: "locked" };
  const secrets = loadSecrets(getDb());
  if (!verifyPin(pin, secrets.adminPinHash)) {
    recordLoginFailure(key);
    return { ok: false, error: lockRemainingMs(key) > 0 ? "locked" : "wrong_pin" };
  }
  recordLoginSuccess(key);
  const expiresAt = Date.now() + ADMIN_TTL_MS;
  (await cookies()).set(ADMIN_COOKIE, signToken(secrets.sessionSecret, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: Math.floor(ADMIN_TTL_MS / 1000),
  });
  return { ok: true, data: undefined };
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
