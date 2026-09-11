import { buildFinaleScript, clampStep, revealStepOf } from "@/domain/finale";
import { replay } from "@/domain/replay";
import type { Db } from "../db/client";
import { getEventRow, loadFacts } from "../repo/facts";
import { updateEventRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export type FinaleCommand = "next" | "back" | "exit";

export function finaleCommand(db: Db, command: FinaleCommand): { step: number; total: number } {
  return mutate(
    db,
    (tx) => {
      const row = getEventRow(tx);
      if (row.status !== "finished") throw new ServiceError("invalid_status");
      const facts = loadFacts(tx);
      const beats = buildFinaleScript(facts, replay(facts, facts.event.scoring));
      const current = clampStep(row.screenControl.finaleStep, beats);
      const step =
        command === "next" ? clampStep(current + 1, beats) : command === "back" ? clampStep(current - 1, beats) : 0;
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
