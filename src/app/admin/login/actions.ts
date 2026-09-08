"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { verifyPin } from "@/server/auth/pin";
import { lockRemainingMs, recordLoginFailure, recordLoginSuccess } from "@/server/auth/rateLimit";
import { ADMIN_COOKIE, ADMIN_TTL_MS, signToken } from "@/server/auth/token";
import { getDb } from "@/server/db/client";
import { loadSecrets } from "@/server/repo/facts";

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(pin: string): Promise<ActionResult> {
  const key = await clientKey();
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
