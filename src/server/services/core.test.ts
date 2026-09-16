import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { verifyPin } from "../auth/pin";
import { signToken, verifyToken } from "../auth/token";
import { getDataVersion, loadFacts, loadSecrets } from "../repo/facts";
import { insertPlayer, insertSession } from "../repo/writes";
import { createTestDb } from "../testDb";
import { addTable, createGame, deleteGame, removeTable, updateGame, updateTable } from "./catalog";
import { ServiceError } from "./errors";
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
} from "./event";
import { addPlayer, bulkAddPlayers, checkIn, mergePlayers, updatePlayer } from "./players";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

const facts = () => loadFacts(ctx.db);

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

describe("event lifecycle", () => {
  test("mutations bump version", () => {
    const v = getDataVersion(ctx.db);
    addPlayer(ctx.db, { name: "Amy" });
    expect(getDataVersion(ctx.db)).toBe(v + 1);
  });

  test("draft -> live -> finished -> live", () => {
    goLive(ctx.db, { clearDemo: false });
    expect(facts().event.status).toBe("live");
    expect(facts().event.startedAt).not.toBeNull();
    expectCode(() => goLive(ctx.db, { clearDemo: false }), "invalid_status");

    finishEvent(ctx.db);
    expect(facts().event.status).toBe("finished");
    expectCode(() => addPlayer(ctx.db, { name: "Late" }), "event_finished");

    reopenEvent(ctx.db);
    expect(facts().event).toMatchObject({ status: "live", finishedAt: null, finaleRevealed: false });
    expect(addPlayer(ctx.db, { name: "Late" })).toBeGreaterThan(0);
  });

  test("cannot finish with open sessions", () => {
    goLive(ctx.db, { clearDemo: false });
    const a = insertPlayer(ctx.db, { name: "A", nickname: null, color: "#fff", source: "admin", createdAt: 1 });
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "playing", createdAt: 1, startedAt: 1 }, [
      { playerId: a, seat: 0, jokerDeclared: false, placement: null },
    ]);
    expectCode(() => finishEvent(ctx.db), "open_sessions");
  });

  test("go live can clear demo data", () => {
    insertPlayer(ctx.db, { name: "Demo", nickname: null, color: "#fff", source: "admin", isDemo: true, createdAt: 1 });
    goLive(ctx.db, { clearDemo: true });
    expect(facts().players).toEqual([]);
  });

  test("clearDemoData removes demo players", () => {
    insertPlayer(ctx.db, { name: "Demo", nickname: null, color: "#fff", source: "admin", isDemo: true, createdAt: 1 });
    clearDemoData(ctx.db);
    expect(facts().players).toEqual([]);
  });
});

describe("settings", () => {
  test("scoring validates and persists", () => {
    updateScoring(ctx.db, { strategy: "total", bestN: 5, participationFloor: 0.25, jokerMultiplier: 2 });
    expect(facts().event.scoring).toEqual({
      strategy: "total",
      bestN: 5,
      participationFloor: 0.25,
      jokerMultiplier: 2,
    });
    expectCode(() => updateScoring(ctx.db, { bestN: 0 }), "invalid_value");
    expectCode(() => updateScoring(ctx.db, { participationFloor: 0.6 }), "invalid_value");
    expectCode(() => updateScoring(ctx.db, { jokerMultiplier: 0.5 }), "invalid_value");
  });

  test("scoring and screen settings are allowed on a finished event", () => {
    goLive(ctx.db, { clearDemo: false });
    finishEvent(ctx.db);
    updateScoring(ctx.db, { bestN: 3 });
    updateScreenSettings(ctx.db, { sceneDurationSec: 20 });
    expect(facts().event.scoring.bestN).toBe(3);
  });

  test("screen settings validate scenes and duration", () => {
    updateScreenSettings(ctx.db, {
      enabledScenes: ["room", "contenders"],
      showPointsInReveals: true,
      screenLang: "ru",
    });
    expect(facts().event).toMatchObject({
      enabledScenes: ["room", "contenders"],
      showPointsInReveals: true,
      screenLang: "ru",
    });
    expectCode(() => updateScreenSettings(ctx.db, { enabledScenes: [] }), "invalid_value");
    expectCode(() => updateScreenSettings(ctx.db, { sceneDurationSec: 2 }), "invalid_value");
  });

  test("event info validates accent color and base url", () => {
    updateEventInfo(ctx.db, { city: "Warszawa", accentColor: "#AABBCC", publicBaseUrl: "http://192.168.1.5:3000/" });
    expect(facts().event).toMatchObject({
      city: "Warszawa",
      accentColor: "#aabbcc",
      publicBaseUrl: "http://192.168.1.5:3000",
    });
    expectCode(() => updateEventInfo(ctx.db, { accentColor: "gold" }), "invalid_value");
    expectCode(() => updateEventInfo(ctx.db, { publicBaseUrl: "ftp://x" }), "invalid_value");
  });

  test("branding trims, stores blanks as unset, validates length and works after finish", () => {
    updateBranding(ctx.db, { brandTopRu: "  HIS^ ", brandMainRu: "ВЕЧЕР НАСТОЛОК", brandTopEn: "   " });
    expect(facts().event.brandFields).toEqual({
      brandTopEn: null,
      brandMainEn: null,
      brandTopRu: "HIS^",
      brandMainRu: "ВЕЧЕР НАСТОЛОК",
    });
    expectCode(() => updateBranding(ctx.db, { brandMainEn: "x".repeat(41) }), "invalid_value");
    goLive(ctx.db, { clearDemo: false });
    finishEvent(ctx.db);
    updateBranding(ctx.db, { brandMainEn: "Night" });
    expect(facts().event.brandFields.brandMainEn).toBe("Night");
  });

  test("screen commands", () => {
    screenCommand(ctx.db, "pause");
    expect(facts().event.screenControl.paused).toBe(true);
    screenCommand(ctx.db, "resume");
    screenCommand(ctx.db, "skip");
    expect(facts().event.screenControl).toEqual({ paused: false, skipNonce: 1, finaleStep: 0 });
  });

  test("change PIN", () => {
    expectCode(() => changePin(ctx.db, { current: "0000", next: "5678" }), "wrong_pin");
    expectCode(() => changePin(ctx.db, { current: "1234", next: "12" }), "invalid_value");
    changePin(ctx.db, { current: "1234", next: "5678" });
    expect(verifyPin("5678", loadSecrets(ctx.db).adminPinHash)).toBe(true);
  });

  test("change PIN invalidates existing session tokens", () => {
    const before = loadSecrets(ctx.db).sessionSecret;
    const token = signToken(before, Date.now() + 1000);
    expect(verifyToken(before, token)).toBe(true);

    changePin(ctx.db, { current: "1234", next: "5678" });

    const after = loadSecrets(ctx.db).sessionSecret;
    expect(after).not.toBe(before);
    // The old token was signed with the rotated-away secret, so it must fail now.
    expect(verifyToken(after, token)).toBe(false);
  });
});

describe("players", () => {
  test("add assigns cycling colors and trims", () => {
    addPlayer(ctx.db, { name: "  Amy  ", nickname: " A " });
    addPlayer(ctx.db, { name: "Bob" });
    const [amy, bob] = facts().players;
    expect(amy).toMatchObject({ name: "Amy", nickname: "A", source: "admin", active: true });
    expect(amy.color).not.toBe(bob.color);
    expectCode(() => addPlayer(ctx.db, { name: "   " }), "invalid_name");
  });

  test("bulk add skips existing and duplicate names", () => {
    addPlayer(ctx.db, { name: "Max" });
    const ids = bulkAddPlayers(ctx.db, "max\nAndrii\n\nSasha\nandrii");
    expect(ids).toHaveLength(2);
    expect(facts().players.map((p) => p.name)).toEqual(["Max", "Andrii", "Sasha"]);
  });

  test("check-in creates a checkin player", () => {
    const id = checkIn(ctx.db, { name: "Olena", nickname: null });
    expect(facts().players.find((p) => p.id === id)?.source).toBe("checkin");
  });

  test("check-in rejects an exact-normalized-name duplicate but allows genuinely new names", () => {
    checkIn(ctx.db, { name: "Olena", nickname: null });
    // Different capitalization/whitespace still normalizes to the same name.
    expectCode(() => checkIn(ctx.db, { name: "  olena  ", nickname: null }), "duplicate_name");
    expect(facts().players).toHaveLength(1);

    const id = checkIn(ctx.db, { name: "Sasha", nickname: null });
    expect(facts().players.map((p) => p.id)).toContain(id);
  });

  test("update player", () => {
    const id = addPlayer(ctx.db, { name: "Amy" });
    updatePlayer(ctx.db, id, { name: "Amelia", active: false });
    expect(facts().players[0]).toMatchObject({ name: "Amelia", active: false });
    expectCode(() => updatePlayer(ctx.db, 999, { name: "X" }), "not_found");
  });

  test("merge moves seats and deletes the duplicate", () => {
    const keep = addPlayer(ctx.db, { name: "Andrii" });
    const dup = addPlayer(ctx.db, { name: "andrii s" });
    const other = addPlayer(ctx.db, { name: "Max" });
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "done", createdAt: 1, finishedAt: 2 }, [
      { playerId: dup, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: other, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    mergePlayers(ctx.db, { keepId: keep, removeId: dup });
    const f = facts();
    expect(f.players.map((p) => p.id)).toEqual([keep, other]);
    expect(f.sessions[0].players.map((p) => p.playerId)).toEqual([keep, other]);
  });

  test("merge conflicts when both sat in one session or both used a joker", () => {
    const a = addPlayer(ctx.db, { name: "A1" });
    const b = addPlayer(ctx.db, { name: "A2" });
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "done", createdAt: 1, finishedAt: 2 }, [
      { playerId: a, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: b, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    expectCode(() => mergePlayers(ctx.db, { keepId: a, removeId: b }), "merge_conflict");

    const c = addPlayer(ctx.db, { name: "C1" });
    const d = addPlayer(ctx.db, { name: "C2" });
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "done", createdAt: 1, finishedAt: 3 }, [
      { playerId: c, seat: 0, jokerDeclared: true, placement: 1 },
      { playerId: a, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "done", createdAt: 1, finishedAt: 4 }, [
      { playerId: d, seat: 0, jokerDeclared: true, placement: 1 },
      { playerId: b, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    expectCode(() => mergePlayers(ctx.db, { keepId: c, removeId: d }), "merge_conflict");
    expectCode(() => mergePlayers(ctx.db, { keepId: c, removeId: c }), "invalid_value");
  });
});

describe("catalog", () => {
  test("update game validates weight and player counts", () => {
    const uno = facts().games.find((g) => g.slug === "uno")!;
    updateGame(ctx.db, uno.id, { weight: 5, maxPlayers: 8, allowTies: true });
    expect(facts().games.find((g) => g.id === uno.id)).toMatchObject({ weight: 5, maxPlayers: 8, allowTies: true });
    expectCode(() => updateGame(ctx.db, uno.id, { weight: 0 }), "invalid_value");
    expectCode(() => updateGame(ctx.db, uno.id, { minPlayers: 9 }), "invalid_value");
    expectCode(() => updateGame(ctx.db, 999, { weight: 3 }), "not_found");
  });

  test("tables: add numbers sequentially, remove deletes unused or deactivates used", () => {
    const id = addTable(ctx.db, "Window");
    expect(facts().tables.find((t) => t.id === id)).toMatchObject({ number: 4, label: "Window" });
    expect(removeTable(ctx.db, id)).toBe("deleted");

    const a = insertPlayer(ctx.db, { name: "A", nickname: null, color: "#fff", source: "admin", createdAt: 1 });
    insertSession(ctx.db, { tableId: 1, gameId: 1, status: "playing", createdAt: 1, startedAt: 1 }, [
      { playerId: a, seat: 0, jokerDeclared: false, placement: null },
    ]);
    expectCode(() => removeTable(ctx.db, 1), "table_in_use");
    expectCode(() => updateTable(ctx.db, 1, { active: false }), "table_in_use");

    insertSession(ctx.db, { tableId: 2, gameId: 1, status: "done", createdAt: 1, finishedAt: 2 }, []);
    expect(removeTable(ctx.db, 2)).toBe("deactivated");
    expect(facts().tables.find((t) => t.id === 2)?.active).toBe(false);
  });
});

describe("custom games", () => {
  const azul = {
    name: "Azul",
    descriptionEn: "Draft tiles, score patterns.",
    descriptionRu: "Набирайте плитки и собирайте узоры.",
    icon: "Gem",
    category: "abstract",
    durationMin: 40,
    weight: 7,
    minPlayers: 2,
    maxPlayers: 4,
    allowTies: false,
    active: true,
    family: null,
  };
  const game = (id: number) => facts().games.find((g) => g.id === id);

  test("create trims the name and gives a unique slug that is also its family", () => {
    const a = createGame(ctx.db, azul);
    const b = createGame(ctx.db, { ...azul, name: "  Azul " });
    expect(game(a)).toMatchObject({ name: "Azul", slug: "azul", family: "azul", icon: "Gem", weight: 7 });
    expect(game(b)).toMatchObject({ name: "Azul", slug: "azul-2", family: "azul-2" });
  });

  test("a variant joins an existing family; bad input is rejected", () => {
    const seafarers = createGame(ctx.db, { ...azul, name: "Catan: Seafarers", family: "catan" });
    expect(game(seafarers)?.family).toBe("catan");
    expectCode(() => createGame(ctx.db, { ...azul, family: "nope" }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, minPlayers: 5, maxPlayers: 4 }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, icon: "<svg>" }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, name: "   " }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, category: "" }), "invalid_value");
  });

  test("update renames, re-icons and moves between families but never changes the slug", () => {
    const id = createGame(ctx.db, azul);
    updateGame(ctx.db, id, { name: "Azul Duel", icon: "Crown", family: "catan", descriptionRu: "Дуэль" });
    expect(game(id)).toMatchObject({ name: "Azul Duel", icon: "Crown", family: "catan", slug: "azul", descriptionRu: "Дуэль" });
    updateGame(ctx.db, id, { family: "azul" });
    expect(game(id)?.family).toBe("azul");
    expectCode(() => updateGame(ctx.db, id, { family: "nope" }), "invalid_value");
  });

  test("only games that were never used can be deleted", () => {
    const unused = createGame(ctx.db, azul);
    deleteGame(ctx.db, unused);
    expect(game(unused)).toBeUndefined();
    const used = createGame(ctx.db, { ...azul, name: "Used" });
    const p = insertPlayer(ctx.db, { name: "A", nickname: null, color: "#fff", source: "admin", createdAt: 1 });
    insertSession(ctx.db, { tableId: null, gameId: used, status: "cancelled", createdAt: 1 }, [
      { playerId: p, seat: 0, jokerDeclared: false, placement: null },
    ]);
    expectCode(() => deleteGame(ctx.db, used), "game_in_use");
    expectCode(() => deleteGame(ctx.db, 999), "not_found");
  });
});
