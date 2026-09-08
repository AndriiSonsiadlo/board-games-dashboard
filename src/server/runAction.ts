import type { ActionResult } from "@/lib/action";
import { isAdmin } from "./auth/admin";
import { getDb, type Db } from "./db/client";
import { isServiceError } from "./services/errors";

export function runPublicAction<T>(fn: (db: Db) => T): ActionResult<T> {
  try {
    return { ok: true, data: fn(getDb()) };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, error: error.code };
    console.error(error);
    return { ok: false, error: "unexpected" };
  }
}

export async function runAdminAction<T>(fn: (db: Db) => T): Promise<ActionResult<T>> {
  if (!(await isAdmin())) return { ok: false, error: "unauthorized" };
  return runPublicAction(fn);
}
