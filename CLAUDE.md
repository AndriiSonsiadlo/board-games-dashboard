# Board Games Cup

Live tournament app for a one-evening board game event: an organizer control
room (`/admin`), public phone pages, and an anonymous projector (`/screen`)
ending in a finale ceremony. See `README.md` for features, scoring and setup.

## Commands

Run all three before every commit:

```bash
npm test && npm run typecheck && npm run lint
```

Dev data: `npm run setup`, then `npm run db:seed:demo`. The admin PIN comes from
`ADMIN_PIN` in `.env` (`1234` locally). For browser checks, use a separate DB on
another port, e.g. `DB_PATH=data/verify.db npx next dev -p 3100`. Never use
`data/board-cup.db` for this.

## Architecture rules

- **Layers:** `src/domain/` is pure TypeScript with no React or DB access.
  `src/server/repo/` is the only place that touches Drizzle. `src/server/services/`
  runs every mutation through `mutate()` (transaction, `dataVersion` bump,
  `allowWhenFinished`). Server actions in `src/app/` go through `runAdminAction`.
- **Derived state:** everything derived comes from `replay(facts, scoring)` and is
  cached per `dataVersion` in `server/live.ts`. Never store points, ranks or
  unlocks in the database.
- **Privacy:** the public snapshot must never contain the forbidden keys
  (points, base, rank, counted, raw, jokerDeclared, jokerUsed, gamesPlayed, wins,
  podiums, trend, countedSessionIds, excludedSessionIds). A test enforces this
  list. If you add a key, extend the list rather than working around the test.
- **i18n:** `src/i18n/en.ts` is the source of truth. `ru.ts` is typed as `Dict`,
  so a missing Russian key is a type error.

## Non-obvious decisions (don't "fix" these)

- **Import cycle:** the cycle between `domain/achievements.ts` and
  `domain/replay.ts` is types-only, so it disappears at runtime.
- **Sealed achievements:** sealed means the description stays hidden until
  `finaleRevealed`. Sealed unlocks are still public, appear in the timeline and
  queue projector cards. Read the effective flag through
  `isSealed(id, facts.sealedOverrides)`, never through `achievementDef(id).sealed`.
- **Finale privacy:** the public snapshot only exposes the current finale step.
  Steps before final standings carry player ids only. Reaching the
  final-standings step flips `finaleRevealed` and makes points public.
  `finaleGoto` shares the sticky reveal rule with next/back.
- **Projector timing:** an achievement card never plays before the result reveal
  of the same game. `pickNext` enforces reveal-first ordering plus
  `ACHIEVEMENT_HOLD_MS`.
- **Announcements:** unlocks only queue projector cards when a result mutation
  caused them (`services/achievements.ts`). Toggling achievements, merging
  players or changing scoring never queues a card. Undo and redo do replay cards.
- **Migrations:**
  - Migrations 0002 and 0003 are hand-written (`json_insert` on
    `enabledScenes`).
  - The schema default for `enabledScenes` is deliberately left unchanged,
    because changing it makes drizzle-kit rebuild the `event` table. Fresh
    databases get the new default from the seed instead.
- **Rehearsal:** `/screen?rehearsal=1` renders the finale from
  `buildRehearsal()` (`domain/finale.ts`) with no DB reads.
- **Brand:** `resolveBrand` (`domain/brand.ts`) falls back per line to English,
  then to `BOARD GAMES` / `CUP`. Client code reads `useBrand()`. The projector
  wraps its own `BrandProvider`.
- **`/players/[id]`:** this page always renders the public view unless an admin
  adds `?view=admin`. Don't switch to "an admin cookie means the admin view".
- **Projector layout:** scenes render inside `SCENE_FRAME`
  (`components/screen/layout.ts`), so never add per-scene bottom padding. Long
  lists go in `<AutoScroll>`, whose timing lives in `scrollPlan.ts`. Keep those
  file names distinct, because the event laptop runs Windows with
  case-insensitive paths.
- **Comeback:** uses `priorFieldRise`, meaning a rise of at least 3 places with
  at least 8 players ranked before the result. `biggestComeback` uses the same
  measure.
- **Games:** a game's family is either its own slug or an existing family.
  `deleteGame` is refused (`game_in_use`) once any session references the game.
  Icons come from `components/common/gameIcons.ts`.
- **`/admin/qr`:** sits outside the `(panel)` layout so it prints without nav,
  and calls `requireAdminPage()` itself.
- **Projector language:** `/screen` has its own language setting, separate from
  the public EN/RU toggle.
