import type { ErrorCode } from "@/server/services/errors";

export type ActionError = ErrorCode | "unauthorized" | "unexpected" | "locked";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: ActionError };

export type LiveResponse<S> =
  | { changed: false; version: number }
  | { changed: true; version: number; snapshot: S };
