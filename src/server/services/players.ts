import { colorForIndex, normalizeName, parseBulkNames } from "@/domain/players";
import type { PlayerSource } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deletePlayerRow,
  insertAudit,
  insertPlayer,
  reassignPlayerSeats,
  replaceSessionPlayers,
  updatePlayerRow,
} from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface PlayerPatch {
  name?: string;
  nickname?: string | null;
  color?: string;
  active?: boolean;
}

function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length === 0 || value.length > 40) throw new ServiceError("invalid_name");
  return value;
}

function cleanNickname(nickname: string | null | undefined): string | null {
  const value = nickname?.trim().replace(/\s+/g, " ") ?? "";
  if (value.length > 24) throw new ServiceError("invalid_name");
  return value.length > 0 ? value : null;
}

function createPlayer(tx: Tx, name: string, nickname: string | null, source: PlayerSource): number {
  const count = loadFacts(tx).players.length;
  return insertPlayer(tx, { name, nickname, color: colorForIndex(count), source, createdAt: Date.now() });
}

export function addPlayer(
  db: Db,
  input: { name: string; nickname?: string | null; source?: PlayerSource },
): number {
  const name = cleanName(input.name);
  const nickname = cleanNickname(input.nickname);
  return mutate(db, (tx) => createPlayer(tx, name, nickname, input.source ?? "admin"));
}

export function bulkAddPlayers(db: Db, text: string): number[] {
  const names = parseBulkNames(text).map(cleanName);
  return mutate(db, (tx) => {
    const existing = new Set(loadFacts(tx).players.map((p) => normalizeName(p.name)));
    return names
      .filter((name) => !existing.has(normalizeName(name)))
      .map((name) => createPlayer(tx, name, null, "admin"));
  });
}

export function checkIn(db: Db, input: { name: string; nickname?: string | null }): number {
  return addPlayer(db, { ...input, source: "checkin" });
}

export function updatePlayer(db: Db, id: number, patch: PlayerPatch): void {
  const next: PlayerPatch = {};
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.nickname !== undefined) next.nickname = cleanNickname(patch.nickname);
  if (patch.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new ServiceError("invalid_value");
    next.color = patch.color;
  }
  if (patch.active !== undefined) next.active = patch.active;
  mutate(db, (tx) => {
    if (!loadFacts(tx).players.some((p) => p.id === id)) throw new ServiceError("not_found");
    updatePlayerRow(tx, id, next);
  });
}

export function mergePlayers(db: Db, input: { keepId: number; removeId: number }): void {
  if (input.keepId === input.removeId) throw new ServiceError("invalid_value");
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const keep = facts.players.find((p) => p.id === input.keepId);
    const remove = facts.players.find((p) => p.id === input.removeId);
    if (!keep || !remove) throw new ServiceError("not_found");

    const live = facts.sessions.filter((s) => s.status !== "cancelled");
    const sharedSession = live.some(
      (s) => s.players.some((p) => p.playerId === keep.id) && s.players.some((p) => p.playerId === remove.id),
    );
    const usedJoker = (playerId: number) =>
      live.some((s) => s.players.some((p) => p.playerId === playerId && p.jokerDeclared));
    if (sharedSession || (usedJoker(keep.id) && usedJoker(remove.id))) {
      throw new ServiceError("merge_conflict");
    }

    // Cancelled sessions may seat both players; drop the duplicate seat so the reassign keeps the primary key valid.
    for (const session of facts.sessions.filter((x) => x.status === "cancelled")) {
      if (session.players.some((p) => p.playerId === keep.id) && session.players.some((p) => p.playerId === remove.id)) {
        replaceSessionPlayers(tx, session.id, session.players.filter((p) => p.playerId !== remove.id));
      }
    }

    reassignPlayerSeats(tx, remove.id, keep.id);
    deletePlayerRow(tx, remove.id);
    insertAudit(tx, {
      action: "player.merge",
      summary: `${remove.name} merged into ${keep.name}`,
      before: null,
      after: null,
      at: Date.now(),
    });
  });
}
