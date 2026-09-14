@AGENTS.md

# Board Games Cup — project state for agent sessions

**Spec:** `docs/superpowers/specs/2026-09-15-board-games-cup-design.md`
**Tier 1 plan (shipped):** `docs/superpowers/plans/2026-09-15-board-games-cup-tier1.md`
**Tier 2 plan (shipped):** `docs/superpowers/plans/2026-09-16-board-games-cup-tier2.md`

Tier 2 covers: result celebration reveal, achievements/unlock announcements, the
finale ceremony, and player profiles. It shipped as 13 TDD tasks (full code, no
placeholders) using `superpowers:writing-plans` conventions, executed inline
(`superpowers:executing-plans`) task-by-task, each ending with
`npm test && npm run typecheck && npm run lint` and its own commit. All 13
tasks are checked off in the plan file; the feature branch was rebased onto
and fast-forward-merged into `master` (no merge commit) and deleted. The whole
flow — home, `/achievements`, `/players/[id]`, admin control room, admin
achievements/finale pages, `/screen` live scenes, and `/screen?rehearsal=1`'s
full 9-beat finale ceremony — has been visually verified in a real browser
(Playwright), not just via HTTP/HTML checks; no bugs found.

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

## Environment notes for agent sessions

- **Playwright browser tools work** — Chrome is installed at
  `/opt/google/chrome/chrome`. The MCP `browser_click` tool takes a `target`
  (exact ref or selector), not `ref`. Get refs from `browser_snapshot` output
  and re-snapshot after any DOM change (refs go stale on re-render).
- **The dev server can go stale across sandbox sessions**: `ps aux` may show a
  `next-server` process from a previous session that looks alive but isn't
  actually listening. Check with `ss -ltn | grep 3000` (not just `curl`, which
  can hang against a dead listener) before trusting it; if nothing is
  listening, kill the stale PIDs and restart with `npm run dev`.
- **Admin login PIN** for the dev DB is `1234` (`ADMIN_PIN` in `.env`) — the
  login screen auto-submits once 4+ digits are entered, no explicit confirm
  click needed if the PIN is exactly 4 digits.
- The projector's language (`/screen`) is a separate admin/event setting from
  the public site's EN/RU toggle — seeing Russian on `/screen` while the
  public site is in English is expected, not a bug.

## Tier 3 (shipped via docs/superpowers/plans/2026-09-17-board-games-cup-tier3.md)

- Stats, stories, streaks and timeline are derived in `src/domain/stats.ts`,
  `stories.ts`, `timeline.ts` and ride on the **public** snapshot only.
  `finaleStats` is null until `finaleRevealed`; sealed unlocks are filtered from
  the timeline/stories before the reveal.
- Migration 0003 is hand-written (like 0002) and appends `story`/`popular` to
  existing `enabledScenes`; `availableScenes` always returns `ALL_SCENES` order.
- `/admin/qr` sits outside the `(panel)` layout on purpose (prints without nav)
  and calls `requireAdminPage()` itself.
- `deleteDemoData` also removes announcements tied to demo sessions/players and
  milestones above the remaining result count.

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
