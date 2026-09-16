import { buildFinaleScript, clampStep, revealStepOf } from "@/domain/finale";
import { replay } from "@/domain/replay";
import type { Db } from "../db/client";
import { getEventRow, loadFacts } from "../repo/facts";
import { updateEventRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export type FinaleCommand = "next" | "back" | "exit";

function moveFinale(db: Db, pick: (current: number, total: number) => number): { step: number; total: number } {
  return mutate(
    db,
    (tx) => {
      const row = getEventRow(tx);
      if (row.status !== "finished") throw new ServiceError("invalid_status");
      const facts = loadFacts(tx);
      const beats = buildFinaleScript(facts, replay(facts, facts.event.scoring));
      const current = clampStep(row.screenControl.finaleStep, beats);
      const step = clampStep(pick(current, beats.length), beats);
      const reveal = step > 0 && step >= revealStepOf(beats);
      updateEventRow(tx, {
        screenControl: { ...row.screenControl, finaleStep: step },
        ...(reveal ? { finaleRevealed: true } : {}),
      });
      return { step, total: beats.length };
    },
    { allowWhenFinished: true },
  );
}

export function finaleCommand(db: Db, command: FinaleCommand): { step: number; total: number } {
  return moveFinale(db, (current) => (command === "next" ? current + 1 : command === "back" ? current - 1 : 0));
}

/** Jump straight to a step (0 = back to scenes). Landing on or past the podium beat makes standings public. */
export function finaleGoto(db: Db, step: number): { step: number; total: number } {
  return moveFinale(db, (_current, total) => {
    if (!Number.isInteger(step) || step < 0 || step > total) throw new ServiceError("invalid_value");
    return step;
  });
}

export function setFinaleRevealed(db: Db, revealed: boolean): void {
  mutate(
    db,
    (tx) => {
      if (getEventRow(tx).status !== "finished") throw new ServiceError("invalid_status");
      updateEventRow(tx, { finaleRevealed: revealed });
    },
    { allowWhenFinished: true },
  );
}
