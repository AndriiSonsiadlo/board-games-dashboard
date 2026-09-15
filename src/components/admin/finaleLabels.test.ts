import { expect, test } from "vitest";
import { buildRehearsal } from "@/domain/finale";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import { beatLabel } from "./finaleLabels";

const name = (id: number) => `#${id}`;

test("labels name the beat and, where it helps the host, the player", () => {
  const labels = buildRehearsal().beats.map((b) => beatLabel(en, "en", b, name));
  expect(labels).toEqual([
    "Event complete",
    "The evening in numbers",
    "Sealed: Giant Slayer · #6, #9",
    "Sealed: Joker Master · #3",
    "3rd place · #3",
    "2nd place · #2",
    "Champion · #1",
    "Final standings (makes standings public)",
    "Closing card",
  ]);
});

test("co-champions and Russian ordinals", () => {
  expect(beatLabel(en, "en", { kind: "champion", playerIds: [1, 2], co: true }, name)).toBe("Co-champions · #1 · #2");
  expect(beatLabel(ru, "ru", { kind: "place", place: 3, playerId: 4 }, name)).toBe("3-е место · #4");
});
