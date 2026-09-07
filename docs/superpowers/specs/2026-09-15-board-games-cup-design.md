# Board Games Cup — Design Spec

- **Date:** 2026-09-15
- **Event:** church community board-game evening, Warsaw, 2026-09-18 (evening), 20+ participants
- **Status:** approved design, pending implementation plan

## 1. Goals and constraints

A live tournament platform for one evening: phones for participants, a phone-first admin for one organizer, and a projector screen that makes the room feel like "something is happening here".

Hard constraints:

- **Deadline:** 3 days. Work is tiered; tier 1 must be solid before tier 2 starts.
- **Local only:** one Windows laptop runs the server; phones join over Wi-Fi; no cloud dependency at runtime.
- **Continuous event:** no global rounds. Tables start and finish independently; every finished game is a result.
- **Standings are secret until the finale.** Public surfaces never receive points, ranks, games-played counts or Joker status before the finale is revealed.
- **One organizer enters results** (PIN-protected admin).
- **Languages:** English (default) and Russian, switchable per device.
- **No emoji anywhere in the UI.** Lucide icons plus a custom SVG wordmark.

### Tiers

| Tier | Scope |
|---|---|
| 1 | Data layer, scoring engine, tables/sessions, result entry + correction + undo, admin leaderboard, `/screen` with anonymous scenes, live polling, PIN auth, player admin + self check-in, EN/RU |
| 2 | Result celebration reveal, achievements + unlock announcements, finale ceremony, player profiles |
| 3 | `/stats`, `/timeline`, QR sheet, hot-streak marker, heatmap, featured stories |

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 (`@theme` tokens), shadcn/ui primitives only (Sheet, Dialog, Switch, Sonner toast), restyled |
| Icons | lucide-react |
| Motion | `motion` (Motion for React) |
| Persistence | SQLite via better-sqlite3 + Drizzle ORM, migrations via drizzle-kit, file at `data/board-cup.db` |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable |
| QR | `qrcode` (server-rendered SVG) |
| Tests | Vitest |
| Fonts | `next/font/google`, self-hosted at build time: Oswald (display), Inter Tight (body), JetBrains Mono (numerals). All support Cyrillic. |

No i18n library, no websocket server, no external services.

## 3. Architecture

```
src/
  domain/        pure TypeScript: scoring, standings replay, achievements, stats, snapshots
  server/
    db/          drizzle schema, client, migrations runner
    repo/        all SQL access (the only layer that imports drizzle)
    services/    use cases: validation, writes, audit, version bump, announcements
    auth/        PIN hashing, signed session cookie
  app/           routes, server actions, /api/live route handler
  components/    shared UI (brand, motion primitives, player chip, table tile, ...)
  i18n/          en.ts, ru.ts, t() helper, plural helper
scripts/         seed, seed-demo, clear-demo, reset, backup
```

Layer rules:

- `domain/` imports nothing from React, Next or the database. It is deterministic and fully unit-tested.
- `repo/` is the only code that touches Drizzle. Swapping to PostgreSQL means a new Drizzle dialect and schema file behind the same repo functions.
- `services/` is the only code that mutates data. Every mutation runs in a transaction that: checks event status, writes, appends an audit entry where applicable, increments `event.dataVersion`, and enqueues announcements for newly unlocked public achievements.
- `app/` holds no business logic; server actions call services.

### 3.1 Derived state

The database stores **facts only**: players, games, tables, sessions, placements, Joker declarations, settings, announcements, audit log.

Everything else is computed by `replay(facts)` in `domain/`:

- per-result points
- standings after every result (rank history)
- counted vs excluded results
- trends
- achievement unlocks (with timestamps)
- stats

Replay processes completed sessions ordered by `finishedAt`, then `id`. The server caches the replay output in module memory keyed by `dataVersion`. Editing, deleting or undoing a result therefore cannot leave stale aggregates.

### 3.2 Live updates

- Every client polls `GET /api/live?v=<lastVersion>` every **2 s**.
- If `v` equals the current `dataVersion`, the response is `{ changed: false }`.
- Otherwise the response is a full snapshot for the caller's audience plus the new version.
- Timers (table clocks, event clock) tick client-side from `startedAt` timestamps, so they do not depend on polling.

### 3.3 Audiences and privacy

Two snapshot builders in `domain/snapshot.ts`:

- `buildPublicSnapshot(replay, event)` — used for requests without a valid admin cookie.
- `buildAdminSnapshot(replay, event)` — full data.

Before `event.finaleRevealed` is true, the public snapshot **omits** (not hides):

- tournament points (raw, counted, excluded), per-game points
- ranks, rank history, trends
- games-played counts per player
- Joker declarations and usage
- sealed achievements (only the count of sealed unlocks is included)
- finale-only stats (see §9)

It **includes** facts visible in the room: active tables with game, players and start time; completed games with placements; public achievement unlocks; event counters; event clock.

After `finaleRevealed` is true, the public snapshot equals the admin snapshot minus the audit log and settings secrets.

Player profile pages, `/leaderboard`, `/stats` and `/screen` all read from these snapshots server-side, so privacy is enforced in one place. A unit test asserts the public snapshot JSON contains none of the forbidden fields before the finale.

### 3.4 Projector command channel

- `announcements` table: `{ id, type, payload (JSON), createdAt }`. Types: `result_reveal`, `achievement`, `milestone`.
- `/screen` stores the highest announcement id it has seen in `localStorage`. On each poll it plays, in order, announcements with a higher id created within the last **120 s**; older ones are skipped. This works with several screens open and after a screen reload.
- Remote controls live on the event row as `screenControl` JSON: `{ paused: boolean, skipNonce: number, finaleStep: number }`. The screen reacts to changes in the snapshot.
- "Replay last reveal" enqueues a new `result_reveal` for the same session.

## 4. Data model

All ids are integer autoincrement. Timestamps are integer milliseconds (UTC).

### event (single row, id = 1)

| Column | Type | Default |
|---|---|---|
| name | text | `Board Games Cup` |
| city | text | `Warsaw` |
| year | int | 2026 |
| status | `draft` \| `live` \| `finished` | `draft` |
| startedAt, finishedAt | int nullable | |
| finaleRevealed | bool | false |
| scoringStrategy | `total` \| `bestN` | `bestN` |
| bestN | int | 4 |
| participationFloor | real (0–0.5) | 0.2 |
| jokerMultiplier | real | 1.5 |
| sceneDurationSec | int | 12 |
| enabledScenes | JSON string[] | all except `contenders` |
| showPointsInReveals | bool | false |
| screenLang | `en` \| `ru` | `en` |
| accentColor | text | `#C9A45C` |
| publicBaseUrl | text nullable | |
| adminPinHash | text | from `ADMIN_PIN` env at seed (scrypt) |
| sessionSecret | text | random 32 bytes at seed |
| screenControl | JSON | `{paused:false, skipNonce:0, finaleStep:0}` |
| dataVersion | int | 1 |

### players

`id, name, nickname (nullable), color (hex), source ('admin' | 'checkin'), active (bool), isDemo (bool), createdAt`

### games

`id, slug (unique), name, family, descriptionEn, descriptionRu, icon (Lucide component name), category, durationMin, weight (real), minPlayers, maxPlayers, allowTies (bool), active (bool)`

### tables

`id, number (unique), label (nullable), active (bool)`

### sessions

`id, tableId (nullable), gameId, status ('setup' | 'playing' | 'pending' | 'done' | 'cancelled'), createdAt, startedAt (nullable), finishedAt (nullable), notes (nullable), isDemo (bool)`

A session with `status = 'done'` is a **result**.

### session_players

`sessionId, playerId, seat (int, order of seating), jokerDeclared (bool), placement (int nullable)` — primary key `(sessionId, playerId)`.

### achievement_settings

`achievementId (text PK), enabled (bool)`

### announcements

`id, type, payload (JSON), createdAt`

### audit_log

`id, at, action ('result.create' | 'result.update' | 'result.delete' | 'joker.correct' | 'session.cancel' | 'player.merge' | 'undo'), summary (text), before (JSON nullable), after (JSON nullable), undone (bool)`

### Invariants (enforced in services)

- A result has at least 2 players, and at most `game.maxPlayers`. Fewer than `game.minPlayers` shows a warning but is allowed.
- Placements are `1..N`. Without `allowTies` they are a permutation. With ties they use competition ranking (1, 1, 3).
- A player has at most one `jokerDeclared = true` across all non-cancelled sessions.
- A player may be in only one session with status `setup`, `playing` or `pending` at a time. Seating a player who is elsewhere asks to move them; a player in a `playing` session elsewhere must be removed there first.
- When `event.status = 'finished'`, all writes except settings, finale control and reopen are rejected.

## 5. Scoring engine (`domain/scoring.ts`)

### 5.1 Points for one result

For a game with weight `W`, `N ≥ 2` players, participation floor `f`:

```
share(p) = f + (1 − f) × (N − p) / (N − 1)
base(p)  = W × share(p)
```

Examples with `f = 0.2`:

- 4 players, W = 6: 6.0, 4.4, 2.8, 1.2
- 6 players, W = 15: 15.0, 12.6, 10.2, 7.8, 5.4, 3.0
- 2 players, W = 10: 10.0, 2.0

With `f = 0` this is the original formula (last place earns 0).

**Ties:** players tied at placement `p` who span `k` positions (`p .. p+k−1`) each receive the mean of `base` over those positions.

**Joker:** `points = base × jokerMultiplier` for a player with `jokerDeclared`.

`N < 2` throws. Exact values are kept; display rounds to one decimal.

### 5.2 Tournament standings

For each player, results in chronological order:

- `raw` = sum of points over all results
- `counted`:
  - strategy `total`: equals `raw`
  - strategy `bestN`: sum of the N highest point values. Ties between equal values are broken by earlier result first, so the choice is deterministic. Unselected results are `excluded`.

Ranking order: `counted` desc, then wins desc, then `raw` desc, then games played asc, then name asc. Players with zero results are listed after all players with results, with no rank number.

**Co-champions:** if ranks 1 and 2 are equal on counted, wins and raw, the finale presents them as co-champions.

**Trend:** a player's rank now minus their rank immediately before their most recent result. Shown as `+k`, `−k` or `=`.

### 5.3 Event lifecycle (`domain/event.ts`)

| From | To | Effect |
|---|---|---|
| draft | live | Optional "clear demo data". Sets `startedAt`. |
| live | finished | Sets `finishedAt`. Open sessions must be finished or cancelled first. Writes are frozen. |
| finished | live | Requires confirmation. Clears `finishedAt`, `finaleRevealed` and `finaleStep`. |

- **Draft:** results allowed (for testing); `/screen` works.
- **Finished:** finale available; `finaleRevealed` is set when finale step 6 is reached, and can be toggled off by the admin.

## 6. Table and session flow

Table display state is derived from its latest non-cancelled, non-done session:

| Session status | Table shows | Clock |
|---|---|---|
| none | Available | — |
| setup | Preparing | — |
| playing | In Progress | running from `startedAt` |
| pending | Results Pending | stopped at `finishedAt` |

- **Seat:** choose game, choose players, toggle Jokers → session `setup`.
- **Start:** session `playing`, `startedAt` set, Jokers locked.
- **Finish:** session `pending`, `finishedAt` set.
- **Enter result:** placements saved, session `done`, table immediately Available.
- **Cancel:** session `cancelled` (with confirmation), no result.
- **Leaving mid-game:** in result entry the organizer can remove a player; removed players are not scored.
- **Direct result (+ Result):** game, optional table, players, placements and Jokers in one sheet; creates a `done` session with `startedAt = finishedAt = now` (duration unknown; excluded from duration stats).
- **Changing a Joker after Start:** only via "Correct Joker" with confirmation; writes `joker.correct` to the audit log.

Hitster team play: enable `allowTies` and give team members the same placement.

## 7. Admin (`/admin/*`)

**Auth:** `/admin/login` takes the PIN, verified against `adminPinHash`, and sets an httpOnly cookie signed with HMAC-SHA256 using `sessionSecret`, valid for 12 h. Next.js 16 `proxy.ts` redirects unauthenticated `/admin/*` requests to login. Every admin server action re-verifies the cookie. Five failed attempts from one IP within 5 minutes cause a 30 s lockout.

| Route | Purpose |
|---|---|
| `/admin` | **Control room.** Table list with one primary action per state (Seat, Start, Finish, Enter result); floating **+ Result**; event status; projector remote (skip scene, pause, replay last reveal); latest unlock notifications. |
| `/admin/leaderboard` | Full live leaderboard: rank, player, counted, raw, games, wins, trend, Joker mark. Animated reordering, changed-row highlight, NEW LEADER flash. |
| `/admin/results` | Chronological results: edit (reopens entry sheet), delete (confirm), **Undo** (stack over audit log), audit log tab |
| `/admin/players` | Quick add, bulk paste (one name per line), edit, merge duplicates, deactivate |
| `/admin/games` | Inline rows: weight stepper, min/max players, allow ties, active, descriptions |
| `/admin/tables` | Add, remove, label tables |
| `/admin/achievements` | Enable/disable each achievement; see all unlocks including sealed |
| `/admin/settings` | Event info and lifecycle; scoring (strategy, N, floor, Joker multiplier); screen (enabled scenes, duration, points in reveals, language, accent color); network (pick `publicBaseUrl` from detected IPv4 addresses or type one); PIN change; QR sheet link; JSON export; clear demo data |
| `/admin/finale` | Finale remote: Next / Back / Auto, rehearsal link |
| `/admin/qr` | Printable QR sheet: site, check-in, screen, admin |

### Result entry sheet (critical flow)

1. Players listed in seat order with Joker badges carried from setup.
2. Tap players in finishing order. Each tap assigns the next placement. Tapping a placed player un-assigns them and every player after.
3. Drag handles reorder players.
4. With `allowTies`, "Tie with above" appears per row.
5. The points column updates live from the scoring engine, using the current settings.
6. **Confirm** saves. A Sonner toast offers **Undo** (10 s) and **Show on screen** (enqueues `result_reveal`).

Target: 4-player result in about 5 taps. Destructive actions (delete result, cancel session, remove player, merge, reopen event, clear demo data) require confirmation.

## 8. Public surfaces

All phone-first, EN/RU toggle in header, device language in `lang` cookie.

| Route | Content |
|---|---|
| `/` | Wordmark + "Warsaw 2026"; status (Starts soon / LIVE + event clock / Finished); live tables; last 5 results (placements); counters (games completed, tables active, players, achievements unlocked); latest public unlocks; **Find me** (name search); **Check in**; **My profile** when known |
| `/checkin` | Name + optional nickname. Similar-name warning ("Is this you?", normalized case/diacritics prefix match). Creates player with `source = 'checkin'`, stores player id in `localStorage`. Disabled when event is finished. |
| `/players/[id]` | Before finale: name, color avatar, achievements (with progress bars for counter-type achievements), recent placements, favorite game (most played), tables played. After finale (or admin): plus rank, counted/raw points, excluded results, wins, podiums, win rate, strongest/weakest game (highest/lowest mean share), rank-history line chart. |
| `/leaderboard` | "Revealed at the finale" locked state until `finaleRevealed`; then full animated leaderboard. |
| `/achievements` | All enabled achievements: locked/unlocked, rarity, who and when. Sealed achievements show as sealed with unlock count until finale. |
| `/stats` | Tier 3, see §9 |
| `/timeline` | Tier 3: chronological feed of session started, result completed, public achievement unlocked, milestones |

## 9. Statistics (`domain/stats.ts`, tier 3)

Public during the event:

- games completed; distinct games played
- game popularity (bar chart by family)
- most common table size
- longest and fastest game (sessions with real duration)
- Rivals of the night (player pair sharing the most sessions)
- table × hour heatmap

Finale-only (after `finaleRevealed`, and always for admin):

- biggest comeback (largest single-result rank rise)
- best Joker (largest bonus points from a Joker)
- most games played
- rank-history charts

## 10. Projector (`/screen`)

- Fixed 16:9 stage scaled to the viewport (letterboxed), `vw`-based type, no navigation, cursor hidden after 3 s idle, fading fullscreen button, Screen Wake Lock API.
- Language from `event.screenLang`.
- **Bottom ticker:** latest timeline items.

### Rotating scenes

Each shown for `sceneDurationSec`, in order, skipping disabled or empty scenes:

1. `title` — wordmark, city/year, event clock
2. `room` — table grid: table number, game, player count, live clock, pulsing live dot; Available tables dimmed
3. `recent` — last 3 results with placements
4. `counters` — games completed, tables active, players, achievements unlocked
5. `achievements` — latest public unlocks and sealed count
6. `story` — generated from public facts, e.g. win streaks, most-played game, milestone proximity
7. `popular` — game popularity
8. `contenders` — current top 5 shown alphabetically, no ranks or points. **Disabled by default.**

When `screenControl.paused` is true, rotation stops on the current scene.

### Interrupts (announcement queue, played before resuming rotation)

- **result_reveal** (about 12 s): game + table title card → placements revealed from last up to 2nd → pause → winner with a light sweep and sparse gold particles → podium hold 3 s → back to rotation. Per-game points shown only if `showPointsInReveals`.
- **achievement** (about 5 s): ACHIEVEMENT UNLOCKED, icon, title, player. Public achievements only.
- **milestone** (about 5 s): generated at 10, 25, 50, 75 and 100 completed games.

### Finale

Active when `event.status = 'finished'` and `finaleStep > 0`. Advanced manually from `/admin/finale`; optional auto-advance every 10 s.

1. Event complete — clock stops; games, hours, players
2. The evening in numbers — most played game, longest game, busiest table, Rivals of the night
3. Sealed achievements revealed one by one (sub-steps)
4. 3rd place, then 2nd place
5. Champion (or co-champions) — longer build, gold particles
6. Final podium + top 10 — sets `finaleRevealed = true`
7. Closing card — BOARD GAMES CUP · CHAMPION · NAME · Warsaw 2026

`/screen?rehearsal=1` runs the whole finale locally with generated placeholder names and numbers, without reading or changing real state.

## 11. Achievements (`domain/achievements.ts`)

Definition:

```ts
type AchievementDef = {
  id: string;
  icon: LucideIconName;
  sealed: boolean;
  check: (ctx: ResultContext, player: PlayerId) => boolean;
  progress?: (history: PlayerHistory) => { current: number; target: number };
};
```

`ResultContext` includes the session, its players and placements, standings before and after the result, and each player's history up to and including it. During replay, after each result, every enabled achievement is checked for every player in that result; the first time `check` passes, the unlock is recorded with the session's `finishedAt` and `sessionId`. Text (title, description) lives in the i18n dictionaries.

Rarity from unlock share among players with at least one result: **Legendary** < 5% or unique, **Epic** 5–15%, **Rare** 15–40%, **Common** > 40%.

| id | Sealed | Rule |
|---|---|---|
| catan-lord | no | Win a game with family `catan` |
| rail-baron | no | Win Ticket to Ride |
| gem-master | no | Win Splendor |
| music-master | no | Win Hitster |
| wonder-architect | no | Win 7 Wonders |
| kingmaker | no | Win Citadels |
| rat-king | no | Win Rats Race |
| last-card | no | Win Uno |
| opening-move | no | Win the first completed result of the event |
| back-to-back | no | Win 2 consecutive results (player's own chronological results) |
| hot-streak | no | Win 3 consecutive results |
| triple-threat | no | Win in 3 different game families (progress) |
| phoenix | no | Win the result immediately after finishing last |
| all-rounder | no | Play 5 different game families (progress) |
| table-hopper | no | Play at 4 different tables (progress) |
| social-butterfly | no | Play against 8 unique opponents (progress) |
| marathon | no | 180 minutes total play time across sessions with real duration (progress) |
| comeback | yes | Rise ≥ 3 ranks from one result; only from the event's 10th result onward |
| underdog | yes | Win while having the strictly lowest counted score among that session's players before it |
| giant-slayer | yes | Finish above the player ranked 1 before this result, in the same session (requires the leader to have ≥ 1 prior result) |
| joker-master | yes | Win with Joker declared |
| risk-taker | yes | Declare Joker in a session with ≥ 5 players |

"Win" means placement 1, including a tie for 1st. If a correction invalidates an unlock, it disappears on replay; already played announcements are not retracted.

New public unlocks detected after a mutation (unlock set difference between the previous and new replay) enqueue `achievement` announcements.

## 12. Design system

### Tokens (`app/globals.css` `@theme`)

| Token | Value |
|---|---|
| `--color-bg` | `#0B0B0C` |
| `--color-surface` | `#131315` |
| `--color-line` | `rgb(255 255 255 / 0.08)` |
| `--color-text` | `#ECE9E2` |
| `--color-muted` | `#8B8B90` |
| `--color-accent` | `#C9A45C` (overridden at runtime from `event.accentColor`) |
| `--color-up` | `#6FBF8E` |
| `--color-down` | `#D9735F` |
| `--color-live` | `#E5484D` |

Player avatar colors: 12 muted hues at equal lightness, assigned in order.

### Typography

- **Display:** Oswald, uppercase, tight tracking for headings; wide tracking for small section labels such as `01 — LIVE ROOM`.
- **Body:** Inter Tight.
- **Numbers and clocks:** JetBrains Mono, `font-variant-numeric: tabular-nums`.

### Form

- Radius 2–6 px. 1 px hairlines. Rules and columns instead of cards. Large numerals. Accent used sparingly: live state, winners, focus.
- Custom SVG wordmark and mark for BOARD GAMES CUP.

### Motion (`components/motion/`)

- One easing `cubic-bezier(0.2, 0.8, 0.2, 1)`; durations 200 / 400 / 800 ms.
- Primitives: `MaskReveal` (clip-path wipe), `FadeRise` (opacity + 8 px), `NumberRoll`, `LivePulse` (2 s), `GoldDust` (canvas, ≤ 40 particles; winner and finale only).
- Leaderboard reordering with `layout` animations; changed rows highlighted for 2 s.
- Phones respect `prefers-reduced-motion`. Admin uses minimal motion; no animation blocks input.

## 13. Internationalization

- `src/i18n/en.ts` exports the dictionary; `ru.ts` is typed as `typeof en`, so a missing key fails type-checking.
- `t(lang, key, vars?)` and `plural(lang, n, forms)` using `Intl.PluralRules` (Russian one/few/many).
- Device language in the `lang` cookie; default `en`. Server components read the cookie.
- Game names shared; descriptions from `descriptionEn` / `descriptionRu`. Achievement titles and descriptions from dictionaries.

## 14. Seed data

`npm run db:seed` (base, idempotent):

- event row with defaults; `adminPinHash` from `ADMIN_PIN`; random `sessionSecret`
- 6 tables
- achievement settings (all enabled)
- games:

| slug | name | family | weight | players | min | ties |
|---|---|---|---:|---|---:|---|
| uno | Uno | uno | 4 | 2–10 | 20 | no |
| splendor | Splendor | splendor | 6 | 2–4 | 30 | no |
| hitster | Hitster | hitster | 6 | 2–10 | 30 | yes |
| rats-race | Rats Race | rats-race | 7 | 2–6 | 60 | no |
| citadels | Citadels | citadels | 8 | 2–8 | 45 | no |
| ticket-to-ride | Ticket to Ride | ticket-to-ride | 10 | 2–5 | 60 | no |
| seven-wonders | 7 Wonders | seven-wonders | 10 | 3–7 | 40 | no |
| catan | Catan | catan | 15 | 3–4 | 90 | no |
| catan-expansion | Catan + Expansion | catan | 18 | 3–6 | 120 | no |

All values are editable in `/admin/games`.

`npm run db:seed:demo`: 22 players and about 15 completed results spread over 3 hours, plus 2 open sessions, all with `isDemo = true`. Includes at least one Joker, one tie (Hitster) and enough history to unlock several achievements.

`npm run db:clear-demo` (also offered on Go Live): deletes `isDemo` players, sessions, session players, related announcements, and bumps `dataVersion`.

## 15. Operations

### Scripts

| Script | Action |
|---|---|
| `dev` | `next dev -H 0.0.0.0` |
| `build` | `next build` |
| `start` | `next start -H 0.0.0.0 -p 3000` |
| `setup` | migrate + base seed |
| `db:migrate` | apply drizzle migrations |
| `db:seed` / `db:seed:demo` / `db:clear-demo` | see §14 |
| `db:reset` | delete DB file, migrate, base seed |
| `backup` | copy DB to `data/backups/board-cup-<timestamp>.db` |
| `test` | vitest run |

Migrations also run on server start (`instrumentation.ts`). Automatic backup: after a mutation, if the last backup is older than 5 minutes, copy the DB with `VACUUM INTO` to `data/backups/`, keeping the latest 50.

### Event-night deployment (native Windows)

1. Install Node 22 LTS on Windows.
2. Copy the project to `C:\board-cup` (not a `\\wsl$` path; native module and speed).
3. `npm ci`, create `.env` with `ADMIN_PIN`, `npm run setup`, `npm run build`, `npm run start`.
4. Allow Node through Windows Firewall on private networks; set the Wi-Fi profile to Private.
5. In `/admin/settings`, select the Wi-Fi IPv4 as `publicBaseUrl` (the laptop has VPN and virtual adapters too); print the QR sheet.
6. Projector on laptop HDMI as an extended display, `/screen` in Chrome kiosk mode.
7. Disable laptop sleep.
8. On-site check early: open the site from a phone. If the venue Wi-Fi isolates clients, switch to Windows Mobile Hotspot.

README includes this checklist, architecture overview, database model, scoring logic, anonymous/projector mode explanation, where to change weights, settings and theme.

## 16. Testing

### Unit (Vitest, `domain/`)

- scoring: 2, 3, 4, 6 players; weights 4, 6, 15; floor 0 and 0.2; ties averaged (including tie for last and for first); Joker multiplier; `N < 2` throws
- standings: total vs bestN; excluded results; bestN larger than results count; tie-break chain; players without results
- replay: edited placement changes standings; deleted result removed; undo restores prior state; trend values
- achievements: each rule, including Underdog with tied lowest (no unlock), Comeback before and after the 10th result, Giant Slayer when leader has no results, back-to-back broken by a loss
- privacy: public snapshot JSON before finale contains no points, rank, games-played or Joker fields and no sealed unlock details; after finale it does

### Service (Vitest, temporary SQLite file)

- create → edit → delete → undo round trip with audit entries and version bumps
- second Joker declaration rejected
- seating a player already seated elsewhere rejected without move
- writes rejected when event finished; allowed after reopen

### Manual verification (Playwright, 390×844 and 1920×1080)

- PIN login; seat → start → finish → enter result → toast undo → show on screen → reveal plays on `/screen`
- self check-in with duplicate warning; merge duplicates in admin
- public pages contain no standings before finale
- achievement unlock announcement on `/screen`
- finale rehearsal; real finale reveals public leaderboard
- EN/RU toggle on phone; Russian plurals

## 17. Out of scope

- Sound effects
- In-game raw scores (and "largest win margin")
- Player accounts or player-submitted results
- Websockets/SSE, cloud database, multi-event support
