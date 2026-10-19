export type ErrorCode =
  | "event_finished"
  | "not_found"
  | "invalid_name"
  | "invalid_value"
  | "invalid_status"
  | "player_busy"
  | "table_busy"
  | "table_in_use"
  | "joker_used"
  | "too_few_players"
  | "too_many_players"
  | "invalid_placements"
  | "ties_not_allowed"
  | "merge_conflict"
  | "nothing_to_undo"
  | "undo_conflict"
  | "open_sessions"
  | "wrong_pin"
  | "demo_player_in_use"
  | "duplicate_name"
  | "game_in_use"
  | "player_in_use";

export class ServiceError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
