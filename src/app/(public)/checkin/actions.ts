"use server";

import type { ActionResult } from "@/lib/action";
import { checkinLockRemainingMs, recordCheckinAttempt } from "@/server/auth/rateLimit";
import { runPublicAction } from "@/server/runAction";
import { checkIn } from "@/server/services/players";

// This deployment runs `next start -H 0.0.0.0` with no reverse proxy in front of
// it, so per-client headers (X-Forwarded-For etc.) are attacker-supplied and
// cannot key the limit (same reasoning as the admin login rate limit). A single
// shared bucket bounds total kiosk traffic, which is what matters here.
const CHECKIN_RATE_LIMIT_KEY = "checkin";

export async function checkInAction(input: {
  name: string;
  nickname?: string | null;
}): Promise<ActionResult<{ id: number; name: string }>> {
  if (checkinLockRemainingMs(CHECKIN_RATE_LIMIT_KEY) > 0) return { ok: false, error: "locked" };
  recordCheckinAttempt(CHECKIN_RATE_LIMIT_KEY);
  return runPublicAction((db) => {
    const id = checkIn(db, input);
    return { id, name: input.name.trim().replace(/\s+/g, " ") };
  });
}
