import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isOpenSession } from "@/domain/tables";
import { listAudit, loadFacts } from "../repo/facts";
import { createTestDb } from "../testDb";
import { ServiceError } from "./errors";
import { finishEvent, goLive } from "./event";
import { addPlayer, updatePlayer } from "./players";
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
} from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
let p: Record<"amy" | "bob" | "cat" | "dan" | "eve", number>;
let g: Record<"catan" | "hitster" | "splendor", number>;

beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  p = {
    amy: addPlayer(ctx.db, { name: "Amy" }),
    bob: addPlayer(ctx.db, { name: "Bob" }),
    cat: addPlayer(ctx.db, { name: "Cat" }),
    dan: addPlayer(ctx.db, { name: "Dan" }),
    eve: addPlayer(ctx.db, { name: "Eve" }),
  };
  const games = loadFacts(ctx.db).games;
  const id = (slug: string) => games.find((x) => x.slug === slug)!.id;
  g = { catan: id("catan"), hitster: id("hitster"), splendor: id("splendor") };
});
afterEach(() => ctx.cleanup());

const facts = () => loadFacts(ctx.db);
const session = (id: number) => facts().sessions.find((s) => s.id === id);
const seats = (...ids: number[]) => ids.map((playerId) => ({ playerId, jokerDeclared: false }));

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ServiceError ${code}`);
}

function playFullGame(tableId = 1) {
  const id = seatTable(ctx.db, { tableId, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
  startSession(ctx.db, id);
  finishSession(ctx.db, id);
  recordResult(ctx.db, {
    sessionId: id,
    placements: [
      { playerId: p.bob, placement: 1 },
      { playerId: p.amy, placement: 2 },
      { playerId: p.cat, placement: 3 },
    ],
  });
  return id;
}

describe("table flow", () => {
  test("seat -> start -> finish -> record frees the table and audits", () => {
    const id = playFullGame();
    const s = session(id)!;
    expect(s.status).toBe("done");
    expect(s.startedAt).not.toBeNull();
    expect(s.finishedAt).toBeGreaterThanOrEqual(s.startedAt!);
    expect(s.players.map((x) => [x.playerId, x.placement])).toEqual([
      [p.amy, 2],
      [p.bob, 1],
      [p.cat, 3],
    ]);
    expect(facts().sessions.filter(isOpenSession)).toEqual([]);
    expect(listAudit(ctx.db)[0]).toMatchObject({ action: "result.create", after: { id, status: "done" } });
  });

  test("record straight from playing sets finishedAt", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
        { playerId: p.cat, placement: 3 },
      ],
    });
    expect(session(id)?.finishedAt).not.toBeNull();
  });

  test("resume undoes an accidental finish", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    finishSession(ctx.db, id);
    resumeSession(ctx.db, id);
    expect(session(id)).toMatchObject({ status: "playing", finishedAt: null });
  });

  test("status guards", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy) });
    expectCode(() => finishSession(ctx.db, id), "invalid_status");
    expectCode(() => startSession(ctx.db, id), "too_few_players");
    expectCode(() => recordResult(ctx.db, { sessionId: id, placements: [] }), "invalid_status");
    expectCode(() => startSession(ctx.db, 999), "not_found");
  });

  test("record removes seated players who are not placed", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat, p.dan) });
    startSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
      ],
    });
    expect(session(id)?.players.map((x) => x.playerId)).toEqual([p.amy, p.bob]);
  });

  test("placement validation respects allowTies", () => {
    const catan = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, catan);
    const tie = [
      { playerId: p.amy, placement: 1 },
      { playerId: p.bob, placement: 1 },
      { playerId: p.cat, placement: 3 },
    ];
    expectCode(() => recordResult(ctx.db, { sessionId: catan, placements: tie }), "ties_not_allowed");
    expectCode(
      () => recordResult(ctx.db, { sessionId: catan, placements: [{ playerId: p.eve, placement: 1 }, { playerId: p.amy, placement: 2 }] }),
      "invalid_placements",
    );

    const hitster = seatTable(ctx.db, { tableId: 2, gameId: g.hitster, players: seats(p.dan, p.eve) });
    startSession(ctx.db, hitster);
    recordResult(ctx.db, {
      sessionId: hitster,
      placements: [
        { playerId: p.dan, placement: 1 },
        { playerId: p.eve, placement: 1 },
      ],
    });
    expect(session(hitster)?.status).toBe("done");
  });

  test("cancel frees table and joker", () => {
    const id = seatTable(ctx.db, {
      tableId: 1,
      gameId: g.catan,
      players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob)],
    });
    cancelSession(ctx.db, id);
    expect(session(id)?.status).toBe("cancelled");
    const again = seatTable(ctx.db, {
      tableId: 1,
      gameId: g.catan,
      players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob)],
    });
    expect(again).toBeGreaterThan(id);
  });
});

describe("seating rules", () => {
  test("too many players for the game", () => {
    expectCode(
      () => seatTable(ctx.db, { tableId: 1, gameId: g.splendor, players: seats(p.amy, p.bob, p.cat, p.dan, p.eve) }),
      "too_many_players",
    );
  });

  test("table busy and player busy", () => {
    seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    expectCode(() => seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.cat) }), "table_busy");
    expectCode(() => seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.cat) }), "player_busy");
  });

  test("moveFromOtherTables pulls players out of a setup table but not a playing one", () => {
    const first = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.cat), moveFromOtherTables: true });
    expect(session(first)?.players.map((x) => x.playerId)).toEqual([p.bob]);

    const playing = seatTable(ctx.db, { tableId: 3, gameId: g.catan, players: seats(p.dan, p.eve) });
    startSession(ctx.db, playing);
    expectCode(
      () => updateSeating(ctx.db, first, { gameId: g.catan, players: seats(p.bob, p.dan), moveFromOtherTables: true }),
      "player_busy",
    );
  });

  test("joker can be used only once across the event", () => {
    playFullGameWithJoker();
    expectCode(
      () =>
        seatTable(ctx.db, {
          tableId: 2,
          gameId: g.catan,
          players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.dan)],
        }),
      "joker_used",
    );
  });

  test("inactive players and games cannot be seated", () => {
    updatePlayer(ctx.db, p.eve, { active: false });
    expectCode(() => seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.eve, p.amy) }), "invalid_value");
  });

  test("updateSeating edits a setup session only", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    updateSeating(ctx.db, id, {
      gameId: g.hitster,
      players: [{ playerId: p.cat, jokerDeclared: true }, ...seats(p.amy)],
      notes: "near window",
    });
    expect(session(id)).toMatchObject({ gameId: g.hitster, notes: "near window" });
    expect(session(id)?.players.map((x) => [x.playerId, x.seat, x.jokerDeclared])).toEqual([
      [p.cat, 0, true],
      [p.amy, 1, false],
    ]);
    startSession(ctx.db, id);
    expectCode(() => updateSeating(ctx.db, id, { gameId: g.catan, players: seats(p.amy, p.bob) }), "invalid_status");
  });
});

function playFullGameWithJoker() {
  const id = seatTable(ctx.db, {
    tableId: 1,
    gameId: g.catan,
    players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob, p.cat)],
  });
  startSession(ctx.db, id);
  recordResult(ctx.db, {
    sessionId: id,
    placements: [
      { playerId: p.amy, placement: 1 },
      { playerId: p.bob, placement: 2 },
      { playerId: p.cat, placement: 3 },
    ],
  });
  return id;
}

describe("direct results, edits, deletes, jokers", () => {
  test("direct result has no duration and checks jokers", () => {
    const id = recordDirectResult(ctx.db, {
      gameId: g.catan,
      tableId: null,
      placements: [
        { playerId: p.amy, placement: 1, jokerDeclared: true },
        { playerId: p.bob, placement: 2, jokerDeclared: false },
        { playerId: p.cat, placement: 3, jokerDeclared: false },
      ],
    });
    const s = session(id)!;
    expect(s).toMatchObject({ status: "done", tableId: null });
    expect(s.startedAt).toBe(s.finishedAt);
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: true },
            { playerId: p.dan, placement: 2, jokerDeclared: false },
          ],
        }),
      "joker_used",
    );
  });

  test("direct result rejects a player who is seated at an open table", () => {
    seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: false },
            { playerId: p.cat, placement: 2, jokerDeclared: false },
          ],
        }),
      "player_busy",
    );
  });

  test("edit result changes placements and jokers", () => {
    const id = playFullGame();
    editResult(ctx.db, {
      sessionId: id,
      gameId: g.hitster,
      tableId: 2,
      placements: [
        { playerId: p.cat, placement: 1, jokerDeclared: true },
        { playerId: p.amy, placement: 2, jokerDeclared: false },
      ],
    });
    const s = session(id)!;
    expect(s).toMatchObject({ gameId: g.hitster, tableId: 2, status: "done" });
    expect(s.players.map((x) => [x.playerId, x.placement, x.jokerDeclared])).toEqual([
      [p.cat, 1, true],
      [p.amy, 2, false],
    ]);
    expect(listAudit(ctx.db)[0].action).toBe("result.update");
  });

  test("correct joker on a playing session", () => {
    playFullGameWithJoker();
    const id = seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.dan) });
    startSession(ctx.db, id);
    correctJoker(ctx.db, { sessionId: id, playerId: p.dan, jokerDeclared: true });
    expect(session(id)?.players.find((x) => x.playerId === p.dan)?.jokerDeclared).toBe(true);
    expectCode(() => correctJoker(ctx.db, { sessionId: id, playerId: p.amy, jokerDeclared: true }), "joker_used");
    expectCode(() => correctJoker(ctx.db, { sessionId: id, playerId: p.eve, jokerDeclared: true }), "not_found");
  });
});

describe("undo", () => {
  test("create -> edit -> delete, then undo three times restores each prior state", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    finishSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
        { playerId: p.cat, placement: 3 },
      ],
    });
    editResult(ctx.db, {
      sessionId: id,
      gameId: g.catan,
      tableId: 1,
      placements: [
        { playerId: p.amy, placement: 3, jokerDeclared: false },
        { playerId: p.bob, placement: 1, jokerDeclared: false },
        { playerId: p.cat, placement: 2, jokerDeclared: false },
      ],
    });
    deleteResult(ctx.db, id);
    expect(session(id)).toBeUndefined();

    expect(undoLast(ctx.db).action).toBe("result.delete");
    expect(session(id)?.players.find((x) => x.playerId === p.bob)?.placement).toBe(1);

    expect(undoLast(ctx.db).action).toBe("result.update");
    expect(session(id)?.players.find((x) => x.playerId === p.amy)?.placement).toBe(1);

    expect(undoLast(ctx.db).action).toBe("result.create");
    expect(session(id)).toMatchObject({ status: "pending" });
    expect(session(id)?.players.every((x) => x.placement === null)).toBe(true);

    expectCode(() => undoLast(ctx.db), "nothing_to_undo");
    expect(listAudit(ctx.db)[0].action).toBe("undo");
  });

  test("undo of a direct result deletes it", () => {
    const id = recordDirectResult(ctx.db, {
      gameId: g.catan,
      tableId: null,
      placements: [
        { playerId: p.amy, placement: 1, jokerDeclared: false },
        { playerId: p.bob, placement: 2, jokerDeclared: false },
      ],
    });
    undoLast(ctx.db);
    expect(session(id)).toBeUndefined();
  });

  test("undo conflicts when the table was reused", () => {
    playFullGame(1);
    seatTable(ctx.db, { tableId: 1, gameId: g.hitster, players: seats(p.dan, p.eve) });
    expectCode(() => undoLast(ctx.db), "undo_conflict");
  });
});

describe("announcements and event state", () => {
  test("show on screen and replay last reveal", () => {
    const id = playFullGame();
    showOnScreen(ctx.db, id);
    replayLastReveal(ctx.db);
    expect(facts().announcements.filter((a) => a.type !== "achievement").map((a) => a.type)).toEqual([
      "result_reveal",
      "result_reveal",
    ]);
    expectCode(() => showOnScreen(ctx.db, 999), "not_found");
  });

  test("milestone announced at 10 completed results", () => {
    for (let i = 0; i < 10; i++) {
      recordDirectResult(ctx.db, {
        gameId: g.hitster,
        tableId: null,
        placements: [
          { playerId: p.dan, placement: 1, jokerDeclared: false },
          { playerId: p.eve, placement: 2, jokerDeclared: false },
        ],
      });
    }
    const milestones = facts().announcements.filter((a) => a.type === "milestone");
    expect(milestones).toHaveLength(1);
    expect(milestones[0].payload).toEqual({ count: 10 });
  });

  test("finished event blocks results but allows show on screen", () => {
    const id = playFullGame();
    finishEvent(ctx.db);
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: false },
            { playerId: p.bob, placement: 2, jokerDeclared: false },
          ],
        }),
      "event_finished",
    );
    showOnScreen(ctx.db, id);
    expect(facts().announcements.filter((a) => a.type !== "achievement")).toHaveLength(1);
  });
});
