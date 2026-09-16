import { uniqueSlug } from "@/domain/games";
import { isOpenSession } from "@/domain/tables";
import type { GameFact } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deleteGameRow,
  deleteTableRow,
  gameHasSessions,
  insertGame,
  insertTable,
  tableHasSessions,
  updateGameRow,
  updateTableRow,
} from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface GamePatch {
  name?: string;
  family?: string;
  weight?: number;
  minPlayers?: number;
  maxPlayers?: number;
  durationMin?: number;
  allowTies?: boolean;
  active?: boolean;
  descriptionEn?: string;
  descriptionRu?: string;
  icon?: string;
  category?: string;
}

/** `family: null` puts the game in its own family (its slug). */
export type NewGame = Omit<GameFact, "id" | "slug" | "family"> & { family: string | null };

const invalid = () => new ServiceError("invalid_value");

function normalized<T extends Partial<GameFact>>(g: T): T {
  return {
    ...g,
    ...(g.name !== undefined ? { name: g.name.trim() } : {}),
    ...(g.category !== undefined ? { category: g.category.trim().toLowerCase() } : {}),
    ...(g.descriptionEn !== undefined ? { descriptionEn: g.descriptionEn.trim() } : {}),
    ...(g.descriptionRu !== undefined ? { descriptionRu: g.descriptionRu.trim() } : {}),
  };
}

function checkGame(g: GameFact, families: ReadonlySet<string>): void {
  if (!(g.weight > 0 && g.weight <= 100)) throw invalid();
  if (!Number.isInteger(g.minPlayers) || g.minPlayers < 2) throw invalid();
  if (!Number.isInteger(g.maxPlayers) || g.maxPlayers < g.minPlayers || g.maxPlayers > 20) throw invalid();
  if (!Number.isInteger(g.durationMin) || g.durationMin < 1 || g.durationMin > 600) throw invalid();
  if (g.name.length === 0 || g.name.length > 40) throw invalid();
  if (g.category.length === 0 || g.category.length > 30) throw invalid();
  if (g.descriptionEn.length > 300 || g.descriptionRu.length > 300) throw invalid();
  if (!/^[A-Z][A-Za-z0-9]{1,40}$/.test(g.icon)) throw invalid();
  // A family is the game's own slug or one that another game already uses.
  if (g.family !== g.slug && !families.has(g.family)) throw invalid();
}

const familiesOf = (games: GameFact[], exceptId: number | null) =>
  new Set(games.filter((g) => g.id !== exceptId).map((g) => g.family));

export function createGame(db: Db, input: NewGame): number {
  return mutate(db, (tx) => {
    const games = loadFacts(tx).games;
    const { family, ...fields } = input;
    const base = normalized({ ...fields, id: 0 });
    const slug = uniqueSlug(base.name, games.map((g) => g.slug));
    const game: GameFact = { ...base, slug, family: family ?? slug };
    checkGame(game, familiesOf(games, null));
    const { id: _id, ...values } = game;
    return insertGame(tx, values);
  });
}

export function updateGame(db: Db, id: number, patch: GamePatch): void {
  mutate(db, (tx) => {
    const games = loadFacts(tx).games;
    const game = games.find((g) => g.id === id);
    if (!game) throw new ServiceError("not_found");
    const clean = normalized(patch);
    checkGame({ ...game, ...clean }, familiesOf(games, id));
    updateGameRow(tx, id, clean);
  });
}

export function deleteGame(db: Db, id: number): void {
  mutate(db, (tx: Tx) => {
    if (!loadFacts(tx).games.some((g) => g.id === id)) throw new ServiceError("not_found");
    if (gameHasSessions(tx, id)) throw new ServiceError("game_in_use");
    deleteGameRow(tx, id);
  });
}

export function addTable(db: Db, label: string | null = null): number {
  return mutate(db, (tx) => {
    const numbers = loadFacts(tx).tables.map((t) => t.number);
    const number = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return insertTable(tx, { number, label: label?.trim() || null });
  });
}

function hasOpenSession(db: Parameters<typeof loadFacts>[0], tableId: number): boolean {
  return loadFacts(db).sessions.some((s) => s.tableId === tableId && isOpenSession(s));
}

export function updateTable(db: Db, id: number, patch: { label?: string | null; active?: boolean }): void {
  mutate(db, (tx) => {
    if (!loadFacts(tx).tables.some((t) => t.id === id)) throw new ServiceError("not_found");
    if (patch.active === false && hasOpenSession(tx, id)) throw new ServiceError("table_in_use");
    updateTableRow(tx, id, {
      label: patch.label === undefined ? undefined : patch.label?.trim() || null,
      active: patch.active,
    });
  });
}

export function removeTable(db: Db, id: number): "deleted" | "deactivated" {
  return mutate(db, (tx) => {
    if (!loadFacts(tx).tables.some((t) => t.id === id)) throw new ServiceError("not_found");
    if (hasOpenSession(tx, id)) throw new ServiceError("table_in_use");
    if (tableHasSessions(tx, id)) {
      updateTableRow(tx, id, { active: false });
      return "deactivated";
    }
    deleteTableRow(tx, id);
    return "deleted";
  });
}
