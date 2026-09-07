# Board Games Cup — Tier 1 (Core Event Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working local tournament app: organizer seats tables, enters/corrects results on a phone; standings are computed by a tested scoring engine; participants check in and follow the event on phones; the projector shows anonymous live scenes; everything persists in SQLite.

**Architecture:** Next.js 16 App Router app with four layers: `src/domain` (pure TS scoring/replay/snapshots, unit-tested), `src/server/repo` (only Drizzle access), `src/server/services` (validated synchronous mutations in transactions, audit, version bump), `src/app` (pages, server actions, `/api/live`). All derived state (points, standings, trends) is recomputed by replaying stored facts and cached per `dataVersion`. Clients poll `/api/live` every 2 s; the server decides audience (public/admin) and omits secret fields for public.

**Tech Stack:** Next.js 16.3, React 19, TypeScript strict, Tailwind CSS 4, motion 13, lucide-react 1.x, better-sqlite3 13 + drizzle-orm 0.45 + drizzle-kit 0.31, @dnd-kit, radix-ui (Dialog), sonner, Vitest 5, tsx.

**Spec:** `docs/superpowers/specs/2026-09-15-board-games-cup-design.md`

**Later plans:** Tier 2 (result celebration, achievements, finale, profiles) and Tier 3 (stats, timeline, QR, extras) are written after this plan ships, against the real code.

## Global Constraints

- No emoji anywhere in UI strings, code comments shown to users, or seed data. Icons come from `lucide-react` or custom SVG.
- Public audience never receives these fields before `event.finaleRevealed` is true: `points`, `base`, `rank`, `counted`, `raw`, `jokerDeclared`, `jokerUsed`, `gamesPlayed`, `wins`, `podiums`, `trend`, `excludedSessionIds`, `countedSessionIds`.
- `/screen` always uses the public audience, even in a browser holding the admin cookie.
- Scoring: `share = floor + (1 − floor) × (N − place)/(N − 1)`, `points = weight × share`, tie = mean over spanned positions, Joker = `× jokerMultiplier`. Defaults: `participationFloor 0.2`, `jokerMultiplier 1.5`, `scoringStrategy 'bestN'`, `bestN 4`.
- Ranking order: counted desc → wins desc → raw desc → gamesPlayed asc → name asc. Players with 0 results unranked (`rank: null`) and listed last.
- Trend = rank immediately before the player's most recent result − current rank (positive = moved up); `null` if they were unranked before it.
- Every mutation increments `event.dataVersion` inside the same transaction.
- When `event.status === 'finished'`, all writes except event settings, screen control, PIN change and reopen throw `ServiceError('event_finished')`.
- Timestamps are integer milliseconds UTC. IDs are integer autoincrement.
- Display points with one decimal (`formatPoints`).
- Radius max 6 px; 1 px hairline borders; no gradients except the subtle vignette on `/screen`; no card grids of big rounded boxes.
- Fonts via `next/font/google` with `subsets: ['latin', 'cyrillic']`: Oswald (display), Inter Tight (body), JetBrains Mono (numbers).
- Languages: `en` (default) and `ru`; `ru` dictionary typed as `Dict = typeof en`.
- Polling interval 2000 ms; announcement window 120 000 ms; admin cookie lifetime 12 h; undo toast 10 s.
- Node >= 22. The event machine is native Windows; no Linux-only shell commands in npm scripts.

## File Structure

```
drizzle.config.ts, vitest.config.ts, next.config.ts   tooling
drizzle/                        generated SQL migrations (committed)
scripts/                        env, setup, seed-demo, clear-demo, reset, backup, reset-pin (tsx); windows-firewall.ps1
src/proxy.ts                    cookie presence check for /admin/*
src/domain/                     pure TypeScript, unit-tested next to each module
  types.ts                      fact, settings and audit types
  scoring.ts                    placement share, result scoring, placement validation, formatPoints
  standings.ts                  best-N selection, deterministic ranking
  replay.ts                     chronological replay -> standings, history, trends
  tables.ts                     table state from sessions
  players.ts                    name normalization, similar names, colors, initials, bulk parsing
  snapshot.ts                   public/admin snapshot builders (privacy boundary)
  fixtures.ts                   test factories
src/server/
  db/schema.ts, db/client.ts    Drizzle schema; open + migrate + singleton
  repo/facts.ts, repo/writes.ts all SQL reads and writes
  services/errors.ts, mutate.ts ServiceError; transaction + version bump + throttled backup
  services/event.ts             lifecycle, settings, screen control, PIN, demo cleanup
  services/players.ts           add, bulk add, update, merge, check-in
  services/catalog.ts           games and tables
  services/sessions.ts          seating, results, corrections, jokers, undo, announcements
  seed/base.ts, seed/demo.ts    base data; demo data
  auth/pin.ts, token.ts, rateLimit.ts, admin.ts
  live.ts                       replay cache and snapshot getters
  runAction.ts                  server action wrappers returning ActionResult
  backup.ts, network.ts, testDb.ts
src/lib/                        cn, format, action (ActionResult, LiveResponse), notify
src/i18n/                       en, ru, index (fmt, plural, ordinal), server (getLang), LangProvider
src/components/
  brand/Wordmark.tsx
  ui/                           Button, Sheet, ConfirmButton, Switch, Stepper, Toaster
  motion/                       FadeRise (EASE), LivePulse
  live/                         LiveProvider (polling, usePublicLive, useAdminLive)
  common/                       Avatar, GameIcon, ElapsedClock, useNow, LangToggle, lookups, EventStatusBadge,
                                StateLabel, Leaderboard, leaderboardDiff
  admin/                        LoginView, AdminNav, useRunner, seating, GamePicker, PlayerPicker, ScreenRemote,
                                SeatSheet, ControlRoom, placement, PlacementList, ResultSheet, ResultsView,
                                LeaderboardView, PlayersView, PlayerEditSheet, GamesView, TablesView, SettingsView
  public/                       PublicHeader, HomeView, CheckinForm, PublicLeaderboard, useCheckedIn
  screen/                       logic, Stage, useRotation, useScreenChrome, ScreenApp, ScreenFooter,
                                AnnouncementPlayer, ResultReveal, MilestoneCard, scenes/*
src/app/
  layout.tsx, globals.css
  api/live/route.ts, lang/actions.ts
  (public)/layout.tsx, page.tsx, checkin/page.tsx, checkin/actions.ts, leaderboard/page.tsx
  admin/login/page.tsx, admin/login/actions.ts, admin/actions.ts, admin/export/route.ts
  admin/(panel)/layout.tsx, page.tsx, results/, leaderboard/, players/, games/, tables/, settings/
  screen/page.tsx
README.md
```

---

### Task 1: Project scaffold, tooling, design tokens

**Files:**
- Create: whole Next.js scaffold (via create-next-app), `vitest.config.ts`, `drizzle.config.ts`
- Modify: `package.json` (scripts), `next.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `.gitignore`
- Test: `src/domain/smoke.test.ts` (deleted at end of task)

**Interfaces:**
- Consumes: nothing
- Produces: `@/*` import alias to `src/*`; Tailwind tokens `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `border-line-strong`, `text-text`, `text-muted`, `text-accent`/`bg-accent`, `text-up`, `text-down`, `text-live`, `font-display`, `font-sans`, `font-mono`; utility classes `label-caps`, `tabular`; npm scripts `dev`, `build`, `start`, `test`, `typecheck`, `db:generate`.

- [ ] **Step 1: Scaffold Next.js into the existing repo**

The repo already has `.git`, `.gitignore` and `docs/`. create-next-app accepts `docs/` and `.git`, but remove the hand-written `.gitignore` first so the generator writes its own.

```bash
cd /home/dev/projects/board-cup
rm .gitignore
npx create-next-app@16.3.5 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Expected: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `next.config.ts`, `package.json` exist. If the CLI rejects an unknown flag, rerun without that flag and answer prompts: TypeScript yes, ESLint yes, Tailwind yes, `src/` yes, App Router yes, Turbopack yes, alias `@/*`.

- [ ] **Step 2: Install dependencies**

```bash
npm i better-sqlite3@13 drizzle-orm@0.45 motion@13 lucide-react@1 @dnd-kit/core@6 @dnd-kit/sortable@10 @dnd-kit/utilities radix-ui sonner clsx tailwind-merge
npm i -D drizzle-kit@0.31 vitest@5 tsx @types/better-sqlite3
```

- [ ] **Step 3: Append project ignores**

Append to `.gitignore`:

```
# board games cup
/data/
.env
```

- [ ] **Step 4: Configure Next, Vitest, drizzle-kit**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
  },
});
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./data/board-cup.db" },
});
```

In `package.json` set `"scripts"` to (keep `lint` if generated):

```json
{
  "dev": "next dev -H 0.0.0.0",
  "build": "next build",
  "start": "next start -H 0.0.0.0 -p 3000",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "db:generate": "drizzle-kit generate"
}
```

Also add `"engines": { "node": ">=22" }`.

- [ ] **Step 5: Design tokens**

Replace `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-bg: #0b0b0c;
  --color-surface: #131315;
  --color-surface-2: #1a1a1d;
  --color-line: rgb(255 255 255 / 0.08);
  --color-line-strong: rgb(255 255 255 / 0.16);
  --color-text: #ece9e2;
  --color-muted: #8b8b90;
  --color-up: #6fbf8e;
  --color-down: #d9735f;
  --color-live: #e5484d;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 6px;
  --ease-out-quint: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@theme inline {
  --color-accent: var(--accent, #c9a45c);
  --font-display: var(--font-oswald), "Arial Narrow", sans-serif;
  --font-sans: var(--font-inter-tight), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}

@layer base {
  html {
    background: var(--color-bg);
    color: var(--color-text);
    color-scheme: dark;
  }
  body {
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  ::selection {
    background: color-mix(in oklab, var(--color-accent) 35%, transparent);
  }
}

@utility tabular {
  font-variant-numeric: tabular-nums;
}

@utility label-caps {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  line-height: 1;
  color: var(--color-muted);
}

@media (prefers-reduced-motion: reduce) {
  .motion-safe-only {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 6: Root layout with fonts**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Oswald } from "next/font/google";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin", "cyrillic"], variable: "--font-oswald" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], variable: "--font-inter-tight" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Board Games Cup",
  description: "Live board game tournament",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${interTight.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-bg text-text">{children}</body>
    </html>
  );
}
```

Replace `src/app/page.tsx` (replaced again in Task 17):

```tsx
export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <h1 className="font-display text-5xl uppercase tracking-tight">Board Games Cup</h1>
    </main>
  );
}
```

Delete generated assets not used: `rm -f public/*.svg src/app/favicon.ico` is fine to keep; leave favicon.

- [ ] **Step 7: Verify toolchain**

Create `src/domain/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test` → Expected: 1 passed.
Run: `npm run typecheck` → Expected: no errors.
Run: `npm run build` → Expected: build succeeds (fonts download; needs internet).

Then `rm src/domain/smoke.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with tooling and design tokens"
```

### Task 2: Domain types and scoring engine

**Files:**
- Create: `src/domain/types.ts`, `src/domain/scoring.ts`
- Test: `src/domain/scoring.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - all fact types in `types.ts` (exact code below)
  - `placementShare(n: number, place: number, floor: number): number`
  - `basePoints(weight: number, n: number, place: number, floor: number): number`
  - `type PlacementInput = { playerId: number; placement: number; jokerDeclared: boolean }`
  - `type ScoredPlacement = PlacementInput & { base: number; points: number; jokerBonus: number }`
  - `scoreResult(weight: number, placements: PlacementInput[], params: ScoringParams): ScoredPlacement[]`
  - `type PlacementError = "too_few_players" | "invalid_placements" | "ties_not_allowed"`
  - `validatePlacements(placements: number[], allowTies: boolean): PlacementError | null`
  - `formatPoints(value: number): string`

- [ ] **Step 1: Write the domain types**

`src/domain/types.ts`:

```ts
export type EventStatus = "draft" | "live" | "finished";
export type ScoringStrategy = "total" | "bestN";
export type SessionStatus = "setup" | "playing" | "pending" | "done" | "cancelled";
export type SceneId = "title" | "room" | "recent" | "counters" | "contenders";
export type Lang = "en" | "ru";
export type PlayerSource = "admin" | "checkin";

export const ALL_SCENES: SceneId[] = ["title", "room", "recent", "counters", "contenders"];
export const DEFAULT_SCENES: SceneId[] = ["title", "room", "recent", "counters"];
export const MILESTONES = [10, 25, 50, 75, 100] as const;

export interface ScoringSettings {
  strategy: ScoringStrategy;
  bestN: number;
  participationFloor: number;
  jokerMultiplier: number;
}

export interface ScreenControl {
  paused: boolean;
  skipNonce: number;
  finaleStep: number;
}

export interface EventFact {
  name: string;
  city: string;
  year: number;
  status: EventStatus;
  startedAt: number | null;
  finishedAt: number | null;
  finaleRevealed: boolean;
  scoring: ScoringSettings;
  sceneDurationSec: number;
  enabledScenes: SceneId[];
  showPointsInReveals: boolean;
  screenLang: Lang;
  accentColor: string;
  publicBaseUrl: string | null;
  screenControl: ScreenControl;
  dataVersion: number;
}

export interface PlayerFact {
  id: number;
  name: string;
  nickname: string | null;
  color: string;
  source: PlayerSource;
  active: boolean;
  isDemo: boolean;
  createdAt: number;
}

export interface GameFact {
  id: number;
  slug: string;
  name: string;
  family: string;
  descriptionEn: string;
  descriptionRu: string;
  icon: string;
  category: string;
  durationMin: number;
  weight: number;
  minPlayers: number;
  maxPlayers: number;
  allowTies: boolean;
  active: boolean;
}

export interface TableFact {
  id: number;
  number: number;
  label: string | null;
  active: boolean;
}

export interface SessionPlayerFact {
  playerId: number;
  seat: number;
  jokerDeclared: boolean;
  placement: number | null;
}

export interface SessionFact {
  id: number;
  tableId: number | null;
  gameId: number;
  status: SessionStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  notes: string | null;
  isDemo: boolean;
  players: SessionPlayerFact[];
}

export type AnnouncementFact =
  | { id: number; type: "result_reveal"; payload: { sessionId: number }; createdAt: number }
  | { id: number; type: "milestone"; payload: { count: number }; createdAt: number };

export interface Facts {
  event: EventFact;
  players: PlayerFact[];
  games: GameFact[];
  tables: TableFact[];
  sessions: SessionFact[];
  announcements: AnnouncementFact[];
}
```

- [ ] **Step 2: Write the failing scoring tests**

`src/domain/scoring.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  basePoints,
  formatPoints,
  placementShare,
  scoreResult,
  validatePlacements,
  type PlacementInput,
} from "./scoring";

const params = (participationFloor: number, jokerMultiplier = 1.5) => ({
  participationFloor,
  jokerMultiplier,
});

function order(n: number, jokerFor: number[] = []): PlacementInput[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: i + 1,
    placement: i + 1,
    jokerDeclared: jokerFor.includes(i + 1),
  }));
}

function points(weight: number, placements: PlacementInput[], floor: number, joker = 1.5) {
  return scoreResult(weight, placements, params(floor, joker)).map((p) => p.points);
}

function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));
}

describe("placementShare", () => {
  test("first place always 1, last place equals floor", () => {
    expect(placementShare(5, 1, 0.2)).toBeCloseTo(1);
    expect(placementShare(5, 5, 0.2)).toBeCloseTo(0.2);
  });

  test("throws for fewer than 2 players or out-of-range placement", () => {
    expect(() => placementShare(1, 1, 0.2)).toThrow(RangeError);
    expect(() => placementShare(4, 0, 0.2)).toThrow(RangeError);
    expect(() => placementShare(4, 5, 0.2)).toThrow(RangeError);
  });

  test("basePoints multiplies share by weight", () => {
    expect(basePoints(15, 6, 2, 0)).toBeCloseTo(12);
  });
});

describe("scoreResult without floor (original formula)", () => {
  test("4 players, weight 6", () => expectClose(points(6, order(4), 0), [6, 4, 2, 0]));
  test("6 players, weight 15", () => expectClose(points(15, order(6), 0), [15, 12, 9, 6, 3, 0]));
});

describe("scoreResult with 20% participation floor", () => {
  test("2 players, weight 10", () => expectClose(points(10, order(2), 0.2), [10, 2]));
  test("3 players, weight 8", () => expectClose(points(8, order(3), 0.2), [8, 4.8, 1.6]));
  test("4 players, weight 6", () => expectClose(points(6, order(4), 0.2), [6, 4.4, 2.8, 1.2]));
  test("6 players, weight 15", () =>
    expectClose(points(15, order(6), 0.2), [15, 12.6, 10.2, 7.8, 5.4, 3]));
  test("different weights scale linearly", () =>
    expectClose(points(4, order(4), 0.2), [4, 2.9333333333, 1.8666666667, 0.8]));
});

describe("ties", () => {
  test("tie for first shares the mean of positions 1 and 2", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 1, jokerDeclared: false },
      { playerId: 3, placement: 3, jokerDeclared: false },
      { playerId: 4, placement: 4, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0), [5, 5, 2, 0]);
  });

  test("tie for last shares the mean of the last positions", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 2, jokerDeclared: false },
      { playerId: 3, placement: 3, jokerDeclared: false },
      { playerId: 4, placement: 3, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0.2), [6, 4.4, 2, 2]);
  });

  test("three-way tie spans three positions", () => {
    const placements: PlacementInput[] = [
      { playerId: 1, placement: 1, jokerDeclared: false },
      { playerId: 2, placement: 1, jokerDeclared: false },
      { playerId: 3, placement: 1, jokerDeclared: false },
      { playerId: 4, placement: 4, jokerDeclared: false },
    ];
    expectClose(points(6, placements, 0), [4, 4, 4, 0]);
  });
});

describe("joker", () => {
  test("multiplies only the declaring player's points", () => {
    const scored = scoreResult(6, order(4, [1]), params(0.2, 1.5));
    expect(scored[0].base).toBeCloseTo(6);
    expect(scored[0].points).toBeCloseTo(9);
    expect(scored[0].jokerBonus).toBeCloseTo(3);
    expect(scored[1].points).toBeCloseTo(4.4);
    expect(scored[1].jokerBonus).toBe(0);
  });

  test("joker on last place with no floor earns nothing", () => {
    expectClose(points(6, order(4, [4]), 0), [6, 4, 2, 0]);
  });

  test("custom multiplier", () => {
    expectClose(points(10, order(2, [2]), 0.2, 2), [10, 4]);
  });

  test("keeps player order and ids", () => {
    const scored = scoreResult(6, order(3), params(0.2));
    expect(scored.map((s) => s.playerId)).toEqual([1, 2, 3]);
  });
});

describe("validatePlacements", () => {
  test("accepts a permutation", () => expect(validatePlacements([2, 1, 3], false)).toBeNull());
  test("rejects fewer than 2 players", () =>
    expect(validatePlacements([1], true)).toBe("too_few_players"));
  test("rejects gaps and duplicates", () => {
    expect(validatePlacements([1, 3], false)).toBe("invalid_placements");
    expect(validatePlacements([1, 1, 2], true)).toBe("invalid_placements");
    expect(validatePlacements([0, 1], true)).toBe("invalid_placements");
  });
  test("competition ranking ties need allowTies", () => {
    expect(validatePlacements([1, 1, 3], false)).toBe("ties_not_allowed");
    expect(validatePlacements([1, 1, 3], true)).toBeNull();
  });
  test("scoreResult throws on invalid placements", () => {
    expect(() =>
      scoreResult(6, [{ playerId: 1, placement: 1, jokerDeclared: false }], params(0.2)),
    ).toThrow(RangeError);
  });
});

describe("formatPoints", () => {
  test("one decimal", () => {
    expect(formatPoints(4.4000000001)).toBe("4.4");
    expect(formatPoints(15)).toBe("15.0");
    expect(formatPoints(2.9333)).toBe("2.9");
    expect(formatPoints(0.05)).toBe("0.1");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/scoring.test.ts`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 4: Implement the scoring engine**

`src/domain/scoring.ts`:

```ts
export interface ScoringParams {
  participationFloor: number;
  jokerMultiplier: number;
}

export interface PlacementInput {
  playerId: number;
  placement: number;
  jokerDeclared: boolean;
}

export interface ScoredPlacement extends PlacementInput {
  base: number;
  points: number;
  jokerBonus: number;
}

export type PlacementError = "too_few_players" | "invalid_placements" | "ties_not_allowed";

export function placementShare(n: number, place: number, floor: number): number {
  if (n < 2) throw new RangeError("A result needs at least 2 players");
  if (!Number.isInteger(place) || place < 1 || place > n) {
    throw new RangeError(`Placement ${place} is outside 1..${n}`);
  }
  return floor + ((1 - floor) * (n - place)) / (n - 1);
}

export function basePoints(weight: number, n: number, place: number, floor: number): number {
  return weight * placementShare(n, place, floor);
}

/** Placements use competition ranking: ties share a value and the next value skips (1, 1, 3). */
export function validatePlacements(placements: number[], allowTies: boolean): PlacementError | null {
  if (placements.length < 2) return "too_few_players";
  const sorted = [...placements].sort((a, b) => a - b);
  let expected = 1;
  let i = 0;
  while (i < sorted.length) {
    const value = sorted[i];
    if (!Number.isInteger(value) || value !== expected) return "invalid_placements";
    let groupSize = 0;
    while (i < sorted.length && sorted[i] === value) {
      groupSize++;
      i++;
    }
    if (groupSize > 1 && !allowTies) return "ties_not_allowed";
    expected = value + groupSize;
  }
  return null;
}

export function scoreResult(
  weight: number,
  placements: PlacementInput[],
  params: ScoringParams,
): ScoredPlacement[] {
  const error = validatePlacements(
    placements.map((p) => p.placement),
    true,
  );
  if (error) throw new RangeError(`Invalid result: ${error}`);

  const n = placements.length;
  const groupSizes = new Map<number, number>();
  for (const p of placements) groupSizes.set(p.placement, (groupSizes.get(p.placement) ?? 0) + 1);

  return placements.map((p) => {
    const span = groupSizes.get(p.placement) ?? 1;
    let sum = 0;
    for (let position = p.placement; position < p.placement + span; position++) {
      sum += basePoints(weight, n, position, params.participationFloor);
    }
    const base = sum / span;
    const points = p.jokerDeclared ? base * params.jokerMultiplier : base;
    return { ...p, base, points, jokerBonus: points - base };
  });
}

export function formatPoints(value: number): string {
  return (Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/domain/scoring.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/scoring.ts src/domain/scoring.test.ts
git commit -m "feat(domain): add fact types and scoring engine with participation floor, ties, joker"
```

---

### Task 3: Standings and replay

**Files:**
- Create: `src/domain/standings.ts`, `src/domain/replay.ts`, `src/domain/fixtures.ts`
- Test: `src/domain/standings.test.ts`, `src/domain/replay.test.ts`

**Interfaces:**
- Consumes: `scoreResult`, `ScoredPlacement` (Task 2); `PlayerFact`, `GameFact`, `SessionFact`, `ScoringSettings`, `ScoringStrategy` (Task 2)
- Produces:
  - `selectCounted(results: CountableResult[], strategy: ScoringStrategy, bestN: number): { counted: number; countedIds: number[]; excludedIds: number[] }`
  - `interface PlayerTotals { playerId; name; raw; counted; wins; podiums; gamesPlayed; countedSessionIds: number[]; excludedSessionIds: number[] }`
  - `interface StandingRow` = `PlayerTotals` without `name`, plus `rank: number | null`
  - `rankStandings(totals: PlayerTotals[]): StandingRow[]`
  - `isCompleteResult(s: SessionFact): boolean`, `durationMinutes(s: SessionFact): number | null`
  - `interface PlayerResult { sessionId; gameId; tableId: number | null; finishedAt; placement; playerCount; base; points; jokerDeclared }`
  - `interface ReplayResult { sessionId; gameId; tableId: number | null; startedAt: number | null; finishedAt: number; durationMin: number | null; players: ScoredPlacement[] }`
  - `interface Replay { results: ReplayResult[]; steps: ReplayStep[]; standings: StandingRow[]; byPlayer: Map<number, PlayerResult[]>; rankHistory: Map<number, HistoryPoint[]>; trends: Map<number, number | null> }`
  - `replay(input: { players: PlayerFact[]; games: GameFact[]; sessions: SessionFact[] }, settings: ScoringSettings): Replay`
  - fixtures: `makePlayer`, `makeGame`, `makeDoneSession`, `makeSettings`

- [ ] **Step 1: Write test fixtures**

`src/domain/fixtures.ts` (used by domain and service tests; not a test file):

```ts
import type { GameFact, PlayerFact, ScoringSettings, SessionFact } from "./types";

export function makePlayer(id: number, name: string, overrides: Partial<PlayerFact> = {}): PlayerFact {
  return {
    id,
    name,
    nickname: null,
    color: "#8b8b90",
    source: "admin",
    active: true,
    isDemo: false,
    createdAt: 0,
    ...overrides,
  };
}

export function makeGame(id: number, weight: number, overrides: Partial<GameFact> = {}): GameFact {
  return {
    id,
    slug: `game-${id}`,
    name: `Game ${id}`,
    family: `game-${id}`,
    descriptionEn: "",
    descriptionRu: "",
    icon: "Dices",
    category: "strategy",
    durationMin: 30,
    weight,
    minPlayers: 2,
    maxPlayers: 8,
    allowTies: false,
    active: true,
    ...overrides,
  };
}

/** placements: [playerId, placement, jokerDeclared?] */
export function makeDoneSession(
  id: number,
  gameId: number,
  finishedAt: number,
  placements: Array<[number, number, boolean?]>,
  overrides: Partial<SessionFact> = {},
): SessionFact {
  return {
    id,
    tableId: 1,
    gameId,
    status: "done",
    createdAt: finishedAt - 1000,
    startedAt: finishedAt - 30 * 60_000,
    finishedAt,
    notes: null,
    isDemo: false,
    players: placements.map(([playerId, placement, joker], seat) => ({
      playerId,
      seat,
      placement,
      jokerDeclared: joker ?? false,
    })),
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<ScoringSettings> = {}): ScoringSettings {
  return { strategy: "total", bestN: 4, participationFloor: 0, jokerMultiplier: 1.5, ...overrides };
}
```

- [ ] **Step 2: Write failing standings tests**

`src/domain/standings.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { rankStandings, selectCounted, type PlayerTotals } from "./standings";

function totals(playerId: number, name: string, t: Partial<PlayerTotals>): PlayerTotals {
  return {
    playerId,
    name,
    raw: 0,
    counted: 0,
    wins: 0,
    podiums: 0,
    gamesPlayed: 0,
    countedSessionIds: [],
    excludedSessionIds: [],
    ...t,
  };
}

describe("selectCounted", () => {
  const results = [
    { sessionId: 1, points: 5, finishedAt: 100 },
    { sessionId: 2, points: 9, finishedAt: 200 },
    { sessionId: 3, points: 1, finishedAt: 300 },
    { sessionId: 4, points: 5, finishedAt: 400 },
  ];

  test("total counts everything", () => {
    expect(selectCounted(results, "total", 2)).toEqual({
      counted: 20,
      countedIds: [1, 2, 3, 4],
      excludedIds: [],
    });
  });

  test("bestN keeps the N highest, earlier result wins equal points", () => {
    expect(selectCounted(results, "bestN", 2)).toEqual({
      counted: 14,
      countedIds: [1, 2],
      excludedIds: [3, 4],
    });
  });

  test("bestN larger than result count counts all", () => {
    expect(selectCounted(results, "bestN", 10).excludedIds).toEqual([]);
    expect(selectCounted(results, "bestN", 10).counted).toBe(20);
  });

  test("ids are returned in chronological order", () => {
    expect(selectCounted(results, "bestN", 3).countedIds).toEqual([1, 2, 4]);
  });
});

describe("rankStandings", () => {
  test("orders by counted, wins, raw, fewer games, name; unplayed last and unranked", () => {
    const rows = rankStandings([
      totals(1, "Zed", { counted: 10, wins: 1, raw: 10, gamesPlayed: 2 }),
      totals(2, "Amy", { counted: 10, wins: 2, raw: 10, gamesPlayed: 2 }),
      totals(3, "Bob", { counted: 10, wins: 1, raw: 12, gamesPlayed: 3 }),
      totals(4, "Cat", { counted: 10, wins: 1, raw: 10, gamesPlayed: 1 }),
      totals(5, "Dan", {}),
      totals(6, "Abe", {}),
      totals(7, "Eve", { counted: 12, gamesPlayed: 4 }),
    ]);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([
      [7, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [1, 5],
      [6, null],
      [5, null],
    ]);
  });

  test("treats floating noise as equal points", () => {
    const rows = rankStandings([
      totals(1, "B", { counted: 4.4 + 2.8, gamesPlayed: 2 }),
      totals(2, "A", { counted: 7.2, gamesPlayed: 2 }),
    ]);
    expect(rows.map((r) => r.playerId)).toEqual([2, 1]);
  });

  test("does not leak name into rows", () => {
    const [row] = rankStandings([totals(1, "A", { gamesPlayed: 1 })]);
    expect(row).not.toHaveProperty("name");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/domain/standings.test.ts`
Expected: FAIL — cannot resolve `./standings`.

- [ ] **Step 4: Implement standings**

`src/domain/standings.ts`:

```ts
import type { ScoringStrategy } from "./types";

export interface CountableResult {
  sessionId: number;
  points: number;
  finishedAt: number;
}

export interface PlayerTotals {
  playerId: number;
  name: string;
  raw: number;
  counted: number;
  wins: number;
  podiums: number;
  gamesPlayed: number;
  countedSessionIds: number[];
  excludedSessionIds: number[];
}

export interface StandingRow extends Omit<PlayerTotals, "name"> {
  rank: number | null;
}

const chronological = (a: CountableResult, b: CountableResult) =>
  a.finishedAt - b.finishedAt || a.sessionId - b.sessionId;

export function selectCounted(
  results: CountableResult[],
  strategy: ScoringStrategy,
  bestN: number,
): { counted: number; countedIds: number[]; excludedIds: number[] } {
  const ordered = [...results].sort(chronological);
  if (strategy === "total") {
    return {
      counted: ordered.reduce((sum, r) => sum + r.points, 0),
      countedIds: ordered.map((r) => r.sessionId),
      excludedIds: [],
    };
  }
  const best = [...ordered]
    .sort((a, b) => b.points - a.points || chronological(a, b))
    .slice(0, Math.max(0, bestN));
  const chosen = new Set(best.map((r) => r.sessionId));
  return {
    counted: best.reduce((sum, r) => sum + r.points, 0),
    countedIds: ordered.filter((r) => chosen.has(r.sessionId)).map((r) => r.sessionId),
    excludedIds: ordered.filter((r) => !chosen.has(r.sessionId)).map((r) => r.sessionId),
  };
}

/** Rounds to 6 decimals so floating noise never decides a rank. */
const pts = (value: number) => Math.round(value * 1e6);

export function compareTotals(a: PlayerTotals, b: PlayerTotals): number {
  const aPlayed = a.gamesPlayed > 0;
  const bPlayed = b.gamesPlayed > 0;
  if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
  return (
    pts(b.counted) - pts(a.counted) ||
    b.wins - a.wins ||
    pts(b.raw) - pts(a.raw) ||
    a.gamesPlayed - b.gamesPlayed ||
    a.name.localeCompare(b.name) ||
    a.playerId - b.playerId
  );
}

export function rankStandings(totals: PlayerTotals[]): StandingRow[] {
  let rank = 0;
  return [...totals].sort(compareTotals).map(({ name: _name, ...row }) => ({
    ...row,
    rank: row.gamesPlayed > 0 ? ++rank : null,
  }));
}
```

- [ ] **Step 5: Run standings tests**

Run: `npx vitest run src/domain/standings.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing replay tests**

Scenario used below (floor 0, strategy total): players Amy(1), Bob(2), Cat(3), Dan(4, never plays).
R1 at t=1000: game 1 (weight 6), Amy 1st, Bob 2nd, Cat 3rd → 6, 3, 0.
R2 at t=2000: game 2 (weight 10), Cat 1st, Bob 2nd → 10, 0.
After R2: Cat 10 (1), Amy 6 (2), Bob 3 (3), Dan unranked.

`src/domain/replay.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings } from "./fixtures";
import { durationMinutes, replay } from "./replay";
import type { SessionFact } from "./types";

const players = [makePlayer(1, "Amy"), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Dan")];
const games = [makeGame(1, 6), makeGame(2, 10)];
const r1 = makeDoneSession(1, 1, 1000, [
  [1, 1],
  [2, 2],
  [3, 3],
]);
const r2 = makeDoneSession(2, 2, 2000, [
  [3, 1],
  [2, 2],
]);

const ranks = (rows: { playerId: number; rank: number | null }[]) =>
  rows.map((r) => [r.playerId, r.rank]);

describe("replay", () => {
  test("computes final standings in chronological order regardless of input order", () => {
    const result = replay({ players, games, sessions: [r2, r1] }, makeSettings());
    expect(ranks(result.standings)).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
      [4, null],
    ]);
    expect(result.results.map((r) => r.sessionId)).toEqual([1, 2]);
    const cat = result.standings.find((r) => r.playerId === 3)!;
    expect(cat.counted).toBeCloseTo(10);
    expect(cat.wins).toBe(1);
    expect(cat.podiums).toBe(2);
    expect(cat.gamesPlayed).toBe(2);
  });

  test("records before/after standings per step and rank history", () => {
    const result = replay({ players, games, sessions: [r1, r2] }, makeSettings());
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].before.every((r) => r.rank === null)).toBe(true);
    expect(ranks(result.steps[1].before).slice(0, 3)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(result.rankHistory.get(3)).toEqual([
      { sessionId: 1, finishedAt: 1000, rank: 3, counted: 0 },
      { sessionId: 2, finishedAt: 2000, rank: 1, counted: 10 },
    ]);
    expect(result.rankHistory.get(4)).toEqual([]);
  });

  test("trend compares rank before the player's latest result to current rank", () => {
    const result = replay({ players, games, sessions: [r1, r2] }, makeSettings());
    expect(result.trends.get(1)).toBeNull();
    expect(result.trends.get(2)).toBe(-1);
    expect(result.trends.get(3)).toBe(2);
    expect(result.trends.get(4)).toBeNull();
  });

  test("editing a placement changes standings", () => {
    const edited = makeDoneSession(2, 2, 2000, [
      [2, 1],
      [3, 2],
    ]);
    const result = replay({ players, games, sessions: [r1, edited] }, makeSettings());
    expect(ranks(result.standings).slice(0, 3)).toEqual([
      [2, 1],
      [1, 2],
      [3, 3],
    ]);
  });

  test("deleting a result removes its points", () => {
    const result = replay({ players, games, sessions: [r1] }, makeSettings());
    expect(ranks(result.standings).slice(0, 3)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  test("ignores sessions that are not done", () => {
    const playing: SessionFact = { ...r2, status: "playing", finishedAt: null };
    const result = replay({ players, games, sessions: [r1, playing] }, makeSettings());
    expect(result.results).toHaveLength(1);
  });

  test("applies bestN and joker from settings", () => {
    const r3 = makeDoneSession(3, 1, 3000, [
      [1, 2, true],
      [2, 1],
    ]);
    const result = replay(
      { players, games, sessions: [r1, r2, r3] },
      makeSettings({ strategy: "bestN", bestN: 1, participationFloor: 0.2 }),
    );
    const amy = result.standings.find((r) => r.playerId === 1)!;
    // Amy: R1 6.0, R3 = 6 * 0.2 * 1.5 = 1.8; best 1 counts 6.0
    expect(amy.raw).toBeCloseTo(7.8);
    expect(amy.counted).toBeCloseTo(6);
    expect(amy.countedSessionIds).toEqual([1]);
    expect(amy.excludedSessionIds).toEqual([3]);
    const amyR3 = result.byPlayer.get(1)!.find((r) => r.sessionId === 3)!;
    expect(amyR3.jokerDeclared).toBe(true);
    expect(amyR3.points).toBeCloseTo(1.8);
    expect(amyR3.playerCount).toBe(2);
  });

  test("uses current game weight", () => {
    const heavier = [makeGame(1, 12), makeGame(2, 10)];
    const result = replay({ players, games: heavier, sessions: [r1] }, makeSettings());
    expect(result.standings[0].counted).toBeCloseTo(12);
  });

  test("inactive players without results are excluded, inactive with results stay", () => {
    const roster = [makePlayer(1, "Amy", { active: false }), makePlayer(2, "Bob"), makePlayer(3, "Cat"), makePlayer(4, "Dan", { active: false })];
    const result = replay({ players: roster, games, sessions: [r1] }, makeSettings());
    expect(result.standings.map((r) => r.playerId).sort()).toEqual([1, 2, 3]);
  });
});

describe("durationMinutes", () => {
  test("rounds elapsed minutes", () => {
    expect(durationMinutes(makeDoneSession(9, 1, 60 * 60_000, [[1, 1], [2, 2]], { startedAt: 0 }))).toBe(60);
  });
  test("null when start equals finish (direct result) or missing", () => {
    expect(durationMinutes(makeDoneSession(9, 1, 5000, [[1, 1], [2, 2]], { startedAt: 5000 }))).toBeNull();
    expect(durationMinutes(makeDoneSession(9, 1, 5000, [[1, 1], [2, 2]], { startedAt: null }))).toBeNull();
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run src/domain/replay.test.ts`
Expected: FAIL — cannot resolve `./replay`.

- [ ] **Step 8: Implement replay**

`src/domain/replay.ts`:

```ts
import { scoreResult, type ScoredPlacement } from "./scoring";
import { rankStandings, selectCounted, type PlayerTotals, type StandingRow } from "./standings";
import type { GameFact, PlayerFact, ScoringSettings, SessionFact } from "./types";

export interface PlayerResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  finishedAt: number;
  placement: number;
  playerCount: number;
  base: number;
  points: number;
  jokerDeclared: boolean;
}

export interface ReplayResult {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  startedAt: number | null;
  finishedAt: number;
  durationMin: number | null;
  players: ScoredPlacement[];
}

export interface ReplayStep {
  sessionId: number;
  before: StandingRow[];
  after: StandingRow[];
}

export interface HistoryPoint {
  sessionId: number;
  finishedAt: number;
  rank: number | null;
  counted: number;
}

export interface Replay {
  results: ReplayResult[];
  steps: ReplayStep[];
  standings: StandingRow[];
  byPlayer: Map<number, PlayerResult[]>;
  rankHistory: Map<number, HistoryPoint[]>;
  trends: Map<number, number | null>;
}

export interface ReplayInput {
  players: PlayerFact[];
  games: GameFact[];
  sessions: SessionFact[];
}

export function isCompleteResult(session: SessionFact): boolean {
  return (
    session.status === "done" &&
    session.finishedAt !== null &&
    session.players.length >= 2 &&
    session.players.every((p) => p.placement !== null)
  );
}

export function durationMinutes(session: SessionFact): number | null {
  if (session.startedAt === null || session.finishedAt === null) return null;
  if (session.finishedAt <= session.startedAt) return null;
  return Math.round((session.finishedAt - session.startedAt) / 60_000);
}

function totalsOf(player: PlayerFact, results: PlayerResult[], settings: ScoringSettings): PlayerTotals {
  const selection = selectCounted(
    results.map((r) => ({ sessionId: r.sessionId, points: r.points, finishedAt: r.finishedAt })),
    settings.strategy,
    settings.bestN,
  );
  return {
    playerId: player.id,
    name: player.name,
    raw: results.reduce((sum, r) => sum + r.points, 0),
    counted: selection.counted,
    wins: results.filter((r) => r.placement === 1).length,
    podiums: results.filter((r) => r.placement <= 3).length,
    gamesPlayed: results.length,
    countedSessionIds: selection.countedIds,
    excludedSessionIds: selection.excludedIds,
  };
}

const rankOf = (rows: StandingRow[], playerId: number) =>
  rows.find((r) => r.playerId === playerId)?.rank ?? null;

export function replay(input: ReplayInput, settings: ScoringSettings): Replay {
  const gamesById = new Map(input.games.map((g) => [g.id, g]));
  const done = input.sessions
    .filter(isCompleteResult)
    .filter((s) => gamesById.has(s.gameId))
    .sort((a, b) => a.finishedAt! - b.finishedAt! || a.id - b.id);

  const participants = new Set(done.flatMap((s) => s.players.map((p) => p.playerId)));
  const universe = input.players.filter((p) => p.active || participants.has(p.id));
  const byPlayer = new Map<number, PlayerResult[]>(universe.map((p) => [p.id, []]));
  const rankHistory = new Map<number, HistoryPoint[]>(universe.map((p) => [p.id, []]));
  const lastStepIndex = new Map<number, number>();

  const computeStandings = () =>
    rankStandings(universe.map((p) => totalsOf(p, byPlayer.get(p.id) ?? [], settings)));

  const results: ReplayResult[] = [];
  const steps: ReplayStep[] = [];
  let current = computeStandings();

  for (const session of done) {
    const game = gamesById.get(session.gameId)!;
    const scored = scoreResult(
      game.weight,
      session.players.map((p) => ({
        playerId: p.playerId,
        placement: p.placement!,
        jokerDeclared: p.jokerDeclared,
      })),
      settings,
    );
    const finishedAt = session.finishedAt!;
    results.push({
      sessionId: session.id,
      gameId: session.gameId,
      tableId: session.tableId,
      startedAt: session.startedAt,
      finishedAt,
      durationMin: durationMinutes(session),
      players: scored,
    });

    for (const s of scored) {
      byPlayer.get(s.playerId)?.push({
        sessionId: session.id,
        gameId: session.gameId,
        tableId: session.tableId,
        finishedAt,
        placement: s.placement,
        playerCount: scored.length,
        base: s.base,
        points: s.points,
        jokerDeclared: s.jokerDeclared,
      });
    }

    const before = current;
    current = computeStandings();
    steps.push({ sessionId: session.id, before, after: current });

    for (const s of scored) {
      const history = rankHistory.get(s.playerId);
      if (!history) continue;
      const row = current.find((r) => r.playerId === s.playerId)!;
      history.push({ sessionId: session.id, finishedAt, rank: row.rank, counted: row.counted });
      lastStepIndex.set(s.playerId, steps.length - 1);
    }
  }

  const trends = new Map<number, number | null>();
  for (const player of universe) {
    const index = lastStepIndex.get(player.id);
    if (index === undefined) {
      trends.set(player.id, null);
      continue;
    }
    const before = rankOf(steps[index].before, player.id);
    const now = rankOf(current, player.id);
    trends.set(player.id, before === null || now === null ? null : before - now);
  }

  return { results, steps, standings: current, byPlayer, rankHistory, trends };
}
```

- [ ] **Step 9: Run domain tests**

Run: `npx vitest run src/domain`
Expected: PASS (scoring, standings, replay).

- [ ] **Step 10: Commit**

```bash
git add src/domain
git commit -m "feat(domain): add best-N standings, deterministic ranking and replay with trends"
```

### Task 4: Table state, player helpers, snapshots (privacy boundary)

**Files:**
- Create: `src/domain/tables.ts`, `src/domain/players.ts`, `src/domain/snapshot.ts`
- Modify: `src/domain/fixtures.ts` (add `makeEvent`, `makeTable`, `makeOpenSession`)
- Test: `src/domain/players.test.ts`, `src/domain/snapshot.test.ts`

**Interfaces:**
- Consumes: `Facts`, `EventFact`, `SessionFact`, `SessionPlayerFact`, `PlayerFact`, `GameFact`, `TableFact`, `ScoringSettings`, `SessionStatus`, `DEFAULT_SCENES` (Task 2); `Replay`, `ReplayResult` (Task 3); `StandingRow` (Task 3)
- Produces:
  - `type TableState = "available" | "preparing" | "playing" | "pending"`
  - `OPEN_STATUSES: SessionStatus[]`, `isOpenSession(s: SessionFact): boolean`, `tableState(status: SessionStatus | undefined): TableState`
  - `PLAYER_COLORS: string[]`, `colorForIndex(index: number): string`, `normalizeName(name: string): string`, `findSimilarPlayers(players: PlayerFact[], name: string): PlayerFact[]`, `initials(name: string): string`, `parseBulkNames(text: string): string[]`
  - snapshot types `PublicSnapshot`, `AdminSnapshot`, `Snapshot`, `TableView<S>`, `SeatView`, `AdminSeatView`, `ResultView<P>`, `PublicPlacementView`, `ScoredPlacementView`, `LeaderboardRow`, `Counters`, `ScreenAnnouncement`, `PlayerView`, `AdminPlayerView`, `PublicEventView`, `AdminEventView`
  - `buildPublicSnapshot(facts: Facts, rp: Replay, now: number): PublicSnapshot`
  - `buildAdminSnapshot(facts: Facts, rp: Replay, now: number): AdminSnapshot`
  - `jokerUsers(sessions: SessionFact[]): Set<number>`
  - `ANNOUNCEMENT_WINDOW_MS = 120_000`, `RECENT_RESULTS_LIMIT = 20`

- [ ] **Step 1: Extend fixtures**

Append to `src/domain/fixtures.ts`:

```ts
import { DEFAULT_SCENES, type EventFact, type TableFact } from "./types";

export function makeEvent(overrides: Partial<EventFact> = {}): EventFact {
  return {
    name: "Board Games Cup",
    city: "Warsaw",
    year: 2026,
    status: "live",
    startedAt: 0,
    finishedAt: null,
    finaleRevealed: false,
    scoring: makeSettings({ strategy: "bestN", participationFloor: 0.2 }),
    sceneDurationSec: 12,
    enabledScenes: [...DEFAULT_SCENES],
    showPointsInReveals: false,
    screenLang: "en",
    accentColor: "#c9a45c",
    publicBaseUrl: null,
    screenControl: { paused: false, skipNonce: 0, finaleStep: 0 },
    dataVersion: 1,
    ...overrides,
  };
}

export function makeTable(id: number, number = id, overrides: Partial<TableFact> = {}): TableFact {
  return { id, number, label: null, active: true, ...overrides };
}

/** players: [playerId, jokerDeclared?] */
export function makeOpenSession(
  id: number,
  tableId: number,
  gameId: number,
  status: "setup" | "playing" | "pending",
  players: Array<[number, boolean?]>,
  startedAt: number | null = 1000,
): SessionFact {
  return {
    id,
    tableId,
    gameId,
    status,
    createdAt: 500,
    startedAt: status === "setup" ? null : startedAt,
    finishedAt: status === "pending" ? (startedAt ?? 0) + 60_000 : null,
    notes: null,
    isDemo: false,
    players: players.map(([playerId, joker], seat) => ({
      playerId,
      seat,
      jokerDeclared: joker ?? false,
      placement: null,
    })),
  };
}
```

Move the new `import` line to the top of the file next to the existing type import (merge into one `import { DEFAULT_SCENES, type EventFact, type GameFact, type PlayerFact, type ScoringSettings, type SessionFact, type TableFact } from "./types";`).

- [ ] **Step 2: Write `tables.ts`**

`src/domain/tables.ts`:

```ts
import type { SessionFact, SessionStatus } from "./types";

export type TableState = "available" | "preparing" | "playing" | "pending";

export const OPEN_STATUSES: SessionStatus[] = ["setup", "playing", "pending"];

export function isOpenSession(session: SessionFact): boolean {
  return OPEN_STATUSES.includes(session.status);
}

export function tableState(status: SessionStatus | undefined): TableState {
  switch (status) {
    case "setup":
      return "preparing";
    case "playing":
      return "playing";
    case "pending":
      return "pending";
    default:
      return "available";
  }
}
```

- [ ] **Step 3: Write failing player helper tests**

`src/domain/players.test.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/domain/players.test.ts`
Expected: FAIL — cannot resolve `./players`.

- [ ] **Step 5: Implement player helpers**

`src/domain/players.ts`:

```ts
import type { PlayerFact } from "./types";

/** Muted hues at similar lightness so no player color shouts. */
export const PLAYER_COLORS = [
  "#8fa7c9",
  "#c98f8f",
  "#8fc9a7",
  "#c9b98f",
  "#a78fc9",
  "#8fc3c9",
  "#c98fb5",
  "#a9c98f",
  "#c9a08f",
  "#8f9cc9",
  "#b5c98f",
  "#c98fa0",
];

export function colorForIndex(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSimilarPlayers(players: PlayerFact[], name: string): PlayerFact[] {
  const target = normalizeName(name);
  if (target.length < 3) return [];
  return players.filter((p) => {
    const candidate = normalizeName(p.name);
    if (candidate === target) return true;
    const shorter = candidate.length < target.length ? candidate : target;
    const longer = shorter === candidate ? target : candidate;
    return shorter.length >= 3 && longer.startsWith(shorter);
  });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function parseBulkNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, " ");
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
```

Note on the "Sasha" test: "sasha" vs "max"/"andrii"/"dmytro k" share no prefix, so it returns `[]`. "Andrii S" normalizes to "andrii s", which starts with "andrii" (length 6 ≥ 3), so player 1 matches.

- [ ] **Step 6: Run player helper tests**

Run: `npx vitest run src/domain/players.test.ts`
Expected: PASS.

- [ ] **Step 7: Write failing snapshot tests**

`src/domain/snapshot.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  makeDoneSession,
  makeEvent,
  makeGame,
  makeOpenSession,
  makePlayer,
  makeTable,
} from "./fixtures";
import { replay } from "./replay";
import { buildAdminSnapshot, buildPublicSnapshot } from "./snapshot";
import type { AnnouncementFact, EventFact, Facts } from "./types";

const FORBIDDEN = [
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

function keysDeep(value: unknown, path = "$"): Array<[string, string]> {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysDeep(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      [k, `${path}.${k}`] as [string, string],
      ...keysDeep(v, `${path}.${k}`),
    ]);
  }
  return [];
}

const NOW = 10_000_000;

function facts(event: Partial<EventFact> = {}, announcements: AnnouncementFact[] = []): Facts {
  return {
    event: makeEvent(event),
    players: [
      makePlayer(1, "Amy"),
      makePlayer(2, "Bob"),
      makePlayer(3, "Cat"),
      makePlayer(4, "Dan"),
      makePlayer(5, "Eve"),
      makePlayer(6, "Old", { active: false }),
    ],
    games: [makeGame(1, 6), makeGame(2, 10, { allowTies: true })],
    tables: [makeTable(1), makeTable(2), makeTable(3), makeTable(4, 4, { active: false })],
    sessions: [
      makeDoneSession(10, 1, NOW - 600_000, [
        [1, 1, true],
        [2, 2],
        [3, 3],
      ]),
      makeDoneSession(11, 2, NOW - 300_000, [
        [3, 1],
        [2, 2],
      ]),
      makeOpenSession(12, 1, 1, "playing", [[4, true], [5]]),
      makeOpenSession(13, 2, 2, "setup", [[1], [2]]),
    ],
    announcements,
  };
}

function build(f: Facts) {
  const rp = replay(f, f.event.scoring);
  return { pub: buildPublicSnapshot(f, rp, NOW), admin: buildAdminSnapshot(f, rp, NOW) };
}

const reveal = (id: number, sessionId: number, createdAt = NOW - 10_000): AnnouncementFact => ({
  id,
  type: "result_reveal",
  payload: { sessionId },
  createdAt,
});

describe("public snapshot before finale", () => {
  test("contains no standings, points or joker fields anywhere", () => {
    const { pub } = build(facts({}, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN.includes(key));
    expect(leaks).toEqual([]);
    expect(pub.leaderboard).toBeNull();
    expect(pub.contenders).toBeNull();
    expect(pub.audience).toBe("public");
  });

  test("shows room facts: tables, recent placements, counters", () => {
    const { pub } = build(facts());
    expect(pub.tables.map((t) => [t.number, t.state])).toEqual([
      [1, "playing"],
      [2, "preparing"],
      [3, "available"],
    ]);
    expect(pub.tables[0].session?.players).toEqual([
      { playerId: 4, seat: 0 },
      { playerId: 5, seat: 1 },
    ]);
    expect(pub.recentResults.map((r) => r.sessionId)).toEqual([11, 10]);
    expect(pub.recentResults[1].placements).toEqual([
      { playerId: 1, placement: 1 },
      { playerId: 2, placement: 2 },
      { playerId: 3, placement: 3 },
    ]);
    expect(pub.counters).toEqual({ gamesCompleted: 2, tablesActive: 2, players: 5 });
    expect(pub.players.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test("reveal points appear only inside announcements when enabled", () => {
    const { pub } = build(facts({ showPointsInReveals: true }, [reveal(1, 11)]));
    const leaks = keysDeep(pub).filter(([key]) => FORBIDDEN.includes(key));
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.every(([, path]) => path.startsWith("$.announcements"))).toBe(true);
    expect(leaks.every(([key]) => key === "points")).toBe(true);
  });

  test("contenders lists top 5 alphabetically when the scene is enabled", () => {
    const { pub } = build(facts({ enabledScenes: ["title", "contenders"] }));
    // ranked players: Cat, Amy, Bob (Dan, Eve have no results)
    expect(pub.contenders).toEqual([1, 2, 3]);
  });
});

describe("announcements", () => {
  test("keeps only the last 120 s, in id order, and drops missing results", () => {
    const { pub } = build(
      facts({}, [
        reveal(3, 11),
        reveal(1, 10, NOW - 200_000),
        reveal(2, 999),
        { id: 4, type: "milestone", payload: { count: 10 }, createdAt: NOW - 1000 },
      ]),
    );
    expect(pub.announcements.map((a) => [a.id, a.type])).toEqual([
      [3, "result_reveal"],
      [4, "milestone"],
    ]);
  });
});

describe("public snapshot after finale reveal", () => {
  test("includes leaderboard and result points", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.leaderboard?.[0]).toMatchObject({ playerId: 3, rank: 1 });
    expect(pub.recentResults[0].placements[0]).toHaveProperty("points");
  });
});

describe("admin snapshot", () => {
  test("has full leaderboard, jokers, scoring settings and results newest first", () => {
    const { admin } = build(facts());
    expect(admin.audience).toBe("admin");
    expect(admin.leaderboard.slice(0, 3).map((r) => [r.playerId, r.rank])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(admin.leaderboard.find((r) => r.playerId === 1)?.jokerUsed).toBe(true);
    expect(admin.leaderboard.find((r) => r.playerId === 4)?.jokerUsed).toBe(true);
    expect(admin.tables[0].session?.players[0]).toEqual({ playerId: 4, seat: 0, jokerDeclared: true });
    expect(admin.results.map((r) => r.sessionId)).toEqual([11, 10]);
    expect(admin.results[1].placements[0]).toMatchObject({ playerId: 1, jokerDeclared: true });
    expect(admin.event.scoring.bestN).toBe(4);
    expect(admin.players.find((p) => p.id === 6)).toMatchObject({ active: false, jokerUsed: false });
    expect(admin.allTables.map((t) => t.number)).toEqual([1, 2, 3, 4]);
  });
});
```

Check the numbers used above: event scoring is bestN 4, floor 0.2. Session 10 (weight 6, 3 players): Amy 6 × 1.5 = 9, Bob 3.6, Cat 1.2. Session 11 (weight 10, 2 players): Cat 10, Bob 2. Totals: Cat 11.2, Amy 9, Bob 5.6 → ranks Cat 1, Amy 2, Bob 3.

- [ ] **Step 8: Run to verify failure**

Run: `npx vitest run src/domain/snapshot.test.ts`
Expected: FAIL — cannot resolve `./snapshot`.

- [ ] **Step 9: Implement snapshot builders**

`src/domain/snapshot.ts`:

```ts
import type { Replay, ReplayResult } from "./replay";
import type { StandingRow } from "./standings";
import { isOpenSession, tableState, type TableState } from "./tables";
import type {
  EventFact,
  EventStatus,
  Facts,
  GameFact,
  Lang,
  PlayerFact,
  PlayerSource,
  SceneId,
  ScoringSettings,
  ScreenControl,
  SessionFact,
  SessionPlayerFact,
  SessionStatus,
  TableFact,
} from "./types";

export const ANNOUNCEMENT_WINDOW_MS = 120_000;
export const RECENT_RESULTS_LIMIT = 20;

export interface PublicEventView {
  name: string;
  city: string;
  year: number;
  status: EventStatus;
  startedAt: number | null;
  finishedAt: number | null;
  finaleRevealed: boolean;
  sceneDurationSec: number;
  enabledScenes: SceneId[];
  showPointsInReveals: boolean;
  screenLang: Lang;
  accentColor: string;
  publicBaseUrl: string | null;
  screenControl: ScreenControl;
}

export interface AdminEventView extends PublicEventView {
  scoring: ScoringSettings;
}

export interface PlayerView {
  id: number;
  name: string;
  nickname: string | null;
  color: string;
}

export interface AdminPlayerView extends PlayerView {
  source: PlayerSource;
  active: boolean;
  isDemo: boolean;
  jokerUsed: boolean;
  createdAt: number;
}

export interface SeatView {
  playerId: number;
  seat: number;
}

export interface AdminSeatView extends SeatView {
  jokerDeclared: boolean;
}

export interface TableSessionView<S> {
  id: number;
  gameId: number;
  status: SessionStatus;
  startedAt: number | null;
  finishedAt: number | null;
  notes: string | null;
  players: S[];
}

export interface TableView<S> {
  tableId: number;
  number: number;
  label: string | null;
  state: TableState;
  session: TableSessionView<S> | null;
}

export interface PublicPlacementView {
  playerId: number;
  placement: number;
  points?: number;
}

export interface ScoredPlacementView {
  playerId: number;
  placement: number;
  base: number;
  points: number;
  jokerDeclared: boolean;
}

export interface ResultView<P> {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  startedAt: number | null;
  finishedAt: number;
  durationMin: number | null;
  placements: P[];
}

export interface LeaderboardRow extends StandingRow {
  trend: number | null;
  jokerUsed: boolean;
}

export interface Counters {
  gamesCompleted: number;
  tablesActive: number;
  players: number;
}

export type ScreenAnnouncement =
  | { id: number; createdAt: number; type: "result_reveal"; result: ResultView<PublicPlacementView> }
  | { id: number; createdAt: number; type: "milestone"; count: number };

export interface PublicSnapshot {
  audience: "public";
  version: number;
  event: PublicEventView;
  players: PlayerView[];
  games: GameFact[];
  tables: TableView<SeatView>[];
  recentResults: ResultView<PublicPlacementView>[];
  counters: Counters;
  announcements: ScreenAnnouncement[];
  contenders: number[] | null;
  leaderboard: LeaderboardRow[] | null;
}

export interface AdminSnapshot {
  audience: "admin";
  version: number;
  event: AdminEventView;
  players: AdminPlayerView[];
  games: GameFact[];
  allTables: TableFact[];
  tables: TableView<AdminSeatView>[];
  results: ResultView<ScoredPlacementView>[];
  counters: Counters;
  announcements: ScreenAnnouncement[];
  leaderboard: LeaderboardRow[];
}

export type Snapshot = PublicSnapshot | AdminSnapshot;

function eventView(e: EventFact): PublicEventView {
  return {
    name: e.name,
    city: e.city,
    year: e.year,
    status: e.status,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    finaleRevealed: e.finaleRevealed,
    sceneDurationSec: e.sceneDurationSec,
    enabledScenes: e.enabledScenes,
    showPointsInReveals: e.showPointsInReveals,
    screenLang: e.screenLang,
    accentColor: e.accentColor,
    publicBaseUrl: e.publicBaseUrl,
    screenControl: e.screenControl,
  };
}

const playerView = (p: PlayerFact): PlayerView => ({
  id: p.id,
  name: p.name,
  nickname: p.nickname,
  color: p.color,
});

export function jokerUsers(sessions: SessionFact[]): Set<number> {
  const ids = new Set<number>();
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    for (const p of s.players) if (p.jokerDeclared) ids.add(p.playerId);
  }
  return ids;
}

function buildTables<S>(facts: Facts, seat: (p: SessionPlayerFact) => S): TableView<S>[] {
  const openByTable = new Map<number, SessionFact>();
  for (const s of facts.sessions) {
    if (s.tableId === null || !isOpenSession(s)) continue;
    const existing = openByTable.get(s.tableId);
    if (!existing || s.createdAt > existing.createdAt) openByTable.set(s.tableId, s);
  }
  return facts.tables
    .filter((t) => t.active || openByTable.has(t.id))
    .sort((a, b) => a.number - b.number)
    .map((t) => {
      const s = openByTable.get(t.id);
      return {
        tableId: t.id,
        number: t.number,
        label: t.label,
        state: tableState(s?.status),
        session: s
          ? {
              id: s.id,
              gameId: s.gameId,
              status: s.status,
              startedAt: s.startedAt,
              finishedAt: s.finishedAt,
              notes: s.notes,
              players: [...s.players].sort((a, b) => a.seat - b.seat).map(seat),
            }
          : null,
      };
    });
}

function counters(facts: Facts, rp: Replay, tables: TableView<unknown>[]): Counters {
  return {
    gamesCompleted: rp.results.length,
    tablesActive: tables.filter((t) => t.state !== "available").length,
    players: facts.players.filter((p) => p.active).length,
  };
}

const byPlacement = (a: { placement: number; playerId: number }, b: { placement: number; playerId: number }) =>
  a.placement - b.placement || a.playerId - b.playerId;

function publicResult(r: ReplayResult, withPoints: boolean): ResultView<PublicPlacementView> {
  return {
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMin: r.durationMin,
    placements: [...r.players]
      .sort(byPlacement)
      .map((p) =>
        withPoints
          ? { playerId: p.playerId, placement: p.placement, points: p.points }
          : { playerId: p.playerId, placement: p.placement },
      ),
  };
}

function adminResult(r: ReplayResult): ResultView<ScoredPlacementView> {
  return {
    sessionId: r.sessionId,
    gameId: r.gameId,
    tableId: r.tableId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMin: r.durationMin,
    placements: [...r.players].sort(byPlacement).map((p) => ({
      playerId: p.playerId,
      placement: p.placement,
      base: p.base,
      points: p.points,
      jokerDeclared: p.jokerDeclared,
    })),
  };
}

function announcements(facts: Facts, rp: Replay, now: number, withPoints: boolean): ScreenAnnouncement[] {
  const results = new Map(rp.results.map((r) => [r.sessionId, r]));
  return facts.announcements
    .filter((a) => a.createdAt >= now - ANNOUNCEMENT_WINDOW_MS)
    .sort((a, b) => a.id - b.id)
    .flatMap((a): ScreenAnnouncement[] => {
      if (a.type === "milestone") {
        return [{ id: a.id, createdAt: a.createdAt, type: "milestone", count: a.payload.count }];
      }
      const result = results.get(a.payload.sessionId);
      return result
        ? [{ id: a.id, createdAt: a.createdAt, type: "result_reveal", result: publicResult(result, withPoints) }]
        : [];
    });
}

function leaderboard(facts: Facts, rp: Replay): LeaderboardRow[] {
  const jokers = jokerUsers(facts.sessions);
  return rp.standings.map((row) => ({
    ...row,
    trend: rp.trends.get(row.playerId) ?? null,
    jokerUsed: jokers.has(row.playerId),
  }));
}

export function buildPublicSnapshot(facts: Facts, rp: Replay, now: number): PublicSnapshot {
  const revealed = facts.event.finaleRevealed;
  const tables = buildTables<SeatView>(facts, (p) => ({ playerId: p.playerId, seat: p.seat }));
  const visibleIds = new Set<number>([
    ...rp.results.flatMap((r) => r.players.map((p) => p.playerId)),
    ...facts.sessions.filter(isOpenSession).flatMap((s) => s.players.map((p) => p.playerId)),
  ]);
  const names = new Map(facts.players.map((p) => [p.id, p.name]));
  const contenders = facts.event.enabledScenes.includes("contenders")
    ? rp.standings
        .filter((r) => r.rank !== null && r.rank <= 5)
        .map((r) => r.playerId)
        .sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""))
    : null;

  return {
    audience: "public",
    version: facts.event.dataVersion,
    event: eventView(facts.event),
    players: facts.players.filter((p) => p.active || visibleIds.has(p.id)).map(playerView),
    games: facts.games,
    tables,
    recentResults: [...rp.results]
      .reverse()
      .slice(0, RECENT_RESULTS_LIMIT)
      .map((r) => publicResult(r, revealed)),
    counters: counters(facts, rp, tables),
    announcements: announcements(facts, rp, now, revealed || facts.event.showPointsInReveals),
    contenders,
    leaderboard: revealed ? leaderboard(facts, rp) : null,
  };
}

export function buildAdminSnapshot(facts: Facts, rp: Replay, now: number): AdminSnapshot {
  const jokers = jokerUsers(facts.sessions);
  const tables = buildTables<AdminSeatView>(facts, (p) => ({
    playerId: p.playerId,
    seat: p.seat,
    jokerDeclared: p.jokerDeclared,
  }));
  return {
    audience: "admin",
    version: facts.event.dataVersion,
    event: { ...eventView(facts.event), scoring: facts.event.scoring },
    players: facts.players.map((p) => ({
      ...playerView(p),
      source: p.source,
      active: p.active,
      isDemo: p.isDemo,
      jokerUsed: jokers.has(p.id),
      createdAt: p.createdAt,
    })),
    games: facts.games,
    allTables: [...facts.tables].sort((a, b) => a.number - b.number),
    tables,
    results: [...rp.results].reverse().map(adminResult),
    counters: counters(facts, rp, tables),
    announcements: announcements(facts, rp, now, true),
    leaderboard: leaderboard(facts, rp),
  };
}
```

- [ ] **Step 10: Run all domain tests**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/domain
git commit -m "feat(domain): add table state, player helpers and privacy-safe snapshot builders"
```

### Task 5: Database schema, client, repository, PIN hashing, base seed

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/repo/facts.ts`, `src/server/repo/writes.ts`, `src/server/auth/pin.ts`, `src/server/seed/base.ts`, `src/server/testDb.ts`, `drizzle/*` (generated)
- Modify: `src/domain/types.ts` (append audit types)
- Test: `src/server/repo/repo.test.ts`, `src/server/auth/pin.test.ts`

**Interfaces:**
- Consumes: all fact types (Task 2)
- Produces:
  - `type Db` (drizzle better-sqlite3 database with `$client`), `type Tx` (sync database or transaction)
  - `openDb(file: string): Db` (creates dir, WAL, foreign keys, runs migrations), `getDb(): Db` (process singleton), `defaultDbPath(): string`
  - schema tables: `event`, `players`, `games`, `tables`, `sessions`, `sessionPlayers`, `announcements`, `auditLog`
  - `loadFacts(tx: Tx): Facts`, `getDataVersion(tx: Tx): number`, `loadSecrets(tx: Tx): { adminPinHash: string; sessionSecret: string }`, `loadSession(tx: Tx, id: number): SessionFact | null`, `listAudit(tx: Tx, limit?: number): AuditEntry[]`
  - writes: `bumpVersion`, `updateEventRow`, `insertPlayer`, `updatePlayerRow`, `deletePlayerRow`, `updateGameRow`, `insertTable`, `updateTableRow`, `deleteTableRow`, `insertSession`, `updateSessionRow`, `deleteSessionRow`, `replaceSessionPlayers`, `writeSession`, `insertAnnouncement`, `milestoneExists`, `insertAudit`, `lastUndoableAudit`, `markAuditUndone`, `deleteDemoData` (signatures in code below)
  - `hashPin(pin: string): string`, `verifyPin(pin: string, stored: string): boolean`, `randomSecret(): string`
  - `BASE_GAMES`, `seedBase(db: Db, opts: { adminPin: string; tableCount?: number }): void`
  - `createTestDb(): { db: Db; file: string; cleanup: () => void }`
  - types `AuditAction`, `AuditEntry`, `UNDOABLE_ACTIONS`

- [ ] **Step 1: Append audit types to domain types**

Append to `src/domain/types.ts`:

```ts
export type AuditAction =
  | "result.create"
  | "result.update"
  | "result.delete"
  | "joker.correct"
  | "session.cancel"
  | "player.merge"
  | "undo";

export const UNDOABLE_ACTIONS: AuditAction[] = [
  "result.create",
  "result.update",
  "result.delete",
  "joker.correct",
];

export interface AuditEntry {
  id: number;
  at: number;
  action: AuditAction;
  summary: string;
  before: SessionFact | null;
  after: SessionFact | null;
  undone: boolean;
}
```

- [ ] **Step 2: Write the schema**

`src/server/db/schema.ts` (relative imports only — drizzle-kit does not read the `@/` alias):

```ts
import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AuditAction, SceneId, ScreenControl, SessionFact } from "../../domain/types";

export const event = sqliteTable("event", {
  id: integer().primaryKey(),
  name: text().notNull().default("Board Games Cup"),
  city: text().notNull().default("Warsaw"),
  year: integer().notNull().default(2026),
  status: text({ enum: ["draft", "live", "finished"] }).notNull().default("draft"),
  startedAt: integer(),
  finishedAt: integer(),
  finaleRevealed: integer({ mode: "boolean" }).notNull().default(false),
  scoringStrategy: text({ enum: ["total", "bestN"] }).notNull().default("bestN"),
  bestN: integer().notNull().default(4),
  participationFloor: real().notNull().default(0.2),
  jokerMultiplier: real().notNull().default(1.5),
  sceneDurationSec: integer().notNull().default(12),
  enabledScenes: text({ mode: "json" })
    .$type<SceneId[]>()
    .notNull()
    .default(sql`'["title","room","recent","counters"]'`),
  showPointsInReveals: integer({ mode: "boolean" }).notNull().default(false),
  screenLang: text({ enum: ["en", "ru"] }).notNull().default("en"),
  accentColor: text().notNull().default("#c9a45c"),
  publicBaseUrl: text(),
  adminPinHash: text().notNull(),
  sessionSecret: text().notNull(),
  screenControl: text({ mode: "json" })
    .$type<ScreenControl>()
    .notNull()
    .default(sql`'{"paused":false,"skipNonce":0,"finaleStep":0}'`),
  dataVersion: integer().notNull().default(1),
});

export const players = sqliteTable("players", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  nickname: text(),
  color: text().notNull(),
  source: text({ enum: ["admin", "checkin"] }).notNull().default("admin"),
  active: integer({ mode: "boolean" }).notNull().default(true),
  isDemo: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: integer().notNull(),
});

export const games = sqliteTable("games", {
  id: integer().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  family: text().notNull(),
  descriptionEn: text().notNull().default(""),
  descriptionRu: text().notNull().default(""),
  icon: text().notNull().default("Dices"),
  category: text().notNull().default("strategy"),
  durationMin: integer().notNull().default(30),
  weight: real().notNull(),
  minPlayers: integer().notNull().default(2),
  maxPlayers: integer().notNull().default(6),
  allowTies: integer({ mode: "boolean" }).notNull().default(false),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const tables = sqliteTable("tables", {
  id: integer().primaryKey({ autoIncrement: true }),
  number: integer().notNull().unique(),
  label: text(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const sessions = sqliteTable("sessions", {
  id: integer().primaryKey({ autoIncrement: true }),
  tableId: integer().references(() => tables.id),
  gameId: integer()
    .notNull()
    .references(() => games.id),
  status: text({ enum: ["setup", "playing", "pending", "done", "cancelled"] }).notNull(),
  createdAt: integer().notNull(),
  startedAt: integer(),
  finishedAt: integer(),
  notes: text(),
  isDemo: integer({ mode: "boolean" }).notNull().default(false),
});

export const sessionPlayers = sqliteTable(
  "session_players",
  {
    sessionId: integer()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: integer()
      .notNull()
      .references(() => players.id),
    seat: integer().notNull(),
    jokerDeclared: integer({ mode: "boolean" }).notNull().default(false),
    placement: integer(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.playerId] })],
);

export const announcements = sqliteTable("announcements", {
  id: integer().primaryKey({ autoIncrement: true }),
  type: text({ enum: ["result_reveal", "milestone"] }).notNull(),
  payload: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
  createdAt: integer().notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer().primaryKey({ autoIncrement: true }),
  at: integer().notNull(),
  action: text().$type<AuditAction>().notNull(),
  summary: text().notNull(),
  before: text({ mode: "json" }).$type<SessionFact | null>(),
  after: text({ mode: "json" }).$type<SessionFact | null>(),
  undone: integer({ mode: "boolean" }).notNull().default(false),
});
```

- [ ] **Step 3: Generate the initial migration**

Run: `npm run db:generate`
Expected: creates `drizzle/0000_<name>.sql` and `drizzle/meta/_journal.json` with CREATE TABLE statements for all 8 tables.

- [ ] **Step 4: Write the DB client**

`src/server/db/client.ts`:

```ts
import Database from "better-sqlite3";
import type { RunResult } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function wrap(sqlite: Database.Database) {
  return drizzle({ client: sqlite, schema });
}

export type Db = ReturnType<typeof wrap>;
/** Either the database or a transaction; all repo functions accept it. Queries are synchronous. */
export type Tx = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), "data", "board-cup.db");
}

export function openDb(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = wrap(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

const globalForDb = globalThis as unknown as { __boardCupDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__boardCupDb) globalForDb.__boardCupDb = openDb(defaultDbPath());
  return globalForDb.__boardCupDb;
}
```

- [ ] **Step 5: Write PIN hashing with a failing test first**

`src/server/auth/pin.test.ts`:

```ts
import { expect, test } from "vitest";
import { hashPin, randomSecret, verifyPin } from "./pin";

test("hash and verify a PIN", () => {
  const stored = hashPin("2468");
  expect(stored.startsWith("scrypt$")).toBe(true);
  expect(verifyPin("2468", stored)).toBe(true);
  expect(verifyPin("2469", stored)).toBe(false);
});

test("same PIN hashes differently (random salt)", () => {
  expect(hashPin("1111")).not.toBe(hashPin("1111"));
});

test("malformed stored hash never verifies", () => {
  expect(verifyPin("1234", "plain")).toBe(false);
});

test("random secret is 64 hex chars", () => {
  expect(randomSecret()).toMatch(/^[0-9a-f]{64}$/);
});
```

Run: `npx vitest run src/server/auth/pin.test.ts` → Expected: FAIL (module missing).

`src/server/auth/pin.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomSecret(): string {
  return randomBytes(32).toString("hex");
}
```

Run: `npx vitest run src/server/auth/pin.test.ts` → Expected: PASS.

- [ ] **Step 6: Write the read repository**

`src/server/repo/facts.ts`:

```ts
import { asc, desc, eq } from "drizzle-orm";
import type { AuditEntry, Facts, SessionFact } from "@/domain/types";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

type SessionRow = typeof s.sessions.$inferSelect;
type SessionPlayerRow = typeof s.sessionPlayers.$inferSelect;

function toSessionFact(row: SessionRow, players: SessionPlayerRow[]): SessionFact {
  return {
    id: row.id,
    tableId: row.tableId,
    gameId: row.gameId,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    notes: row.notes,
    isDemo: row.isDemo,
    players: players
      .filter((p) => p.sessionId === row.id)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        playerId: p.playerId,
        seat: p.seat,
        jokerDeclared: p.jokerDeclared,
        placement: p.placement,
      })),
  };
}

export function getEventRow(tx: Tx) {
  const row = tx.select().from(s.event).where(eq(s.event.id, 1)).get();
  if (!row) throw new Error("Event row missing. Run `npm run setup` first.");
  return row;
}

export function getDataVersion(tx: Tx): number {
  const row = tx.select({ v: s.event.dataVersion }).from(s.event).where(eq(s.event.id, 1)).get();
  if (!row) throw new Error("Event row missing. Run `npm run setup` first.");
  return row.v;
}

export function loadSecrets(tx: Tx): { adminPinHash: string; sessionSecret: string } {
  const row = getEventRow(tx);
  return { adminPinHash: row.adminPinHash, sessionSecret: row.sessionSecret };
}

export function loadSession(tx: Tx, id: number): SessionFact | null {
  const row = tx.select().from(s.sessions).where(eq(s.sessions.id, id)).get();
  if (!row) return null;
  const players = tx.select().from(s.sessionPlayers).where(eq(s.sessionPlayers.sessionId, id)).all();
  return toSessionFact(row, players);
}

export function loadFacts(tx: Tx): Facts {
  const e = getEventRow(tx);
  const sessionRows = tx.select().from(s.sessions).orderBy(asc(s.sessions.id)).all();
  const seatRows = tx.select().from(s.sessionPlayers).all();
  const announcementRows = tx
    .select()
    .from(s.announcements)
    .orderBy(desc(s.announcements.id))
    .limit(20)
    .all();

  return {
    event: {
      name: e.name,
      city: e.city,
      year: e.year,
      status: e.status,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      finaleRevealed: e.finaleRevealed,
      scoring: {
        strategy: e.scoringStrategy,
        bestN: e.bestN,
        participationFloor: e.participationFloor,
        jokerMultiplier: e.jokerMultiplier,
      },
      sceneDurationSec: e.sceneDurationSec,
      enabledScenes: e.enabledScenes,
      showPointsInReveals: e.showPointsInReveals,
      screenLang: e.screenLang,
      accentColor: e.accentColor,
      publicBaseUrl: e.publicBaseUrl,
      screenControl: e.screenControl,
      dataVersion: e.dataVersion,
    },
    players: tx.select().from(s.players).orderBy(asc(s.players.id)).all(),
    games: tx.select().from(s.games).orderBy(asc(s.games.weight), asc(s.games.name)).all(),
    tables: tx.select().from(s.tables).orderBy(asc(s.tables.number)).all(),
    sessions: sessionRows.map((row) => toSessionFact(row, seatRows)),
    announcements: announcementRows.map((a) =>
      a.type === "milestone"
        ? { id: a.id, type: "milestone" as const, payload: { count: a.payload.count ?? 0 }, createdAt: a.createdAt }
        : { id: a.id, type: "result_reveal" as const, payload: { sessionId: a.payload.sessionId ?? 0 }, createdAt: a.createdAt },
    ),
  };
}

export function listAudit(tx: Tx, limit = 50): AuditEntry[] {
  return tx.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(limit).all();
}
```

Note: `toSessionFact` filters seat rows per session; with at most a few hundred rows this is fast enough and keeps the code simple.

- [ ] **Step 7: Write the write repository**

`src/server/repo/writes.ts`:

```ts
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  UNDOABLE_ACTIONS,
  type AuditAction,
  type AuditEntry,
  type PlayerSource,
  type SessionFact,
  type SessionPlayerFact,
} from "@/domain/types";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

type EventPatch = Partial<Omit<typeof s.event.$inferInsert, "id">>;
type PlayerPatch = Partial<Omit<typeof s.players.$inferInsert, "id">>;
type GamePatch = Partial<Omit<typeof s.games.$inferInsert, "id" | "slug">>;
type TablePatch = Partial<Omit<typeof s.tables.$inferInsert, "id">>;
type SessionPatch = Partial<Omit<typeof s.sessions.$inferInsert, "id">>;

export function bumpVersion(tx: Tx): void {
  tx.update(s.event)
    .set({ dataVersion: sql`${s.event.dataVersion} + 1` })
    .where(eq(s.event.id, 1))
    .run();
}

export function updateEventRow(tx: Tx, patch: EventPatch): void {
  tx.update(s.event).set(patch).where(eq(s.event.id, 1)).run();
}

export function insertPlayer(
  tx: Tx,
  values: { name: string; nickname: string | null; color: string; source: PlayerSource; isDemo?: boolean; createdAt: number },
): number {
  const row = tx
    .insert(s.players)
    .values({ ...values, isDemo: values.isDemo ?? false })
    .returning({ id: s.players.id })
    .get();
  return row.id;
}

export function updatePlayerRow(tx: Tx, id: number, patch: PlayerPatch): void {
  tx.update(s.players).set(patch).where(eq(s.players.id, id)).run();
}

export function deletePlayerRow(tx: Tx, id: number): void {
  tx.delete(s.players).where(eq(s.players.id, id)).run();
}

export function reassignPlayerSeats(tx: Tx, fromId: number, toId: number): void {
  tx.update(s.sessionPlayers).set({ playerId: toId }).where(eq(s.sessionPlayers.playerId, fromId)).run();
}

export function updateGameRow(tx: Tx, id: number, patch: GamePatch): void {
  tx.update(s.games).set(patch).where(eq(s.games.id, id)).run();
}

export function insertTable(tx: Tx, values: { number: number; label: string | null }): number {
  return tx.insert(s.tables).values(values).returning({ id: s.tables.id }).get().id;
}

export function updateTableRow(tx: Tx, id: number, patch: TablePatch): void {
  tx.update(s.tables).set(patch).where(eq(s.tables.id, id)).run();
}

export function deleteTableRow(tx: Tx, id: number): void {
  tx.delete(s.tables).where(eq(s.tables.id, id)).run();
}

export function tableHasSessions(tx: Tx, tableId: number): boolean {
  return Boolean(tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.tableId, tableId)).get());
}

export function insertSession(
  tx: Tx,
  values: Omit<typeof s.sessions.$inferInsert, "id">,
  players: SessionPlayerFact[],
): number {
  const id = tx.insert(s.sessions).values(values).returning({ id: s.sessions.id }).get().id;
  replaceSessionPlayers(tx, id, players);
  return id;
}

export function updateSessionRow(tx: Tx, id: number, patch: SessionPatch): void {
  tx.update(s.sessions).set(patch).where(eq(s.sessions.id, id)).run();
}

export function deleteSessionRow(tx: Tx, id: number): void {
  tx.delete(s.sessions).where(eq(s.sessions.id, id)).run();
}

export function replaceSessionPlayers(tx: Tx, sessionId: number, players: SessionPlayerFact[]): void {
  tx.delete(s.sessionPlayers).where(eq(s.sessionPlayers.sessionId, sessionId)).run();
  if (players.length === 0) return;
  tx.insert(s.sessionPlayers)
    .values(players.map((p) => ({ sessionId, ...p })))
    .run();
}

/** Upsert a full session (row + seats) by id. Used for undo and edits. */
export function writeSession(tx: Tx, fact: SessionFact): void {
  const { players, id, ...row } = fact;
  tx.insert(s.sessions)
    .values({ id, ...row })
    .onConflictDoUpdate({ target: s.sessions.id, set: row })
    .run();
  replaceSessionPlayers(tx, id, players);
}

export function insertAnnouncement(
  tx: Tx,
  value: { type: "result_reveal"; payload: { sessionId: number } } | { type: "milestone"; payload: { count: number } },
  createdAt: number,
): number {
  return tx
    .insert(s.announcements)
    .values({ type: value.type, payload: value.payload, createdAt })
    .returning({ id: s.announcements.id })
    .get().id;
}

export function milestoneExists(tx: Tx, count: number): boolean {
  return tx
    .select()
    .from(s.announcements)
    .where(eq(s.announcements.type, "milestone"))
    .all()
    .some((a) => a.payload.count === count);
}

export function insertAudit(
  tx: Tx,
  entry: { action: AuditAction; summary: string; before: SessionFact | null; after: SessionFact | null; at: number },
): number {
  return tx.insert(s.auditLog).values(entry).returning({ id: s.auditLog.id }).get().id;
}

export function lastUndoableAudit(tx: Tx): AuditEntry | null {
  return (
    tx
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.undone, false), inArray(s.auditLog.action, UNDOABLE_ACTIONS)))
      .orderBy(desc(s.auditLog.id))
      .get() ?? null
  );
}

export function markAuditUndone(tx: Tx, id: number): void {
  tx.update(s.auditLog).set({ undone: true }).where(eq(s.auditLog.id, id)).run();
}

export function deleteDemoData(tx: Tx): void {
  tx.delete(s.sessions).where(eq(s.sessions.isDemo, true)).run();
  const demoIds = tx
    .select({ id: s.players.id })
    .from(s.players)
    .where(eq(s.players.isDemo, true))
    .all()
    .map((p) => p.id);
  if (demoIds.length > 0) {
    tx.delete(s.sessionPlayers).where(inArray(s.sessionPlayers.playerId, demoIds)).run();
    tx.delete(s.players).where(inArray(s.players.id, demoIds)).run();
  }
}
```

- [ ] **Step 8: Write the base seed**

`src/server/seed/base.ts`:

```ts
import { eq } from "drizzle-orm";
import type { GameFact } from "@/domain/types";
import { hashPin, randomSecret } from "../auth/pin";
import type { Db } from "../db/client";
import * as s from "../db/schema";

export const BASE_GAMES: Array<Omit<GameFact, "id" | "active">> = [
  {
    slug: "uno",
    name: "Uno",
    family: "uno",
    descriptionEn: "Match colors and numbers. Empty your hand first.",
    descriptionRu: "Совпадайте цветом или числом и первым избавьтесь от карт.",
    icon: "Layers",
    category: "party",
    durationMin: 20,
    weight: 4,
    minPlayers: 2,
    maxPlayers: 10,
    allowTies: false,
  },
  {
    slug: "splendor",
    name: "Splendor",
    family: "splendor",
    descriptionEn: "Collect gems, buy developments, attract nobles.",
    descriptionRu: "Собирайте самоцветы, покупайте развития, привлекайте знать.",
    icon: "Gem",
    category: "engine",
    durationMin: 30,
    weight: 6,
    minPlayers: 2,
    maxPlayers: 4,
    allowTies: false,
  },
  {
    slug: "hitster",
    name: "Hitster",
    family: "hitster",
    descriptionEn: "Place songs on a timeline by release year.",
    descriptionRu: "Расставляйте песни на шкале времени по году выхода.",
    icon: "Music",
    category: "music",
    durationMin: 30,
    weight: 6,
    minPlayers: 2,
    maxPlayers: 10,
    allowTies: true,
  },
  {
    slug: "rats-race",
    name: "Rats Race",
    family: "rats-race",
    descriptionEn: "Escape the rat race: grow your income and break out first.",
    descriptionRu: "Выберитесь из крысиных бегов: наращивайте доход и вырвитесь первым.",
    icon: "Rat",
    category: "economic",
    durationMin: 60,
    weight: 7,
    minPlayers: 2,
    maxPlayers: 6,
    allowTies: false,
  },
  {
    slug: "citadels",
    name: "Citadels",
    family: "citadels",
    descriptionEn: "Pick secret roles and build the grandest city.",
    descriptionRu: "Выбирайте тайные роли и стройте самый великий город.",
    icon: "Castle",
    category: "bluffing",
    durationMin: 45,
    weight: 8,
    minPlayers: 2,
    maxPlayers: 8,
    allowTies: false,
  },
  {
    slug: "ticket-to-ride",
    name: "Ticket to Ride",
    family: "ticket-to-ride",
    descriptionEn: "Claim railway routes across the map.",
    descriptionRu: "Прокладывайте железнодорожные маршруты по карте.",
    icon: "TrainFront",
    category: "route",
    durationMin: 60,
    weight: 10,
    minPlayers: 2,
    maxPlayers: 5,
    allowTies: false,
  },
  {
    slug: "seven-wonders",
    name: "7 Wonders",
    family: "seven-wonders",
    descriptionEn: "Draft cards across three ages to build a civilization.",
    descriptionRu: "Разыгрывайте карты три эпохи и развивайте цивилизацию.",
    icon: "Landmark",
    category: "civilization",
    durationMin: 40,
    weight: 10,
    minPlayers: 3,
    maxPlayers: 7,
    allowTies: false,
  },
  {
    slug: "catan",
    name: "Catan",
    family: "catan",
    descriptionEn: "Trade resources, build roads and settlements.",
    descriptionRu: "Торгуйте ресурсами, стройте дороги и поселения.",
    icon: "Hexagon",
    category: "strategy",
    durationMin: 90,
    weight: 15,
    minPlayers: 3,
    maxPlayers: 4,
    allowTies: false,
  },
  {
    slug: "catan-expansion",
    name: "Catan + Expansion",
    family: "catan",
    descriptionEn: "Catan with an expansion: longer, larger, deeper.",
    descriptionRu: "Катан с дополнением: дольше, масштабнее, глубже.",
    icon: "Hexagon",
    category: "strategy",
    durationMin: 120,
    weight: 18,
    minPlayers: 3,
    maxPlayers: 6,
    allowTies: false,
  },
];

/** Idempotent: creates the event row, tables and missing games; never overwrites edits. */
export function seedBase(db: Db, opts: { adminPin: string; tableCount?: number }): void {
  db.transaction((tx) => {
    const existing = tx.select({ id: s.event.id }).from(s.event).where(eq(s.event.id, 1)).get();
    if (!existing) {
      tx.insert(s.event)
        .values({ id: 1, adminPinHash: hashPin(opts.adminPin), sessionSecret: randomSecret() })
        .run();
    }

    const tableCount = tx.select({ id: s.tables.id }).from(s.tables).all().length;
    if (tableCount === 0) {
      const count = opts.tableCount ?? 6;
      tx.insert(s.tables)
        .values(Array.from({ length: count }, (_, i) => ({ number: i + 1, label: null })))
        .run();
    }

    const slugs = new Set(tx.select({ slug: s.games.slug }).from(s.games).all().map((g) => g.slug));
    const missing = BASE_GAMES.filter((g) => !slugs.has(g.slug));
    if (missing.length > 0) tx.insert(s.games).values(missing).run();
  });
}
```

- [ ] **Step 9: Write the test DB helper**

`src/server/testDb.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db/client";
import { seedBase } from "./seed/base";

export function createTestDb(): { db: Db; file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-cup-"));
  const file = path.join(dir, "test.db");
  const db = openDb(file);
  seedBase(db, { adminPin: "1234", tableCount: 3 });
  return {
    db,
    file,
    cleanup: () => {
      db.$client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 10: Write repository tests**

`src/server/repo/repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestDb } from "../testDb";
import { seedBase } from "../seed/base";
import { getDataVersion, loadFacts, loadSession } from "./facts";
import {
  bumpVersion,
  deleteDemoData,
  insertAnnouncement,
  insertAudit,
  insertPlayer,
  insertSession,
  lastUndoableAudit,
  markAuditUndone,
  milestoneExists,
  writeSession,
} from "./writes";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

describe("base seed", () => {
  test("creates event, tables and games; is idempotent", () => {
    seedBase(ctx.db, { adminPin: "9999", tableCount: 10 });
    const facts = loadFacts(ctx.db);
    expect(facts.event.status).toBe("draft");
    expect(facts.event.scoring).toEqual({
      strategy: "bestN",
      bestN: 4,
      participationFloor: 0.2,
      jokerMultiplier: 1.5,
    });
    expect(facts.event.enabledScenes).toEqual(["title", "room", "recent", "counters"]);
    expect(facts.tables).toHaveLength(3);
    expect(facts.games).toHaveLength(9);
    expect(facts.games[0].slug).toBe("uno");
    expect(facts.games.find((g) => g.slug === "hitster")?.allowTies).toBe(true);
  });
});

describe("sessions round trip", () => {
  test("insert, load, upsert with seats", () => {
    const now = Date.now();
    const a = insertPlayer(ctx.db, { name: "Amy", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const b = insertPlayer(ctx.db, { name: "Bob", nickname: "B", color: "#fff", source: "checkin", createdAt: now });
    const id = insertSession(
      ctx.db,
      { tableId: 1, gameId: 1, status: "setup", createdAt: now, isDemo: false },
      [
        { playerId: b, seat: 1, jokerDeclared: false, placement: null },
        { playerId: a, seat: 0, jokerDeclared: true, placement: null },
      ],
    );
    const loaded = loadSession(ctx.db, id)!;
    expect(loaded.players.map((p) => p.playerId)).toEqual([a, b]);
    expect(loaded.players[0].jokerDeclared).toBe(true);

    writeSession(ctx.db, {
      ...loaded,
      status: "done",
      finishedAt: now + 1,
      players: loaded.players.map((p, i) => ({ ...p, placement: i + 1 })),
    });
    const facts = loadFacts(ctx.db);
    expect(facts.sessions[0].status).toBe("done");
    expect(facts.sessions[0].players.map((p) => p.placement)).toEqual([1, 2]);
  });
});

describe("version, announcements, audit, demo cleanup", () => {
  test("bumpVersion increments", () => {
    const v = getDataVersion(ctx.db);
    bumpVersion(ctx.db);
    expect(getDataVersion(ctx.db)).toBe(v + 1);
  });

  test("milestones and announcements load", () => {
    insertAnnouncement(ctx.db, { type: "milestone", payload: { count: 10 } }, 5);
    insertAnnouncement(ctx.db, { type: "result_reveal", payload: { sessionId: 3 } }, 6);
    expect(milestoneExists(ctx.db, 10)).toBe(true);
    expect(milestoneExists(ctx.db, 25)).toBe(false);
    expect(loadFacts(ctx.db).announcements.map((a) => a.type)).toEqual(["result_reveal", "milestone"]);
  });

  test("lastUndoableAudit skips undone and non-undoable entries", () => {
    const first = insertAudit(ctx.db, { action: "result.create", summary: "a", before: null, after: null, at: 1 });
    insertAudit(ctx.db, { action: "player.merge", summary: "b", before: null, after: null, at: 2 });
    const third = insertAudit(ctx.db, { action: "result.delete", summary: "c", before: null, after: null, at: 3 });
    expect(lastUndoableAudit(ctx.db)?.id).toBe(third);
    markAuditUndone(ctx.db, third);
    expect(lastUndoableAudit(ctx.db)?.id).toBe(first);
  });

  test("deleteDemoData removes demo players and sessions only", () => {
    const now = Date.now();
    const real = insertPlayer(ctx.db, { name: "Real", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const demo = insertPlayer(ctx.db, { name: "Demo", nickname: null, color: "#fff", source: "admin", isDemo: true, createdAt: now });
    insertSession(ctx.db, { gameId: 1, status: "done", createdAt: now, isDemo: true }, [
      { playerId: demo, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: real, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    insertSession(ctx.db, { gameId: 1, status: "setup", createdAt: now, isDemo: false }, [
      { playerId: demo, seat: 0, jokerDeclared: false, placement: null },
      { playerId: real, seat: 1, jokerDeclared: false, placement: null },
    ]);
    deleteDemoData(ctx.db);
    const facts = loadFacts(ctx.db);
    expect(facts.players.map((p) => p.name)).toEqual(["Real"]);
    expect(facts.sessions).toHaveLength(1);
    expect(facts.sessions[0].players.map((p) => p.playerId)).toEqual([real]);
  });
});
```

- [ ] **Step 11: Run tests**

Run: `npx vitest run src/server`
Expected: PASS (pin + repo). If `db.transaction` complains about a returned promise, make sure no callback is `async`.

- [ ] **Step 12: Commit**

```bash
git add drizzle src/server src/domain/types.ts
git commit -m "feat(server): add SQLite schema, migrations, repository, PIN hashing and base seed"
```

### Task 6: Core services — transactions, event lifecycle, settings, players, catalog

**Files:**
- Create: `src/server/services/errors.ts`, `src/server/services/mutate.ts`, `src/server/services/event.ts`, `src/server/services/players.ts`, `src/server/services/catalog.ts`
- Test: `src/server/services/core.test.ts`

**Interfaces:**
- Consumes: `Db`, `Tx` (Task 5); repo functions (Task 5); `verifyPin`, `hashPin` (Task 5); `colorForIndex`, `normalizeName`, `parseBulkNames` (Task 4); `ALL_SCENES`, `SceneId`, `Lang`, `ScoringStrategy` (Task 2); `isOpenSession` (Task 4)
- Produces:
  - `type ErrorCode` (union below), `class ServiceError extends Error { code: ErrorCode }`
  - `mutate<T>(db: Db, fn: (tx: Tx) => T, opts?: { allowWhenFinished?: boolean }): T`
  - event: `goLive(db, opts: { clearDemo: boolean }): void`, `finishEvent(db): void`, `reopenEvent(db): void`, `updateScoring(db, patch: ScoringPatch): void`, `updateScreenSettings(db, patch: ScreenPatch): void`, `updateEventInfo(db, patch: EventInfoPatch): void`, `screenCommand(db, command: "pause" | "resume" | "skip"): void`, `changePin(db, input: { current: string; next: string }): void`, `clearDemoData(db): void`
  - players: `addPlayer(db, input: { name: string; nickname?: string | null; source?: PlayerSource }): number`, `bulkAddPlayers(db, text: string): number[]`, `updatePlayer(db, id: number, patch: PlayerPatch): void`, `mergePlayers(db, input: { keepId: number; removeId: number }): void`, `checkIn(db, input: { name: string; nickname?: string | null }): number`
  - catalog: `updateGame(db, id: number, patch: GamePatch): void`, `addTable(db, label?: string | null): number`, `updateTable(db, id: number, patch: { label?: string | null; active?: boolean }): void`, `removeTable(db, id: number): "deleted" | "deactivated"`

- [ ] **Step 1: Write errors and mutate**

`src/server/services/errors.ts`:

```ts
export type ErrorCode =
  | "event_finished"
  | "not_found"
  | "invalid_name"
  | "invalid_value"
  | "invalid_status"
  | "player_busy"
  | "table_busy"
  | "table_in_use"
  | "joker_used"
  | "too_few_players"
  | "too_many_players"
  | "invalid_placements"
  | "ties_not_allowed"
  | "merge_conflict"
  | "nothing_to_undo"
  | "undo_conflict"
  | "open_sessions"
  | "wrong_pin";

export class ServiceError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
```

`src/server/services/mutate.ts`:

```ts
import type { Db, Tx } from "../db/client";
import { getEventRow } from "../repo/facts";
import { bumpVersion } from "../repo/writes";
import { ServiceError } from "./errors";

/**
 * Runs a synchronous transaction, rejects writes on a finished event (unless allowed)
 * and bumps the data version so every polling client refreshes.
 */
export function mutate<T>(db: Db, fn: (tx: Tx) => T, opts: { allowWhenFinished?: boolean } = {}): T {
  return db.transaction((tx) => {
    if (!opts.allowWhenFinished && getEventRow(tx).status === "finished") {
      throw new ServiceError("event_finished");
    }
    const result = fn(tx);
    bumpVersion(tx);
    return result;
  });
}
```

- [ ] **Step 2: Write failing core service tests**

`src/server/services/core.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { verifyPin } from "../auth/pin";
import { getDataVersion, loadFacts, loadSecrets } from "../repo/facts";
import { insertPlayer, insertSession } from "../repo/writes";
import { createTestDb } from "../testDb";
import { addTable, removeTable, updateGame, updateTable } from "./catalog";
import { ServiceError } from "./errors";
import {
  changePin,
  clearDemoData,
  finishEvent,
  goLive,
  reopenEvent,
  screenCommand,
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/server/services/core.test.ts`
Expected: FAIL — missing modules `./event`, `./players`, `./catalog`.

- [ ] **Step 4: Implement event service**

`src/server/services/event.ts`:

```ts
import { ALL_SCENES, type Lang, type SceneId, type ScoringStrategy } from "@/domain/types";
import { isOpenSession } from "@/domain/tables";
import { hashPin, verifyPin } from "../auth/pin";
import type { Db } from "../db/client";
import { getEventRow, loadFacts } from "../repo/facts";
import { deleteDemoData, updateEventRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface ScoringPatch {
  strategy?: ScoringStrategy;
  bestN?: number;
  participationFloor?: number;
  jokerMultiplier?: number;
}

export interface ScreenPatch {
  sceneDurationSec?: number;
  enabledScenes?: SceneId[];
  showPointsInReveals?: boolean;
  screenLang?: Lang;
}

export interface EventInfoPatch {
  name?: string;
  city?: string;
  year?: number;
  accentColor?: string;
  publicBaseUrl?: string | null;
}

function check(condition: boolean): void {
  if (!condition) throw new ServiceError("invalid_value");
}

export function goLive(db: Db, opts: { clearDemo: boolean }): void {
  mutate(db, (tx) => {
    if (getEventRow(tx).status !== "draft") throw new ServiceError("invalid_status");
    if (opts.clearDemo) deleteDemoData(tx);
    updateEventRow(tx, { status: "live", startedAt: Date.now(), finishedAt: null });
  });
}

export function finishEvent(db: Db): void {
  mutate(db, (tx) => {
    if (getEventRow(tx).status !== "live") throw new ServiceError("invalid_status");
    if (loadFacts(tx).sessions.some(isOpenSession)) throw new ServiceError("open_sessions");
    updateEventRow(tx, { status: "finished", finishedAt: Date.now() });
  });
}

export function reopenEvent(db: Db): void {
  mutate(
    db,
    (tx) => {
      const row = getEventRow(tx);
      if (row.status !== "finished") throw new ServiceError("invalid_status");
      updateEventRow(tx, {
        status: "live",
        finishedAt: null,
        finaleRevealed: false,
        screenControl: { ...row.screenControl, finaleStep: 0 },
      });
    },
    { allowWhenFinished: true },
  );
}

export function updateScoring(db: Db, patch: ScoringPatch): void {
  if (patch.strategy !== undefined) check(patch.strategy === "total" || patch.strategy === "bestN");
  if (patch.bestN !== undefined) check(Number.isInteger(patch.bestN) && patch.bestN >= 1 && patch.bestN <= 50);
  if (patch.participationFloor !== undefined) {
    check(patch.participationFloor >= 0 && patch.participationFloor <= 0.5);
  }
  if (patch.jokerMultiplier !== undefined) check(patch.jokerMultiplier >= 1 && patch.jokerMultiplier <= 3);
  mutate(
    db,
    (tx) =>
      updateEventRow(tx, {
        scoringStrategy: patch.strategy,
        bestN: patch.bestN,
        participationFloor: patch.participationFloor,
        jokerMultiplier: patch.jokerMultiplier,
      }),
    { allowWhenFinished: true },
  );
}

export function updateScreenSettings(db: Db, patch: ScreenPatch): void {
  if (patch.sceneDurationSec !== undefined) {
    check(Number.isInteger(patch.sceneDurationSec) && patch.sceneDurationSec >= 5 && patch.sceneDurationSec <= 120);
  }
  if (patch.enabledScenes !== undefined) {
    check(patch.enabledScenes.length > 0 && patch.enabledScenes.every((scene) => ALL_SCENES.includes(scene)));
  }
  if (patch.screenLang !== undefined) check(patch.screenLang === "en" || patch.screenLang === "ru");
  mutate(db, (tx) => updateEventRow(tx, patch), { allowWhenFinished: true });
}

export function updateEventInfo(db: Db, patch: EventInfoPatch): void {
  const next: EventInfoPatch = {};
  if (patch.name !== undefined) {
    next.name = patch.name.trim();
    check(next.name.length > 0 && next.name.length <= 60);
  }
  if (patch.city !== undefined) {
    next.city = patch.city.trim();
    check(next.city.length > 0 && next.city.length <= 60);
  }
  if (patch.year !== undefined) {
    check(Number.isInteger(patch.year) && patch.year >= 2000 && patch.year <= 2100);
    next.year = patch.year;
  }
  if (patch.accentColor !== undefined) {
    check(/^#[0-9a-f]{6}$/i.test(patch.accentColor));
    next.accentColor = patch.accentColor.toLowerCase();
  }
  if (patch.publicBaseUrl !== undefined) {
    if (patch.publicBaseUrl === null || patch.publicBaseUrl.trim() === "") {
      next.publicBaseUrl = null;
    } else {
      const url = patch.publicBaseUrl.trim().replace(/\/+$/, "");
      check(/^https?:\/\/[^\s/]+(:\d+)?$/.test(url));
      next.publicBaseUrl = url;
    }
  }
  mutate(db, (tx) => updateEventRow(tx, next), { allowWhenFinished: true });
}

export function screenCommand(db: Db, command: "pause" | "resume" | "skip"): void {
  mutate(
    db,
    (tx) => {
      const control = getEventRow(tx).screenControl;
      const next =
        command === "skip"
          ? { ...control, skipNonce: control.skipNonce + 1 }
          : { ...control, paused: command === "pause" };
      updateEventRow(tx, { screenControl: next });
    },
    { allowWhenFinished: true },
  );
}

export function changePin(db: Db, input: { current: string; next: string }): void {
  mutate(
    db,
    (tx) => {
      if (!verifyPin(input.current, getEventRow(tx).adminPinHash)) throw new ServiceError("wrong_pin");
      check(/^\d{4,8}$/.test(input.next));
      updateEventRow(tx, { adminPinHash: hashPin(input.next) });
    },
    { allowWhenFinished: true },
  );
}

export function clearDemoData(db: Db): void {
  mutate(db, (tx) => deleteDemoData(tx));
}
```

- [ ] **Step 5: Implement player service**

`src/server/services/players.ts`:

```ts
import { colorForIndex, normalizeName, parseBulkNames } from "@/domain/players";
import type { PlayerSource } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deletePlayerRow,
  insertAudit,
  insertPlayer,
  reassignPlayerSeats,
  replaceSessionPlayers,
  updatePlayerRow,
} from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface PlayerPatch {
  name?: string;
  nickname?: string | null;
  color?: string;
  active?: boolean;
}

function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length === 0 || value.length > 40) throw new ServiceError("invalid_name");
  return value;
}

function cleanNickname(nickname: string | null | undefined): string | null {
  const value = nickname?.trim().replace(/\s+/g, " ") ?? "";
  if (value.length > 24) throw new ServiceError("invalid_name");
  return value.length > 0 ? value : null;
}

function createPlayer(tx: Tx, name: string, nickname: string | null, source: PlayerSource): number {
  const count = loadFacts(tx).players.length;
  return insertPlayer(tx, { name, nickname, color: colorForIndex(count), source, createdAt: Date.now() });
}

export function addPlayer(
  db: Db,
  input: { name: string; nickname?: string | null; source?: PlayerSource },
): number {
  const name = cleanName(input.name);
  const nickname = cleanNickname(input.nickname);
  return mutate(db, (tx) => createPlayer(tx, name, nickname, input.source ?? "admin"));
}

export function bulkAddPlayers(db: Db, text: string): number[] {
  const names = parseBulkNames(text).map(cleanName);
  return mutate(db, (tx) => {
    const existing = new Set(loadFacts(tx).players.map((p) => normalizeName(p.name)));
    return names
      .filter((name) => !existing.has(normalizeName(name)))
      .map((name) => createPlayer(tx, name, null, "admin"));
  });
}

export function checkIn(db: Db, input: { name: string; nickname?: string | null }): number {
  return addPlayer(db, { ...input, source: "checkin" });
}

export function updatePlayer(db: Db, id: number, patch: PlayerPatch): void {
  const next: PlayerPatch = {};
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.nickname !== undefined) next.nickname = cleanNickname(patch.nickname);
  if (patch.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new ServiceError("invalid_value");
    next.color = patch.color;
  }
  if (patch.active !== undefined) next.active = patch.active;
  mutate(db, (tx) => {
    if (!loadFacts(tx).players.some((p) => p.id === id)) throw new ServiceError("not_found");
    updatePlayerRow(tx, id, next);
  });
}

export function mergePlayers(db: Db, input: { keepId: number; removeId: number }): void {
  if (input.keepId === input.removeId) throw new ServiceError("invalid_value");
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const keep = facts.players.find((p) => p.id === input.keepId);
    const remove = facts.players.find((p) => p.id === input.removeId);
    if (!keep || !remove) throw new ServiceError("not_found");

    const live = facts.sessions.filter((s) => s.status !== "cancelled");
    const sharedSession = live.some(
      (s) => s.players.some((p) => p.playerId === keep.id) && s.players.some((p) => p.playerId === remove.id),
    );
    const usedJoker = (playerId: number) =>
      live.some((s) => s.players.some((p) => p.playerId === playerId && p.jokerDeclared));
    if (sharedSession || (usedJoker(keep.id) && usedJoker(remove.id))) {
      throw new ServiceError("merge_conflict");
    }

    // Cancelled sessions may seat both players; drop the duplicate seat so the reassign keeps the primary key valid.
    for (const session of facts.sessions.filter((x) => x.status === "cancelled")) {
      if (session.players.some((p) => p.playerId === keep.id) && session.players.some((p) => p.playerId === remove.id)) {
        replaceSessionPlayers(tx, session.id, session.players.filter((p) => p.playerId !== remove.id));
      }
    }

    reassignPlayerSeats(tx, remove.id, keep.id);
    deletePlayerRow(tx, remove.id);
    insertAudit(tx, {
      action: "player.merge",
      summary: `${remove.name} merged into ${keep.name}`,
      before: null,
      after: null,
      at: Date.now(),
    });
  });
}
```

- [ ] **Step 6: Implement catalog service**

`src/server/services/catalog.ts`:

```ts
import { isOpenSession } from "@/domain/tables";
import type { Db } from "../db/client";
import { loadFacts } from "../repo/facts";
import { deleteTableRow, insertTable, tableHasSessions, updateGameRow, updateTableRow } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface GamePatch {
  name?: string;
  weight?: number;
  minPlayers?: number;
  maxPlayers?: number;
  durationMin?: number;
  allowTies?: boolean;
  active?: boolean;
  descriptionEn?: string;
  descriptionRu?: string;
  icon?: string;
  category?: string;
}

const invalid = () => new ServiceError("invalid_value");

export function updateGame(db: Db, id: number, patch: GamePatch): void {
  mutate(db, (tx) => {
    const game = loadFacts(tx).games.find((g) => g.id === id);
    if (!game) throw new ServiceError("not_found");
    const next = { ...game, ...patch };
    if (!(next.weight > 0 && next.weight <= 100)) throw invalid();
    if (!Number.isInteger(next.minPlayers) || next.minPlayers < 2) throw invalid();
    if (!Number.isInteger(next.maxPlayers) || next.maxPlayers < next.minPlayers || next.maxPlayers > 20) throw invalid();
    if (!Number.isInteger(next.durationMin) || next.durationMin < 1 || next.durationMin > 600) throw invalid();
    if (next.name.trim().length === 0) throw invalid();
    updateGameRow(tx, id, { ...patch, name: patch.name?.trim() });
  });
}

export function addTable(db: Db, label: string | null = null): number {
  return mutate(db, (tx) => {
    const numbers = loadFacts(tx).tables.map((t) => t.number);
    const number = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return insertTable(tx, { number, label: label?.trim() || null });
  });
}

function hasOpenSession(db: Parameters<typeof loadFacts>[0], tableId: number): boolean {
  return loadFacts(db).sessions.some((s) => s.tableId === tableId && isOpenSession(s));
}

export function updateTable(db: Db, id: number, patch: { label?: string | null; active?: boolean }): void {
  mutate(db, (tx) => {
    if (!loadFacts(tx).tables.some((t) => t.id === id)) throw new ServiceError("not_found");
    if (patch.active === false && hasOpenSession(tx, id)) throw new ServiceError("table_in_use");
    updateTableRow(tx, id, {
      label: patch.label === undefined ? undefined : patch.label?.trim() || null,
      active: patch.active,
    });
  });
}

export function removeTable(db: Db, id: number): "deleted" | "deactivated" {
  return mutate(db, (tx) => {
    if (!loadFacts(tx).tables.some((t) => t.id === id)) throw new ServiceError("not_found");
    if (hasOpenSession(tx, id)) throw new ServiceError("table_in_use");
    if (tableHasSessions(tx, id)) {
      updateTableRow(tx, id, { active: false });
      return "deactivated";
    }
    deleteTableRow(tx, id);
    return "deleted";
  });
}
```

- [ ] **Step 7: Run core service tests**

Run: `npx vitest run src/server/services/core.test.ts`
Expected: PASS.

Note the table `removeTable` test inserts a `done` session with no seats on table 2 to mark it as used; that is valid at the repo level.

- [ ] **Step 8: Commit**

```bash
git add src/server/services
git commit -m "feat(services): add transactional mutations, event lifecycle, settings, players and catalog"
```

### Task 7: Sessions and results service — seating, results, corrections, undo, announcements

**Files:**
- Create: `src/server/services/sessions.ts`
- Test: `src/server/services/sessions.test.ts`

**Interfaces:**
- Consumes: `mutate`, `ServiceError` (Task 6); repo reads/writes (Task 5); `validatePlacements` (Task 2); `isOpenSession` (Task 4); `MILESTONES`, `SessionFact`, `AuditAction`, `Facts`, `GameFact` (Task 2); `addPlayer`, `goLive`, `finishEvent` (Task 6, tests only)
- Produces:
  - `interface SeatInput { playerId: number; jokerDeclared: boolean }`
  - `interface PlacementEntry { playerId: number; placement: number }`
  - `interface DirectPlacement extends PlacementEntry { jokerDeclared: boolean }`
  - `seatTable(db, input: { tableId: number; gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean }): number`
  - `updateSeating(db, sessionId: number, input: { gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean }): void`
  - `startSession(db, sessionId: number): void`
  - `finishSession(db, sessionId: number): void`
  - `resumeSession(db, sessionId: number): void`
  - `cancelSession(db, sessionId: number): void`
  - `recordResult(db, input: { sessionId: number; placements: PlacementEntry[] }): void`
  - `recordDirectResult(db, input: { gameId: number; tableId: number | null; placements: DirectPlacement[] }): number`
  - `editResult(db, input: { sessionId: number; gameId: number; tableId: number | null; placements: DirectPlacement[] }): void`
  - `deleteResult(db, sessionId: number): void`
  - `correctJoker(db, input: { sessionId: number; playerId: number; jokerDeclared: boolean }): void`
  - `undoLast(db): { action: AuditAction; summary: string }`
  - `showOnScreen(db, sessionId: number): void`
  - `replayLastReveal(db): void`

- [ ] **Step 1: Write failing session service tests**

`src/server/services/sessions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isOpenSession } from "@/domain/tables";
import { listAudit, loadFacts } from "../repo/facts";
import { createTestDb } from "../testDb";
import { ServiceError } from "./errors";
import { finishEvent, goLive } from "./event";
import { addPlayer, updatePlayer } from "./players";
import {
  cancelSession,
  correctJoker,
  deleteResult,
  editResult,
  finishSession,
  recordDirectResult,
  recordResult,
  replayLastReveal,
  resumeSession,
  seatTable,
  showOnScreen,
  startSession,
  undoLast,
  updateSeating,
} from "./sessions";

let ctx: ReturnType<typeof createTestDb>;
let p: Record<"amy" | "bob" | "cat" | "dan" | "eve", number>;
let g: Record<"catan" | "hitster" | "splendor", number>;

beforeEach(() => {
  ctx = createTestDb();
  goLive(ctx.db, { clearDemo: false });
  p = {
    amy: addPlayer(ctx.db, { name: "Amy" }),
    bob: addPlayer(ctx.db, { name: "Bob" }),
    cat: addPlayer(ctx.db, { name: "Cat" }),
    dan: addPlayer(ctx.db, { name: "Dan" }),
    eve: addPlayer(ctx.db, { name: "Eve" }),
  };
  const games = loadFacts(ctx.db).games;
  const id = (slug: string) => games.find((x) => x.slug === slug)!.id;
  g = { catan: id("catan"), hitster: id("hitster"), splendor: id("splendor") };
});
afterEach(() => ctx.cleanup());

const facts = () => loadFacts(ctx.db);
const session = (id: number) => facts().sessions.find((s) => s.id === id);
const seats = (...ids: number[]) => ids.map((playerId) => ({ playerId, jokerDeclared: false }));

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

function playFullGame(tableId = 1) {
  const id = seatTable(ctx.db, { tableId, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
  startSession(ctx.db, id);
  finishSession(ctx.db, id);
  recordResult(ctx.db, {
    sessionId: id,
    placements: [
      { playerId: p.bob, placement: 1 },
      { playerId: p.amy, placement: 2 },
      { playerId: p.cat, placement: 3 },
    ],
  });
  return id;
}

describe("table flow", () => {
  test("seat -> start -> finish -> record frees the table and audits", () => {
    const id = playFullGame();
    const s = session(id)!;
    expect(s.status).toBe("done");
    expect(s.startedAt).not.toBeNull();
    expect(s.finishedAt).toBeGreaterThanOrEqual(s.startedAt!);
    expect(s.players.map((x) => [x.playerId, x.placement])).toEqual([
      [p.amy, 2],
      [p.bob, 1],
      [p.cat, 3],
    ]);
    expect(facts().sessions.filter(isOpenSession)).toEqual([]);
    expect(listAudit(ctx.db)[0]).toMatchObject({ action: "result.create", after: { id, status: "done" } });
  });

  test("record straight from playing sets finishedAt", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
        { playerId: p.cat, placement: 3 },
      ],
    });
    expect(session(id)?.finishedAt).not.toBeNull();
  });

  test("resume undoes an accidental finish", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    finishSession(ctx.db, id);
    resumeSession(ctx.db, id);
    expect(session(id)).toMatchObject({ status: "playing", finishedAt: null });
  });

  test("status guards", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy) });
    expectCode(() => finishSession(ctx.db, id), "invalid_status");
    expectCode(() => startSession(ctx.db, id), "too_few_players");
    expectCode(() => recordResult(ctx.db, { sessionId: id, placements: [] }), "invalid_status");
    expectCode(() => startSession(ctx.db, 999), "not_found");
  });

  test("record removes seated players who are not placed", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat, p.dan) });
    startSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
      ],
    });
    expect(session(id)?.players.map((x) => x.playerId)).toEqual([p.amy, p.bob]);
  });

  test("placement validation respects allowTies", () => {
    const catan = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, catan);
    const tie = [
      { playerId: p.amy, placement: 1 },
      { playerId: p.bob, placement: 1 },
      { playerId: p.cat, placement: 3 },
    ];
    expectCode(() => recordResult(ctx.db, { sessionId: catan, placements: tie }), "ties_not_allowed");
    expectCode(
      () => recordResult(ctx.db, { sessionId: catan, placements: [{ playerId: p.eve, placement: 1 }, { playerId: p.amy, placement: 2 }] }),
      "invalid_placements",
    );

    const hitster = seatTable(ctx.db, { tableId: 2, gameId: g.hitster, players: seats(p.dan, p.eve) });
    startSession(ctx.db, hitster);
    recordResult(ctx.db, {
      sessionId: hitster,
      placements: [
        { playerId: p.dan, placement: 1 },
        { playerId: p.eve, placement: 1 },
      ],
    });
    expect(session(hitster)?.status).toBe("done");
  });

  test("cancel frees table and joker", () => {
    const id = seatTable(ctx.db, {
      tableId: 1,
      gameId: g.catan,
      players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob)],
    });
    cancelSession(ctx.db, id);
    expect(session(id)?.status).toBe("cancelled");
    const again = seatTable(ctx.db, {
      tableId: 1,
      gameId: g.catan,
      players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob)],
    });
    expect(again).toBeGreaterThan(id);
  });
});

describe("seating rules", () => {
  test("too many players for the game", () => {
    expectCode(
      () => seatTable(ctx.db, { tableId: 1, gameId: g.splendor, players: seats(p.amy, p.bob, p.cat, p.dan, p.eve) }),
      "too_many_players",
    );
  });

  test("table busy and player busy", () => {
    seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    expectCode(() => seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.cat) }), "table_busy");
    expectCode(() => seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.cat) }), "player_busy");
  });

  test("moveFromOtherTables pulls players out of a setup table but not a playing one", () => {
    const first = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.cat), moveFromOtherTables: true });
    expect(session(first)?.players.map((x) => x.playerId)).toEqual([p.bob]);

    const playing = seatTable(ctx.db, { tableId: 3, gameId: g.catan, players: seats(p.dan, p.eve) });
    startSession(ctx.db, playing);
    expectCode(
      () => updateSeating(ctx.db, first, { gameId: g.catan, players: seats(p.bob, p.dan), moveFromOtherTables: true }),
      "player_busy",
    );
  });

  test("joker can be used only once across the event", () => {
    playFullGameWithJoker();
    expectCode(
      () =>
        seatTable(ctx.db, {
          tableId: 2,
          gameId: g.catan,
          players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.dan)],
        }),
      "joker_used",
    );
  });

  test("inactive players and games cannot be seated", () => {
    updatePlayer(ctx.db, p.eve, { active: false });
    expectCode(() => seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.eve, p.amy) }), "invalid_value");
  });

  test("updateSeating edits a setup session only", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    updateSeating(ctx.db, id, {
      gameId: g.hitster,
      players: [{ playerId: p.cat, jokerDeclared: true }, ...seats(p.amy)],
      notes: "near window",
    });
    expect(session(id)).toMatchObject({ gameId: g.hitster, notes: "near window" });
    expect(session(id)?.players.map((x) => [x.playerId, x.seat, x.jokerDeclared])).toEqual([
      [p.cat, 0, true],
      [p.amy, 1, false],
    ]);
    startSession(ctx.db, id);
    expectCode(() => updateSeating(ctx.db, id, { gameId: g.catan, players: seats(p.amy, p.bob) }), "invalid_status");
  });
});

function playFullGameWithJoker() {
  const id = seatTable(ctx.db, {
    tableId: 1,
    gameId: g.catan,
    players: [{ playerId: p.amy, jokerDeclared: true }, ...seats(p.bob, p.cat)],
  });
  startSession(ctx.db, id);
  recordResult(ctx.db, {
    sessionId: id,
    placements: [
      { playerId: p.amy, placement: 1 },
      { playerId: p.bob, placement: 2 },
      { playerId: p.cat, placement: 3 },
    ],
  });
  return id;
}

describe("direct results, edits, deletes, jokers", () => {
  test("direct result has no duration and checks jokers", () => {
    const id = recordDirectResult(ctx.db, {
      gameId: g.catan,
      tableId: null,
      placements: [
        { playerId: p.amy, placement: 1, jokerDeclared: true },
        { playerId: p.bob, placement: 2, jokerDeclared: false },
        { playerId: p.cat, placement: 3, jokerDeclared: false },
      ],
    });
    const s = session(id)!;
    expect(s).toMatchObject({ status: "done", tableId: null });
    expect(s.startedAt).toBe(s.finishedAt);
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: true },
            { playerId: p.dan, placement: 2, jokerDeclared: false },
          ],
        }),
      "joker_used",
    );
  });

  test("direct result rejects a player who is seated at an open table", () => {
    seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob) });
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: false },
            { playerId: p.cat, placement: 2, jokerDeclared: false },
          ],
        }),
      "player_busy",
    );
  });

  test("edit result changes placements and jokers", () => {
    const id = playFullGame();
    editResult(ctx.db, {
      sessionId: id,
      gameId: g.hitster,
      tableId: 2,
      placements: [
        { playerId: p.cat, placement: 1, jokerDeclared: true },
        { playerId: p.amy, placement: 2, jokerDeclared: false },
      ],
    });
    const s = session(id)!;
    expect(s).toMatchObject({ gameId: g.hitster, tableId: 2, status: "done" });
    expect(s.players.map((x) => [x.playerId, x.placement, x.jokerDeclared])).toEqual([
      [p.cat, 1, true],
      [p.amy, 2, false],
    ]);
    expect(listAudit(ctx.db)[0].action).toBe("result.update");
  });

  test("correct joker on a playing session", () => {
    playFullGameWithJoker();
    const id = seatTable(ctx.db, { tableId: 2, gameId: g.catan, players: seats(p.amy, p.dan) });
    startSession(ctx.db, id);
    correctJoker(ctx.db, { sessionId: id, playerId: p.dan, jokerDeclared: true });
    expect(session(id)?.players.find((x) => x.playerId === p.dan)?.jokerDeclared).toBe(true);
    expectCode(() => correctJoker(ctx.db, { sessionId: id, playerId: p.amy, jokerDeclared: true }), "joker_used");
    expectCode(() => correctJoker(ctx.db, { sessionId: id, playerId: p.eve, jokerDeclared: true }), "not_found");
  });
});

describe("undo", () => {
  test("create -> edit -> delete, then undo three times restores each prior state", () => {
    const id = seatTable(ctx.db, { tableId: 1, gameId: g.catan, players: seats(p.amy, p.bob, p.cat) });
    startSession(ctx.db, id);
    finishSession(ctx.db, id);
    recordResult(ctx.db, {
      sessionId: id,
      placements: [
        { playerId: p.amy, placement: 1 },
        { playerId: p.bob, placement: 2 },
        { playerId: p.cat, placement: 3 },
      ],
    });
    editResult(ctx.db, {
      sessionId: id,
      gameId: g.catan,
      tableId: 1,
      placements: [
        { playerId: p.amy, placement: 3, jokerDeclared: false },
        { playerId: p.bob, placement: 1, jokerDeclared: false },
        { playerId: p.cat, placement: 2, jokerDeclared: false },
      ],
    });
    deleteResult(ctx.db, id);
    expect(session(id)).toBeUndefined();

    expect(undoLast(ctx.db).action).toBe("result.delete");
    expect(session(id)?.players.find((x) => x.playerId === p.bob)?.placement).toBe(1);

    expect(undoLast(ctx.db).action).toBe("result.update");
    expect(session(id)?.players.find((x) => x.playerId === p.amy)?.placement).toBe(1);

    expect(undoLast(ctx.db).action).toBe("result.create");
    expect(session(id)).toMatchObject({ status: "pending" });
    expect(session(id)?.players.every((x) => x.placement === null)).toBe(true);

    expectCode(() => undoLast(ctx.db), "nothing_to_undo");
    expect(listAudit(ctx.db)[0].action).toBe("undo");
  });

  test("undo of a direct result deletes it", () => {
    const id = recordDirectResult(ctx.db, {
      gameId: g.catan,
      tableId: null,
      placements: [
        { playerId: p.amy, placement: 1, jokerDeclared: false },
        { playerId: p.bob, placement: 2, jokerDeclared: false },
      ],
    });
    undoLast(ctx.db);
    expect(session(id)).toBeUndefined();
  });

  test("undo conflicts when the table was reused", () => {
    playFullGame(1);
    seatTable(ctx.db, { tableId: 1, gameId: g.hitster, players: seats(p.dan, p.eve) });
    expectCode(() => undoLast(ctx.db), "undo_conflict");
  });
});

describe("announcements and event state", () => {
  test("show on screen and replay last reveal", () => {
    const id = playFullGame();
    showOnScreen(ctx.db, id);
    replayLastReveal(ctx.db);
    expect(facts().announcements.map((a) => a.type)).toEqual(["result_reveal", "result_reveal"]);
    expectCode(() => showOnScreen(ctx.db, 999), "not_found");
  });

  test("milestone announced at 10 completed results", () => {
    for (let i = 0; i < 10; i++) {
      recordDirectResult(ctx.db, {
        gameId: g.hitster,
        tableId: null,
        placements: [
          { playerId: p.dan, placement: 1, jokerDeclared: false },
          { playerId: p.eve, placement: 2, jokerDeclared: false },
        ],
      });
    }
    const milestones = facts().announcements.filter((a) => a.type === "milestone");
    expect(milestones).toHaveLength(1);
    expect(milestones[0].payload).toEqual({ count: 10 });
  });

  test("finished event blocks results but allows show on screen", () => {
    const id = playFullGame();
    finishEvent(ctx.db);
    expectCode(
      () =>
        recordDirectResult(ctx.db, {
          gameId: g.catan,
          tableId: null,
          placements: [
            { playerId: p.amy, placement: 1, jokerDeclared: false },
            { playerId: p.bob, placement: 2, jokerDeclared: false },
          ],
        }),
      "event_finished",
    );
    showOnScreen(ctx.db, id);
    expect(facts().announcements).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/services/sessions.test.ts`
Expected: FAIL — cannot resolve `./sessions`.

- [ ] **Step 3: Implement the sessions service**

`src/server/services/sessions.ts`:

```ts
import { validatePlacements } from "@/domain/scoring";
import { isOpenSession } from "@/domain/tables";
import { MILESTONES, type AuditAction, type Facts, type GameFact, type SessionFact } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deleteSessionRow,
  insertAnnouncement,
  insertAudit,
  insertSession,
  lastUndoableAudit,
  markAuditUndone,
  milestoneExists,
  replaceSessionPlayers,
  updateSessionRow,
  writeSession,
} from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface SeatInput {
  playerId: number;
  jokerDeclared: boolean;
}

export interface PlacementEntry {
  playerId: number;
  placement: number;
}

export interface DirectPlacement extends PlacementEntry {
  jokerDeclared: boolean;
}

const fail = (code: ConstructorParameters<typeof ServiceError>[0]): never => {
  throw new ServiceError(code);
};

function requireSession(facts: Facts, id: number): SessionFact {
  return facts.sessions.find((s) => s.id === id) ?? fail("not_found");
}

function requireGame(facts: Facts, id: number, mustBeActive: boolean): GameFact {
  const game = facts.games.find((g) => g.id === id) ?? fail("not_found");
  if (mustBeActive && !game.active) fail("invalid_value");
  return game;
}

function requireTable(facts: Facts, id: number, mustBeActive: boolean): void {
  const table = facts.tables.find((t) => t.id === id) ?? fail("not_found");
  if (mustBeActive && !table.active) fail("invalid_value");
}

function requirePlayers(facts: Facts, ids: number[], mustBeActive: boolean): void {
  if (new Set(ids).size !== ids.length) fail("invalid_value");
  for (const id of ids) {
    const player = facts.players.find((p) => p.id === id) ?? fail("not_found");
    if (mustBeActive && !player.active) fail("invalid_value");
  }
}

function requireStatus(session: SessionFact, ...allowed: SessionFact["status"][]): void {
  if (!allowed.includes(session.status)) fail("invalid_status");
}

function assertJokersAvailable(facts: Facts, entries: SeatInput[], excludeSessionId?: number): void {
  for (const entry of entries.filter((e) => e.jokerDeclared)) {
    const usedElsewhere = facts.sessions.some(
      (s) =>
        s.id !== excludeSessionId &&
        s.status !== "cancelled" &&
        s.players.some((p) => p.playerId === entry.playerId && p.jokerDeclared),
    );
    if (usedElsewhere) fail("joker_used");
  }
}

function openSessionsWithPlayer(facts: Facts, playerId: number, excludeSessionId?: number): SessionFact[] {
  return facts.sessions.filter(
    (s) => s.id !== excludeSessionId && isOpenSession(s) && s.players.some((p) => p.playerId === playerId),
  );
}

/** Ensures every player is free; optionally pulls them out of other tables that are still in setup. */
function freePlayers(tx: Tx, facts: Facts, playerIds: number[], excludeSessionId: number | undefined, move: boolean): void {
  for (const playerId of playerIds) {
    const busy = openSessionsWithPlayer(facts, playerId, excludeSessionId);
    if (busy.length === 0) continue;
    if (!move || busy.some((s) => s.status !== "setup")) fail("player_busy");
    for (const other of busy) {
      const remaining = other.players.filter((p) => p.playerId !== playerId);
      replaceSessionPlayers(tx, other.id, remaining);
      other.players = remaining;
    }
  }
}

function assertTableFree(facts: Facts, tableId: number, excludeSessionId?: number): void {
  if (facts.sessions.some((s) => s.id !== excludeSessionId && s.tableId === tableId && isOpenSession(s))) {
    fail("table_busy");
  }
}

function summaryOf(facts: Facts, session: SessionFact): string {
  const game = facts.games.find((g) => g.id === session.gameId)?.name ?? "Game";
  const table = facts.tables.find((t) => t.id === session.tableId);
  const where = table ? `Table ${table.number}` : "No table";
  return `${game} · ${where} · ${session.players.length} players`;
}

function validateResult(game: GameFact, placements: PlacementEntry[]): void {
  if (placements.length > game.maxPlayers) fail("too_many_players");
  const error = validatePlacements(
    placements.map((p) => p.placement),
    game.allowTies,
  );
  if (error) fail(error);
}

function announceMilestone(tx: Tx): void {
  const completed = loadFacts(tx).sessions.filter((s) => s.status === "done").length;
  if ((MILESTONES as readonly number[]).includes(completed) && !milestoneExists(tx, completed)) {
    insertAnnouncement(tx, { type: "milestone", payload: { count: completed } }, Date.now());
  }
}

const seatsFrom = (players: SeatInput[]) =>
  players.map((p, seat) => ({ playerId: p.playerId, seat, jokerDeclared: p.jokerDeclared, placement: null }));

export function seatTable(
  db: Db,
  input: { tableId: number; gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): number {
  return mutate(db, (tx) => {
    const facts = loadFacts(tx);
    requireTable(facts, input.tableId, true);
    const game = requireGame(facts, input.gameId, true);
    const ids = input.players.map((x) => x.playerId);
    requirePlayers(facts, ids, true);
    if (input.players.length > game.maxPlayers) fail("too_many_players");
    assertTableFree(facts, input.tableId);
    assertJokersAvailable(facts, input.players);
    freePlayers(tx, facts, ids, undefined, input.moveFromOtherTables ?? false);
    return insertSession(
      tx,
      {
        tableId: input.tableId,
        gameId: input.gameId,
        status: "setup",
        createdAt: Date.now(),
        notes: input.notes?.trim() || null,
      },
      seatsFrom(input.players),
    );
  });
}

export function updateSeating(
  db: Db,
  sessionId: number,
  input: { gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const session = requireSession(facts, sessionId);
    requireStatus(session, "setup");
    const game = requireGame(facts, input.gameId, true);
    const ids = input.players.map((x) => x.playerId);
    requirePlayers(facts, ids, true);
    if (input.players.length > game.maxPlayers) fail("too_many_players");
    assertJokersAvailable(facts, input.players, sessionId);
    freePlayers(tx, facts, ids, sessionId, input.moveFromOtherTables ?? false);
    updateSessionRow(tx, sessionId, {
      gameId: input.gameId,
      notes: input.notes === undefined ? session.notes : input.notes?.trim() || null,
    });
    replaceSessionPlayers(tx, sessionId, seatsFrom(input.players));
  });
}

export function startSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "setup");
    if (session.players.length < 2) fail("too_few_players");
    updateSessionRow(tx, sessionId, { status: "playing", startedAt: Date.now() });
  });
}

export function finishSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "playing");
    updateSessionRow(tx, sessionId, { status: "pending", finishedAt: Date.now() });
  });
}

export function resumeSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const session = requireSession(loadFacts(tx), sessionId);
    requireStatus(session, "pending");
    updateSessionRow(tx, sessionId, { status: "playing", finishedAt: null });
  });
}

export function cancelSession(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const session = requireSession(facts, sessionId);
    requireStatus(session, "setup", "playing", "pending");
    updateSessionRow(tx, sessionId, { status: "cancelled" });
    insertAudit(tx, {
      action: "session.cancel",
      summary: summaryOf(facts, session),
      before: session,
      after: { ...session, status: "cancelled" },
      at: Date.now(),
    });
  });
}

export function recordResult(db: Db, input: { sessionId: number; placements: PlacementEntry[] }): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    requireStatus(before, "playing", "pending");
    const game = requireGame(facts, before.gameId, false);
    const seated = new Map(before.players.map((x) => [x.playerId, x]));
    if (input.placements.some((x) => !seated.has(x.playerId))) fail("invalid_placements");
    if (new Set(input.placements.map((x) => x.playerId)).size !== input.placements.length) fail("invalid_placements");
    validateResult(game, input.placements);

    const after: SessionFact = {
      ...before,
      status: "done",
      finishedAt: before.finishedAt ?? Date.now(),
      players: input.placements
        .map((x) => ({ ...seated.get(x.playerId)!, placement: x.placement }))
        .sort((a, b) => a.seat - b.seat),
    };
    writeSession(tx, after);
    insertAudit(tx, { action: "result.create", summary: summaryOf(facts, after), before, after, at: Date.now() });
    announceMilestone(tx);
  });
}

export function recordDirectResult(
  db: Db,
  input: { gameId: number; tableId: number | null; placements: DirectPlacement[] },
): number {
  return mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const game = requireGame(facts, input.gameId, false);
    if (input.tableId !== null) requireTable(facts, input.tableId, false);
    const ids = input.placements.map((x) => x.playerId);
    requirePlayers(facts, ids, false);
    validateResult(game, input.placements);
    assertJokersAvailable(facts, input.placements);
    freePlayers(tx, facts, ids, undefined, false);

    const now = Date.now();
    const players = input.placements.map((x, seat) => ({
      playerId: x.playerId,
      seat,
      jokerDeclared: x.jokerDeclared,
      placement: x.placement,
    }));
    const id = insertSession(
      tx,
      { tableId: input.tableId, gameId: input.gameId, status: "done", createdAt: now, startedAt: now, finishedAt: now },
      players,
    );
    const after: SessionFact = {
      id,
      tableId: input.tableId,
      gameId: input.gameId,
      status: "done",
      createdAt: now,
      startedAt: now,
      finishedAt: now,
      notes: null,
      isDemo: false,
      players,
    };
    insertAudit(tx, { action: "result.create", summary: summaryOf(facts, after), before: null, after, at: now });
    announceMilestone(tx);
    return id;
  });
}

export function editResult(
  db: Db,
  input: { sessionId: number; gameId: number; tableId: number | null; placements: DirectPlacement[] },
): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    requireStatus(before, "done");
    const game = requireGame(facts, input.gameId, false);
    if (input.tableId !== null) requireTable(facts, input.tableId, false);
    requirePlayers(
      facts,
      input.placements.map((x) => x.playerId),
      false,
    );
    validateResult(game, input.placements);
    assertJokersAvailable(facts, input.placements, before.id);

    const after: SessionFact = {
      ...before,
      gameId: input.gameId,
      tableId: input.tableId,
      players: input.placements.map((x, seat) => ({
        playerId: x.playerId,
        seat,
        jokerDeclared: x.jokerDeclared,
        placement: x.placement,
      })),
    };
    writeSession(tx, after);
    insertAudit(tx, { action: "result.update", summary: summaryOf(facts, after), before, after, at: Date.now() });
  });
}

export function deleteResult(db: Db, sessionId: number): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, sessionId);
    requireStatus(before, "done");
    deleteSessionRow(tx, sessionId);
    insertAudit(tx, { action: "result.delete", summary: summaryOf(facts, before), before, after: null, at: Date.now() });
  });
}

export function correctJoker(db: Db, input: { sessionId: number; playerId: number; jokerDeclared: boolean }): void {
  mutate(db, (tx) => {
    const facts = loadFacts(tx);
    const before = requireSession(facts, input.sessionId);
    if (before.status === "cancelled") fail("invalid_status");
    if (!before.players.some((x) => x.playerId === input.playerId)) fail("not_found");
    assertJokersAvailable(facts, [{ playerId: input.playerId, jokerDeclared: input.jokerDeclared }], before.id);
    const after: SessionFact = {
      ...before,
      players: before.players.map((x) =>
        x.playerId === input.playerId ? { ...x, jokerDeclared: input.jokerDeclared } : x,
      ),
    };
    writeSession(tx, after);
    const name = facts.players.find((x) => x.id === input.playerId)?.name ?? "Player";
    insertAudit(tx, {
      action: "joker.correct",
      summary: `${name}: joker ${input.jokerDeclared ? "on" : "off"} · ${summaryOf(facts, after)}`,
      before,
      after,
      at: Date.now(),
    });
  });
}

function assertRestorable(facts: Facts, target: SessionFact): void {
  const others = facts.sessions.filter((s) => s.id !== target.id);
  if (!facts.games.some((g) => g.id === target.gameId)) fail("undo_conflict");
  if (target.players.some((x) => !facts.players.some((p) => p.id === x.playerId))) fail("undo_conflict");
  if (isOpenSession(target)) {
    if (target.tableId !== null && others.some((s) => s.tableId === target.tableId && isOpenSession(s))) {
      fail("undo_conflict");
    }
    const busy = target.players.some((x) =>
      others.some((s) => isOpenSession(s) && s.players.some((p) => p.playerId === x.playerId)),
    );
    if (busy) fail("undo_conflict");
  }
  const jokerTaken = target.players.some(
    (x) =>
      x.jokerDeclared &&
      others.some((s) => s.status !== "cancelled" && s.players.some((p) => p.playerId === x.playerId && p.jokerDeclared)),
  );
  if (jokerTaken) fail("undo_conflict");
}

export function undoLast(db: Db): { action: AuditAction; summary: string } {
  return mutate(db, (tx) => {
    const entry = lastUndoableAudit(tx) ?? fail("nothing_to_undo");
    const facts = loadFacts(tx);
    const reference = entry.before ?? entry.after ?? fail("undo_conflict");

    if (entry.before === null) {
      deleteSessionRow(tx, reference.id);
    } else {
      assertRestorable(facts, entry.before);
      writeSession(tx, entry.before);
    }

    markAuditUndone(tx, entry.id);
    insertAudit(tx, {
      action: "undo",
      summary: `Undo: ${entry.summary}`,
      before: entry.after,
      after: entry.before,
      at: Date.now(),
    });
    return { action: entry.action, summary: entry.summary };
  });
}

export function showOnScreen(db: Db, sessionId: number): void {
  mutate(
    db,
    (tx) => {
      const session = requireSession(loadFacts(tx), sessionId);
      requireStatus(session, "done");
      insertAnnouncement(tx, { type: "result_reveal", payload: { sessionId } }, Date.now());
    },
    { allowWhenFinished: true },
  );
}

export function replayLastReveal(db: Db): void {
  mutate(
    db,
    (tx) => {
      const last = loadFacts(tx)
        .sessions.filter((s) => s.status === "done" && s.finishedAt !== null)
        .sort((a, b) => b.finishedAt! - a.finishedAt! || b.id - a.id)[0];
      if (!last) fail("not_found");
      insertAnnouncement(tx, { type: "result_reveal", payload: { sessionId: last.id } }, Date.now());
    },
    { allowWhenFinished: true },
  );
}
```

- [ ] **Step 4: Run session tests**

Run: `npx vitest run src/server/services/sessions.test.ts`
Expected: PASS.

Two expectations in the tests depend on details worth knowing if a test fails:
- "create -> edit -> delete, undo" relies on `writeSession` re-inserting a deleted session with its original id.
- "undo conflicts when the table was reused": the result's `before` is a `pending` session on table 1; table 1 now has a `setup` session, so restore is refused.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (domain + repo + services).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/sessions.ts src/server/services/sessions.test.ts
git commit -m "feat(services): add table sessions, result entry, corrections, joker rules, undo and announcements"
```

### Task 8: Demo seed, npm scripts, automatic backups

**Files:**
- Create: `src/server/seed/demo.ts`, `src/server/backup.ts`, `scripts/env.ts`, `scripts/setup.ts`, `scripts/seed-demo.ts`, `scripts/clear-demo.ts`, `scripts/reset.ts`, `scripts/backup.ts`, `.env.example`
- Modify: `src/server/services/mutate.ts` (backup after commit), `package.json` (scripts)
- Test: `src/server/seed/demo.test.ts`, `src/server/backup.test.ts`

**Interfaces:**
- Consumes: `openDb`, `defaultDbPath`, `Db` (Task 5); `seedBase`, repo writes, `loadFacts` (Task 5); `colorForIndex` (Task 4); `replay` (Task 3)
- Produces:
  - `DEMO_NAMES: string[]` (22 names), `seedDemo(db: Db, now?: number): { players: number; results: number }`
  - `BACKUP_INTERVAL_MS`, `BACKUP_KEEP`, `backupDir(dbFile: string): string`, `createBackup(db: Db, dir: string, now?: number): string`, `pruneBackups(dir: string, keep: number): void`, `maybeBackup(db: Db, dir: string, now?: number): string | null`, `resetBackupClock(): void`
  - npm scripts: `setup`, `db:migrate`, `db:seed`, `db:seed:demo`, `db:clear-demo`, `db:reset`, `backup`

- [ ] **Step 1: Write failing demo seed tests**

`src/server/seed/demo.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { replay } from "@/domain/replay";
import { isOpenSession } from "@/domain/tables";
import { loadFacts } from "../repo/facts";
import { deleteDemoData } from "../repo/writes";
import { createTestDb } from "../testDb";
import { DEMO_NAMES, seedDemo } from "./demo";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

test("creates 22 players, 15 valid results and 2 open tables", () => {
  const summary = seedDemo(ctx.db, 1_800_000_000_000);
  expect(summary).toEqual({ players: 22, results: 15 });
  expect(DEMO_NAMES).toHaveLength(22);

  const facts = loadFacts(ctx.db);
  expect(facts.players.every((p) => p.isDemo)).toBe(true);
  const done = facts.sessions.filter((s) => s.status === "done");
  expect(done).toHaveLength(15);
  expect(facts.sessions.filter(isOpenSession).map((s) => s.status).sort()).toEqual(["playing", "setup"]);

  const rp = replay(facts, facts.event.scoring);
  expect(rp.results).toHaveLength(15);

  const jokerCounts = new Map<number, number>();
  for (const s of facts.sessions) {
    for (const p of s.players) if (p.jokerDeclared) jokerCounts.set(p.playerId, (jokerCounts.get(p.playerId) ?? 0) + 1);
  }
  expect(jokerCounts.size).toBeGreaterThan(0);
  expect([...jokerCounts.values()].every((n) => n === 1)).toBe(true);

  const hasTie = done.some((s) => new Set(s.players.map((p) => p.placement)).size < s.players.length);
  expect(hasTie).toBe(true);

  const openPlayers = facts.sessions.filter(isOpenSession).flatMap((s) => s.players.map((p) => p.playerId));
  expect(new Set(openPlayers).size).toBe(openPlayers.length);
});

test("refuses to seed twice and is fully removable", () => {
  seedDemo(ctx.db);
  expect(() => seedDemo(ctx.db)).toThrow(/already present/);
  deleteDemoData(ctx.db);
  const facts = loadFacts(ctx.db);
  expect(facts.players).toEqual([]);
  expect(facts.sessions).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/seed/demo.test.ts`
Expected: FAIL — cannot resolve `./demo`.

- [ ] **Step 3: Implement demo seed**

`src/server/seed/demo.ts`:

```ts
import { colorForIndex } from "@/domain/players";
import type { Db } from "../db/client";
import { loadFacts } from "../repo/facts";
import { bumpVersion, insertPlayer, insertSession } from "../repo/writes";

export const DEMO_NAMES = [
  "Andrii",
  "Max",
  "Dmytro",
  "Sasha",
  "Olena",
  "Iryna",
  "Taras",
  "Kateryna",
  "Bohdan",
  "Yulia",
  "Mykola",
  "Oksana",
  "Roman",
  "Natalia",
  "Pavlo",
  "Sofia",
  "Artem",
  "Daria",
  "Vlad",
  "Anna",
  "Ihor",
  "Marta",
];

const RESULT_COUNT = 15;
const TIE_RESULT_INDEX = 6;

/** Small deterministic PRNG so demo data looks the same on every machine. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDemo(db: Db, now = Date.now()): { players: number; results: number } {
  return db.transaction((tx) => {
    const facts = loadFacts(tx);
    if (facts.players.some((p) => p.isDemo)) {
      throw new Error("Demo data already present. Run `npm run db:clear-demo` first.");
    }
    const games = facts.games.filter((g) => g.active);
    const tables = facts.tables.filter((t) => t.active);
    if (games.length === 0 || tables.length < 2) throw new Error("Base seed missing. Run `npm run setup` first.");

    const rand = mulberry32(42);
    const shuffle = <T>(items: T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const offset = facts.players.length;
    const ids = DEMO_NAMES.map((name, i) =>
      insertPlayer(tx, {
        name,
        nickname: null,
        color: colorForIndex(offset + i),
        source: i % 5 === 4 ? "checkin" : "admin",
        isDemo: true,
        createdAt: now - 4 * 3_600_000 + i * 60_000,
      }),
    );

    const tieGame = games.find((g) => g.allowTies);
    const jokerUsed = new Set<number>();

    for (let i = 0; i < RESULT_COUNT; i++) {
      const game = i === TIE_RESULT_INDEX && tieGame ? tieGame : games[Math.floor(rand() * games.length)];
      const minCount = Math.max(game.minPlayers, 3);
      const maxCount = Math.max(minCount, Math.min(game.maxPlayers, 5));
      const count = minCount + Math.floor(rand() * (maxCount - minCount + 1));
      const seated = shuffle(ids).slice(0, count);
      const finishOrder = shuffle(seated);
      const finishedAt = now - (RESULT_COUNT - i) * 11 * 60_000;
      const startedAt = finishedAt - Math.round(game.durationMin * (0.8 + rand() * 0.4) * 60_000);
      const jokerPlayer = i % 4 === 1 ? seated.find((id) => !jokerUsed.has(id)) : undefined;
      if (jokerPlayer !== undefined) jokerUsed.add(jokerPlayer);
      const withTie = i === TIE_RESULT_INDEX && game === tieGame;

      insertSession(
        tx,
        {
          tableId: tables[i % tables.length].id,
          gameId: game.id,
          status: "done",
          createdAt: startedAt - 60_000,
          startedAt,
          finishedAt,
          isDemo: true,
        },
        seated.map((playerId, seat) => {
          const rank = finishOrder.indexOf(playerId) + 1;
          return {
            playerId,
            seat,
            jokerDeclared: playerId === jokerPlayer,
            placement: withTie && rank === 2 ? 1 : rank,
          };
        }),
      );
    }

    const free = shuffle(ids);
    const catan = games.find((g) => g.slug === "catan") ?? games[0];
    const splendor = games.find((g) => g.slug === "splendor") ?? games[0];
    const seats = (playerIds: number[]) =>
      playerIds.map((playerId, seat) => ({ playerId, seat, jokerDeclared: false, placement: null }));

    insertSession(
      tx,
      {
        tableId: tables[0].id,
        gameId: catan.id,
        status: "playing",
        createdAt: now - 26 * 60_000,
        startedAt: now - 25 * 60_000,
        isDemo: true,
      },
      seats(free.slice(0, Math.min(4, catan.maxPlayers))),
    );
    insertSession(
      tx,
      { tableId: tables[1].id, gameId: splendor.id, status: "setup", createdAt: now - 2 * 60_000, isDemo: true },
      seats(free.slice(4, 4 + Math.min(3, splendor.maxPlayers))),
    );

    bumpVersion(tx);
    return { players: ids.length, results: RESULT_COUNT };
  });
}
```

- [ ] **Step 4: Run demo seed tests**

Run: `npx vitest run src/server/seed/demo.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing backup tests**

`src/server/backup.test.ts`:

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { BACKUP_INTERVAL_MS, createBackup, maybeBackup, pruneBackups, resetBackupClock } from "./backup";
import { createTestDb } from "./testDb";

let ctx: ReturnType<typeof createTestDb>;
let dir: string;
beforeEach(() => {
  ctx = createTestDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-cup-backups-"));
  resetBackupClock();
});
afterEach(() => {
  ctx.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("createBackup writes a readable copy", () => {
  const file = createBackup(ctx.db, dir, Date.UTC(2026, 8, 18, 19, 30));
  expect(path.basename(file)).toBe("board-cup-2026-09-18T19-30-00-000Z.db");
  const copy = new Database(file, { readonly: true });
  expect((copy.prepare("select count(*) as n from games").get() as { n: number }).n).toBe(9);
  copy.close();
});

test("pruneBackups keeps the newest files", () => {
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(dir, `board-cup-2026-01-0${i + 1}.db`), "");
  pruneBackups(dir, 2);
  expect(fs.readdirSync(dir).sort()).toEqual(["board-cup-2026-01-04.db", "board-cup-2026-01-05.db"]);
});

test("maybeBackup throttles to one backup per interval", () => {
  const t = 1_000_000;
  expect(maybeBackup(ctx.db, dir, t)).not.toBeNull();
  expect(maybeBackup(ctx.db, dir, t + 1000)).toBeNull();
  expect(maybeBackup(ctx.db, dir, t + BACKUP_INTERVAL_MS)).not.toBeNull();
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/server/backup.test.ts`
Expected: FAIL — cannot resolve `./backup`.

- [ ] **Step 7: Implement backups**

`src/server/backup.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db/client";

export const BACKUP_INTERVAL_MS = 5 * 60_000;
export const BACKUP_KEEP = 50;

let lastBackupAt = Number.NEGATIVE_INFINITY;

export function backupDir(dbFile: string): string {
  return path.join(path.dirname(dbFile), "backups");
}

export function pruneBackups(dir: string, keep: number): void {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("board-cup-") && name.endsWith(".db"))
    .sort()
    .reverse();
  for (const name of files.slice(keep)) fs.rmSync(path.join(dir, name), { force: true });
}

export function createBackup(db: Db, dir: string, now = Date.now()): string {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `board-cup-${stamp}.db`);
  db.$client.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  pruneBackups(dir, BACKUP_KEEP);
  return file;
}

/** Called after every committed mutation; backs up at most once per interval. Never throws. */
export function maybeBackup(db: Db, dir: string, now = Date.now()): string | null {
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return null;
  lastBackupAt = now;
  try {
    return createBackup(db, dir, now);
  } catch (error) {
    console.error("Backup failed", error);
    return null;
  }
}

export function resetBackupClock(): void {
  lastBackupAt = Number.NEGATIVE_INFINITY;
}
```

- [ ] **Step 8: Hook backups into mutate**

Replace `src/server/services/mutate.ts`:

```ts
import { backupDir, maybeBackup } from "../backup";
import type { Db, Tx } from "../db/client";
import { getEventRow } from "../repo/facts";
import { bumpVersion } from "../repo/writes";
import { ServiceError } from "./errors";

/**
 * Runs a synchronous transaction, rejects writes on a finished event (unless allowed)
 * and bumps the data version so every polling client refreshes.
 * After commit, takes a throttled backup (skipped under Vitest).
 */
export function mutate<T>(db: Db, fn: (tx: Tx) => T, opts: { allowWhenFinished?: boolean } = {}): T {
  const result = db.transaction((tx) => {
    if (!opts.allowWhenFinished && getEventRow(tx).status === "finished") {
      throw new ServiceError("event_finished");
    }
    const value = fn(tx);
    bumpVersion(tx);
    return value;
  });
  if (!process.env.VITEST) maybeBackup(db, backupDir(db.$client.name));
  return result;
}
```

- [ ] **Step 9: Run backup tests and the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Write CLI scripts**

`scripts/env.ts`:

```ts
export function loadEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env is optional
  }
}
```

`scripts/setup.ts`:

```ts
import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { loadEnv } from "./env";

loadEnv();
const pin = process.env.ADMIN_PIN ?? "1234";
if (!process.env.ADMIN_PIN) console.warn("ADMIN_PIN not set; using default PIN 1234. Change it in /admin/settings.");
const file = defaultDbPath();
const db = openDb(file);
seedBase(db, { adminPin: pin });
db.$client.close();
console.log(`Database ready at ${file}`);
```

`scripts/seed-demo.ts`:

```ts
import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { seedDemo } from "../src/server/seed/demo";
import { loadEnv } from "./env";

loadEnv();
const db = openDb(defaultDbPath());
seedBase(db, { adminPin: process.env.ADMIN_PIN ?? "1234" });
const summary = seedDemo(db);
db.$client.close();
console.log(`Demo data added: ${summary.players} players, ${summary.results} results, 2 open tables.`);
```

`scripts/clear-demo.ts`:

```ts
import { defaultDbPath, openDb } from "../src/server/db/client";
import { bumpVersion, deleteDemoData } from "../src/server/repo/writes";

const db = openDb(defaultDbPath());
db.transaction((tx) => {
  deleteDemoData(tx);
  bumpVersion(tx);
});
db.$client.close();
console.log("Demo data removed.");
```

`scripts/reset.ts`:

```ts
import fs from "node:fs";
import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { loadEnv } from "./env";

if (!process.argv.includes("--yes")) {
  console.error("This deletes all event data. Re-run with --yes (npm run db:reset does this).");
  process.exit(1);
}
loadEnv();
const file = defaultDbPath();
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
const db = openDb(file);
seedBase(db, { adminPin: process.env.ADMIN_PIN ?? "1234" });
db.$client.close();
console.log(`Database reset at ${file}. Stop the server before resetting on Windows (the file is locked while running).`);
```

`scripts/backup.ts`:

```ts
import { backupDir, createBackup } from "../src/server/backup";
import { defaultDbPath, openDb } from "../src/server/db/client";

const file = defaultDbPath();
const db = openDb(file);
const out = createBackup(db, backupDir(file));
db.$client.close();
console.log(`Backup written to ${out}`);
```

`.env.example`:

```
# Admin PIN used when the database is first created (4-8 digits)
ADMIN_PIN=1234
# Optional: custom database file location
# DB_PATH=./data/board-cup.db
```

Add to `package.json` `"scripts"`:

```json
{
  "setup": "tsx scripts/setup.ts",
  "db:migrate": "tsx scripts/setup.ts",
  "db:seed": "tsx scripts/setup.ts",
  "db:seed:demo": "tsx scripts/seed-demo.ts",
  "db:clear-demo": "tsx scripts/clear-demo.ts",
  "db:reset": "tsx scripts/reset.ts --yes",
  "backup": "tsx scripts/backup.ts"
}
```

Also add `"scripts"` to the `include`/`exclude` handling: in `tsconfig.json` keep `"include"` default (`**/*.ts`) so scripts are type-checked.

- [ ] **Step 11: Verify scripts end to end**

```bash
npm run db:reset
npm run db:seed:demo
npm run backup
npm run db:clear-demo
npm run typecheck
```

Expected output lines: `Database reset at ...`, `Demo data added: 22 players, 15 results, 2 open tables.`, `Backup written to ...data/backups/board-cup-...db`, `Demo data removed.`, and no type errors.

- [ ] **Step 12: Commit**

```bash
git add src/server scripts package.json .env.example
git commit -m "feat: add demo seed, database scripts and automatic backups"
```

### Task 9: Admin auth, live snapshot cache, `/api/live`, server actions

**Files:**
- Create: `src/server/auth/token.ts`, `src/server/auth/rateLimit.ts`, `src/server/auth/admin.ts`, `src/server/live.ts`, `src/server/network.ts`, `src/server/runAction.ts`, `src/lib/action.ts`, `src/app/api/live/route.ts`, `src/proxy.ts`, `src/app/admin/actions.ts`, `src/app/admin/login/actions.ts`
- Test: `src/server/auth/token.test.ts`, `src/server/auth/rateLimit.test.ts`, `src/server/live.test.ts`

**Interfaces:**
- Consumes: `getDb`, `Db` (Task 5); `loadSecrets`, `loadFacts`, `getDataVersion`, `listAudit` (Task 5); `verifyPin` (Task 5); `replay` (Task 3); `buildPublicSnapshot`, `buildAdminSnapshot`, `PublicSnapshot`, `AdminSnapshot` (Task 4); all services (Tasks 6–7); `ServiceError`, `ErrorCode`, `isServiceError` (Task 6)
- Produces:
  - `ADMIN_COOKIE = "bgc_admin"`, `ADMIN_TTL_MS`, `signToken(secret, expiresAt): string`, `verifyToken(secret, token, now?): boolean`
  - `lockRemainingMs(key, now?): number`, `recordLoginFailure(key, now?): void`, `recordLoginSuccess(key): void`, `resetLoginLimits(): void`
  - `isAdmin(): Promise<boolean>`, `requireAdminPage(): Promise<void>` (redirects to `/admin/login`)
  - `getLiveState(db: Db): { facts: Facts; replay: Replay }`, `getPublicSnapshot(db: Db, now?: number): PublicSnapshot`, `getAdminSnapshot(db: Db, now?: number): AdminSnapshot`
  - `type ActionError = ErrorCode | "unauthorized" | "unexpected" | "locked"`, `type ActionResult<T = void>`, `type LiveResponse<S>`
  - `runAdminAction<T>(fn: (db: Db) => T): Promise<ActionResult<T>>`, `runPublicAction<T>(fn: (db: Db) => T): ActionResult<T>`
  - `listLanAddresses(): { name: string; address: string }[]`
  - `GET /api/live?v=<version>&aud=public|admin` → `LiveResponse`
  - server actions (all `async`, all return `ActionResult`): listed in Step 8
  - `loginAction(pin: string): Promise<ActionResult>`, `logoutAction(): Promise<void>`

- [ ] **Step 1: Write failing token and rate-limit tests**

`src/server/auth/token.test.ts`:

```ts
import { expect, test } from "vitest";
import { signToken, verifyToken } from "./token";

const secret = "a".repeat(64);

test("valid token verifies until expiry", () => {
  const token = signToken(secret, 2000);
  expect(verifyToken(secret, token, 1999)).toBe(true);
  expect(verifyToken(secret, token, 2000)).toBe(false);
});

test("tampered, foreign or malformed tokens fail", () => {
  const token = signToken(secret, 5000);
  expect(verifyToken(secret, token.replace(/^5000/, "9000"), 1)).toBe(false);
  expect(verifyToken("b".repeat(64), token, 1)).toBe(false);
  expect(verifyToken(secret, "garbage", 1)).toBe(false);
  expect(verifyToken(secret, undefined, 1)).toBe(false);
});
```

`src/server/auth/rateLimit.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { lockRemainingMs, recordLoginFailure, recordLoginSuccess, resetLoginLimits } from "./rateLimit";

beforeEach(() => resetLoginLimits());

test("five failures within 5 minutes lock for 30 seconds", () => {
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", 1000 + i);
  expect(lockRemainingMs("ip", 1010)).toBe(0);
  recordLoginFailure("ip", 1010);
  expect(lockRemainingMs("ip", 1010)).toBe(30_000);
  expect(lockRemainingMs("ip", 31_009)).toBe(1);
  expect(lockRemainingMs("ip", 41_010)).toBe(0);
});

test("old failures fall out of the window and success clears", () => {
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", i);
  recordLoginFailure("ip", 5 * 60_000 + 10);
  expect(lockRemainingMs("ip", 5 * 60_000 + 10)).toBe(0);
  recordLoginSuccess("ip");
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", 400_000 + i);
  expect(lockRemainingMs("ip", 400_010)).toBe(0);
});
```

Run: `npx vitest run src/server/auth` → Expected: FAIL (modules missing).

- [ ] **Step 2: Implement token and rate limit**

`src/server/auth/token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "bgc_admin";
export const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signToken(secret: string, expiresAt: number): string {
  const payload = String(expiresAt);
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyToken(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !/^\d+$/.test(payload)) return false;
  const expected = Buffer.from(signature(secret, payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(payload) > now;
}
```

`src/server/auth/rateLimit.ts`:

```ts
const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 30_000;

const state = new Map<string, { failures: number[]; lockedUntil: number }>();

export function lockRemainingMs(key: string, now = Date.now()): number {
  const entry = state.get(key);
  return entry ? Math.max(0, entry.lockedUntil - now) : 0;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const entry = state.get(key) ?? { failures: [], lockedUntil: 0 };
  entry.failures = [...entry.failures.filter((t) => now - t < WINDOW_MS), now];
  if (entry.failures.length >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failures = [];
  }
  state.set(key, entry);
}

export function recordLoginSuccess(key: string): void {
  state.delete(key);
}

export function resetLoginLimits(): void {
  state.clear();
}
```

Run: `npx vitest run src/server/auth` → Expected: PASS.

- [ ] **Step 3: Write the shared action types**

`src/lib/action.ts`:

```ts
import type { ErrorCode } from "@/server/services/errors";

export type ActionError = ErrorCode | "unauthorized" | "unexpected" | "locked";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: ActionError };

export type LiveResponse<S> =
  | { changed: false; version: number }
  | { changed: true; version: number; snapshot: S };
```

- [ ] **Step 4: Write failing live cache test**

`src/server/live.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { getAdminSnapshot, getLiveState, getPublicSnapshot } from "./live";
import { addPlayer } from "./services/players";
import { createTestDb } from "./testDb";

let ctx: ReturnType<typeof createTestDb>;
beforeEach(() => {
  ctx = createTestDb();
});
afterEach(() => ctx.cleanup());

test("replay is cached per data version", () => {
  const first = getLiveState(ctx.db);
  expect(getLiveState(ctx.db)).toBe(first);
  addPlayer(ctx.db, { name: "Amy" });
  const second = getLiveState(ctx.db);
  expect(second).not.toBe(first);
  expect(second.facts.players).toHaveLength(1);
});

test("snapshots carry audience and version", () => {
  addPlayer(ctx.db, { name: "Amy" });
  const pub = getPublicSnapshot(ctx.db);
  const admin = getAdminSnapshot(ctx.db);
  expect(pub.audience).toBe("public");
  expect(admin.audience).toBe("admin");
  expect(pub.version).toBe(admin.version);
  expect(pub.leaderboard).toBeNull();
});
```

Run: `npx vitest run src/server/live.test.ts` → Expected: FAIL.

- [ ] **Step 5: Implement live cache, network list, action runners, admin guard**

`src/server/live.ts`:

```ts
import { replay, type Replay } from "@/domain/replay";
import { buildAdminSnapshot, buildPublicSnapshot, type AdminSnapshot, type PublicSnapshot } from "@/domain/snapshot";
import type { Facts } from "@/domain/types";
import type { Db } from "./db/client";
import { getDataVersion, loadFacts } from "./repo/facts";

interface LiveState {
  facts: Facts;
  replay: Replay;
}

const cache = new WeakMap<Db, LiveState>();

export function getLiveState(db: Db): LiveState {
  const cached = cache.get(db);
  if (cached && cached.facts.event.dataVersion === getDataVersion(db)) return cached;
  const facts = db.transaction((tx) => loadFacts(tx));
  const state = { facts, replay: replay(facts, facts.event.scoring) };
  cache.set(db, state);
  return state;
}

export function currentVersion(db: Db): number {
  return getDataVersion(db);
}

export function getPublicSnapshot(db: Db, now = Date.now()): PublicSnapshot {
  const state = getLiveState(db);
  return buildPublicSnapshot(state.facts, state.replay, now);
}

export function getAdminSnapshot(db: Db, now = Date.now()): AdminSnapshot {
  const state = getLiveState(db);
  return buildAdminSnapshot(state.facts, state.replay, now);
}
```

`src/server/network.ts`:

```ts
import os from "node:os";

export interface LanAddress {
  name: string;
  address: string;
}

/** Private IPv4 addresses first, so the Wi-Fi address is usually at the top. */
export function listLanAddresses(): LanAddress[] {
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, infos]) =>
      (infos ?? [])
        .filter((info) => info.family === "IPv4" && !info.internal)
        .map((info) => ({ name, address: info.address })),
    )
    .sort((a, b) => rank(a.address) - rank(b.address) || a.name.localeCompare(b.name));
}
```

`src/server/auth/admin.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { loadSecrets } from "../repo/facts";
import { ADMIN_COOKIE, verifyToken } from "./token";

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyToken(loadSecrets(getDb()).sessionSecret, token);
}

export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
```

`src/server/runAction.ts`:

```ts
import type { ActionResult } from "@/lib/action";
import { isAdmin } from "./auth/admin";
import { getDb, type Db } from "./db/client";
import { isServiceError } from "./services/errors";

export function runPublicAction<T>(fn: (db: Db) => T): ActionResult<T> {
  try {
    return { ok: true, data: fn(getDb()) };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, error: error.code };
    console.error(error);
    return { ok: false, error: "unexpected" };
  }
}

export async function runAdminAction<T>(fn: (db: Db) => T): Promise<ActionResult<T>> {
  if (!(await isAdmin())) return { ok: false, error: "unauthorized" };
  return runPublicAction(fn);
}
```

Run: `npx vitest run src/server/live.test.ts` → Expected: PASS.

- [ ] **Step 6: Live API route**

`src/app/api/live/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { currentVersion, getAdminSnapshot, getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wantsAdmin = params.get("aud") === "admin";
  if (wantsAdmin && !(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const db = getDb();
  const version = currentVersion(db);
  if (Number(params.get("v")) === version) {
    return NextResponse.json({ changed: false, version }, { headers });
  }
  const snapshot = wantsAdmin ? getAdminSnapshot(db) : getPublicSnapshot(db);
  return NextResponse.json({ changed: true, version: snapshot.version, snapshot }, { headers });
}
```

- [ ] **Step 7: Proxy guarding `/admin/*`**

`src/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/server/auth/token";

/** Cheap presence check; pages and actions verify the signature server-side. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || request.cookies.get(ADMIN_COOKIE)?.value) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 8: Server actions**

`src/app/admin/login/actions.ts`:

```ts
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { verifyPin } from "@/server/auth/pin";
import { lockRemainingMs, recordLoginFailure, recordLoginSuccess } from "@/server/auth/rateLimit";
import { ADMIN_COOKIE, ADMIN_TTL_MS, signToken } from "@/server/auth/token";
import { getDb } from "@/server/db/client";
import { loadSecrets } from "@/server/repo/facts";

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(pin: string): Promise<ActionResult> {
  const key = await clientKey();
  if (lockRemainingMs(key) > 0) return { ok: false, error: "locked" };
  const secrets = loadSecrets(getDb());
  if (!verifyPin(pin, secrets.adminPinHash)) {
    recordLoginFailure(key);
    return { ok: false, error: lockRemainingMs(key) > 0 ? "locked" : "wrong_pin" };
  }
  recordLoginSuccess(key);
  const expiresAt = Date.now() + ADMIN_TTL_MS;
  (await cookies()).set(ADMIN_COOKIE, signToken(secrets.sessionSecret, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: Math.floor(ADMIN_TTL_MS / 1000),
  });
  return { ok: true, data: undefined };
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
```

`src/app/admin/actions.ts`:

```ts
"use server";

import type { AuditEntry } from "@/domain/types";
import type { ActionResult } from "@/lib/action";
import { listAudit } from "@/server/repo/facts";
import { runAdminAction } from "@/server/runAction";
import { addTable, removeTable, updateGame, updateTable, type GamePatch } from "@/server/services/catalog";
import {
  changePin,
  clearDemoData,
  finishEvent,
  goLive,
  reopenEvent,
  screenCommand,
  updateEventInfo,
  updateScoring,
  updateScreenSettings,
  type EventInfoPatch,
  type ScoringPatch,
  type ScreenPatch,
} from "@/server/services/event";
import { addPlayer, bulkAddPlayers, mergePlayers, updatePlayer, type PlayerPatch } from "@/server/services/players";
import {
  cancelSession,
  correctJoker,
  deleteResult,
  editResult,
  finishSession,
  recordDirectResult,
  recordResult,
  replayLastReveal,
  resumeSession,
  seatTable,
  showOnScreen,
  startSession,
  undoLast,
  updateSeating,
  type DirectPlacement,
  type PlacementEntry,
  type SeatInput,
} from "@/server/services/sessions";

type Result<T = void> = Promise<ActionResult<T>>;

// Tables and results
export async function seatTableAction(input: {
  tableId: number;
  gameId: number;
  players: SeatInput[];
  notes?: string | null;
  moveFromOtherTables?: boolean;
}): Result<number> {
  return runAdminAction((db) => seatTable(db, input));
}

export async function updateSeatingAction(
  sessionId: number,
  input: { gameId: number; players: SeatInput[]; notes?: string | null; moveFromOtherTables?: boolean },
): Result {
  return runAdminAction((db) => updateSeating(db, sessionId, input));
}

export async function startSessionAction(sessionId: number): Result {
  return runAdminAction((db) => startSession(db, sessionId));
}

export async function finishSessionAction(sessionId: number): Result {
  return runAdminAction((db) => finishSession(db, sessionId));
}

export async function resumeSessionAction(sessionId: number): Result {
  return runAdminAction((db) => resumeSession(db, sessionId));
}

export async function cancelSessionAction(sessionId: number): Result {
  return runAdminAction((db) => cancelSession(db, sessionId));
}

export async function recordResultAction(input: { sessionId: number; placements: PlacementEntry[] }): Result {
  return runAdminAction((db) => recordResult(db, input));
}

export async function recordDirectResultAction(input: {
  gameId: number;
  tableId: number | null;
  placements: DirectPlacement[];
}): Result<number> {
  return runAdminAction((db) => recordDirectResult(db, input));
}

export async function editResultAction(input: {
  sessionId: number;
  gameId: number;
  tableId: number | null;
  placements: DirectPlacement[];
}): Result {
  return runAdminAction((db) => editResult(db, input));
}

export async function deleteResultAction(sessionId: number): Result {
  return runAdminAction((db) => deleteResult(db, sessionId));
}

export async function correctJokerAction(input: { sessionId: number; playerId: number; jokerDeclared: boolean }): Result {
  return runAdminAction((db) => correctJoker(db, input));
}

export async function undoLastAction(): Result<{ summary: string }> {
  return runAdminAction((db) => ({ summary: undoLast(db).summary }));
}

export async function showOnScreenAction(sessionId: number): Result {
  return runAdminAction((db) => showOnScreen(db, sessionId));
}

export async function replayLastRevealAction(): Result {
  return runAdminAction((db) => replayLastReveal(db));
}

export async function screenCommandAction(command: "pause" | "resume" | "skip"): Result {
  return runAdminAction((db) => screenCommand(db, command));
}

export async function getAuditAction(): Result<AuditEntry[]> {
  return runAdminAction((db) => listAudit(db, 100));
}

// Players
export async function addPlayerAction(input: { name: string; nickname?: string | null }): Result<number> {
  return runAdminAction((db) => addPlayer(db, input));
}

export async function bulkAddPlayersAction(text: string): Result<number> {
  return runAdminAction((db) => bulkAddPlayers(db, text).length);
}

export async function updatePlayerAction(id: number, patch: PlayerPatch): Result {
  return runAdminAction((db) => updatePlayer(db, id, patch));
}

export async function mergePlayersAction(input: { keepId: number; removeId: number }): Result {
  return runAdminAction((db) => mergePlayers(db, input));
}

// Catalog
export async function updateGameAction(id: number, patch: GamePatch): Result {
  return runAdminAction((db) => updateGame(db, id, patch));
}

export async function addTableAction(label?: string | null): Result<number> {
  return runAdminAction((db) => addTable(db, label ?? null));
}

export async function updateTableAction(id: number, patch: { label?: string | null; active?: boolean }): Result {
  return runAdminAction((db) => updateTable(db, id, patch));
}

export async function removeTableAction(id: number): Result<"deleted" | "deactivated"> {
  return runAdminAction((db) => removeTable(db, id));
}

// Event and settings
export async function goLiveAction(clearDemo: boolean): Result {
  return runAdminAction((db) => goLive(db, { clearDemo }));
}

export async function finishEventAction(): Result {
  return runAdminAction((db) => finishEvent(db));
}

export async function reopenEventAction(): Result {
  return runAdminAction((db) => reopenEvent(db));
}

export async function updateScoringAction(patch: ScoringPatch): Result {
  return runAdminAction((db) => updateScoring(db, patch));
}

export async function updateScreenSettingsAction(patch: ScreenPatch): Result {
  return runAdminAction((db) => updateScreenSettings(db, patch));
}

export async function updateEventInfoAction(patch: EventInfoPatch): Result {
  return runAdminAction((db) => updateEventInfo(db, patch));
}

export async function changePinAction(input: { current: string; next: string }): Result {
  return runAdminAction((db) => changePin(db, input));
}

export async function clearDemoDataAction(): Result {
  return runAdminAction((db) => clearDemoData(db));
}
```

- [ ] **Step 9: Verify types, tests, and the API manually**

```bash
npm run typecheck
npm test
npm run db:reset && npm run db:seed:demo
npm run dev
```

In another terminal:

```bash
curl -s "http://localhost:3000/api/live?v=0" | head -c 400; echo
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/live?aud=admin"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000/admin"
```

Expected: first prints `{"changed":true,"version":...,"snapshot":{"audience":"public",...` with no `"points"` or `"rank"` keys; second prints `401`; third prints `307 http://localhost:3000/admin/login`. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat: add admin PIN auth, live snapshot API, proxy guard and server actions"
```

### Task 10: Internationalization (English and Russian)

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/ru.ts`, `src/i18n/index.ts`, `src/i18n/server.ts`, `src/i18n/LangProvider.tsx`, `src/app/lang/actions.ts`
- Modify: `src/app/layout.tsx`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `Lang` (Task 2), `ActionError` (Task 9)
- Produces:
  - `en` dictionary object and `type Dict = typeof en`; `ru: Dict`
  - `getDict(lang: Lang): Dict`, `fmt(template: string, vars: Record<string, string | number>): string`, `plural(lang: Lang, n: number, forms: PluralForms): string`, `ordinal(lang: Lang, n: number): string`, `isLang(value: unknown): value is Lang`, `LANG_COOKIE = "lang"`, `type PluralForms`
  - `getLang(): Promise<Lang>` (server)
  - `LangProvider({ lang, children })`, `useI18n(): { lang: Lang; t: Dict }` (client)
  - `setLangAction(lang: Lang): Promise<void>`
  - Dictionary key groups used by later tasks: `common`, `errors`, `status`, `tableState`, `plurals`, `nav`, `login`, `room`, `seat`, `result`, `results`, `standings`, `players`, `games`, `tables`, `remote`, `settings`, `home`, `checkin`, `leaderboard`, `screen`

- [ ] **Step 1: Write failing i18n tests**

`src/i18n/i18n.test.ts`:

```ts
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
```

Run: `npx vitest run src/i18n` → Expected: FAIL (modules missing).

- [ ] **Step 2: Write helpers**

`src/i18n/index.ts`:

```ts
import type { Lang } from "@/domain/types";
import { en, type Dict } from "./en";
import { ru } from "./ru";

export type { Dict };

export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export const LANG_COOKIE = "lang";
export const LANGS: Lang[] = ["en", "ru"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ru";
}

export function getDict(lang: Lang): Dict {
  return lang === "ru" ? ru : en;
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function plural(lang: Lang, n: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(lang).select(n) as keyof PluralForms;
  return forms[category] ?? forms.other;
}

export function ordinal(lang: Lang, n: number): string {
  if (lang === "ru") return `${n}-е`;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
```

- [ ] **Step 3: Write the English dictionary**

`src/i18n/en.ts`:

```ts
import type { PluralForms } from "./index";

export const en = {
  common: {
    appName: "Board Games Cup",
    table: "Table",
    tableN: "Table {n}",
    noTable: "No table",
    game: "Game",
    players: "Players",
    cancel: "Cancel",
    save: "Save",
    saved: "Saved",
    confirm: "Confirm",
    tapToConfirm: "Tap again to confirm",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    add: "Add",
    search: "Search",
    undo: "Undo",
    live: "Live",
    minutesShort: "{n} min",
    points: "pts",
    place: "place",
    language: "Language",
  },
  errors: {
    event_finished: "The event is finished. Reopen it in Settings to make changes.",
    not_found: "Not found. Refresh and try again.",
    invalid_name: "Enter a name up to 40 characters.",
    invalid_value: "That value is not allowed.",
    invalid_status: "This game has already moved on. Refresh.",
    player_busy: "A player is already at another table.",
    table_busy: "This table already has a game.",
    table_in_use: "Finish or cancel the game at this table first.",
    joker_used: "That player has already used their Joker.",
    too_few_players: "At least 2 players are needed.",
    too_many_players: "Too many players for this game.",
    invalid_placements: "Placements are incomplete or invalid.",
    ties_not_allowed: "This game does not allow ties.",
    merge_conflict: "These players shared a game or both used a Joker.",
    nothing_to_undo: "Nothing to undo.",
    undo_conflict: "Cannot undo: the table or players have moved on.",
    open_sessions: "Finish or cancel all open tables first.",
    wrong_pin: "Wrong PIN.",
    unauthorized: "Session expired. Log in again.",
    unexpected: "Something went wrong. Try again.",
    locked: "Too many attempts. Wait 30 seconds.",
  },
  status: {
    draft: "Starts soon",
    live: "Live",
    finished: "Finished",
  },
  tableState: {
    available: "Available",
    preparing: "Preparing",
    playing: "In progress",
    pending: "Results pending",
  },
  plurals: {
    players: { one: "player", other: "players" } as PluralForms,
    games: { one: "game", other: "games" } as PluralForms,
  },
  nav: {
    room: "Room",
    results: "Results",
    standings: "Standings",
    players: "Players",
    more: "More",
    games: "Games",
    tables: "Tables",
    settings: "Settings",
    screen: "Screen",
    publicSite: "Public site",
    logout: "Log out",
  },
  login: {
    title: "Organizer",
    subtitle: "Enter PIN",
    clear: "Clear",
  },
  room: {
    title: "Control room",
    seat: "Seat",
    start: "Start",
    finish: "Finish",
    enterResult: "Enter result",
    resume: "Resume",
    cancelGame: "Cancel game",
    editSeating: "Edit seating",
    newResult: "Result",
    noTables: "No active tables. Add one in Tables.",
    draftNotice: "Draft mode. Go live in Settings when the evening starts.",
    finishedNotice: "Event finished. Results are frozen.",
  },
  seat: {
    title: "Seat table {n}",
    editTitle: "Edit table {n}",
    game: "Game",
    players: "Players",
    search: "Search players",
    selected: "{n} selected",
    range: "{min}-{max} seats",
    busyAt: "Table {n}",
    joker: "Joker",
    jokerUsed: "Joker used",
    notes: "Notes",
    notesPlaceholder: "Optional",
    moveNote: "Players from preparing tables will be moved here.",
    submit: "Seat players",
    save: "Save seating",
  },
  result: {
    title: "Result",
    newTitle: "New result",
    editTitle: "Edit result",
    game: "Game",
    table: "Table",
    players: "Players",
    tapInOrder: "Tap players in finishing order",
    resetOrder: "Reset",
    tie: "Tie",
    unplaced: "Not placed",
    unplacedHint: "Players left unplaced are removed from this game.",
    joker: "Joker",
    jokerLocked: "Locked at start",
    changeJoker: "Change Joker",
    confirm: "Confirm result",
    save: "Save changes",
    saved: "Result saved",
    showOnScreen: "Show on screen",
    sentToScreen: "Sent to screen",
    undone: "Undone",
    needTwo: "Place at least 2 players",
  },
  results: {
    title: "Results",
    list: "Results",
    audit: "Audit log",
    undoLast: "Undo last",
    undone: "Undone: {summary}",
    empty: "No results yet.",
    auditEmpty: "Nothing logged yet.",
    deleted: "Result deleted",
    showOnScreen: "Show on screen",
    directEntry: "Entered directly",
    undoneTag: "Undone",
  },
  standings: {
    title: "Standings",
    rank: "Rank",
    player: "Player",
    counted: "Points",
    raw: "Raw",
    games: "Games",
    wins: "Wins",
    trend: "Trend",
    joker: "Joker",
    excluded: "{n} excluded",
    newLeader: "New leader",
    empty: "Standings appear after the first result.",
    strategyTotal: "Counting all results",
    strategyBestN: "Counting best {n} results",
  },
  players: {
    title: "Players",
    add: "Add",
    namePlaceholder: "Name",
    nicknamePlaceholder: "Nickname (optional)",
    bulk: "Paste list",
    bulkPlaceholder: "One name per line",
    bulkSubmit: "Add all",
    bulkAdded: "{n} added",
    checkin: "Check-in",
    demo: "Demo",
    inactive: "Inactive",
    deactivate: "Deactivate",
    activate: "Activate",
    merge: "Merge",
    mergeInto: "Merge {name} into",
    merged: "Players merged",
    total: "{n} players",
    search: "Search",
  },
  games: {
    title: "Games",
    weight: "Weight",
    weightHint: "Points for 1st place",
    players: "Players",
    minutes: "Min",
    ties: "Ties",
    active: "Active",
  },
  tables: {
    title: "Tables",
    add: "Add table",
    labelPlaceholder: "Label (optional)",
    remove: "Remove",
    removed: "Table removed",
    deactivated: "Table has history and was deactivated",
    active: "Active",
    inactive: "Inactive",
  },
  remote: {
    title: "Projector",
    pause: "Pause",
    resume: "Resume",
    skip: "Next scene",
    replay: "Replay last result",
    open: "Open screen",
    sent: "Sent",
  },
  settings: {
    title: "Settings",
    event: {
      title: "Event",
      name: "Event name",
      city: "City",
      year: "Year",
      accent: "Accent color",
      goLive: "Go live",
      goLiveHint: "Starts the event clock. Results from now on are the real tournament.",
      clearDemo: "Also remove demo data",
      finish: "Finish event",
      finishHint: "Freezes results. All tables must be closed.",
      reopen: "Reopen event",
      reopenHint: "Unlocks results and hides the finale again.",
    },
    scoring: {
      title: "Scoring",
      strategy: "Strategy",
      total: "Total",
      bestN: "Best N",
      n: "Results counted (N)",
      totalWarning: "With Total, playing more games always earns more points.",
      floor: "Participation floor",
      floorHint: "Last place earns this share of the game weight.",
      joker: "Joker multiplier",
      example: "Example: 4 players, weight {w}",
    },
    screen: {
      title: "Projector",
      duration: "Seconds per scene",
      scenes: "Scenes",
      sceneNames: {
        title: "Title",
        room: "Live room",
        recent: "Recent results",
        counters: "Event stats",
        contenders: "Contenders",
      },
      contendersHint: "Top 5 in alphabetical order, without ranks or points.",
      showPoints: "Show game points in result reveals",
      language: "Screen language",
    },
    network: {
      title: "Network",
      baseUrl: "Public address",
      baseUrlHint: "Phones and QR codes use this address. Pick the Wi-Fi address.",
      detected: "Detected addresses",
      none: "No network addresses found.",
      use: "Use",
    },
    security: {
      title: "Security",
      currentPin: "Current PIN",
      newPin: "New PIN (4-8 digits)",
      change: "Change PIN",
      changed: "PIN changed",
    },
    data: {
      title: "Data",
      export: "Download data (JSON)",
      clearDemo: "Remove demo data",
      clearDemoHint: "Deletes players and games marked as demo.",
      cleared: "Demo data removed",
    },
  },
  home: {
    subtitle: "Tournament evening",
    liveRoom: "Live room",
    recentResults: "Recent results",
    tonight: "Tonight",
    gamesCompleted: "Games completed",
    tablesActive: "Tables active",
    players: "Players",
    checkIn: "Check in",
    checkedInAs: "Checked in as {name}",
    standings: "Standings",
    noResults: "No results yet. The first games are underway.",
    allTablesFree: "All tables are free right now.",
    eventTime: "Event time",
  },
  checkin: {
    title: "Check in",
    subtitle: "Add your name to join the tournament.",
    name: "Your name",
    nickname: "Nickname",
    nicknameHint: "Optional",
    submit: "Join the cup",
    similar: "Is this you?",
    thatsMe: "That's me",
    addNew: "No, add me",
    success: "You're in, {name}.",
    successHint: "Find a table and tell the organizer you're playing.",
    closed: "Check-in is closed. The event has finished.",
    back: "Back to event",
  },
  leaderboard: {
    title: "Standings",
    lockedTitle: "Standings are sealed",
    lockedBody: "Points and ranks are revealed at the finale. Until then, every game counts.",
    back: "Back to event",
  },
  screen: {
    liveRoom: "Live room",
    recentResults: "Recent results",
    liveEvent: "Live event",
    contenders: "In contention",
    contendersNote: "Top five, alphabetical",
    gamesCompleted: "Games completed",
    tablesActive: "Tables active",
    players: "Players",
    allTablesFree: "All tables are free",
    firstResultSoon: "The first result is on its way",
    result: "Result",
    winner: "Winner",
    milestone: "Games completed",
    startsSoon: "Starting soon",
    finished: "Event complete",
    follow: "Follow live on your phone",
    fullscreen: "Fullscreen",
  },
};

export type Dict = typeof en;
```

- [ ] **Step 4: Write the Russian dictionary**

`src/i18n/ru.ts`:

```ts
import type { Dict } from "./en";

export const ru: Dict = {
  common: {
    appName: "Board Games Cup",
    table: "Стол",
    tableN: "Стол {n}",
    noTable: "Без стола",
    game: "Игра",
    players: "Игроки",
    cancel: "Отмена",
    save: "Сохранить",
    saved: "Сохранено",
    confirm: "Подтвердить",
    tapToConfirm: "Нажмите ещё раз для подтверждения",
    delete: "Удалить",
    edit: "Изменить",
    close: "Закрыть",
    add: "Добавить",
    search: "Поиск",
    undo: "Отменить",
    live: "В эфире",
    minutesShort: "{n} мин",
    points: "очк.",
    place: "место",
    language: "Язык",
  },
  errors: {
    event_finished: "Турнир завершён. Откройте его снова в настройках, чтобы вносить изменения.",
    not_found: "Не найдено. Обновите страницу и попробуйте снова.",
    invalid_name: "Введите имя до 40 символов.",
    invalid_value: "Недопустимое значение.",
    invalid_status: "Эта игра уже изменилась. Обновите страницу.",
    player_busy: "Игрок уже сидит за другим столом.",
    table_busy: "За этим столом уже идёт игра.",
    table_in_use: "Сначала завершите или отмените игру за этим столом.",
    joker_used: "Этот игрок уже использовал Джокер.",
    too_few_players: "Нужно минимум 2 игрока.",
    too_many_players: "Слишком много игроков для этой игры.",
    invalid_placements: "Места расставлены не полностью или неверно.",
    ties_not_allowed: "В этой игре ничьи не допускаются.",
    merge_conflict: "Эти игроки играли вместе или оба использовали Джокер.",
    nothing_to_undo: "Нечего отменять.",
    undo_conflict: "Отмена невозможна: стол или игроки уже заняты.",
    open_sessions: "Сначала завершите или отмените все открытые столы.",
    wrong_pin: "Неверный PIN.",
    unauthorized: "Сессия истекла. Войдите снова.",
    unexpected: "Что-то пошло не так. Попробуйте ещё раз.",
    locked: "Слишком много попыток. Подождите 30 секунд.",
  },
  status: {
    draft: "Скоро начало",
    live: "В эфире",
    finished: "Завершено",
  },
  tableState: {
    available: "Свободен",
    preparing: "Подготовка",
    playing: "Идёт игра",
    pending: "Ждёт результат",
  },
  plurals: {
    players: { one: "игрок", few: "игрока", many: "игроков", other: "игрока" },
    games: { one: "игра", few: "игры", many: "игр", other: "игры" },
  },
  nav: {
    room: "Зал",
    results: "Результаты",
    standings: "Таблица",
    players: "Игроки",
    more: "Ещё",
    games: "Игры",
    tables: "Столы",
    settings: "Настройки",
    screen: "Экран",
    publicSite: "Сайт события",
    logout: "Выйти",
  },
  login: {
    title: "Организатор",
    subtitle: "Введите PIN",
    clear: "Сброс",
  },
  room: {
    title: "Пульт",
    seat: "Рассадить",
    start: "Старт",
    finish: "Финиш",
    enterResult: "Внести результат",
    resume: "Продолжить",
    cancelGame: "Отменить игру",
    editSeating: "Изменить рассадку",
    newResult: "Результат",
    noTables: "Нет активных столов. Добавьте стол в разделе «Столы».",
    draftNotice: "Черновик. Запустите турнир в настройках, когда начнётся вечер.",
    finishedNotice: "Турнир завершён. Результаты заморожены.",
  },
  seat: {
    title: "Рассадка: стол {n}",
    editTitle: "Стол {n}: изменить",
    game: "Игра",
    players: "Игроки",
    search: "Поиск игроков",
    selected: "Выбрано: {n}",
    range: "мест: {min}-{max}",
    busyAt: "Стол {n}",
    joker: "Джокер",
    jokerUsed: "Джокер использован",
    notes: "Заметки",
    notesPlaceholder: "Необязательно",
    moveNote: "Игроки с готовящихся столов будут пересажены сюда.",
    submit: "Рассадить",
    save: "Сохранить рассадку",
  },
  result: {
    title: "Результат",
    newTitle: "Новый результат",
    editTitle: "Изменить результат",
    game: "Игра",
    table: "Стол",
    players: "Игроки",
    tapInOrder: "Нажимайте на игроков в порядке финиша",
    resetOrder: "Сброс",
    tie: "Ничья",
    unplaced: "Без места",
    unplacedHint: "Игроки без места будут убраны из этой игры.",
    joker: "Джокер",
    jokerLocked: "Закреплён на старте",
    changeJoker: "Изменить Джокер",
    confirm: "Подтвердить результат",
    save: "Сохранить изменения",
    saved: "Результат сохранён",
    showOnScreen: "Показать на экране",
    sentToScreen: "Отправлено на экран",
    undone: "Отменено",
    needTwo: "Расставьте хотя бы 2 игроков",
  },
  results: {
    title: "Результаты",
    list: "Результаты",
    audit: "Журнал",
    undoLast: "Отменить последнее",
    undone: "Отменено: {summary}",
    empty: "Результатов пока нет.",
    auditEmpty: "Журнал пуст.",
    deleted: "Результат удалён",
    showOnScreen: "Показать на экране",
    directEntry: "Внесено напрямую",
    undoneTag: "Отменено",
  },
  standings: {
    title: "Таблица",
    rank: "Место",
    player: "Игрок",
    counted: "Очки",
    raw: "Всего",
    games: "Игры",
    wins: "Победы",
    trend: "Динамика",
    joker: "Джокер",
    excluded: "Не учтено: {n}",
    newLeader: "Новый лидер",
    empty: "Таблица появится после первого результата.",
    strategyTotal: "Учитываются все результаты",
    strategyBestN: "Учитываются лучшие {n} результатов",
  },
  players: {
    title: "Игроки",
    add: "Добавить",
    namePlaceholder: "Имя",
    nicknamePlaceholder: "Никнейм (необязательно)",
    bulk: "Вставить список",
    bulkPlaceholder: "Одно имя на строку",
    bulkSubmit: "Добавить всех",
    bulkAdded: "Добавлено: {n}",
    checkin: "Регистрация",
    demo: "Демо",
    inactive: "Неактивен",
    deactivate: "Отключить",
    activate: "Включить",
    merge: "Объединить",
    mergeInto: "Объединить {name} с",
    merged: "Игроки объединены",
    total: "Игроков: {n}",
    search: "Поиск",
  },
  games: {
    title: "Игры",
    weight: "Вес",
    weightHint: "Очки за 1-е место",
    players: "Игроки",
    minutes: "Мин",
    ties: "Ничьи",
    active: "Активна",
  },
  tables: {
    title: "Столы",
    add: "Добавить стол",
    labelPlaceholder: "Подпись (необязательно)",
    remove: "Удалить",
    removed: "Стол удалён",
    deactivated: "У стола есть история, он отключён",
    active: "Активен",
    inactive: "Отключён",
  },
  remote: {
    title: "Проектор",
    pause: "Пауза",
    resume: "Продолжить",
    skip: "Следующая сцена",
    replay: "Повторить последний результат",
    open: "Открыть экран",
    sent: "Отправлено",
  },
  settings: {
    title: "Настройки",
    event: {
      title: "Событие",
      name: "Название",
      city: "Город",
      year: "Год",
      accent: "Акцентный цвет",
      goLive: "Запустить турнир",
      goLiveHint: "Запускает часы события. С этого момента результаты идут в зачёт.",
      clearDemo: "Также удалить демо-данные",
      finish: "Завершить турнир",
      finishHint: "Замораживает результаты. Все столы должны быть закрыты.",
      reopen: "Открыть турнир снова",
      reopenHint: "Разблокирует результаты и снова скрывает финал.",
    },
    scoring: {
      title: "Подсчёт очков",
      strategy: "Стратегия",
      total: "Сумма",
      bestN: "Лучшие N",
      n: "Сколько результатов учитывать (N)",
      totalWarning: "При сумме больше игр всегда даёт больше очков.",
      floor: "Очки за участие",
      floorHint: "Последнее место получает эту долю веса игры.",
      joker: "Множитель Джокера",
      example: "Пример: 4 игрока, вес {w}",
    },
    screen: {
      title: "Проектор",
      duration: "Секунд на сцену",
      scenes: "Сцены",
      sceneNames: {
        title: "Заставка",
        room: "Зал",
        recent: "Последние результаты",
        counters: "Статистика вечера",
        contenders: "Претенденты",
      },
      contendersHint: "Топ-5 по алфавиту, без мест и очков.",
      showPoints: "Показывать очки за игру в объявлении результата",
      language: "Язык экрана",
    },
    network: {
      title: "Сеть",
      baseUrl: "Публичный адрес",
      baseUrlHint: "Этот адрес используют телефоны и QR-коды. Выберите адрес Wi-Fi.",
      detected: "Найденные адреса",
      none: "Сетевые адреса не найдены.",
      use: "Выбрать",
    },
    security: {
      title: "Безопасность",
      currentPin: "Текущий PIN",
      newPin: "Новый PIN (4-8 цифр)",
      change: "Сменить PIN",
      changed: "PIN изменён",
    },
    data: {
      title: "Данные",
      export: "Скачать данные (JSON)",
      clearDemo: "Удалить демо-данные",
      clearDemoHint: "Удаляет игроков и игры, отмеченные как демо.",
      cleared: "Демо-данные удалены",
    },
  },
  home: {
    subtitle: "Турнирный вечер",
    liveRoom: "Зал",
    recentResults: "Последние результаты",
    tonight: "Сегодня",
    gamesCompleted: "Игр сыграно",
    tablesActive: "Столов занято",
    players: "Игроков",
    checkIn: "Зарегистрироваться",
    checkedInAs: "Вы зарегистрированы: {name}",
    standings: "Таблица",
    noResults: "Результатов пока нет. Первые игры уже идут.",
    allTablesFree: "Сейчас все столы свободны.",
    eventTime: "Время события",
  },
  checkin: {
    title: "Регистрация",
    subtitle: "Добавьте своё имя, чтобы участвовать в турнире.",
    name: "Ваше имя",
    nickname: "Никнейм",
    nicknameHint: "Необязательно",
    submit: "Участвовать",
    similar: "Это вы?",
    thatsMe: "Да, это я",
    addNew: "Нет, добавить меня",
    success: "Вы в игре, {name}.",
    successHint: "Найдите стол и сообщите организатору, во что играете.",
    closed: "Регистрация закрыта. Турнир завершён.",
    back: "К событию",
  },
  leaderboard: {
    title: "Таблица",
    lockedTitle: "Таблица скрыта",
    lockedBody: "Очки и места раскроют в финале. А пока каждая игра имеет значение.",
    back: "К событию",
  },
  screen: {
    liveRoom: "Зал",
    recentResults: "Последние результаты",
    liveEvent: "Прямой эфир",
    contenders: "Претенденты",
    contendersNote: "Первая пятёрка, по алфавиту",
    gamesCompleted: "Игр сыграно",
    tablesActive: "Столов занято",
    players: "Игроков",
    allTablesFree: "Все столы свободны",
    firstResultSoon: "Первый результат уже скоро",
    result: "Результат",
    winner: "Победитель",
    milestone: "Игр сыграно",
    startsSoon: "Скоро начало",
    finished: "Турнир завершён",
    follow: "Следите с телефона",
    fullscreen: "Во весь экран",
  },
};
```

- [ ] **Step 5: Run i18n tests**

Run: `npx vitest run src/i18n`
Expected: PASS.

- [ ] **Step 6: Server language reader, language action, client provider**

`src/i18n/server.ts`:

```ts
import { cookies } from "next/headers";
import type { Lang } from "@/domain/types";
import { isLang, LANG_COOKIE } from "./index";

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "en";
}
```

`src/app/lang/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import type { Lang } from "@/domain/types";
import { isLang, LANG_COOKIE } from "@/i18n";

export async function setLangAction(lang: Lang): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
```

`src/i18n/LangProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import type { Lang } from "@/domain/types";
import { getDict, type Dict } from "./index";

const LangContext = createContext<{ lang: Lang; t: Dict }>({ lang: "en", t: getDict("en") });

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: getDict(lang) }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  return useContext(LangContext);
}
```

- [ ] **Step 7: Wire language into the root layout**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Oswald } from "next/font/google";
import { LangProvider } from "@/i18n/LangProvider";
import { getLang } from "@/i18n/server";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin", "cyrillic"], variable: "--font-oswald" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], variable: "--font-inter-tight" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Board Games Cup",
  description: "Live board game tournament",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${oswald.variable} ${interTight.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-bg text-text">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

```bash
git add src/i18n src/app/lang src/app/layout.tsx
git commit -m "feat(i18n): add typed English and Russian dictionaries with plural and ordinal helpers"
```

### Task 11: UI foundation — brand, primitives, motion, live polling provider

**Files:**
- Create: `src/lib/cn.ts`, `src/lib/format.ts`, `src/lib/notify.ts`, `src/components/brand/Wordmark.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/Sheet.tsx`, `src/components/ui/ConfirmButton.tsx`, `src/components/ui/Switch.tsx`, `src/components/ui/Stepper.tsx`, `src/components/ui/Toaster.tsx`, `src/components/motion/FadeRise.tsx`, `src/components/motion/LivePulse.tsx`, `src/components/common/Avatar.tsx`, `src/components/common/GameIcon.tsx`, `src/components/common/useNow.ts`, `src/components/common/ElapsedClock.tsx`, `src/components/common/LangToggle.tsx`, `src/components/live/LiveProvider.tsx`
- Modify: `src/app/globals.css` (keyframes)
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `initials` (Task 4); snapshot types (Task 4); `LiveResponse`, `ActionResult` (Task 9); `useI18n`, `Dict`, `setLangAction` (Task 10)
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `formatElapsed(ms: number): string` ("01:14:32"), `formatClock(ts: number): string` ("19:05"), `pad2(n: number): string`
  - `handleResult<T>(result: ActionResult<T>, t: Dict, success?: string): result is { ok: true; data: T }`
  - `<Wordmark size?: "sm" | "md" | "lg" subtitle?: string />`, `<BrandMark className? />`
  - `<Button variant?: "primary" | "secondary" | "ghost" | "danger" size?: "sm" | "md" | "lg" loading?: boolean block?: boolean ...buttonProps />`
  - `<Sheet open onOpenChange title footer? children />`
  - `<ConfirmButton onConfirm label confirmLabel variant? size? block? disabled? />`
  - `<Switch checked onCheckedChange label? disabled? />`
  - `<Stepper value onChange min max step? format? label? />`
  - `<Toaster />`
  - `<FadeRise delay? className? children />`, `EASE`
  - `<LivePulse className? />`
  - `<Avatar name color size?: "sm" | "md" | "lg" />`
  - `GAME_ICONS`, `<GameIcon name className? />`
  - `useNow(intervalMs?: number): number | null`
  - `<ElapsedClock from: number | null to?: number | null className? />`
  - `<LangToggle className? />`
  - `<LiveProvider audience initial children />`, `usePublicLive(): LiveValue<PublicSnapshot>`, `useAdminLive(): LiveValue<AdminSnapshot>`, `type LiveValue<S> = { snapshot: S; refresh: () => void; stale: boolean }`, `POLL_MS = 2000`

- [ ] **Step 1: Write failing format tests**

`src/lib/format.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatClock, formatElapsed, pad2 } from "./format";

test("pad2", () => {
  expect(pad2(3)).toBe("03");
  expect(pad2(12)).toBe("12");
});

test("formatElapsed renders hh:mm:ss and clamps negatives", () => {
  expect(formatElapsed(0)).toBe("00:00:00");
  expect(formatElapsed(4_472_000)).toBe("01:14:32");
  expect(formatElapsed(-5)).toBe("00:00:00");
  expect(formatElapsed(36 * 3_600_000)).toBe("36:00:00");
});

test("formatClock renders local hh:mm", () => {
  const ts = new Date(2026, 8, 18, 19, 5).getTime();
  expect(formatClock(ts)).toBe("19:05");
});
```

Run: `npx vitest run src/lib` → Expected: FAIL.

- [ ] **Step 2: Implement lib helpers**

`src/lib/format.ts`:

```ts
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
```

`src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`src/lib/notify.ts`:

```ts
import { toast } from "sonner";
import type { Dict } from "@/i18n";
import type { ActionResult } from "./action";

/** Shows a toast for failures (and optional success). Returns true when the action succeeded. */
export function handleResult<T>(
  result: ActionResult<T>,
  t: Dict,
  success?: string,
): result is { ok: true; data: T } {
  if (result.ok) {
    if (success) toast.success(success);
    return true;
  }
  toast.error(t.errors[result.error]);
  if (result.error === "unauthorized") window.location.assign("/admin/login");
  return false;
}
```

Run: `npx vitest run src/lib` → Expected: PASS.

- [ ] **Step 3: Add keyframes to globals**

Append to `src/app/globals.css`:

```css
@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@utility animate-live-pulse {
  animation: live-pulse 2s var(--ease-out-quint) infinite;
}

@utility animate-sheet-in {
  animation: sheet-in 260ms var(--ease-out-quint);
}

@utility animate-overlay-in {
  animation: overlay-in 200ms ease-out;
}
```

- [ ] **Step 4: Brand**

`src/components/brand/Wordmark.tsx`:

```tsx
import { cn } from "@/lib/cn";

/** A game tile seen from above: two nested squares turned 45 degrees and a single accent pip. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <rect x="13" y="13" width="14" height="14" transform="rotate(45 20 20)" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      <circle cx="20" cy="20" r="2.25" fill="var(--color-accent)" />
    </svg>
  );
}

const sizes = {
  sm: { mark: "size-6", top: "text-[0.6rem] tracking-[0.32em]", cup: "text-lg" },
  md: { mark: "size-9", top: "text-[0.7rem] tracking-[0.34em]", cup: "text-3xl" },
  lg: { mark: "size-14", top: "text-sm tracking-[0.4em]", cup: "text-6xl md:text-7xl" },
};

export function Wordmark({ size = "md", subtitle }: { size?: keyof typeof sizes; subtitle?: string }) {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={cn(s.mark, "text-text")} />
      <div className="leading-none">
        <div className={cn("font-display uppercase text-muted", s.top)}>Board Games</div>
        <div className={cn("font-display font-semibold uppercase tracking-tight text-text", s.cup)}>
          Cup
          {subtitle ? <span className="ml-3 align-middle text-[0.4em] font-normal tracking-[0.3em] text-accent">{subtitle}</span> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Primitives**

`src/components/ui/Button.tsx`:

```tsx
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-bg hover:brightness-110 active:brightness-95",
  secondary: "border border-line-strong bg-surface-2 text-text hover:border-text/40",
  ghost: "text-muted hover:text-text hover:bg-white/5",
  danger: "border border-down/50 text-down hover:bg-down/10",
};

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-display uppercase tracking-[0.08em] transition-[filter,background-color,border-color,color] duration-200 disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
```

Verify `LoaderCircle` exists: `grep -q "declare const LoaderCircle:" node_modules/lucide-react/dist/lucide-react.d.ts && echo ok`. If missing, use `Loader`.

`src/components/ui/Sheet.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";

export function Sheet({
  open,
  onOpenChange,
  title,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="animate-sheet-in fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-lg border-t border-line-strong bg-surface shadow-[0_-24px_80px_rgba(0,0,0,0.6)] outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] md:rounded-none md:border-l md:border-t-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="font-display text-lg uppercase tracking-[0.06em]">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close className="-mr-2 grid size-10 place-items-center rounded-md text-muted hover:text-text" aria-label="Close">
              <X className="size-5" strokeWidth={1.5} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`src/components/ui/ConfirmButton.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "./Button";

/** Destructive actions need a second tap within 3 seconds; avoids modal dialogs mid-event. */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel,
  variant = "danger",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  onConfirm: () => void;
  label: React.ReactNode;
  confirmLabel: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <Button
      {...props}
      variant={armed ? "primary" : variant}
      className={armed ? "bg-down text-bg" : props.className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
```

`src/components/ui/Switch.tsx`:

```tsx
"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="flex min-h-11 items-center gap-3 text-left text-sm disabled:opacity-40"
    >
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-accent bg-accent/25" : "border-line-strong bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200",
            checked ? "left-[1.2rem] bg-accent" : "left-1 bg-muted",
          )}
        />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
```

`src/components/ui/Stepper.tsx`:

```tsx
"use client";

import { Minus, Plus } from "lucide-react";

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  label?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="inline-flex h-10 items-stretch rounded-md border border-line-strong" aria-label={label}>
      <button
        type="button"
        className="grid w-10 place-items-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus className="size-4" />
      </button>
      <span className="grid min-w-14 place-items-center border-x border-line px-2 font-mono text-sm tabular">
        {format(value)}
      </span>
      <button
        type="button"
        className="grid w-10 place-items-center text-muted hover:text-text disabled:opacity-30"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
```

`src/components/ui/Toaster.tsx`:

```tsx
"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-line-strong !bg-surface-2 !text-text !font-sans",
          description: "!text-muted",
          actionButton: "!bg-accent !text-bg !font-display !uppercase",
          cancelButton: "!bg-transparent !text-muted",
        },
      }}
    />
  );
}
```

- [ ] **Step 6: Motion primitives and common components**

`src/components/motion/FadeRise.tsx`:

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";

export const EASE = [0.2, 0.8, 0.2, 1] as const;

export function FadeRise({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
```

`src/components/motion/LivePulse.tsx`:

```tsx
import { cn } from "@/lib/cn";

export function LivePulse({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      <span className="absolute inset-0 animate-live-pulse rounded-full bg-live" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}
```

`src/components/common/Avatar.tsx`:

```tsx
import { initials } from "@/domain/players";
import { cn } from "@/lib/cn";

const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-14 text-base" };

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: keyof typeof sizes }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full border font-display tracking-wide", sizes[size])}
      style={{ borderColor: color, color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
```

`src/components/common/GameIcon.tsx`:

```tsx
import { Castle, Dices, Gem, Hexagon, Landmark, Layers, Music, Rat, Spade, TrainFront, type LucideIcon } from "lucide-react";

export const GAME_ICONS: Record<string, LucideIcon> = {
  Castle,
  Dices,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Spade,
  TrainFront,
};

export function GameIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GAME_ICONS[name] ?? Dices;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
```

`src/components/common/useNow.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Returns null during SSR and the first client render to avoid hydration mismatches. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`src/components/common/ElapsedClock.tsx`:

```tsx
"use client";

import { formatElapsed } from "@/lib/format";
import { useNow } from "./useNow";

export function ElapsedClock({ from, to, className }: { from: number | null; to?: number | null; className?: string }) {
  const now = useNow();
  const text = from === null || now === null ? "--:--:--" : formatElapsed((to ?? now) - from);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} suppressHydrationWarning>
      {text}
    </span>
  );
}
```

`src/components/common/LangToggle.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLangAction } from "@/app/lang/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function LangToggle({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("inline-flex h-8 items-stretch rounded-md border border-line text-xs", className)} role="group" aria-label={t.common.language}>
      {(["en", "ru"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          aria-pressed={lang === code}
          onClick={() =>
            startTransition(async () => {
              await setLangAction(code);
              router.refresh();
            })
          }
          className={cn(
            "px-2.5 font-display uppercase tracking-[0.12em] transition-colors",
            lang === code ? "bg-white/10 text-text" : "text-muted hover:text-text",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Live polling provider**

`src/components/live/LiveProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdminSnapshot, PublicSnapshot, Snapshot } from "@/domain/snapshot";
import type { LiveResponse } from "@/lib/action";

export const POLL_MS = 2000;

export interface LiveValue<S> {
  snapshot: S;
  refresh: () => void;
  stale: boolean;
}

const LiveContext = createContext<LiveValue<Snapshot> | null>(null);

export function LiveProvider({
  audience,
  initial,
  children,
}: {
  audience: "public" | "admin";
  initial: Snapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [stale, setStale] = useState(false);
  const version = useRef(initial.version);
  const inFlight = useRef(false);
  const again = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const res = await fetch(`/api/live?aud=${audience}&v=${version.current}`, { cache: "no-store" });
        if (res.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        if (!res.ok) throw new Error(`live ${res.status}`);
        const data = (await res.json()) as LiveResponse<Snapshot>;
        if (data.changed) {
          version.current = data.version;
          setSnapshot(data.snapshot);
        }
        setStale(false);
      } while (again.current);
    } catch {
      setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, [audience]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await poll();
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };
    timer = setTimeout(loop, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", snapshot.event.accentColor);
  }, [snapshot.event.accentColor]);

  const value = useMemo(() => ({ snapshot, refresh: () => void poll(), stale }), [snapshot, poll, stale]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function usePublicLive(): LiveValue<PublicSnapshot> {
  const ctx = useContext(LiveContext);
  if (!ctx || ctx.snapshot.audience !== "public") throw new Error("usePublicLive requires a public LiveProvider");
  return ctx as LiveValue<PublicSnapshot>;
}

export function useAdminLive(): LiveValue<AdminSnapshot> {
  const ctx = useContext(LiveContext);
  if (!ctx || ctx.snapshot.audience !== "admin") throw new Error("useAdminLive requires an admin LiveProvider");
  return ctx as LiveValue<AdminSnapshot>;
}
```

- [ ] **Step 8: Verify and commit**

```bash
grep -q "declare const LoaderCircle:" node_modules/lucide-react/dist/lucide-react.d.ts && echo LoaderCircle-ok
npm run typecheck
npm test
```

Expected: `LoaderCircle-ok`, no type errors, all tests pass. (Components are exercised visually from Task 12 onward.)

```bash
git add src/lib src/components src/app/globals.css
git commit -m "feat(ui): add brand mark, primitives, motion helpers and live polling provider"
```

### Task 12: Admin login, panel layout, control room, seating sheet, projector remote

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/components/admin/LoginView.tsx`, `src/app/admin/(panel)/layout.tsx`, `src/app/admin/(panel)/page.tsx`, `src/components/admin/AdminNav.tsx`, `src/components/admin/useRunner.ts`, `src/components/admin/seating.ts`, `src/components/admin/ControlRoom.tsx`, `src/components/admin/SeatSheet.tsx`, `src/components/admin/GamePicker.tsx`, `src/components/admin/PlayerPicker.tsx`, `src/components/admin/ScreenRemote.tsx`, `src/components/common/lookups.ts`, `src/components/common/EventStatusBadge.tsx`, `src/components/common/StateLabel.tsx`
- Test: `src/components/admin/seating.test.ts`

**Interfaces:**
- Consumes: `loginAction`, `logoutAction`, admin server actions (Task 9); `requireAdminPage`, `isAdmin`, `getAdminSnapshot`, `getDb` (Tasks 5, 9); UI foundation (Task 11); dictionaries (Task 10); snapshot types (Task 4); `normalizeName` (Task 4)
- Produces:
  - `useRunner(): { run: <T>(action: () => Promise<ActionResult<T>>, opts?: { success?: string; onOk?: (data: T) => void }) => void; pending: boolean }`
  - `useAdminLookups(s: AdminSnapshot)`, `usePublicLookups(s: PublicSnapshot)` → `{ players: Map, games: Map, tables: Map<number, { id: number; number: number; label: string | null }> }`
  - seating helpers: `orderGamesByRecency`, `busyPlayers`, `playerRecency`, `sortCandidates`, `matchesQuery`
  - `<GamePicker games value onChange />`, `<PlayerPicker players selected busy onToggle query onQueryChange allowSetupBusy? />`
  - `<EventStatusBadge event />`, `<StateLabel state />`, `<ScreenRemote />`, `<SeatSheet open onOpenChange table />`, `<ControlRoom />` (Task 13 adds result entry to it)
  - admin shell at `/admin/*` with `LiveProvider audience="admin"` and `<Toaster />`

- [ ] **Step 1: Write failing seating helper tests**

`src/components/admin/seating.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeGame } from "@/domain/fixtures";
import type { AdminPlayerView, AdminSeatView, TableView } from "@/domain/snapshot";
import { busyPlayers, matchesQuery, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";

const player = (id: number, name: string, active = true): AdminPlayerView => ({
  id,
  name,
  nickname: null,
  color: "#fff",
  source: "admin",
  active,
  isDemo: false,
  jokerUsed: false,
  createdAt: 0,
});

const table = (tableId: number, sessionId: number, status: "setup" | "playing", playerIds: number[]): TableView<AdminSeatView> => ({
  tableId,
  number: tableId,
  label: null,
  state: status === "setup" ? "preparing" : "playing",
  session: {
    id: sessionId,
    gameId: 1,
    status,
    startedAt: null,
    finishedAt: null,
    notes: null,
    players: playerIds.map((playerId, seat) => ({ playerId, seat, jokerDeclared: false })),
  },
});

test("orderGamesByRecency puts recently played active games first", () => {
  const games = [makeGame(1, 4), makeGame(2, 6), makeGame(3, 10), makeGame(4, 15, { active: false })];
  const ordered = orderGamesByRecency(games, [{ gameId: 3 }, { gameId: 1 }, { gameId: 3 }]);
  expect(ordered.map((g) => g.id)).toEqual([3, 1, 2]);
});

test("busyPlayers maps players at open tables, excluding one session", () => {
  const busy = busyPlayers([table(1, 10, "setup", [1, 2]), table(2, 11, "playing", [3])], 10);
  expect([...busy.entries()]).toEqual([[3, { tableNumber: 2, status: "playing" }]]);
});

test("playerRecency uses index of newest result", () => {
  const recency = playerRecency([
    { placements: [{ playerId: 5 }, { playerId: 6 }] },
    { placements: [{ playerId: 6 }, { playerId: 7 }] },
  ]);
  expect([...recency.entries()]).toEqual([
    [5, 0],
    [6, 0],
    [7, 1],
  ]);
});

test("matchesQuery ignores case and diacritics", () => {
  expect(matchesQuery("Łukasz", "luk")).toBe(true);
  expect(matchesQuery("Max", "")).toBe(true);
  expect(matchesQuery("Max", "and")).toBe(false);
});

test("sortCandidates: active + matching, free before busy, recent first, then name", () => {
  const players = [player(1, "Zoe"), player(2, "Amy"), player(3, "Bob"), player(4, "Cat", false), player(5, "Dan")];
  const busy = new Map([[5, { tableNumber: 1, status: "playing" as const }]]);
  const recency = new Map([[1, 0]]);
  expect(sortCandidates(players, recency, busy, "").map((p) => p.id)).toEqual([1, 2, 3, 5]);
  expect(sortCandidates(players, recency, busy, "a").map((p) => p.id)).toEqual([2, 5]);
});
```

Run: `npx vitest run src/components/admin/seating.test.ts` → Expected: FAIL.

Also add `"src/**/*.test.ts"` coverage for `src/components` — already included by the Vitest `include` glob.

- [ ] **Step 2: Implement seating helpers**

`src/components/admin/seating.ts`:

```ts
import { normalizeName } from "@/domain/players";
import type { AdminPlayerView, TableView } from "@/domain/snapshot";
import type { GameFact, SessionStatus } from "@/domain/types";

export function orderGamesByRecency(games: GameFact[], resultsNewestFirst: { gameId: number }[]): GameFact[] {
  const firstSeen = new Map<number, number>();
  resultsNewestFirst.forEach((r, i) => {
    if (!firstSeen.has(r.gameId)) firstSeen.set(r.gameId, i);
  });
  return games
    .filter((g) => g.active)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (firstSeen.get(a.g.id) ?? Infinity) - (firstSeen.get(b.g.id) ?? Infinity) || a.i - b.i)
    .map(({ g }) => g);
}

export function busyPlayers(
  tables: TableView<{ playerId: number }>[],
  excludeSessionId?: number,
): Map<number, { tableNumber: number; status: SessionStatus }> {
  const busy = new Map<number, { tableNumber: number; status: SessionStatus }>();
  for (const t of tables) {
    if (!t.session || t.session.id === excludeSessionId) continue;
    for (const p of t.session.players) busy.set(p.playerId, { tableNumber: t.number, status: t.session.status });
  }
  return busy;
}

export function playerRecency(resultsNewestFirst: { placements: { playerId: number }[] }[]): Map<number, number> {
  const recency = new Map<number, number>();
  resultsNewestFirst.forEach((r, i) => {
    for (const p of r.placements) if (!recency.has(p.playerId)) recency.set(p.playerId, i);
  });
  return recency;
}

export function matchesQuery(name: string, query: string): boolean {
  const q = normalizeName(query);
  return q.length === 0 || normalizeName(name).includes(q);
}

export function sortCandidates(
  players: AdminPlayerView[],
  recency: Map<number, number>,
  busy: Map<number, { status: SessionStatus }>,
  query: string,
): AdminPlayerView[] {
  const blocked = (id: number) => {
    const b = busy.get(id);
    return b !== undefined && b.status !== "setup" ? 1 : 0;
  };
  return players
    .filter((p) => p.active && matchesQuery(p.name, query))
    .sort(
      (a, b) =>
        blocked(a.id) - blocked(b.id) ||
        (recency.get(a.id) ?? Infinity) - (recency.get(b.id) ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}
```

Run: `npx vitest run src/components/admin/seating.test.ts` → Expected: PASS.

- [ ] **Step 3: Shared client hooks and small components**

`src/components/admin/useRunner.ts`:

```ts
"use client";

import { useTransition } from "react";
import { useI18n } from "@/i18n/LangProvider";
import type { ActionResult } from "@/lib/action";
import { handleResult } from "@/lib/notify";
import { useAdminLive } from "../live/LiveProvider";

export function useRunner() {
  const { t } = useI18n();
  const { refresh } = useAdminLive();
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, opts: { success?: string; onOk?: (data: T) => void } = {}) {
    startTransition(async () => {
      const result = await action();
      if (handleResult(result, t, opts.success)) opts.onOk?.(result.data);
      refresh();
    });
  }

  return { run, pending };
}
```

`src/components/common/lookups.ts`:

```ts
"use client";

import { useMemo } from "react";
import type { AdminSnapshot, PublicSnapshot } from "@/domain/snapshot";

export function useAdminLookups(s: AdminSnapshot) {
  return useMemo(
    () => ({
      players: new Map(s.players.map((p) => [p.id, p])),
      games: new Map(s.games.map((g) => [g.id, g])),
      tables: new Map(s.allTables.map((t) => [t.id, { id: t.id, number: t.number, label: t.label }])),
    }),
    [s],
  );
}

export function usePublicLookups(s: PublicSnapshot) {
  return useMemo(
    () => ({
      players: new Map(s.players.map((p) => [p.id, p])),
      games: new Map(s.games.map((g) => [g.id, g])),
      tables: new Map(s.tables.map((t) => [t.tableId, { id: t.tableId, number: t.number, label: t.label }])),
    }),
    [s],
  );
}
```

`src/components/common/EventStatusBadge.tsx`:

```tsx
"use client";

import type { PublicEventView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { LivePulse } from "../motion/LivePulse";
import { ElapsedClock } from "./ElapsedClock";

export function EventStatusBadge({ event }: { event: PublicEventView }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-3">
      {event.status === "live" ? <LivePulse /> : <span className="size-2 rounded-full bg-muted" aria-hidden />}
      <span className="font-display text-xs uppercase tracking-[0.16em]">{t.status[event.status]}</span>
      {event.startedAt ? (
        <ElapsedClock from={event.startedAt} to={event.finishedAt} className="font-mono text-xs text-muted" />
      ) : null}
    </div>
  );
}
```

`src/components/common/StateLabel.tsx`:

```tsx
"use client";

import type { TableState } from "@/domain/tables";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { LivePulse } from "../motion/LivePulse";

export function StateLabel({ state, className }: { state: TableState; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display text-[0.68rem] uppercase tracking-[0.16em]",
        state === "available" && "text-muted",
        state === "preparing" && "text-text/70",
        state === "playing" && "text-text",
        state === "pending" && "text-accent",
        className,
      )}
    >
      {state === "playing" ? <LivePulse /> : null}
      {state === "pending" ? <span className="size-2 rounded-full bg-accent" aria-hidden /> : null}
      {t.tableState[state]}
    </span>
  );
}
```

- [ ] **Step 4: Login**

`src/app/admin/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { LoginView } from "@/components/admin/LoginView";
import { isAdmin } from "@/server/auth/admin";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <LoginView />;
}
```

`src/components/admin/LoginView.tsx`:

```tsx
"use client";

import { ArrowRight, Delete } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { loginAction } from "@/app/admin/login/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Wordmark } from "../brand/Wordmark";
import { LangToggle } from "../common/LangToggle";

export function LoginView() {
  const { t } = useI18n();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const press = useCallback((digit: string) => {
    setError(null);
    setPin((p) => (p.length < 8 ? p + digit : p));
  }, []);
  const back = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const submit = useCallback(() => {
    if (pin.length < 4 || pending) return;
    startTransition(async () => {
      const result = await loginAction(pin);
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(t.errors[result.error]);
        setPin("");
      }
    });
  }, [pin, pending, router, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back, submit]);

  const slots = Math.max(4, pin.length);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xs flex-col justify-center gap-10 px-4 py-10">
      <div className="flex items-center justify-between">
        <Wordmark size="sm" />
        <LangToggle />
      </div>
      <div className="space-y-4 text-center">
        <p className="label-caps">{t.login.title}</p>
        <h1 className="font-display text-2xl uppercase tracking-wide">{t.login.subtitle}</h1>
        <div className="flex h-6 items-center justify-center gap-3" aria-live="polite">
          {Array.from({ length: slots }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full border transition-colors duration-150",
                i < pin.length ? "border-accent bg-accent" : "border-line-strong",
              )}
            />
          ))}
        </div>
        <p className="min-h-5 text-sm text-down">{error}</p>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 bg-bg font-display text-2xl active:bg-surface-2">
            {d}
          </button>
        ))}
        <button type="button" onClick={back} className="grid h-16 place-items-center bg-bg text-muted active:bg-surface-2" aria-label={t.login.clear}>
          <Delete className="size-5" strokeWidth={1.5} />
        </button>
        <button type="button" onClick={() => press("0")} className="h-16 bg-bg font-display text-2xl active:bg-surface-2">
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pin.length < 4 || pending}
          className="grid h-16 place-items-center bg-accent text-bg disabled:bg-bg disabled:text-muted"
          aria-label={t.common.confirm}
        >
          <ArrowRight className="size-6" strokeWidth={1.75} />
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Panel layout and navigation**

`src/app/admin/(panel)/layout.tsx`:

```tsx
import { AdminNav } from "@/components/admin/AdminNav";
import { LiveProvider } from "@/components/live/LiveProvider";
import { Toaster } from "@/components/ui/Toaster";
import { requireAdminPage } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getAdminSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const snapshot = getAdminSnapshot(getDb());
  return (
    <LiveProvider audience="admin" initial={snapshot}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
        <AdminNav />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-32 md:px-10 md:pt-10 md:pb-12">{children}</main>
      </div>
      <Toaster />
    </LiveProvider>
  );
}
```

`src/components/admin/AdminNav.tsx`:

```tsx
"use client";

import { Armchair, Dices, Eye, LayoutGrid, ListOrdered, LogOut, Menu, MonitorPlay, Settings, Trophy, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/admin/login/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { BrandMark } from "../brand/Wordmark";
import { LangToggle } from "../common/LangToggle";
import { useAdminLive } from "../live/LiveProvider";
import { Sheet } from "../ui/Sheet";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

export function AdminNav() {
  const { t } = useI18n();
  const { stale } = useAdminLive();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary: Item[] = [
    { href: "/admin", label: t.nav.room, icon: LayoutGrid },
    { href: "/admin/results", label: t.nav.results, icon: ListOrdered },
    { href: "/admin/leaderboard", label: t.nav.standings, icon: Trophy },
    { href: "/admin/players", label: t.nav.players, icon: Users },
  ];
  const secondary: Item[] = [
    { href: "/admin/games", label: t.nav.games, icon: Dices },
    { href: "/admin/tables", label: t.nav.tables, icon: Armchair },
    { href: "/admin/settings", label: t.nav.settings, icon: Settings },
    { href: "/screen", label: t.nav.screen, icon: MonitorPlay, external: true },
    { href: "/", label: t.nav.publicSite, icon: Eye, external: true },
  ];

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const link = (item: Item, compact = false) => (
    <Link
      key={item.href}
      href={item.href}
      target={item.external ? "_blank" : undefined}
      onClick={() => setMoreOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-md transition-colors",
        compact ? "flex-1 flex-col justify-center gap-1 py-2 text-[0.62rem]" : "px-3 py-2.5 text-sm",
        isActive(item.href) && !item.external ? "text-text" : "text-muted hover:text-text",
        !compact && isActive(item.href) && !item.external && "bg-white/5",
      )}
    >
      <item.icon className={compact ? "size-5" : "size-4"} strokeWidth={1.5} />
      <span className={compact ? "font-display uppercase tracking-[0.12em]" : ""}>{item.label}</span>
    </Link>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-8 md:flex">
        <div className="mb-8 flex items-center gap-2 px-3">
          <BrandMark className="size-7" />
          <span className="font-display text-sm uppercase tracking-[0.2em]">Cup Admin</span>
          {stale ? <span className="ml-auto size-2 rounded-full bg-down" title="offline" /> : null}
        </div>
        <nav className="flex flex-col gap-1">{primary.map((i) => link(i))}</nav>
        <div className="my-4 border-t border-line" />
        <nav className="flex flex-col gap-1">{secondary.map((i) => link(i))}</nav>
        <div className="mt-auto flex items-center justify-between px-3">
          <LangToggle />
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-2 text-sm text-muted hover:text-text">
              <LogOut className="size-4" strokeWidth={1.5} />
              {t.nav.logout}
            </button>
          </form>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {primary.map((i) => link(i, true))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.62rem] text-muted"
        >
          <Menu className="size-5" strokeWidth={1.5} />
          <span className="font-display uppercase tracking-[0.12em]">{t.nav.more}</span>
          {stale ? <span className="absolute top-2 right-1/3 size-2 rounded-full bg-down" /> : null}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={t.nav.more}>
        <nav className="flex flex-col gap-1">{secondary.map((i) => link(i))}</nav>
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <LangToggle />
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-2 text-sm text-muted">
              <LogOut className="size-4" strokeWidth={1.5} />
              {t.nav.logout}
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Projector remote**

`src/components/admin/ScreenRemote.tsx`:

```tsx
"use client";

import { MonitorPlay, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { replayLastRevealAction, screenCommandAction } from "@/app/admin/actions";
import { useI18n } from "@/i18n/LangProvider";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { useRunner } from "./useRunner";

export function ScreenRemote() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const paused = snapshot.event.screenControl.paused;

  return (
    <section className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5">
      <a
        href="/screen"
        target="_blank"
        rel="noreferrer"
        className="mr-auto flex items-center gap-2 px-2 font-display text-xs uppercase tracking-[0.16em] text-muted hover:text-text"
      >
        <MonitorPlay className="size-4" strokeWidth={1.5} />
        {t.remote.title}
      </a>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => screenCommandAction(paused ? "resume" : "pause"))}>
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        {paused ? t.remote.resume : t.remote.pause}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => screenCommandAction("skip"))}>
        <SkipForward className="size-3.5" />
        {t.remote.skip}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => replayLastRevealAction(), { success: t.remote.sent })}>
        <RotateCcw className="size-3.5" />
        {t.remote.replay}
      </Button>
    </section>
  );
}
```

- [ ] **Step 7: Seating sheet**

First the two pickers shared by the seating sheet and the result sheet (Task 13).

`src/components/admin/GamePicker.tsx`:

```tsx
"use client";

import type { GameFact } from "@/domain/types";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";

export function GamePicker({
  games,
  value,
  onChange,
}: {
  games: GameFact[];
  value: number | null;
  onChange: (gameId: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          aria-pressed={g.id === value}
          className={cn(
            "flex min-h-14 items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
            g.id === value ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
          )}
        >
          <GameIcon name={g.icon} className={cn("size-4 shrink-0", g.id === value ? "text-accent" : "text-muted")} />
          <span className="min-w-0 flex-1 text-sm leading-tight">{g.name}</span>
          <span className="font-mono text-[0.68rem] text-muted tabular">{g.weight}</span>
        </button>
      ))}
    </div>
  );
}
```

`src/components/admin/PlayerPicker.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import type { AdminPlayerView } from "@/domain/snapshot";
import type { SessionStatus } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";

/** Players at open tables are blocked; with allowSetupBusy, players at preparing tables stay selectable (they get moved). */
export function PlayerPicker({
  players,
  selected,
  busy,
  onToggle,
  query,
  onQueryChange,
  allowSetupBusy = false,
}: {
  players: AdminPlayerView[];
  selected: Set<number>;
  busy: Map<number, { tableNumber: number; status: SessionStatus }>;
  onToggle: (playerId: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  allowSetupBusy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t.seat.search}
        className="h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
      />
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => {
          const b = busy.get(p.id);
          const blocked = b !== undefined && !(allowSetupBusy && b.status === "setup") && !selected.has(p.id);
          const isSelected = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={blocked}
              onClick={() => onToggle(p.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-35",
                isSelected ? "border-accent/70 bg-accent/10" : "border-line hover:border-line-strong",
              )}
            >
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                {b ? <span className="block text-[0.68rem] text-muted">{fmt(t.seat.busyAt, { n: b.tableNumber })}</span> : null}
              </span>
              {isSelected ? <Check className="size-4 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Then the sheet:

`src/components/admin/SeatSheet.tsx`:

```tsx
"use client";

import { Spade, X } from "lucide-react";
import { useMemo, useState } from "react";
import { seatTableAction, updateSeatingAction } from "@/app/admin/actions";
import type { AdminSeatView, TableView } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import type { SeatInput } from "@/server/services/sessions";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { GamePicker } from "./GamePicker";
import { PlayerPicker } from "./PlayerPicker";
import { busyPlayers, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";
import { useRunner } from "./useRunner";

export function SeatSheet({
  open,
  onOpenChange,
  table,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: TableView<AdminSeatView>;
}) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const editing = table.session?.status === "setup" ? table.session : null;

  const [gameId, setGameId] = useState<number | null>(editing?.gameId ?? null);
  const [seats, setSeats] = useState<SeatInput[]>(
    editing?.players.map((p) => ({ playerId: p.playerId, jokerDeclared: p.jokerDeclared })) ?? [],
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [query, setQuery] = useState("");

  const games = useMemo(() => orderGamesByRecency(snapshot.games, snapshot.results), [snapshot.games, snapshot.results]);
  const busy = useMemo(() => busyPlayers(snapshot.tables, editing?.id), [snapshot.tables, editing?.id]);
  const recency = useMemo(() => playerRecency(snapshot.results), [snapshot.results]);
  const candidates = useMemo(
    () => sortCandidates(snapshot.players, recency, busy, query),
    [snapshot.players, recency, busy, query],
  );
  const playersById = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);

  const game = snapshot.games.find((g) => g.id === gameId);
  const selected = new Set(seats.map((s) => s.playerId));
  const needsMove = seats.some((s) => busy.get(s.playerId)?.status === "setup");
  const tooMany = game ? seats.length > game.maxPlayers : false;

  const jokerElsewhere = (playerId: number) =>
    Boolean(playersById.get(playerId)?.jokerUsed) &&
    !editing?.players.some((p) => p.playerId === playerId && p.jokerDeclared);

  const togglePlayer = (playerId: number) => {
    setSeats((current) =>
      current.some((s) => s.playerId === playerId)
        ? current.filter((s) => s.playerId !== playerId)
        : [...current, { playerId, jokerDeclared: false }],
    );
  };

  const toggleJoker = (playerId: number) =>
    setSeats((current) => current.map((s) => (s.playerId === playerId ? { ...s, jokerDeclared: !s.jokerDeclared } : s)));

  const submit = () => {
    if (!gameId) return;
    const close = () => onOpenChange(false);
    const payload = { gameId, players: seats, notes, moveFromOtherTables: needsMove };
    if (editing) run(() => updateSeatingAction(editing.id, payload), { onOk: close });
    else run(() => seatTableAction({ tableId: table.tableId, ...payload }), { onOk: close });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={fmt(editing ? t.seat.editTitle : t.seat.title, { n: table.number })}
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {fmt(t.seat.selected, { n: seats.length })}
              {game ? (
                <span className={cn(seats.length > 0 && seats.length < game.minPlayers && "text-accent")}>
                  {` · ${fmt(t.seat.range, { min: game.minPlayers, max: game.maxPlayers })}`}
                </span>
              ) : null}
            </span>
            {needsMove ? <span className="text-accent">{t.seat.moveNote}</span> : null}
          </div>
          <Button variant="primary" size="lg" block loading={pending} disabled={!gameId || seats.length === 0 || tooMany} onClick={submit}>
            {editing ? t.seat.save : t.seat.submit}
          </Button>
        </div>
      }
    >
      <section className="space-y-3">
        <h3 className="label-caps">{t.seat.game}</h3>
        <GamePicker games={games} value={gameId} onChange={setGameId} />
      </section>

      {seats.length > 0 ? (
        <section className="mt-6 space-y-2">
          <h3 className="label-caps">{t.seat.players}</h3>
          <ol className="divide-y divide-line rounded-md border border-line">
            {seats.map((s) => {
              const p = playersById.get(s.playerId);
              if (!p) return null;
              const locked = jokerElsewhere(s.playerId);
              return (
                <li key={s.playerId} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={p.name} color={p.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => toggleJoker(s.playerId)}
                    aria-pressed={s.jokerDeclared}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-display text-[0.68rem] uppercase tracking-[0.12em] transition-colors",
                      s.jokerDeclared ? "border-accent bg-accent/15 text-accent" : "border-line text-muted",
                      locked && "opacity-40",
                    )}
                  >
                    <Spade className="size-3.5" strokeWidth={1.75} />
                    {locked ? t.seat.jokerUsed : t.seat.joker}
                  </button>
                  <button type="button" onClick={() => togglePlayer(s.playerId)} className="grid size-9 place-items-center text-muted hover:text-text" aria-label={t.common.delete}>
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="mt-6">
        <PlayerPicker
          players={candidates}
          selected={selected}
          busy={busy}
          onToggle={togglePlayer}
          query={query}
          onQueryChange={setQuery}
          allowSetupBusy
        />
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="label-caps">{t.seat.notes}</h3>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.seat.notesPlaceholder}
          className="h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
        />
      </section>
    </Sheet>
  );
}
```

- [ ] **Step 8: Control room**

`src/components/admin/ControlRoom.tsx`:

```tsx
"use client";

import { Spade } from "lucide-react";
import { useState } from "react";
import { cancelSessionAction, finishSessionAction, resumeSessionAction, startSessionAction } from "@/app/admin/actions";
import type { AdminSeatView, TableView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { pad2 } from "@/lib/format";
import { Avatar } from "../common/Avatar";
import { ElapsedClock } from "../common/ElapsedClock";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { GameIcon } from "../common/GameIcon";
import { StateLabel } from "../common/StateLabel";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ScreenRemote } from "./ScreenRemote";
import { SeatSheet } from "./SeatSheet";
import { useRunner } from "./useRunner";

type AdminTable = TableView<AdminSeatView>;

export function ControlRoom() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const [seatTableId, setSeatTableId] = useState<number | null>(null);
  const seatTable = snapshot.tables.find((x) => x.tableId === seatTableId) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{snapshot.event.name}</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-tight md:text-4xl">{t.room.title}</h1>
        </div>
        <EventStatusBadge event={snapshot.event} />
      </header>

      {snapshot.event.status !== "live" ? (
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">
          {snapshot.event.status === "draft" ? t.room.draftNotice : t.room.finishedNotice}
        </p>
      ) : null}

      <ScreenRemote />

      {snapshot.tables.length === 0 ? (
        <p className="text-muted">{t.room.noTables}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {snapshot.tables.map((table) => (
            <TableRow key={table.tableId} table={table} onSeat={() => setSeatTableId(table.tableId)} />
          ))}
        </ul>
      )}

      {seatTable ? (
        <SeatSheet key={seatTable.tableId} open onOpenChange={(o) => !o && setSeatTableId(null)} table={seatTable} />
      ) : null}
    </div>
  );
}

function TableRow({ table, onSeat }: { table: AdminTable; onSeat: () => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const finished = snapshot.event.status === "finished";
  const session = table.session;
  const game = session ? lookups.games.get(session.gameId) : undefined;

  const cancel = session ? (
    <ConfirmButton
      size="sm"
      variant="ghost"
      label={t.room.cancelGame}
      confirmLabel={t.common.tapToConfirm}
      disabled={pending}
      onConfirm={() => run(() => cancelSessionAction(session.id))}
    />
  ) : null;

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[5rem_1fr_auto] md:items-center md:gap-6">
      <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
        <span className="font-display text-4xl leading-none tabular">{pad2(table.number)}</span>
        <StateLabel state={table.state} />
      </div>

      <div className="min-w-0">
        {session && game ? (
          <>
            <div className="flex items-center gap-2">
              <GameIcon name={game.icon} className="size-4 text-accent" />
              <span className="font-display text-lg uppercase tracking-wide">{game.name}</span>
              {session.startedAt ? (
                <ElapsedClock from={session.startedAt} to={session.finishedAt} className="ml-auto font-mono text-sm text-muted md:ml-3" />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {session.players.map((sp) => {
                const p = lookups.players.get(sp.playerId);
                if (!p) return null;
                return (
                  <span key={sp.playerId} className="flex items-center gap-1.5 text-sm">
                    <Avatar name={p.name} color={p.color} size="sm" />
                    {p.name}
                    {sp.jokerDeclared ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} aria-label={t.seat.joker} /> : null}
                  </span>
                );
              })}
            </div>
            {session.notes ? <p className="mt-1 text-xs text-muted">{session.notes}</p> : null}
          </>
        ) : (
          <span className="text-sm text-muted">{table.label ?? t.tableState.available}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {table.state === "available" ? (
          <Button variant="primary" onClick={onSeat} disabled={finished}>
            {t.room.seat}
          </Button>
        ) : null}
        {table.state === "preparing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => startSessionAction(session.id))}>
              {t.room.start}
            </Button>
            <Button onClick={onSeat}>{t.room.editSeating}</Button>
            {cancel}
          </>
        ) : null}
        {table.state === "playing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => finishSessionAction(session.id))}>
              {t.room.finish}
            </Button>
            {cancel}
          </>
        ) : null}
        {table.state === "pending" && session ? (
          <>
            <Button disabled={pending} onClick={() => run(() => resumeSessionAction(session.id))}>
              {t.room.resume}
            </Button>
            {cancel}
          </>
        ) : null}
      </div>
    </li>
  );
}
```

`src/app/admin/(panel)/page.tsx`:

```tsx
import { ControlRoom } from "@/components/admin/ControlRoom";

export default function AdminHomePage() {
  return <ControlRoom />;
}
```

- [ ] **Step 9: Verify in the browser**

```bash
npm run typecheck && npm test
npm run db:reset && npm run db:seed:demo
npm run dev
```

With a browser at 390×844 (use the Playwright MCP tools if available):
1. Open `http://localhost:3000/admin` → redirected to `/admin/login`.
2. Enter `0000` → "Wrong PIN." shown. Enter `1234` → lands on `/admin`.
3. Control room lists tables 01–06: 01 "In progress" with Catan, a running clock and 4 players; 02 "Preparing" with Splendor; others "Available".
4. Tap Seat on 03 → sheet opens; choose Hitster, pick 3 players, toggle a Joker for one, Seat players → row 03 shows "Preparing" with a Joker mark.
5. Start → "In progress" with clock; Finish → "Results pending"; Resume → back to "In progress".
6. Cancel game (tap twice) → table 03 "Available".
7. Try seating a player shown as "Table 1" (dimmed) → cannot select.
8. Switch language to RU in More → labels change to Russian.
9. At 1280×800 the sidebar replaces the bottom bar.

Expected: every step behaves as described with no console errors.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat(admin): add PIN login, admin shell, control room with seating and projector remote"
```

### Task 13: Result entry — tap order, drag reorder, ties, Jokers, live points, undo toast

**Files:**
- Create: `src/components/admin/placement.ts`, `src/components/admin/PlacementList.tsx`, `src/components/admin/ResultSheet.tsx`
- Modify: `src/components/admin/ControlRoom.tsx` (full replacement)
- Test: `src/components/admin/placement.test.ts`

**Interfaces:**
- Consumes: `scoreResult`, `formatPoints`, `ScoringParams` (Task 2); admin actions `recordResultAction`, `recordDirectResultAction`, `editResultAction`, `correctJokerAction`, `showOnScreenAction`, `undoLastAction` (Task 9); `GamePicker`, `PlayerPicker`, seating helpers, `useRunner`, `useAdminLookups` (Task 12); UI foundation (Task 11)
- Produces:
  - `interface OrderedEntry { playerId: number; tiedWithPrevious: boolean }`
  - `placementsFromOrder(order: OrderedEntry[]): { playerId: number; placement: number }[]`
  - `orderFromPlacements(placements: { playerId: number; placement: number }[]): OrderedEntry[]`
  - `previewPoints(weight: number, placements: { playerId: number; placement: number }[], jokers: Set<number>, params: ScoringParams): Map<number, number>`
  - `<PlacementList order onChange allowTies points jokers players />`
  - `type ResultTarget = { mode: "session"; sessionId: number } | { mode: "direct" } | { mode: "edit"; sessionId: number }`
  - `<ResultSheet target onClose />` (used by Task 14 for edits)
  - Control room: "Enter result" on playing/pending tables, floating "Result" button for direct entry

- [ ] **Step 1: Write failing placement helper tests**

`src/components/admin/placement.test.ts`:

```ts
import { expect, test } from "vitest";
import { orderFromPlacements, placementsFromOrder, previewPoints } from "./placement";

test("placementsFromOrder applies competition ranking for ties", () => {
  expect(
    placementsFromOrder([
      { playerId: 1, tiedWithPrevious: true },
      { playerId: 2, tiedWithPrevious: true },
      { playerId: 3, tiedWithPrevious: false },
      { playerId: 4, tiedWithPrevious: true },
    ]),
  ).toEqual([
    { playerId: 1, placement: 1 },
    { playerId: 2, placement: 1 },
    { playerId: 3, placement: 3 },
    { playerId: 4, placement: 3 },
  ]);
});

test("orderFromPlacements round-trips", () => {
  const placements = [
    { playerId: 2, placement: 1 },
    { playerId: 1, placement: 1 },
    { playerId: 3, placement: 3 },
  ];
  const order = orderFromPlacements(placements);
  expect(order).toEqual([
    { playerId: 2, tiedWithPrevious: false },
    { playerId: 1, tiedWithPrevious: true },
    { playerId: 3, tiedWithPrevious: false },
  ]);
  expect(placementsFromOrder(order)).toEqual(placements);
});

test("previewPoints scores with floor and joker, empty below 2 players", () => {
  const params = { participationFloor: 0.2, jokerMultiplier: 1.5 };
  const placements = [1, 2, 3, 4].map((id) => ({ playerId: id, placement: id }));
  const points = previewPoints(6, placements, new Set([1]), params);
  expect([...points.values()].map((v) => Number(v.toFixed(2)))).toEqual([9, 4.4, 2.8, 1.2]);
  expect(previewPoints(6, placements.slice(0, 1), new Set(), params).size).toBe(0);
});
```

Run: `npx vitest run src/components/admin/placement.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement placement helpers**

`src/components/admin/placement.ts`:

```ts
import { scoreResult, type ScoringParams } from "@/domain/scoring";

export interface OrderedEntry {
  playerId: number;
  tiedWithPrevious: boolean;
}

export function placementsFromOrder(order: OrderedEntry[]): { playerId: number; placement: number }[] {
  let placement = 0;
  return order.map((entry, index) => {
    if (index === 0 || !entry.tiedWithPrevious) placement = index + 1;
    return { playerId: entry.playerId, placement };
  });
}

export function orderFromPlacements(placements: { playerId: number; placement: number }[]): OrderedEntry[] {
  const sorted = [...placements].sort((a, b) => a.placement - b.placement);
  return sorted.map((p, i) => ({
    playerId: p.playerId,
    tiedWithPrevious: i > 0 && p.placement === sorted[i - 1].placement,
  }));
}

export function previewPoints(
  weight: number,
  placements: { playerId: number; placement: number }[],
  jokers: Set<number>,
  params: ScoringParams,
): Map<number, number> {
  if (placements.length < 2) return new Map();
  const scored = scoreResult(
    weight,
    placements.map((p) => ({ ...p, jokerDeclared: jokers.has(p.playerId) })),
    params,
  );
  return new Map(scored.map((s) => [s.playerId, s.points]));
}
```

Run: `npx vitest run src/components/admin/placement.test.ts` → Expected: PASS.

- [ ] **Step 3: Sortable placement list**

`src/components/admin/PlacementList.tsx`:

```tsx
"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Spade } from "lucide-react";
import { formatPoints } from "@/domain/scoring";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { placementsFromOrder, type OrderedEntry } from "./placement";

export function PlacementList({
  order,
  onChange,
  allowTies,
  points,
  jokers,
  players,
}: {
  order: OrderedEntry[];
  onChange: (order: OrderedEntry[]) => void;
  allowTies: boolean;
  points: Map<number, number>;
  jokers: Set<number>;
  players: Map<number, { name: string; color: string }>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const placements = placementsFromOrder(order);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((e) => e.playerId === active.id);
    const to = order.findIndex((e) => e.playerId === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(order, from, to));
  };

  if (order.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((e) => e.playerId)} strategy={verticalListSortingStrategy}>
        <ol className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {order.map((entry, index) => (
            <PlacementRow
              key={entry.playerId}
              entry={entry}
              index={index}
              placement={placements[index].placement}
              allowTies={allowTies}
              points={points.get(entry.playerId)}
              joker={jokers.has(entry.playerId)}
              player={players.get(entry.playerId)}
              onUnplace={() => onChange(order.slice(0, index))}
              onToggleTie={() =>
                onChange(order.map((e, i) => (i === index ? { ...e, tiedWithPrevious: !e.tiedWithPrevious } : e)))
              }
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function PlacementRow({
  entry,
  index,
  placement,
  allowTies,
  points,
  joker,
  player,
  onUnplace,
  onToggleTie,
}: {
  entry: OrderedEntry;
  index: number;
  placement: number;
  allowTies: boolean;
  points: number | undefined;
  joker: boolean;
  player: { name: string; color: string } | undefined;
  onUnplace: () => void;
  onToggleTie: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.playerId });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 bg-surface px-1.5 py-1.5", isDragging && "relative z-10 bg-surface-2 shadow-xl")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="grid size-10 shrink-0 touch-none place-items-center text-muted"
        aria-label="Reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className={cn("w-7 shrink-0 text-center font-display text-2xl tabular", placement === 1 && "text-accent")}>
        {placement}
      </span>
      <button type="button" onClick={onUnplace} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
        {player ? <Avatar name={player.name} color={player.color} size="sm" /> : null}
        <span className="truncate text-sm">{player?.name ?? entry.playerId}</span>
        {joker ? <Spade className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} /> : null}
      </button>
      {allowTies && index > 0 ? (
        <button
          type="button"
          aria-pressed={entry.tiedWithPrevious}
          onClick={onToggleTie}
          className={cn(
            "h-8 shrink-0 rounded-md border px-2 font-display text-[0.65rem] uppercase tracking-[0.12em]",
            entry.tiedWithPrevious ? "border-accent text-accent" : "border-line text-muted",
          )}
        >
          {t.result.tie}
        </button>
      ) : null}
      <span className={cn("w-12 shrink-0 pr-2 text-right font-mono text-sm tabular", joker ? "text-accent" : "text-text")}>
        {points === undefined ? "" : formatPoints(points)}
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Result sheet**

`src/components/admin/ResultSheet.tsx`:

```tsx
"use client";

import { Spade } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  correctJokerAction,
  editResultAction,
  recordDirectResultAction,
  recordResultAction,
  showOnScreenAction,
  undoLastAction,
} from "@/app/admin/actions";
import type { AdminSnapshot } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { handleResult } from "@/lib/notify";
import { Avatar } from "../common/Avatar";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { GamePicker } from "./GamePicker";
import { PlacementList } from "./PlacementList";
import { orderFromPlacements, placementsFromOrder, previewPoints, type OrderedEntry } from "./placement";
import { PlayerPicker } from "./PlayerPicker";
import { busyPlayers, orderGamesByRecency, playerRecency, sortCandidates } from "./seating";
import { useRunner } from "./useRunner";

export type ResultTarget = { mode: "session"; sessionId: number } | { mode: "direct" } | { mode: "edit"; sessionId: number };

interface Draft {
  gameId: number | null;
  tableId: number | null;
  pool: number[];
  order: OrderedEntry[];
  jokers: number[];
}

function findOpenSession(snapshot: AdminSnapshot, sessionId: number) {
  for (const table of snapshot.tables) {
    if (table.session?.id === sessionId) return { table, session: table.session };
  }
  return null;
}

function initialDraft(snapshot: AdminSnapshot, target: ResultTarget): Draft {
  if (target.mode === "session") {
    const open = findOpenSession(snapshot, target.sessionId);
    return {
      gameId: open?.session.gameId ?? null,
      tableId: open?.table.tableId ?? null,
      pool: open?.session.players.map((p) => p.playerId) ?? [],
      order: [],
      jokers: [],
    };
  }
  if (target.mode === "edit") {
    const result = snapshot.results.find((r) => r.sessionId === target.sessionId);
    if (result) {
      return {
        gameId: result.gameId,
        tableId: result.tableId,
        pool: result.placements.map((p) => p.playerId),
        order: orderFromPlacements(result.placements),
        jokers: result.placements.filter((p) => p.jokerDeclared).map((p) => p.playerId),
      };
    }
  }
  return { gameId: null, tableId: null, pool: [], order: [], jokers: [] };
}

export function ResultSheet({ target, onClose }: { target: ResultTarget; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot, refresh } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(snapshot, target));
  const [originalJokers] = useState(() => new Set(draft.jokers));
  const [query, setQuery] = useState("");

  const open = target.mode === "session" ? findOpenSession(snapshot, target.sessionId) : null;
  const missing =
    (target.mode === "session" && !open) ||
    (target.mode === "edit" && !snapshot.results.some((r) => r.sessionId === target.sessionId));

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  const game = draft.gameId !== null ? lookups.games.get(draft.gameId) : undefined;
  const jokers = useMemo(
    () =>
      target.mode === "session"
        ? new Set(open?.session.players.filter((p) => p.jokerDeclared).map((p) => p.playerId) ?? [])
        : new Set(draft.jokers),
    [target.mode, open, draft.jokers],
  );
  const placements = useMemo(() => placementsFromOrder(draft.order), [draft.order]);
  const points = useMemo(
    () => (game ? previewPoints(game.weight, placements, jokers, snapshot.event.scoring) : new Map<number, number>()),
    [game, placements, jokers, snapshot.event.scoring],
  );

  const games = useMemo(() => orderGamesByRecency(snapshot.games, snapshot.results), [snapshot.games, snapshot.results]);
  const busy = useMemo(
    () => (target.mode === "direct" ? busyPlayers(snapshot.tables) : new Map()),
    [target.mode, snapshot.tables],
  );
  const recency = useMemo(() => playerRecency(snapshot.results), [snapshot.results]);
  const candidates = useMemo(
    () => sortCandidates(snapshot.players, recency, busy, query),
    [snapshot.players, recency, busy, query],
  );

  if (missing) return null;

  const placed = new Set(draft.order.map((e) => e.playerId));
  const unplaced = draft.pool.filter((id) => !placed.has(id));
  const editableSetup = target.mode !== "session";

  const togglePool = (playerId: number) =>
    setDraft((d) =>
      d.pool.includes(playerId)
        ? {
            ...d,
            pool: d.pool.filter((id) => id !== playerId),
            order: d.order.filter((e) => e.playerId !== playerId),
            jokers: d.jokers.filter((id) => id !== playerId),
          }
        : { ...d, pool: [...d.pool, playerId] },
    );

  const place = (playerId: number) =>
    setDraft((d) => ({ ...d, order: [...d.order, { playerId, tiedWithPrevious: false }] }));

  const toggleLocalJoker = (playerId: number) =>
    setDraft((d) => ({
      ...d,
      jokers: d.jokers.includes(playerId) ? d.jokers.filter((id) => id !== playerId) : [...d.jokers, playerId],
    }));

  const jokerTakenElsewhere = (playerId: number) =>
    Boolean(lookups.players.get(playerId)?.jokerUsed) && !originalJokers.has(playerId);

  const announce = (sessionId: number) =>
    toast.success(t.result.saved, {
      duration: 10_000,
      action: {
        label: t.result.showOnScreen,
        onClick: async () => {
          if (handleResult(await showOnScreenAction(sessionId), t, t.result.sentToScreen)) refresh();
        },
      },
      cancel: {
        label: t.common.undo,
        onClick: async () => {
          if (handleResult(await undoLastAction(), t, t.result.undone)) refresh();
        },
      },
    });

  const withJokers = placements.map((p) => ({ ...p, jokerDeclared: jokers.has(p.playerId) }));

  const submit = () => {
    if (!game || placements.length < 2) return;
    if (target.mode === "session") {
      run(() => recordResultAction({ sessionId: target.sessionId, placements }), {
        onOk: () => {
          onClose();
          announce(target.sessionId);
        },
      });
    } else if (target.mode === "direct") {
      run(() => recordDirectResultAction({ gameId: game.id, tableId: draft.tableId, placements: withJokers }), {
        onOk: (sessionId) => {
          onClose();
          announce(sessionId);
        },
      });
    } else {
      run(
        () => editResultAction({ sessionId: target.sessionId, gameId: game.id, tableId: draft.tableId, placements: withJokers }),
        { success: t.result.saved, onOk: onClose },
      );
    }
  };

  const tableNumber = draft.tableId !== null ? lookups.tables.get(draft.tableId)?.number : undefined;
  const title =
    target.mode === "session" && game
      ? `${game.name} · ${tableNumber !== undefined ? fmt(t.common.tableN, { n: tableNumber }) : t.common.noTable}`
      : target.mode === "edit"
        ? t.result.editTitle
        : t.result.newTitle;

  const tableChoices = target.mode === "edit" ? snapshot.allTables : snapshot.allTables.filter((x) => x.active);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <div className="space-y-2">
          {draft.order.length < 2 ? <p className="text-center text-xs text-muted">{t.result.needTwo}</p> : null}
          <Button variant="primary" size="lg" block loading={pending} disabled={!game || draft.order.length < 2} onClick={submit}>
            {target.mode === "edit" ? t.result.save : t.result.confirm}
          </Button>
        </div>
      }
    >
      {editableSetup ? (
        <>
          <section className="space-y-3">
            <h3 className="label-caps">{t.result.game}</h3>
            <GamePicker games={games} value={draft.gameId} onChange={(gameId) => setDraft((d) => ({ ...d, gameId }))} />
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="label-caps">{t.result.table}</h3>
            <div className="flex flex-wrap gap-2">
              {[{ id: null as number | null, label: t.common.noTable }, ...tableChoices.map((x) => ({ id: x.id as number | null, label: String(x.number).padStart(2, "0") }))].map(
                (choice) => (
                  <button
                    key={choice.id ?? "none"}
                    type="button"
                    aria-pressed={draft.tableId === choice.id}
                    onClick={() => setDraft((d) => ({ ...d, tableId: choice.id }))}
                    className={cn(
                      "h-10 min-w-12 rounded-md border px-3 font-display text-sm uppercase tracking-wide",
                      draft.tableId === choice.id ? "border-accent bg-accent/10 text-text" : "border-line text-muted",
                    )}
                  >
                    {choice.label}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="label-caps">{t.result.players}</h3>
            <PlayerPicker
              players={candidates}
              selected={new Set(draft.pool)}
              busy={busy}
              onToggle={togglePool}
              query={query}
              onQueryChange={setQuery}
            />
          </section>
        </>
      ) : null}

      <section className={cn("space-y-3", editableSetup && "mt-8")}>
        <div className="flex items-center justify-between">
          <h3 className="label-caps">{t.result.tapInOrder}</h3>
          {draft.order.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, order: [] }))}>
              {t.result.resetOrder}
            </Button>
          ) : null}
        </div>

        <PlacementList
          order={draft.order}
          onChange={(order) => setDraft((d) => ({ ...d, order }))}
          allowTies={game?.allowTies ?? false}
          points={points}
          jokers={jokers}
          players={lookups.players}
        />

        {unplaced.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {unplaced.map((id) => {
                const p = lookups.players.get(id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => place(id)}
                    className="flex min-h-12 items-center gap-2 rounded-md border border-dashed border-line-strong px-2.5 text-left hover:border-accent"
                  >
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {jokers.has(id) ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} /> : null}
                  </button>
                );
              })}
            </div>
            {target.mode === "session" && draft.order.length > 0 ? (
              <p className="text-xs text-muted">{t.result.unplacedHint}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {draft.pool.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h3 className="label-caps">{t.result.joker}</h3>
          <div className="flex flex-wrap gap-2">
            {draft.pool.map((id) => {
              const p = lookups.players.get(id);
              if (!p) return null;
              const on = jokers.has(id);
              const chipClass = cn(
                "h-9 gap-1.5 px-2.5 normal-case tracking-normal font-sans text-sm",
                on ? "border-accent text-accent" : "",
              );
              if (target.mode === "session" && open) {
                return (
                  <ConfirmButton
                    key={id}
                    size="sm"
                    variant="secondary"
                    className={chipClass}
                    label={
                      <>
                        <Spade className="size-3.5" strokeWidth={1.75} />
                        {p.name}
                      </>
                    }
                    confirmLabel={t.result.changeJoker}
                    disabled={pending || (!on && jokerTakenElsewhere(id))}
                    onConfirm={() => run(() => correctJokerAction({ sessionId: open.session.id, playerId: id, jokerDeclared: !on }))}
                  />
                );
              }
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="secondary"
                  className={chipClass}
                  aria-pressed={on}
                  disabled={!on && jokerTakenElsewhere(id)}
                  onClick={() => toggleLocalJoker(id)}
                >
                  <Spade className="size-3.5" strokeWidth={1.75} />
                  {p.name}
                </Button>
              );
            })}
          </div>
          {target.mode === "session" ? <p className="text-xs text-muted">{t.result.jokerLocked}</p> : null}
        </section>
      ) : null}
    </Sheet>
  );
}
```

Note on `jokerTakenElsewhere` in session mode: a player whose Joker is declared in this very session has `jokerUsed = true`, but `on` is also true for them, so the button stays enabled for turning it off.

- [ ] **Step 5: Wire result entry into the control room**

Replace `src/components/admin/ControlRoom.tsx`:

```tsx
"use client";

import { Plus, Spade } from "lucide-react";
import { useCallback, useState } from "react";
import { cancelSessionAction, finishSessionAction, resumeSessionAction, startSessionAction } from "@/app/admin/actions";
import type { AdminSeatView, TableView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { pad2 } from "@/lib/format";
import { Avatar } from "../common/Avatar";
import { ElapsedClock } from "../common/ElapsedClock";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { GameIcon } from "../common/GameIcon";
import { StateLabel } from "../common/StateLabel";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ResultSheet, type ResultTarget } from "./ResultSheet";
import { ScreenRemote } from "./ScreenRemote";
import { SeatSheet } from "./SeatSheet";
import { useRunner } from "./useRunner";

type AdminTable = TableView<AdminSeatView>;

export function ControlRoom() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const [seatTableId, setSeatTableId] = useState<number | null>(null);
  const [resultTarget, setResultTarget] = useState<ResultTarget | null>(null);
  const closeResult = useCallback(() => setResultTarget(null), []);
  const seatTable = snapshot.tables.find((x) => x.tableId === seatTableId) ?? null;
  const finished = snapshot.event.status === "finished";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps">{snapshot.event.name}</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-tight md:text-4xl">{t.room.title}</h1>
        </div>
        <EventStatusBadge event={snapshot.event} />
      </header>

      {snapshot.event.status !== "live" ? (
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">
          {snapshot.event.status === "draft" ? t.room.draftNotice : t.room.finishedNotice}
        </p>
      ) : null}

      <ScreenRemote />

      {snapshot.tables.length === 0 ? (
        <p className="text-muted">{t.room.noTables}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {snapshot.tables.map((table) => (
            <TableRow
              key={table.tableId}
              table={table}
              onSeat={() => setSeatTableId(table.tableId)}
              onResult={(sessionId) => setResultTarget({ mode: "session", sessionId })}
            />
          ))}
        </ul>
      )}

      {!finished ? (
        <Button
          variant="primary"
          size="lg"
          className="fixed right-4 bottom-24 z-20 shadow-[0_12px_40px_rgba(0,0,0,0.5)] md:right-10 md:bottom-10"
          onClick={() => setResultTarget({ mode: "direct" })}
        >
          <Plus className="size-5" />
          {t.room.newResult}
        </Button>
      ) : null}

      {seatTable ? (
        <SeatSheet key={seatTable.tableId} open onOpenChange={(o) => !o && setSeatTableId(null)} table={seatTable} />
      ) : null}
      {resultTarget ? <ResultSheet target={resultTarget} onClose={closeResult} /> : null}
    </div>
  );
}

function TableRow({
  table,
  onSeat,
  onResult,
}: {
  table: AdminTable;
  onSeat: () => void;
  onResult: (sessionId: number) => void;
}) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const finished = snapshot.event.status === "finished";
  const session = table.session;
  const game = session ? lookups.games.get(session.gameId) : undefined;

  const cancel = session ? (
    <ConfirmButton
      size="sm"
      variant="ghost"
      label={t.room.cancelGame}
      confirmLabel={t.common.tapToConfirm}
      disabled={pending}
      onConfirm={() => run(() => cancelSessionAction(session.id))}
    />
  ) : null;

  return (
    <li className="grid gap-3 py-4 md:grid-cols-[5rem_1fr_auto] md:items-center md:gap-6">
      <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
        <span className="font-display text-4xl leading-none tabular">{pad2(table.number)}</span>
        <StateLabel state={table.state} />
      </div>

      <div className="min-w-0">
        {session && game ? (
          <>
            <div className="flex items-center gap-2">
              <GameIcon name={game.icon} className="size-4 text-accent" />
              <span className="font-display text-lg uppercase tracking-wide">{game.name}</span>
              {session.startedAt ? (
                <ElapsedClock from={session.startedAt} to={session.finishedAt} className="ml-auto font-mono text-sm text-muted md:ml-3" />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {session.players.map((sp) => {
                const p = lookups.players.get(sp.playerId);
                if (!p) return null;
                return (
                  <span key={sp.playerId} className="flex items-center gap-1.5 text-sm">
                    <Avatar name={p.name} color={p.color} size="sm" />
                    {p.name}
                    {sp.jokerDeclared ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} aria-label={t.seat.joker} /> : null}
                  </span>
                );
              })}
            </div>
            {session.notes ? <p className="mt-1 text-xs text-muted">{session.notes}</p> : null}
          </>
        ) : (
          <span className="text-sm text-muted">{table.label ?? t.tableState.available}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {table.state === "available" ? (
          <Button variant="primary" onClick={onSeat} disabled={finished}>
            {t.room.seat}
          </Button>
        ) : null}
        {table.state === "preparing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => startSessionAction(session.id))}>
              {t.room.start}
            </Button>
            <Button onClick={onSeat}>{t.room.editSeating}</Button>
            {cancel}
          </>
        ) : null}
        {table.state === "playing" && session ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run(() => finishSessionAction(session.id))}>
              {t.room.finish}
            </Button>
            <Button disabled={finished} onClick={() => onResult(session.id)}>
              {t.room.enterResult}
            </Button>
            {cancel}
          </>
        ) : null}
        {table.state === "pending" && session ? (
          <>
            <Button variant="primary" disabled={finished} onClick={() => onResult(session.id)}>
              {t.room.enterResult}
            </Button>
            <Button disabled={pending} onClick={() => run(() => resumeSessionAction(session.id))}>
              {t.room.resume}
            </Button>
            {cancel}
          </>
        ) : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 6: Verify in the browser**

```bash
npm run typecheck && npm test
npm run dev
```

Logged in as admin at 390×844, with demo data:
1. Table 01 (Catan, playing) → Finish → Enter result. Sheet title "Catan · Table 1".
2. Tap the 4 players in order → points column shows 15.0 / 11.0 / 7.0 / 3.0 (floor 20%, weight 15).
3. Drag the last row to the top using its handle → placements renumber, points follow.
4. Tap the 2nd row's name → it and the rows below return to the unplaced chips.
5. Place everyone again → Confirm result → toast "Result saved" with "Show on screen" and "Undo"; table 01 is Available.
6. Tap Undo in the toast → table 01 back to "Results pending".
7. Enter the result again, confirm; tap "Show on screen" → toast "Sent to screen".
8. Tap the floating Result button → pick Hitster, no table, 3 players, give one a Joker, place two players with "Tie" on the 2nd → both show 1 and equal points; Confirm.
9. Joker chips for players who already used a Joker are disabled.

Expected: all steps work; the standings change is verified in Task 14.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin
git commit -m "feat(admin): add fast result entry with tap ordering, drag reorder, ties, jokers and undo toast"
```

### Task 14: Results management and animated admin leaderboard

**Files:**
- Create: `src/components/common/leaderboardDiff.ts`, `src/components/common/Leaderboard.tsx`, `src/components/admin/ResultsView.tsx`, `src/components/admin/LeaderboardView.tsx`, `src/app/admin/(panel)/results/page.tsx`, `src/app/admin/(panel)/leaderboard/page.tsx`
- Test: `src/components/common/leaderboardDiff.test.ts`

**Interfaces:**
- Consumes: `ResultSheet` (Task 13); `deleteResultAction`, `showOnScreenAction`, `undoLastAction`, `getAuditAction` (Task 9); `LeaderboardRow`, `PlayerView` (Task 4); `formatPoints` (Task 2); `AuditEntry` (Task 5); UI foundation (Task 11); `useRunner`, `useAdminLookups` (Task 12)
- Produces:
  - `interface StandingsMemory { counted: Map<number, number>; leader: number | null }`
  - `diffStandings(previous: StandingsMemory | null, rows: { playerId: number; counted: number; rank: number | null }[]): { changed: number[]; newLeader: number | null; memory: StandingsMemory }`
  - `<Leaderboard rows players showJoker? />` (reused by the public leaderboard after the finale in Task 17)
  - pages `/admin/results`, `/admin/leaderboard`

- [ ] **Step 1: Write failing diff tests**

`src/components/common/leaderboardDiff.test.ts`:

```ts
import { expect, test } from "vitest";
import { diffStandings } from "./leaderboardDiff";

const row = (playerId: number, counted: number, rank: number | null) => ({ playerId, counted, rank });

test("first observation reports nothing", () => {
  const out = diffStandings(null, [row(1, 10, 1), row(2, 5, 2)]);
  expect(out.changed).toEqual([]);
  expect(out.newLeader).toBeNull();
  expect(out.memory.leader).toBe(1);
});

test("reports players whose counted points changed", () => {
  const first = diffStandings(null, [row(1, 10, 1), row(2, 5, 2), row(3, 0, null)]);
  const second = diffStandings(first.memory, [row(1, 10, 1), row(2, 7.5, 2), row(3, 2, 3)]);
  expect(second.changed.sort()).toEqual([2, 3]);
  expect(second.newLeader).toBeNull();
});

test("reports a new leader only when an existing leader is overtaken", () => {
  const first = diffStandings(null, [row(1, 0, null), row(2, 0, null)]);
  const firstResult = diffStandings(first.memory, [row(1, 10, 1), row(2, 5, 2)]);
  expect(firstResult.newLeader).toBeNull();
  const overtaken = diffStandings(firstResult.memory, [row(2, 12, 1), row(1, 10, 2)]);
  expect(overtaken.newLeader).toBe(2);
});
```

Run: `npx vitest run src/components/common/leaderboardDiff.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement the diff helper**

`src/components/common/leaderboardDiff.ts`:

```ts
export interface StandingsMemory {
  counted: Map<number, number>;
  leader: number | null;
}

export function diffStandings(
  previous: StandingsMemory | null,
  rows: { playerId: number; counted: number; rank: number | null }[],
): { changed: number[]; newLeader: number | null; memory: StandingsMemory } {
  const memory: StandingsMemory = {
    counted: new Map(rows.map((r) => [r.playerId, r.counted])),
    leader: rows.find((r) => r.rank === 1)?.playerId ?? null,
  };
  if (!previous) return { changed: [], newLeader: null, memory };
  const changed = rows
    .filter((r) => Math.abs((previous.counted.get(r.playerId) ?? 0) - r.counted) > 1e-9)
    .map((r) => r.playerId);
  const newLeader =
    previous.leader !== null && memory.leader !== null && memory.leader !== previous.leader ? memory.leader : null;
  return { changed, newLeader, memory };
}
```

Run: `npx vitest run src/components/common/leaderboardDiff.test.ts` → Expected: PASS.

- [ ] **Step 3: Shared animated leaderboard**

`src/components/common/Leaderboard.tsx`:

```tsx
"use client";

import { ArrowDown, ArrowUp, Crown, Minus, Spade } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatPoints } from "@/domain/scoring";
import type { LeaderboardRow, PlayerView } from "@/domain/snapshot";
import { fmt, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { EASE } from "../motion/FadeRise";
import { Avatar } from "./Avatar";
import { diffStandings, type StandingsMemory } from "./leaderboardDiff";

function useStandingsChanges(rows: LeaderboardRow[]) {
  const memory = useRef<StandingsMemory | null>(null);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [newLeader, setNewLeader] = useState<number | null>(null);

  useEffect(() => {
    const diff = diffStandings(memory.current, rows);
    memory.current = diff.memory;
    if (diff.changed.length > 0) setChanged(new Set(diff.changed));
    if (diff.newLeader !== null) setNewLeader(diff.newLeader);
  }, [rows]);

  useEffect(() => {
    if (changed.size === 0) return;
    const id = setTimeout(() => setChanged(new Set()), 2000);
    return () => clearTimeout(id);
  }, [changed]);

  useEffect(() => {
    if (newLeader === null) return;
    const id = setTimeout(() => setNewLeader(null), 5000);
    return () => clearTimeout(id);
  }, [newLeader]);

  return { changed, newLeader };
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">·</span>;
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-up">
        <ArrowUp className="size-3.5" />
        {value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-down">
        <ArrowDown className="size-3.5" />
        {Math.abs(value)}
      </span>
    );
  }
  return <Minus className="size-3.5 text-muted" />;
}

export function Leaderboard({
  rows,
  players,
  showJoker = false,
}: {
  rows: LeaderboardRow[];
  players: Map<number, PlayerView>;
  showJoker?: boolean;
}) {
  const { t, lang } = useI18n();
  const { changed, newLeader } = useStandingsChanges(rows);
  const ranked = rows.filter((r) => r.rank !== null);
  const unranked = rows.filter((r) => r.rank === null);

  if (ranked.length === 0) return <p className="text-muted">{t.standings.empty}</p>;

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {newLeader !== null ? (
          <motion.div
            key={newLeader}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex items-center gap-3 rounded-md border border-accent/60 bg-accent/10 px-4 py-3"
          >
            <Crown className="size-5 text-accent" strokeWidth={1.5} />
            <span className="label-caps text-accent">{t.standings.newLeader}</span>
            <span className="font-display text-xl uppercase tracking-wide">{players.get(newLeader)?.name}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="label-caps hidden grid-cols-[3.5rem_1fr_7rem_4rem_4rem_4rem] gap-3 px-3 md:grid">
        <span>{t.standings.rank}</span>
        <span>{t.standings.player}</span>
        <span className="text-right">{t.standings.counted}</span>
        <span className="text-right">{t.standings.games}</span>
        <span className="text-right">{t.standings.wins}</span>
        <span className="text-right">{t.standings.trend}</span>
      </div>

      <ol className="divide-y divide-line border-y border-line">
        {ranked.map((row) => {
          const player = players.get(row.playerId);
          return (
            <motion.li
              key={row.playerId}
              layout
              transition={{ layout: { duration: 0.6, ease: EASE } }}
              className={cn(
                "grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 px-3 py-3 transition-colors duration-700 md:grid-cols-[3.5rem_1fr_7rem_4rem_4rem_4rem]",
                changed.has(row.playerId) && "bg-accent/10",
              )}
            >
              <span className={cn("font-display text-3xl leading-none tabular", row.rank === 1 ? "text-accent" : "text-text/80")}>
                {row.rank}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                {player ? <Avatar name={player.name} color={player.color} /> : null}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-lg uppercase tracking-wide">{player?.name}</span>
                    {showJoker && row.jokerUsed ? <Spade className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} /> : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted md:hidden">
                    <span>
                      {row.gamesPlayed} {plural(lang, row.gamesPlayed, t.plurals.games)} · {t.standings.wins} {row.wins}
                    </span>
                    <Trend value={row.trend} />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn("font-mono text-xl tabular", row.rank === 1 && "text-accent")}>{formatPoints(row.counted)}</div>
                {row.excludedSessionIds.length > 0 ? (
                  <div className="text-[0.68rem] text-muted">
                    {t.standings.raw} {formatPoints(row.raw)} · {fmt(t.standings.excluded, { n: row.excludedSessionIds.length })}
                  </div>
                ) : null}
              </div>
              <span className="hidden text-right font-mono text-muted tabular md:block">{row.gamesPlayed}</span>
              <span className="hidden text-right font-mono text-muted tabular md:block">{row.wins}</span>
              <span className="hidden justify-end md:flex">
                <Trend value={row.trend} />
              </span>
            </motion.li>
          );
        })}
      </ol>

      {unranked.length > 0 ? (
        <p className="text-xs text-muted">
          {unranked
            .map((r) => players.get(r.playerId)?.name)
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Admin leaderboard page**

`src/components/admin/LeaderboardView.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { Leaderboard } from "../common/Leaderboard";
import { useAdminLive } from "../live/LiveProvider";

export function LeaderboardView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const players = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);
  const scoring = snapshot.event.scoring;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.standings.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {scoring.strategy === "bestN" ? fmt(t.standings.strategyBestN, { n: scoring.bestN }) : t.standings.strategyTotal}
        </p>
      </header>
      <Leaderboard rows={snapshot.leaderboard} players={players} showJoker />
    </div>
  );
}
```

`src/app/admin/(panel)/leaderboard/page.tsx`:

```tsx
import { LeaderboardView } from "@/components/admin/LeaderboardView";

export default function AdminLeaderboardPage() {
  return <LeaderboardView />;
}
```

- [ ] **Step 5: Results page**

`src/components/admin/ResultsView.tsx`:

```tsx
"use client";

import { LoaderCircle, MonitorPlay, Pencil, RotateCcw, Spade, Trash } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteResultAction, getAuditAction, showOnScreenAction, undoLastAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { AuditEntry } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { GameIcon } from "../common/GameIcon";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ResultSheet } from "./ResultSheet";
import { useRunner } from "./useRunner";

export function ResultsView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [tab, setTab] = useState<"results" | "audit">("results");
  const [editing, setEditing] = useState<number | null>(null);
  const closeEdit = useCallback(() => setEditing(null), []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.results.title}</h1>
        <Button
          disabled={pending || snapshot.event.status === "finished"}
          onClick={() => run(() => undoLastAction(), { onOk: ({ summary }) => toast.success(fmt(t.results.undone, { summary })) })}
        >
          <RotateCcw className="size-4" />
          {t.results.undoLast}
        </Button>
      </header>

      <div role="tablist" className="inline-flex rounded-md border border-line p-0.5">
        {(["results", "audit"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-9 rounded px-4 font-display text-xs uppercase tracking-[0.14em]",
              tab === key ? "bg-white/10 text-text" : "text-muted",
            )}
          >
            {key === "results" ? t.results.list : t.results.audit}
          </button>
        ))}
      </div>

      {tab === "results" ? <ResultList onEdit={setEditing} /> : <AuditList version={snapshot.version} />}
      {editing !== null ? <ResultSheet target={{ mode: "edit", sessionId: editing }} onClose={closeEdit} /> : null}
    </div>
  );
}

function ResultList({ onEdit }: { onEdit: (sessionId: number) => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const finished = snapshot.event.status === "finished";

  if (snapshot.results.length === 0) return <p className="text-muted">{t.results.empty}</p>;

  return (
    <ul className="divide-y divide-line border-y border-line">
      {snapshot.results.map((r) => {
        const game = lookups.games.get(r.gameId);
        const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
        return (
          <li key={r.sessionId} className="py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs text-muted" suppressHydrationWarning>
                {formatClock(r.finishedAt)}
              </span>
              {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
              <span className="font-display uppercase tracking-wide">{game?.name}</span>
              <span className="text-xs text-muted">
                {table ? fmt(t.common.tableN, { n: table.number }) : t.results.directEntry}
                {r.durationMin !== null ? ` · ${fmt(t.common.minutesShort, { n: r.durationMin })}` : ""}
              </span>
            </div>
            <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {r.placements.map((p) => (
                <li key={p.playerId} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-5 font-display tabular", p.placement === 1 ? "text-accent" : "text-muted")}>{p.placement}</span>
                  <span className="min-w-0 flex-1 truncate">{lookups.players.get(p.playerId)?.name}</span>
                  {p.jokerDeclared ? <Spade className="size-3.5 text-accent" strokeWidth={1.75} /> : null}
                  <span className="font-mono text-xs text-muted tabular">{formatPoints(p.points)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={finished} onClick={() => onEdit(r.sessionId)}>
                <Pencil className="size-3.5" />
                {t.common.edit}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => showOnScreenAction(r.sessionId), { success: t.result.sentToScreen })}
              >
                <MonitorPlay className="size-3.5" />
                {t.results.showOnScreen}
              </Button>
              <ConfirmButton
                size="sm"
                variant="ghost"
                disabled={pending || finished}
                label={
                  <>
                    <Trash className="size-3.5" />
                    {t.common.delete}
                  </>
                }
                confirmLabel={t.common.tapToConfirm}
                onConfirm={() => run(() => deleteResultAction(r.sessionId), { success: t.results.deleted })}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AuditList({ version }: { version: number }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAuditAction().then((result) => {
      if (!cancelled && result.ok) setEntries(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (entries === null) return <LoaderCircle className="size-5 animate-spin text-muted" />;
  if (entries.length === 0) return <p className="text-muted">{t.results.auditEmpty}</p>;

  return (
    <ul className="divide-y divide-line border-y border-line">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
          <span className="font-mono text-xs text-muted" suppressHydrationWarning>
            {formatClock(e.at)}
          </span>
          <span className="font-mono text-xs text-accent">{e.action}</span>
          <span className="min-w-0 flex-1 text-sm">{e.summary}</span>
          {e.undone ? (
            <span className="rounded-sm border border-line px-1.5 py-0.5 font-display text-[0.62rem] uppercase tracking-[0.12em] text-muted">
              {t.results.undoneTag}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

`src/app/admin/(panel)/results/page.tsx`:

```tsx
import { ResultsView } from "@/components/admin/ResultsView";

export default function AdminResultsPage() {
  return <ResultsView />;
}
```

- [ ] **Step 6: Verify in the browser**

```bash
npm run typecheck && npm test
npm run dev
```

Admin at 390×844 with demo data:
1. `/admin/leaderboard` shows ranked players with points, games, wins, trend arrows, Joker marks; "Counting best 4 results".
2. In a second tab enter a result that makes a lower player overtake the leader → within ~2 s the first tab reorders rows with a slide, highlights changed rows, and shows the "New leader" banner for 5 s.
3. `/admin/results` lists results newest first with clock time, table, duration, placements and points.
4. Edit a result: swap 1st and 2nd, Save changes → list and leaderboard update.
5. Delete a result (two taps) → gone. Undo last → toast "Undone: ..." and it returns.
6. Audit log tab lists `result.create`, `result.update`, `result.delete`, `undo` entries with "Undone" tags.
7. Show on screen → toast "Sent to screen".

Expected: all steps behave as described.

- [ ] **Step 7: Commit**

```bash
git add src/components src/app/admin
git commit -m "feat(admin): add results management with audit log and animated standings"
```

### Task 15: Admin players, games and tables

**Files:**
- Create: `src/components/admin/PlayersView.tsx`, `src/components/admin/PlayerEditSheet.tsx`, `src/components/admin/GamesView.tsx`, `src/components/admin/TablesView.tsx`, `src/app/admin/(panel)/players/page.tsx`, `src/app/admin/(panel)/games/page.tsx`, `src/app/admin/(panel)/tables/page.tsx`

**Interfaces:**
- Consumes: `addPlayerAction`, `bulkAddPlayersAction`, `updatePlayerAction`, `mergePlayersAction`, `updateGameAction`, `addTableAction`, `updateTableAction`, `removeTableAction` (Task 9); `PLAYER_COLORS` (Task 4); `matchesQuery` (Task 12); `formatPoints` (Task 2); UI foundation (Task 11); `useRunner` (Task 12)
- Produces: pages `/admin/players`, `/admin/games`, `/admin/tables`; `<PlayerEditSheet player onClose />`

Game description editing is intentionally left out of Tier 1: descriptions are not shown anywhere until Tier 2 profile/game pages exist.

- [ ] **Step 1: Player edit sheet**

`src/components/admin/PlayerEditSheet.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { mergePlayersAction, updatePlayerAction } from "@/app/admin/actions";
import { PLAYER_COLORS } from "@/domain/players";
import type { AdminPlayerView } from "@/domain/snapshot";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { Switch } from "../ui/Switch";
import { matchesQuery } from "./seating";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function PlayerEditSheet({ player, onClose }: { player: AdminPlayerView; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname ?? "");
  const [color, setColor] = useState(player.color);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);

  const others = snapshot.players
    .filter((p) => p.id !== player.id && matchesQuery(p.name, mergeQuery))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={player.name}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          loading={pending}
          onClick={() => run(() => updatePlayerAction(player.id, { name, nickname, color }), { success: t.common.saved, onOk: onClose })}
        >
          {t.common.save}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || player.name} color={color} size="lg" />
          <div className="flex-1 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.players.namePlaceholder} className={inputClass} />
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.players.nicknamePlaceholder} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={c === color}
              className={cn("grid size-9 place-items-center rounded-full border-2", c === color ? "border-text" : "border-transparent")}
              style={{ backgroundColor: c }}
            >
              {c === color ? <Check className="size-4 text-bg" /> : null}
            </button>
          ))}
        </div>

        <Switch
          checked={player.active}
          onCheckedChange={(active) => run(() => updatePlayerAction(player.id, { active }))}
          label={player.active ? t.players.deactivate : t.players.activate}
          disabled={pending}
        />
      </div>

      <section className="mt-8 space-y-3 border-t border-line pt-6">
        <h3 className="label-caps">{fmt(t.players.mergeInto, { name: player.name })}</h3>
        <input value={mergeQuery} onChange={(e) => setMergeQuery(e.target.value)} placeholder={t.players.search} className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setMergeTarget(p.id)}
              aria-pressed={mergeTarget === p.id}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md border px-2.5 text-left text-sm",
                mergeTarget === p.id ? "border-accent bg-accent/10" : "border-line",
              )}
            >
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
        <ConfirmButton
          block
          disabled={mergeTarget === null || pending}
          label={t.players.merge}
          confirmLabel={t.common.tapToConfirm}
          onConfirm={() => {
            if (mergeTarget === null) return;
            run(() => mergePlayersAction({ keepId: mergeTarget, removeId: player.id }), { success: t.players.merged, onOk: onClose });
          }}
        />
      </section>
    </Sheet>
  );
}
```

- [ ] **Step 2: Players page**

`src/components/admin/PlayersView.tsx`:

```tsx
"use client";

import { ListPlus, Pencil, Spade } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { addPlayerAction, bulkAddPlayersAction } from "@/app/admin/actions";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { PlayerEditSheet } from "./PlayerEditSheet";
import { matchesQuery } from "./seating";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-display text-[0.6rem] uppercase tracking-[0.12em]",
        tone === "accent" ? "border-accent/50 text-accent" : "border-line text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function PlayersView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const closeEdit = useCallback(() => setEditingId(null), []);

  const players = useMemo(
    () =>
      snapshot.players
        .filter((p) => matchesQuery(p.name, query) || (p.nickname !== null && matchesQuery(p.nickname, query)))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [snapshot.players, query],
  );
  const editing = snapshot.players.find((p) => p.id === editingId);
  const activeCount = snapshot.players.filter((p) => p.active).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(() => addPlayerAction({ name, nickname }), {
      onOk: () => {
        setName("");
        setNickname("");
        nameRef.current?.focus();
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.players.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmt(t.players.total, { n: activeCount })}</p>
        </div>
        <Button variant="ghost" onClick={() => setBulkOpen((o) => !o)} aria-expanded={bulkOpen}>
          <ListPlus className="size-4" />
          {t.players.bulk}
        </Button>
      </header>

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.players.namePlaceholder} className={inputClass} />
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.players.nicknamePlaceholder} className={inputClass} />
        <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
          {t.players.add}
        </Button>
      </form>

      {bulkOpen ? (
        <div className="space-y-2">
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={t.players.bulkPlaceholder}
            rows={6}
            className="w-full rounded-md border border-line bg-surface-2 p-3 text-sm outline-none placeholder:text-muted focus:border-line-strong"
          />
          <Button
            disabled={!bulk.trim() || pending}
            onClick={() =>
              run(() => bulkAddPlayersAction(bulk), {
                onOk: (count) => {
                  toast.success(fmt(t.players.bulkAdded, { n: count }));
                  setBulk("");
                  setBulkOpen(false);
                },
              })
            }
          >
            {t.players.bulkSubmit}
          </Button>
        </div>
      ) : null}

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.players.search} className={inputClass} />

      <ul className="divide-y divide-line border-y border-line">
        {players.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 py-2.5", !p.active && "opacity-50")}>
            <Avatar name={p.name} color={p.color} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate">{p.name}</span>
                {p.nickname ? <span className="text-sm text-muted">{p.nickname}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.source === "checkin" ? <Badge>{t.players.checkin}</Badge> : null}
                {p.isDemo ? <Badge>{t.players.demo}</Badge> : null}
                {!p.active ? <Badge>{t.players.inactive}</Badge> : null}
                {p.jokerUsed ? (
                  <Badge tone="accent">
                    <span className="inline-flex items-center gap-1">
                      <Spade className="size-2.5" strokeWidth={2} />
                      {t.seat.jokerUsed}
                    </span>
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)} aria-label={t.common.edit}>
              <Pencil className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {editing ? <PlayerEditSheet key={editing.id} player={editing} onClose={closeEdit} /> : null}
    </div>
  );
}
```

`src/app/admin/(panel)/players/page.tsx`:

```tsx
import { PlayersView } from "@/components/admin/PlayersView";

export default function AdminPlayersPage() {
  return <PlayersView />;
}
```

- [ ] **Step 3: Games page**

`src/components/admin/GamesView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );
}

export function GamesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const floor = snapshot.event.scoring.participationFloor;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.games.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.games.weightHint}</p>
      </header>
      <ul className="divide-y divide-line border-y border-line">
        {snapshot.games.map((game) => (
          <GameRow key={`${game.id}-${snapshot.version}`} game={game} floor={floor} />
        ))}
      </ul>
    </div>
  );
}

function GameRow({ game, floor }: { game: GameFact; floor: number }) {
  const { t } = useI18n();
  const { run } = useRunner();
  const [draft, setDraft] = useState(game);

  const update = (patch: Partial<GameFact>) => {
    setDraft((d) => ({ ...d, ...patch }));
    run(() => updateGameAction(game.id, patch));
  };

  return (
    <li className="grid gap-4 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex items-center gap-3">
        <GameIcon name={game.icon} className="size-5 text-accent" />
        <div>
          <div className="font-display text-lg uppercase tracking-wide">{game.name}</div>
          <div className="font-mono text-xs text-muted tabular">
            {formatPoints(draft.weight)} / {formatPoints(draft.weight * floor)} · {fmt(t.common.minutesShort, { n: draft.durationMin })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Field label={t.games.weight}>
          <Stepper value={draft.weight} min={1} max={50} onChange={(weight) => update({ weight })} label={t.games.weight} />
        </Field>
        <Field label={t.games.players}>
          <div className="flex items-center gap-1.5">
            <Stepper value={draft.minPlayers} min={2} max={draft.maxPlayers} onChange={(minPlayers) => update({ minPlayers })} />
            <Stepper value={draft.maxPlayers} min={draft.minPlayers} max={20} onChange={(maxPlayers) => update({ maxPlayers })} />
          </div>
        </Field>
        <Field label={t.games.minutes}>
          <Stepper value={draft.durationMin} min={5} max={240} step={5} onChange={(durationMin) => update({ durationMin })} />
        </Field>
        <Switch checked={draft.allowTies} onCheckedChange={(allowTies) => update({ allowTies })} label={t.games.ties} />
        <Switch checked={draft.active} onCheckedChange={(active) => update({ active })} label={t.games.active} />
      </div>
    </li>
  );
}
```

`src/app/admin/(panel)/games/page.tsx`:

```tsx
import { GamesView } from "@/components/admin/GamesView";

export default function AdminGamesPage() {
  return <GamesView />;
}
```

- [ ] **Step 4: Tables page**

`src/components/admin/TablesView.tsx`:

```tsx
"use client";

import { Plus, Trash } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { addTableAction, removeTableAction, updateTableAction } from "@/app/admin/actions";
import type { TableFact } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function TablesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [label, setLabel] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    run(() => addTableAction(label.trim() || null), { onOk: () => setLabel("") });
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.tables.title}</h1>

      <form onSubmit={add} className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.tables.labelPlaceholder} className={inputClass} />
        <Button type="submit" variant="primary" loading={pending} className="shrink-0">
          <Plus className="size-4" />
          {t.tables.add}
        </Button>
      </form>

      <ul className="divide-y divide-line border-y border-line">
        {snapshot.allTables.map((table) => (
          <TableEditor key={`${table.id}-${snapshot.version}`} table={table} />
        ))}
      </ul>
    </div>
  );
}

function TableEditor({ table }: { table: TableFact }) {
  const { t } = useI18n();
  const { run, pending } = useRunner();
  const [label, setLabel] = useState(table.label ?? "");

  const saveLabel = () => {
    if ((table.label ?? "") !== label.trim()) run(() => updateTableAction(table.id, { label: label.trim() || null }));
  };

  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-3", !table.active && "opacity-50")}>
      <span className="w-12 font-display text-3xl leading-none tabular">{pad2(table.number)}</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={t.tables.labelPlaceholder}
        className={cn(inputClass, "min-w-40 flex-1")}
      />
      <Switch
        checked={table.active}
        onCheckedChange={(active) => run(() => updateTableAction(table.id, { active }))}
        label={table.active ? t.tables.active : t.tables.inactive}
        disabled={pending}
      />
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending}
        label={
          <>
            <Trash className="size-3.5" />
            {t.tables.remove}
          </>
        }
        confirmLabel={t.common.tapToConfirm}
        onConfirm={() =>
          run(() => removeTableAction(table.id), {
            onOk: (outcome) => toast.success(outcome === "deleted" ? t.tables.removed : t.tables.deactivated),
          })
        }
      />
    </li>
  );
}
```

`src/app/admin/(panel)/tables/page.tsx`:

```tsx
import { TablesView } from "@/components/admin/TablesView";

export default function AdminTablesPage() {
  return <TablesView />;
}
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run typecheck && npm test
npm run dev
```

Admin at 390×844:
1. `/admin/players`: add "Olena" with nickname "Lena" → appears, name field refocused.
2. Paste list with "Max", "New One", "new one" → toast "1 added" (Max exists from demo, duplicates skipped).
3. Search "ole" → only Olena. Edit Olena: rename to "Olena K", pick another color, Save → list updates.
4. Check in a duplicate via admin: add "Andrii S"; edit it → Merge into → select "Andrii" → tap Merge twice → "Players merged"; "Andrii S" disappears.
5. Deactivate a player → row dims with "Inactive" badge and they disappear from the seating sheet.
6. `/admin/games`: raise Catan weight to 16 → subline shows "16.0 / 3.2"; `/admin/leaderboard` points change within 2 s.
7. Turn off "Active" for Uno → Uno no longer offered in the seating sheet.
8. `/admin/tables`: add table with label "Window" → table 07 appears; rename via blur; Remove table 07 → "Table removed"; Remove table 01 (has history, and demo game in progress) → error toast "Finish or cancel the game at this table first."

Expected: all steps behave as described.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin src/app/admin
git commit -m "feat(admin): add players, games and tables management"
```

### Task 16: Admin settings, network address picker, data export

**Files:**
- Create: `src/components/admin/SettingsView.tsx`, `src/app/admin/(panel)/settings/page.tsx`, `src/app/admin/export/route.ts`

**Interfaces:**
- Consumes: `goLiveAction`, `finishEventAction`, `reopenEventAction`, `updateScoringAction`, `updateScreenSettingsAction`, `updateEventInfoAction`, `changePinAction`, `clearDemoDataAction` (Task 9); `listLanAddresses`, `isAdmin`, `loadFacts`, `listAudit`, `getDb` (Tasks 5, 9); `scoreResult`, `formatPoints` (Task 2); `ALL_SCENES`, `ScoringSettings` (Task 2); UI foundation (Task 11); `useRunner` (Task 12)
- Produces: page `/admin/settings`; `GET /admin/export` (admin-only JSON download `{ exportedAt, facts, audit }`)

- [ ] **Step 1: Export route**

`src/app/admin/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { listAudit, loadFacts } from "@/server/repo/facts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), facts: loadFacts(db), audit: listAudit(db, 100_000) },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="board-cup-export-${Date.now()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Settings page (server) passes detected addresses**

`src/app/admin/(panel)/settings/page.tsx`:

```tsx
import { SettingsView } from "@/components/admin/SettingsView";
import { listLanAddresses } from "@/server/network";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return <SettingsView addresses={listLanAddresses()} port={process.env.PORT ?? "3000"} />;
}
```

- [ ] **Step 3: Settings view**

`src/components/admin/SettingsView.tsx`:

```tsx
"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import {
  changePinAction,
  clearDemoDataAction,
  finishEventAction,
  goLiveAction,
  reopenEventAction,
  updateEventInfoAction,
  updateScoringAction,
  updateScreenSettingsAction,
} from "@/app/admin/actions";
import { formatPoints, scoreResult } from "@/domain/scoring";
import { ALL_SCENES, type Lang, type SceneId, type ScoringSettings } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-6">
      <h2 className="font-display text-xl uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded px-4 font-display text-xs uppercase tracking-[0.14em]",
            value === o.value ? "bg-white/10 text-text" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function SettingsView({ addresses, port }: { addresses: { name: string; address: string }[]; port: string }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.settings.title}</h1>
        <EventStatusBadge event={snapshot.event} />
      </header>
      <Section title={t.settings.event.title}>
        <Lifecycle />
        <EventInfo />
      </Section>
      <Section title={t.settings.scoring.title}>
        <ScoringControls key={snapshot.version} scoring={snapshot.event.scoring} />
      </Section>
      <Section title={t.settings.screen.title}>
        <ScreenControls key={snapshot.version} />
      </Section>
      <Section title={t.settings.network.title}>
        <Network addresses={addresses} port={port} />
      </Section>
      <Section title={t.settings.security.title}>
        <PinChange />
      </Section>
      <Section title={t.settings.data.title}>
        <DataControls />
      </Section>
    </div>
  );
}

function Lifecycle() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const hasDemo = snapshot.players.some((p) => p.isDemo);
  const [clearDemo, setClearDemo] = useState(hasDemo);
  const status = snapshot.event.status;

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-4">
      {status === "draft" ? (
        <>
          <p className="text-sm text-muted">{t.settings.event.goLiveHint}</p>
          {hasDemo ? <Switch checked={clearDemo} onCheckedChange={setClearDemo} label={t.settings.event.clearDemo} /> : null}
          <ConfirmButton
            variant="secondary"
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.goLive}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => goLiveAction(clearDemo))}
          />
        </>
      ) : null}
      {status === "live" ? (
        <>
          <p className="text-sm text-muted">{t.settings.event.finishHint}</p>
          <ConfirmButton
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.finish}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => finishEventAction())}
          />
        </>
      ) : null}
      {status === "finished" ? (
        <>
          <p className="text-sm text-muted">{t.settings.event.reopenHint}</p>
          <ConfirmButton
            variant="secondary"
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.reopen}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => reopenEventAction())}
          />
        </>
      ) : null}
    </div>
  );
}

function EventInfo() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState(snapshot.event.name);
  const [city, setCity] = useState(snapshot.event.city);
  const [year, setYear] = useState(String(snapshot.event.year));
  const [accent, setAccent] = useState(snapshot.event.accentColor);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.settings.event.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.event.city}>
        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.event.year}>
        <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className={inputClass} />
      </Field>
      <Field label={t.settings.event.accent}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-11 w-14 cursor-pointer rounded-md border border-line bg-surface-2 p-1"
          />
          <span className="font-mono text-sm text-muted">{accent}</span>
        </div>
      </Field>
      <div className="sm:col-span-2">
        <Button
          loading={pending}
          onClick={() =>
            run(() => updateEventInfoAction({ name, city, year: Number(year), accentColor: accent }), { success: t.common.saved })
          }
        >
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}

function ScoringControls({ scoring }: { scoring: ScoringSettings }) {
  const { t } = useI18n();
  const { run } = useRunner();
  const [s, setS] = useState(scoring);

  const update = (patch: Partial<ScoringSettings>) => {
    setS((current) => ({ ...current, ...patch }));
    run(() => updateScoringAction(patch));
  };

  const example = scoreResult(
    10,
    [1, 2, 3, 4].map((placement) => ({ playerId: placement, placement, jokerDeclared: false })),
    s,
  );

  return (
    <div className="space-y-5">
      <Field label={t.settings.scoring.strategy} hint={s.strategy === "total" ? t.settings.scoring.totalWarning : undefined}>
        <Segmented
          value={s.strategy}
          options={[
            { value: "bestN", label: t.settings.scoring.bestN },
            { value: "total", label: t.settings.scoring.total },
          ]}
          onChange={(strategy) => update({ strategy })}
        />
      </Field>
      {s.strategy === "bestN" ? (
        <Field label={t.settings.scoring.n}>
          <Stepper value={s.bestN} min={1} max={20} onChange={(bestN) => update({ bestN })} />
        </Field>
      ) : null}
      <Field label={t.settings.scoring.floor} hint={t.settings.scoring.floorHint}>
        <Stepper
          value={Math.round(s.participationFloor * 100)}
          min={0}
          max={50}
          step={5}
          format={(v) => `${v}%`}
          onChange={(v) => update({ participationFloor: v / 100 })}
        />
      </Field>
      <Field label={t.settings.scoring.joker}>
        <Stepper
          value={Math.round(s.jokerMultiplier * 100)}
          min={100}
          max={300}
          step={10}
          format={(v) => `×${(v / 100).toFixed(1)}`}
          onChange={(v) => update({ jokerMultiplier: v / 100 })}
        />
      </Field>
      <div className="rounded-md border border-line bg-surface px-4 py-3">
        <div className="label-caps">{fmt(t.settings.scoring.example, { w: 10 })}</div>
        <div className="mt-2 font-mono text-lg tabular">{example.map((p) => formatPoints(p.points)).join("  ·  ")}</div>
      </div>
    </div>
  );
}

function ScreenControls() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run } = useRunner();
  const [duration, setDuration] = useState(snapshot.event.sceneDurationSec);
  const [scenes, setScenes] = useState<SceneId[]>(snapshot.event.enabledScenes);
  const [showPoints, setShowPoints] = useState(snapshot.event.showPointsInReveals);
  const [lang, setLang] = useState<Lang>(snapshot.event.screenLang);

  const toggleScene = (scene: SceneId, on: boolean) => {
    const next = on ? ALL_SCENES.filter((s) => s === scene || scenes.includes(s)) : scenes.filter((s) => s !== scene);
    if (next.length === 0) return;
    setScenes(next);
    run(() => updateScreenSettingsAction({ enabledScenes: next }));
  };

  return (
    <div className="space-y-5">
      <Field label={t.settings.screen.duration}>
        <Stepper
          value={duration}
          min={5}
          max={120}
          onChange={(v) => {
            setDuration(v);
            run(() => updateScreenSettingsAction({ sceneDurationSec: v }));
          }}
        />
      </Field>
      <Field label={t.settings.screen.scenes}>
        <div className="flex flex-col">
          {ALL_SCENES.map((scene) => (
            <Switch
              key={scene}
              checked={scenes.includes(scene)}
              onCheckedChange={(on) => toggleScene(scene, on)}
              label={
                <span>
                  {t.settings.screen.sceneNames[scene]}
                  {scene === "contenders" ? <span className="block text-xs text-muted">{t.settings.screen.contendersHint}</span> : null}
                </span>
              }
            />
          ))}
        </div>
      </Field>
      <Switch
        checked={showPoints}
        onCheckedChange={(on) => {
          setShowPoints(on);
          run(() => updateScreenSettingsAction({ showPointsInReveals: on }));
        }}
        label={t.settings.screen.showPoints}
      />
      <Field label={t.settings.screen.language}>
        <Segmented
          value={lang}
          options={[
            { value: "en", label: "EN" },
            { value: "ru", label: "RU" },
          ]}
          onChange={(value) => {
            setLang(value);
            run(() => updateScreenSettingsAction({ screenLang: value }));
          }}
        />
      </Field>
    </div>
  );
}

function Network({ addresses, port }: { addresses: { name: string; address: string }[]; port: string }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [custom, setCustom] = useState(snapshot.event.publicBaseUrl ?? "");
  const current = snapshot.event.publicBaseUrl;

  return (
    <div className="space-y-4">
      <Field label={t.settings.network.baseUrl} hint={t.settings.network.baseUrlHint}>
        <div className="flex gap-2">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="http://192.168.1.20:3000" className={inputClass} />
          <Button
            className="shrink-0"
            loading={pending}
            onClick={() => run(() => updateEventInfoAction({ publicBaseUrl: custom }), { success: t.common.saved })}
          >
            {t.common.save}
          </Button>
        </div>
      </Field>
      <div className="space-y-2">
        <span className="label-caps">{t.settings.network.detected}</span>
        {addresses.length === 0 ? <p className="text-sm text-muted">{t.settings.network.none}</p> : null}
        <ul className="divide-y divide-line rounded-md border border-line">
          {addresses.map((a) => {
            const url = `http://${a.address}:${port}`;
            return (
              <li key={`${a.name}-${a.address}`} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm">{url}</div>
                  <div className="truncate text-xs text-muted">{a.name}</div>
                </div>
                <Button
                  size="sm"
                  variant={current === url ? "primary" : "secondary"}
                  disabled={pending}
                  onClick={() => {
                    setCustom(url);
                    run(() => updateEventInfoAction({ publicBaseUrl: url }), { success: t.common.saved });
                  }}
                >
                  {t.settings.network.use}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PinChange() {
  const { t } = useI18n();
  const { run, pending } = useRunner();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label={t.settings.security.currentPin}>
        <input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.security.newPin}>
        <input type="password" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </Field>
      <Button
        loading={pending}
        disabled={current.length < 4 || next.length < 4}
        onClick={() =>
          run(() => changePinAction({ current, next }), {
            success: t.settings.security.changed,
            onOk: () => {
              setCurrent("");
              setNext("");
            },
          })
        }
      >
        {t.settings.security.change}
      </Button>
    </div>
  );
}

function DataControls() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const hasDemo = snapshot.players.some((p) => p.isDemo);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href="/admin/export"
        className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-4 font-display text-sm uppercase tracking-[0.08em]"
      >
        <Download className="size-4" />
        {t.settings.data.export}
      </a>
      {hasDemo ? (
        <div className="flex flex-col gap-1">
          <ConfirmButton
            disabled={pending}
            label={t.settings.data.clearDemo}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => clearDemoDataAction(), { success: t.settings.data.cleared })}
          />
          <span className="text-xs text-muted">{t.settings.data.clearDemoHint}</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run typecheck && npm test
npm run db:reset && npm run db:seed:demo
npm run dev
```

Admin at 390×844 on `/admin/settings`:
1. Status "Starts soon"; "Also remove demo data" is on. Do not go live yet.
2. Scoring: change floor 20% → 0% → example line reads `10.0 · 6.7 · 3.3 · 0.0`; set back to 20% → `10.0 · 7.3 · 4.7 · 2.0`. `/admin/leaderboard` updates accordingly.
3. Switch strategy to Total → warning text appears; back to Best N; N stepper to 3.
4. Screen: disable "Recent results", enable "Contenders", duration 8 s, language RU. Reload the page → values persist.
5. Network: detected addresses list shows at least one `http://<ip>:3000`; tap Use → it becomes highlighted and is saved.
6. Security: current `0000`, new `5678` → "Wrong PIN."; current `1234`, new `5678` → "PIN changed". Log out and back in with `5678`, then change back to `1234`.
7. Data: "Download data (JSON)" downloads a JSON file containing `"facts"`. "Remove demo data" (two taps) → players list empty.
8. `npm run db:seed:demo` again, reload; Go live (two taps, demo removal switched off) → status "Live" with event clock. Finish event → error toast "Finish or cancel all open tables first." (demo tables open). Cancel both open tables in the control room, then Finish event → "Finished"; Reopen → "Live".

Expected: all steps behave as described.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SettingsView.tsx src/app/admin
git commit -m "feat(admin): add settings for lifecycle, scoring, projector, network, PIN and data export"
```

### Task 17: Public site — home, check-in, sealed standings

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx`, `src/app/(public)/checkin/page.tsx`, `src/app/(public)/checkin/actions.ts`, `src/app/(public)/leaderboard/page.tsx`, `src/components/public/PublicHeader.tsx`, `src/components/public/HomeView.tsx`, `src/components/public/CheckinForm.tsx`, `src/components/public/PublicLeaderboard.tsx`, `src/components/public/useCheckedIn.ts`
- Modify: `src/domain/players.ts` (generic `findSimilarPlayers`)
- Delete: `src/app/page.tsx` (placeholder from Task 1; `(public)/page.tsx` now serves `/`)

**Interfaces:**
- Consumes: `getPublicSnapshot`, `getDb`, `runPublicAction` (Tasks 5, 9); `checkIn` (Task 6); `findSimilarPlayers` (Task 4); `Leaderboard` (Task 14); `usePublicLookups`, `EventStatusBadge`, `StateLabel` (Task 12); UI foundation (Task 11); dictionaries (Task 10)
- Produces:
  - `checkInAction(input: { name: string; nickname?: string | null }): Promise<ActionResult<{ id: number; name: string }>>`
  - `useCheckedIn(players: PlayerView[]): { me: { id: number; name: string } | null; remember: (me: { id: number; name: string }) => void }` (localStorage key `bgc_player`)
  - pages `/`, `/checkin`, `/leaderboard` (all audience `public`)

- [ ] **Step 1: Remove the placeholder home page and add the public layout**

```bash
git rm src/app/page.tsx
```

`src/app/(public)/layout.tsx`:

```tsx
import { LiveProvider } from "@/components/live/LiveProvider";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Toaster } from "@/components/ui/Toaster";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20">{children}</main>
      <Toaster />
    </LiveProvider>
  );
}
```

`src/components/public/PublicHeader.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/LangProvider";
import { BrandMark } from "../brand/Wordmark";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { LangToggle } from "../common/LangToggle";
import { usePublicLive } from "../live/LiveProvider";

export function PublicHeader() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label={t.common.appName}>
          <BrandMark className="size-7" />
          <span className="hidden font-display text-sm uppercase tracking-[0.22em] sm:inline">{t.common.appName}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <EventStatusBadge event={snapshot.event} />
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Check-in action and remembered identity**

`src/app/(public)/checkin/actions.ts`:

```ts
"use server";

import type { ActionResult } from "@/lib/action";
import { runPublicAction } from "@/server/runAction";
import { checkIn } from "@/server/services/players";

export async function checkInAction(input: {
  name: string;
  nickname?: string | null;
}): Promise<ActionResult<{ id: number; name: string }>> {
  return runPublicAction((db) => {
    const id = checkIn(db, input);
    return { id, name: input.name.trim().replace(/\s+/g, " ") };
  });
}
```

`src/components/public/useCheckedIn.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayerView } from "@/domain/snapshot";

const KEY = "bgc_player";

export function useCheckedIn(players: PlayerView[]) {
  const [stored, setStored] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setStored(JSON.parse(raw) as { id: number; name: string });
    } catch {
      // storage unavailable: behave as not checked in
    }
  }, []);

  const remember = useCallback((me: { id: number; name: string }) => {
    setStored(me);
    try {
      localStorage.setItem(KEY, JSON.stringify(me));
    } catch {
      // ignore
    }
  }, []);

  const player = stored ? players.find((p) => p.id === stored.id) : undefined;
  return { me: player ? { id: player.id, name: player.name } : null, remember };
}
```

- [ ] **Step 3: Check-in page**

First make `findSimilarPlayers` generic so it accepts public `PlayerView` objects. In `src/domain/players.ts` replace its signature line (the body stays the same):

```ts
export function findSimilarPlayers<T extends { name: string }>(players: T[], name: string): T[] {
```

and remove `PlayerFact` from that file's imports if it is no longer used. Run `npx vitest run src/domain/players.test.ts` → Expected: PASS.

`src/app/(public)/checkin/page.tsx`:

```tsx
import { CheckinForm } from "@/components/public/CheckinForm";

export default function CheckinPage() {
  return <CheckinForm />;
}
```

`src/components/public/CheckinForm.tsx`:

```tsx
"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { checkInAction } from "@/app/(public)/checkin/actions";
import { findSimilarPlayers } from "@/domain/players";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { handleResult } from "@/lib/notify";
import { Avatar } from "../common/Avatar";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { Button } from "../ui/Button";
import { useCheckedIn } from "./useCheckedIn";

const inputClass =
  "h-12 w-full rounded-md border border-line bg-surface-2 px-3 text-base outline-none placeholder:text-muted focus:border-line-strong";

export function CheckinForm() {
  const { t } = useI18n();
  const { snapshot, refresh } = usePublicLive();
  const { me, remember } = useCheckedIn(snapshot.players);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [similar, setSimilar] = useState<typeof snapshot.players | null>(null);
  const [pending, startTransition] = useTransition();

  const back = (
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
      <ArrowLeft className="size-4" />
      {t.checkin.back}
    </Link>
  );

  if (snapshot.event.status === "finished") {
    return (
      <div className="space-y-6 pt-10">
        <p className="text-lg">{t.checkin.closed}</p>
        {back}
      </div>
    );
  }

  if (me) {
    return (
      <FadeRise className="space-y-6 pt-12">
        <div className="grid size-14 place-items-center rounded-full border border-accent text-accent">
          <Check className="size-7" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">{fmt(t.checkin.success, { name: me.name })}</h1>
        <p className="text-muted">{t.checkin.successHint}</p>
        {back}
      </FadeRise>
    );
  }

  const create = () =>
    startTransition(async () => {
      const result = await checkInAction({ name, nickname });
      if (handleResult(result, t)) {
        remember(result.data);
        refresh();
      }
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const matches = findSimilarPlayers(snapshot.players, name);
    if (matches.length > 0 && similar === null) {
      setSimilar(matches);
      return;
    }
    create();
  };

  return (
    <div className="space-y-8 pt-10">
      <div className="space-y-2">
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.checkin.title}</h1>
        <p className="text-muted">{t.checkin.subtitle}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label-caps">{t.checkin.name}</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSimilar(null);
            }}
            autoComplete="given-name"
            className={inputClass}
            maxLength={40}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label-caps">
            {t.checkin.nickname} <span className="normal-case tracking-normal">({t.checkin.nicknameHint})</span>
          </span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} maxLength={24} />
        </label>

        {similar && similar.length > 0 ? (
          <FadeRise className="space-y-3 rounded-md border border-accent/50 bg-accent/5 p-4">
            <p className="font-display uppercase tracking-wide">{t.checkin.similar}</p>
            <ul className="space-y-2">
              {similar.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => remember({ id: p.id, name: p.name })}
                    className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-accent"
                  >
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <span className="flex-1">{p.name}</span>
                    <span className="font-display text-xs uppercase tracking-[0.12em] text-accent">{t.checkin.thatsMe}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="submit" variant="ghost" block loading={pending}>
              {t.checkin.addNew}
            </Button>
          </FadeRise>
        ) : (
          <Button type="submit" variant="primary" size="lg" block loading={pending} disabled={!name.trim()}>
            {t.checkin.submit}
          </Button>
        )}
      </form>
      {back}
    </div>
  );
}
```

- [ ] **Step 4: Home page**

`src/app/(public)/page.tsx`:

```tsx
import { HomeView } from "@/components/public/HomeView";

export default function HomePage() {
  return <HomeView />;
}
```

`src/components/public/HomeView.tsx`:

```tsx
"use client";

import { ArrowRight, Lock, UserPlus } from "lucide-react";
import Link from "next/link";
import { ordinal, fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock, pad2 } from "@/lib/format";
import { BrandMark } from "../brand/Wordmark";
import { ElapsedClock } from "../common/ElapsedClock";
import { GameIcon } from "../common/GameIcon";
import { StateLabel } from "../common/StateLabel";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { useCheckedIn } from "./useCheckedIn";

function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 border-b border-line pb-3">
      <span className="font-mono text-xs text-accent">{index}</span>
      <span className="label-caps text-text">{children}</span>
    </h2>
  );
}

export function HomeView() {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { me } = useCheckedIn(snapshot.players);
  const activeTables = snapshot.tables.filter((x) => x.state !== "available");
  const freeCount = snapshot.tables.length - activeTables.length;

  return (
    <div className="space-y-14 pt-10">
      <FadeRise className="space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="label-caps">
            {snapshot.event.city} · {snapshot.event.year}
          </span>
        </div>
        <h1 className="font-display uppercase leading-[0.85] tracking-tight">
          <span className="block text-2xl tracking-[0.3em] text-muted sm:text-3xl">Board Games</span>
          <span className="block text-[5.5rem] sm:text-[8rem]">Cup</span>
        </h1>
        <p className="max-w-md text-muted">{t.home.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {me ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm">
              <span className="size-2 rounded-full bg-up" />
              {fmt(t.home.checkedInAs, { name: me.name })}
            </span>
          ) : snapshot.event.status !== "finished" ? (
            <Link
              href="/checkin"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-display text-sm uppercase tracking-[0.08em] text-bg"
            >
              <UserPlus className="size-4" />
              {t.home.checkIn}
            </Link>
          ) : null}
          <Link
            href="/leaderboard"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            {snapshot.leaderboard ? null : <Lock className="size-3.5" />}
            {t.home.standings}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </FadeRise>

      <section className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {[
          { label: t.home.gamesCompleted, value: snapshot.counters.gamesCompleted },
          { label: t.home.tablesActive, value: snapshot.counters.tablesActive },
          { label: t.home.players, value: snapshot.counters.players },
        ].map((c) => (
          <div key={c.label} className="px-3 py-5 first:pl-0">
            <div className="font-display text-4xl tabular sm:text-5xl">{c.value}</div>
            <div className="mt-1 text-xs text-muted">{c.label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <SectionTitle index="01">{t.home.liveRoom}</SectionTitle>
        {activeTables.length === 0 ? <p className="text-muted">{t.home.allTablesFree}</p> : null}
        <ul className="divide-y divide-line">
          {activeTables.map((table) => {
            const session = table.session;
            const game = session ? lookups.games.get(session.gameId) : undefined;
            return (
              <li key={table.tableId} className="grid grid-cols-[3.5rem_1fr] gap-3 py-4">
                <span className="font-display text-3xl leading-none tabular text-text/80">{pad2(table.number)}</span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                    <span className="font-display text-lg uppercase tracking-wide">{game?.name}</span>
                    <StateLabel state={table.state} />
                    {session?.startedAt ? (
                      <ElapsedClock from={session.startedAt} to={session.finishedAt} className="ml-auto font-mono text-sm text-muted" />
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">
                    {session?.players.map((p) => lookups.players.get(p.playerId)?.name).filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {activeTables.length > 0 && freeCount > 0 ? (
          <p className="text-xs text-muted">
            {freeCount} × {t.tableState.available}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionTitle index="02">{t.home.recentResults}</SectionTitle>
        {snapshot.recentResults.length === 0 ? <p className="text-muted">{t.home.noResults}</p> : null}
        <ul className="divide-y divide-line">
          {snapshot.recentResults.slice(0, 5).map((r) => {
            const game = lookups.games.get(r.gameId);
            const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
            return (
              <li key={r.sessionId} className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : null}
                  <span className="font-display uppercase tracking-wide">{game?.name}</span>
                  {table ? <span className="text-xs text-muted">{fmt(t.common.tableN, { n: table.number })}</span> : null}
                  <span className="ml-auto font-mono text-xs text-muted" suppressHydrationWarning>
                    {formatClock(r.finishedAt)}
                  </span>
                </div>
                <ol className="flex flex-wrap gap-x-5 gap-y-1">
                  {r.placements.slice(0, 3).map((p) => (
                    <li key={p.playerId} className="flex items-baseline gap-1.5 text-sm">
                      <span className={cn("font-mono text-xs", p.placement === 1 ? "text-accent" : "text-muted")}>
                        {ordinal(lang, p.placement)}
                      </span>
                      <span className={p.placement === 1 ? "text-text" : "text-text/80"}>{lookups.players.get(p.playerId)?.name}</span>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Sealed standings page**

`src/app/(public)/leaderboard/page.tsx`:

```tsx
import { PublicLeaderboard } from "@/components/public/PublicLeaderboard";

export default function LeaderboardPage() {
  return <PublicLeaderboard />;
}
```

`src/components/public/PublicLeaderboard.tsx`:

```tsx
"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/LangProvider";
import { Leaderboard } from "../common/Leaderboard";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

export function PublicLeaderboard() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const players = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players]);

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.leaderboard.back}
      </Link>
      {snapshot.leaderboard ? (
        <>
          <h1 className="font-display text-4xl uppercase tracking-tight">{t.leaderboard.title}</h1>
          <Leaderboard rows={snapshot.leaderboard} players={players} />
        </>
      ) : (
        <FadeRise className="space-y-5 border-y border-line py-12 text-center">
          <Lock className="mx-auto size-8 text-accent" strokeWidth={1.25} />
          <h1 className="font-display text-3xl uppercase tracking-tight">{t.leaderboard.lockedTitle}</h1>
          <p className="mx-auto max-w-sm text-muted">{t.leaderboard.lockedBody}</p>
        </FadeRise>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify in the browser**

```bash
npm run typecheck && npm test
npm run db:reset && npm run db:seed:demo
npm run dev
```

Phone viewport 390×844, a fresh browser profile (no admin cookie):
1. `/` shows the brand hero, "Warsaw · 2026", counters (15 games completed, 2 tables active, 22 players), live room with tables 01 and 02 and a ticking clock on 01, and the last 5 results with ordinals.
2. View page source / network response of `/api/live?v=0` → no `"points"`, `"rank"` or `"jokerDeclared"` keys.
3. `/leaderboard` shows "Standings are sealed" with the lock.
4. `/checkin`: type "andrii" → submit → "Is this you?" lists Andrii. Tap "That's me" → success screen; `/` now says "Checked in as Andrii".
5. Clear site data, `/checkin`, enter "Olena" → "You're in, Olena."; the admin players page shows Olena with a "Check-in" badge within 2 s.
6. In an admin tab, record a result → the home page's recent results and counters update within 2 s without reload.
7. Switch to RU → all public copy switches to Russian.

Expected: all steps behave as described.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(public): add event home, self check-in and sealed standings page"
```

### Task 18: Projector screen — stage, rotating scenes, announcements, remote control

**Files:**
- Create: `src/app/screen/page.tsx`, `src/components/screen/logic.ts`, `src/components/screen/Stage.tsx`, `src/components/screen/useRotation.ts`, `src/components/screen/useScreenChrome.ts`, `src/components/screen/ScreenApp.tsx`, `src/components/screen/ScreenFooter.tsx`, `src/components/screen/AnnouncementPlayer.tsx`, `src/components/screen/ResultReveal.tsx`, `src/components/screen/MilestoneCard.tsx`, `src/components/screen/scenes/SceneTitle.tsx`, `src/components/screen/scenes/SceneRoom.tsx`, `src/components/screen/scenes/SceneRecent.tsx`, `src/components/screen/scenes/SceneCounters.tsx`, `src/components/screen/scenes/SceneContenders.tsx`
- Modify: `src/app/globals.css` (sweep keyframes)
- Test: `src/components/screen/logic.test.ts`

**Interfaces:**
- Consumes: `getPublicSnapshot`, `getDb` (Tasks 5, 9); `LiveProvider`, `usePublicLive` (Task 11); `LangProvider`, `getDict`, `fmt`, `ordinal`, `plural` (Task 10); `PublicSnapshot`, `ScreenAnnouncement`, `ANNOUNCEMENT_WINDOW_MS` (Task 4); `SceneId` (Task 2); `usePublicLookups`, `EventStatusBadge` (Task 12); motion helpers, `GameIcon`, `ElapsedClock`, `BrandMark` (Task 11)
- Produces:
  - `availableScenes(enabled: SceneId[], snapshot: Pick<PublicSnapshot, "recentResults" | "contenders">): SceneId[]`
  - `nextAnnouncements(all: ScreenAnnouncement[], lastSeenId: number, now: number, windowMs?: number): ScreenAnnouncement[]`
  - `revealTimeline(nonWinnerCount: number): { titleMs: number; firstPlaceMs: number; stepMs: number; winnerMs: number; doneMs: number }`
  - `useRotation(scenes: SceneId[], durationMs: number, paused: boolean, skipNonce: number): { scene: SceneId; cycle: number }`
  - page `/screen` (always public audience)

- [ ] **Step 1: Write failing screen logic tests**

`src/components/screen/logic.test.ts`:

```ts
import { expect, test } from "vitest";
import type { ScreenAnnouncement } from "@/domain/snapshot";
import { availableScenes, nextAnnouncements, revealTimeline } from "./logic";

const result = { sessionId: 1, gameId: 1, tableId: 1, startedAt: 0, finishedAt: 0, durationMin: null, placements: [] };

test("availableScenes drops empty scenes and never returns an empty list", () => {
  expect(availableScenes(["title", "recent", "contenders", "room"], { recentResults: [], contenders: null })).toEqual([
    "title",
    "room",
  ]);
  expect(availableScenes(["recent", "contenders"], { recentResults: [result], contenders: [3] })).toEqual([
    "recent",
    "contenders",
  ]);
  expect(availableScenes(["recent"], { recentResults: [], contenders: [] })).toEqual(["title"]);
});

test("nextAnnouncements keeps unseen, recent announcements in id order", () => {
  const all: ScreenAnnouncement[] = [
    { id: 5, createdAt: 9_000, type: "milestone", count: 10 },
    { id: 3, createdAt: 9_500, type: "milestone", count: 25 },
    { id: 7, createdAt: 1_000, type: "milestone", count: 50 },
    { id: 6, createdAt: 9_900, type: "result_reveal", result },
  ];
  expect(nextAnnouncements(all, 4, 10_000, 5_000).map((a) => a.id)).toEqual([5, 6]);
});

test("revealTimeline spaces placements and ends after the winner hold", () => {
  const t = revealTimeline(3);
  expect(t.titleMs).toBe(2200);
  expect(t.firstPlaceMs).toBe(2600);
  expect(t.winnerMs).toBe(2600 + 3 * 900 + 700);
  expect(t.doneMs).toBe(t.winnerMs + 5000);
});
```

Run: `npx vitest run src/components/screen/logic.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implement screen logic**

`src/components/screen/logic.ts`:

```ts
import { ANNOUNCEMENT_WINDOW_MS, type PublicSnapshot, type ScreenAnnouncement } from "@/domain/snapshot";
import type { SceneId } from "@/domain/types";

export function availableScenes(
  enabled: SceneId[],
  snapshot: Pick<PublicSnapshot, "recentResults" | "contenders">,
): SceneId[] {
  const scenes = enabled.filter((scene) => {
    if (scene === "recent") return snapshot.recentResults.length > 0;
    if (scene === "contenders") return (snapshot.contenders?.length ?? 0) > 0;
    return true;
  });
  return scenes.length > 0 ? scenes : ["title"];
}

export function nextAnnouncements(
  all: ScreenAnnouncement[],
  lastSeenId: number,
  now: number,
  windowMs = ANNOUNCEMENT_WINDOW_MS,
): ScreenAnnouncement[] {
  return all.filter((a) => a.id > lastSeenId && a.createdAt >= now - windowMs).sort((a, b) => a.id - b.id);
}

const TITLE_MS = 2200;
const FIRST_PLACE_MS = 2600;
const STEP_MS = 900;
const WINNER_PAUSE_MS = 700;
const WINNER_HOLD_MS = 5000;

export function revealTimeline(nonWinnerCount: number) {
  const winnerMs = FIRST_PLACE_MS + nonWinnerCount * STEP_MS + WINNER_PAUSE_MS;
  return {
    titleMs: TITLE_MS,
    firstPlaceMs: FIRST_PLACE_MS,
    stepMs: STEP_MS,
    winnerMs,
    doneMs: winnerMs + WINNER_HOLD_MS,
  };
}
```

Run: `npx vitest run src/components/screen/logic.test.ts` → Expected: PASS.

- [ ] **Step 3: Stage, rotation, chrome hooks, sweep keyframes**

Append to `src/app/globals.css`:

```css
@keyframes light-sweep {
  from {
    transform: translateX(-120%) skewX(-18deg);
  }
  to {
    transform: translateX(220%) skewX(-18deg);
  }
}

@keyframes hairline-scan {
  from {
    transform: scaleX(0);
    transform-origin: left;
  }
  to {
    transform: scaleX(1);
    transform-origin: left;
  }
}

@utility animate-light-sweep {
  animation: light-sweep 1.6s var(--ease-out-quint) 0.2s both;
}

@utility animate-hairline-scan {
  animation: hairline-scan var(--scene-ms, 12000ms) linear both;
}
```

`src/components/screen/Stage.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

/** A fixed 1920x1080 canvas scaled to fit any projector resolution. All screen sizes are in px on this canvas. */
export function Stage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070708]">
      <div
        className="absolute top-1/2 left-1/2 h-[1080px] w-[1920px] overflow-hidden"
        style={{
          transform: `translate(-50%, -50%) scale(${scale})`,
          background: "radial-gradient(120% 90% at 50% 40%, #121214 0%, #0b0b0c 55%, #060607 100%)",
          opacity: scale === 0 ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

`src/components/screen/useRotation.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneId } from "@/domain/types";

export function useRotation(scenes: SceneId[], durationMs: number, paused: boolean, skipNonce: number) {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const lastNonce = useRef(skipNonce);
  const count = Math.max(1, scenes.length);

  const advance = () => {
    setIndex((i) => (i + 1) % count);
    setCycle((c) => c + 1);
  };

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(advance, durationMs);
    return () => clearTimeout(id);
    // advance only depends on count, which is listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, paused, durationMs, count]);

  useEffect(() => {
    if (skipNonce === lastNonce.current) return;
    lastNonce.current = skipNonce;
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipNonce]);

  return { scene: scenes[index % count] ?? "title", cycle };
}
```

`src/components/screen/useScreenChrome.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Hides the cursor after 3 s idle and keeps the display awake while the screen page is open. */
export function useScreenChrome(): { controlsVisible: boolean } {
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      document.body.style.cursor = "default";
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        document.body.style.cursor = "none";
        setControlsVisible(false);
      }, 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  return { controlsVisible };
}
```

- [ ] **Step 4: Scenes**

`src/components/screen/scenes/SceneTitle.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { BrandMark } from "@/components/brand/Wordmark";
import { ElapsedClock } from "@/components/common/ElapsedClock";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";

export function SceneTitle({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const e = snapshot.event;
  const statusLine = e.status === "draft" ? t.screen.startsSoon : e.status === "finished" ? t.screen.finished : t.screen.liveEvent;

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: EASE }}>
        <BrandMark className="size-[140px] text-text" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.8em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        className="mt-12 font-display text-[56px] uppercase text-muted"
      >
        Board Games
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
        className="font-display text-[340px] font-semibold uppercase leading-[0.82] tracking-tight"
      >
        Cup
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="mt-14 flex items-center gap-10 font-display text-[36px] uppercase tracking-[0.3em] text-muted"
      >
        <span>{e.city}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span>{e.year}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span className="text-accent">{statusLine}</span>
      </motion.div>
      {e.startedAt ? (
        <ElapsedClock from={e.startedAt} to={e.finishedAt} className="mt-10 font-mono text-[64px] text-text/90" />
      ) : null}
    </div>
  );
}
```

`src/components/screen/scenes/SceneRoom.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { ElapsedClock } from "@/components/common/ElapsedClock";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { LivePulse } from "@/components/motion/LivePulse";
import type { PublicSnapshot } from "@/domain/snapshot";
import { plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";

export function SceneRoom({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const tables = snapshot.tables.slice(0, 12);
  const dense = tables.length > 8;

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="01" title={t.screen.liveRoom} />
      <div className={cn("mt-14 grid flex-1 content-start gap-x-16", dense ? "grid-cols-3 gap-y-8" : "grid-cols-2 gap-y-10")}>
        {tables.map((table, i) => {
          const session = table.session;
          const game = session ? lookups.games.get(session.gameId) : undefined;
          const available = table.state === "available";
          return (
            <motion.div
              key={table.tableId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.07 }}
              className={cn("grid grid-cols-[150px_1fr] items-center border-t border-line pt-6", available && "opacity-40")}
            >
              <span className={cn("font-display leading-none tabular", dense ? "text-[84px]" : "text-[110px]")}>{pad2(table.number)}</span>
              <div className="min-w-0">
                {game && session ? (
                  <>
                    <div className="flex items-center gap-4">
                      <GameIcon name={game.icon} className="size-[40px] text-accent" />
                      <span className={cn("truncate font-display uppercase tracking-wide", dense ? "text-[44px]" : "text-[58px]")}>{game.name}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-6 text-[30px] text-muted">
                      {table.state === "playing" ? <LivePulse className="size-3.5" /> : null}
                      <span>
                        {session.players.length} {plural(lang, session.players.length, t.plurals.players)}
                      </span>
                      {session.startedAt ? (
                        <ElapsedClock from={session.startedAt} to={session.finishedAt} className="font-mono text-text/90" />
                      ) : (
                        <span>{t.tableState[table.state]}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className={cn("font-display uppercase tracking-[0.2em] text-muted", dense ? "text-[40px]" : "text-[48px]")}>
                    {table.label ?? t.tableState.available}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      {snapshot.counters.tablesActive === 0 ? (
        <p className="font-display text-[40px] uppercase tracking-[0.2em] text-muted">{t.screen.allTablesFree}</p>
      ) : null}
    </div>
  );
}

export function SceneHeading({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="flex items-end gap-8 border-b border-line-strong pb-6">
      <span className="font-mono text-[34px] text-accent">{index}</span>
      <motion.h2
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.9, ease: EASE }}
        className="font-display text-[88px] uppercase leading-none tracking-tight"
      >
        {title}
      </motion.h2>
      {note ? <span className="mb-2 ml-auto text-[30px] text-muted">{note}</span> : null}
    </div>
  );
}
```

`src/components/screen/scenes/SceneRecent.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { SceneHeading } from "./SceneRoom";

export function SceneRecent({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const results = snapshot.recentResults.slice(0, 3);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="02" title={t.screen.recentResults} />
      <div className="mt-16 grid flex-1 grid-cols-3 gap-16">
        {results.map((r, i) => {
          const game = lookups.games.get(r.gameId);
          const table = r.tableId !== null ? lookups.tables.get(r.tableId) : undefined;
          return (
            <motion.div
              key={r.sessionId}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.2 + i * 0.15 }}
              className="flex flex-col border-t border-line pt-8"
            >
              <div className="flex items-center gap-4">
                {game ? <GameIcon name={game.icon} className="size-[44px] text-accent" /> : null}
                <span className="truncate font-display text-[56px] uppercase leading-none tracking-wide">{game?.name}</span>
              </div>
              <span className="mt-3 font-display text-[28px] uppercase tracking-[0.2em] text-muted">
                {table ? fmt(t.common.tableN, { n: table.number }) : ""}
              </span>
              <ol className="mt-10 space-y-5">
                {r.placements.slice(0, 5).map((p) => (
                  <li key={p.playerId} className="flex items-baseline gap-6">
                    <span className={cn("w-[90px] font-mono text-[32px]", p.placement === 1 ? "text-accent" : "text-muted")}>
                      {ordinal(lang, p.placement)}
                    </span>
                    <span className={cn("truncate font-display uppercase tracking-wide", p.placement === 1 ? "text-[56px]" : "text-[40px] text-text/80")}>
                      {lookups.players.get(p.playerId)?.name}
                    </span>
                  </li>
                ))}
              </ol>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

`src/components/screen/scenes/SceneCounters.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneCounters({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const items = [
    { label: t.screen.gamesCompleted, value: snapshot.counters.gamesCompleted },
    { label: t.screen.tablesActive, value: snapshot.counters.tablesActive },
    { label: t.screen.players, value: snapshot.counters.players },
  ];

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="03" title={t.screen.liveEvent} />
      <div className="grid flex-1 grid-cols-3 items-center divide-x divide-line">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.2 + i * 0.2 }}
            className="px-14 first:pl-0"
          >
            <div className="font-display text-[300px] leading-none tabular">{item.value}</div>
            <div className="mt-6 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{item.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

`src/components/screen/scenes/SceneContenders.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { SceneHeading } from "./SceneRoom";

export function SceneContenders({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="04" title={t.screen.contenders} note={t.screen.contendersNote} />
      <div className="flex flex-1 flex-col justify-center gap-6">
        {(snapshot.contenders ?? []).map((id, i) => {
          const p = lookups.players.get(id);
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.18 }}
              className="flex items-center gap-10 border-b border-line pb-6"
            >
              <span className="size-5 rounded-full" style={{ backgroundColor: p?.color }} />
              <span className="font-display text-[110px] uppercase leading-none tracking-tight">{p?.name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Announcements**

`src/components/screen/ResultReveal.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import { formatPoints } from "@/domain/scoring";
import type { PublicPlacementView, PublicSnapshot, ResultView } from "@/domain/snapshot";
import { fmt, ordinal } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { revealTimeline } from "./logic";

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
  const [phase, setPhase] = useState<"title" | "places" | "winner">("title");
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timeline = revealTimeline(others.length);
    const timers = [
      setTimeout(() => setPhase("places"), timeline.titleMs),
      ...others.map((_, i) => setTimeout(() => setRevealed(i + 1), timeline.firstPlaceMs + i * timeline.stepMs)),
      setTimeout(() => setPhase("winner"), timeline.winnerMs),
      setTimeout(onDone, timeline.doneMs),
    ];
    return () => timers.forEach(clearTimeout);
  }, [others.length, onDone]);

  // Reveal from last place upwards: the last `revealed` entries of the descending list are visible.
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
      <div className="grid h-full grid-cols-[1fr_780px] gap-20 px-[120px] py-[120px]">
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
          <motion.h2
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
            className="mt-6 font-display text-[170px] uppercase leading-[0.9] tracking-tight"
          >
            {game?.name}
          </motion.h2>

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
                  <span className="font-display text-[190px] uppercase leading-none tracking-tight">
                    {lookups.players.get(w.playerId)?.name}
                  </span>
                  {w.points !== undefined ? (
                    <span className="font-mono text-[60px] text-accent">{formatPoints(w.points)}</span>
                  ) : null}
                </div>
              ))}
              <span
                aria-hidden
                className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
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
                    <span className="flex-1 truncate font-display text-[64px] uppercase tracking-wide">
                      {lookups.players.get(p.playerId)?.name}
                    </span>
                    {p.points !== undefined ? (
                      <span className={cn("font-mono text-[40px] text-muted")}>{formatPoints(p.points)}</span>
                    ) : null}
                  </motion.li>
                );
              })}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}
```

`src/components/screen/MilestoneCard.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { EASE } from "@/components/motion/FadeRise";
import { useI18n } from "@/i18n/LangProvider";

export function MilestoneCard({ count, onDone }: { count: number; onDone: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const id = setTimeout(onDone, 5000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070708]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE }}
        className="font-display text-[520px] leading-none tabular text-accent"
      >
        {count}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.8em" }}
        animate={{ opacity: 1, letterSpacing: "0.35em" }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
        className="font-display text-[64px] uppercase"
      >
        {t.screen.milestone}
      </motion.div>
    </motion.div>
  );
}
```

`src/components/screen/AnnouncementPlayer.tsx`:

```tsx
"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSnapshot, ScreenAnnouncement } from "@/domain/snapshot";
import { nextAnnouncements } from "./logic";
import { MilestoneCard } from "./MilestoneCard";
import { ResultReveal } from "./ResultReveal";

const SEEN_KEY = "bgc_screen_seen";

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // ignore
  }
}

/** Plays queued announcements one at a time; reports whether something is on screen. */
export function AnnouncementPlayer({
  snapshot,
  onActiveChange,
}: {
  snapshot: PublicSnapshot;
  onActiveChange: (active: boolean) => void;
}) {
  const [queue, setQueue] = useState<ScreenAnnouncement[]>([]);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (seen.current === null) seen.current = readSeen();
    const fresh = nextAnnouncements(snapshot.announcements, seen.current, Date.now());
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    writeSeen(seen.current);
    setQueue((q) => [...q, ...fresh]);
  }, [snapshot.announcements]);

  const current = queue[0];

  useEffect(() => {
    onActiveChange(Boolean(current));
  }, [current, onActiveChange]);

  const done = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <AnimatePresence>
      {current?.type === "result_reveal" ? (
        <ResultReveal key={current.id} snapshot={snapshot} result={current.result} onDone={done} />
      ) : null}
      {current?.type === "milestone" ? <MilestoneCard key={current.id} count={current.count} onDone={done} /> : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 6: Footer, app, page**

`src/components/screen/ScreenFooter.tsx`:

```tsx
"use client";

import { BrandMark } from "@/components/brand/Wordmark";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { SceneId } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function ScreenFooter({
  snapshot,
  scenes,
  scene,
  cycle,
  paused,
}: {
  snapshot: PublicSnapshot;
  scenes: SceneId[];
  scene: SceneId;
  cycle: number;
  paused: boolean;
}) {
  const { t } = useI18n();
  const url = snapshot.event.publicBaseUrl?.replace(/^https?:\/\//, "");

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 h-[110px] border-t border-line px-[120px]">
      {!paused ? (
        <span
          key={`${scene}-${cycle}`}
          className="animate-hairline-scan absolute top-[-1px] left-0 h-px w-full bg-accent/70"
          style={{ ["--scene-ms" as string]: `${snapshot.event.sceneDurationSec * 1000}ms` }}
        />
      ) : null}
      <div className="flex h-full items-center gap-8">
        <BrandMark className="size-[44px] text-text" />
        <span className="font-display text-[26px] uppercase tracking-[0.3em]">Board Games Cup</span>
        <span className="font-display text-[22px] uppercase tracking-[0.3em] text-muted">
          {snapshot.event.city} · {snapshot.event.year}
        </span>
        <div className="mx-auto flex gap-3">
          {scenes.map((s) => (
            <span key={s} className={cn("h-[6px] w-[34px] rounded-full", s === scene ? "bg-text" : "bg-line-strong")} />
          ))}
        </div>
        {url ? (
          <span className="text-[24px] text-muted">
            {t.screen.follow} <span className="font-mono text-text">{url}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

`src/components/screen/ScreenApp.tsx`:

```tsx
"use client";

import { Maximize } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { SceneId } from "@/domain/types";
import { LangProvider, useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { usePublicLive } from "../live/LiveProvider";
import { EASE } from "../motion/FadeRise";
import { AnnouncementPlayer } from "./AnnouncementPlayer";
import { availableScenes } from "./logic";
import { SceneContenders } from "./scenes/SceneContenders";
import { SceneCounters } from "./scenes/SceneCounters";
import { SceneRecent } from "./scenes/SceneRecent";
import { SceneRoom } from "./scenes/SceneRoom";
import { SceneTitle } from "./scenes/SceneTitle";
import { ScreenFooter } from "./ScreenFooter";
import { Stage } from "./Stage";
import { useRotation } from "./useRotation";
import { useScreenChrome } from "./useScreenChrome";

const SCENES: Record<SceneId, (props: { snapshot: PublicSnapshot }) => React.ReactNode> = {
  title: SceneTitle,
  room: SceneRoom,
  recent: SceneRecent,
  counters: SceneCounters,
  contenders: SceneContenders,
};

export function ScreenApp() {
  const { snapshot } = usePublicLive();
  return (
    <LangProvider lang={snapshot.event.screenLang}>
      <ScreenInner snapshot={snapshot} />
    </LangProvider>
  );
}

function ScreenInner({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const { controlsVisible } = useScreenChrome();
  const [announcing, setAnnouncing] = useState(false);
  const onActiveChange = useCallback((active: boolean) => setAnnouncing(active), []);

  const scenes = availableScenes(snapshot.event.enabledScenes, snapshot);
  const paused = snapshot.event.screenControl.paused || announcing;
  const { scene, cycle } = useRotation(scenes, snapshot.event.sceneDurationSec * 1000, paused, snapshot.event.screenControl.skipNonce);
  const Scene = SCENES[scene];

  return (
    <Stage>
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
}
```

`src/app/screen/page.tsx`:

```tsx
import { LiveProvider } from "@/components/live/LiveProvider";
import { ScreenApp } from "@/components/screen/ScreenApp";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

/** Always the public audience, even in a browser that holds the admin cookie. */
export default function ScreenPage() {
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <ScreenApp />
    </LiveProvider>
  );
}
```

- [ ] **Step 7: Verify on a projector-sized viewport**

```bash
npm run typecheck && npm test
npm run db:reset && npm run db:seed:demo
npm run dev
```

Browser at 1920×1080 on `/screen`, logged in as admin in the same browser (to prove the audience is still public), admin phone view in a second window:
1. Scenes rotate every 12 s: Title (BOARD GAMES / CUP, Warsaw · 2026), Live room (tables 01 and 02 highlighted, others dimmed, clock ticking on 01), Recent results (3 columns), Live event counters. The footer hairline fills during each scene and the dots track the current scene.
2. Network tab: `/api/live` requests use `aud=public`; responses contain no `"points"` or `"rank"`.
3. Remote: Pause → rotation stops on the current scene; Resume → continues; Next scene → advances immediately.
4. Enter a result on the phone and tap "Show on screen" → within 2 s the reveal plays: game title, places from last to 2nd appear one by one, then WINNER with the name and a light sweep; after ~5 s it returns to rotation.
5. Settings: enable "Show game points in result reveals", replay last result → points appear beside names.
6. Settings: enable Contenders → a "In contention" scene with 5 names alphabetically. Set screen language RU → headings switch to Russian.
7. Reload `/screen` → the last reveal does not replay.
8. Record results until 10 exist after a reset without demo data (or 25 with demo data) → the milestone card shows the count.
9. Resize to 1280×720 and 3840×2160 → layout scales proportionally with no overflow. Mouse idle 3 s → cursor and Fullscreen button hide.

Expected: all steps behave as described.

- [ ] **Step 8: Commit**

```bash
git add src/app/screen src/components/screen src/app/globals.css
git commit -m "feat(screen): add projector stage with rotating scenes, result reveal and milestone announcements"
```

### Task 19: README, Windows event-night tooling, end-to-end verification

**Files:**
- Create: `README.md` (replace the generated one), `scripts/windows-firewall.ps1`, `scripts/reset-pin.ts`
- Modify: `package.json` (add `event` script)

**Interfaces:**
- Consumes: everything from Tasks 1–18
- Produces: documentation and a verified Tier 1 build

- [ ] **Step 1: Event script and firewall helper**

Add to `package.json` `"scripts"`:

```json
{
  "event": "npm run build && npm run start",
  "pin:reset": "tsx scripts/reset-pin.ts"
}
```

`scripts/reset-pin.ts` (resets a forgotten PIN from `.env` without touching event data; safe while the server runs thanks to WAL and the busy timeout):

```ts
import { eq } from "drizzle-orm";
import { hashPin } from "../src/server/auth/pin";
import { defaultDbPath, openDb } from "../src/server/db/client";
import * as s from "../src/server/db/schema";
import { loadEnv } from "./env";

loadEnv();
const pin = process.env.ADMIN_PIN;
if (!pin || !/^\d{4,8}$/.test(pin)) {
  console.error("Set ADMIN_PIN (4-8 digits) in .env first.");
  process.exit(1);
}
const db = openDb(defaultDbPath());
db.update(s.event).set({ adminPinHash: hashPin(pin) }).where(eq(s.event.id, 1)).run();
db.$client.close();
console.log("Admin PIN reset from .env.");
```

`scripts/windows-firewall.ps1`:

```powershell
# Run once in an elevated PowerShell on the event laptop.
# Allows phones on the local Wi-Fi to reach the Board Games Cup server on port 3000 (Private networks only).
New-NetFirewallRule -DisplayName "Board Games Cup (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
Write-Host "Firewall rule added. Make sure the Wi-Fi network profile is set to Private."
```

- [ ] **Step 2: Write the README**

Replace `README.md`:

````markdown
# Board Games Cup

A live tournament platform for a one-evening board game event: the organizer runs tables and enters results from a phone, participants follow along on their phones, and a projector shows a cinematic, anonymous view of the room. Everything runs on one laptop with a local SQLite database.

## Quick start (development)

```bash
npm install
cp .env.example .env          # set ADMIN_PIN
npm run setup                 # create database, games, tables
npm run db:seed:demo          # optional: 22 demo players and 15 results
npm run dev                   # http://localhost:3000
```

| URL | Who |
|---|---|
| `/` | Participants: live room, recent results, check-in |
| `/checkin` | Self check-in |
| `/leaderboard` | Sealed until the finale |
| `/screen` | Projector (always anonymous) |
| `/admin` | Organizer (PIN) |

## Event night on Windows

1. Install Node.js 22 LTS on Windows.
2. Copy the project to a Windows folder such as `C:\board-cup` (not a `\\wsl$` path).
3. In that folder:
   ```bat
   npm ci
   copy .env.example .env
   notepad .env
   npm run setup
   npm run event
   ```
   `npm run event` builds once and starts the production server on port 3000. The build downloads fonts, so run it while online.
4. Allow inbound connections: run `scripts\windows-firewall.ps1` in an elevated PowerShell, and set the Wi-Fi network profile to Private.
5. Open `http://localhost:3000/admin`, log in, go to Settings → Network and press Use next to the Wi-Fi address (for example `http://192.168.100.7:3000`). Ignore VPN or `vEthernet` addresses.
6. From a phone on the same Wi-Fi, open that address. If it does not load, the venue Wi-Fi probably isolates clients: turn on Windows Mobile Hotspot and connect phones to it.
7. Projector: connect via HDMI as an extended display, open `http://localhost:3000/screen` in Chrome, press Fullscreen (or run Chrome with `--kiosk`).
8. Disable sleep on the laptop and keep it plugged in.
9. In Settings, remove demo data and press Go live when the evening starts.

Backups are written automatically to `data/backups/` at most every 5 minutes after changes. `npm run backup` takes one on demand.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on all interfaces |
| `npm run event` | Production build + start (use on event night) |
| `npm run setup` / `db:migrate` / `db:seed` | Apply migrations and create base data (idempotent) |
| `npm run db:seed:demo` | Add demo players and results (marked as demo) |
| `npm run db:clear-demo` | Remove demo data |
| `npm run db:reset` | Delete the database and recreate base data (stop the server first) |
| `npm run backup` | Copy the database to `data/backups/` |
| `npm run pin:reset` | Set the admin PIN from `ADMIN_PIN` in `.env`, keeping all data |
| `npm test` | Unit and service tests |
| `npm run typecheck` | TypeScript check |

## Architecture

```
src/domain     Pure TypeScript: scoring, standings replay, table state, snapshots. No React, no database.
src/server     SQLite (Drizzle), repositories, services (validated transactional mutations), auth, live cache.
src/app        Next.js App Router pages, server actions, /api/live.
src/components UI: admin, public, screen, shared primitives.
src/i18n       English and Russian dictionaries.
```

- The database stores facts only: players, games, tables, sessions (a game at a table), placements, Joker declarations, announcements, audit log.
- Points, standings, trends and counters are recomputed by replaying finished sessions in time order (`src/domain/replay.ts`) and cached per data version. Editing, deleting or undoing a result can never leave stale totals.
- Every mutation runs in a transaction and increments `event.dataVersion`. Clients poll `/api/live?v=<version>` every 2 s and receive a new snapshot only when the version changed.
- To move to PostgreSQL, replace `src/server/db` and `src/server/repo` with a Postgres Drizzle schema; services and domain stay unchanged.

## Database model

| Table | Purpose |
|---|---|
| `event` | Single row: name, status (draft/live/finished), scoring and screen settings, PIN hash, data version |
| `players` | Name, nickname, color, source (admin/check-in), active, demo flag |
| `games` | Name, family, icon, weight, min/max players, ties allowed, active |
| `tables` | Number, label, active |
| `sessions` | One game at one table: status setup → playing → pending → done (or cancelled), timestamps |
| `session_players` | Seat order, Joker declared, placement |
| `announcements` | Queue for the projector (result reveals, milestones) |
| `audit_log` | Result create/update/delete, Joker corrections, merges, undo (with before/after JSON) |

## Scoring

For a game with weight `W`, `N` players and participation floor `f` (default 20%):

```
share = f + (1 − f) × (N − place) / (N − 1)
points = W × share
```

- Last place earns `W × f`, so time spent at a long game is rewarded.
- Ties (only for games that allow them) use competition ranking (1, 1, 3); tied players share the average of the spanned places.
- Joker: one per player for the whole event, declared when the table is seated and locked at start; multiplies that game's points (default ×1.5). Changes after start go through "Change Joker" and the audit log.
- Tournament score: Best N results (default N = 4) or Total. Raw points, counted points and excluded results are tracked.
- Ranking: counted points, then wins, then raw points, then fewer games, then name.
- Trend: rank before the player's latest result minus current rank.

Code: `src/domain/scoring.ts`, `src/domain/standings.ts`, `src/domain/replay.ts`. Tests: `npm test`.

## Anonymous mode

Standings are secret until the finale. The server builds two different snapshots (`src/domain/snapshot.ts`):

- Public (phones, `/screen`): tables, players at tables, placements of finished games, counters. Points, ranks, games played and Joker status are not included in the data at all.
- Admin: everything.

`/screen` always requests the public snapshot, even in a browser logged in as admin. A unit test asserts no forbidden fields exist in the public snapshot. Optional exceptions, both controlled in Settings: per-game points inside a result reveal, and the Contenders scene (top five in alphabetical order, no ranks).

## Projector mode

`/screen` renders a fixed 1920×1080 stage scaled to any display. Scenes rotate (Title, Live room, Recent results, Event stats, optional Contenders) with a configurable duration. The control room's Projector bar pauses, resumes or skips scenes and replays the last result. "Show on screen" after a result queues a reveal: game title, places from last to second, then the winner. Milestones play at 10, 25, 50, 75 and 100 games.

## Where to change things

| What | Where |
|---|---|
| Game weights, player counts, ties, active games | Admin → Games (live), defaults in `src/server/seed/base.ts` |
| Scoring strategy, N, participation floor, Joker multiplier | Admin → Settings → Scoring, defaults in `src/server/db/schema.ts` |
| Scene selection, duration, screen language, points in reveals | Admin → Settings → Projector |
| Event name, city, year, accent color | Admin → Settings → Event |
| Colors, radii, fonts | `src/app/globals.css` (`@theme` tokens), fonts in `src/app/layout.tsx` |
| Text (English/Russian) | `src/i18n/en.ts`, `src/i18n/ru.ts` |

## Troubleshooting

- Phones cannot connect: firewall rule missing, Wi-Fi profile is Public, wrong address selected in Settings, or client isolation on the venue Wi-Fi (use Mobile Hotspot).
- `npm run db:reset` fails with a locked file: stop the server first.
- Forgot the PIN: set `ADMIN_PIN` in `.env` and run `npm run pin:reset` (event data is kept).
- Port 3000 busy: `npx next start -H 0.0.0.0 -p 3001` and select the matching address in Settings.

## Roadmap

- Tier 2: cinematic result celebration, achievements with unlock announcements, finale ceremony, player profiles.
- Tier 3: statistics page, event timeline, QR code sheet, hot-streak markers.
````

- [ ] **Step 3: Emoji scan and full test suite**

```bash
node -e 'const fs=require("fs"),p=require("path");const bad=[];const walk=d=>{for(const f of fs.readdirSync(d)){const x=p.join(d,f);if(fs.statSync(x).isDirectory())walk(x);else if(/\.(ts|tsx|css|md)$/.test(f)&&/\p{Extended_Pictographic}/u.test(fs.readFileSync(x,"utf8")))bad.push(x)}};walk("src");walk("scripts");console.log(bad.length?bad:"no emoji")'
npm run typecheck
npm test
npm run lint
```

Expected: `no emoji`; no type errors; all tests pass. For lint: fix every reported error, except these intentional browser-sync patterns, which may be silenced with an inline `// eslint-disable-next-line <rule> -- <reason>` if the React Compiler rules (`react-hooks/set-state-in-effect`, `react-hooks/refs`) flag them: `useNow`, `Stage`, `useCheckedIn`, `useStandingsChanges` in `Leaderboard.tsx`, `AnnouncementPlayer`, `useRotation`. Re-run `npm run lint` until it reports no errors.

- [ ] **Step 4: End-to-end rehearsal on a production build**

```bash
npm run db:reset
npm run build && npm run start
```

Use three browser windows: admin phone (390×844), participant phone (390×844, separate profile), projector (1920×1080, `/screen`).

1. Admin: log in with the PIN. Players → paste 8 names. Settings → leave draft, scoring defaults.
2. Participant: `/checkin` → check in as a new name → appears in admin Players within 2 s.
3. Admin: Settings → Go live. Control room: seat table 01 with Catan and 4 players, give one a Joker; Start. Seat table 02 with Hitster and 3 players; Start.
4. Projector shows both tables with running clocks; participant home shows the same.
5. Admin: table 02 Finish → Enter result with a tie for 1st → Confirm → Show on screen → projector reveal plays with two winners.
6. Admin: table 01 Enter result (Joker player 2nd) → Confirm. Standings show the Joker player with ×1.5 points and a Joker mark; the trend column shows arrows after a second result.
7. Participant: `/leaderboard` is sealed; `/api/live?v=0` contains no `"points"`.
8. Admin: Results → edit table 02 result (remove the tie) → Save; Delete it → Undo last → it returns.
9. Stop the server (Ctrl+C), start it again with `npm run start`, reload all windows → all players, results and standings are unchanged.
10. Admin: Settings → Finish event (after closing tables) → participant home shows "Finished", check-in closed; Reopen → Live.
11. `data/backups/` contains at least one `board-cup-*.db`.

Expected: every step behaves as described. Record any defect, fix it with a failing test first where logic is involved, and repeat the affected steps.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts package.json src
git commit -m "docs: add README with event-night checklist, architecture and configuration guide"
```

