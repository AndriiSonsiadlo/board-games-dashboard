import { describe, expect, test } from "vitest";
import { makePlayer } from "./fixtures";
import {
  colorForIndex,
  findSimilarPlayers,
  initials,
  normalizeName,
  parseBulkNames,
  PLAYER_COLORS,
} from "./players";

describe("normalizeName", () => {
  test("lowercases, trims, collapses spaces, strips diacritics, folds yo", () => {
    expect(normalizeName("  Łukasz   Żak ")).toBe("lukasz zak");
    expect(normalizeName("Алёна")).toBe("алена");
    expect(normalizeName("ANDRII")).toBe("andrii");
  });
});

describe("findSimilarPlayers", () => {
  const players = [makePlayer(1, "Andrii"), makePlayer(2, "Max"), makePlayer(3, "Dmytro K")];
  test("matches equal normalized names and prefixes of 3+ chars", () => {
    expect(findSimilarPlayers(players, "andrii").map((p) => p.id)).toEqual([1]);
    expect(findSimilarPlayers(players, "Dmytro").map((p) => p.id)).toEqual([3]);
    expect(findSimilarPlayers(players, "Andrii S").map((p) => p.id)).toEqual([1]);
  });
  test("ignores short prefixes and unrelated names", () => {
    expect(findSimilarPlayers(players, "Ma")).toEqual([]);
    expect(findSimilarPlayers(players, "Sasha")).toEqual([]);
  });
});

describe("initials", () => {
  test("first letters of up to two words", () => {
    expect(initials("Andrii Sonsiadlo")).toBe("AS");
    expect(initials("max")).toBe("M");
    expect(initials("Анна Мария Петрова")).toBe("АМ");
  });
});

describe("parseBulkNames", () => {
  test("splits lines, trims, drops blanks and normalized duplicates", () => {
    expect(parseBulkNames("Max\n\n  Andrii \nmax\r\nSasha")).toEqual(["Max", "Andrii", "Sasha"]);
  });
});

describe("colorForIndex", () => {
  test("cycles the palette", () => {
    expect(colorForIndex(0)).toBe(PLAYER_COLORS[0]);
    expect(colorForIndex(PLAYER_COLORS.length)).toBe(PLAYER_COLORS[0]);
  });
});
