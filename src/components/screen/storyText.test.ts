import { expect, test } from "vitest";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import type { NameLookup } from "../common/timelineText";
import { storyText } from "./storyText";

const playerNames: Record<number, string> = { 1: "Amy", 2: "Bob" };
const names: NameLookup = {
  player: (id) => playerNames[id] ?? "?",
  game: () => "Catan",
  tableNumber: () => 3,
};

test("english stories", () => {
  expect(storyText({ kind: "streak", playerId: 1, streak: 3 }, en, "en", names)).toEqual({
    kicker: "On fire",
    line: "Amy: 3 wins in a row",
  });
  expect(storyText({ kind: "milestone", next: 25, remaining: 1 }, en, "en", names).line).toBe("1 game to go until game 25");
  expect(storyText({ kind: "rivals", playerIds: [1, 2], count: 4 }, en, "en", names).line).toBe("Amy and Bob have shared 4 games");
  expect(storyText({ kind: "collector", playerId: 2, count: 3 }, en, "en", names).line).toBe("Bob has unlocked 3 achievements");
  expect(storyText({ kind: "popular", gameId: 1, count: 5 }, en, "en", names).line).toBe("Catan, played 5 times");
  expect(storyText({ kind: "longest", gameId: 1, tableId: 2, durationMin: 1 }, en, "en", names).line).toBe("Catan lasted 1 minute");
});

test("russian plurals", () => {
  expect(storyText({ kind: "streak", playerId: 1, streak: 5 }, ru, "ru", names).line).toBe("Amy: 5 побед подряд");
  expect(storyText({ kind: "popular", gameId: 1, count: 3 }, ru, "ru", names).line).toBe("Catan: сыграно 3 раза");
});
