# Board Games Cup — Tier 2 (Celebration, Achievements, Finale, Profiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of the shipped Tier 1 app, add a cinematic result celebration, 22 achievements with live unlock announcements, the manually driven finale ceremony (with rehearsal mode), achievement pages and player profiles.

**Architecture:** Achievements are derived state: `replay()` (pure, `src/domain`) now also returns `unlocks`, computed from the replay steps, so corrections and undo can never leave stale unlocks. The finale is a pure "script" of beats built from facts + replay; `screenControl.finaleStep` is a 1-based index into it and the public snapshot only ever carries the *current* beat. Services wrap result-changing mutations to diff unlocks before/after and enqueue `achievement` announcements. The projector plays announcements from a local queue that holds achievement cards briefly so a reveal of the same game plays first.

**Tech Stack:** Next.js 16.3 (App Router, `params`/`searchParams` are Promises), React 19, TypeScript strict, Tailwind CSS 4, motion 13 (`motion/react`), lucide-react 1.x, better-sqlite3 13 + drizzle-orm 0.45 + drizzle-kit 0.31, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-15-board-games-cup-design.md` (Tier 2 row of §1; §3.3, §3.4, §8, §10 Interrupts + Finale, §11, §12 Motion). Tier 1 plan for conventions: `docs/superpowers/plans/2026-09-15-board-games-cup-tier1.md`.

**Out of this plan (Tier 3):** `/stats`, `/timeline`, QR sheet, hot-streak marker, heatmap, `story`/`popular` scenes, screen ticker. Tier 2 adds only the four stats the finale needs (`src/domain/stats.ts`), which Tier 3 extends.

## Global Constraints

- No emoji anywhere in UI strings, code, or seed data. Icons come from `lucide-react` or custom SVG.
- Public audience never receives these keys before `event.finaleRevealed` is true: `points`, `base`, `rank`, `counted`, `raw`, `jokerDeclared`, `jokerUsed`, `gamesPlayed`, `wins`, `podiums`, `trend`, `excludedSessionIds`, `countedSessionIds`. The only pre-reveal exceptions remain the Tier 1 ones (`points` inside `announcements` when `showPointsInReveals`).
- Sealed achievements (`comeback`, `underdog`, `giant-slayer`, `joker-master`, `risk-taker`): before reveal the public audience gets only `sealedUnlockCount`, never who/when. They are never announced on the projector outside the finale.
- The finale beat for 3rd/2nd place and champion carries player ids only (no points, no rank). Points appear in the `podium` beat, which is the step that sets `finaleRevealed = true` in the same transaction.
- `/screen` always uses the public audience. `/screen?rehearsal=1` reads no database state.
- "Win" = placement 1, including a tie for 1st.
- Every mutation goes through `mutate()` (version bump in the same transaction). Finale control and achievement toggles pass `{ allowWhenFinished: true }`.
- Motion: one easing `EASE = [0.2, 0.8, 0.2, 1]` from `src/components/motion/FadeRise.tsx`; `GoldDust` draws at most 40 particles and is used only for the winner reveal and the finale.
- Timings: result reveal ≈ 13 s for 4 players (winner hold 4 s, podium hold 3 s); achievement card 5.5 s; achievement hold before playing 15 s (`ACHIEVEMENT_HOLD_MS`); finale auto-advance 10 s; announcement window stays 120 s.
- Every new string goes into both `src/i18n/en.ts` and `src/i18n/ru.ts` (`ru: Dict`); game names stay in Latin script in Russian text.
- Radius max 6 px, 1 px hairlines, no new gradients.
- Run `npm test`, `npm run typecheck` and `npm run lint` at the end of every task; all three must pass before committing.

## File Structure

```
src/domain/
  replay.ts            MODIFY  PlayerResult gains family, durationMin, opponents, last; Replay gains unlocks
  achievements.ts      CREATE  22 definitions, computeUnlocks, rarityOf, newPublicUnlocks
  standings.ts         MODIFY  export pointsEqual
  stats.ts             CREATE  mostPlayedGame, longestResult, busiestTable, rivals
  finale.ts            CREATE  FinaleBeat, buildFinaleScript, revealStepOf, podiumGroups, buildRehearsal
  snapshot.ts          MODIFY  achievements view, achievement announcements, finale views, counter
  profile.ts           CREATE  buildProfile (privacy-aware player profile)
  types.ts             MODIFY  AnnouncementFact achievement, Facts.disabledAchievements, SceneId achievements
  fixtures.ts          MODIFY  FORBIDDEN_PUBLIC_KEYS, keysDeep shared by privacy tests
src/server/
  db/schema.ts         MODIFY  achievement_settings table, announcement type/payload
  repo/facts.ts        MODIFY  disabledAchievements, achievement announcements, limit 50
  repo/writes.ts       MODIFY  insertAnnouncement union, upsertAchievementSetting
  services/achievements.ts CREATE withUnlockAnnouncements, mutateResult, setAchievementEnabled
  services/finale.ts   CREATE  finaleCommand, setFinaleRevealed
  services/sessions.ts MODIFY  result-changing mutations use mutateResult
  seed/base.ts         MODIFY  enabledScenes from DEFAULT_SCENES
  live.ts              MODIFY  getProfile
drizzle/0001_achievement_settings.sql, drizzle/0002_enable_achievements_scene.sql
src/i18n/en.ts, ru.ts  MODIFY  Tier 2 strings
src/components/motion/ MaskReveal.tsx, NumberRoll.tsx, GoldDust.tsx
src/components/common/AchievementIcon.tsx
src/components/screen/
  logic.ts             MODIFY  revealTimeline podium phase, podiumSlots, pickNext, availableScenes
  ResultReveal.tsx     MODIFY  podium phase + GoldDust
  AnnouncementPlayer.tsx MODIFY queue with pickNext, achievement cards
  AchievementCard.tsx  CREATE
  scenes/SceneAchievements.tsx CREATE; scenes/SceneCounters.tsx MODIFY
  finale/FinaleStage.tsx, finale/beats.tsx, finale/RehearsalApp.tsx CREATE
  ScreenApp.tsx        MODIFY  finale takeover, achievements scene
src/app/screen/page.tsx MODIFY rehearsal branch
src/components/admin/  FinaleRemote.tsx, AchievementsAdmin.tsx, UnlockFeed.tsx CREATE; AdminNav, ControlRoom, SettingsView, PlayersView MODIFY
src/app/admin/(panel)/finale/page.tsx, achievements/page.tsx CREATE; src/app/admin/actions.ts MODIFY
src/components/public/ AchievementsView.tsx, ProfileView.tsx, RankChart.tsx, rankChart.ts, FindMe.tsx CREATE; HomeView MODIFY
src/app/(public)/achievements/page.tsx, players/[id]/page.tsx CREATE
README.md              MODIFY
```

---

### Task 1: Achievements engine in replay

**Files:**
- Modify: `src/domain/replay.ts`
- Create: `src/domain/achievements.ts`
- Test: `src/domain/achievements.test.ts`, `src/domain/replay.test.ts`

**Interfaces:**
- Consumes: `replay()`, `ReplayResult`, `ReplayStep`, `PlayerResult`, `StandingRow`, `GameFact`, fixtures `makePlayer/makeGame/makeDoneSession/makeSettings`.
- Produces:
  - `PlayerResult` new fields: `family: string; durationMin: number | null; opponents: number[]; last: boolean`.
  - `ReplayInput.disabledAchievements?: string[]`; `Replay.unlocks: Unlock[]` (chronological).
  - `ACHIEVEMENT_IDS` (readonly tuple), `type AchievementId`, `interface AchievementDef { id; icon: string; sealed: boolean; check(ctx, playerId): boolean; progress?(history): { current: number; target: number } }`, `interface ResultContext { index; result: ReplayResult; game: GameFact; before: StandingRow[]; after: StandingRow[]; historyOf(playerId): PlayerResult[] }`, `interface Unlock { achievementId: AchievementId; playerId: number; sessionId: number; at: number }`, `ACHIEVEMENTS: AchievementDef[]`, `achievementDef(id: AchievementId): AchievementDef`, `isAchievementId(v: unknown): v is AchievementId`, `computeUnlocks(input, gamesById, disabled): Unlock[]`, `type Rarity = "legendary" | "epic" | "rare" | "common"`, `rarityOf(count, eligible): Rarity | null`, `unlockKey(u): string`, `newPublicUnlocks(before: Unlock[], after: Unlock[]): Unlock[]`.

- [ ] **Step 1: Write the failing replay test for the new PlayerResult fields**

Append to `src/domain/replay.test.ts` inside `describe("replay", ...)`:

```ts
  test("player results carry family, duration, opponents and last-place flag", () => {
    const tied = makeDoneSession(3, 2, 3000, [
      [1, 1],
      [2, 2],
      [4, 2],
    ], { tableId: null, startedAt: 3000 });
    const result = replay({ players, games, sessions: [r1, tied] }, makeSettings());
    const amyR1 = result.byPlayer.get(1)!.find((r) => r.sessionId === 1)!;
    expect(amyR1.family).toBe("game-1");
    expect(amyR1.durationMin).toBe(30);
    expect(amyR1.opponents).toEqual([2, 3]);
    expect(amyR1.last).toBe(false);
    expect(result.byPlayer.get(3)!.find((r) => r.sessionId === 1)!.last).toBe(true);
    const danTied = result.byPlayer.get(4)!.find((r) => r.sessionId === 3)!;
    expect(danTied.last).toBe(true);
    expect(danTied.durationMin).toBeNull();
    expect(danTied.tableId).toBeNull();
    expect(result.unlocks.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Write the failing achievements test file**

Create `src/domain/achievements.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  achievementDef,
  isAchievementId,
  newPublicUnlocks,
  rarityOf,
  type AchievementId,
  type Unlock,
} from "./achievements";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import type { ScoringSettings, SessionFact } from "./types";

const players = Array.from({ length: 12 }, (_, i) => makePlayer(i + 1, `P${String(i + 1).padStart(2, "0")}`));
const FAMILY_GAMES: Array<[number, string]> = [
  [1, "catan"],
  [2, "ticket-to-ride"],
  [3, "splendor"],
  [4, "hitster"],
  [5, "seven-wonders"],
  [6, "citadels"],
  [7, "rats-race"],
  [8, "uno"],
];
const games = [
  ...FAMILY_GAMES.map(([id, family]) => makeGame(id, 10, { family, allowTies: family === "hitster" })),
  makeGame(9, 1, { family: "filler" }),
  makeGame(10, 10, { family: "big" }),
];
const MIN = 60_000;

function unlocksOf(sessions: SessionFact[], opts: { disabled?: string[]; settings?: Partial<ScoringSettings> } = {}) {
  return replay({ players, games, sessions, disabledAchievements: opts.disabled }, makeSettings(opts.settings)).unlocks;
}
const has = (unlocks: Unlock[], id: AchievementId, playerId: number) =>
  unlocks.some((u) => u.achievementId === id && u.playerId === playerId);
/** Two-player result where `winner` beats `loser` at `at` minutes. */
const duel = (id: number, gameId: number, at: number, winner: number, loser: number, overrides: Partial<SessionFact> = {}) =>
  makeDoneSession(id, gameId, at * MIN, [
    [winner, 1],
    [loser, 2],
  ], overrides);

describe("definitions", () => {
  test("22 unique ids, five sealed", () => {
    expect(ACHIEVEMENT_IDS).toHaveLength(22);
    expect(ACHIEVEMENTS.map((d) => d.id)).toEqual([...ACHIEVEMENT_IDS]);
    expect(ACHIEVEMENTS.filter((d) => d.sealed).map((d) => d.id).sort()).toEqual(
      ["comeback", "giant-slayer", "joker-master", "risk-taker", "underdog"],
    );
    expect(isAchievementId("phoenix")).toBe(true);
    expect(isAchievementId("nope")).toBe(false);
  });
});

describe("game wins", () => {
  const byFamily: Record<string, AchievementId> = {
    catan: "catan-lord",
    "ticket-to-ride": "rail-baron",
    splendor: "gem-master",
    hitster: "music-master",
    "seven-wonders": "wonder-architect",
    citadels: "kingmaker",
    "rats-race": "rat-king",
    uno: "last-card",
  };
  test.each(FAMILY_GAMES)("game %i (%s) unlocks for the winner only", (gameId, family) => {
    const unlocks = unlocksOf([duel(1, gameId, 10, 1, 2)]);
    expect(has(unlocks, byFamily[family], 1)).toBe(true);
    expect(has(unlocks, byFamily[family], 2)).toBe(false);
  });

  test("a tie for first counts as a win for everyone tied", () => {
    const unlocks = unlocksOf([
      makeDoneSession(1, 4, 10 * MIN, [
        [1, 1],
        [2, 1],
        [3, 3],
      ]),
    ]);
    expect(has(unlocks, "music-master", 1)).toBe(true);
    expect(has(unlocks, "music-master", 2)).toBe(true);
    expect(has(unlocks, "music-master", 3)).toBe(false);
  });

  test("unlock records session and finish time, once per player", () => {
    const unlocks = unlocksOf([duel(1, 1, 10, 1, 2), duel(2, 1, 20, 1, 2)]);
    expect(unlocks.filter((u) => u.achievementId === "catan-lord")).toEqual([
      { achievementId: "catan-lord", playerId: 1, sessionId: 1, at: 10 * MIN },
    ]);
  });
});

describe("streaks and firsts", () => {
  test("opening move goes to the winner of the first result only", () => {
    const unlocks = unlocksOf([duel(2, 9, 20, 3, 4), duel(1, 9, 10, 1, 2)]);
    expect(has(unlocks, "opening-move", 1)).toBe(true);
    expect(has(unlocks, "opening-move", 3)).toBe(false);
  });

  test("back-to-back needs consecutive wins in the player's own results", () => {
    const yes = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 3, 4), duel(3, 9, 30, 1, 5)]);
    expect(yes.find((u) => u.achievementId === "back-to-back" && u.playerId === 1)?.sessionId).toBe(3);
    const broken = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 2, 1), duel(3, 9, 30, 1, 5)]);
    expect(has(broken, "back-to-back", 1)).toBe(false);
  });

  test("hot streak needs three wins in a row", () => {
    const two = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 1, 3)]);
    expect(has(two, "hot-streak", 1)).toBe(false);
    const three = unlocksOf([duel(1, 9, 10, 1, 2), duel(2, 9, 20, 1, 3), duel(3, 9, 30, 1, 4)]);
    expect(has(three, "hot-streak", 1)).toBe(true);
  });

  test("phoenix: win right after finishing last, ties for last count", () => {
    const afterLast = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [2, 1],
        [3, 2],
        [1, 2],
      ]),
      duel(2, 9, 20, 1, 4),
    ]);
    expect(has(afterLast, "phoenix", 1)).toBe(true);
    const afterSecond = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [2, 1],
        [1, 2],
        [3, 3],
      ]),
      duel(2, 9, 20, 1, 4),
    ]);
    expect(has(afterSecond, "phoenix", 1)).toBe(false);
  });
});

describe("progress achievements", () => {
  test("triple threat: wins in three families, with progress", () => {
    const sessions = [duel(1, 1, 10, 1, 2), duel(2, 2, 20, 1, 2), duel(3, 1, 30, 1, 2)];
    expect(has(unlocksOf(sessions), "triple-threat", 1)).toBe(false);
    const rp = replay({ players, games, sessions }, makeSettings());
    expect(achievementDef("triple-threat").progress!(rp.byPlayer.get(1)!)).toEqual({ current: 2, target: 3 });
    expect(has(unlocksOf([...sessions, duel(4, 3, 40, 1, 2)]), "triple-threat", 1)).toBe(true);
  });

  test("all-rounder: five families played", () => {
    const four = [1, 2, 3, 5].map((gameId, i) => duel(i + 1, gameId, (i + 1) * 10, 2, 1));
    expect(has(unlocksOf(four), "all-rounder", 1)).toBe(false);
    expect(has(unlocksOf([...four, duel(5, 6, 50, 2, 1)]), "all-rounder", 1)).toBe(true);
  });

  test("table hopper: four different tables, direct results without table ignored", () => {
    const sessions = [1, 2, 3].map((tableId) => duel(tableId, 9, tableId * 10, 1, 2, { tableId }));
    const noTable = duel(4, 9, 40, 1, 2, { tableId: null });
    expect(has(unlocksOf([...sessions, noTable]), "table-hopper", 1)).toBe(false);
    expect(has(unlocksOf([...sessions, duel(5, 9, 50, 1, 2, { tableId: 4 })]), "table-hopper", 1)).toBe(true);
  });

  test("social butterfly: eight distinct opponents", () => {
    const first = makeDoneSession(1, 9, 10 * MIN, [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
    const second = makeDoneSession(2, 9, 20 * MIN, [
      [1, 1],
      [2, 2],
      [6, 3],
      [7, 4],
    ]);
    expect(has(unlocksOf([first, second]), "social-butterfly", 1)).toBe(false);
    const third = makeDoneSession(3, 9, 30 * MIN, [
      [8, 1],
      [9, 2],
      [1, 3],
    ]);
    expect(has(unlocksOf([first, second, third]), "social-butterfly", 1)).toBe(true);
  });

  test("marathon: 180 minutes across sessions with a real duration", () => {
    const five = [1, 2, 3, 4, 5].map((i) => duel(i, 9, i * 60, 2, 1));
    const direct = duel(6, 9, 400, 2, 1, { startedAt: 400 * MIN });
    expect(has(unlocksOf([...five, direct]), "marathon", 1)).toBe(false);
    expect(has(unlocksOf([...five, duel(7, 9, 500, 2, 1)]), "marathon", 1)).toBe(true);
  });
});

describe("sealed achievements", () => {
  const filler = (id: number, at: number, winner: number) => duel(id, 9, at, winner, 7);

  test("comeback: rise of 3+ ranks counts only from the 10th result", () => {
    const early = [filler(1, 1, 2), filler(2, 2, 3), filler(3, 3, 4), filler(4, 4, 5), duel(5, 9, 5, 6, 1)];
    const bigWin = (id: number, at: number) => duel(id, 10, at, 1, 7);
    expect(has(unlocksOf([...early, bigWin(6, 6)]), "comeback", 1)).toBe(false);
    const later = [...early, filler(6, 6, 2), filler(7, 7, 3), filler(8, 8, 4), filler(9, 9, 5), bigWin(10, 10)];
    expect(has(unlocksOf(later), "comeback", 1)).toBe(true);
  });

  test("underdog: win with the strictly lowest counted score at the table", () => {
    const opener = duel(1, 10, 10, 1, 2);
    expect(has(unlocksOf([opener, duel(2, 9, 20, 3, 1)]), "underdog", 3)).toBe(true);
    const tiedLowest = makeDoneSession(2, 9, 20 * MIN, [
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(has(unlocksOf([opener, tiedLowest]), "underdog", 3)).toBe(false);
  });

  test("giant slayer: finish above the leader, who must have a prior result", () => {
    const opener = duel(1, 10, 10, 1, 2);
    expect(has(unlocksOf([opener]), "giant-slayer", 1)).toBe(false);
    const unlocks = unlocksOf([opener, duel(2, 9, 20, 3, 1)]);
    expect(has(unlocks, "giant-slayer", 3)).toBe(true);
    expect(has(unlocks, "giant-slayer", 1)).toBe(false);
  });

  test("joker master: win with Joker declared", () => {
    const unlocks = unlocksOf([
      makeDoneSession(1, 9, 10 * MIN, [
        [1, 1, true],
        [2, 2, true],
      ]),
    ]);
    expect(has(unlocks, "joker-master", 1)).toBe(true);
    expect(has(unlocks, "joker-master", 2)).toBe(false);
  });

  test("risk taker: Joker at a table of five or more", () => {
    const five = makeDoneSession(1, 9, 10 * MIN, [
      [1, 5, true],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
    ]);
    expect(has(unlocksOf([five]), "risk-taker", 1)).toBe(true);
    const four = makeDoneSession(1, 9, 10 * MIN, [
      [1, 4, true],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
    expect(has(unlocksOf([four]), "risk-taker", 1)).toBe(false);
  });
});

describe("settings, rarity and diffs", () => {
  test("disabled achievements never unlock", () => {
    expect(has(unlocksOf([duel(1, 1, 10, 1, 2)], { disabled: ["catan-lord"] }), "catan-lord", 1)).toBe(false);
  });

  test("rarityOf uses unlock share among players with results", () => {
    expect(rarityOf(0, 20)).toBeNull();
    expect(rarityOf(1, 2)).toBe("legendary");
    expect(rarityOf(2, 50)).toBe("legendary");
    expect(rarityOf(2, 20)).toBe("epic");
    expect(rarityOf(3, 20)).toBe("rare");
    expect(rarityOf(8, 20)).toBe("rare");
    expect(rarityOf(9, 20)).toBe("common");
  });

  test("newPublicUnlocks returns only new, non-sealed unlocks", () => {
    const a: Unlock = { achievementId: "catan-lord", playerId: 1, sessionId: 1, at: 1 };
    const b: Unlock = { achievementId: "opening-move", playerId: 2, sessionId: 2, at: 2 };
    const sealed: Unlock = { achievementId: "underdog", playerId: 2, sessionId: 2, at: 2 };
    expect(newPublicUnlocks([a], [a, b, sealed])).toEqual([b]);
    expect(newPublicUnlocks([a, b], [b])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/achievements.test.ts src/domain/replay.test.ts`
Expected: FAIL — `Cannot find module './achievements'` and `amyR1.family` undefined.

- [ ] **Step 4: Create `src/domain/achievements.ts`**

```ts
import type { PlayerResult, ReplayResult, ReplayStep } from "./replay";
import type { StandingRow } from "./standings";
import type { GameFact } from "./types";

export const ACHIEVEMENT_IDS = [
  "catan-lord",
  "rail-baron",
  "gem-master",
  "music-master",
  "wonder-architect",
  "kingmaker",
  "rat-king",
  "last-card",
  "opening-move",
  "back-to-back",
  "hot-streak",
  "triple-threat",
  "phoenix",
  "all-rounder",
  "table-hopper",
  "social-butterfly",
  "marathon",
  "comeback",
  "underdog",
  "giant-slayer",
  "joker-master",
  "risk-taker",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];
export type Rarity = "legendary" | "epic" | "rare" | "common";

export interface ResultContext {
  /** 0-based position of this result among all results of the event. */
  index: number;
  result: ReplayResult;
  game: GameFact;
  before: StandingRow[];
  after: StandingRow[];
  /** A player's results up to and including this one, chronological. */
  historyOf: (playerId: number) => PlayerResult[];
}

export interface AchievementDef {
  id: AchievementId;
  /** lucide-react component name, rendered by components/common/AchievementIcon. */
  icon: string;
  sealed: boolean;
  check: (ctx: ResultContext, playerId: number) => boolean;
  progress?: (history: PlayerResult[]) => { current: number; target: number };
}

export interface Unlock {
  achievementId: AchievementId;
  playerId: number;
  sessionId: number;
  at: number;
}

const EPSILON = 1e-6;

const placementOf = (ctx: ResultContext, playerId: number) =>
  ctx.result.players.find((p) => p.playerId === playerId);
const won = (ctx: ResultContext, playerId: number) => placementOf(ctx, playerId)?.placement === 1;
const rankIn = (rows: StandingRow[], playerId: number) => rows.find((r) => r.playerId === playerId)?.rank ?? null;
const countedIn = (rows: StandingRow[], playerId: number) => rows.find((r) => r.playerId === playerId)?.counted ?? 0;

function winStreak(history: PlayerResult[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].placement === 1; i--) n++;
  return n;
}

function winGame(id: AchievementId, icon: string, family: string): AchievementDef {
  return { id, icon, sealed: false, check: (ctx, p) => won(ctx, p) && ctx.game.family === family };
}

function counter(
  id: AchievementId,
  icon: string,
  target: number,
  measure: (history: PlayerResult[]) => number,
): AchievementDef {
  return {
    id,
    icon,
    sealed: false,
    check: (ctx, p) => measure(ctx.historyOf(p)) >= target,
    progress: (history) => ({ current: Math.min(measure(history), target), target }),
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  winGame("catan-lord", "Hexagon", "catan"),
  winGame("rail-baron", "TrainFront", "ticket-to-ride"),
  winGame("gem-master", "Gem", "splendor"),
  winGame("music-master", "Music", "hitster"),
  winGame("wonder-architect", "Landmark", "seven-wonders"),
  winGame("kingmaker", "Castle", "citadels"),
  winGame("rat-king", "Rat", "rats-race"),
  winGame("last-card", "Layers", "uno"),
  { id: "opening-move", icon: "Flag", sealed: false, check: (ctx, p) => ctx.index === 0 && won(ctx, p) },
  { id: "back-to-back", icon: "Repeat", sealed: false, check: (ctx, p) => winStreak(ctx.historyOf(p)) >= 2 },
  { id: "hot-streak", icon: "Flame", sealed: false, check: (ctx, p) => winStreak(ctx.historyOf(p)) >= 3 },
  counter("triple-threat", "Trophy", 3, (h) => new Set(h.filter((r) => r.placement === 1).map((r) => r.family)).size),
  {
    id: "phoenix",
    icon: "Bird",
    sealed: false,
    check: (ctx, p) => {
      const h = ctx.historyOf(p);
      return h.length >= 2 && h[h.length - 1].placement === 1 && h[h.length - 2].last;
    },
  },
  counter("all-rounder", "Shapes", 5, (h) => new Set(h.map((r) => r.family)).size),
  counter("table-hopper", "Armchair", 4, (h) => new Set(h.flatMap((r) => (r.tableId === null ? [] : [r.tableId]))).size),
  counter("social-butterfly", "Users", 8, (h) => new Set(h.flatMap((r) => r.opponents)).size),
  counter("marathon", "Timer", 180, (h) => h.reduce((sum, r) => sum + (r.durationMin ?? 0), 0)),
  {
    id: "comeback",
    icon: "TrendingUp",
    sealed: true,
    check: (ctx, p) => {
      if (ctx.index < 9) return false;
      const before = rankIn(ctx.before, p);
      const after = rankIn(ctx.after, p);
      return before !== null && after !== null && before - after >= 3;
    },
  },
  {
    id: "underdog",
    icon: "Sprout",
    sealed: true,
    check: (ctx, p) => {
      if (!won(ctx, p)) return false;
      const mine = countedIn(ctx.before, p);
      const others = ctx.result.players.filter((x) => x.playerId !== p);
      return others.length > 0 && others.every((x) => countedIn(ctx.before, x.playerId) - mine > EPSILON);
    },
  },
  {
    id: "giant-slayer",
    icon: "Swords",
    sealed: true,
    check: (ctx, p) => {
      const leader = ctx.before.find((r) => r.rank === 1);
      if (!leader || leader.playerId === p) return false;
      const leaderPlace = placementOf(ctx, leader.playerId)?.placement;
      const myPlace = placementOf(ctx, p)?.placement;
      return leaderPlace !== undefined && myPlace !== undefined && myPlace < leaderPlace;
    },
  },
  {
    id: "joker-master",
    icon: "Spade",
    sealed: true,
    check: (ctx, p) => won(ctx, p) && Boolean(placementOf(ctx, p)?.jokerDeclared),
  },
  {
    id: "risk-taker",
    icon: "Zap",
    sealed: true,
    check: (ctx, p) => Boolean(placementOf(ctx, p)?.jokerDeclared) && ctx.result.players.length >= 5,
  },
];

const byId = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));

export function achievementDef(id: AchievementId): AchievementDef {
  return byId.get(id)!;
}

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === "string" && byId.has(value as AchievementId);
}

export const unlockKey = (u: Pick<Unlock, "achievementId" | "playerId">) => `${u.achievementId}:${u.playerId}`;

/** Walks the replay in order; the first result where a check passes records the unlock. */
export function computeUnlocks(
  input: { results: ReplayResult[]; steps: ReplayStep[]; byPlayer: Map<number, PlayerResult[]> },
  gamesById: Map<number, GameFact>,
  disabled: ReadonlySet<string>,
): Unlock[] {
  const defs = ACHIEVEMENTS.filter((d) => !disabled.has(d.id));
  const seen = new Set<string>();
  const consumed = new Map<number, number>();
  const unlocks: Unlock[] = [];

  input.results.forEach((result, index) => {
    for (const p of result.players) consumed.set(p.playerId, (consumed.get(p.playerId) ?? 0) + 1);
    const game = gamesById.get(result.gameId);
    const step = input.steps[index];
    if (!game || !step) return;
    const ctx: ResultContext = {
      index,
      result,
      game,
      before: step.before,
      after: step.after,
      historyOf: (playerId) => (input.byPlayer.get(playerId) ?? []).slice(0, consumed.get(playerId) ?? 0),
    };
    for (const p of result.players) {
      for (const def of defs) {
        const key = unlockKey({ achievementId: def.id, playerId: p.playerId });
        if (seen.has(key) || !def.check(ctx, p.playerId)) continue;
        seen.add(key);
        unlocks.push({ achievementId: def.id, playerId: p.playerId, sessionId: result.sessionId, at: result.finishedAt });
      }
    }
  });
  return unlocks;
}

/** Legendary < 5% or unique, Epic 5-15%, Rare 15-40%, Common > 40%. */
export function rarityOf(count: number, eligiblePlayers: number): Rarity | null {
  if (count <= 0 || eligiblePlayers <= 0) return null;
  const share = count / eligiblePlayers;
  if (count === 1 || share < 0.05) return "legendary";
  if (share < 0.15) return "epic";
  if (share <= 0.4) return "rare";
  return "common";
}

export function newPublicUnlocks(before: Unlock[], after: Unlock[]): Unlock[] {
  const known = new Set(before.map(unlockKey));
  return after.filter((u) => !known.has(unlockKey(u)) && !achievementDef(u.achievementId).sealed);
}
```

- [ ] **Step 5: Extend `src/domain/replay.ts`**

Add the import at the top:

```ts
import { computeUnlocks, type Unlock } from "./achievements";
```

Replace the `PlayerResult` interface with:

```ts
export interface PlayerResult {
  sessionId: number;
  gameId: number;
  family: string;
  tableId: number | null;
  finishedAt: number;
  durationMin: number | null;
  placement: number;
  playerCount: number;
  /** Other players in the same result. */
  opponents: number[];
  /** Finished in the lowest placement of a result that has more than one placement value. */
  last: boolean;
  base: number;
  points: number;
  jokerDeclared: boolean;
}
```

In `interface Replay` add `unlocks: Unlock[];`. In `interface ReplayInput` add `disabledAchievements?: string[];`.

In the loop, replace the `results.push({...})` block and the `for (const s of scored) byPlayer...push` block with:

```ts
    const durationMin = durationMinutes(session);
    results.push({
      sessionId: session.id,
      gameId: session.gameId,
      tableId: session.tableId,
      startedAt: session.startedAt,
      finishedAt,
      durationMin,
      players: scored,
    });

    const lowest = Math.max(...scored.map((s) => s.placement));
    for (const s of scored) {
      byPlayer.get(s.playerId)?.push({
        sessionId: session.id,
        gameId: session.gameId,
        family: game.family,
        tableId: session.tableId,
        finishedAt,
        durationMin,
        placement: s.placement,
        playerCount: scored.length,
        opponents: scored.filter((o) => o.playerId !== s.playerId).map((o) => o.playerId),
        last: lowest > 1 && s.placement === lowest,
        base: s.base,
        points: s.points,
        jokerDeclared: s.jokerDeclared,
      });
    }
```

Replace the final `return` with:

```ts
  const unlocks = computeUnlocks({ results, steps, byPlayer }, gamesById, new Set(input.disabledAchievements ?? []));
  return { results, steps, standings: current, byPlayer, rankHistory, trends, unlocks };
```

(`achievements.ts` imports only types from `replay.ts`, so the cycle is erased at runtime.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS (all domain tests, including the existing replay and snapshot suites).

- [ ] **Step 7: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/domain/achievements.ts src/domain/achievements.test.ts src/domain/replay.ts src/domain/replay.test.ts
git commit -m "feat(domain): derive achievement unlocks from replay with rarity and progress"
```

---
### Task 2: Finale script and event stats

**Files:**
- Modify: `src/domain/standings.ts`
- Create: `src/domain/stats.ts`, `src/domain/finale.ts`
- Test: `src/domain/stats.test.ts`, `src/domain/finale.test.ts`

**Interfaces:**
- Consumes: `Replay` (with `unlocks`, Task 1), `achievementDef`, `Facts`, `StandingRow`, `PlayerView`/`GameFact` types.
- Produces:
  - `standings.ts`: `pointsEqual(a: number, b: number): boolean`.
  - `stats.ts`: `GameCount { gameId; count }`, `LongestResult { sessionId; gameId; tableId: number | null; durationMin: number }`, `TableCount { tableId; count }`, `RivalPair { playerIds: [number, number]; count }`, `mostPlayedGame(results)`, `longestResult(results)`, `busiestTable(results)`, `rivals(results)` — each returns the type or `null`.
  - `finale.ts`: `PodiumRow { playerId; rank: number; counted; wins; gamesPlayed }`, `FinaleBeat` union (kinds `complete | numbers | sealed | place | champion | podium | closing`, shapes below), `podiumGroups(standings): { champions: StandingRow[]; second: StandingRow | null; third: StandingRow | null }`, `buildFinaleScript(facts: Facts, rp: Replay): FinaleBeat[]`, `revealStepOf(beats): number` (1-based), `clampStep(step, beats): number`, `RehearsalData { beats; players: PlayerView[]; games: GameFact[]; tables: { id: number; number: number }[]; city: string; year: number }`, `buildRehearsal(): RehearsalData`.

- [ ] **Step 1: Write the failing stats test**

Create `src/domain/stats.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import { busiestTable, longestResult, mostPlayedGame, rivals } from "./stats";

const players = [1, 2, 3, 4].map((id) => makePlayer(id, `P${id}`));
const games = [makeGame(1, 6), makeGame(2, 10)];
const MIN = 60_000;

function results(sessions: Parameters<typeof makeDoneSession>[]) {
  return replay({ players, games, sessions: sessions.map((args) => makeDoneSession(...args)) }, makeSettings()).results;
}

test("empty event has no stats", () => {
  const none = results([]);
  expect(mostPlayedGame(none)).toBeNull();
  expect(longestResult(none)).toBeNull();
  expect(busiestTable(none)).toBeNull();
  expect(rivals(none)).toBeNull();
});

test("most played game, busiest table, longest game and rivals", () => {
  const rs = results([
    [1, 1, 60 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: 50 * MIN }],
    [2, 2, 90 * MIN, [[1, 1], [2, 2], [3, 3]], { tableId: 2, startedAt: 10 * MIN }],
    [3, 2, 120 * MIN, [[2, 1], [1, 2]], { tableId: 2, startedAt: 100 * MIN }],
    [4, 1, 130 * MIN, [[3, 1], [4, 2]], { tableId: null, startedAt: 130 * MIN }],
  ]);
  expect(mostPlayedGame(rs)).toEqual({ gameId: 1, count: 2 });
  expect(busiestTable(rs)).toEqual({ tableId: 2, count: 2 });
  expect(longestResult(rs)).toEqual({ sessionId: 2, gameId: 2, tableId: 2, durationMin: 80 });
  expect(rivals(rs)).toEqual({ playerIds: [1, 2], count: 3 });
});

test("rivals need at least two shared games", () => {
  expect(rivals(results([[1, 1, MIN, [[1, 1], [2, 2]]]]))).toBeNull();
});
```

(`mostPlayedGame` tie on count 2 vs 2 is broken by lower `gameId`.)

- [ ] **Step 2: Write the failing finale test**

Create `src/domain/finale.test.ts`:

```ts
import { describe, expect, test } from "vitest";
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

  test("orders beats and puts one beat per sealed unlock", () => {
    const f = facts(sessions);
    const rp = replay(f, f.event.scoring);
    const sealedCount = rp.unlocks.filter((u) => ["comeback", "underdog", "giant-slayer", "joker-master", "risk-taker"].includes(u.achievementId)).length;
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
```

(Task 3 adds the required `Facts.disabledAchievements` field and updates this `facts()` helper.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/stats.test.ts src/domain/finale.test.ts`
Expected: FAIL — modules `./stats` and `./finale` not found.

- [ ] **Step 4: Add `pointsEqual` to `src/domain/standings.ts`**

After the `pts` helper add:

```ts
export function pointsEqual(a: number, b: number): boolean {
  return pts(a) === pts(b);
}
```

- [ ] **Step 5: Create `src/domain/stats.ts`**

```ts
import type { ReplayResult } from "./replay";

export interface GameCount {
  gameId: number;
  count: number;
}

export interface LongestResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  durationMin: number;
}

export interface TableCount {
  tableId: number;
  count: number;
}

export interface RivalPair {
  playerIds: [number, number];
  count: number;
}

function topCount(keys: number[]): { key: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let best: { key: number; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count || (count === best.count && key < best.key)) best = { key, count };
  }
  return best;
}

export function mostPlayedGame(results: ReplayResult[]): GameCount | null {
  const top = topCount(results.map((r) => r.gameId));
  return top ? { gameId: top.key, count: top.count } : null;
}

export function busiestTable(results: ReplayResult[]): TableCount | null {
  const top = topCount(results.flatMap((r) => (r.tableId === null ? [] : [r.tableId])));
  return top ? { tableId: top.key, count: top.count } : null;
}

/** Only sessions with a real duration; ties go to the earlier result. */
export function longestResult(results: ReplayResult[]): LongestResult | null {
  let best: LongestResult | null = null;
  for (const r of results) {
    if (r.durationMin === null) continue;
    if (!best || r.durationMin > best.durationMin) {
      best = { sessionId: r.sessionId, gameId: r.gameId, tableId: r.tableId, durationMin: r.durationMin };
    }
  }
  return best;
}

/** The pair of players who shared the most results (at least two). */
export function rivals(results: ReplayResult[]): RivalPair | null {
  const counts = new Map<string, number>();
  for (const r of results) {
    const ids = r.players.map((p) => p.playerId).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}:${ids[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  let best: RivalPair | null = null;
  for (const [key, count] of counts) {
    const [a, b] = key.split(":").map(Number) as [number, number];
    const better =
      !best ||
      count > best.count ||
      (count === best.count && (a < best.playerIds[0] || (a === best.playerIds[0] && b < best.playerIds[1])));
    if (better) best = { playerIds: [a, b], count };
  }
  return best && best.count >= 2 ? best : null;
}
```

- [ ] **Step 6: Create `src/domain/finale.ts`**

```ts
import { achievementDef, type Unlock } from "./achievements";
import type { Replay } from "./replay";
import type { PlayerView } from "./snapshot";
import { pointsEqual, type StandingRow } from "./standings";
import { busiestTable, longestResult, mostPlayedGame, rivals, type GameCount, type LongestResult, type RivalPair, type TableCount } from "./stats";
import type { Facts, GameFact } from "./types";

export interface PodiumRow {
  playerId: number;
  rank: number;
  counted: number;
  wins: number;
  gamesPlayed: number;
}

export type FinaleBeat =
  | { kind: "complete"; games: number; minutes: number | null; players: number }
  | { kind: "numbers"; mostPlayed: GameCount | null; longest: LongestResult | null; busiestTable: TableCount | null; rivals: RivalPair | null }
  | { kind: "sealed"; unlock: Unlock; order: number; total: number }
  | { kind: "place"; place: number; playerId: number }
  | { kind: "champion"; playerIds: number[]; co: boolean }
  | { kind: "podium"; championIds: number[]; rows: PodiumRow[] }
  | { kind: "closing"; championIds: number[] };

export const TOP_ROWS = 10;

export function podiumGroups(standings: StandingRow[]): {
  champions: StandingRow[];
  second: StandingRow | null;
  third: StandingRow | null;
} {
  const ranked = standings.filter((r) => r.rank !== null);
  const [first, runnerUp] = ranked;
  if (!first) return { champions: [], second: null, third: null };
  const co =
    runnerUp !== undefined &&
    pointsEqual(first.counted, runnerUp.counted) &&
    first.wins === runnerUp.wins &&
    pointsEqual(first.raw, runnerUp.raw);
  const champions = co ? [first, runnerUp] : [first];
  const rest = ranked.slice(champions.length);
  return { champions, second: rest[0] ?? null, third: rest[1] ?? null };
}

export function buildFinaleScript(facts: Facts, rp: Replay): FinaleBeat[] {
  const { startedAt, finishedAt } = facts.event;
  const ranked = rp.standings.filter((r) => r.rank !== null);
  const beats: FinaleBeat[] = [
    {
      kind: "complete",
      games: rp.results.length,
      minutes: startedAt !== null && finishedAt !== null ? Math.round((finishedAt - startedAt) / 60_000) : null,
      players: ranked.length,
    },
    {
      kind: "numbers",
      mostPlayed: mostPlayedGame(rp.results),
      longest: longestResult(rp.results),
      busiestTable: busiestTable(rp.results),
      rivals: rivals(rp.results),
    },
  ];

  const sealed = rp.unlocks.filter((u) => achievementDef(u.achievementId).sealed);
  sealed.forEach((unlock, i) => beats.push({ kind: "sealed", unlock, order: i + 1, total: sealed.length }));

  const groups = podiumGroups(rp.standings);
  const firstPlaceAfterChampions = groups.champions.length + 1;
  if (groups.third) beats.push({ kind: "place", place: firstPlaceAfterChampions + 1, playerId: groups.third.playerId });
  if (groups.second) beats.push({ kind: "place", place: firstPlaceAfterChampions, playerId: groups.second.playerId });

  const championIds = groups.champions.map((r) => r.playerId);
  if (championIds.length > 0) beats.push({ kind: "champion", playerIds: championIds, co: championIds.length > 1 });
  beats.push({
    kind: "podium",
    championIds,
    rows: ranked.slice(0, TOP_ROWS).map((r) => ({
      playerId: r.playerId,
      rank: r.rank!,
      counted: r.counted,
      wins: r.wins,
      gamesPlayed: r.gamesPlayed,
    })),
  });
  beats.push({ kind: "closing", championIds });
  return beats;
}

/** 1-based step of the beat that makes standings public. */
export function revealStepOf(beats: FinaleBeat[]): number {
  return beats.findIndex((b) => b.kind === "podium") + 1;
}

export function clampStep(step: number, beats: FinaleBeat[]): number {
  return Math.max(0, Math.min(step, beats.length));
}

export interface RehearsalData {
  beats: FinaleBeat[];
  players: PlayerView[];
  games: GameFact[];
  tables: { id: number; number: number }[];
  city: string;
  year: number;
}

const REHEARSAL_NAMES = ["Player A", "Player B", "Player C", "Player D", "Player E", "Player F", "Player G", "Player H", "Player I", "Player J", "Player K", "Player L"];

/** Placeholder ceremony for `/screen?rehearsal=1`. Reads no real state. */
export function buildRehearsal(): RehearsalData {
  const players: PlayerView[] = REHEARSAL_NAMES.map((name, i) => ({ id: i + 1, name, nickname: null, color: "#8b8b90" }));
  const game = (id: number, name: string, icon: string): GameFact => ({
    id,
    slug: `rehearsal-${id}`,
    name,
    family: `rehearsal-${id}`,
    descriptionEn: "",
    descriptionRu: "",
    icon,
    category: "rehearsal",
    durationMin: 60,
    weight: 10,
    minPlayers: 2,
    maxPlayers: 6,
    allowTies: false,
    active: true,
  });
  const rows: PodiumRow[] = players.slice(0, TOP_ROWS).map((p, i) => ({
    playerId: p.id,
    rank: i + 1,
    counted: 48 - i * 3.4,
    wins: Math.max(0, 4 - Math.floor(i / 2)),
    gamesPlayed: 5,
  }));
  const at = 0;
  return {
    players,
    games: [game(1, "Catan", "Hexagon"), game(2, "Ticket to Ride", "TrainFront")],
    tables: [{ id: 1, number: 3 }],
    city: "Warsaw",
    year: 2026,
    beats: [
      { kind: "complete", games: 42, minutes: 245, players: 22 },
      {
        kind: "numbers",
        mostPlayed: { gameId: 2, count: 9 },
        longest: { sessionId: 1, gameId: 1, tableId: 1, durationMin: 112 },
        busiestTable: { tableId: 1, count: 11 },
        rivals: { playerIds: [4, 7], count: 5 },
      },
      { kind: "sealed", unlock: { achievementId: "giant-slayer", playerId: 6, sessionId: 1, at }, order: 1, total: 2 },
      { kind: "sealed", unlock: { achievementId: "joker-master", playerId: 3, sessionId: 1, at }, order: 2, total: 2 },
      { kind: "place", place: 3, playerId: 3 },
      { kind: "place", place: 2, playerId: 2 },
      { kind: "champion", playerIds: [1], co: false },
      { kind: "podium", championIds: [1], rows },
      { kind: "closing", championIds: [1] },
    ],
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 8: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/domain/standings.ts src/domain/stats.ts src/domain/stats.test.ts src/domain/finale.ts src/domain/finale.test.ts
git commit -m "feat(domain): add finale script, podium groups, rehearsal data and evening stats"
```

---
### Task 3: Persistence for achievement settings and achievement announcements

**Files:**
- Modify: `src/domain/types.ts`, `src/server/db/schema.ts`, `src/server/repo/facts.ts`, `src/server/repo/writes.ts`, `src/domain/snapshot.ts`, `src/domain/snapshot.test.ts`, `src/domain/finale.test.ts`
- Create: `drizzle/0001_achievement_settings.sql` (generated) and its `drizzle/meta` snapshot
- Test: `src/server/repo/repo.test.ts`

**Interfaces:**
- Consumes: Task 1 `replay()` accepting `disabledAchievements`.
- Produces:
  - `AnnouncementFact` gains `{ id: number; type: "achievement"; payload: { sessionId: number; playerId: number; achievementId: string }; createdAt: number }`.
  - `Facts.disabledAchievements: string[]` (ids whose `achievement_settings.enabled` is false; absent rows mean enabled).
  - Schema `achievementSettings` table (`achievement_settings`: `achievementId` text PK, `enabled` boolean default true).
  - `insertAnnouncement(tx, value, createdAt)` accepts `{ type: "achievement"; payload: { sessionId; playerId; achievementId } }`.
  - `upsertAchievementSetting(tx: Tx, achievementId: string, enabled: boolean): void`.
  - `loadFacts` returns the latest **50** announcements.

- [ ] **Step 1: Write the failing repo tests**

In `src/server/repo/repo.test.ts` add `upsertAchievementSetting` to the `./writes` import and append inside `describe("version, announcements, audit, demo cleanup", ...)`:

```ts
  test("achievement announcements round trip with their string id", () => {
    insertAnnouncement(ctx.db, { type: "achievement", payload: { sessionId: 4, playerId: 2, achievementId: "phoenix" } }, 7);
    expect(loadFacts(ctx.db).announcements[0]).toEqual({
      id: expect.any(Number),
      type: "achievement",
      payload: { sessionId: 4, playerId: 2, achievementId: "phoenix" },
      createdAt: 7,
    });
  });

  test("achievement settings: only disabled ids are reported, upsert toggles", () => {
    expect(loadFacts(ctx.db).disabledAchievements).toEqual([]);
    upsertAchievementSetting(ctx.db, "marathon", false);
    upsertAchievementSetting(ctx.db, "phoenix", false);
    expect(loadFacts(ctx.db).disabledAchievements.sort()).toEqual(["marathon", "phoenix"]);
    upsertAchievementSetting(ctx.db, "marathon", true);
    expect(loadFacts(ctx.db).disabledAchievements).toEqual(["phoenix"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/repo/repo.test.ts`
Expected: FAIL — `upsertAchievementSetting` is not exported / `disabledAchievements` undefined.

- [ ] **Step 3: Extend domain types**

In `src/domain/types.ts` replace `AnnouncementFact` with:

```ts
export type AnnouncementFact =
  | { id: number; type: "result_reveal"; payload: { sessionId: number }; createdAt: number }
  | { id: number; type: "milestone"; payload: { count: number }; createdAt: number }
  | {
      id: number;
      type: "achievement";
      payload: { sessionId: number; playerId: number; achievementId: string };
      createdAt: number;
    };
```

and add to `interface Facts` (after `announcements`):

```ts
  /** Achievement ids switched off in admin; every other achievement is enabled. */
  disabledAchievements: string[];
```

- [ ] **Step 4: Update the schema**

In `src/server/db/schema.ts` replace the `announcements` table and append the new table:

```ts
export const announcements = sqliteTable("announcements", {
  id: integer().primaryKey({ autoIncrement: true }),
  type: text({ enum: ["result_reveal", "milestone", "achievement"] }).notNull(),
  payload: text({ mode: "json" }).$type<Record<string, number | string>>().notNull(),
  createdAt: integer().notNull(),
});

export const achievementSettings = sqliteTable("achievement_settings", {
  achievementId: text().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
});
```

(The `achievementSettings` export goes after `auditLog`; keep `announcements` where it is.)

- [ ] **Step 5: Generate the migration**

Run: `npx drizzle-kit generate --name achievement_settings`
Expected: creates `drizzle/0001_achievement_settings.sql` and updates `drizzle/meta/_journal.json` + `drizzle/meta/0001_snapshot.json`. The SQL file must contain only:

```sql
CREATE TABLE `achievement_settings` (
	`achievementId` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
```

If it contains anything else (for example a rebuild of `announcements` or `event`), delete the three generated/changed files with `git checkout drizzle/meta && rm drizzle/0001_*` and check that Step 4 only touched the lines shown.

- [ ] **Step 6: Load the new facts**

In `src/server/repo/facts.ts` add this helper above `loadFacts`:

```ts
type AnnouncementRow = typeof s.announcements.$inferSelect;

function toAnnouncementFact(a: AnnouncementRow): AnnouncementFact {
  const num = (key: string) => (typeof a.payload[key] === "number" ? (a.payload[key] as number) : 0);
  switch (a.type) {
    case "milestone":
      return { id: a.id, type: "milestone", payload: { count: num("count") }, createdAt: a.createdAt };
    case "achievement":
      return {
        id: a.id,
        type: "achievement",
        payload: { sessionId: num("sessionId"), playerId: num("playerId"), achievementId: String(a.payload.achievementId ?? "") },
        createdAt: a.createdAt,
      };
    default:
      return { id: a.id, type: "result_reveal", payload: { sessionId: num("sessionId") }, createdAt: a.createdAt };
  }
}
```

Change the domain import to `import type { AnnouncementFact, AuditEntry, Facts, SessionFact } from "@/domain/types";`. In `loadFacts` change `.limit(20)` to `.limit(50)`, replace the `announcements: announcementRows.map(...)` entry with `announcements: announcementRows.map(toAnnouncementFact),` and add after it:

```ts
    disabledAchievements: tx
      .select({ id: s.achievementSettings.achievementId })
      .from(s.achievementSettings)
      .where(eq(s.achievementSettings.enabled, false))
      .all()
      .map((r) => r.id),
```

- [ ] **Step 7: Extend writes**

In `src/server/repo/writes.ts` replace the `insertAnnouncement` signature's `value` type with:

```ts
  value:
    | { type: "result_reveal"; payload: { sessionId: number } }
    | { type: "milestone"; payload: { count: number } }
    | { type: "achievement"; payload: { sessionId: number; playerId: number; achievementId: string } },
```

and append:

```ts
export function upsertAchievementSetting(tx: Tx, achievementId: string, enabled: boolean): void {
  tx.insert(s.achievementSettings)
    .values({ achievementId, enabled })
    .onConflictDoUpdate({ target: s.achievementSettings.achievementId, set: { enabled } })
    .run();
}
```

`milestoneExists` reads `a.payload.count === count`; with the widened payload type that still compiles.

- [ ] **Step 8: Keep the snapshot builder and domain tests compiling**

In `src/domain/snapshot.ts`, inside `announcements()` `flatMap`, add as the first line of the callback (Task 4 replaces it with real handling):

```ts
      if (a.type === "achievement") return [];
```

Pass the disabled list into replay in `src/server/live.ts` — nothing to change: `replay(facts, facts.event.scoring)` already passes `facts`, which now carries `disabledAchievements`.

Add `disabledAchievements: [],` after `announcements,` in the `facts()` helper of `src/domain/snapshot.test.ts`, and after `announcements: [],` in the `facts()` helper of `src/domain/finale.test.ts`. Then run `npm run typecheck`; any other object literal typed as `Facts` it reports gets the same line.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, including the two new repo tests (the test DB runs migration 0001 on open).

- [ ] **Step 10: Migrate the dev database and commit**

Run: `npm run db:migrate && npm run typecheck && npm run lint`
Expected: setup prints success; typecheck and lint pass.

```bash
git add src/domain/types.ts src/domain/snapshot.ts src/domain/snapshot.test.ts src/domain/finale.test.ts src/server/db/schema.ts src/server/repo drizzle
git commit -m "feat(server): store achievement settings and achievement announcements"
```

---

### Task 4: Snapshots — achievements, unlock announcements, finale views

**Files:**
- Modify: `src/domain/snapshot.ts`, `src/domain/fixtures.ts`
- Test: `src/domain/snapshot.test.ts`

**Interfaces:**
- Consumes: `Replay.unlocks`, `ACHIEVEMENTS`, `achievementDef`, `AchievementId`, `Unlock` (Task 1); `buildFinaleScript`, `clampStep`, `revealStepOf`, `FinaleBeat` (Task 2); `AnnouncementFact` achievement (Task 3).
- Produces (all in `src/domain/snapshot.ts`):
  - `interface AchievementsView { enabled: AchievementId[]; unlocks: Unlock[] /* newest first */; sealedUnlockCount: number; eligiblePlayers: number }`
  - `interface FinaleView { step: number; total: number; current: FinaleBeat | null }`
  - `interface AdminFinaleView extends FinaleView { beats: FinaleBeat[]; revealStep: number }`
  - `Counters.achievementsUnlocked: number`
  - `ScreenAnnouncement` gains `{ id: number; createdAt: number; type: "achievement"; achievementId: AchievementId; playerId: number; sessionId: number }`
  - `PublicSnapshot.achievements: AchievementsView`, `PublicSnapshot.finale: FinaleView | null` (non-null only when `status === "finished"` and `finaleStep > 0`)
  - `AdminSnapshot.achievements: AchievementsView`, `AdminSnapshot.finale: AdminFinaleView | null` (non-null whenever `status === "finished"`)
  - `fixtures.ts`: `FORBIDDEN_PUBLIC_KEYS: string[]`, `keysDeep(value, path?): Array<[string, string]>`

Rules: public `unlocks` exclude sealed unless `finaleRevealed`; admin gets all. Public achievement announcements are dropped when sealed (unless revealed) or when the unlock no longer exists in replay (a correction removed it). `eligiblePlayers` = ranked players count (players with at least one result).

- [ ] **Step 1: Move the privacy helpers into fixtures**

Append to `src/domain/fixtures.ts`:

```ts
/** Keys the public audience must never receive before the finale reveal. */
export const FORBIDDEN_PUBLIC_KEYS = [
  "points",
  "base",
  "rank",
  "counted",
  "raw",
  "jokerDeclared",
  "jokerUsed",
  "gamesPlayed",
  "wins",
  "podiums",
  "trend",
  "countedSessionIds",
  "excludedSessionIds",
];

export function keysDeep(value: unknown, path = "$"): Array<[string, string]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysDeep(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [[k, `${path}.${k}`] as [string, string], ...keysDeep(v, `${path}.${k}`)]);
  }
  return [];
}
```

In `src/domain/snapshot.test.ts` delete the local `FORBIDDEN` constant and `keysDeep` function, import `FORBIDDEN_PUBLIC_KEYS` and `keysDeep` from `./fixtures`, and replace every `FORBIDDEN.includes(` with `FORBIDDEN_PUBLIC_KEYS.includes(`.

- [ ] **Step 2: Write the failing snapshot tests**

In `src/domain/snapshot.test.ts` add `import { achievementDef } from "./achievements";` and change the counters expectation in "shows room facts" to:

```ts
    expect(pub.counters).toEqual({
      gamesCompleted: 2,
      tablesActive: 2,
      players: 5,
      achievementsUnlocked: build(facts()).admin.achievements.unlocks.length,
    });
```

Append these suites at the end of the file (the shared `facts()` fixture has player 1 winning session 10 with a Joker, so `joker-master` is a sealed unlock for player 1, and player 1 also gets the public `opening-move`):

```ts
const achievementAnnouncement = (id: number, achievementId: string, playerId: number): AnnouncementFact => ({
  id,
  type: "achievement",
  payload: { sessionId: 10, playerId, achievementId },
  createdAt: NOW - 5_000,
});

describe("achievements in snapshots", () => {
  test("public sees public unlocks and only a sealed count; admin sees everything", () => {
    const { pub, admin } = build(facts());
    const sealed = (id: Parameters<typeof achievementDef>[0]) => achievementDef(id).sealed;
    expect(admin.achievements.unlocks.some((u) => u.achievementId === "joker-master" && u.playerId === 1)).toBe(true);
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "opening-move" && u.playerId === 1)).toBe(true);
    expect(pub.achievements.unlocks.every((u) => !sealed(u.achievementId))).toBe(true);
    expect(pub.achievements.sealedUnlockCount).toBe(admin.achievements.unlocks.filter((u) => sealed(u.achievementId)).length);
    expect(pub.achievements.sealedUnlockCount).toBeGreaterThan(0);
    expect(pub.achievements.eligiblePlayers).toBe(3);
    expect(pub.achievements.enabled).toHaveLength(22);
    expect(pub.counters.achievementsUnlocked).toBe(admin.achievements.unlocks.length);
  });

  test("unlocks are newest first", () => {
    const { admin } = build(facts());
    const times = admin.achievements.unlocks.map((u) => u.at);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test("disabled achievements disappear from the view", () => {
    const f = { ...facts(), disabledAchievements: ["opening-move"] };
    const { pub } = build(f);
    expect(pub.achievements.enabled).not.toContain("opening-move");
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "opening-move")).toBe(false);
  });

  test("after the reveal, public unlocks include sealed ones", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "joker-master")).toBe(true);
  });

  test("achievement announcements: sealed and stale ones never reach the public", () => {
    const f = facts({}, [
      achievementAnnouncement(1, "opening-move", 1),
      achievementAnnouncement(2, "joker-master", 1),
      achievementAnnouncement(3, "hot-streak", 2),
    ]);
    const { pub, admin } = build(f);
    expect(pub.announcements).toEqual([
      { id: 1, createdAt: NOW - 5_000, type: "achievement", achievementId: "opening-move", playerId: 1, sessionId: 10 },
    ]);
    expect(admin.announcements.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("finale views", () => {
  test("no finale before the event is finished", () => {
    const { pub, admin } = build(facts({ screenControl: { paused: false, skipNonce: 0, finaleStep: 3 } }));
    expect(pub.finale).toBeNull();
    expect(admin.finale).toBeNull();
  });

  test("finished at step 0: admin has the script, public has nothing", () => {
    const { pub, admin } = build(facts({ status: "finished" }));
    expect(pub.finale).toBeNull();
    expect(admin.finale?.step).toBe(0);
    expect(admin.finale?.current).toBeNull();
    expect(admin.finale?.revealStep).toBe(admin.finale!.beats.findIndex((b) => b.kind === "podium") + 1);
  });

  test("public carries only the current beat and no standings fields before the reveal", () => {
    const script = build(facts({ status: "finished" })).admin.finale!.beats;
    const placeStep = script.findIndex((b) => b.kind === "place") + 1;
    const championStep = script.findIndex((b) => b.kind === "champion") + 1;
    for (const step of [1, 2, 3, placeStep, championStep]) {
      const { pub } = build(facts({ status: "finished", screenControl: { paused: false, skipNonce: 0, finaleStep: step } }));
      expect(pub.finale).toEqual({ step, total: script.length, current: script[step - 1] });
      expect(pub.finale).not.toHaveProperty("beats");
      expect(keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
    }
  });

  test("step is clamped to the script length", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true, screenControl: { paused: false, skipNonce: 0, finaleStep: 99 } }));
    expect(pub.finale?.step).toBe(pub.finale?.total);
    expect(pub.finale?.current?.kind).toBe("closing");
  });
});
```

Note on the "sealed beat" case: step 3 is a `sealed` beat; its `unlock` has `achievementId`, `playerId`, `sessionId`, `at` — none are forbidden keys.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/snapshot.test.ts`
Expected: FAIL — `pub.achievements` undefined, counters lack `achievementsUnlocked`.

- [ ] **Step 4: Implement in `src/domain/snapshot.ts`**

Add imports:

```ts
import { ACHIEVEMENTS, achievementDef, isAchievementId, type AchievementId, type Unlock } from "./achievements";
import { buildFinaleScript, clampStep, revealStepOf, type FinaleBeat } from "./finale";
```

Add types (after `Counters`), and add `achievementsUnlocked: number;` to `Counters`:

```ts
export interface AchievementsView {
  enabled: AchievementId[];
  /** Newest first. */
  unlocks: Unlock[];
  sealedUnlockCount: number;
  /** Players with at least one result; the denominator for rarity. */
  eligiblePlayers: number;
}

export interface FinaleView {
  step: number;
  total: number;
  current: FinaleBeat | null;
}

export interface AdminFinaleView extends FinaleView {
  beats: FinaleBeat[];
  revealStep: number;
}
```

Replace `ScreenAnnouncement` with:

```ts
export type ScreenAnnouncement =
  | { id: number; createdAt: number; type: "result_reveal"; result: ResultView<PublicPlacementView> }
  | { id: number; createdAt: number; type: "milestone"; count: number }
  | { id: number; createdAt: number; type: "achievement"; achievementId: AchievementId; playerId: number; sessionId: number };
```

Add `achievements: AchievementsView;` and `finale: FinaleView | null;` to `PublicSnapshot`; add `achievements: AchievementsView;` and `finale: AdminFinaleView | null;` to `AdminSnapshot`.

In `counters()` add `achievementsUnlocked: rp.unlocks.length,`.

Replace `announcements()` with:

```ts
function announcements(
  facts: Facts,
  rp: Replay,
  now: number,
  opts: { withPoints: boolean; includeSealed: boolean },
): ScreenAnnouncement[] {
  const results = new Map(rp.results.map((r) => [r.sessionId, r]));
  const unlocked = new Set(rp.unlocks.map((u) => `${u.achievementId}:${u.playerId}`));
  return facts.announcements
    .filter((a) => a.createdAt >= now - ANNOUNCEMENT_WINDOW_MS)
    .sort((a, b) => a.id - b.id)
    .flatMap((a): ScreenAnnouncement[] => {
      if (a.type === "milestone") {
        return [{ id: a.id, createdAt: a.createdAt, type: "milestone", count: a.payload.count }];
      }
      if (a.type === "achievement") {
        const { achievementId, playerId, sessionId } = a.payload;
        if (!isAchievementId(achievementId)) return [];
        if (achievementDef(achievementId).sealed && !opts.includeSealed) return [];
        if (!unlocked.has(`${achievementId}:${playerId}`)) return [];
        return [{ id: a.id, createdAt: a.createdAt, type: "achievement", achievementId, playerId, sessionId }];
      }
      const result = results.get(a.payload.sessionId);
      return result
        ? [{ id: a.id, createdAt: a.createdAt, type: "result_reveal", result: publicResult(result, opts.withPoints) }]
        : [];
    });
}
```

Add helpers:

```ts
function achievementsView(facts: Facts, rp: Replay, includeSealed: boolean): AchievementsView {
  const disabled = new Set(facts.disabledAchievements);
  const sealed = (u: Unlock) => achievementDef(u.achievementId).sealed;
  return {
    enabled: ACHIEVEMENTS.filter((d) => !disabled.has(d.id)).map((d) => d.id),
    unlocks: rp.unlocks
      .filter((u) => includeSealed || !sealed(u))
      .map((u, i) => ({ u, i }))
      .sort((a, b) => b.u.at - a.u.at || b.i - a.i)
      .map(({ u }) => u),
    sealedUnlockCount: rp.unlocks.filter(sealed).length,
    eligiblePlayers: rp.standings.filter((r) => r.rank !== null).length,
  };
}

function finaleScript(facts: Facts, rp: Replay): FinaleBeat[] | null {
  return facts.event.status === "finished" ? buildFinaleScript(facts, rp) : null;
}

function finaleView(beats: FinaleBeat[], requested: number): FinaleView {
  const step = clampStep(requested, beats);
  return { step, total: beats.length, current: step > 0 ? beats[step - 1] : null };
}
```

In `buildPublicSnapshot`, before `return`:

```ts
  const script = finaleScript(facts, rp);
  const finaleStep = facts.event.screenControl.finaleStep;
```

and in the returned object replace the `announcements:` line and add two fields:

```ts
    announcements: announcements(facts, rp, now, {
      withPoints: revealed || facts.event.showPointsInReveals,
      includeSealed: revealed,
    }),
    achievements: achievementsView(facts, rp, revealed),
    finale: script && finaleStep > 0 ? finaleView(script, finaleStep) : null,
```

In `buildAdminSnapshot`, before `return` add `const script = finaleScript(facts, rp);` and in the object:

```ts
    announcements: announcements(facts, rp, now, { withPoints: true, includeSealed: true }),
    achievements: achievementsView(facts, rp, true),
    finale: script
      ? { ...finaleView(script, facts.event.screenControl.finaleStep), beats: script, revealStep: revealStepOf(script) }
      : null,
```

Delete the temporary `if (a.type === "achievement") return [];` line from Task 3 (the new `announcements()` replaces it).

- [ ] **Step 5: Confirm UI consumers need no change yet**

No code change in this step. `AnnouncementPlayer` renders with explicit `current?.type === "..."` checks, so an `achievement` item renders nothing (and blocks the queue for nothing — it is removed only in Task 9, which is acceptable between tasks because no service enqueues achievements until Task 6). `logic.test.ts` literals and the counters UIs read named fields and still compile.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS.

Sanity check for `eligiblePlayers`: in the shared fixture players 1, 2, 3 have results, so 3.

- [ ] **Step 7: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/domain/snapshot.ts src/domain/snapshot.test.ts src/domain/fixtures.ts
git commit -m "feat(domain): expose achievements, unlock announcements and progressive finale in snapshots"
```

---
### Task 5: Player profile builder

**Files:**
- Create: `src/domain/profile.ts`
- Test: `src/domain/profile.test.ts`

**Interfaces:**
- Consumes: `Replay` (`byPlayer`, `standings`, `rankHistory`, `unlocks`), `ACHIEVEMENTS`, `achievementDef`, `PlayerView`, `Facts`, fixtures incl. `FORBIDDEN_PUBLIC_KEYS`/`keysDeep` (Task 4).
- Produces:
  - `interface ProfileResult { sessionId; gameId; tableId: number | null; finishedAt; placement; playerCount; points?: number; counted?: boolean }` (newest first; `points`/`counted` only when revealed)
  - `interface ProfileAchievement { id: AchievementId; sealed: boolean; unlockedAt: number | null; progress: { current: number; target: number } | null }`
  - `interface ProfileStanding { rank: number | null; counted; raw; wins; podiums; gamesPlayed; winRate: number; excludedSessionIds: number[]; strongestGameId: number | null; weakestGameId: number | null; rankHistory: { finishedAt: number; rank: number | null }[] }`
  - `interface PlayerProfile { player: PlayerView; revealed: boolean; results: ProfileResult[]; favoriteGameId: number | null; tablesPlayed: number; achievements: ProfileAchievement[]; standing: ProfileStanding | null }`
  - `buildProfile(facts: Facts, rp: Replay, playerId: number, audience: "public" | "admin"): PlayerProfile | null`

Rules: `revealed = audience === "admin" || facts.event.finaleRevealed`. Public returns `null` for unknown players and for inactive players without results. Unrevealed profiles omit sealed achievements entirely. Favorite game = most results, tie → most recently played. Strongest/weakest game = highest/lowest mean `base / weight` per game, only when the player has results in at least 2 different games; ties → more results, then lower `gameId`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/profile.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { FORBIDDEN_PUBLIC_KEYS, keysDeep, makeDoneSession, makeEvent, makeGame, makePlayer, makeSettings } from "./fixtures";
import { buildProfile } from "./profile";
import { replay } from "./replay";
import type { EventFact, Facts } from "./types";

const MIN = 60_000;

function facts(event: Partial<EventFact> = {}): Facts {
  return {
    event: makeEvent({ scoring: makeSettings({ strategy: "bestN", bestN: 2 }), ...event }),
    players: [makePlayer(1, "Amy"), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Old", { active: false })],
    games: [makeGame(1, 10), makeGame(2, 6)],
    tables: [],
    sessions: [
      makeDoneSession(1, 1, 10 * MIN, [[1, 1, true], [2, 2]], { tableId: 1 }),
      makeDoneSession(2, 2, 20 * MIN, [[2, 1], [1, 2]], { tableId: 2 }),
      makeDoneSession(3, 1, 30 * MIN, [[1, 1], [3, 2]], { tableId: 2 }),
    ],
    announcements: [],
    disabledAchievements: [],
  };
}

const profileOf = (f: Facts, id: number, audience: "public" | "admin" = "public") =>
  buildProfile(f, replay(f, f.event.scoring), id, audience);

describe("public profile before the finale", () => {
  test("room facts only, no standings keys, no sealed achievements", () => {
    const p = profileOf(facts(), 1)!;
    expect(p.revealed).toBe(false);
    expect(p.player).toEqual({ id: 1, name: "Amy", nickname: null, color: "#8b8b90" });
    expect(p.results.map((r) => [r.sessionId, r.placement, r.playerCount])).toEqual([
      [3, 1, 2],
      [2, 2, 2],
      [1, 1, 2],
    ]);
    expect(p.favoriteGameId).toBe(1);
    expect(p.tablesPlayed).toBe(2);
    expect(p.standing).toBeNull();
    expect(p.achievements.some((a) => a.sealed)).toBe(false);
    expect(p.achievements.find((a) => a.id === "opening-move")?.unlockedAt).toBe(10 * MIN);
    expect(p.achievements.find((a) => a.id === "all-rounder")).toEqual({
      id: "all-rounder",
      sealed: false,
      unlockedAt: null,
      progress: { current: 2, target: 5 },
    });
    expect(keysDeep(p).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
  });

  test("unknown players and inactive players without results have no public profile", () => {
    expect(profileOf(facts(), 99)).toBeNull();
    expect(profileOf(facts(), 4)).toBeNull();
    expect(profileOf(facts(), 4, "admin")).not.toBeNull();
  });

  test("disabled achievements are not listed", () => {
    const f = { ...facts(), disabledAchievements: ["marathon"] };
    expect(profileOf(f, 1)!.achievements.some((a) => a.id === "marathon")).toBe(false);
  });
});

describe("revealed profile", () => {
  test("admin sees standing, points, excluded results and sealed achievements", () => {
    const p = profileOf(facts(), 1, "admin")!;
    expect(p.revealed).toBe(true);
    expect(p.standing).toMatchObject({ rank: 1, wins: 2, podiums: 3, gamesPlayed: 3 });
    expect(p.standing!.winRate).toBeCloseTo(2 / 3);
    expect(p.standing!.excludedSessionIds).toEqual([2]);
    expect(p.results.find((r) => r.sessionId === 2)).toMatchObject({ counted: false });
    expect(p.results.find((r) => r.sessionId === 1)?.points).toBeGreaterThan(10);
    expect(p.standing!.strongestGameId).toBe(1);
    expect(p.standing!.weakestGameId).toBe(2);
    expect(p.standing!.rankHistory.map((h) => h.finishedAt)).toEqual([10 * MIN, 20 * MIN, 30 * MIN]);
    expect(p.achievements.find((a) => a.id === "joker-master")?.unlockedAt).toBe(10 * MIN);
  });

  test("public after finaleRevealed equals admin view", () => {
    const f = facts({ status: "finished", finaleRevealed: true });
    expect(profileOf(f, 1)).toEqual(profileOf(f, 1, "admin"));
  });

  test("strongest/weakest need two different games", () => {
    expect(profileOf(facts(), 3, "admin")!.standing).toMatchObject({ strongestGameId: null, weakestGameId: null });
  });
});
```

Scoring check for the expectations (`makeSettings` floor 0, Joker 1.5, bestN 2): Amy scores S1 10 × 1.5 = 15, S2 0 (last of 2), S3 10; best 2 = S1 + S3, so S2 is excluded; mean share game 1 = 1.0, game 2 = 0.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/profile.test.ts`
Expected: FAIL — `Cannot find module './profile'`.

- [ ] **Step 3: Create `src/domain/profile.ts`**

```ts
import { ACHIEVEMENTS, type AchievementId } from "./achievements";
import type { PlayerResult, Replay } from "./replay";
import type { PlayerView } from "./snapshot";
import type { Facts } from "./types";

export interface ProfileResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  finishedAt: number;
  placement: number;
  playerCount: number;
  points?: number;
  counted?: boolean;
}

export interface ProfileAchievement {
  id: AchievementId;
  sealed: boolean;
  unlockedAt: number | null;
  progress: { current: number; target: number } | null;
}

export interface ProfileStanding {
  rank: number | null;
  counted: number;
  raw: number;
  wins: number;
  podiums: number;
  gamesPlayed: number;
  winRate: number;
  excludedSessionIds: number[];
  strongestGameId: number | null;
  weakestGameId: number | null;
  rankHistory: { finishedAt: number; rank: number | null }[];
}

export interface PlayerProfile {
  player: PlayerView;
  revealed: boolean;
  results: ProfileResult[];
  favoriteGameId: number | null;
  tablesPlayed: number;
  achievements: ProfileAchievement[];
  standing: ProfileStanding | null;
}

function favoriteGame(history: PlayerResult[]): number | null {
  const stats = new Map<number, { count: number; lastAt: number }>();
  for (const r of history) {
    const s = stats.get(r.gameId) ?? { count: 0, lastAt: 0 };
    stats.set(r.gameId, { count: s.count + 1, lastAt: Math.max(s.lastAt, r.finishedAt) });
  }
  let best: { gameId: number; count: number; lastAt: number } | null = null;
  for (const [gameId, s] of stats) {
    if (!best || s.count > best.count || (s.count === best.count && s.lastAt > best.lastAt)) best = { gameId, ...s };
  }
  return best?.gameId ?? null;
}

function gameExtremes(history: PlayerResult[], weights: Map<number, number>): { strongest: number | null; weakest: number | null } {
  const groups = new Map<number, { sum: number; count: number }>();
  for (const r of history) {
    const weight = weights.get(r.gameId) ?? 0;
    if (weight <= 0) continue;
    const g = groups.get(r.gameId) ?? { sum: 0, count: 0 };
    groups.set(r.gameId, { sum: g.sum + r.base / weight, count: g.count + 1 });
  }
  if (groups.size < 2) return { strongest: null, weakest: null };
  const rows = [...groups].map(([gameId, g]) => ({ gameId, mean: g.sum / g.count, count: g.count }));
  const order = (dir: 1 | -1) =>
    [...rows].sort((a, b) => dir * (b.mean - a.mean) || b.count - a.count || a.gameId - b.gameId)[0].gameId;
  return { strongest: order(1), weakest: order(-1) };
}

export function buildProfile(
  facts: Facts,
  rp: Replay,
  playerId: number,
  audience: "public" | "admin",
): PlayerProfile | null {
  const player = facts.players.find((p) => p.id === playerId);
  if (!player) return null;
  const history = rp.byPlayer.get(playerId) ?? [];
  if (audience === "public" && !player.active && history.length === 0) return null;

  const revealed = audience === "admin" || facts.event.finaleRevealed;
  const row = rp.standings.find((r) => r.playerId === playerId);
  const countedIds = new Set(row?.countedSessionIds ?? []);
  const disabled = new Set(facts.disabledAchievements);
  const unlockedAt = new Map(rp.unlocks.filter((u) => u.playerId === playerId).map((u) => [u.achievementId, u.at]));

  const results: ProfileResult[] = [...history].reverse().map((r) => ({
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    finishedAt: r.finishedAt,
    placement: r.placement,
    playerCount: r.playerCount,
    ...(revealed ? { points: r.points, counted: countedIds.has(r.sessionId) } : {}),
  }));

  const achievements: ProfileAchievement[] = ACHIEVEMENTS.filter((d) => !disabled.has(d.id) && (revealed || !d.sealed)).map((d) => ({
    id: d.id,
    sealed: d.sealed,
    unlockedAt: unlockedAt.get(d.id) ?? null,
    progress: d.progress ? d.progress(history) : null,
  }));

  let standing: ProfileStanding | null = null;
  if (revealed) {
    const extremes = gameExtremes(history, new Map(facts.games.map((g) => [g.id, g.weight])));
    standing = {
      rank: row?.rank ?? null,
      counted: row?.counted ?? 0,
      raw: row?.raw ?? 0,
      wins: row?.wins ?? 0,
      podiums: row?.podiums ?? 0,
      gamesPlayed: row?.gamesPlayed ?? 0,
      winRate: history.length > 0 ? (row?.wins ?? 0) / history.length : 0,
      excludedSessionIds: row?.excludedSessionIds ?? [],
      strongestGameId: extremes.strongest,
      weakestGameId: extremes.weakest,
      rankHistory: (rp.rankHistory.get(playerId) ?? []).map((h) => ({ finishedAt: h.finishedAt, rank: h.rank })),
    };
  }

  return {
    player: { id: player.id, name: player.name, nickname: player.nickname, color: player.color },
    revealed,
    results,
    favoriteGameId: favoriteGame(history),
    tablesPlayed: new Set(history.flatMap((r) => (r.tableId === null ? [] : [r.tableId]))).size,
    achievements,
    standing,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/domain/profile.ts src/domain/profile.test.ts
git commit -m "feat(domain): add privacy-aware player profile builder"
```

---

### Task 6: Services — unlock announcements, achievement toggles, finale control

**Files:**
- Create: `src/server/services/achievements.ts`, `src/server/services/finale.ts`
- Modify: `src/server/services/sessions.ts`, `src/server/live.ts`, `src/app/admin/actions.ts`
- Test: `src/server/services/achievements.test.ts`, `src/server/services/finale.test.ts`

**Interfaces:**
- Consumes: `replay`, `newPublicUnlocks`, `isAchievementId` (Task 1); `buildFinaleScript`, `clampStep`, `revealStepOf` (Task 2); `insertAnnouncement`, `upsertAchievementSetting`, `Facts.disabledAchievements` (Task 3); `buildProfile` (Task 5); `mutate`, `ServiceError`, `getEventRow`, `updateEventRow`, `loadFacts`.
- Produces:
  - `withUnlockAnnouncements<T>(tx: Tx, write: () => T): T`
  - `mutateResult<T>(db: Db, fn: (tx: Tx) => T): T` — `mutate` + unlock announcements
  - `setAchievementEnabled(db: Db, input: { achievementId: string; enabled: boolean }): void`
  - `type FinaleCommand = "next" | "back" | "exit"`; `finaleCommand(db: Db, command: FinaleCommand): { step: number; total: number }`; `setFinaleRevealed(db: Db, revealed: boolean): void`
  - `getProfile(db: Db, playerId: number, audience: "public" | "admin"): PlayerProfile | null` in `live.ts`
  - Server actions: `setAchievementEnabledAction(input)`, `finaleCommandAction(command)`, `setFinaleRevealedAction(revealed)`

- [ ] **Step 1: Write the failing achievements service test**

Create `src/server/services/achievements.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { replay } from "@/domain/replay";
import { loadFacts } from "../repo/facts";
import { seedDemo } from "../seed/demo";
import { createTestDb } from "../testDb";
import { setAchievementEnabled } from "./achievements";
import { ServiceError } from "./errors";
import { finishEvent, goLive } from "./event";
import { addPlayer } from "./players";
import { deleteResult, editResult, recordDirectResult, undoLast } from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
let ids: number[];
let catan: number;

beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  ids = ["Amy", "Bob", "Cat"].map((name) => addPlayer(ctx.db, { name }));
  catan = loadFacts(ctx.db).games.find((g) => g.slug === "catan")!.id;
});
afterEach(() => ctx.cleanup());

const achievementAnnouncements = () =>
  loadFacts(ctx.db)
    .announcements.filter((a) => a.type === "achievement")
    .map((a) => (a.type === "achievement" ? `${a.payload.achievementId}:${a.payload.playerId}` : ""))
    .sort();

const placements = (order: number[], jokerFor?: number) =>
  order.map((playerId, i) => ({ playerId, placement: i + 1, jokerDeclared: playerId === jokerFor }));

test("a new result queues public unlocks only, with its session id", () => {
  const sessionId = recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids, ids[0]) });
  expect(achievementAnnouncements()).toEqual([`catan-lord:${ids[0]}`, `opening-move:${ids[0]}`]);
  const first = loadFacts(ctx.db).announcements.find((a) => a.type === "achievement");
  expect(first?.type === "achievement" && first.payload.sessionId).toBe(sessionId);
});

test("corrections announce only unlocks that are new", () => {
  const sessionId = recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids) });
  editResult(ctx.db, { sessionId, gameId: catan, tableId: null, placements: placements([ids[1], ids[0], ids[2]]) });
  expect(achievementAnnouncements()).toEqual([
    `catan-lord:${ids[0]}`,
    `catan-lord:${ids[1]}`,
    `opening-move:${ids[0]}`,
    `opening-move:${ids[1]}`,
  ]);
  deleteResult(ctx.db, sessionId);
  undoLast(ctx.db);
  expect(achievementAnnouncements()).toHaveLength(6);
});

test("disabled achievements are not announced; toggling is allowed after finish", () => {
  setAchievementEnabled(ctx.db, { achievementId: "catan-lord", enabled: false });
  recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids) });
  expect(achievementAnnouncements()).toEqual([`opening-move:${ids[0]}`]);
  finishEvent(ctx.db);
  setAchievementEnabled(ctx.db, { achievementId: "catan-lord", enabled: true });
  expect(loadFacts(ctx.db).disabledAchievements).toEqual([]);
});

test("unknown achievement ids are rejected", () => {
  expect(() => setAchievementEnabled(ctx.db, { achievementId: "nope", enabled: false })).toThrow(ServiceError);
});

test("demo data unlocks several achievements", () => {
  const demo = createTestDb();
  try {
    seedDemo(demo.db);
    const facts = loadFacts(demo.db);
    expect(replay(facts, facts.event.scoring).unlocks.length).toBeGreaterThanOrEqual(5);
  } finally {
    demo.cleanup();
  }
});
```

Why 6 after delete + undo: delete removes the unlocks (nothing announced), undo restores them — they are "new" relative to the state after delete, so `catan-lord:Bob` and `opening-move:Bob` are queued again. Replays of already-played cards are harmless and match the spec ("already played announcements are not retracted").

- [ ] **Step 2: Write the failing finale service test**

Create `src/server/services/finale.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildFinaleScript, revealStepOf } from "@/domain/finale";
import { replay } from "@/domain/replay";
import { loadFacts } from "../repo/facts";
import { createTestDb } from "../testDb";
import { ServiceError } from "./errors";
import { finishEvent, goLive, reopenEvent } from "./event";
import { finaleCommand, setFinaleRevealed } from "./finale";
import { addPlayer } from "./players";
import { recordDirectResult } from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  const ids = ["Amy", "Bob", "Cat"].map((name) => addPlayer(ctx.db, { name }));
  const uno = loadFacts(ctx.db).games.find((g) => g.slug === "uno")!.id;
  recordDirectResult(ctx.db, {
    gameId: uno,
    tableId: null,
    placements: ids.map((playerId, i) => ({ playerId, placement: i + 1, jokerDeclared: false })),
  });
});
afterEach(() => ctx.cleanup());

const event = () => loadFacts(ctx.db).event;
const script = () => {
  const f = loadFacts(ctx.db);
  return buildFinaleScript(f, replay(f, f.event.scoring));
};

test("finale commands require a finished event", () => {
  expect(() => finaleCommand(ctx.db, "next")).toThrow(ServiceError);
  expect(() => setFinaleRevealed(ctx.db, true)).toThrow(ServiceError);
});

test("next walks the script, reveals at the podium beat and stops at the end", () => {
  finishEvent(ctx.db);
  const beats = script();
  const revealAt = revealStepOf(beats);
  for (let step = 1; step < revealAt; step++) {
    expect(finaleCommand(ctx.db, "next")).toEqual({ step, total: beats.length });
    expect(event().finaleRevealed).toBe(false);
  }
  finaleCommand(ctx.db, "next");
  expect(event().finaleRevealed).toBe(true);
  for (let i = 0; i < 5; i++) finaleCommand(ctx.db, "next");
  expect(event().screenControl.finaleStep).toBe(beats.length);
});

test("back never hides standings again; exit returns to scenes", () => {
  finishEvent(ctx.db);
  const revealAt = revealStepOf(script());
  for (let i = 0; i < revealAt; i++) finaleCommand(ctx.db, "next");
  expect(finaleCommand(ctx.db, "back").step).toBe(revealAt - 1);
  expect(event().finaleRevealed).toBe(true);
  expect(finaleCommand(ctx.db, "exit").step).toBe(0);
  expect(finaleCommand(ctx.db, "back").step).toBe(0);
});

test("the admin can toggle the reveal; reopening resets everything", () => {
  finishEvent(ctx.db);
  setFinaleRevealed(ctx.db, true);
  expect(event().finaleRevealed).toBe(true);
  setFinaleRevealed(ctx.db, false);
  expect(event().finaleRevealed).toBe(false);
  finaleCommand(ctx.db, "next");
  reopenEvent(ctx.db);
  expect(event()).toMatchObject({ finaleRevealed: false, screenControl: { finaleStep: 0 } });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/server/services/achievements.test.ts src/server/services/finale.test.ts`
Expected: FAIL — modules `./achievements` and `./finale` not found.

- [ ] **Step 4: Create `src/server/services/achievements.ts`**

```ts
import { isAchievementId, newPublicUnlocks, type Unlock } from "@/domain/achievements";
import { replay } from "@/domain/replay";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import { insertAnnouncement, upsertAchievementSetting } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

function unlocksNow(tx: Tx): Unlock[] {
  const facts = loadFacts(tx);
  return replay(facts, facts.event.scoring).unlocks;
}

/** Runs a result-changing write and queues projector cards for public achievements it newly unlocked. */
export function withUnlockAnnouncements<T>(tx: Tx, write: () => T): T {
  const before = unlocksNow(tx);
  const value = write();
  const now = Date.now();
  for (const u of newPublicUnlocks(before, unlocksNow(tx))) {
    insertAnnouncement(
      tx,
      { type: "achievement", payload: { sessionId: u.sessionId, playerId: u.playerId, achievementId: u.achievementId } },
      now,
    );
  }
  return value;
}

/** `mutate` for writes that can change results. */
export function mutateResult<T>(db: Db, fn: (tx: Tx) => T): T {
  return mutate(db, (tx) => withUnlockAnnouncements(tx, () => fn(tx)));
}

export function setAchievementEnabled(db: Db, input: { achievementId: string; enabled: boolean }): void {
  if (!isAchievementId(input.achievementId)) throw new ServiceError("invalid_value");
  const id = input.achievementId;
  mutate(db, (tx) => upsertAchievementSetting(tx, id, input.enabled), { allowWhenFinished: true });
}
```

- [ ] **Step 5: Use `mutateResult` in `src/server/services/sessions.ts`**

Add `import { mutateResult } from "./achievements";`. In exactly these six functions replace the call `mutate(db, (tx) =>` with `mutateResult(db, (tx) =>` (keeping any leading `return`): `recordResult`, `recordDirectResult`, `editResult`, `deleteResult`, `correctJoker`, `undoLast`. None of them pass options to `mutate`, so the signatures match. Leave the seating, start/finish, cancel, `showOnScreen` and `replayLastReveal` calls on `mutate`.

Check: `grep -n "mutateResult(db" src/server/services/sessions.ts | wc -l` prints `6`.

- [ ] **Step 6: Create `src/server/services/finale.ts`**

```ts
import { buildFinaleScript, clampStep, revealStepOf } from "@/domain/finale";
import { replay } from "@/domain/replay";
import type { Db } from "../db/client";
import { getEventRow, loadFacts } from "../repo/facts";
import { updateEventRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export type FinaleCommand = "next" | "back" | "exit";

export function finaleCommand(db: Db, command: FinaleCommand): { step: number; total: number } {
  return mutate(
    db,
    (tx) => {
      const row = getEventRow(tx);
      if (row.status !== "finished") throw new ServiceError("invalid_status");
      const facts = loadFacts(tx);
      const beats = buildFinaleScript(facts, replay(facts, facts.event.scoring));
      const current = clampStep(row.screenControl.finaleStep, beats);
      const step =
        command === "next" ? clampStep(current + 1, beats) : command === "back" ? clampStep(current - 1, beats) : 0;
      const reveal = step > 0 && step >= revealStepOf(beats);
      updateEventRow(tx, {
        screenControl: { ...row.screenControl, finaleStep: step },
        ...(reveal ? { finaleRevealed: true } : {}),
      });
      return { step, total: beats.length };
    },
    { allowWhenFinished: true },
  );
}

export function setFinaleRevealed(db: Db, revealed: boolean): void {
  mutate(
    db,
    (tx) => {
      if (getEventRow(tx).status !== "finished") throw new ServiceError("invalid_status");
      updateEventRow(tx, { finaleRevealed: revealed });
    },
    { allowWhenFinished: true },
  );
}
```

- [ ] **Step 7: Add `getProfile` to `src/server/live.ts`**

```ts
import { buildProfile, type PlayerProfile } from "@/domain/profile";
```

```ts
export function getProfile(db: Db, playerId: number, audience: "public" | "admin"): PlayerProfile | null {
  const state = getLiveState(db);
  return buildProfile(state.facts, state.replay, playerId, audience);
}
```

- [ ] **Step 8: Add server actions to `src/app/admin/actions.ts`**

Imports:

```ts
import { setAchievementEnabled } from "@/server/services/achievements";
import { finaleCommand, setFinaleRevealed, type FinaleCommand } from "@/server/services/finale";
```

Append:

```ts
// Achievements and finale
export async function setAchievementEnabledAction(input: { achievementId: string; enabled: boolean }): Result {
  return runAdminAction((db) => setAchievementEnabled(db, input));
}

export async function finaleCommandAction(command: FinaleCommand): Result<{ step: number; total: number }> {
  return runAdminAction((db) => finaleCommand(db, command));
}

export async function setFinaleRevealedAction(revealed: boolean): Result {
  return runAdminAction((db) => setFinaleRevealed(db, revealed));
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — new service tests plus the unchanged `sessions.test.ts` and `core.test.ts` suites.

If "demo data unlocks several achievements" fails with fewer than 5 unlocks, print them (`console.log(replay(...).unlocks)`) and lower nothing: the demo (15 results, 22 players, every family) always yields `opening-move` and several family wins; a count below 5 indicates a replay bug to investigate with superpowers:systematic-debugging.

- [ ] **Step 10: Full check and commit**

Run: `npm run typecheck && npm run lint`
Expected: pass.

```bash
git add src/server/services src/server/live.ts src/app/admin/actions.ts
git commit -m "feat(services): announce new public unlocks, toggle achievements, drive the finale"
```

---
### Task 7: Tier 2 dictionaries (English and Russian)

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENT_IDS`, `AchievementId`, `Rarity` (Task 1).
- Produces (keys used verbatim by Tasks 8-12):
  - `plurals.sealedUnlocks`
  - `nav.finale`, `nav.achievements`
  - `room.latestUnlocks`, `room.noUnlocks`
  - `settings.event.openFinale`, `settings.screen.sceneNames.achievements`
  - `home.findMe`, `home.findPlaceholder`, `home.noMatches`, `home.myProfile`, `home.achievements`, `home.achievementsUnlocked`, `home.latestUnlocks`
  - `screen.achievementUnlocked`, `screen.achievements`, `screen.sealedUntilFinale`, `screen.achievementsUnlocked`, `screen.podium`
  - `achievements.{title, subtitle, sealed, sealedBody, unlockedBy, nobodyYet, none, back, sealedCount, rarity: Record<Rarity, string>, defs: Record<AchievementId, { title; description }>}`
  - `finale.{complete, gamesPlayed, duration, players, numbers, mostPlayed, longest, busiestTable, rivals, sealedAchievement, place, champion, coChampions, finalStandings, rehearsal, rehearsalHint}`
  - `finaleRemote.{title, notFinished, openSettings, next, back, auto, exit, stepOf, notStarted, current, upNext, revealed, revealedHint, rehearsal, rehearsalHint, beat: { complete, numbers, sealed, place, champion, coChampions, podium, closing }}`
  - `adminAchievements.{title, hint, sealed, unlockCount, all, none}`
  - `profile.{back, achievements, games, noGames, favoriteGame, tablesPlayed, rank, points, raw, wins, podiums, winRate, strongest, weakest, rankHistory, notCounted, sealedNote, ofN}`

Templates use `{name}` placeholders filled by `fmt()`.

- [ ] **Step 1: Write the failing dictionary test**

In `src/i18n/i18n.test.ts` add `import { ACHIEVEMENT_IDS } from "@/domain/achievements";` and inside `describe("dictionaries", ...)`:

```ts
  test("every achievement has a title and description in both languages", () => {
    for (const dict of [en, ru]) {
      expect(Object.keys(dict.achievements.defs).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
      for (const id of ACHIEVEMENT_IDS) {
        expect(dict.achievements.defs[id].title.trim()).not.toBe("");
        expect(dict.achievements.defs[id].description.trim()).not.toBe("");
      }
    }
  });

  test("Russian sealed-unlock plural", () => {
    expect(plural("ru", 1, ru.plurals.sealedUnlocks)).toBe("скрытое достижение");
    expect(plural("ru", 3, ru.plurals.sealedUnlocks)).toBe("скрытых достижения");
    expect(plural("ru", 5, ru.plurals.sealedUnlocks)).toBe("скрытых достижений");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'defs')`.

- [ ] **Step 3: Extend `src/i18n/en.ts`**

Add at the top: `import type { AchievementId, Rarity } from "@/domain/achievements";`

Add to existing sections:

```ts
  // plurals
    sealedUnlocks: { one: "sealed unlock", other: "sealed unlocks" } as PluralForms,
  // nav
    finale: "Finale",
    achievements: "Achievements",
  // room
    latestUnlocks: "Latest unlocks",
    noUnlocks: "No achievements unlocked yet.",
  // settings.event
      openFinale: "Open finale remote",
  // settings.screen.sceneNames
        achievements: "Achievements",
  // home
    findMe: "Find me",
    findPlaceholder: "Type your name",
    noMatches: "No players found.",
    myProfile: "My profile",
    achievements: "Achievements",
    achievementsUnlocked: "Achievements",
    latestUnlocks: "Latest unlocks",
  // screen
    achievementUnlocked: "Achievement unlocked",
    achievements: "Achievements",
    sealedUntilFinale: "Sealed until the finale",
    achievementsUnlocked: "Achievements",
    podium: "Podium",
```

Add new top-level sections before `};`:

```ts
  achievements: {
    title: "Achievements",
    subtitle: "Unlocked live during the evening.",
    sealed: "Sealed",
    sealedBody: "Revealed at the finale.",
    unlockedBy: "Unlocked by",
    nobodyYet: "Nobody yet",
    none: "No achievements unlocked yet.",
    back: "Back to event",
    sealedCount: "Sealed unlocks",
    rarity: {
      legendary: "Legendary",
      epic: "Epic",
      rare: "Rare",
      common: "Common",
    } satisfies Record<Rarity, string>,
    defs: {
      "catan-lord": { title: "Catan Lord", description: "Win a game of Catan." },
      "rail-baron": { title: "Rail Baron", description: "Win Ticket to Ride." },
      "gem-master": { title: "Gem Master", description: "Win Splendor." },
      "music-master": { title: "Music Master", description: "Win Hitster." },
      "wonder-architect": { title: "Wonder Architect", description: "Win 7 Wonders." },
      kingmaker: { title: "Kingmaker", description: "Win Citadels." },
      "rat-king": { title: "Rat King", description: "Win Rats Race." },
      "last-card": { title: "Last Card", description: "Win Uno." },
      "opening-move": { title: "Opening Move", description: "Win the first game of the evening." },
      "back-to-back": { title: "Back to Back", description: "Win two games in a row." },
      "hot-streak": { title: "Hot Streak", description: "Win three games in a row." },
      "triple-threat": { title: "Triple Threat", description: "Win three different games." },
      phoenix: { title: "Phoenix", description: "Win right after finishing last." },
      "all-rounder": { title: "All-Rounder", description: "Play five different games." },
      "table-hopper": { title: "Table Hopper", description: "Play at four different tables." },
      "social-butterfly": { title: "Social Butterfly", description: "Play against eight different opponents." },
      marathon: { title: "Marathon", description: "Spend 180 minutes at the tables." },
      comeback: { title: "Comeback", description: "Climb three or more places with one result." },
      underdog: { title: "Underdog", description: "Win with the fewest points at the table." },
      "giant-slayer": { title: "Giant Slayer", description: "Finish above the tournament leader." },
      "joker-master": { title: "Joker Master", description: "Win with your Joker declared." },
      "risk-taker": { title: "Risk Taker", description: "Declare your Joker at a table of five or more." },
    } satisfies Record<AchievementId, { title: string; description: string }>,
  },
  finale: {
    complete: "Event complete",
    gamesPlayed: "Games played",
    duration: "Hours of play",
    players: "Players",
    numbers: "The evening in numbers",
    mostPlayed: "Most played",
    longest: "Longest game",
    busiestTable: "Busiest table",
    rivals: "Rivals of the night",
    sealedAchievement: "Sealed achievement",
    place: "{place} place",
    champion: "Champion",
    coChampions: "Co-champions",
    finalStandings: "Final standings",
    rehearsal: "Rehearsal",
    rehearsalHint: "Space or arrow keys to step",
  },
  finaleRemote: {
    title: "Finale",
    notFinished: "Finish the event in Settings to start the finale.",
    openSettings: "Open settings",
    next: "Next",
    back: "Back",
    auto: "Auto-advance every 10 s",
    exit: "Back to scenes",
    stepOf: "Step {step} of {total}",
    notStarted: "Not started",
    current: "On screen",
    upNext: "Up next",
    revealed: "Standings public",
    revealedHint: "Phones and the leaderboard show points and ranks.",
    rehearsal: "Open rehearsal",
    rehearsalHint: "Plays the ceremony with placeholder names. Real data is not touched.",
    beat: {
      complete: "Event complete",
      numbers: "The evening in numbers",
      sealed: "Sealed: {title}",
      place: "{place} place",
      champion: "Champion",
      coChampions: "Co-champions",
      podium: "Final standings (makes standings public)",
      closing: "Closing card",
    },
  },
  adminAchievements: {
    title: "Achievements",
    hint: "Disabled achievements disappear everywhere and are not announced.",
    sealed: "Sealed",
    unlockCount: "{n} unlocked",
    all: "All unlocks",
    none: "No unlocks yet.",
  },
  profile: {
    back: "Back to event",
    achievements: "Achievements",
    games: "Games",
    noGames: "No games yet.",
    favoriteGame: "Favorite game",
    tablesPlayed: "Tables played",
    rank: "Rank",
    points: "Points",
    raw: "Raw",
    wins: "Wins",
    podiums: "Podiums",
    winRate: "Win rate",
    strongest: "Strongest game",
    weakest: "Weakest game",
    rankHistory: "Rank over the evening",
    notCounted: "Not counted",
    sealedNote: "Points and rank are revealed at the finale.",
    ofN: "of {n}",
  },
```

(The `// section` comments above mark where each group of keys goes; do not paste the comments.)

- [ ] **Step 4: Extend `src/i18n/ru.ts` with the same keys**

```ts
  // plurals
    sealedUnlocks: { one: "скрытое достижение", few: "скрытых достижения", many: "скрытых достижений", other: "скрытых достижения" },
  // nav
    finale: "Финал",
    achievements: "Достижения",
  // room
    latestUnlocks: "Новые достижения",
    noUnlocks: "Достижений пока нет.",
  // settings.event
      openFinale: "Пульт финала",
  // settings.screen.sceneNames
        achievements: "Достижения",
  // home
    findMe: "Найти себя",
    findPlaceholder: "Введите имя",
    noMatches: "Игроки не найдены.",
    myProfile: "Мой профиль",
    achievements: "Достижения",
    achievementsUnlocked: "Достижений",
    latestUnlocks: "Новые достижения",
  // screen
    achievementUnlocked: "Достижение открыто",
    achievements: "Достижения",
    sealedUntilFinale: "Скрыты до финала",
    achievementsUnlocked: "Достижений",
    podium: "Пьедестал",
```

```ts
  achievements: {
    title: "Достижения",
    subtitle: "Открываются прямо во время вечера.",
    sealed: "Скрыто",
    sealedBody: "Раскроется в финале.",
    unlockedBy: "Открыли",
    nobodyYet: "Пока никто",
    none: "Достижений пока нет.",
    back: "К событию",
    sealedCount: "Скрытых достижений",
    rarity: {
      legendary: "Легендарное",
      epic: "Эпическое",
      rare: "Редкое",
      common: "Обычное",
    },
    defs: {
      "catan-lord": { title: "Властелин Катана", description: "Выиграйте партию в Catan." },
      "rail-baron": { title: "Железнодорожный барон", description: "Выиграйте Ticket to Ride." },
      "gem-master": { title: "Мастер самоцветов", description: "Выиграйте Splendor." },
      "music-master": { title: "Меломан", description: "Выиграйте Hitster." },
      "wonder-architect": { title: "Архитектор чудес", description: "Выиграйте 7 Wonders." },
      kingmaker: { title: "Делатель королей", description: "Выиграйте Citadels." },
      "rat-king": { title: "Крысиный король", description: "Выиграйте Rats Race." },
      "last-card": { title: "Последняя карта", description: "Выиграйте Uno." },
      "opening-move": { title: "Первый ход", description: "Выиграйте первую игру вечера." },
      "back-to-back": { title: "Дубль", description: "Выиграйте две игры подряд." },
      "hot-streak": { title: "Серия побед", description: "Выиграйте три игры подряд." },
      "triple-threat": { title: "Тройная угроза", description: "Победите в трёх разных играх." },
      phoenix: { title: "Феникс", description: "Победите сразу после последнего места." },
      "all-rounder": { title: "Универсал", description: "Сыграйте в пять разных игр." },
      "table-hopper": { title: "Кочевник", description: "Сыграйте за четырьмя разными столами." },
      "social-butterfly": { title: "Душа компании", description: "Сыграйте против восьми разных соперников." },
      marathon: { title: "Марафонец", description: "Проведите за играми 180 минут." },
      comeback: { title: "Камбэк", description: "Поднимитесь на три места и выше за одну игру." },
      underdog: { title: "Тёмная лошадка", description: "Победите, имея меньше всех очков за столом." },
      "giant-slayer": { title: "Победитель гигантов", description: "Финишируйте выше лидера турнира." },
      "joker-master": { title: "Мастер Джокера", description: "Победите с объявленным Джокером." },
      "risk-taker": { title: "Рисковый", description: "Объявите Джокер за столом из пяти и более игроков." },
    },
  },
  finale: {
    complete: "Турнир завершён",
    gamesPlayed: "Игр сыграно",
    duration: "Часов игры",
    players: "Игроков",
    numbers: "Вечер в цифрах",
    mostPlayed: "Самая популярная игра",
    longest: "Самая долгая партия",
    busiestTable: "Самый загруженный стол",
    rivals: "Соперники вечера",
    sealedAchievement: "Скрытое достижение",
    place: "{place} место",
    champion: "Чемпион",
    coChampions: "Чемпионы",
    finalStandings: "Итоговая таблица",
    rehearsal: "Репетиция",
    rehearsalHint: "Пробел или стрелки для перехода",
  },
  finaleRemote: {
    title: "Финал",
    notFinished: "Завершите турнир в настройках, чтобы начать финал.",
    openSettings: "Открыть настройки",
    next: "Дальше",
    back: "Назад",
    auto: "Автопереход каждые 10 с",
    exit: "Вернуть сцены",
    stepOf: "Шаг {step} из {total}",
    notStarted: "Не начат",
    current: "На экране",
    upNext: "Следующий",
    revealed: "Таблица открыта",
    revealedHint: "Телефоны и таблица показывают очки и места.",
    rehearsal: "Открыть репетицию",
    rehearsalHint: "Показывает церемонию с условными именами. Реальные данные не затрагиваются.",
    beat: {
      complete: "Турнир завершён",
      numbers: "Вечер в цифрах",
      sealed: "Скрытое: {title}",
      place: "{place} место",
      champion: "Чемпион",
      coChampions: "Чемпионы",
      podium: "Итоговая таблица (открывает очки)",
      closing: "Финальная заставка",
    },
  },
  adminAchievements: {
    title: "Достижения",
    hint: "Выключенные достижения пропадают везде и не объявляются.",
    sealed: "Скрытое",
    unlockCount: "Открыли: {n}",
    all: "Все открытия",
    none: "Пока никто ничего не открыл.",
  },
  profile: {
    back: "К событию",
    achievements: "Достижения",
    games: "Игры",
    noGames: "Игр пока нет.",
    favoriteGame: "Любимая игра",
    tablesPlayed: "Столов",
    rank: "Место",
    points: "Очки",
    raw: "Всего",
    wins: "Победы",
    podiums: "Призовые",
    winRate: "Доля побед",
    strongest: "Сильная игра",
    weakest: "Слабая игра",
    rankHistory: "Место по ходу вечера",
    notCounted: "Не в зачёте",
    sealedNote: "Очки и место раскроют в финале.",
    ofN: "из {n}",
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/i18n/i18n.test.ts && npm run typecheck`
Expected: PASS; typecheck passes (`ru: Dict` enforces identical keys; `satisfies` enforces all 22 ids in `en`).

- [ ] **Step 6: Commit**

Run: `npm test && npm run lint`

```bash
git add src/i18n
git commit -m "feat(i18n): add achievements, finale, profile and remote strings in English and Russian"
```

---
### Task 8: Motion primitives and the result celebration

**Files:**
- Create: `src/components/motion/MaskReveal.tsx`, `src/components/motion/NumberRoll.tsx`, `src/components/motion/GoldDust.tsx`
- Modify: `src/components/screen/logic.ts`, `src/components/screen/ResultReveal.tsx`
- Test: `src/components/screen/logic.test.ts`

**Interfaces:**
- Consumes: `EASE` from `FadeRise.tsx`; `ResultView<PublicPlacementView>`; `t.screen.podium` (Task 7).
- Produces:
  - `<MaskReveal delay? duration? className?>` — clip-path wipe left to right.
  - `<NumberRoll value format? duration? delay? className?>` — counts from 0 to `value`; `format` defaults to integer.
  - `<GoldDust count? className?>` — absolute full-size canvas, at most 40 particles (`GOLD_DUST_MAX`), color from `--accent`.
  - `revealTimeline(nonWinnerCount)` now returns `{ titleMs, firstPlaceMs, stepMs, winnerMs, podiumMs, doneMs }`.
  - `podiumSlots(placements: { playerId: number; placement: number }[]): { placement: 1 | 2 | 3; playerIds: number[] }[]` in display order 2nd, 1st, 3rd (missing slots omitted).

- [ ] **Step 1: Update the failing logic tests**

In `src/components/screen/logic.test.ts` import `podiumSlots` too, replace the `revealTimeline` test and add one:

```ts
test("revealTimeline spaces placements, holds the winner, then the podium", () => {
  const t = revealTimeline(3);
  expect(t.titleMs).toBe(2200);
  expect(t.firstPlaceMs).toBe(2600);
  expect(t.winnerMs).toBe(2600 + 3 * 900 + 700);
  expect(t.podiumMs).toBe(t.winnerMs + 4000);
  expect(t.doneMs).toBe(t.podiumMs + 3000);
});

test("podiumSlots groups ties and orders 2nd, 1st, 3rd", () => {
  expect(
    podiumSlots([
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
      { playerId: 3, placement: 3 },
      { playerId: 4, placement: 4 },
    ]),
  ).toEqual([
    { placement: 2, playerIds: [2] },
    { placement: 1, playerIds: [1] },
    { placement: 3, playerIds: [3] },
  ]);
  expect(
    podiumSlots([
      { playerId: 5, placement: 1 },
      { playerId: 6, placement: 1 },
      { playerId: 7, placement: 3 },
    ]),
  ).toEqual([
    { placement: 1, playerIds: [5, 6] },
    { placement: 3, playerIds: [7] },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: FAIL — `t.podiumMs` undefined, `podiumSlots` is not a function.

- [ ] **Step 3: Update `src/components/screen/logic.ts`**

Replace the timeline constants and function with:

```ts
const TITLE_MS = 2200;
const FIRST_PLACE_MS = 2600;
const STEP_MS = 900;
const WINNER_PAUSE_MS = 700;
const WINNER_HOLD_MS = 4000;
const PODIUM_HOLD_MS = 3000;

export function revealTimeline(nonWinnerCount: number) {
  const winnerMs = FIRST_PLACE_MS + nonWinnerCount * STEP_MS + WINNER_PAUSE_MS;
  const podiumMs = winnerMs + WINNER_HOLD_MS;
  return {
    titleMs: TITLE_MS,
    firstPlaceMs: FIRST_PLACE_MS,
    stepMs: STEP_MS,
    winnerMs,
    podiumMs,
    doneMs: podiumMs + PODIUM_HOLD_MS,
  };
}

const PODIUM_ORDER = [2, 1, 3] as const;

export function podiumSlots(
  placements: { playerId: number; placement: number }[],
): { placement: 1 | 2 | 3; playerIds: number[] }[] {
  return PODIUM_ORDER.map((placement) => ({
    placement,
    playerIds: placements.filter((p) => p.placement === placement).map((p) => p.playerId),
  })).filter((slot) => slot.playerIds.length > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the motion primitives**

`src/components/motion/MaskReveal.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { EASE } from "./FadeRise";

export function MaskReveal({
  children,
  delay = 0,
  duration = 0.9,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
```

`src/components/motion/NumberRoll.tsx`:

```tsx
"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "./FadeRise";

const integer = (n: number) => String(Math.round(n));

export function NumberRoll({
  value,
  format = integer,
  duration = 1.4,
  delay = 0,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, { duration, delay, ease: EASE, onUpdate: setShown });
    return () => controls.stop();
  }, [value, duration, delay, reduce]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(reduce ? value : shown)}
    </span>
  );
}
```

`src/components/motion/GoldDust.tsx`:

```tsx
"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export const GOLD_DUST_MAX = 40;

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
}

/** Sparse rising gold particles. Winner reveal and finale only. */
export function GoldDust({ count = 32, className }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduce) return;
    const width = (canvas.width = canvas.clientWidth);
    const height = (canvas.height = canvas.clientHeight);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c9a45c";
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const particles: Particle[] = Array.from({ length: Math.max(0, Math.min(GOLD_DUST_MAX, Math.floor(count))) }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      size: rand(1, 3.2),
      speed: rand(18, 60),
      sway: rand(0.4, 1.4),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.35, 0.9),
    }));

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const p of particles) {
        p.y -= p.speed * dt;
        p.phase += dt;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = rand(0, width);
        }
        ctx.globalAlpha = p.alpha * (0.55 + 0.45 * Math.sin(p.phase * 2));
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(p.phase * p.sway) * 14, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count, reduce]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
```

- [ ] **Step 6: Replace `src/components/screen/ResultReveal.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { GoldDust } from "@/components/motion/GoldDust";
import { MaskReveal } from "@/components/motion/MaskReveal";
import { formatPoints } from "@/domain/scoring";
import type { PublicPlacementView, PublicSnapshot, ResultView } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { podiumSlots, revealTimeline } from "./logic";

type Phase = "title" | "places" | "winner" | "podium";

const PODIUM_HEIGHT = { 1: 360, 2: 250, 3: 180 } as const;

export function ResultReveal({
  snapshot,
  result,
  onDone,
}: {
  snapshot: PublicSnapshot;
  result: ResultView<PublicPlacementView>;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const game = lookups.games.get(result.gameId);
  const table = result.tableId !== null ? lookups.tables.get(result.tableId) : undefined;
  const winners = result.placements.filter((p) => p.placement === 1);
  const others = result.placements.filter((p) => p.placement !== 1);
  const [phase, setPhase] = useState<Phase>("title");
  const [revealed, setRevealed] = useState(0);
  const name = (playerId: number) => lookups.players.get(playerId)?.name ?? "";

  useEffect(() => {
    const timeline = revealTimeline(others.length);
    const timers = [
      setTimeout(() => setPhase("places"), timeline.titleMs),
      ...others.map((_, i) => setTimeout(() => setRevealed(i + 1), timeline.firstPlaceMs + i * timeline.stepMs)),
      setTimeout(() => setPhase("winner"), timeline.winnerMs),
      setTimeout(() => setPhase("podium"), timeline.podiumMs),
      setTimeout(onDone, timeline.doneMs),
    ];
    return () => timers.forEach(clearTimeout);
    // `others` is derived fresh each render from `result.placements`; re-running on every
    // reference change would restart the reveal timeline on each live-poll re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others.length, onDone]);

  const descending = [...others].sort((a, b) => b.placement - a.placement);
  const visible = new Set(descending.slice(0, revealed).map((p) => p.playerId));

  return (
    <motion.div
      className="absolute inset-0 z-20 bg-[#070708]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {phase === "winner" || phase === "podium" ? <GoldDust count={32} /> : null}

      {phase === "podium" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative flex h-full flex-col px-[120px] pt-[110px] pb-[120px]"
        >
          <div className="flex items-center gap-6 font-display text-[36px] uppercase tracking-[0.3em] text-accent">
            {game ? <GameIcon name={game.icon} className="size-[44px]" /> : null}
            {game?.name}
            <span className="text-muted">· {t.screen.podium}</span>
          </div>
          <div className="mt-auto grid grid-cols-3 items-end gap-10">
            {podiumSlots(result.placements).map((slot, i) => (
              <div key={slot.placement} className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "mb-6 font-display uppercase leading-[0.95] tracking-tight",
                    slot.placement === 1 ? "text-[96px] text-text" : "text-[64px] text-text/85",
                  )}
                >
                  {slot.playerIds.map((id) => (
                    <div key={id}>{name(id)}</div>
                  ))}
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: PODIUM_HEIGHT[slot.placement] }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.12 }}
                  className={cn(
                    "flex w-full items-start justify-center border-t pt-6",
                    slot.placement === 1 ? "border-accent bg-accent/10" : "border-line-strong bg-white/[0.03]",
                  )}
                >
                  <span className={cn("font-mono text-[56px]", slot.placement === 1 ? "text-accent" : "text-muted")}>
                    {ordinal(lang, slot.placement)}
                  </span>
                </motion.div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="relative grid h-full grid-cols-[1fr_780px] gap-20 px-[120px] py-[120px]">
          <div className="flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              className="flex items-center gap-6 font-display text-[36px] uppercase tracking-[0.3em] text-accent"
            >
              {game ? <GameIcon name={game.icon} className="size-[48px]" /> : null}
              {t.screen.result}
              {table ? <span className="text-muted">· {fmt(t.common.tableN, { n: table.number })}</span> : null}
            </motion.div>
            <MaskReveal delay={0.2} duration={1.1} className="mt-6">
              <h2 className="font-display text-[170px] uppercase leading-[0.9] tracking-tight">{game?.name}</h2>
            </MaskReveal>

            {phase === "winner" ? (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE }}
                className="relative mt-16 overflow-hidden border-t border-accent/60 pt-10"
              >
                <div className="font-display text-[40px] uppercase tracking-[0.3em] text-accent">{t.screen.winner}</div>
                {winners.map((w) => (
                  <div key={w.playerId} className="mt-2 flex items-baseline gap-10">
                    <span className="font-display text-[190px] uppercase leading-none tracking-tight">{name(w.playerId)}</span>
                    {w.points !== undefined ? (
                      <span className="font-mono text-[60px] text-accent">{formatPoints(w.points)}</span>
                    ) : null}
                  </div>
                ))}
                <span
                  aria-hidden
                  className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-24 bg-accent/25 blur-2xl"
                />
              </motion.div>
            ) : null}
          </div>

          <div className="flex flex-col justify-center">
            <ol className="space-y-7">
              {[...others]
                .sort((a, b) => a.placement - b.placement)
                .map((p) => {
                  const shown = phase !== "title" && visible.has(p.playerId);
                  return (
                    <motion.li
                      key={p.playerId}
                      initial={false}
                      animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : 40 }}
                      transition={{ duration: 0.6, ease: EASE }}
                      className="flex items-baseline gap-8 border-b border-line pb-5"
                    >
                      <span className="w-[120px] font-mono text-[44px] text-muted">{ordinal(lang, p.placement)}</span>
                      <span className="flex-1 truncate font-display text-[64px] uppercase tracking-wide">{name(p.playerId)}</span>
                      {p.points !== undefined ? (
                        <span className="font-mono text-[40px] text-muted">{formatPoints(p.points)}</span>
                      ) : null}
                    </motion.li>
                  );
                })}
            </ol>
          </div>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 7: Check in the browser**

Run: `npm test && npm run typecheck && npm run lint`, then `npm run dev`. With demo data seeded (`npm run db:seed:demo` if the dev DB has none), log into `/admin`, open `/screen` in a second window, press "Replay last result" in the control room. Expected on `/screen`: title card, placements from last up, winner with light sweep and rising gold particles, then a three-column podium for 3 s, then back to rotation (about 13 s total for 4 players).

- [ ] **Step 8: Commit**

```bash
git add src/components/motion src/components/screen/logic.ts src/components/screen/logic.test.ts src/components/screen/ResultReveal.tsx
git commit -m "feat(screen): add gold dust, mask reveal, number roll and a podium hold to result reveals"
```

---
### Task 9: Projector — achievement announcements and the achievements scene

**Files:**
- Modify: `src/domain/types.ts`, `src/server/seed/base.ts`, `src/server/repo/repo.test.ts`
- Create: `drizzle/0002_enable_achievements_scene.sql` (custom migration)
- Create: `src/components/common/AchievementIcon.tsx`, `src/components/screen/AchievementCard.tsx`, `src/components/screen/scenes/SceneAchievements.tsx`
- Modify: `src/components/screen/logic.ts`, `src/components/screen/AnnouncementPlayer.tsx`, `src/components/screen/ScreenApp.tsx`, `src/components/screen/scenes/SceneCounters.tsx`, `src/components/screen/scenes/SceneContenders.tsx`
- Test: `src/components/screen/logic.test.ts`

**Interfaces:**
- Consumes: `ScreenAnnouncement` achievement variant, `PublicSnapshot.achievements`, `counters.achievementsUnlocked` (Task 4); `achievementDef`, `rarityOf` (Task 1); dictionary keys (Task 7).
- Produces:
  - `SceneId` includes `"achievements"`; `ALL_SCENES = ["title", "room", "recent", "counters", "achievements", "contenders"]`; `DEFAULT_SCENES = ["title", "room", "recent", "counters", "achievements"]`.
  - `ACHIEVEMENT_HOLD_MS = 15_000`; `pickNext(queue: ScreenAnnouncement[], now: number, holdMs?): ScreenAnnouncement | null`.
  - `availableScenes(enabled, snapshot: Pick<PublicSnapshot, "recentResults" | "contenders" | "achievements">)` — `achievements` shown only when there is at least one public unlock or sealed unlock.
  - `<AchievementIcon id: AchievementId className?>` (shared by screen, admin, public).
  - `<AchievementCard snapshot achievementId playerId onDone>`.

- [ ] **Step 1: Write the failing logic tests**

In `src/components/screen/logic.test.ts` import `pickNext` too. Replace the `availableScenes` test and append a `pickNext` suite:

```ts
const noAchievements = { enabled: [], unlocks: [], sealedUnlockCount: 0, eligiblePlayers: 0 };

test("availableScenes drops empty scenes and never returns an empty list", () => {
  expect(
    availableScenes(["title", "recent", "contenders", "room", "achievements"], {
      recentResults: [],
      contenders: null,
      achievements: noAchievements,
    }),
  ).toEqual(["title", "room"]);
  expect(
    availableScenes(["recent", "contenders", "achievements"], {
      recentResults: [result],
      contenders: [3],
      achievements: { ...noAchievements, sealedUnlockCount: 1 },
    }),
  ).toEqual(["recent", "contenders", "achievements"]);
  expect(availableScenes(["recent"], { recentResults: [], contenders: [], achievements: noAchievements })).toEqual(["title"]);
});

describe("pickNext", () => {
  const card = (id: number, sessionId: number, createdAt: number): ScreenAnnouncement => ({
    id,
    createdAt,
    type: "achievement",
    achievementId: "catan-lord",
    playerId: 1,
    sessionId,
  });
  const revealOf = (id: number, sessionId: number): ScreenAnnouncement => ({
    id,
    createdAt: 0,
    type: "result_reveal",
    result: { ...result, sessionId },
  });
  const milestone: ScreenAnnouncement = { id: 9, createdAt: 0, type: "milestone", count: 10 };

  test("plays non-achievement items in order", () => {
    expect(pickNext([milestone], 0)?.id).toBe(9);
    expect(pickNext([], 0)).toBeNull();
  });

  test("holds a fresh achievement, then plays it", () => {
    expect(pickNext([card(1, 5, 10_000)], 20_000, 15_000)).toBeNull();
    expect(pickNext([card(1, 5, 10_000)], 25_000, 15_000)?.id).toBe(1);
  });

  test("a queued reveal of the same game always goes first", () => {
    expect(pickNext([card(1, 5, 0), revealOf(2, 5)], 60_000, 15_000)?.id).toBe(2);
    expect(pickNext([card(1, 5, 0), revealOf(2, 6)], 60_000, 15_000)?.id).toBe(1);
  });

  test("other announcements are not blocked by a held achievement", () => {
    expect(pickNext([card(1, 5, 10_000), milestone], 11_000, 15_000)?.id).toBe(9);
  });
});
```

Change the first import line to `import { describe, expect, test } from "vitest";`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: FAIL — `pickNext` is not a function; `availableScenes` keeps `achievements` for an empty view.

- [ ] **Step 3: Scene id, defaults, seed and migration**

In `src/domain/types.ts`:

```ts
export type SceneId = "title" | "room" | "recent" | "counters" | "achievements" | "contenders";

export const ALL_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements", "contenders"];
export const DEFAULT_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements"];
```

In `src/server/seed/base.ts` import `DEFAULT_SCENES` (`import { DEFAULT_SCENES, type GameFact } from "@/domain/types";`) and change the event insert values to:

```ts
        .values({
          id: 1,
          adminPinHash: hashPin(opts.adminPin),
          sessionSecret: randomSecret(),
          enabledScenes: [...DEFAULT_SCENES],
        })
```

The schema's SQL default stays unchanged on purpose: changing a column default in SQLite makes drizzle-kit rebuild the `event` table.

In `src/server/repo/repo.test.ts` change the base-seed expectation to:

```ts
    expect(facts.event.enabledScenes).toEqual(["title", "room", "recent", "counters", "achievements"]);
```

Create the custom migration for databases seeded before this task:

Run: `npx drizzle-kit generate --custom --name enable_achievements_scene`
Expected: creates an empty `drizzle/0002_enable_achievements_scene.sql` and a journal entry. Put this into the file:

```sql
UPDATE `event`
SET `enabledScenes` = json_insert(`enabledScenes`, '$[#]', 'achievements')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`event`.`enabledScenes`) WHERE json_each.value = 'achievements');
```

- [ ] **Step 4: Implement queue logic in `src/components/screen/logic.ts`**

Replace `availableScenes` and add `pickNext`:

```ts
export function availableScenes(
  enabled: SceneId[],
  snapshot: Pick<PublicSnapshot, "recentResults" | "contenders" | "achievements">,
): SceneId[] {
  const scenes = enabled.filter((scene) => {
    if (scene === "recent") return snapshot.recentResults.length > 0;
    if (scene === "contenders") return (snapshot.contenders?.length ?? 0) > 0;
    if (scene === "achievements") {
      return snapshot.achievements.unlocks.length > 0 || snapshot.achievements.sealedUnlockCount > 0;
    }
    return true;
  });
  return scenes.length > 0 ? scenes : ["title"];
}

export const ACHIEVEMENT_HOLD_MS = 15_000;

/**
 * Next announcement to play from a queue in id order. Achievement cards wait a moment after
 * they were created so that "Show on screen" for the same game can play the reveal first;
 * a reveal already queued for that game always goes first.
 */
export function pickNext(
  queue: ScreenAnnouncement[],
  now: number,
  holdMs = ACHIEVEMENT_HOLD_MS,
): ScreenAnnouncement | null {
  for (const item of queue) {
    if (item.type !== "achievement") return item;
    const revealQueued = queue.some((q) => q.type === "result_reveal" && q.result.sessionId === item.sessionId);
    if (!revealQueued && now - item.createdAt >= holdMs) return item;
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/screen/logic.test.ts src/server/repo/repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `src/components/common/AchievementIcon.tsx`**

```tsx
import {
  Armchair,
  Award,
  Bird,
  Castle,
  Flag,
  Flame,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Repeat,
  Shapes,
  Spade,
  Sprout,
  Swords,
  Timer,
  TrainFront,
  TrendingUp,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { achievementDef, type AchievementId } from "@/domain/achievements";

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Bird,
  Castle,
  Flag,
  Flame,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Repeat,
  Shapes,
  Spade,
  Sprout,
  Swords,
  Timer,
  TrainFront,
  TrendingUp,
  Trophy,
  Users,
  Zap,
};

export function AchievementIcon({ id, className }: { id: AchievementId; className?: string }) {
  const Icon = ICONS[achievementDef(id).icon] ?? Award;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
```

- [ ] **Step 7: Create `src/components/screen/AchievementCard.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { MaskReveal } from "@/components/motion/MaskReveal";
import type { AchievementId } from "@/domain/achievements";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";

export const ACHIEVEMENT_CARD_MS = 5500;

export function AchievementCard({
  snapshot,
  achievementId,
  playerId,
  onDone,
}: {
  snapshot: PublicSnapshot;
  achievementId: AchievementId;
  playerId: number;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const player = lookups.players.get(playerId);
  const def = t.achievements.defs[achievementId];

  useEffect(() => {
    const id = setTimeout(onDone, ACHIEVEMENT_CARD_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center bg-[#070708]/95 px-[160px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="grid size-[340px] shrink-0 place-items-center rounded-md border border-accent/60"
      >
        <AchievementIcon id={achievementId} className="size-[180px] text-accent" />
      </motion.div>
      <div className="ml-[100px] min-w-0">
        <motion.div
          initial={{ opacity: 0, letterSpacing: "0.7em" }}
          animate={{ opacity: 1, letterSpacing: "0.32em" }}
          transition={{ duration: 1, ease: EASE }}
          className="font-display text-[40px] uppercase text-accent"
        >
          {t.screen.achievementUnlocked}
        </motion.div>
        <MaskReveal delay={0.35} className="mt-4">
          <div className="font-display text-[150px] uppercase leading-[0.9] tracking-tight">{def.title}</div>
        </MaskReveal>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-6 text-[40px] text-muted"
        >
          {def.description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 1.3 }}
          className="mt-12 flex items-center gap-6 border-t border-line pt-8"
        >
          <span className="h-[70px] w-[6px] rounded-sm" style={{ backgroundColor: player?.color }} />
          <span className="font-display text-[90px] uppercase leading-none tracking-tight">{player?.name}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 8: Rewrite the queue in `src/components/screen/AnnouncementPlayer.tsx`**

Replace the component body (keep `SEEN_KEY`, `readSeen`, `writeSeen`) with:

```tsx
/** Plays queued announcements one at a time; reports whether something is on screen. */
export function AnnouncementPlayer({
  snapshot,
  onActiveChange,
}: {
  snapshot: PublicSnapshot;
  onActiveChange: (active: boolean) => void;
}) {
  const [queue, setQueue] = useState<ScreenAnnouncement[]>([]);
  const [current, setCurrent] = useState<ScreenAnnouncement | null>(null);
  const [tick, setTick] = useState(0);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (seen.current === null) seen.current = readSeen();
    const fresh = nextAnnouncements(snapshot.announcements, seen.current, Date.now());
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    writeSeen(seen.current);
    setQueue((q) => [...q, ...fresh]);
  }, [snapshot.announcements]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const id = setTimeout(() => {
      const next = pickNext(queue, Date.now());
      if (!next) {
        setTick((n) => n + 1);
        return;
      }
      setQueue((q) => q.filter((item) => item.id !== next.id));
      setCurrent(next);
    }, 400);
    return () => clearTimeout(id);
  }, [current, queue, tick]);

  useEffect(() => {
    onActiveChange(Boolean(current));
  }, [current, onActiveChange]);

  const done = useCallback(() => setCurrent(null), []);

  return (
    <AnimatePresence>
      {current?.type === "result_reveal" ? (
        <ResultReveal key={current.id} snapshot={snapshot} result={current.result} onDone={done} />
      ) : null}
      {current?.type === "milestone" ? <MilestoneCard key={current.id} count={current.count} onDone={done} /> : null}
      {current?.type === "achievement" ? (
        <AchievementCard
          key={current.id}
          snapshot={snapshot}
          achievementId={current.achievementId}
          playerId={current.playerId}
          onDone={done}
        />
      ) : null}
    </AnimatePresence>
  );
}
```

Update imports: `import { AchievementCard } from "./AchievementCard";` and `import { nextAnnouncements, pickNext } from "./logic";`.

When nothing is ready, the timer re-checks every 400 ms via `tick`; with a 15 s hold that is cheap and keeps state changes out of the effect body (the repo's `react-hooks/set-state-in-effect` lint rule).

- [ ] **Step 9: Create `src/components/screen/scenes/SceneAchievements.tsx`**

```tsx
"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { NumberRoll } from "@/components/motion/NumberRoll";
import { rarityOf } from "@/domain/achievements";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneAchievements({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const { unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const counts = new Map<string, number>();
  for (const u of unlocks) counts.set(u.achievementId, (counts.get(u.achievementId) ?? 0) + 1);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="04" title={t.screen.achievements} />
      <div className="mt-14 grid flex-1 grid-cols-[520px_1fr] gap-24">
        <div className="flex flex-col justify-center gap-16">
          <div>
            <NumberRoll value={unlocks.length} className="font-display text-[260px] leading-none" />
            <div className="mt-4 font-display text-[40px] uppercase tracking-[0.2em] text-muted">
              {t.screen.achievementsUnlocked}
            </div>
          </div>
          {sealedUnlockCount > 0 ? (
            <div className="flex items-center gap-6 border-t border-line pt-10">
              <Lock className="size-[56px] text-accent" strokeWidth={1.25} />
              <span className="font-display text-[110px] leading-none">{sealedUnlockCount}</span>
              <span className="font-display text-[34px] uppercase tracking-[0.18em] text-muted">{t.screen.sealedUntilFinale}</span>
            </div>
          ) : null}
        </div>
        <ul className="flex flex-col justify-center divide-y divide-line">
          {unlocks.slice(0, 6).map((u, i) => {
            const rarity = rarityOf(counts.get(u.achievementId) ?? 0, eligiblePlayers);
            return (
              <motion.li
                key={`${u.achievementId}:${u.playerId}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.2 + i * 0.1 }}
                className="grid grid-cols-[90px_1fr_auto] items-center gap-8 py-6"
              >
                <AchievementIcon id={u.achievementId} className="size-[64px] text-accent" />
                <div className="min-w-0">
                  <div className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                    {t.achievements.defs[u.achievementId].title}
                  </div>
                  <div className="mt-2 truncate text-[30px] text-muted">{lookups.players.get(u.playerId)?.name}</div>
                </div>
                {rarity ? (
                  <span className="font-display text-[26px] uppercase tracking-[0.2em] text-muted">
                    {t.achievements.rarity[rarity]}
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

Contenders keeps index `04`; change `SceneContenders` heading to `index="05"`.

- [ ] **Step 10: Four counters on the projector**

In `src/components/screen/scenes/SceneCounters.tsx` append to `items`:

```tsx
    { label: t.screen.achievementsUnlocked, value: snapshot.counters.achievementsUnlocked },
```

change the grid class to `grid-cols-4` and the number class from `text-[300px]` to `text-[230px]`.

- [ ] **Step 11: Register the scene in `src/components/screen/ScreenApp.tsx`**

```tsx
import { SceneAchievements } from "./scenes/SceneAchievements";
```

and add `achievements: SceneAchievements,` to `SCENES`. The Settings scene switches iterate `ALL_SCENES` and already have the `sceneNames.achievements` label from Task 7.

- [ ] **Step 12: Verify in the browser and commit**

Run: `npm test && npm run typecheck && npm run lint && npm run db:migrate`.
Then `npm run dev`. Check:
1. `/admin/settings` → Projector lists "Achievements" switched on (dev DB migrated by 0002).
2. Seat a 3-player game on an empty table, start, finish, enter a result. Within about 15 s `/screen` shows "Achievement unlocked" cards (for example the game's family achievement) — unless you tap "Show on screen" in the toast first, in which case the reveal plays and the cards follow it.
3. The rotation includes the Achievements scene with count, sealed line (if any sealed unlocks) and latest unlocks; the Event stats scene shows four numbers.

```bash
git add src/domain/types.ts src/server/seed/base.ts src/server/repo/repo.test.ts drizzle src/components/common/AchievementIcon.tsx src/components/screen
git commit -m "feat(screen): announce achievement unlocks after reveals and add the achievements scene"
```

---
### Task 10: Projector — finale ceremony and rehearsal mode

**Files:**
- Create: `src/components/screen/finale/lookups.ts`, `src/components/screen/finale/beats.tsx`, `src/components/screen/finale/FinaleStage.tsx`, `src/components/screen/finale/RehearsalApp.tsx`
- Modify: `src/components/screen/ScreenApp.tsx`, `src/app/screen/page.tsx`
- Test: `src/components/screen/finale/lookups.test.ts`

**Interfaces:**
- Consumes: `FinaleBeat`, `buildRehearsal`, `RehearsalData` (Task 2); `PublicSnapshot.finale` (Task 4); `MaskReveal`, `NumberRoll`, `GoldDust` (Task 8); `AchievementIcon` (Task 9); dictionary `finale.*` (Task 7).
- Produces:
  - `interface FinaleLookups { players: Map<number, PlayerView>; games: Map<number, GameFact>; tables: Map<number, { number: number }> }`
  - `lookupsFromSnapshot(s: PublicSnapshot): FinaleLookups`, `lookupsFromRehearsal(r: RehearsalData): FinaleLookups`
  - `formatHours(minutes: number | null): string` — `"4:05"`, `"--"` for null
  - `<FinaleStage current: FinaleBeat | null step: number lookups event: { city: string; year: number }>`
  - `<RehearsalApp lang: Lang>`
- Behavior: when `snapshot.finale` is non-null, `/screen` shows only the finale (no rotation, no footer, no announcements). `/screen?rehearsal=1[&lang=ru]` renders `RehearsalApp`, which never polls `/api/live`.

- [ ] **Step 1: Write the failing test**

Create `src/components/screen/finale/lookups.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/screen/finale/lookups.test.ts`
Expected: FAIL — `Cannot find module './lookups'`.

- [ ] **Step 3: Create `src/components/screen/finale/lookups.ts`**

```ts
import type { RehearsalData } from "@/domain/finale";
import type { PlayerView, PublicSnapshot } from "@/domain/snapshot";
import type { GameFact } from "@/domain/types";

export interface FinaleLookups {
  players: Map<number, PlayerView>;
  games: Map<number, GameFact>;
  tables: Map<number, { number: number }>;
}

export function lookupsFromSnapshot(s: PublicSnapshot): FinaleLookups {
  return {
    players: new Map(s.players.map((p) => [p.id, p])),
    games: new Map(s.games.map((g) => [g.id, g])),
    tables: new Map(s.tables.map((t) => [t.tableId, { number: t.number }])),
  };
}

export function lookupsFromRehearsal(r: RehearsalData): FinaleLookups {
  return {
    players: new Map(r.players.map((p) => [p.id, p])),
    games: new Map(r.games.map((g) => [g.id, g])),
    tables: new Map(r.tables.map((t) => [t.id, { number: t.number }])),
  };
}

export function formatHours(minutes: number | null): string {
  if (minutes === null) return "--";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/screen/finale/lookups.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/components/screen/finale/beats.tsx`**

```tsx
"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { AchievementIcon } from "@/components/common/AchievementIcon";
import { GameIcon } from "@/components/common/GameIcon";
import { EASE } from "@/components/motion/FadeRise";
import { GoldDust } from "@/components/motion/GoldDust";
import { MaskReveal } from "@/components/motion/MaskReveal";
import { NumberRoll } from "@/components/motion/NumberRoll";
import type { FinaleBeat } from "@/domain/finale";
import { formatPoints } from "@/domain/scoring";
import { fmt, ordinal, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";
import { formatHours, type FinaleLookups } from "./lookups";

type Beat<K extends FinaleBeat["kind"]> = Extract<FinaleBeat, { kind: K }>;

function Label({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, letterSpacing: "0.8em" }}
      animate={{ opacity: 1, letterSpacing: "0.34em" }}
      transition={{ duration: 1.2, ease: EASE, delay }}
      className="font-display text-[44px] uppercase text-accent"
    >
      {children}
    </motion.div>
  );
}

export function BeatComplete({ beat }: { beat: Beat<"complete"> }) {
  const { t } = useI18n();
  const items = [
    { label: t.finale.gamesPlayed, node: <NumberRoll value={beat.games} delay={0.6} /> },
    { label: t.finale.duration, node: <span>{formatHours(beat.minutes)}</span> },
    { label: t.finale.players, node: <NumberRoll value={beat.players} delay={0.9} /> },
  ];
  return (
    <div className="flex h-full flex-col justify-center px-[140px]">
      <Label>{t.finale.complete}</Label>
      <div className="mt-20 grid grid-cols-3 divide-x divide-line">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.4 + i * 0.25 }}
            className="px-14 first:pl-0"
          >
            <div className="font-display text-[260px] leading-none tabular">{item.node}</div>
            <div className="mt-6 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{item.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function BeatNumbers({ beat, lookups }: { beat: Beat<"numbers">; lookups: FinaleLookups }) {
  const { t, lang } = useI18n();
  const name = (id: number) => lookups.players.get(id)?.name ?? "";
  const gameName = (id: number) => lookups.games.get(id)?.name ?? "";
  const rows: { label: string; value: string; detail: string; icon?: string }[] = [];
  if (beat.mostPlayed) {
    rows.push({
      label: t.finale.mostPlayed,
      value: gameName(beat.mostPlayed.gameId),
      detail: `${beat.mostPlayed.count} ${plural(lang, beat.mostPlayed.count, t.plurals.games)}`,
      icon: lookups.games.get(beat.mostPlayed.gameId)?.icon,
    });
  }
  if (beat.longest) {
    rows.push({
      label: t.finale.longest,
      value: gameName(beat.longest.gameId),
      detail: fmt(t.common.minutesShort, { n: beat.longest.durationMin }),
      icon: lookups.games.get(beat.longest.gameId)?.icon,
    });
  }
  if (beat.busiestTable) {
    const number = lookups.tables.get(beat.busiestTable.tableId)?.number;
    rows.push({
      label: t.finale.busiestTable,
      value: number !== undefined ? fmt(t.common.tableN, { n: pad2(number) }) : "",
      detail: `${beat.busiestTable.count} ${plural(lang, beat.busiestTable.count, t.plurals.games)}`,
    });
  }
  if (beat.rivals) {
    rows.push({
      label: t.finale.rivals,
      value: `${name(beat.rivals.playerIds[0])} · ${name(beat.rivals.playerIds[1])}`,
      detail: `${beat.rivals.count} ${plural(lang, beat.rivals.count, t.plurals.games)}`,
    });
  }
  return (
    <div className="flex h-full flex-col justify-center px-[140px]">
      <Label>{t.finale.numbers}</Label>
      <ul className="mt-14 divide-y divide-line border-y border-line">
        {rows.map((row, i) => (
          <motion.li
            key={row.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 + i * 1.2 }}
            className="grid grid-cols-[520px_1fr_auto] items-center gap-10 py-9"
          >
            <span className="font-display text-[34px] uppercase tracking-[0.2em] text-muted">{row.label}</span>
            <MaskReveal delay={0.8 + i * 1.2}>
              <span className="flex items-center gap-6 font-display text-[84px] uppercase leading-none tracking-tight">
                {row.icon ? <GameIcon name={row.icon} className="size-[64px] text-accent" /> : null}
                {row.value}
              </span>
            </MaskReveal>
            <span className="font-mono text-[40px] text-muted">{row.detail}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function BeatSealed({ beat, lookups }: { beat: Beat<"sealed">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  const def = t.achievements.defs[beat.unlock.achievementId];
  return (
    <div className="flex h-full items-center px-[160px]">
      <div className="relative grid size-[380px] shrink-0 place-items-center rounded-md border border-accent/60">
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute inset-0 grid place-items-center"
        >
          <Lock className="size-[160px] text-muted" strokeWidth={1.25} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 1.5 }}
        >
          <AchievementIcon id={beat.unlock.achievementId} className="size-[200px] text-accent" />
        </motion.div>
      </div>
      <div className="ml-[100px] min-w-0">
        <Label>
          {t.finale.sealedAchievement} · {beat.order}/{beat.total}
        </Label>
        <MaskReveal delay={1.6} className="mt-4">
          <div className="font-display text-[150px] uppercase leading-[0.9] tracking-tight">{def.title}</div>
        </MaskReveal>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 2.2 }}
          className="mt-6 text-[40px] text-muted"
        >
          {def.description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 3.2 }}
          className="mt-12 border-t border-line pt-8 font-display text-[100px] uppercase leading-none tracking-tight"
        >
          {lookups.players.get(beat.unlock.playerId)?.name}
        </motion.div>
      </div>
    </div>
  );
}

export function BeatPlace({ beat, lookups }: { beat: Beat<"place">; lookups: FinaleLookups }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Label>{fmt(t.finale.place, { place: ordinal(lang, beat.place) })}</Label>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: EASE, delay: 2.2 }}
        className="mt-10 font-display text-[240px] uppercase leading-[0.85] tracking-tight"
      >
        {lookups.players.get(beat.playerId)?.name}
      </motion.div>
    </div>
  );
}

export function BeatChampion({ beat, lookups }: { beat: Beat<"champion">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 3.4 }}>
        <GoldDust count={40} />
      </motion.div>
      <Label delay={0.4}>{beat.co ? t.finale.coChampions : t.finale.champion}</Label>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 2.4, ease: "linear", delay: 0.8 }}
        className="mt-10 h-px w-[900px] origin-left bg-accent/70"
      />
      <div className="relative mt-12 overflow-hidden">
        {beat.playerIds.map((id, i) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.6, ease: EASE, delay: 3.4 + i * 0.6 }}
            className={cn(
              "font-display uppercase leading-[0.85] tracking-tight",
              beat.playerIds.length > 1 ? "text-[200px]" : "text-[280px]",
            )}
          >
            {lookups.players.get(id)?.name}
          </motion.div>
        ))}
        <span
          aria-hidden
          className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-40 bg-accent/25 blur-2xl"
          style={{ animationDelay: "4.2s" }}
        />
      </div>
    </div>
  );
}

export function BeatPodium({ beat, lookups }: { beat: Beat<"podium">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  const champions = new Set(beat.championIds);
  return (
    <div className="relative flex h-full flex-col px-[140px] pt-[100px] pb-[90px]">
      <GoldDust count={24} />
      <Label>{t.finale.finalStandings}</Label>
      <ol className="relative mt-12 grid flex-1 grid-flow-col grid-cols-2 grid-rows-5 gap-x-20">
        {beat.rows.map((row, i) => (
          <motion.li
            key={row.playerId}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.3 + i * 0.12 }}
            className="grid grid-cols-[110px_1fr_auto] items-center gap-6 border-b border-line"
          >
            <span className={cn("font-display text-[64px] leading-none tabular", row.rank <= 3 ? "text-accent" : "text-text/70")}>
              {row.rank}
            </span>
            <span
              className={cn(
                "truncate font-display uppercase leading-none tracking-wide",
                champions.has(row.playerId) ? "text-[64px]" : "text-[52px]",
              )}
            >
              {lookups.players.get(row.playerId)?.name}
            </span>
            <span className="font-mono text-[44px] text-muted">
              {formatPoints(row.counted)} {t.common.points}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function BeatClosing({
  beat,
  lookups,
  event,
}: {
  beat: Beat<"closing">;
  lookups: FinaleLookups;
  event: { city: string; year: number };
}) {
  const { t } = useI18n();
  const names = beat.championIds.map((id) => lookups.players.get(id)?.name).filter(Boolean).join(" · ");
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <GoldDust count={20} />
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.9em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ duration: 1.6, ease: EASE }}
        className="font-display text-[56px] uppercase text-muted"
      >
        {t.common.appName}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="mt-10 font-display text-[44px] uppercase tracking-[0.34em] text-accent"
      >
        {t.finale.champion}
      </motion.div>
      <MaskReveal delay={1.2} duration={1.4} className="mt-6">
        <div className="font-display text-[220px] uppercase leading-[0.85] tracking-tight">{names}</div>
      </MaskReveal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.4 }}
        className="mt-14 flex items-center gap-10 font-display text-[40px] uppercase tracking-[0.3em] text-muted"
      >
        <span>{event.city}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span>{event.year}</span>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/screen/finale/FinaleStage.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { EASE } from "@/components/motion/FadeRise";
import type { FinaleBeat } from "@/domain/finale";
import { BeatChampion, BeatClosing, BeatComplete, BeatNumbers, BeatPlace, BeatPodium, BeatSealed } from "./beats";
import type { FinaleLookups } from "./lookups";

export function FinaleStage({
  current,
  step,
  lookups,
  event,
}: {
  current: FinaleBeat | null;
  step: number;
  lookups: FinaleLookups;
  event: { city: string; year: number };
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, filter: "blur(8px)" }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {current?.kind === "complete" ? <BeatComplete beat={current} /> : null}
        {current?.kind === "numbers" ? <BeatNumbers beat={current} lookups={lookups} /> : null}
        {current?.kind === "sealed" ? <BeatSealed beat={current} lookups={lookups} /> : null}
        {current?.kind === "place" ? <BeatPlace beat={current} lookups={lookups} /> : null}
        {current?.kind === "champion" ? <BeatChampion beat={current} lookups={lookups} /> : null}
        {current?.kind === "podium" ? <BeatPodium beat={current} lookups={lookups} /> : null}
        {current?.kind === "closing" ? <BeatClosing beat={current} lookups={lookups} event={event} /> : null}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 7: Create `src/components/screen/finale/RehearsalApp.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRehearsal } from "@/domain/finale";
import type { Lang } from "@/domain/types";
import { LangProvider, useI18n } from "@/i18n/LangProvider";
import { Stage } from "../Stage";
import { useScreenChrome } from "../useScreenChrome";
import { FinaleStage } from "./FinaleStage";
import { lookupsFromRehearsal } from "./lookups";

const AUTO_MS = 10_000;

/** Plays the finale with placeholder data. Never reads or writes real state. */
export function RehearsalApp({ lang }: { lang: Lang }) {
  return (
    <LangProvider lang={lang}>
      <Rehearsal />
    </LangProvider>
  );
}

function Rehearsal() {
  const { t } = useI18n();
  const { controlsVisible } = useScreenChrome();
  const data = useMemo(() => buildRehearsal(), []);
  const lookups = useMemo(() => lookupsFromRehearsal(data), [data]);
  const [step, setStep] = useState(1);
  const total = data.beats.length;

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s >= total ? 1 : s + 1)), AUTO_MS);
    return () => clearTimeout(id);
  }, [step, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setStep((s) => Math.min(total, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <Stage>
      <FinaleStage current={data.beats[step - 1]} step={step} lookups={lookups} event={{ city: data.city, year: data.year }} />
      <div
        className={`absolute top-10 left-10 z-30 flex items-center gap-4 font-display text-[22px] uppercase tracking-[0.2em] transition-opacity duration-500 ${controlsVisible ? "opacity-100" : "opacity-40"}`}
      >
        <span className="rounded-md border border-accent/60 px-4 py-2 text-accent">{t.finale.rehearsal}</span>
        <span className="font-mono text-muted">
          {step}/{total}
        </span>
        {controlsVisible ? <span className="text-muted">{t.finale.rehearsalHint}</span> : null}
      </div>
    </Stage>
  );
}
```

The accent color falls back to the CSS default (`#c9a45c`) because no `LiveProvider` sets `--accent` here.

- [ ] **Step 8: Finale takeover in `src/components/screen/ScreenApp.tsx`**

Add imports:

```tsx
import { FinaleStage } from "./finale/FinaleStage";
import { lookupsFromSnapshot } from "./finale/lookups";
```

In `ScreenInner`, after `const Scene = SCENES[scene];` add:

```tsx
  const finale = snapshot.finale;
```

and replace the `return (...)` with:

```tsx
  return (
    <Stage>
      {finale ? (
        <FinaleStage
          current={finale.current}
          step={finale.step}
          lookups={lookupsFromSnapshot(snapshot)}
          event={{ city: snapshot.event.city, year: snapshot.event.year }}
        />
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${scene}-${cycle}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Scene snapshot={snapshot} />
            </motion.div>
          </AnimatePresence>

          <ScreenFooter snapshot={snapshot} scenes={scenes} scene={scene} cycle={cycle} paused={paused} />
          <AnnouncementPlayer snapshot={snapshot} onActiveChange={onActiveChange} />
        </>
      )}

      <button
        type="button"
        onClick={() => void document.documentElement.requestFullscreen?.()}
        className={cn(
          "absolute top-10 right-10 z-30 flex items-center gap-3 rounded-md border border-line-strong px-5 py-3 font-display text-[22px] uppercase tracking-[0.2em] text-muted transition-opacity duration-500",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Maximize className="size-6" />
        {t.screen.fullscreen}
      </button>
    </Stage>
  );
```

When the finale ends (`exit`), `AnnouncementPlayer` mounts again and reads the seen id from `localStorage`, so it does not replay old announcements.

- [ ] **Step 9: Rehearsal route in `src/app/screen/page.tsx`**

```tsx
import { LiveProvider } from "@/components/live/LiveProvider";
import { RehearsalApp } from "@/components/screen/finale/RehearsalApp";
import { ScreenApp } from "@/components/screen/ScreenApp";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

/** Always the public audience, even in a browser that holds the admin cookie. `?rehearsal=1` reads no data. */
export default async function ScreenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.rehearsal === "1") return <RehearsalApp lang={params.lang === "ru" ? "ru" : "en"} />;
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <ScreenApp />
    </LiveProvider>
  );
}
```

- [ ] **Step 10: Verify in the browser**

Run: `npm test && npm run typecheck && npm run lint`, then `npm run dev`.
1. Open `http://localhost:3000/screen?rehearsal=1` at 1920×1080: the REHEARSAL tag, beats advance every 10 s; Space/Right/Left step; all seven beat kinds render with placeholder names; the champion beat builds for about 3 s before the name with gold particles. Check the Network tab: no `/api/live` requests.
2. `?rehearsal=1&lang=ru` shows Russian labels.
3. The real finale on `/screen` is verified with the admin remote in Task 11, Step 7.

- [ ] **Step 11: Commit**

```bash
git add src/components/screen src/app/screen/page.tsx
git commit -m "feat(screen): add the finale ceremony with sealed reveals, podium and rehearsal mode"
```

---
### Task 11: Admin — finale remote, achievement settings, unlock feed

**Files:**
- Create: `src/components/admin/finaleLabels.ts`, `src/components/admin/FinaleRemote.tsx`, `src/components/admin/AchievementsAdmin.tsx`, `src/components/admin/UnlockFeed.tsx`, `src/app/admin/(panel)/finale/page.tsx`, `src/app/admin/(panel)/achievements/page.tsx`
- Modify: `src/components/admin/AdminNav.tsx`, `src/components/admin/ControlRoom.tsx`, `src/components/admin/SettingsView.tsx`, `src/components/admin/PlayersView.tsx`
- Test: `src/components/admin/finaleLabels.test.ts`

**Interfaces:**
- Consumes: `AdminSnapshot.finale` / `.achievements` (Task 4); `finaleCommandAction`, `setFinaleRevealedAction`, `setAchievementEnabledAction` (Task 6); dictionary (Task 7); `AchievementIcon` (Task 9); `useRunner`, `Button`, `Switch`, `useAdminLive`, `useAdminLookups`.
- Produces: `beatLabel(t: Dict, lang: Lang, beat: FinaleBeat, playerName: (id: number) => string): string`; routes `/admin/finale`, `/admin/achievements`; `<UnlockFeed limit?>`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/finaleLabels.test.ts`:

```ts
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
    "Sealed: Giant Slayer · #6",
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/finaleLabels.test.ts`
Expected: FAIL — `Cannot find module './finaleLabels'`.

- [ ] **Step 3: Create `src/components/admin/finaleLabels.ts`**

```ts
import type { FinaleBeat } from "@/domain/finale";
import type { Lang } from "@/domain/types";
import { fmt, ordinal, type Dict } from "@/i18n";

/** Host-facing description of a beat; the organizer's phone may show names before the projector does. */
export function beatLabel(t: Dict, lang: Lang, beat: FinaleBeat, playerName: (id: number) => string): string {
  const b = t.finaleRemote.beat;
  switch (beat.kind) {
    case "complete":
      return b.complete;
    case "numbers":
      return b.numbers;
    case "sealed":
      return `${fmt(b.sealed, { title: t.achievements.defs[beat.unlock.achievementId].title })} · ${playerName(beat.unlock.playerId)}`;
    case "place":
      return `${fmt(b.place, { place: ordinal(lang, beat.place) })} · ${playerName(beat.playerId)}`;
    case "champion":
      return [beat.co ? b.coChampions : b.champion, ...beat.playerIds.map(playerName)].join(" · ");
    case "podium":
      return b.podium;
    case "closing":
      return b.closing;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/finaleLabels.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the admin components and pages**

`src/components/admin/FinaleRemote.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight, MonitorPlay, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { finaleCommandAction, setFinaleRevealedAction } from "@/app/admin/actions";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { beatLabel } from "./finaleLabels";
import { useRunner } from "./useRunner";

const AUTO_MS = 10_000;

export function FinaleRemote() {
  const { t, lang } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const [auto, setAuto] = useState(false);
  const finale = snapshot.finale;
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const atEnd = finale !== null && finale.step >= finale.total;

  useEffect(() => {
    if (!auto || atEnd) return;
    const id = setInterval(() => runRef.current(() => finaleCommandAction("next")), AUTO_MS);
    return () => clearInterval(id);
  }, [auto, atEnd]);

  if (!finale) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.finaleRemote.title}</h1>
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">{t.finaleRemote.notFinished}</p>
        <Link href="/admin/settings" className="inline-flex h-11 items-center rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]">
          {t.finaleRemote.openSettings}
        </Link>
      </div>
    );
  }

  const name = (id: number) => lookups.players.get(id)?.name ?? "";
  const label = (i: number) => beatLabel(t, lang, finale.beats[i], name);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.finaleRemote.title}</h1>
        <span className="font-mono text-sm text-muted">
          {finale.step === 0 ? t.finaleRemote.notStarted : fmt(t.finaleRemote.stepOf, { step: finale.step, total: finale.total })}
        </span>
      </header>

      <section className="space-y-2 rounded-md border border-line bg-surface p-4">
        <p className="label-caps">{t.finaleRemote.current}</p>
        <p className="font-display text-xl uppercase tracking-wide">{finale.step > 0 ? label(finale.step - 1) : "—"}</p>
        {finale.step < finale.total ? (
          <p className="text-sm text-muted">
            {t.finaleRemote.upNext}: {label(finale.step)}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button size="lg" disabled={pending || finale.step === 0} onClick={() => run(() => finaleCommandAction("back"))}>
          <ChevronLeft className="size-5" />
          {t.finaleRemote.back}
        </Button>
        <Button size="lg" variant="primary" disabled={pending || atEnd} onClick={() => run(() => finaleCommandAction("next"))}>
          {t.finaleRemote.next}
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="space-y-1 border-y border-line py-2">
        <Switch checked={auto} onCheckedChange={setAuto} label={t.finaleRemote.auto} />
        <Switch
          checked={snapshot.event.finaleRevealed}
          disabled={pending}
          onCheckedChange={(on) => run(() => setFinaleRevealedAction(on))}
          label={
            <span>
              {t.finaleRemote.revealed}
              <span className="block text-xs text-muted">{t.finaleRemote.revealedHint}</span>
            </span>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || finale.step === 0} onClick={() => run(() => finaleCommandAction("exit"))}>
          <Square className="size-4" />
          {t.finaleRemote.exit}
        </Button>
        <a
          href={`/screen?rehearsal=1&lang=${snapshot.event.screenLang}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md px-4 font-display text-sm uppercase tracking-[0.08em] text-muted hover:text-text"
        >
          <MonitorPlay className="size-4" strokeWidth={1.5} />
          {t.finaleRemote.rehearsal}
        </a>
      </div>
      <p className="text-xs text-muted">{t.finaleRemote.rehearsalHint}</p>

      <ol className="divide-y divide-line border-y border-line">
        {finale.beats.map((_, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-3 py-2.5 text-sm",
              i + 1 === finale.step ? "text-accent" : i + 1 < finale.step ? "text-muted" : "text-text",
            )}
          >
            <span className="w-6 font-mono text-xs">{i + 1}</span>
            <span className={cn(i + 1 === finale.revealStep && "font-display uppercase tracking-wide")}>{label(i)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

The ref keeps the auto-advance interval from restarting on every render; it is updated in an effect because writing refs during render fails the repo's `react-hooks` lint rules.

`src/components/admin/UnlockFeed.tsx`:

```tsx
"use client";

import { Lock } from "lucide-react";
import { achievementDef } from "@/domain/achievements";
import { useI18n } from "@/i18n/LangProvider";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";

export function UnlockFeed({ limit = 5 }: { limit?: number }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const unlocks = snapshot.achievements.unlocks.slice(0, limit);

  return (
    <section className="space-y-2">
      <h2 className="label-caps">{t.room.latestUnlocks}</h2>
      {unlocks.length === 0 ? <p className="text-sm text-muted">{t.room.noUnlocks}</p> : null}
      <ul className="divide-y divide-line border-y border-line">
        {unlocks.map((u) => (
          <li key={`${u.achievementId}:${u.playerId}`} className="flex items-center gap-3 py-2 text-sm">
            <AchievementIcon id={u.achievementId} className="size-4 shrink-0 text-accent" />
            <span className="truncate font-display uppercase tracking-wide">{t.achievements.defs[u.achievementId].title}</span>
            {achievementDef(u.achievementId).sealed ? <Lock className="size-3.5 shrink-0 text-muted" aria-label={t.adminAchievements.sealed} /> : null}
            <span className="truncate text-muted">{lookups.players.get(u.playerId)?.name}</span>
            <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
              {formatClock(u.at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`src/components/admin/AchievementsAdmin.tsx`:

```tsx
"use client";

import { setAchievementEnabledAction } from "@/app/admin/actions";
import { ACHIEVEMENTS } from "@/domain/achievements";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { AchievementIcon } from "../common/AchievementIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Switch } from "../ui/Switch";
import { UnlockFeed } from "./UnlockFeed";
import { useRunner } from "./useRunner";

export function AchievementsAdmin() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const enabled = new Set(snapshot.achievements.enabled);
  const counts = new Map<string, number>();
  for (const u of snapshot.achievements.unlocks) counts.set(u.achievementId, (counts.get(u.achievementId) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.adminAchievements.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.adminAchievements.hint}</p>
      </header>

      <ul className="divide-y divide-line border-y border-line">
        {ACHIEVEMENTS.map((def) => {
          const on = enabled.has(def.id);
          const text = t.achievements.defs[def.id];
          return (
            <li key={def.id} className={cn("flex items-center gap-3 py-2", !on && "opacity-50")}>
              <AchievementIcon id={def.id} className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display uppercase tracking-wide">{text.title}</span>
                  {def.sealed ? (
                    <span className="rounded-sm border border-line-strong px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                      {t.adminAchievements.sealed}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted">
                  {text.description} · {fmt(t.adminAchievements.unlockCount, { n: counts.get(def.id) ?? 0 })}
                </p>
              </div>
              <Switch
                checked={on}
                disabled={pending}
                onCheckedChange={(next) => run(() => setAchievementEnabledAction({ achievementId: def.id, enabled: next }))}
              />
            </li>
          );
        })}
      </ul>

      <UnlockFeed limit={500} />
    </div>
  );
}
```

`src/app/admin/(panel)/finale/page.tsx`:

```tsx
import { FinaleRemote } from "@/components/admin/FinaleRemote";

export default function AdminFinalePage() {
  return <FinaleRemote />;
}
```

`src/app/admin/(panel)/achievements/page.tsx`:

```tsx
import { AchievementsAdmin } from "@/components/admin/AchievementsAdmin";

export default function AdminAchievementsPage() {
  return <AchievementsAdmin />;
}
```

- [ ] **Step 6: Wire navigation, control room, settings and players**

`src/components/admin/AdminNav.tsx`: add `Award` and `Crown` to the lucide import and insert into `secondary` right after the Tables item:

```tsx
    { href: "/admin/achievements", label: t.nav.achievements, icon: Award },
    { href: "/admin/finale", label: t.nav.finale, icon: Crown },
```

`src/components/admin/ControlRoom.tsx`: `import { UnlockFeed } from "./UnlockFeed";` and render `<UnlockFeed />` directly after `<ScreenRemote />`.

`src/components/admin/SettingsView.tsx`, in `Lifecycle()` inside the `status === "finished"` fragment, before the `<p>` with `reopenHint`, add (and `import Link from "next/link";`):

```tsx
          <Link
            href="/admin/finale"
            className="flex h-14 w-full items-center justify-center rounded-md bg-accent font-display uppercase tracking-[0.08em] text-bg"
          >
            {t.settings.event.openFinale}
          </Link>
```

`src/components/admin/PlayersView.tsx`: `import Link from "next/link";` and replace `<span className="truncate">{p.name}</span>` with:

```tsx
                <Link href={`/players/${p.id}`} target="_blank" className="truncate hover:text-accent">
                  {p.name}
                </Link>
```

- [ ] **Step 7: Verify the whole finale flow in the browser**

Run: `npm test && npm run typecheck && npm run lint`, then `npm run dev` with demo data present (clear open demo tables first: cancel them in the control room).
1. `/admin/achievements` lists 22 rows with counts; switching one off removes its unlocks from the feed and from `/screen`'s achievements scene within 2 s; switch it back on.
2. Settings → Finish event → "Open finale remote". `/admin/finale` shows "Not started", the beat list with names, and the podium beat in display font.
3. With `/screen` open, press Next repeatedly: complete → numbers → sealed achievements one by one → 3rd → 2nd → champion → podium → closing. Before the podium beat, `/leaderboard` on a phone-size window (390×844) still shows the sealed state; at the podium beat it shows standings and the "Standings public" switch turns on.
4. Back steps without hiding standings; "Back to scenes" returns `/screen` to rotation; turn Auto on and confirm it advances every 10 s and stops at the last beat.
5. Settings → Reopen event resets the finale (remote shows the not-finished notice).

- [ ] **Step 8: Commit**

```bash
git add src/components/admin src/app/admin
git commit -m "feat(admin): add finale remote, achievement switches and live unlock feed"
```

---
### Task 12: Public — achievements page, player profiles, home additions

**Files:**
- Create: `src/components/public/rankChart.ts`, `src/components/public/RankChart.tsx`, `src/components/public/ProfileView.tsx`, `src/components/public/AchievementsView.tsx`, `src/components/public/FindMe.tsx`, `src/app/(public)/players/[id]/page.tsx`, `src/app/(public)/achievements/page.tsx`
- Modify: `src/components/public/HomeView.tsx`
- Test: `src/components/public/rankChart.test.ts`

**Interfaces:**
- Consumes: `getProfile` (Task 6), `PlayerProfile` (Task 5), `PublicSnapshot.achievements` / `counters.achievementsUnlocked` (Task 4), `rarityOf`, `achievementDef` (Task 1), `normalizeName` (Tier 1 `domain/players.ts`), `AchievementIcon` (Task 9), `isAdmin` (Tier 1), dictionary (Task 7).
- Produces: `rankChart(history: { rank: number | null }[], width: number, height: number, pad?: number): { path: string; points: { x: number; y: number; rank: number }[]; maxRank: number }`; routes `/players/[id]` and `/achievements`.

Privacy: the profile page picks the audience from the admin cookie (`isAdmin()`), and `buildProfile` enforces what the public may see. `/achievements` uses the public snapshot only.

- [ ] **Step 1: Write the failing test**

Create `src/components/public/rankChart.test.ts`:

```ts
import { expect, test } from "vitest";
import { rankChart } from "./rankChart";

test("rank 1 is at the top, gaps break the line", () => {
  const chart = rankChart([{ rank: 3 }, { rank: 1 }, { rank: null }, { rank: 2 }], 100, 50, 0);
  expect(chart.maxRank).toBe(3);
  expect(chart.path).toBe("M0,50 L33.3,0 M100,25");
  expect(chart.points.map((p) => p.rank)).toEqual([3, 1, 2]);
});

test("a single point is centered at the top", () => {
  expect(rankChart([{ rank: 1 }], 100, 50, 0).path).toBe("M50,0");
  expect(rankChart([], 100, 50).path).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/public/rankChart.test.ts`
Expected: FAIL — `Cannot find module './rankChart'`.

- [ ] **Step 3: Create `src/components/public/rankChart.ts`**

```ts
const r1 = (n: number) => Math.round(n * 10) / 10;

export function rankChart(
  history: { rank: number | null }[],
  width: number,
  height: number,
  pad = 12,
): { path: string; points: { x: number; y: number; rank: number }[]; maxRank: number } {
  const ranks = history.flatMap((h) => (h.rank === null ? [] : [h.rank]));
  const maxRank = Math.max(1, ...ranks);
  const n = history.length;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points: { x: number; y: number; rank: number }[] = [];
  const parts: string[] = [];
  let penDown = false;

  history.forEach((h, i) => {
    if (h.rank === null) {
      penDown = false;
      return;
    }
    const x = r1(pad + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1)));
    const y = r1(pad + (maxRank === 1 ? 0 : ((h.rank - 1) * innerH) / (maxRank - 1)));
    parts.push(`${penDown ? "L" : "M"}${x},${y}`);
    points.push({ x, y, rank: h.rank });
    penDown = true;
  });

  return { path: parts.join(" "), points, maxRank };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/public/rankChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/components/public/RankChart.tsx`**

```tsx
import { rankChart } from "./rankChart";

const W = 640;
const H = 200;

export function RankChart({ history }: { history: { rank: number | null }[] }) {
  const chart = rankChart(history, W, H, 16);
  const last = chart.points[chart.points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      <line x1={16} x2={W - 16} y1={16} y2={16} stroke="var(--color-line-strong)" strokeWidth={1} />
      <line x1={16} x2={W - 16} y1={H - 16} y2={H - 16} stroke="var(--color-line)" strokeWidth={1} />
      <path d={chart.path} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {chart.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p === last ? 5 : 3} fill={p === last ? "var(--color-accent)" : "var(--color-bg)"} stroke="var(--color-accent)" strokeWidth={1.5} />
      ))}
      <text x={W - 16} y={12} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        1
      </text>
      <text x={W - 16} y={H - 2} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        {chart.maxRank}
      </text>
    </svg>
  );
}
```

- [ ] **Step 6: Create `src/components/public/ProfileView.tsx`**

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { PlayerProfile } from "@/domain/profile";
import { formatPoints } from "@/domain/scoring";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { Avatar } from "../common/Avatar";
import { GameIcon } from "../common/GameIcon";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { RankChart } from "./RankChart";

/** Server-rendered profile; re-fetched whenever the live data version changes. */
function useRefreshOnVersion(version: number) {
  const router = useRouter();
  const first = useRef(version);
  useEffect(() => {
    if (version !== first.current) router.refresh();
  }, [version, router]);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="font-display text-3xl tabular">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

export function ProfileView({ profile }: { profile: PlayerProfile }) {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  useRefreshOnVersion(snapshot.version);
  const s = profile.standing;
  const gameName = (id: number | null) => (id === null ? "--" : (lookups.games.get(id)?.name ?? "--"));
  const unlocked = profile.achievements.filter((a) => a.unlockedAt !== null);
  const locked = profile.achievements.filter((a) => a.unlockedAt === null);

  return (
    <div className="space-y-10 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.profile.back}
      </Link>

      <FadeRise className="flex items-center gap-4">
        <Avatar name={profile.player.name} color={profile.player.color} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-4xl uppercase tracking-tight">{profile.player.name}</h1>
          {profile.player.nickname ? <p className="text-muted">{profile.player.nickname}</p> : null}
        </div>
        {s?.rank ? <span className="ml-auto font-display text-6xl leading-none text-accent tabular">{s.rank}</span> : null}
      </FadeRise>

      {s ? (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-x-4 border-y border-line sm:grid-cols-6">
            <Stat label={t.profile.points} value={formatPoints(s.counted)} />
            <Stat label={t.profile.raw} value={formatPoints(s.raw)} />
            <Stat label={t.profile.games} value={s.gamesPlayed} />
            <Stat label={t.profile.wins} value={s.wins} />
            <Stat label={t.profile.podiums} value={s.podiums} />
            <Stat label={t.profile.winRate} value={`${Math.round(s.winRate * 100)}%`} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="label-caps">{t.profile.strongest}</dt>
              <dd className="mt-1">{gameName(s.strongestGameId)}</dd>
            </div>
            <div>
              <dt className="label-caps">{t.profile.weakest}</dt>
              <dd className="mt-1">{gameName(s.weakestGameId)}</dd>
            </div>
          </dl>
          {s.rankHistory.length > 1 ? (
            <div>
              <h2 className="label-caps mb-2">{t.profile.rankHistory}</h2>
              <RankChart history={s.rankHistory} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">{t.profile.sealedNote}</p>
      )}

      <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
        <div>
          <dt className="label-caps">{t.profile.favoriteGame}</dt>
          <dd className="mt-1 font-display text-lg uppercase tracking-wide">{gameName(profile.favoriteGameId)}</dd>
        </div>
        <div>
          <dt className="label-caps">{t.profile.tablesPlayed}</dt>
          <dd className="mt-1 font-display text-lg tabular">{profile.tablesPlayed}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="label-caps text-text">{t.profile.achievements}</h2>
        <ul className="divide-y divide-line border-y border-line">
          {[...unlocked, ...locked].map((a) => {
            const text = t.achievements.defs[a.id];
            const done = a.unlockedAt !== null;
            return (
              <li key={a.id} className={cn("flex items-center gap-3 py-3", !done && "opacity-60")}>
                <AchievementIcon id={a.id} className={cn("size-5 shrink-0", done ? "text-accent" : "text-muted")} />
                <div className="min-w-0 flex-1">
                  <div className="font-display uppercase tracking-wide">{text.title}</div>
                  <div className="text-xs text-muted">{text.description}</div>
                  {!done && a.progress ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full bg-accent" style={{ width: `${(a.progress.current / a.progress.target) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[0.68rem] text-muted">
                        {a.progress.current}/{a.progress.target}
                      </span>
                    </div>
                  ) : null}
                </div>
                {done ? (
                  <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                    {formatClock(a.unlockedAt!)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="label-caps text-text">{t.profile.games}</h2>
        {profile.results.length === 0 ? <p className="text-muted">{t.profile.noGames}</p> : null}
        <ul className="divide-y divide-line border-y border-line">
          {profile.results.map((r) => {
            const game = lookups.games.get(r.gameId);
            const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
            return (
              <li key={r.sessionId} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                    <span className="truncate font-display uppercase tracking-wide">{game?.name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted" suppressHydrationWarning>
                    {table ? `${fmt(t.common.tableN, { n: table.number })} · ` : ""}
                    {formatClock(r.finishedAt)}
                    {r.counted === false ? ` · ${t.profile.notCounted}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("font-mono", r.placement === 1 ? "text-accent" : "text-text")}>
                    {ordinal(lang, r.placement)} <span className="text-xs text-muted">{fmt(t.profile.ofN, { n: r.playerCount })}</span>
                  </div>
                  {r.points !== undefined ? (
                    <div className={cn("font-mono text-xs", r.counted ? "text-text" : "text-muted line-through")}>
                      {formatPoints(r.points)} {t.common.points}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
```

`usePublicLookups(snapshot).tables` only knows active tables and tables with an open game; a result at a since-deactivated table shows without the table label, which is acceptable.

`src/app/(public)/players/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/public/ProfileView";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/live";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) notFound();
  const audience = (await isAdmin()) ? "admin" : "public";
  const profile = getProfile(getDb(), playerId, audience);
  if (!profile) notFound();
  return <ProfileView profile={profile} />;
}
```

- [ ] **Step 7: Create `src/components/public/AchievementsView.tsx` and its page**

```tsx
"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { achievementDef, rarityOf } from "@/domain/achievements";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { AchievementIcon } from "../common/AchievementIcon";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

export function AchievementsView() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { enabled, unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const revealed = snapshot.event.finaleRevealed;

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.achievements.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.achievements.title}</h1>
        <p className="mt-1 text-muted">{t.achievements.subtitle}</p>
        {!revealed && sealedUnlockCount > 0 ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm">
            <Lock className="size-4 text-accent" strokeWidth={1.5} />
            {t.achievements.sealedCount}: <span className="font-mono">{sealedUnlockCount}</span>
          </p>
        ) : null}
      </FadeRise>

      <ul className="divide-y divide-line border-y border-line">
        {enabled.map((id) => {
          const sealedHidden = achievementDef(id).sealed && !revealed;
          const holders = unlocks.filter((u) => u.achievementId === id).reverse();
          const rarity = rarityOf(holders.length, eligiblePlayers);
          const text = t.achievements.defs[id];
          return (
            <li key={id} className={cn("space-y-2 py-4", holders.length === 0 && !sealedHidden && "opacity-70")}>
              <div className="flex items-center gap-3">
                {sealedHidden ? (
                  <Lock className="size-5 shrink-0 text-muted" strokeWidth={1.5} />
                ) : (
                  <AchievementIcon id={id} className={cn("size-5 shrink-0", holders.length > 0 ? "text-accent" : "text-muted")} />
                )}
                <span className="font-display text-lg uppercase tracking-wide">{text.title}</span>
                {sealedHidden ? (
                  <span className="ml-auto label-caps">{t.achievements.sealed}</span>
                ) : rarity ? (
                  <span className="ml-auto label-caps text-accent">{t.achievements.rarity[rarity]}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted">{sealedHidden ? t.achievements.sealedBody : text.description}</p>
              {!sealedHidden ? (
                holders.length === 0 ? (
                  <p className="text-xs text-muted">{t.achievements.nobodyYet}</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {holders.map((u) => (
                      <li key={u.playerId}>
                        <Link href={`/players/${u.playerId}`} className="hover:text-accent">
                          {lookups.players.get(u.playerId)?.name}
                        </Link>{" "}
                        <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                          {formatClock(u.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

`src/app/(public)/achievements/page.tsx`:

```tsx
import { AchievementsView } from "@/components/public/AchievementsView";

export default function AchievementsPage() {
  return <AchievementsView />;
}
```

- [ ] **Step 8: Create `src/components/public/FindMe.tsx`**

```tsx
"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { normalizeName } from "@/domain/players";
import type { PlayerView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { Avatar } from "../common/Avatar";

export function FindMe({ players }: { players: PlayerView[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = normalizeName(query);
  const matches = q.length === 0 ? [] : players.filter((p) => normalizeName(p.name).includes(q)).slice(0, 6);

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 focus-within:border-line-strong">
        <Search className="size-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.home.findPlaceholder}
          aria-label={t.home.findMe}
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      {q.length > 0 && matches.length === 0 ? <p className="text-sm text-muted">{t.home.noMatches}</p> : null}
      <ul className="divide-y divide-line">
        {matches.map((p) => (
          <li key={p.id}>
            <Link href={`/players/${p.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
              <Avatar name={p.name} color={p.color} size="sm" />
              {p.name}
              {p.nickname ? <span className="text-sm text-muted">{p.nickname}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 9: Extend `src/components/public/HomeView.tsx`**

1. Imports: add `Award` and `UserRound` to the lucide import, and `import { AchievementIcon } from "../common/AchievementIcon";`, `import { FindMe } from "./FindMe";`.
2. Replace the `me ? (<span ...>checkedInAs</span>)` branch with a link to the profile:

```tsx
          {me ? (
            <Link
              href={`/players/${me.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm"
            >
              <UserRound className="size-4 text-up" />
              {t.home.myProfile}
              <span className="text-muted">· {me.name}</span>
            </Link>
          ) : snapshot.event.status !== "finished" ? (
```

(the rest of that ternary stays as is). After the Standings link add:

```tsx
          <Link
            href="/achievements"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            <Award className="size-4" />
            {t.home.achievements}
          </Link>
```

3. Replace the counters `<section>` with:

```tsx
      <section className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
        {[
          { label: t.home.gamesCompleted, value: snapshot.counters.gamesCompleted },
          { label: t.home.tablesActive, value: snapshot.counters.tablesActive },
          { label: t.home.players, value: snapshot.counters.players },
          { label: t.home.achievementsUnlocked, value: snapshot.counters.achievementsUnlocked },
        ].map((c) => (
          <div key={c.label} className="py-5 pr-3">
            <div className="font-display text-4xl tabular sm:text-5xl">{c.value}</div>
            <div className="mt-1 text-xs text-muted">{c.label}</div>
          </div>
        ))}
      </section>
```

4. In recent results, wrap the player name in a profile link:

```tsx
                      <Link
                        href={`/players/${p.playerId}`}
                        className={cn("hover:text-accent", p.placement === 1 ? "text-text" : "text-text/80")}
                      >
                        {lookups.players.get(p.playerId)?.name}
                      </Link>
```

(replacing the existing `<span className={p.placement === 1 ? ...}>` around the name).

5. After the recent results section append two sections:

```tsx
      <section className="space-y-4">
        <SectionTitle index="03">{t.home.latestUnlocks}</SectionTitle>
        {snapshot.achievements.unlocks.length === 0 ? <p className="text-muted">{t.achievements.none}</p> : null}
        <ul className="divide-y divide-line">
          {snapshot.achievements.unlocks.slice(0, 5).map((u) => (
            <li key={`${u.achievementId}:${u.playerId}`} className="flex items-center gap-3 py-3">
              <AchievementIcon id={u.achievementId} className="size-4 shrink-0 text-accent" />
              <span className="font-display uppercase tracking-wide">{t.achievements.defs[u.achievementId].title}</span>
              <Link href={`/players/${u.playerId}`} className="truncate text-sm text-muted hover:text-text">
                {lookups.players.get(u.playerId)?.name}
              </Link>
              <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
                {formatClock(u.at)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <SectionTitle index="04">{t.home.findMe}</SectionTitle>
        <FindMe players={snapshot.players} />
      </section>
```

`fmt` and `t.home.checkedInAs` may now be unused in `HomeView`; remove unused imports if `npm run lint` reports them (keep the dictionary key — other code may use it later, and the i18n parity test needs both languages to keep it).

- [ ] **Step 10: Verify at phone size and commit**

Run: `npm test && npm run typecheck && npm run lint`, then `npm run dev`. In a private window (no admin cookie) at 390×844, with demo data and the event not finished:
1. `/` shows four counters, "Latest unlocks", "Find me"; typing a demo name lists matches; tapping one opens `/players/<id>`.
2. The profile shows games with placements, favorite game, tables played, public achievements with progress bars, the sealed note — and no points, rank, win rate or sealed achievements. View source / the RSC payload in DevTools does not contain `"counted"` or `"rank"`.
3. `/achievements` lists enabled achievements, rarity labels, holders with times; sealed rows show the lock, "Revealed at the finale", and the page shows the sealed unlock count.
4. Check in on `/checkin`, return to `/`: "My profile" opens your profile.
5. In the admin browser, open the same `/players/<id>`: rank, points, win rate, strongest/weakest game and the rank chart appear.
6. Toggle EN/RU in the header; the new pages switch language.
7. After a finale reveal (Task 11 flow), the private window's profile shows the standing block too.

```bash
git add src/components/public src/app/\(public\)
git commit -m "feat(public): add player profiles, achievements page, find-me search and unlock feed"
```

---

### Task 13: README and end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Update `README.md`**

1. In the URL table add rows:

```markdown
| `/achievements` | Achievements, rarity and who unlocked them (sealed ones hidden until the finale) |
| `/players/<id>` | Player profile; standings part appears after the finale (or for the organizer) |
| `/screen?rehearsal=1` | Finale rehearsal with placeholder names (add `&lang=ru` for Russian) |
```

2. In "Database model" add:

```markdown
| `achievement_settings` | Achievements switched off by the organizer (missing row = enabled) |
```

and change the `announcements` row purpose to "Queue for the projector (result reveals, achievement unlocks, milestones)".

3. Replace the "**Tier 1 note:** ..." paragraph in "Anonymous mode" with:

```markdown
Achievements are recomputed from results like points, so a correction or undo also corrects them. Public achievements are announced on the projector a few seconds after a result (after its reveal, if you press "Show on screen"). Five achievements are sealed (Comeback, Underdog, Giant Slayer, Joker Master, Risk Taker): until the finale only their total count is public.
```

4. Add a section after "Projector mode":

```markdown
## Finale

1. Close all tables, then Settings → Finish event → Open finale remote (`/admin/finale`).
2. Each Next advances the projector: event complete, the evening in numbers, sealed achievements one by one, 3rd place, 2nd place, champion (co-champions when counted points, wins and raw points are equal), final standings, closing card.
3. The final standings step makes standings public on every phone and `/leaderboard`. The "Standings public" switch can undo or force that.
4. Auto-advance moves every 10 s. "Back to scenes" returns the projector to rotation.
5. Rehearse beforehand at `/screen?rehearsal=1` (Space or arrow keys); it never touches real data. Reopening the event resets the finale.
```

5. In "Where to change things" add:

```markdown
| Achievement on/off | Admin → Achievements; rules in `src/domain/achievements.ts` |
```

6. Replace the Roadmap Tier 2 bullet with nothing (delete it) so only Tier 3 remains.

- [ ] **Step 2: Full automated check**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass; `next build` completes without type or prerender errors.

- [ ] **Step 3: End-to-end run with Playwright (390×844 and 1920×1080)**

Start fresh: `npm run db:reset && npm run db:seed:demo && npm run dev`. Using the Playwright browser tools:

1. 1920×1080: open `/screen`. 390×844 (second context): log into `/admin` with the PIN.
2. Admin: cancel the two demo open tables; seat Catan on table 3 with three demo players, Start, Finish, Enter result, Confirm, tap "Show on screen" in the toast. Screen: reveal → winner with gold dust → podium → achievement cards for that game (for example "Catan Lord") → rotation. Take screenshots of the podium and an achievement card.
3. Public context (no cookie) 390×844: `/`, a profile, `/achievements`, `/leaderboard` — no points or ranks anywhere; `fetch('/api/live').then(r => r.json())` in the console contains no `counted`, `rank` or `jokerDeclared` keys, and `achievements.unlocks` has no sealed ids.
4. Admin: Settings → Finish event → finale remote → step through all beats while watching `/screen`. Confirm the public `/leaderboard` unlocks exactly at the final standings step.
5. `/screen?rehearsal=1&lang=ru` renders every beat in Russian.
6. Settings → Reopen event; `/screen` returns to rotation and `/leaderboard` is sealed again.

Record any defect as a new fix commit (use superpowers:systematic-debugging); do not mark this task complete with a known failure.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document achievements, profiles, finale remote and rehearsal"
```
