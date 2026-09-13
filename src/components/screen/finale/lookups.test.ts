import { expect, test } from "vitest";
import { buildRehearsal } from "@/domain/finale";
import { formatHours, lookupsFromRehearsal } from "./lookups";

test("formatHours renders h:mm and a dash for unknown", () => {
  expect(formatHours(245)).toBe("4:05");
  expect(formatHours(59)).toBe("0:59");
  expect(formatHours(null)).toBe("--");
});

test("rehearsal lookups resolve every player, game and table id used by the beats", () => {
  const r = buildRehearsal();
  const l = lookupsFromRehearsal(r);
  for (const beat of r.beats) {
    if (beat.kind === "place") expect(l.players.has(beat.playerId)).toBe(true);
    if (beat.kind === "champion") expect(beat.playerIds.every((id) => l.players.has(id))).toBe(true);
    if (beat.kind === "numbers") {
      expect(l.games.has(beat.mostPlayed!.gameId)).toBe(true);
      expect(l.tables.has(beat.busiestTable!.tableId)).toBe(true);
    }
  }
});
