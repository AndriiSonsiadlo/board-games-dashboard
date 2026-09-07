import type { SessionFact, SessionStatus } from "./types";

export type TableState = "available" | "preparing" | "playing" | "pending";

export const OPEN_STATUSES: SessionStatus[] = ["setup", "playing", "pending"];

export function isOpenSession(session: SessionFact): boolean {
  return OPEN_STATUSES.includes(session.status);
}

export function tableState(status: SessionStatus | undefined): TableState {
  switch (status) {
    case "setup":
      return "preparing";
    case "playing":
      return "playing";
    case "pending":
      return "pending";
    default:
      return "available";
  }
}
