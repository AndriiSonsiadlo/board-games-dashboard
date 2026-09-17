import { achievementDef, isAchievementId, newPublicUnlocks, type Unlock } from "@/domain/achievements";
import { replay } from "@/domain/replay";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import { insertAnnouncement, upsertAchievementSetting } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

function unlocksNow(tx: Tx): { unlocks: Unlock[]; sealedOverrides: Record<string, boolean> } {
  const facts = loadFacts(tx);
  return { unlocks: replay(facts, facts.event.scoring).unlocks, sealedOverrides: facts.sealedOverrides };
}

/** Runs a result-changing write and queues projector cards for public achievements it newly unlocked. */
export function withUnlockAnnouncements<T>(tx: Tx, write: () => T): T {
  const before = unlocksNow(tx).unlocks;
  const value = write();
  const after = unlocksNow(tx);
  const now = Date.now();
  for (const u of newPublicUnlocks(before, after.unlocks, after.sealedOverrides)) {
    insertAnnouncement(
      tx,
      { type: "achievement", payload: { sessionId: u.sessionId, playerId: u.playerId, achievementId: u.achievementId } },
      now,
    );
  }
  return value;
}

/** `mutate` for writes that can change results. */
export function mutateResult<T>(db: Db, fn: (tx: Tx) => T): T {
  return mutate(db, (tx) => withUnlockAnnouncements(tx, () => fn(tx)));
}

export function setAchievementEnabled(db: Db, input: { achievementId: string; enabled: boolean }): void {
  if (!isAchievementId(input.achievementId)) throw new ServiceError("invalid_value");
  const id = input.achievementId;
  mutate(db, (tx) => upsertAchievementSetting(tx, id, { enabled: input.enabled }), { allowWhenFinished: true });
}

/** Stores the choice only when it differs from the built-in default. Never queues cards. */
export function setAchievementSealed(db: Db, input: { achievementId: string; sealed: boolean }): void {
  if (!isAchievementId(input.achievementId)) throw new ServiceError("invalid_value");
  const id = input.achievementId;
  const sealed = input.sealed === achievementDef(id).sealed ? null : input.sealed;
  mutate(db, (tx) => upsertAchievementSetting(tx, id, { sealed }), { allowWhenFinished: true });
}
