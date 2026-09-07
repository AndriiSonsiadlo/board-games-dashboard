import { isOpenSession } from "@/domain/tables";
import type { Db } from "../db/client";
import { loadFacts } from "../repo/facts";
import { deleteTableRow, insertTable, tableHasSessions, updateGameRow, updateTableRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface GamePatch {
  name?: string;
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

const invalid = () => new ServiceError("invalid_value");

export function updateGame(db: Db, id: number, patch: GamePatch): void {
  mutate(db, (tx) => {
    const game = loadFacts(tx).games.find((g) => g.id === id);
    if (!game) throw new ServiceError("not_found");
    const next = { ...game, ...patch };
    if (!(next.weight > 0 && next.weight <= 100)) throw invalid();
    if (!Number.isInteger(next.minPlayers) || next.minPlayers < 2) throw invalid();
    if (!Number.isInteger(next.maxPlayers) || next.maxPlayers < next.minPlayers || next.maxPlayers > 20) throw invalid();
    if (!Number.isInteger(next.durationMin) || next.durationMin < 1 || next.durationMin > 600) throw invalid();
    if (next.name.trim().length === 0) throw invalid();
    updateGameRow(tx, id, { ...patch, name: patch.name?.trim() });
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
