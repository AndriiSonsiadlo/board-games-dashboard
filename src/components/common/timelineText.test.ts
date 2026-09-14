import { expect, test } from "vitest";
import { makeGame } from "@/domain/fixtures";
import type { TimelineItem } from "@/domain/timeline";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import { nameLookup, timelineKey, timelineText } from "./timelineText";

const names = nameLookup({
  players: [
    { id: 1, name: "Amy", nickname: null, color: "#fff" },
    { id: 2, name: "Bob", nickname: null, color: "#fff" },
  ],
  games: [makeGame(1, 10, { name: "Catan" })],
  tables: [{ tableId: 7, number: 3, label: null, state: "available", session: null }],
});

const started: TimelineItem = { kind: "started", at: 0, sessionId: 1, gameId: 1, tableId: 7, playerIds: [1, 2] };
const result: TimelineItem = { kind: "result", at: 0, sessionId: 1, gameId: 1, tableId: 7, winnerIds: [1, 2], playerCount: 4 };
const unlock: TimelineItem = { kind: "unlock", at: 0, sessionId: 1, achievementId: "phoenix", playerId: 2 };
const milestone: TimelineItem = { kind: "milestone", at: 0, count: 25 };

test("english lines", () => {
  expect(timelineText(started, en, names)).toBe("Catan started · Table 3");
  expect(timelineText({ ...started, tableId: null }, en, names)).toBe("Catan started");
  expect(timelineText(result, en, names)).toBe("Amy & Bob won Catan");
  expect(timelineText(unlock, en, names)).toBe("Bob unlocked Phoenix");
  expect(timelineText(milestone, en, names)).toBe("25 games completed");
});

test("russian lines", () => {
  expect(timelineText(result, ru, names)).toBe("Catan: побеждает Amy & Bob");
  expect(timelineText(milestone, ru, names)).toBe("Сыграно игр: 25");
});

test("unknown ids fall back", () => {
  expect(names.player(99)).toBe("?");
  expect(names.game(99)).toBe("?");
  expect(names.tableNumber(99)).toBeNull();
  expect(names.tableNumber(null)).toBeNull();
});

test("keys are distinct per item", () => {
  const keys = [started, result, unlock, milestone].map(timelineKey);
  expect(new Set(keys).size).toBe(4);
});
