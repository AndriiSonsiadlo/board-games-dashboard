import { buildProfile, type PlayerProfile } from "@/domain/profile";
import { replay, type Replay } from "@/domain/replay";
import { buildAdminSnapshot, buildPublicSnapshot, type AdminSnapshot, type PublicSnapshot } from "@/domain/snapshot";
import type { Facts } from "@/domain/types";
import type { Db } from "./db/client";
import { getDataVersion, loadFacts } from "./repo/facts";

interface LiveState {
  facts: Facts;
  replay: Replay;
}

const cache = new WeakMap<Db, LiveState>();

export function getLiveState(db: Db): LiveState {
  const cached = cache.get(db);
  if (cached && cached.facts.event.dataVersion === getDataVersion(db)) return cached;
  const facts = db.transaction((tx) => loadFacts(tx));
  const state = { facts, replay: replay(facts, facts.event.scoring) };
  cache.set(db, state);
  return state;
}

export function currentVersion(db: Db): number {
  return getDataVersion(db);
}

export function getPublicSnapshot(db: Db, now = Date.now()): PublicSnapshot {
  const state = getLiveState(db);
  return buildPublicSnapshot(state.facts, state.replay, now);
}

export function getAdminSnapshot(db: Db, now = Date.now()): AdminSnapshot {
  const state = getLiveState(db);
  return buildAdminSnapshot(state.facts, state.replay, now);
}

export function getProfile(db: Db, playerId: number, audience: "public" | "admin"): PlayerProfile | null {
  const state = getLiveState(db);
  return buildProfile(state.facts, state.replay, playerId, audience);
}
