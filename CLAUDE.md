@AGENTS.md

# Board Games Cup — project state for agent sessions

**Spec:** `docs/superpowers/specs/2026-09-15-board-games-cup-design.md`
**Tier 1 plan (shipped):** `docs/superpowers/plans/2026-09-15-board-games-cup-tier1.md`
**Tier 2 plan (in progress):** `docs/superpowers/plans/2026-09-16-board-games-cup-tier2.md`

Tier 2 covers: result celebration reveal, achievements/unlock announcements, the
finale ceremony, and player profiles. It is written as 13 TDD tasks (full code,
no placeholders) using `superpowers:writing-plans` conventions — each task ends
with `npm test && npm run typecheck && npm run lint` and its own commit.

**Execution mode:** Inline (`superpowers:executing-plans`), not subagent-driven.
When resuming this work, re-read the Tier 2 plan file and check its checkboxes
(`- [ ]` / `- [x]`) to see which tasks are already done before continuing —
don't assume anything from a prior session summary is still accurate.

## Key design decisions baked into the Tier 2 plan

- **Achievements engine** lives in `src/domain/achievements.ts` and plugs into
  `replay()` in `src/domain/replay.ts`. 22 achievements, `sealed` ones don't
  reveal their name until unlocked. Import cycle between `achievements.ts` and
  `replay.ts` is types-only, so it's erased at runtime — this is intentional,
  not a bug to fix.
- **Finale privacy:** the public snapshot only ever exposes the *current*
  finale step. Steps before the final-standings beat carry only player ids
  (no points/rank) so the projector can't leak the podium order early. Points
  become public exactly when the finale reaches the podium/final-standings
  step, which is also what flips `finaleRevealed`.
- **Achievement-card timing on `/screen`:** an unlock card can't outrun the
  result reveal of the same game (that would spoil the winner). Client-side
  `pickNext` enforces a 15s hold (`ACHIEVEMENT_HOLD_MS`) and reveal-first
  ordering — see Task 9.
- **DB migration split:** Task 3 adds the `achievement_settings` table and
  widens the announcement enum/payload via a normal drizzle-kit migration.
  The default value of `enabledScenes` (event table) is deliberately **not**
  changed in the schema — that would force drizzle-kit to rebuild the whole
  `event` table. Instead the seed sets the new default for fresh DBs, and a
  small hand-written migration (0002, `json_insert`) patches existing rows.
  Don't "fix" this by editing the schema default.
- **Rehearsal mode:** `/screen?rehearsal=1` renders the finale from fake data
  (`buildRehearsal()` in `finale.ts`) with no real DB reads — used so an
  organizer can preview the ceremony before event night.
- **Unlocks only queue projector cards when caused by a result mutation**
  (`services/achievements.ts` wraps `mutateResult`). Toggling an achievement
  on/off, merging players, or changing scoring settings can change unlock
  state but never queues a card. Undoing/redoing a result *does* replay its
  cards — spec says played announcements are never retroactively removed.

## Deferred to Tier 3 (not in this plan, don't add scope)

`/stats`, `/timeline`, QR code flow, the `story` and `popular` screen scenes,
the ticker, and removing demo announcements alongside demo data.

## Conventions recap (see AGENTS.md for the Next.js-specific parts)

- Layers: `domain/` pure, `repo/` is the only Drizzle access, `services/` does
  mutations through `mutate()` (transaction + dataVersion bump +
  `allowWhenFinished`), `app/` server actions go through `runAdminAction`.
- All derived state comes from `replay(facts, scoring)`, cached per
  dataVersion in `server/live.ts`.
- Snapshot privacy: public snapshot builder must never leak forbidden keys
  (points, base, rank, counted, raw, jokerDeclared, jokerUsed, gamesPlayed,
  wins, podiums, trend, countedSessionIds, excludedSessionIds) — there's a
  test enforcing this list, extend the list rather than bypassing the test.
- i18n: `en.ts` is the source of truth, `ru.ts` is typed `Dict` against it —
  a missing Russian key is a type error, not a runtime surprise.
