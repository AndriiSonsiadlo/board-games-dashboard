import { describe, expect, test } from "vitest";
import { en } from "./en";
import { fmt, getDict, isLang, ordinal, plural } from "./index";
import { ru } from "./ru";

function shape(value: unknown, path = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
  }
  return [path];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("dictionaries", () => {
  test("ru has exactly the same keys as en", () => {
    const enKeys = shape(en).filter((k) => !/\.(few|many)$/.test(k));
    const ruKeys = shape(ru).filter((k) => !/\.(few|many)$/.test(k));
    expect(ruKeys.sort()).toEqual(enKeys.sort());
  });

  test("no emoji and no empty strings", () => {
    for (const s of [...strings(en), ...strings(ru)]) {
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  test("getDict and isLang", () => {
    expect(getDict("ru")).toBe(ru);
    expect(getDict("en")).toBe(en);
    expect(isLang("ru")).toBe(true);
    expect(isLang("de")).toBe(false);
  });
});

describe("helpers", () => {
  test("fmt replaces known variables and keeps unknown ones", () => {
    expect(fmt("Table {n} · {x}", { n: 3 })).toBe("Table 3 · {x}");
  });

  test("plural uses CLDR categories", () => {
    expect(plural("en", 1, en.plurals.players)).toBe("player");
    expect(plural("en", 5, en.plurals.players)).toBe("players");
    expect(plural("ru", 1, ru.plurals.players)).toBe("игрок");
    expect(plural("ru", 3, ru.plurals.players)).toBe("игрока");
    expect(plural("ru", 5, ru.plurals.players)).toBe("игроков");
    expect(plural("ru", 21, ru.plurals.players)).toBe("игрок");
  });

  test("ordinal", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map((n) => ordinal("en", n))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ]);
    expect(ordinal("ru", 2)).toBe("2-е");
  });
});
