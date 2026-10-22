# Board Games Cup — Tier 4 Design Spec (polish, branding, custom games, achievement rules)

- **Date:** 2026-09-17
- **Status:** approved design, pending implementation plan
- **Scope:** four parts from the post-Tier-3 feedback list. Out of scope (deferred): seasons / persistent players across events, GitHub database backup, UI-defined achievement rules.
- **Build order:** Part B (contains a privacy leak) → Part A → Part D → Part C. Each part is independently shippable.

## Part A — Projector & finale polish

### A1. Scene safe area

Problem: every scene sets its own `pt-*/pb-*` against the 110px `ScreenFooter`; nothing checks fit, so Live room, Achievements and In contention collide with the footer / progress hairline.

- `ScreenApp` renders each scene inside a fixed **content box**: 1920×(1080 − 110 footer) with uniform insets (top 100px, bottom 40px above the footer, sides 120px). Scenes remove their own vertical padding and fill the box.
- Finale beats and `ResultReveal` use the same box (finale has no footer, so its box is the full canvas minus insets).

### A2. `<AutoScroll>`

A shared client wrapper for any list that can exceed its box.

- Measures `scrollHeight` vs. box height (ResizeObserver). If it fits: static.
- If it overflows: waits for the entrance animation (`startDelayMs` prop), eases to the far end, holds, eases back, and repeats; one full cycle is fitted to the remaining scene duration (min speed clamp so text stays readable, ~60px/s).
- `from="bottom"` prop: starts at the bottom and scrolls up — used where items are revealed last place first (reveal "other places" list, finale place beats, contenders if long).
- A top/bottom fade mask appears only while overflowing.
- Pure timing math in `components/screen/autoScroll.ts` (unit-tested); the component is a thin wrapper.

Applied to: Live room tables, Achievements scene, Recent results, In contention, Popular, reveal other-places list, finale podium/standings.

### A3. Tie reveal order

Places are always revealed from last to first. Tied players form one group revealed together at their position in that order (e.g. 4th → 2nd= pair → 1st). Ordering logic extracted to a pure `revealOrder(placements)` with tests; `ResultReveal` uses it for both the others list and podium sequencing.

### A4. Champion beat

Cause of the current look: the light-sweep span (`bg-accent/25 blur-2xl`) animates with `fill-mode: both` and stays parked behind the name after the sweep.

Replacement in `BeatChampion`:
- A soft radial spotlight (accent at low alpha → transparent) fading in behind the name block, no hard edges.
- One gold shimmer passing **through the letters**: a moving linear-gradient clipped to the text (`background-clip: text`), run once, ending on plain text colour. No element remains behind the name afterward.
- `GoldDust` particles unchanged.

### A5. Sealed finale slides grouped by achievement

`buildFinale` emits one `sealed` beat **per sealed achievement that has at least one holder**:
`{ kind: "sealed"; achievementId; playerIds: number[]; order; total }` (holders in unlock order). The beat shows icon, title, the now-revealed description and all holders as name chips (wrapping; AutoScroll if needed). Rehearsal data and `finaleLabels` updated. Finale privacy unchanged: the beat carries only player ids.

### A6. Achievements scene shows all holders

Each card lists all holders (avatar + name) instead of the latest one; more than 6 → first 6 + "+N more".

### A7. Finale control panel: jump to slide

Every entry in the `FinaleRemote` step list is a button. New finale command `goto` with a step number (validated `0 ≤ step ≤ total`), implemented with the same `screenControl.finaleStep` mutation as next/back. Public snapshot still exposes only the current step. `finaleRevealed` follows the existing sticky rule in `services/finale.ts`: it becomes `true` when the target step is ≥ `revealStepOf(beats)` and never flips back on `back`/`goto` to an earlier step. Because a jump can skip ahead to the reveal, clicking a step at or past the reveal step while not yet revealed asks for confirmation in the remote ("This reveals final points on the projector").

### A tests

Unit: auto-scroll timing, `revealOrder` with ties, sealed beat grouping, `goto` bounds and `finaleRevealed` behaviour. Browser (Playwright, 1920×1080, 30 demo players): screenshot every scene, a tie reveal and every rehearsal beat; nothing clipped or overlapping the footer.

## Part B — Branding & small fixes

### B1. Configurable brand name

- New nullable `event` columns: `brandTopEn`, `brandMainEn`, `brandTopRu`, `brandMainRu` (plain `ADD COLUMN` migration via drizzle-kit — no table rebuild).
- Resolution: language field → English field → built-in default `HIS^ BOARD GAMES` / `CUP`. Both languages default to the English brand.
- Exposed in the public snapshot as resolved `brand: { en: {top, main}, ru: {top, main} }`.
- `Wordmark`, `SceneTitle`, `ScreenFooter`, `/admin/qr` header and the document `<title>` read the brand for the active language (projector uses `screenLang`). `common.appName` is removed from both dictionaries.
- Settings → **Branding**: four text inputs with live `Wordmark` preview and a preset button filling RU with `HIS^` / `ВЕЧЕР НАСТОЛОК`.

### B2. Favicon

Replace stock `src/app/favicon.ico` with app-router icon files (`icon.svg` — brand mark on a dark rounded square — and `apple-icon.png`). Confirm conventions in `node_modules/next/dist/docs/` before implementing.

### B3. Styled QR

- `qrSvg(url, theme: "dark" | "light")` builds SVG from `QRCode.create(url, { errorCorrectionLevel: "H" })` modules: rounded dots, finder patterns drawn as rounded squares in accent gold, brand mark in a cleared centre (≤ ~20% area), quiet zone kept.
- `dark`: cream `#ece9e2` dots on `#131315` — projector footer, ~96px, beside "Follow along at …". Generated server-side and passed to the screen (no QR lib in the client bundle); only rendered when `publicBaseUrl` is set.
- `light`: near-black dots on white, gold eyes — `/admin/qr` print sheet.
- Test decodes both themes with `jsqr` (dev dependency) and asserts the URL round-trips.

### B4. Achievement visibility helper (privacy fix)

Bug: `/players/[id]` shows every sealed achievement with description once `finaleRevealed`, and the rule differs from `/achievements`.

`achievementVisibility(effectiveSealed, revealed): "titleOnly" | "full"` in `domain/achievements.ts`; `/achievements`, profile, projector card, Achievements scene, timeline and stories all use it. Before reveal a sealed achievement renders title/icon/holders with "Revealed at the finale." in place of the description. Disabled achievements stay hidden everywhere (unchanged). Reproduce the leak in the browser before fixing.

### B5. "Available" shown twice on an empty table

Empty tables show the state badge and also fall back to "Available" as the label. The label fallback becomes `Table N` (or omitted where the number is already shown) in `ControlRoom`, `SceneRoom` and `HomeView`.

### B6. Admin leaderboard → profile

Player names in `/admin/leaderboard` link to `/players/[id]`.

### B tests

Brand resolution fallbacks; QR decode; visibility helper matrix; snapshot forbidden-keys test stays green; browser check of profile/achievements before and after reveal, favicon, footer QR, empty table.

## Part C — Achievement settings & rules

### C1. New sealed semantics

A sealed achievement is public mid-event by **title, icon and holders**; only its **description** is withheld until `finaleRevealed`.

- Public snapshot stops filtering sealed unlocks (`includeSealed` option removed); timeline/stories include them. `sealedUnlockCount` kept for the finale intro.
- Sealed unlocks caused by a result mutation queue live projector cards like other achievements (same `ACHIEVEMENT_HOLD_MS` and reveal-first ordering); the card shows "Sealed: {title}" with no description.
- Accepted limitation: descriptions ship in the client dictionary, so they are not cryptographically secret.

### C2. Per-achievement Sealed switch

- `achievement_settings.sealed` nullable boolean column (`null` = built-in default).
- `effectiveSealed(id, settings)` used everywhere; no direct reads of `achievementDef(id).sealed` outside it.
- Admin achievements page: Sealed switch beside Enabled. Toggling never queues cards; it only changes description visibility and finale slide inclusion. Goes through `mutate()` and bumps `dataVersion`.

### C3. Comeback rule

- Rank measure: position among players who had at least one result **before** this result, computed for both the before and after standings (newcomers in the same result are excluded from both).
- Unlock: climb ≥ 3 places **and** ≥ 8 players ranked before this result. Replaces the `index < 9` gate.
- `biggestComeback` in `stats.ts` uses the same measure.
- Description EN: "Climb three or more places among ranked players with one result." RU updated accordingly.
- Replay recomputes unlocks; previously played projector cards are never retracted (existing rule).

### C tests

Comeback: newcomers in the same result, 7 vs. 8 ranked, exactly 3 places, 2 places. Effective sealed resolution. Sealed unlock queues a card; toggle does not. Snapshot includes sealed unlocks; UI hides description pre-reveal.

## Part D — Custom games & `/admin/games`

### D1. Layout

Responsive card grid replacing rows. Card: icon, name, category + family chip, compact line `weight → winner/last points · 2–6 players · N min · ties`, Active switch in the corner. Inactive cards dimmed and sorted last. Click opens edit sheet; header has **Add game**.

### D2. `GameEditSheet`

Fields: name, description EN/RU, icon (picker), category (existing list or new free text), family (own family by default, or "variant of…" an existing family), weight, min/max players, minutes, allow ties, active. Validation: name required, `2 ≤ min ≤ max ≤ 20`, weight 1–50, minutes 5–240. Slug generated from name, de-duplicated with a numeric suffix. Applies to built-in and custom games alike.

### D3. Icon picker

Curated map (~80 game-related Lucide icons) in `components/common/gameIcons.ts` with EN/RU search keywords; includes every icon used by seeded games. `GameIcon` resolves from the same map (fallback `Dices`). Picker is a searchable grid, lazily loaded.

### D4. Services

`services/games.ts`: `createGame`, `updateGame` (all fields), `deleteGame` — all through `mutate()`, audited. `deleteGame` rejects if any session references the game; the UI hides Delete for played games and offers Deactivate. Repo layer stays the only Drizzle access; actions through `runAdminAction`.

### D tests

Service: create, slug collision, update validation, blocked delete of a played game, delete of unplayed game. Domain: a new family counts toward All-Rounder / Triple Threat. Browser: add a game with a custom icon, seat a table with it, record a result, see it on the projector reveal.

## Cross-cutting

- Every task ends with `npm test && npm run typecheck && npm run lint` and its own commit.
- i18n: all new strings in `en.ts` and `ru.ts`.
- Migrations: drizzle-kit for the added columns; no `event` table rebuild.
- Final Playwright pass over home, `/achievements`, `/players/[id]`, admin games/achievements/settings/leaderboard/finale, `/screen` scenes and `/screen?rehearsal=1`.
