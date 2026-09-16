import * as lucide from "lucide-react";
import { expect, test } from "vitest";
import { BASE_GAMES } from "@/server/seed/base";
import { GAME_ICON_LIST, GAME_ICONS, searchGameIcons } from "./gameIcons";

test("unique names that exist in lucide-react and cover every seeded game icon", () => {
  const names = GAME_ICON_LIST.map((e) => e.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names.length).toBeGreaterThanOrEqual(80);
  for (const name of names) expect(name in lucide).toBe(true);
  for (const game of BASE_GAMES) expect(GAME_ICONS[game.icon]).toBeDefined();
});

test("search matches icon names and EN/RU keywords, case-insensitively", () => {
  expect(searchGameIcons("")).toHaveLength(GAME_ICON_LIST.length);
  expect(searchGameIcons("TRAIN").map((e) => e.name)).toContain("TrainFront");
  expect(searchGameIcons("кубик").map((e) => e.name)).toContain("Dices");
  expect(searchGameIcons("карты").map((e) => e.name)).toContain("Spade");
  expect(searchGameIcons("zzzz")).toEqual([]);
});
