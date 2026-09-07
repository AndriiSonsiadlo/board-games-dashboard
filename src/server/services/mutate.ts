import { backupDir, maybeBackup } from "../backup";
import type { Db, Tx } from "../db/client";
import { getEventRow } from "../repo/facts";
import { bumpVersion } from "../repo/writes";
import { ServiceError } from "./errors";

/**
 * Runs a synchronous transaction, rejects writes on a finished event (unless allowed)
 * and bumps the data version so every polling client refreshes.
 * After commit, takes a throttled backup (skipped under Vitest).
 */
export function mutate<T>(db: Db, fn: (tx: Tx) => T, opts: { allowWhenFinished?: boolean } = {}): T {
  const result = db.transaction((tx) => {
    if (!opts.allowWhenFinished && getEventRow(tx).status === "finished") {
      throw new ServiceError("event_finished");
    }
    const value = fn(tx);
    bumpVersion(tx);
    return value;
  });
  if (!process.env.VITEST) maybeBackup(db, backupDir(db.$client.name));
  return result;
}
