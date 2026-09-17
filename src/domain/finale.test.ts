import { describe, expect, test } from "vitest";
import { achievementDef } from "./achievements";
import { buildFinaleScript, buildRehearsal, clampStep, podiumGroups, revealStepOf, type FinaleBeat } from "./finale";
import { makeDoneSession, makeEvent, makeGame, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import type { StandingRow } from "./standings";
import type { Facts, SessionFact } from "./types";

const MIN = 60_000;

function facts(sessions: SessionFact[], playerCount = 5): Facts {
  return {
    event: makeEvent({ status: "finished", startedAt: 0, finishedAt: 185 * MIN, scoring: makeSettings() }),
    players: Array.from({ length: playerCount }, (_, i) => makePlayer(i + 1, `P${i + 1}`)),
    games: [makeGame(1, 10)],
    tables: [],
    sessions,
    announcements: [],
    disabledAchievements: [],
    sealedOverrides: {},
  };
}

const kinds = (beats: FinaleBeat[]) => beats.map((b) => b.kind);
const row = (playerId: number, rank: number, counted: number, wins = 1, raw = counted): StandingRow => ({
  playerId,
  rank,
  counted,
  raw,
  wins,
  podiums: 1,
  gamesPlayed: 1,
  countedSessionIds: [],
  excludedSessionIds: [],
});

describe("podiumGroups", () => {
  test("single champion, then second and third", () => {
    const g = podiumGroups([row(1, 1, 10), row(2, 2, 8), row(3, 3, 6), row(4, 4, 4)]);
    expect(g.champions.map((r) => r.playerId)).toEqual([1]);
    expect(g.second?.playerId).toBe(2);
    expect(g.third?.playerId).toBe(3);
  });

  test("co-champions when counted, wins and raw are equal", () => {
    const g = podiumGroups([row(1, 1, 10), row(2, 2, 10.0000001), row(3, 3, 6), row(4, 4, 4)]);
    expect(g.champions.map((r) => r.playerId)).toEqual([1, 2]);
    expect(g.second?.playerId).toBe(3);
    expect(g.third?.playerId).toBe(4);
  });

  test("equal counted but more wins is not a co-championship", () => {
    expect(podiumGroups([row(1, 1, 10, 2), row(2, 2, 10, 1)]).champions).toHaveLength(1);
  });

  test("unranked players never reach the podium", () => {
    const g = podiumGroups([row(1, 1, 10), { ...row(2, 2, 0), rank: null }]);
    expect(g.second).toBeNull();
  });
});

describe("buildFinaleScript", () => {
  const sessions = [
    makeDoneSession(1, 1, 60 * MIN, [[1, 1, true], [2, 2], [3, 3]]),
    makeDoneSession(2, 1, 120 * MIN, [[4, 1], [2, 2], [3, 3]]),
    makeDoneSession(3, 1, 180 * MIN, [[5, 1], [3, 2]]),
  ];

  test("orders beats and puts one beat per sealed achievement", () => {
    const f = facts(sessions);
    const rp = replay(f, f.event.scoring);
    const sealedCount = new Set(rp.unlocks.filter((u) => achievementDef(u.achievementId).sealed).map((u) => u.achievementId)).size;
    const beats = buildFinaleScript(f, rp);
    expect(sealedCount).toBeGreaterThan(0);
    expect(kinds(beats)).toEqual([
      "complete",
      "numbers",
      ...Array<string>(sealedCount).fill("sealed"),
      "place",
      "place",
      "champion",
      "podium",
      "closing",
    ]);
    expect(beats[0]).toEqual({ kind: "complete", games: 3, minutes: 185, players: 5 });
    const places = beats.filter((b): b is Extract<FinaleBeat, { kind: "place" }> => b.kind === "place");
    expect(places.map((b) => b.place)).toEqual([3, 2]);
    expect(revealStepOf(beats)).toBe(beats.findIndex((b) => b.kind === "podium") + 1);
  });

  test("an achievement the admin unsealed gets no finale beat", () => {
    const sessions = [makeDoneSession(1, 1, MIN, [[1, 1, true], [2, 2]])];
    const beatsWith = (overrides: Record<string, boolean>) => {
      const f = { ...facts(sessions), sealedOverrides: overrides };
      return buildFinaleScript(f, replay(f, f.event.scoring)).filter((b) => b.kind === "sealed");
    };
    expect(beatsWith({})).toHaveLength(1);
    expect(beatsWith({ "joker-master": false })).toHaveLength(0);
  });

  test("holders of the same sealed achievement share one beat, in unlock order", () => {
    const f = facts([
      makeDoneSession(1, 1, MIN, [[2, 1, true], [1, 2]]),
      makeDoneSession(2, 1, 2 * MIN, [[1, 1, true], [3, 2]]),
    ]);
    const sealed = buildFinaleScript(f, replay(f, f.event.scoring)).filter((b) => b.kind === "sealed");
    const joker = sealed.find((b) => b.kind === "sealed" && b.achievementId === "joker-master");
    expect(joker).toMatchObject({ kind: "sealed", achievementId: "joker-master", playerIds: [2, 1] });
    expect(sealed.map((b) => (b.kind === "sealed" ? b.order : 0))).toEqual(sealed.map((_, i) => i + 1));
  });

  test("place and champion beats carry ids only; podium carries points", () => {
    const f = facts(sessions);
    const beats = buildFinaleScript(f, replay(f, f.event.scoring));
    for (const beat of beats.filter((b) => b.kind === "place" || b.kind === "champion")) {
      expect(JSON.stringify(beat)).not.toMatch(/counted|rank|wins|points/);
    }
    const podium = beats.find((b) => b.kind === "podium");
    expect(podium && podium.kind === "podium" && podium.rows[0]).toMatchObject({ rank: 1 });
  });

  test("skips place beats that have no player and sealed beats when none unlocked", () => {
    const f = facts([makeDoneSession(1, 1, MIN, [[1, 1], [2, 2]])], 2);
    const beats = buildFinaleScript(f, replay(f, f.event.scoring));
    expect(kinds(beats)).toEqual(["complete", "numbers", "place", "champion", "podium", "closing"]);
    expect(beats.find((b) => b.kind === "place")).toEqual({ kind: "place", place: 2, playerId: 2 });
  });

  test("clampStep keeps the step inside the script", () => {
    const beats = buildFinaleScript(facts([]), replay(facts([]), makeSettings()));
    expect(clampStep(99, beats)).toBe(beats.length);
    expect(clampStep(-1, beats)).toBe(0);
  });
});

test("rehearsal contains every beat kind with resolvable names", () => {
  const r = buildRehearsal();
  expect(new Set(kinds(r.beats))).toEqual(new Set(["complete", "numbers", "sealed", "place", "champion", "podium", "closing"]));
  const ids = new Set(r.players.map((p) => p.id));
  const champion = r.beats.find((b) => b.kind === "champion");
  expect(champion && champion.kind === "champion" && champion.playerIds.every((id) => ids.has(id))).toBe(true);
});
