import { afterEach, beforeEach, expect, test } from "vitest";
import { buildFinaleScript, revealStepOf } from "@/domain/finale";
import { replay } from "@/domain/replay";
import { loadFacts } from "../repo/facts";
import { createTestDb } from "../testDb";
import { ServiceError } from "./errors";
import { finishEvent, goLive, reopenEvent } from "./event";
import { finaleCommand, setFinaleRevealed } from "./finale";
import { addPlayer } from "./players";
import { recordDirectResult } from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  const ids = ["Amy", "Bob", "Cat"].map((name) => addPlayer(ctx.db, { name }));
  const uno = loadFacts(ctx.db).games.find((g) => g.slug === "uno")!.id;
  recordDirectResult(ctx.db, {
    gameId: uno,
    tableId: null,
    placements: ids.map((playerId, i) => ({ playerId, placement: i + 1, jokerDeclared: false })),
  });
});
afterEach(() => ctx.cleanup());

const event = () => loadFacts(ctx.db).event;
const script = () => {
  const f = loadFacts(ctx.db);
  return buildFinaleScript(f, replay(f, f.event.scoring));
};

test("finale commands require a finished event", () => {
  expect(() => finaleCommand(ctx.db, "next")).toThrow(ServiceError);
  expect(() => setFinaleRevealed(ctx.db, true)).toThrow(ServiceError);
});

test("next walks the script, reveals at the podium beat and stops at the end", () => {
  finishEvent(ctx.db);
  const beats = script();
  const revealAt = revealStepOf(beats);
  for (let step = 1; step < revealAt; step++) {
    expect(finaleCommand(ctx.db, "next")).toEqual({ step, total: beats.length });
    expect(event().finaleRevealed).toBe(false);
  }
  finaleCommand(ctx.db, "next");
  expect(event().finaleRevealed).toBe(true);
  for (let i = 0; i < 5; i++) finaleCommand(ctx.db, "next");
  expect(event().screenControl.finaleStep).toBe(beats.length);
});

test("back never hides standings again; exit returns to scenes", () => {
  finishEvent(ctx.db);
  const revealAt = revealStepOf(script());
  for (let i = 0; i < revealAt; i++) finaleCommand(ctx.db, "next");
  expect(finaleCommand(ctx.db, "back").step).toBe(revealAt - 1);
  expect(event().finaleRevealed).toBe(true);
  expect(finaleCommand(ctx.db, "exit").step).toBe(0);
  expect(finaleCommand(ctx.db, "back").step).toBe(0);
});

test("the admin can toggle the reveal; reopening resets everything", () => {
  finishEvent(ctx.db);
  setFinaleRevealed(ctx.db, true);
  expect(event().finaleRevealed).toBe(true);
  setFinaleRevealed(ctx.db, false);
  expect(event().finaleRevealed).toBe(false);
  finaleCommand(ctx.db, "next");
  reopenEvent(ctx.db);
  expect(event()).toMatchObject({ finaleRevealed: false, screenControl: { finaleStep: 0 } });
});
