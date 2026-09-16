"use server";

import type { BrandFields } from "@/domain/brand";
import type { AuditEntry } from "@/domain/types";
import type { ActionResult } from "@/lib/action";
import { listAudit } from "@/server/repo/facts";
import { runAdminAction } from "@/server/runAction";
import { setAchievementEnabled } from "@/server/services/achievements";
import {
  addTable,
  createGame,
  deleteGame,
  removeTable,
  updateGame,
  updateTable,
  type GamePatch,
  type NewGame,
} from "@/server/services/catalog";
import {
  changePin,
  clearDemoData,
  finishEvent,
  goLive,
  reopenEvent,
  screenCommand,
  updateBranding,
  updateEventInfo,
  updateScoring,
  updateScreenSettings,
  type EventInfoPatch,
  type ScoringPatch,
  type ScreenPatch,
} from "@/server/services/event";
import { finaleCommand, finaleGoto, setFinaleRevealed, type FinaleCommand } from "@/server/services/finale";
import { addPlayer, bulkAddPlayers, mergePlayers, updatePlayer, type PlayerPatch } from "@/server/services/players";
import {
  cancelSession,
  correctJoker,
  deleteResult,
  editResult,
  finishSession,
  recordDirectResult,
  recordResult,
  replayLastReveal,
  resumeSession,
  seatTable,
  showOnScreen,
  startSession,
  undoLast,
  updateSeating,
  type DirectPlacement,
  type PlacementEntry,
  type SeatInput,
} from "@/server/services/sessions";

type Result<T = void> = Promise<ActionResult<T>>;

// Tables and results
export async function seatTableAction(input: {
  tableId: number;
  gameId: number;
  players: SeatInput[];
  notes?: string | null;
  moveFromOtherTables?: boolean;
}): Result<number> {
  return runAdminAction((db) => seatTable(db, input));
}

export async function updateSeatingAction(
  sessionId: number,
  input: { gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): Result {
  return runAdminAction((db) => updateSeating(db, sessionId, input));
}

export async function startSessionAction(sessionId: number): Result {
  return runAdminAction((db) => startSession(db, sessionId));
}

export async function finishSessionAction(sessionId: number): Result {
  return runAdminAction((db) => finishSession(db, sessionId));
}

export async function resumeSessionAction(sessionId: number): Result {
  return runAdminAction((db) => resumeSession(db, sessionId));
}

export async function cancelSessionAction(sessionId: number): Result {
  return runAdminAction((db) => cancelSession(db, sessionId));
}

export async function recordResultAction(input: { sessionId: number; placements: PlacementEntry[] }): Result {
  return runAdminAction((db) => recordResult(db, input));
}

export async function recordDirectResultAction(input: {
  gameId: number;
  tableId: number | null;
  placements: DirectPlacement[];
}): Result<number> {
  return runAdminAction((db) => recordDirectResult(db, input));
}

export async function editResultAction(input: {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  placements: DirectPlacement[];
}): Result {
  return runAdminAction((db) => editResult(db, input));
}

export async function deleteResultAction(sessionId: number): Result {
  return runAdminAction((db) => deleteResult(db, sessionId));
}

export async function correctJokerAction(input: { sessionId: number; playerId: number; jokerDeclared: boolean }): Result {
  return runAdminAction((db) => correctJoker(db, input));
}

export async function undoLastAction(): Result<{ summary: string }> {
  return runAdminAction((db) => ({ summary: undoLast(db).summary }));
}

export async function showOnScreenAction(sessionId: number): Result {
  return runAdminAction((db) => showOnScreen(db, sessionId));
}

export async function replayLastRevealAction(): Result {
  return runAdminAction((db) => replayLastReveal(db));
}

export async function screenCommandAction(command: "pause" | "resume" | "skip"): Result {
  return runAdminAction((db) => screenCommand(db, command));
}

export async function getAuditAction(): Result<AuditEntry[]> {
  return runAdminAction((db) => listAudit(db, 100));
}

// Players
export async function addPlayerAction(input: { name: string; nickname?: string | null }): Result<number> {
  return runAdminAction((db) => addPlayer(db, input));
}

export async function bulkAddPlayersAction(text: string): Result<number> {
  return runAdminAction((db) => bulkAddPlayers(db, text).length);
}

export async function updatePlayerAction(id: number, patch: PlayerPatch): Result {
  return runAdminAction((db) => updatePlayer(db, id, patch));
}

export async function mergePlayersAction(input: { keepId: number; removeId: number }): Result {
  return runAdminAction((db) => mergePlayers(db, input));
}

// Catalog
export async function updateGameAction(id: number, patch: GamePatch): Result {
  return runAdminAction((db) => updateGame(db, id, patch));
}

export async function createGameAction(input: NewGame): Result<number> {
  return runAdminAction((db) => createGame(db, input));
}

export async function deleteGameAction(id: number): Result {
  return runAdminAction((db) => deleteGame(db, id));
}

export async function addTableAction(label?: string | null): Result<number> {
  return runAdminAction((db) => addTable(db, label ?? null));
}

export async function updateTableAction(id: number, patch: { label?: string | null; active?: boolean }): Result {
  return runAdminAction((db) => updateTable(db, id, patch));
}

export async function removeTableAction(id: number): Result<"deleted" | "deactivated"> {
  return runAdminAction((db) => removeTable(db, id));
}

// Event and settings
export async function updateBrandingAction(patch: Partial<BrandFields>): Result {
  return runAdminAction((db) => updateBranding(db, patch));
}

export async function goLiveAction(clearDemo: boolean): Result {
  return runAdminAction((db) => goLive(db, { clearDemo }));
}

export async function finishEventAction(): Result {
  return runAdminAction((db) => finishEvent(db));
}

export async function reopenEventAction(): Result {
  return runAdminAction((db) => reopenEvent(db));
}

export async function updateScoringAction(patch: ScoringPatch): Result {
  return runAdminAction((db) => updateScoring(db, patch));
}

export async function updateScreenSettingsAction(patch: ScreenPatch): Result {
  return runAdminAction((db) => updateScreenSettings(db, patch));
}

export async function updateEventInfoAction(patch: EventInfoPatch): Result {
  return runAdminAction((db) => updateEventInfo(db, patch));
}

export async function changePinAction(input: { current: string; next: string }): Result {
  return runAdminAction((db) => changePin(db, input));
}

export async function clearDemoDataAction(): Result {
  return runAdminAction((db) => clearDemoData(db));
}

// Achievements and finale
export async function setAchievementEnabledAction(input: { achievementId: string; enabled: boolean }): Result {
  return runAdminAction((db) => setAchievementEnabled(db, input));
}

export async function finaleCommandAction(command: FinaleCommand): Result<{ step: number; total: number }> {
  return runAdminAction((db) => finaleCommand(db, command));
}

export async function finaleGotoAction(step: number): Result<{ step: number; total: number }> {
  return runAdminAction((db) => finaleGoto(db, step));
}

export async function setFinaleRevealedAction(revealed: boolean): Result {
  return runAdminAction((db) => setFinaleRevealed(db, revealed));
}
