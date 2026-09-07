import type { Db, Tx } from "../db/client";
import { getEventRow } from "../repo/facts";
import { bumpVersion } from "../repo/writes";
import { ServiceError } from "./errors";

/**
 * Runs a synchronous transaction, rejects writes on a finished event (unless allowed)
 * and bumps the data version so every polling client refreshes.
 */
export function mutate<T>(db: Db, fn: (tx: Tx) => T, opts: { allowWhenFinished?: boolean } = {}): T {
  return db.transaction((tx) => {
    if (!opts.allowWhenFinished && getEventRow(tx).status === "finished") {
      throw new ServiceError("event_finished");
    }
    const result = fn(tx);
    bumpVersion(tx);
    return result;
  });
}
