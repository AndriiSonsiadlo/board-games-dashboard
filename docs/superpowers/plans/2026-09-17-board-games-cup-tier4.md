# Board Games Cup Tier 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the projector and finale, make the brand configurable, add styled QR codes and a favicon, let the organizer create and edit games, and rework sealed achievements and the Comeback rule.

**Architecture:** Same layering as Tiers 1–3. `domain/` stays pure and holds every new rule (brand resolution, auto-scroll timing, reveal grouping, sealed resolution, prior-field ranking). `repo/` is the only Drizzle access, `services/` mutate through `mutate()`, and server actions go through `runAdminAction`. The projector gets one shared safe-area frame plus an `AutoScroll` wrapper instead of per-scene padding.

**Tech Stack:** Next.js 16.3 (app router, read `node_modules/next/dist/docs/` before touching Next APIs), React 19, TypeScript, Drizzle ORM + better-sqlite3, Tailwind v4, motion, lucide-react, qrcode, Vitest. New dev dependency: `jsqr`.

**Spec:** `docs/superpowers/specs/2026-09-17-board-games-cup-tier4-design.md`

## Global Constraints

- Every task ends with `npm test && npm run typecheck && npm run lint` passing, then its own commit. Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Work on branch `tier4` created from `master`; at the end rebase onto `master` and fast-forward merge (no merge commit), as in Tiers 2–3.
- Never run demo seeds, resets or experiments against `data/board-cup.db` — the organizer keeps that database. Browser checks use `DB_PATH=data/verify.db` (see Task 20).
- i18n: `src/i18n/en.ts` is the source of truth; every new key is added to `src/i18n/ru.ts` in the same task (the `i18n.test.ts` key-parity test enforces it). No emoji in strings.
- Snapshot privacy: the public snapshot must still pass the forbidden-keys test in `src/domain/snapshot.test.ts`. Extend `FORBIDDEN_PUBLIC_KEYS` rather than bypassing it.
- Migrations: new columns only through `npm run db:generate` (plain `ALTER TABLE … ADD`). Never change the `enabledScenes` default and never cause an `event` table rebuild — if a generated SQL file contains `CREATE TABLE \`__new_event\``, stop and fix the schema change.
- Brand default is `HIS^ BOARD GAMES` / `CUP` for both languages; the RU preset is `HIS^` / `ВЕЧЕР НАСТОЛОК`; each brand line is at most 40 characters.
- Sealed achievements (after Task 18): title, icon and holders are public during the event; only the description waits for `finaleRevealed`.
- Comeback (after Task 19): climb ≥ 3 places among players ranked before the result, with ≥ 8 such players.
- Projector sizes are px on the fixed 1920×1080 stage (`Stage.tsx`).

## Deviations from the spec (decided while planning)

- **B4 root cause** is not the achievement filter: `src/app/(public)/players/[id]/page.tsx` renders the *admin* audience whenever the admin cookie is present, so an organizer browsing the public profile saw sealed descriptions (and would see points). Task 1 makes the public page always public unless `?view=admin` is passed by an admin; the admin leaderboard links use that (Task 2). The shared visibility helper still lands with the new sealed semantics (Task 18).
- **D3 lazy loading dropped:** `GameIcon` must resolve any catalog icon synchronously everywhere (projector, phones), so the icon map is a normal import. ~100 tree-shaken icons is a few tens of KB.
- **D4 audit:** catalog mutations (tables, games) are not written to the audit log today; new game mutations follow that and are not audited.
- **Game validation ranges** keep the existing server limits in `services/catalog.ts` (weight 0–100, minutes 1–600) so existing data stays valid; the edit sheet's steppers use the spec's narrower ranges (weight 1–50, minutes 5–240).
- **A2 targets:** AutoScroll wraps Live room, In contention, Popular, Stories, Achievements and the reveal's place list. Recent results (3 cards × at most 5 rows) and the finale podium (a fixed 2×5 grid) have bounded content that fits the frame, so they are not wrapped.
- **A7 confirm:** jumping onto or past the reveal step needs a second tap in the remote, so points can't go public by a stray tap.
- The QR code for the projector footer is served by a route (`/api/qr`) rendered as an `<img>`, so it follows address changes live without shipping the QR library to the client.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/server/profileAudience.ts` (new) | Which audience `/players/[id]` renders | 1 |
| `src/domain/brand.ts` (new) | Brand fields → resolved EN/RU lines | 3 |
| `src/components/brand/BrandProvider.tsx` (new) | Brand context + `useBrand()` | 4 |
| `src/app/icon.svg`, `src/app/apple-icon.tsx` (new) | Favicon / touch icon | 5 |
| `src/server/qr.ts` | QR layout + themed SVG | 6 |
| `src/app/api/qr/route.ts` (new) | Public-address QR for the projector | 6 |
| `src/components/screen/layout.ts` (new) | Scene frame geometry | 7 |
| `src/components/screen/scrollPlan.ts` + `AutoScroll.tsx` (new) | Overflow scroll timing + wrapper | 8 |
| `src/components/screen/logic.ts` | `revealGroups`, `holdersByAchievement` | 9, 12 |
| `src/domain/finale.ts` | Sealed beats grouped per achievement | 11, 17 |
| `src/server/services/finale.ts` | `finaleGoto` | 13 |
| `src/components/common/gameIcons.ts` (new) | Curated Lucide catalog + search | 14 |
| `src/domain/games.ts` (new) | Slug generation | 15 |
| `src/server/services/catalog.ts` | create/update/delete games | 15 |
| `src/components/admin/GamesView.tsx`, `GameEditSheet.tsx`, `IconPicker.tsx` | Games admin UI | 16 |
| `src/domain/achievements.ts` | `isSealed`, `newUnlocks`, `achievementVisibility`, Comeback | 17, 18, 19 |
| `src/domain/standings.ts` | `priorFieldRise` | 19 |

---

## Part B — Branding & small fixes

### Task 1: The public profile page never renders the admin audience

**Files:**
- Create: `src/server/profileAudience.ts`
- Test: `src/server/profileAudience.test.ts`
- Modify: `src/app/(public)/players/[id]/page.tsx`

**Interfaces:**
- Produces: `profileAudience(isAdmin: boolean, view: string | string[] | undefined): "public" | "admin"`; URL contract `/players/{id}?view=admin` (used by Task 2).

- [ ] **Step 0: Branch**

```bash
git checkout master && git checkout -b tier4
```

- [ ] **Step 1: Write the failing test** — `src/server/profileAudience.test.ts`

```ts
import { expect, test } from "vitest";
import { profileAudience } from "./profileAudience";

test("the admin view needs both an admin session and an explicit ?view=admin", () => {
  expect(profileAudience(false, undefined)).toBe("public");
  expect(profileAudience(true, undefined)).toBe("public");
  expect(profileAudience(false, "admin")).toBe("public");
  expect(profileAudience(true, ["admin"])).toBe("public");
  expect(profileAudience(true, "admin")).toBe("admin");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/server/profileAudience.test.ts`
Expected: FAIL — cannot resolve `./profileAudience`.

- [ ] **Step 3: Implement** — `src/server/profileAudience.ts`

```ts
/**
 * `/players/[id]` is a public page. An organizer browsing it with the admin cookie must see what
 * guests see; the full admin profile needs an explicit `?view=admin` as well.
 */
export function profileAudience(isAdmin: boolean, view: string | string[] | undefined): "public" | "admin" {
  return isAdmin && view === "admin" ? "admin" : "public";
}
```

- [ ] **Step 4: Use it in the page** — replace `src/app/(public)/players/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/public/ProfileView";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/live";
import { profileAudience } from "@/server/profileAudience";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) notFound();
  const profile = getProfile(getDb(), playerId, profileAudience(await isAdmin(), view));
  if (!profile) notFound();
  return <ProfileView profile={profile} />;
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/profileAudience.ts src/server/profileAudience.test.ts "src/app/(public)/players/[id]/page.tsx"
git commit -m "fix(public): profile page stays public for a logged-in organizer unless ?view=admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Admin leaderboard opens profiles; empty tables stop saying "Available" twice

**Files:**
- Modify: `src/components/common/Leaderboard.tsx`
- Modify: `src/components/admin/LeaderboardView.tsx`
- Modify: `src/components/admin/ControlRoom.tsx:150`

**Interfaces:**
- Consumes: `/players/{id}?view=admin` (Task 1).
- Produces: `Leaderboard` prop `playerHref?: (playerId: number) => string`.

- [ ] **Step 1: Add the optional link to `Leaderboard`**

In `src/components/common/Leaderboard.tsx` add `import Link from "next/link";` to the imports, extend the props:

```tsx
export function Leaderboard({
  rows,
  players,
  showJoker = false,
  playerHref,
}: {
  rows: LeaderboardRow[];
  players: Map<number, PlayerView>;
  showJoker?: boolean;
  playerHref?: (playerId: number) => string;
}) {
```

and replace the ranked row's name span

```tsx
                    <span className="truncate font-display text-lg uppercase tracking-wide">{player?.name}</span>
```

with

```tsx
                    {playerHref ? (
                      <Link href={playerHref(row.playerId)} className="truncate font-display text-lg uppercase tracking-wide hover:text-accent">
                        {player?.name}
                      </Link>
                    ) : (
                      <span className="truncate font-display text-lg uppercase tracking-wide">{player?.name}</span>
                    )}
```

- [ ] **Step 2: Pass it from the admin view** — in `src/components/admin/LeaderboardView.tsx` replace

```tsx
      <Leaderboard rows={snapshot.leaderboard} players={players} showJoker />
```

with

```tsx
      <Leaderboard rows={snapshot.leaderboard} players={players} showJoker playerHref={(id) => `/players/${id}?view=admin`} />
```

- [ ] **Step 3: Remove the duplicate "Available"** — in `src/components/admin/ControlRoom.tsx` the state column already renders `<StateLabel state={table.state} />`. Replace

```tsx
          <span className="text-sm text-muted">{table.label ?? t.tableState.available}</span>
```

with

```tsx
          table.label ? <span className="text-sm text-muted">{table.label}</span> : null
```

(`SceneRoom` shows no state badge for free tables, so its fallback stays; `HomeView` shows a count, not a duplicate.)

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/Leaderboard.tsx src/components/admin/LeaderboardView.tsx src/components/admin/ControlRoom.tsx
git commit -m "feat(admin): link standings to player profiles and drop the duplicate Available label

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Brand fields in the database, facts, snapshot and a service

**Files:**
- Create: `src/domain/brand.ts`, `src/domain/brand.test.ts`
- Modify: `src/server/db/schema.ts`, `drizzle/` (generated `0004_brand_columns.sql` + meta)
- Modify: `src/domain/types.ts`, `src/domain/fixtures.ts`, `src/server/repo/facts.ts`, `src/domain/snapshot.ts`, `src/domain/snapshot.test.ts`
- Modify: `src/server/services/event.ts`, `src/server/services/core.test.ts`, `src/app/admin/actions.ts`

**Interfaces:**
- Produces:
  - `interface BrandLines { top: string; main: string }`, `type Brand = Record<Lang, BrandLines>`
  - `interface BrandFields { brandTopEn: string | null; brandMainEn: string | null; brandTopRu: string | null; brandMainRu: string | null }`
  - `DEFAULT_BRAND`, `RU_BRAND_PRESET`, `BRAND_MAX_LENGTH = 40`, `resolveBrand(f: BrandFields): Brand`, `brandTitle(b: BrandLines): string`
  - `EventFact.brandFields: BrandFields`; `PublicEventView.brand: Brand`; `AdminEventView.brandFields: BrandFields`
  - `updateBranding(db: Db, patch: Partial<BrandFields>): void`; `updateBrandingAction(patch: Partial<BrandFields>)`

- [ ] **Step 1: Write the failing domain test** — `src/domain/brand.test.ts`

```ts
import { expect, test } from "vitest";
import { brandTitle, DEFAULT_BRAND, resolveBrand } from "./brand";

const none = { brandTopEn: null, brandMainEn: null, brandTopRu: null, brandMainRu: null };

test("both languages default to the English brand", () => {
  expect(resolveBrand(none)).toEqual({ en: DEFAULT_BRAND, ru: DEFAULT_BRAND });
  expect(DEFAULT_BRAND).toEqual({ top: "HIS^ BOARD GAMES", main: "CUP" });
});

test("each line falls back to English, then the default; blanks count as empty", () => {
  expect(resolveBrand({ ...none, brandMainEn: "Night", brandTopRu: " HIS^ ", brandMainRu: "  " })).toEqual({
    en: { top: "HIS^ BOARD GAMES", main: "Night" },
    ru: { top: "HIS^", main: "Night" },
  });
});

test("brandTitle joins the two lines", () => {
  expect(brandTitle({ top: "HIS^", main: "ВЕЧЕР НАСТОЛОК" })).toBe("HIS^ ВЕЧЕР НАСТОЛОК");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/domain/brand.test.ts`
Expected: FAIL — cannot resolve `./brand`.

- [ ] **Step 3: Implement** — `src/domain/brand.ts`

```ts
import type { Lang } from "./types";

export interface BrandLines {
  top: string;
  main: string;
}

export type Brand = Record<Lang, BrandLines>;

/** Raw admin input; null means "not set". */
export interface BrandFields {
  brandTopEn: string | null;
  brandMainEn: string | null;
  brandTopRu: string | null;
  brandMainRu: string | null;
}

export const DEFAULT_BRAND: BrandLines = { top: "HIS^ BOARD GAMES", main: "CUP" };
export const RU_BRAND_PRESET: BrandLines = { top: "HIS^", main: "ВЕЧЕР НАСТОЛОК" };
export const BRAND_MAX_LENGTH = 40;

const clean = (value: string | null) => (value && value.trim() ? value.trim() : null);

/** Per line: the language's field, then the English field, then the built-in default. */
export function resolveBrand(f: BrandFields): Brand {
  const en = { top: clean(f.brandTopEn) ?? DEFAULT_BRAND.top, main: clean(f.brandMainEn) ?? DEFAULT_BRAND.main };
  return { en, ru: { top: clean(f.brandTopRu) ?? en.top, main: clean(f.brandMainRu) ?? en.main } };
}

export const brandTitle = (b: BrandLines) => `${b.top} ${b.main}`;
```

- [ ] **Step 4: Run the domain test**

Run: `npx vitest run src/domain/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Schema columns + migration** — in `src/server/db/schema.ts`, inside `event`, after `publicBaseUrl: text(),` add:

```ts
  brandTopEn: text(),
  brandMainEn: text(),
  brandTopRu: text(),
  brandMainRu: text(),
```

Run: `npm run db:generate -- --name brand_columns`
Expected: new `drizzle/0004_brand_columns.sql` containing exactly four `ALTER TABLE \`event\` ADD \`brand…\` text;` statements (no `__new_event`), plus updated `drizzle/meta/_journal.json` and `drizzle/meta/0004_snapshot.json`.

- [ ] **Step 6: Carry the fields through facts** — `src/domain/types.ts`: add `import type { BrandFields } from "./brand";` at the top and, in `EventFact` after `publicBaseUrl: string | null;`, add `brandFields: BrandFields;`.

`src/domain/fixtures.ts` → in `makeEvent` after `publicBaseUrl: null,` add:

```ts
    brandFields: { brandTopEn: null, brandMainEn: null, brandTopRu: null, brandMainRu: null },
```

`src/server/repo/facts.ts` → in `loadFacts` after `publicBaseUrl: e.publicBaseUrl,` add:

```ts
      brandFields: { brandTopEn: e.brandTopEn, brandMainEn: e.brandMainEn, brandTopRu: e.brandTopRu, brandMainRu: e.brandMainRu },
```

- [ ] **Step 7: Write the failing snapshot test** — append inside `src/domain/snapshot.test.ts` (top level):

```ts
test("public snapshot carries the resolved brand; only admin sees the raw fields", () => {
  const f = facts({ brandFields: { brandTopEn: null, brandMainEn: null, brandTopRu: "HIS^", brandMainRu: "ВЕЧЕР НАСТОЛОК" } });
  const { pub, admin } = build(f);
  expect(pub.event.brand).toEqual({
    en: { top: "HIS^ BOARD GAMES", main: "CUP" },
    ru: { top: "HIS^", main: "ВЕЧЕР НАСТОЛОК" },
  });
  expect("brandFields" in pub.event).toBe(false);
  expect(admin.event.brandFields.brandMainRu).toBe("ВЕЧЕР НАСТОЛОК");
});
```

Run: `npx vitest run src/domain/snapshot.test.ts`
Expected: FAIL — `brand` / `brandFields` missing on the views (typecheck-level errors are reported by vitest as undefined values).

- [ ] **Step 8: Snapshot views** — `src/domain/snapshot.ts`:
  - add `import { resolveBrand, type Brand, type BrandFields } from "./brand";`
  - in `PublicEventView` after `publicBaseUrl: string | null;` add `brand: Brand;`
  - change `AdminEventView` to:

```ts
export interface AdminEventView extends PublicEventView {
  scoring: ScoringSettings;
  brandFields: BrandFields;
}
```

  - in `eventView` after `publicBaseUrl: e.publicBaseUrl,` add `brand: resolveBrand(e.brandFields),`
  - in `buildAdminSnapshot` replace `event: { ...eventView(facts.event), scoring: facts.event.scoring },` with

```ts
    event: { ...eventView(facts.event), scoring: facts.event.scoring, brandFields: facts.event.brandFields },
```

Run: `npx vitest run src/domain/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing service test** — in `src/server/services/core.test.ts` add `updateBranding` to the `./event` import list and add inside `describe("settings", …)`:

```ts
  test("branding trims, stores blanks as unset, validates length and works after finish", () => {
    updateBranding(ctx.db, { brandTopRu: "  HIS^ ", brandMainRu: "ВЕЧЕР НАСТОЛОК", brandTopEn: "   " });
    expect(facts().event.brandFields).toEqual({
      brandTopEn: null,
      brandMainEn: null,
      brandTopRu: "HIS^",
      brandMainRu: "ВЕЧЕР НАСТОЛОК",
    });
    expectCode(() => updateBranding(ctx.db, { brandMainEn: "x".repeat(41) }), "invalid_value");
    goLive(ctx.db, { clearDemo: false });
    finishEvent(ctx.db);
    updateBranding(ctx.db, { brandMainEn: "Night" });
    expect(facts().event.brandFields.brandMainEn).toBe("Night");
  });
```

Run: `npx vitest run src/server/services/core.test.ts`
Expected: FAIL — `updateBranding` is not exported.

- [ ] **Step 10: Implement the service** — in `src/server/services/event.ts` add `import { BRAND_MAX_LENGTH, type BrandFields } from "@/domain/brand";` and append:

```ts
const BRAND_KEYS = ["brandTopEn", "brandMainEn", "brandTopRu", "brandMainRu"] as const satisfies readonly (keyof BrandFields)[];

export function updateBranding(db: Db, patch: Partial<BrandFields>): void {
  const next: Partial<BrandFields> = {};
  for (const key of BRAND_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const trimmed = value?.trim() ?? "";
    check(trimmed.length <= BRAND_MAX_LENGTH);
    next[key] = trimmed.length > 0 ? trimmed : null;
  }
  mutate(db, (tx) => updateEventRow(tx, next), { allowWhenFinished: true });
}
```

and in `src/app/admin/actions.ts` add `updateBranding` to the `@/server/services/event` import, `import type { BrandFields } from "@/domain/brand";`, and under `// Event and settings`:

```ts
export async function updateBrandingAction(patch: Partial<BrandFields>): Result {
  return runAdminAction((db) => updateBranding(db, patch));
}
```

- [ ] **Step 11: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/domain/brand.ts src/domain/brand.test.ts src/server/db/schema.ts drizzle src/domain/types.ts src/domain/fixtures.ts src/server/repo/facts.ts src/domain/snapshot.ts src/domain/snapshot.test.ts src/server/services/event.ts src/server/services/core.test.ts src/app/admin/actions.ts
git commit -m "feat(settings): store per-language brand lines and expose the resolved brand

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Brand everywhere + Settings → Branding

**Files:**
- Create: `src/components/brand/BrandProvider.tsx`
- Modify: `src/app/layout.tsx`, `src/components/brand/Wordmark.tsx`, `src/components/public/HomeView.tsx`, `src/components/public/PublicHeader.tsx`, `src/components/screen/ScreenApp.tsx`, `src/components/screen/ScreenFooter.tsx`, `src/components/screen/scenes/SceneTitle.tsx`, `src/components/screen/finale/beats.tsx`, `src/app/admin/qr/page.tsx`, `src/components/admin/SettingsView.tsx`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Consumes: `resolveBrand`, `brandTitle`, `DEFAULT_BRAND`, `RU_BRAND_PRESET`, `BRAND_MAX_LENGTH`, `snapshot.event.brand`, `snapshot.event.brandFields`, `updateBrandingAction` (Task 3).
- Produces: `BrandProvider({ brand, children })`, `useBrand(): BrandLines`; `Wordmark` accepts optional `lines?: BrandLines`; i18n `settings.branding.{title,hint,top,main,ruPreset}`; `common.appName` removed.

- [ ] **Step 1: Read the Next docs this task touches**

Run: `sed -n 1,80p node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
Expected: confirms `export async function generateMetadata(): Promise<Metadata>` in a layout replaces `export const metadata`.

- [ ] **Step 2: Brand context** — `src/components/brand/BrandProvider.tsx`

```tsx
"use client";

import { createContext, useContext } from "react";
import { DEFAULT_BRAND, type Brand, type BrandLines } from "@/domain/brand";
import { useI18n } from "@/i18n/LangProvider";

const BrandContext = createContext<Brand>({ en: DEFAULT_BRAND, ru: DEFAULT_BRAND });

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** Brand lines in the language of the nearest LangProvider (the projector has its own). */
export function useBrand(): BrandLines {
  const { lang } = useI18n();
  return useContext(BrandContext)[lang];
}
```

- [ ] **Step 3: Root layout** — replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Oswald } from "next/font/google";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { brandTitle, resolveBrand } from "@/domain/brand";
import { LangProvider } from "@/i18n/LangProvider";
import { getLang } from "@/i18n/server";
import { getDb } from "@/server/db/client";
import { getLiveState } from "@/server/live";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin", "cyrillic"], variable: "--font-oswald" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], variable: "--font-inter-tight" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains" });

const currentBrand = () => resolveBrand(getLiveState(getDb()).facts.event.brandFields);

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: brandTitle(currentBrand()[lang]), description: "Live board game tournament" };
}

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
        <LangProvider lang={lang}>
          <BrandProvider brand={currentBrand()}>{children}</BrandProvider>
        </LangProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Wordmark** — replace `src/components/brand/Wordmark.tsx` with:

```tsx
"use client";

import type { BrandLines } from "@/domain/brand";
import { cn } from "@/lib/cn";
import { useBrand } from "./BrandProvider";

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

export function Wordmark({ size = "md", subtitle, lines }: { size?: keyof typeof sizes; subtitle?: string; lines?: BrandLines }) {
  const s = sizes[size];
  const brand = useBrand();
  const { top, main } = lines ?? brand;
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={cn(s.mark, "text-text")} />
      <div className="min-w-0 leading-none">
        <div className={cn("font-display uppercase text-muted", s.top)}>{top}</div>
        <div className={cn("font-display font-semibold uppercase tracking-tight text-text", s.cup)}>
          {main}
          {subtitle ? <span className="ml-3 align-middle text-[0.4em] font-normal tracking-[0.3em] text-accent">{subtitle}</span> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Home hero** — in `src/components/public/HomeView.tsx` add `import { useBrand } from "../brand/BrandProvider";`, add `const brand = useBrand();` next to the other hooks at the top of `HomeView`, and replace

```tsx
          <span className="block text-2xl tracking-[0.3em] text-muted sm:text-3xl">Board Games</span>
          <span className="block text-[5.5rem] sm:text-[8rem]">Cup</span>
```

with

```tsx
          <span className="block text-2xl tracking-[0.3em] text-muted sm:text-3xl">{brand.top}</span>
          <span className={cn("block break-words", brand.main.length > 6 ? "text-[3.25rem] sm:text-[5.5rem]" : "text-[5.5rem] sm:text-[8rem]")}>
            {brand.main}
          </span>
```

(`cn` is already imported in `HomeView.tsx`; if the linter reports it missing, add `import { cn } from "@/lib/cn";`.)

- [ ] **Step 6: Public header** — in `src/components/public/PublicHeader.tsx` add `import { brandTitle } from "@/domain/brand";` and `import { useBrand } from "../brand/BrandProvider";`, add `const brand = brandTitle(useBrand());` after `const { snapshot } = usePublicLive();`, and replace both `t.common.appName` occurrences with `brand`. `appName` was the header's only dictionary use, so also delete `const { t } = useI18n();` and the `useI18n` import.

- [ ] **Step 7: Projector** — `src/components/screen/ScreenApp.tsx`: add `import { BrandProvider } from "../brand/BrandProvider";` and change `ScreenApp` to:

```tsx
export function ScreenApp() {
  const { snapshot } = usePublicLive();
  return (
    <LangProvider lang={snapshot.event.screenLang}>
      <BrandProvider brand={snapshot.event.brand}>
        <ScreenInner snapshot={snapshot} />
      </BrandProvider>
    </LangProvider>
  );
}
```

`src/components/screen/ScreenFooter.tsx`: add `import { useBrand } from "@/components/brand/BrandProvider";` and `import { brandTitle } from "@/domain/brand";`, add `const brand = useBrand();` after `useI18n()`, and replace `{t.common.appName}` with `{brandTitle(brand)}`.

`src/components/screen/scenes/SceneTitle.tsx`: add `import { useBrand } from "@/components/brand/BrandProvider";` and `import { cn } from "@/lib/cn";`, replace the four lines from the `// t.common.appName …` comment through `const nameLead = nameWords.join(" ");` with

```tsx
  const brand = useBrand();
```

replace `{nameLead}` with `{brand.top}`, `{nameHighlight}` with `{brand.main}`, and the highlight's class string

```tsx
        className="font-display text-[340px] font-semibold uppercase leading-[0.82] tracking-tight"
```

with

```tsx
        className={cn(
          "font-display font-semibold uppercase leading-[0.82] tracking-tight",
          brand.main.length > 6 ? "text-[200px]" : "text-[340px]",
        )}
```

`src/components/screen/finale/beats.tsx`: add `import { useBrand } from "@/components/brand/BrandProvider";` and `import { brandTitle } from "@/domain/brand";`; in `BeatClosing` add `const brand = useBrand();` after `useI18n()` and replace `{t.common.appName}` with `{brandTitle(brand)}`.

- [ ] **Step 8: QR sheet header** — in `src/app/admin/qr/page.tsx` replace

```tsx
  const t = getDict(await getLang());
```

with

```tsx
  const lang = await getLang();
  const t = getDict(lang);
```

and replace `{t.common.appName}` with `{event.brand[lang].top} {event.brand[lang].main}`.

- [ ] **Step 9: Dictionaries** — remove `appName: "Board Games Cup",` from `common` in both `src/i18n/en.ts` and `src/i18n/ru.ts`. In `en.ts` `settings`, after the `screen: { … },` block add:

```ts
    branding: {
      title: "Branding",
      hint: "The name on the site, the projector and the QR sheet. An empty field uses the English line.",
      top: "Top line",
      main: "Main line",
      ruPreset: "Use Вечер настолок",
    },
```

and in `ru.ts` at the same place:

```ts
    branding: {
      title: "Название",
      hint: "Название на сайте, проекторе и листе с QR-кодами. Пустое поле берёт английскую строку.",
      top: "Верхняя строка",
      main: "Главная строка",
      ruPreset: "Вставить «Вечер настолок»",
    },
```

- [ ] **Step 10: Settings section** — in `src/components/admin/SettingsView.tsx`:
  - add `updateBrandingAction` to the actions import, `import { BRAND_MAX_LENGTH, DEFAULT_BRAND, RU_BRAND_PRESET, resolveBrand, type BrandFields } from "@/domain/brand";` and `import { Wordmark } from "../brand/Wordmark";`
  - after the `<Section title={t.settings.event.title}>…</Section>` block insert:

```tsx
      <Section title={t.settings.branding.title}>
        <BrandingControls />
      </Section>
```

  - append the component:

```tsx
const BRAND_KEYS = {
  en: { top: "brandTopEn", main: "brandMainEn" },
  ru: { top: "brandTopRu", main: "brandMainRu" },
} as const satisfies Record<Lang, { top: keyof BrandFields; main: keyof BrandFields }>;

function BrandingControls() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [fields, setFields] = useState<BrandFields>(snapshot.event.brandFields);
  const preview = resolveBrand(fields);
  const edit = (key: keyof BrandFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.settings.branding.hint}</p>
      {(["en", "ru"] as const).map((lang) => {
        const keys = BRAND_KEYS[lang];
        return (
          <div key={lang} className="space-y-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="label-caps">{lang.toUpperCase()}</span>
              {lang === "ru" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFields((f) => ({ ...f, brandTopRu: RU_BRAND_PRESET.top, brandMainRu: RU_BRAND_PRESET.main }))}
                >
                  {t.settings.branding.ruPreset}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.settings.branding.top}>
                <input
                  value={fields[keys.top] ?? ""}
                  onChange={edit(keys.top)}
                  placeholder={lang === "en" ? DEFAULT_BRAND.top : preview.en.top}
                  maxLength={BRAND_MAX_LENGTH}
                  className={inputClass}
                />
              </Field>
              <Field label={t.settings.branding.main}>
                <input
                  value={fields[keys.main] ?? ""}
                  onChange={edit(keys.main)}
                  placeholder={lang === "en" ? DEFAULT_BRAND.main : preview.en.main}
                  maxLength={BRAND_MAX_LENGTH}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="rounded-md border border-line bg-bg px-4 py-3">
              <Wordmark size="sm" lines={preview[lang]} />
            </div>
          </div>
        );
      })}
      <Button loading={pending} onClick={() => run(() => updateBrandingAction(fields), { success: t.common.saved })}>
        {t.common.save}
      </Button>
    </div>
  );
}
```

- [ ] **Step 11: Verify no leftovers**

Run: `grep -rn "appName" src || echo "none"`
Expected: `none`.

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/components/brand src/app/layout.tsx src/components/public/HomeView.tsx src/components/public/PublicHeader.tsx src/components/screen src/app/admin/qr/page.tsx src/components/admin/SettingsView.tsx src/i18n
git commit -m "feat(brand): configurable EN/RU brand on the site, projector, QR sheet and page title

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Favicon and touch icon from the brand mark

**Files:**
- Delete: `src/app/favicon.ico`
- Create: `src/app/icon.svg`, `src/app/apple-icon.tsx`

**Interfaces:** none (Next.js file conventions, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`).

- [ ] **Step 1: Remove the stock icon**

```bash
git rm src/app/favicon.ico
```

- [ ] **Step 2: SVG icon** — `src/app/icon.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b0b0c"/>
  <g transform="translate(32 32) rotate(45)">
    <rect x="-15" y="-15" width="30" height="30" fill="none" stroke="#ece9e2" stroke-width="2.5"/>
    <rect x="-9" y="-9" width="18" height="18" fill="none" stroke="#ece9e2" stroke-opacity="0.45" stroke-width="2"/>
  </g>
  <circle cx="32" cy="32" r="3.5" fill="#c9a45c"/>
</svg>
```

- [ ] **Step 3: Apple touch icon** — `src/app/apple-icon.tsx`

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0c" }}>
        <svg width="132" height="132" viewBox="0 0 40 40">
          <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="none" stroke="#ece9e2" strokeWidth="1.25" />
          <rect x="13" y="13" width="14" height="14" transform="rotate(45 20 20)" fill="none" stroke="#ece9e2" strokeOpacity="0.45" strokeWidth="1" />
          <circle cx="20" cy="20" r="2.25" fill="#c9a45c" />
        </svg>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 4: Verify in the running dev server** (any port serving this checkout; see Task 20 for the verify server)

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/icon.svg && curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/apple-icon`
Expected: `200 image/svg+xml` and `200 image/png`. Then `curl -s http://localhost:3000/ | grep -o '<link rel="icon"[^>]*>'` shows the `/icon.svg` link.

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/icon.svg src/app/apple-icon.tsx
git commit -m "feat(brand): favicon and touch icon from the brand mark

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Styled QR codes (print sheet + projector footer)

**Files:**
- Modify: `src/server/qr.ts`, `src/server/qr.test.ts`, `src/app/admin/qr/page.tsx`, `src/components/screen/ScreenFooter.tsx`, `package.json` (dev dep)
- Create: `src/app/api/qr/route.ts`

**Interfaces:**
- Produces:
  - `type QrTheme = "dark" | "light"`
  - `interface QrLayout { size: number; dots: [number, number][]; finders: [number, number][]; hole: { start: number; length: number } | null }`
  - `qrLayout(url: string, opts: { logo: boolean }): QrLayout`
  - `qrSvg(url: string, theme?: QrTheme): string` (now synchronous; default `"light"`)
  - `GET /api/qr?theme=dark|light` → `image/svg+xml` of `${publicBaseUrl}/`, 404 when no public address.

- [ ] **Step 1: Dev dependency**

Run: `npm install -D jsqr`
Expected: `jsqr` added to `devDependencies`.

- [ ] **Step 2: Write the failing tests** — replace the last test in `src/server/qr.test.ts` (`qrSvg renders a standalone svg`) and add imports so the file reads:

```ts
import jsQR from "jsqr";
import { expect, test } from "vitest";
import { qrLayout, qrLinks, qrSvg, resolveBaseUrl, type QrLayout } from "./qr";

test("resolveBaseUrl prefers the configured address and normalizes it", () => {
  expect(resolveBaseUrl("http://192.168.1.20:3000/", "localhost:3000")).toBe("http://192.168.1.20:3000");
  expect(resolveBaseUrl("  192.168.1.20:3000 ", null)).toBe("http://192.168.1.20:3000");
  expect(resolveBaseUrl(null, "10.0.0.5:3000")).toBe("http://10.0.0.5:3000");
  expect(resolveBaseUrl("", null)).toBe("http://localhost:3000");
});

test("qrLinks covers site, check-in, screen and admin", () => {
  expect(qrLinks("http://h:3000")).toEqual([
    { target: "site", url: "http://h:3000/" },
    { target: "checkin", url: "http://h:3000/checkin" },
    { target: "screen", url: "http://h:3000/screen" },
    { target: "admin", url: "http://h:3000/admin" },
  ]);
});

/** Paints a layout the way qrSvg draws it (round dots, solid finder rings) into RGBA pixels. */
function rasterize(layout: QrLayout, invert: boolean, scale = 8, quiet = 4) {
  const px = (layout.size + quiet * 2) * scale;
  const [ink, paper] = invert ? [255, 0] : [0, 255];
  const data = new Uint8ClampedArray(px * px * 4).fill(paper);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const paint = (x: number, y: number, v: number) => {
    const i = (y * px + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  };
  const cells = (row: number, col: number, n: number, v: number) => {
    for (let y = (row + quiet) * scale; y < (row + quiet + n) * scale; y++) {
      for (let x = (col + quiet) * scale; x < (col + quiet + n) * scale; x++) paint(x, y, v);
    }
  };
  for (const [row, col] of layout.dots) {
    const cx = (col + quiet + 0.5) * scale;
    const cy = (row + quiet + 0.5) * scale;
    const r = 0.42 * scale;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) paint(x, y, ink);
      }
    }
  }
  for (const [row, col] of layout.finders) {
    cells(row, col, 7, ink);
    cells(row + 1, col + 1, 5, paper);
    cells(row + 2, col + 2, 3, ink);
  }
  return { data, px };
}

const URLS = ["http://192.168.1.20:3000/", "http://192.168.100.200:3000/checkin"];

test.each(URLS)("the layout with a logo hole still decodes, dark on light and inverted: %s", (url) => {
  const layout = qrLayout(url, { logo: true });
  expect(layout.hole).not.toBeNull();
  const { start, length } = layout.hole!;
  expect(layout.dots.some(([r, c]) => r >= start && r < start + length && c >= start && c < start + length)).toBe(false);
  for (const invert of [false, true]) {
    const { data, px } = rasterize(layout, invert);
    expect(jsQR(data, px, px, { inversionAttempts: "attemptBoth" })?.data).toBe(url);
  }
});

test("qrSvg draws themed, standalone svgs", () => {
  const light = qrSvg("http://192.168.1.20:3000/checkin", "light");
  const dark = qrSvg("http://192.168.1.20:3000/checkin", "dark");
  for (const svg of [light, dark]) {
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  }
  expect(light).toContain('fill="#ffffff"');
  expect(dark).toContain('fill="#131315"');
  expect(dark).toContain("#c9a45c");
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run src/server/qr.test.ts`
Expected: FAIL — `qrLayout` is not exported.

- [ ] **Step 4: Implement** — replace `qrSvg` in `src/server/qr.ts` (keep `QR_TARGETS`, `PATHS`, `resolveBaseUrl`, `qrLinks` unchanged) with:

```ts
export type QrTheme = "dark" | "light";

export interface QrLayout {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** [row, col] of dark modules outside the finder patterns and the logo hole. */
  dots: [number, number][];
  /** Top-left [row, col] of the three 7x7 finder patterns. */
  finders: [number, number][];
  /** Centered square left empty for the brand mark. */
  hole: { start: number; length: number } | null;
}

export function qrLayout(url: string, opts: { logo: boolean }): QrLayout {
  // Level H recovers ~30% of the symbol; the hole below covers ~4-5% of it.
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const finders: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  let hole: QrLayout["hole"] = null;
  if (opts.logo) {
    let length = Math.round(size * 0.2);
    if (length % 2 !== size % 2) length += 1;
    hole = { start: (size - length) / 2, length };
  }
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);
  const inHole = (r: number, c: number) =>
    hole !== null && r >= hole.start && r < hole.start + hole.length && c >= hole.start && c < hole.start + hole.length;
  const dots: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (Boolean(qr.modules.get(r, c)) && !inFinder(r, c) && !inHole(r, c)) dots.push([r, c]);
    }
  }
  return { size, dots, finders, hole };
}

const THEMES: Record<QrTheme, { background: string; dot: string; eye: string; mark: string; pip: string }> = {
  dark: { background: "#131315", dot: "#ece9e2", eye: "#c9a45c", mark: "#ece9e2", pip: "#c9a45c" },
  // Print: finder eyes need contrast against white, so a deeper gold.
  light: { background: "#ffffff", dot: "#111113", eye: "#8a6a2c", mark: "#111113", pip: "#8a6a2c" },
};

const QUIET = 2;

function brandMark(center: number, side: number, colors: (typeof THEMES)[QrTheme]): string {
  const k = side / 40; // BrandMark is drawn on a 40-unit canvas
  const square = (d: number, opacity: number, width: number) =>
    `<rect x="${center - (d / 2) * k}" y="${center - (d / 2) * k}" width="${d * k}" height="${d * k}" transform="rotate(45 ${center} ${center})" fill="none" stroke="${colors.mark}" stroke-opacity="${opacity}" stroke-width="${width * k}"/>`;
  return `${square(24, 1, 2)}${square(14, 0.45, 1.6)}<circle cx="${center}" cy="${center}" r="${2.6 * k}" fill="${colors.pip}"/>`;
}

/** Brand-styled QR: round dots, rounded gold finder eyes and the brand mark in the middle. */
export function qrSvg(url: string, theme: QrTheme = "light"): string {
  const layout = qrLayout(url, { logo: true });
  const colors = THEMES[theme];
  const view = layout.size + QUIET * 2;
  const at = (n: number) => n + QUIET;
  const parts = [`<rect width="${view}" height="${view}" rx="${theme === "dark" ? 2 : 0}" fill="${colors.background}"/>`];
  for (const [r, c] of layout.dots) parts.push(`<circle cx="${at(c) + 0.5}" cy="${at(r) + 0.5}" r="0.42" fill="${colors.dot}"/>`);
  for (const [r, c] of layout.finders) {
    parts.push(
      `<rect x="${at(c) + 0.5}" y="${at(r) + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="${colors.eye}" stroke-width="1"/>`,
      `<rect x="${at(c) + 2}" y="${at(r) + 2}" width="3" height="3" rx="0.8" fill="${colors.eye}"/>`,
    );
  }
  if (layout.hole) parts.push(brandMark(at(layout.hole.start) + layout.hole.length / 2, layout.hole.length * 0.8, colors));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" shape-rendering="geometricPrecision">${parts.join("")}</svg>`;
}
```

- [ ] **Step 5: Run the QR tests**

Run: `npx vitest run src/server/qr.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 6: Print sheet uses the light theme** — in `src/app/admin/qr/page.tsx` replace

```tsx
  const codes = await Promise.all(qrLinks(base).map(async (link) => ({ ...link, svg: await qrSvg(link.url) })));
```

with

```tsx
  const codes = qrLinks(base).map((link) => ({ ...link, svg: qrSvg(link.url, "light") }));
```

- [ ] **Step 7: Route for the projector** — `src/app/api/qr/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { getLiveState } from "@/server/live";
import { qrSvg } from "@/server/qr";

export const dynamic = "force-dynamic";

/** The public site address as a styled QR code. Encodes only the address the organizer published. */
export function GET(request: NextRequest) {
  const base = getLiveState(getDb()).facts.event.publicBaseUrl;
  if (!base) return new NextResponse(null, { status: 404 });
  const theme = request.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  return new NextResponse(qrSvg(`${base}/`, theme), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 8: Footer QR** — in `src/components/screen/ScreenFooter.tsx` replace

```tsx
        {url ? (
          <span className="text-[24px] text-muted">
            {t.screen.follow} <span className="font-mono text-text">{url}</span>
          </span>
        ) : null}
```

with

```tsx
        {url ? (
          <div className="flex items-center gap-5">
            <span className="text-right text-[24px] leading-tight text-muted">
              {t.screen.follow}
              <span className="block font-mono text-text">{url}</span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- live SVG from /api/qr, no optimization wanted */}
            <img src={`/api/qr?theme=dark&u=${encodeURIComponent(url)}`} alt="" className="size-[88px] rounded-[4px]" />
          </div>
        ) : null}
```

(The `u` parameter only busts the browser cache when the address changes.)

- [ ] **Step 9: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. With a dev server and a public address set: `curl -s http://localhost:3000/api/qr | head -c 80` starts with `<svg`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/server/qr.ts src/server/qr.test.ts src/app/admin/qr/page.tsx src/app/api/qr/route.ts src/components/screen/ScreenFooter.tsx
git commit -m "feat(qr): brand-styled QR codes on the print sheet and beside the projector link

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Browser checks (used by Tasks 7–13, 16, 18 and 20)

The organizer's database (`data/board-cup.db`) is never touched. Checks run against a throwaway copy:

```bash
rm -f data/verify.db data/verify.db-shm data/verify.db-wal
DB_PATH=data/verify.db npm run setup          # prints "Database ready at data/verify.db"
DB_PATH=data/verify.db npm run db:seed:demo   # demo players, results, 2 open tables
```

Start a verify server on port 3100 (`ss -ltn | grep 3100` first; if `next dev` refuses because another dev server holds the `.next` lock, stop the port-3000 server, run the check, then restart it with `npm run dev`):

```bash
DB_PATH=data/verify.db npx next dev -H 0.0.0.0 -p 3100
```

Admin PIN is the `ADMIN_PIN` from `.env` (`1234` in dev). Use the Playwright MCP tools at a 1920×1080 viewport (`browser_resize`). After Task 7, this snippet (run with `browser_evaluate` on `/screen`, while no announcement card is showing) returns the text of anything that reaches into the ticker/footer band; it must return `[]` for every scene:

```js
() => {
  const stage = document.querySelector("[data-stage]");
  const box = stage.getBoundingClientRect();
  const scale = box.height / 1080;
  const limit = 1080 - 150;
  const offenders = [];
  for (const el of stage.querySelectorAll("*")) {
    if (el.closest("[data-screen-chrome]")) continue;
    const r = (el.closest("[data-autoscroll]") ?? el).getBoundingClientRect();
    if (r.height === 0) continue;
    if ((r.bottom - box.top) / scale > limit + 1) offenders.push((el.textContent ?? "").trim().slice(0, 40));
  }
  return [...new Set(offenders)];
}
```

Step through scenes with the "Next scene" button on `/admin` (projector remote) in a second tab.

---

## Part A — Projector & finale polish

### Task 7: One safe-area frame for every projector scene

**Files:**
- Create: `src/components/screen/layout.ts`
- Modify: `src/components/screen/ScreenApp.tsx`, `src/components/screen/Stage.tsx`, `src/components/screen/ScreenFooter.tsx`, `src/components/screen/ScreenTicker.tsx`, `src/components/screen/scenes/{SceneRoom,SceneRecent,SceneCounters,SceneAchievements,SceneStory,ScenePopular,SceneContenders}.tsx`

**Interfaces:**
- Produces: `FOOTER_HEIGHT = 110`, `TICKER_HEIGHT = 40`, `SCENE_FRAME = { top: 100, left: 120, right: 120, bottom: 190 }`; DOM markers `data-stage`, `data-screen-chrome` (and `data-autoscroll` from Task 8) used by the browser check.

- [ ] **Step 1: Geometry** — `src/components/screen/layout.ts`

```ts
/** Projector geometry in px on the 1920x1080 stage. */
export const FOOTER_HEIGHT = 110;
export const TICKER_HEIGHT = 40;

/** Scenes render inside this box, clear of the ticker, the footer and its progress hairline. */
export const SCENE_FRAME = { top: 100, left: 120, right: 120, bottom: FOOTER_HEIGHT + TICKER_HEIGHT + 40 } as const;
```

- [ ] **Step 2: Frame the scene** — in `src/components/screen/ScreenApp.tsx` add `import { SCENE_FRAME } from "./layout";` and in the scene `motion.div` replace

```tsx
              className="absolute inset-0"
```

with

```tsx
              className="absolute"
              style={SCENE_FRAME}
```

- [ ] **Step 3: Markers** — `src/components/screen/Stage.tsx`: on the inner canvas `div` (the one with `h-[1080px] w-[1920px]`) add the attribute `data-stage`. `src/components/screen/ScreenFooter.tsx`: add `data-screen-chrome` to the outer `div` (`absolute inset-x-0 bottom-0 z-10 h-[110px] …`). `src/components/screen/ScreenTicker.tsx`: add `data-screen-chrome` to the outer `div` (`absolute inset-x-0 bottom-[110px] …`).

- [ ] **Step 4: Scenes drop their own padding**

```bash
sed -i 's/flex h-full flex-col px-\[120px\] pt-\[110px\] pb-\[150px\]/flex h-full flex-col/' src/components/screen/scenes/*.tsx
grep -rn "pb-\[150px\]" src/components/screen/scenes || echo "clean"
```

Expected: `clean`. (`SceneTitle` never had that padding and stays centered inside the frame.)

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser check (see "Browser checks"): open `http://localhost:3100/screen`, step through every enabled scene, the snippet returns `[]` for Recent, Counters, Story and Title; Live room / Achievements / Popular / In contention may still report rows until Task 8 — note them, they are fixed there.

- [ ] **Step 6: Commit**

```bash
git add src/components/screen
git commit -m "fix(screen): scenes render inside one safe-area frame clear of the ticker and footer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: AutoScroll for lists taller than the frame

**Files:**
- Create: `src/components/screen/scrollPlan.ts`, `src/components/screen/scrollPlan.test.ts`, `src/components/screen/AutoScroll.tsx`
- Modify: `src/components/screen/scenes/SceneRoom.tsx`, `SceneContenders.tsx`, `ScenePopular.tsx`, `SceneStory.tsx`

**Interfaces:**
- Produces:
  - `HOLD_MS = 1500`, `MIN_SPEED = 30`, `MAX_SPEED = 120`, `DEFAULT_SPEED = 60` (px/s)
  - `interface ScrollPlan { distance: number; offsets: number[]; times: number[]; durationMs: number }`
  - `autoScrollPlan(o: { viewport: number; content: number; from: "top" | "bottom"; startDelayMs: number; windowMs?: number }): ScrollPlan | null`
  - `<AutoScroll from? startDelayMs? windowMs? align? className?>` — fills its flex parent (`flex-1 min-h-0`), renders `data-autoscroll`.

- [ ] **Step 1: Write the failing test** — `src/components/screen/scrollPlan.test.ts`

```ts
import { expect, test } from "vitest";
import { autoScrollPlan } from "./scrollPlan";

test("no plan when the content fits", () => {
  expect(autoScrollPlan({ viewport: 800, content: 800.5, from: "top", startDelayMs: 1000, windowMs: 12_000 })).toBeNull();
});

test("top: rest, glide down, rest, glide back, fitted to the scene window", () => {
  const plan = autoScrollPlan({ viewport: 800, content: 1400, from: "top", startDelayMs: 2000, windowMs: 20_000 })!;
  // travel = (20000 - 2000 - 2 * 1500) / 2 = 7500 ms for 600 px = 80 px/s, inside the readable range
  expect(plan.distance).toBe(600);
  expect(plan.offsets).toEqual([0, 0, 600, 600, 0, 0]);
  expect(plan.durationMs).toBe(20_000);
  expect(plan.times[0]).toBe(0);
  expect(plan.times[2]).toBeCloseTo(9500 / 20_000);
  expect(plan.times[5]).toBe(1);
});

test("bottom starts at the far edge (lists revealed from last place)", () => {
  const plan = autoScrollPlan({ viewport: 800, content: 1400, from: "bottom", startDelayMs: 2000, windowMs: 20_000 })!;
  expect(plan.offsets).toEqual([600, 600, 0, 0, 600, 600]);
});

test("speed stays readable when the window is too short, too long or unknown", () => {
  // 1200 px at no more than 120 px/s -> 10 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 2000, from: "top", startDelayMs: 0, windowMs: 5000 })!.durationMs).toBe(23_000);
  // 60 px at no less than 30 px/s -> 2 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 860, from: "top", startDelayMs: 0, windowMs: 120_000 })!.durationMs).toBe(7000);
  // no window: 300 px at 60 px/s -> 5 s per travel
  expect(autoScrollPlan({ viewport: 800, content: 1100, from: "top", startDelayMs: 0 })!.durationMs).toBe(13_000);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/screen/scrollPlan.test.ts`
Expected: FAIL — cannot resolve `./scrollPlan`.

- [ ] **Step 3: Implement the plan** — `src/components/screen/scrollPlan.ts`

```ts
export const HOLD_MS = 1500;
/** px per second; slower than this feels stuck, faster is hard to read from the back of the room. */
export const MIN_SPEED = 30;
export const MAX_SPEED = 120;
export const DEFAULT_SPEED = 60;

export interface ScrollPlan {
  distance: number;
  /** Scroll positions (px from the top) at each keyframe. */
  offsets: number[];
  /** Keyframe times, 0..1. */
  times: number[];
  durationMs: number;
}

/**
 * One loop for content taller than its viewport: rest at the start edge while entrance animations run,
 * glide to the far edge, rest, glide back, rest. Travel time is fitted to `windowMs` (how long the
 * scene is on screen) within readable speeds; null when everything fits.
 */
export function autoScrollPlan(o: {
  viewport: number;
  content: number;
  from: "top" | "bottom";
  startDelayMs: number;
  windowMs?: number;
}): ScrollPlan | null {
  const distance = Math.round(o.content - o.viewport);
  if (distance <= 1) return null;
  const slowest = (distance / MIN_SPEED) * 1000;
  const fastest = (distance / MAX_SPEED) * 1000;
  const fitted =
    o.windowMs === undefined ? (distance / DEFAULT_SPEED) * 1000 : (o.windowMs - o.startDelayMs - HOLD_MS * 2) / 2;
  const travelMs = Math.min(slowest, Math.max(fastest, fitted));
  const start = o.from === "top" ? 0 : distance;
  const end = distance - start;
  const marks = [
    0,
    o.startDelayMs,
    o.startDelayMs + travelMs,
    o.startDelayMs + travelMs + HOLD_MS,
    o.startDelayMs + travelMs * 2 + HOLD_MS,
    o.startDelayMs + travelMs * 2 + HOLD_MS * 2,
  ];
  const durationMs = marks[marks.length - 1];
  return { distance, offsets: [start, start, end, end, start, start], times: marks.map((m) => m / durationMs), durationMs };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/screen/scrollPlan.test.ts`
Expected: PASS.

- [ ] **Step 5: The wrapper** — `src/components/screen/AutoScroll.tsx`

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { autoScrollPlan } from "./scrollPlan";

const FADE = "linear-gradient(to bottom, transparent 0, black 56px, black calc(100% - 56px), transparent 100%)";

/** Fills its flex parent. When the content is taller, it glides between the edges in a slow loop. */
export function AutoScroll({
  children,
  className,
  from = "top",
  startDelayMs = 1500,
  windowMs,
  align = "center",
}: {
  children: React.ReactNode;
  className?: string;
  from?: "top" | "bottom";
  startDelayMs?: number;
  windowMs?: number;
  align?: "center" | "start";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ viewport: 0, content: 0 });
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const measure = () =>
      setSize((s) => {
        const next = { viewport: viewport.clientHeight, content: content.offsetHeight };
        return next.viewport === s.viewport && next.content === s.content ? s : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const plan = reduce || size.viewport === 0 ? null : autoScrollPlan({ ...size, from, startDelayMs, windowMs });

  return (
    <div
      ref={viewportRef}
      data-autoscroll
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      style={plan ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
    >
      <motion.div
        ref={contentRef}
        className={cn("shrink-0", align === "center" && "my-auto")}
        initial={false}
        animate={plan ? { y: plan.offsets.map((o) => -o) } : { y: 0 }}
        transition={
          plan ? { duration: plan.durationMs / 1000, times: plan.times, ease: "easeInOut", repeat: Infinity } : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 6: Live room** — replace the `SceneRoom` function in `src/components/screen/scenes/SceneRoom.tsx` (keep `SceneHeading` and the imports; add `import { AutoScroll } from "../AutoScroll";`) with:

```tsx
export function SceneRoom({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const tables = snapshot.tables;
  const dense = tables.length > 8;

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="01" title={t.screen.liveRoom} />
      <AutoScroll className="mt-14" align="start" startDelayMs={1200} windowMs={snapshot.event.sceneDurationSec * 1000}>
        <div className={cn("grid content-start gap-x-16", dense ? "grid-cols-3 gap-y-8" : "grid-cols-2 gap-y-10")}>
          {tables.map((table, i) => {
            const session = table.session;
            const game = session ? lookups.games.get(session.gameId) : undefined;
            const available = table.state === "available";
            return (
              <motion.div
                key={table.tableId}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.1 + Math.min(i, 12) * 0.07 }}
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
      </AutoScroll>
      {snapshot.counters.tablesActive === 0 ? (
        <p className="mt-6 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{t.screen.allTablesFree}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: In contention** — replace `src/components/screen/scenes/SceneContenders.tsx` with:

```tsx
"use client";

import { motion } from "motion/react";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { AutoScroll } from "../AutoScroll";
import { SceneHeading } from "./SceneRoom";

export function SceneContenders({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="07" title={t.screen.contenders} note={t.screen.contendersNote} />
      <AutoScroll className="mt-10" startDelayMs={1800} windowMs={snapshot.event.sceneDurationSec * 1000}>
        <div className="flex flex-col gap-5">
          {(snapshot.contenders ?? []).map((id, i) => {
            const p = lookups.players.get(id);
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.18 }}
                className="flex items-center gap-10 border-b border-line pb-5"
              >
                <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: p?.color }} />
                <span className="truncate font-display text-[96px] uppercase leading-none tracking-tight">{p?.name}</span>
              </motion.div>
            );
          })}
        </div>
      </AutoScroll>
    </div>
  );
}
```

- [ ] **Step 8: Popular** — in `src/components/screen/scenes/ScenePopular.tsx` add `import { AutoScroll } from "../AutoScroll";` and replace

```tsx
      <ul className="mt-12 flex flex-1 flex-col justify-center gap-7">
```

with

```tsx
      <AutoScroll className="mt-12" startDelayMs={1500} windowMs={snapshot.event.sceneDurationSec * 1000}>
      <ul className="flex flex-col gap-7">
```

and the matching closing `</ul>` (the last one in the file) with

```tsx
      </ul>
      </AutoScroll>
```

- [ ] **Step 9: Stories** — in `src/components/screen/scenes/SceneStory.tsx` add `import { AutoScroll } from "../AutoScroll";` and replace

```tsx
      <ul className="flex flex-1 flex-col justify-center divide-y divide-line">
```

with

```tsx
      <AutoScroll startDelayMs={2000} windowMs={snapshot.event.sceneDurationSec * 1000}>
      <ul className="flex flex-col divide-y divide-line">
```

and the closing `</ul>` with

```tsx
      </ul>
      </AutoScroll>
```

Re-indent the wrapped `<ul>` blocks one level in both files (the project has no formatter and ESLint does not check indentation, so this is for readability only).

- [ ] **Step 10: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser check on `http://localhost:3100/screen`: the overflow snippet returns `[]` for every scene. Add 10 tables in `/admin/tables` of the verify server and confirm the Live room glides down and back within the scene time; In contention's last name has clear space above the ticker.

- [ ] **Step 11: Commit**

```bash
git add src/components/screen
git commit -m "feat(screen): AutoScroll glides through lists taller than the scene frame

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Result reveal groups ties and always goes from last place up

**Files:**
- Modify: `src/components/screen/logic.ts`, `src/components/screen/logic.test.ts`, `src/components/screen/ResultReveal.tsx`

**Interfaces:**
- Consumes: `AutoScroll` (Task 8), `revealTimeline(count)` (existing).
- Produces: `revealGroups<P extends { playerId: number; placement: number }>(placements: P[]): P[][]` — non-winning placements grouped by value, last place first, tied players together in player-id order.

- [ ] **Step 1: Reproduce first**

On the verify server, record a Hitster result (ties allowed) with placements 1, 2, 2, 4 (admin → a table → result sheet, mark the two middle players as tied), press "Show on screen", watch `/screen`. Write down the order the four names appear in. Expected after this task: 4th, then both 2nd places together, then the winner.

- [ ] **Step 2: Write the failing test** — add `revealGroups` to the import in `src/components/screen/logic.test.ts` and append:

```ts
test("revealGroups: last place first, ties revealed together, winners excluded", () => {
  const p = (playerId: number, placement: number) => ({ playerId, placement });
  expect(revealGroups([p(1, 1), p(7, 2), p(3, 2), p(9, 4)])).toEqual([[p(9, 4)], [p(3, 2), p(7, 2)]]);
  expect(revealGroups([p(1, 1), p(2, 2), p(3, 3)])).toEqual([[p(3, 3)], [p(2, 2)]]);
  expect(revealGroups([p(1, 1), p(2, 1)])).toEqual([]);
  expect(revealGroups([p(4, 3), p(1, 1), p(2, 1), p(5, 3)])).toEqual([[p(4, 3), p(5, 3)]]);
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: FAIL — `revealGroups` is not exported.

- [ ] **Step 4: Implement** — append to `src/components/screen/logic.ts`:

```ts
/** Non-winning placements grouped by value, last place first; tied players share a group and appear together. */
export function revealGroups<P extends { playerId: number; placement: number }>(placements: P[]): P[][] {
  const groups = new Map<number, P[]>();
  for (const p of placements) {
    if (p.placement === 1) continue;
    groups.set(p.placement, [...(groups.get(p.placement) ?? []), p]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, group]) => [...group].sort((a, b) => a.playerId - b.playerId));
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: PASS.

- [ ] **Step 6: Use it in the reveal** — in `src/components/screen/ResultReveal.tsx`:
  - change the logic import to `import { podiumSlots, revealGroups, revealTimeline } from "./logic";` and add `import { AutoScroll } from "./AutoScroll";`
  - replace

```tsx
  const others = result.placements.filter((p) => p.placement !== 1);
```

with

```tsx
  const groups = revealGroups(result.placements);
```

  - replace the whole `useEffect(() => { … }, [others.length, onDone]);` block with

```tsx
  useEffect(() => {
    const timeline = revealTimeline(groups.length);
    const timers = [
      setTimeout(() => setPhase("places"), timeline.titleMs),
      ...groups.map((_, i) => setTimeout(() => setRevealed(i + 1), timeline.firstPlaceMs + i * timeline.stepMs)),
      setTimeout(() => setPhase("winner"), timeline.winnerMs),
      setTimeout(() => setPhase("podium"), timeline.podiumMs),
      setTimeout(onDone, timeline.doneMs),
    ];
    return () => timers.forEach(clearTimeout);
    // `groups` is derived fresh each render from `result.placements`; re-running on every
    // reference change would restart the reveal timeline on each live-poll re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, onDone]);
```

  - replace

```tsx
  const descending = [...others].sort((a, b) => b.placement - a.placement);
  const visible = new Set(descending.slice(0, revealed).map((p) => p.playerId));
```

with

```tsx
  const visible = new Set(groups.slice(0, revealed).flat().map((p) => p.playerId));
  const listTimeline = revealTimeline(groups.length);
```

  - replace the right column

```tsx
          <div className="flex flex-col justify-center">
            <ol className="space-y-7">
              {[...others]
                .sort((a, b) => a.placement - b.placement)
                .map((p) => {
```

with

```tsx
          <div className="flex min-h-0 flex-col">
            <AutoScroll from="bottom" startDelayMs={listTimeline.firstPlaceMs} windowMs={listTimeline.winnerMs}>
            <ol className="space-y-7">
              {[...groups]
                .reverse()
                .flat()
                .map((p) => {
```

and its closing

```tsx
            </ol>
          </div>
```

(the last `</ol>` in the file) with

```tsx
            </ol>
            </AutoScroll>
          </div>
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Repeat Step 1: order is 4th → the tied 2nd places together → winner. Record a 10-player Uno result: the list starts scrolled to the bottom and glides up as places appear.

- [ ] **Step 8: Commit**

```bash
git add src/components/screen/logic.ts src/components/screen/logic.test.ts src/components/screen/ResultReveal.tsx
git commit -m "fix(screen): reveal tied places together, always from last place up

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Champion and winner names — spotlight and a gold shimmer through the letters

**Files:**
- Modify: `src/app/globals.css`, `src/components/screen/finale/beats.tsx` (`BeatChampion`), `src/components/screen/ResultReveal.tsx` (winner block)

**Interfaces:**
- Produces: CSS utility `animate-text-shimmer` (text-clipped gradient, runs once, ends on plain text color). Removes `animate-light-sweep`.

- [ ] **Step 1: CSS** — in `src/app/globals.css` delete the `@keyframes light-sweep { … }` block and the `@utility animate-light-sweep { … }` block, and add:

```css
@keyframes text-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0% 0;
  }
}

@utility animate-text-shimmer {
  /* The highlight sits in the middle of a 250%-wide gradient; both ends of the sweep show plain text color. */
  background-image: linear-gradient(
    100deg,
    var(--color-text) 40%,
    color-mix(in oklab, var(--color-accent) 75%, white) 50%,
    var(--color-text) 60%
  );
  background-size: 250% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: text-shimmer 2.2s var(--ease-out-quint) both;
}
```

- [ ] **Step 2: Champion beat** — replace the whole `BeatChampion` function in `src/components/screen/finale/beats.tsx` with:

```tsx
export function BeatChampion({ beat, lookups }: { beat: Beat<"champion">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.6, ease: EASE, delay: 3 }}
          className="h-[820px] w-[1600px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 20%, transparent), color-mix(in oklab, var(--color-accent) 7%, transparent) 55%, transparent)",
          }}
        />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 3.4 }}>
        <GoldDust count={40} />
      </motion.div>
      <div className="relative z-10 flex flex-col items-center">
        <Label delay={0.4}>{beat.co ? t.finale.coChampions : t.finale.champion}</Label>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2.4, ease: "linear", delay: 0.8 }}
          className="mt-10 h-px w-[900px] origin-left bg-accent/70"
        />
        <div className="mt-12">
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
              <span className="animate-text-shimmer" style={{ animationDelay: `${4.8 + i * 0.6}s` }}>
                {lookups.players.get(id)?.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Winner in the result reveal** — in `src/components/screen/ResultReveal.tsx` replace

```tsx
                    <span className="font-display text-[190px] uppercase leading-none tracking-tight">{name(w.playerId)}</span>
```

with

```tsx
                    <span className="font-display text-[190px] uppercase leading-none tracking-tight">
                      <span className="animate-text-shimmer" style={{ animationDelay: "0.9s" }}>
                        {name(w.playerId)}
                      </span>
                    </span>
```

and delete the parked sweep that followed the winners map:

```tsx
                <span
                  aria-hidden
                  className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-24 bg-accent/25 blur-2xl"
                />
```

- [ ] **Step 4: Verify**

Run: `grep -rn "light-sweep" src || echo "gone"`
Expected: `gone`.

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser: `http://localhost:3100/screen?rehearsal=1`, step to the Champion beat (arrow keys). Take screenshots at ~4 s and ~9 s into the beat: a soft round gold glow behind the name, one light band crossing the letters, and at 9 s the name is plain cream text with no blurred block behind it. Particles unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/screen/finale/beats.tsx src/components/screen/ResultReveal.tsx
git commit -m "fix(finale): replace the parked blur behind champion and winner names with a spotlight and text shimmer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: One finale slide per sealed achievement, listing every holder

**Files:**
- Modify: `src/domain/finale.ts`, `src/domain/finale.test.ts`, `src/components/screen/finale/beats.tsx` (`BeatSealed`), `src/components/admin/finaleLabels.ts`, `src/components/admin/finaleLabels.test.ts`

**Interfaces:**
- Produces: `FinaleBeat` variant `{ kind: "sealed"; achievementId: AchievementId; playerIds: number[]; order: number; total: number }` (replaces `unlock: Unlock`). Holders are in unlock order; beats are ordered by each achievement's first unlock.

- [ ] **Step 1: Write the failing tests** — in `src/domain/finale.test.ts` add `import { achievementDef } from "./achievements";`, then in the test `"orders beats and puts one beat per sealed unlock"` rename it to `"orders beats and puts one beat per sealed achievement"` and replace

```ts
    const sealedCount = rp.unlocks.filter((u) => ["comeback", "underdog", "giant-slayer", "joker-master", "risk-taker"].includes(u.achievementId)).length;
```

with

```ts
    const sealedCount = new Set(rp.unlocks.filter((u) => achievementDef(u.achievementId).sealed).map((u) => u.achievementId)).size;
```

and add inside the same `describe`:

```ts
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
```

In `src/components/admin/finaleLabels.test.ts` replace the two sealed expectations

```ts
    "Sealed: Giant Slayer · #6",
    "Sealed: Joker Master · #3",
```

with

```ts
    "Sealed: Giant Slayer · #6, #9",
    "Sealed: Joker Master · #3",
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/domain/finale.test.ts src/components/admin/finaleLabels.test.ts`
Expected: FAIL — beats still carry `unlock`, labels show one name.

- [ ] **Step 3: Domain** — in `src/domain/finale.ts` change the import to `import { achievementDef, type AchievementId } from "./achievements";`, change the sealed variant of `FinaleBeat` to

```ts
  | { kind: "sealed"; achievementId: AchievementId; playerIds: number[]; order: number; total: number }
```

replace

```ts
  const sealed = rp.unlocks.filter((u) => achievementDef(u.achievementId).sealed);
  sealed.forEach((unlock, i) => beats.push({ kind: "sealed", unlock, order: i + 1, total: sealed.length }));
```

with

```ts
  const holders = new Map<AchievementId, number[]>();
  for (const u of rp.unlocks) {
    if (!achievementDef(u.achievementId).sealed) continue;
    holders.set(u.achievementId, [...(holders.get(u.achievementId) ?? []), u.playerId]);
  }
  [...holders].forEach(([achievementId, playerIds], i) =>
    beats.push({ kind: "sealed", achievementId, playerIds, order: i + 1, total: holders.size }),
  );
```

and in `buildRehearsal` replace the two sealed beats and the now-unused `const at = 0;` with:

```ts
      { kind: "sealed", achievementId: "giant-slayer", playerIds: [6, 9], order: 1, total: 2 },
      { kind: "sealed", achievementId: "joker-master", playerIds: [3], order: 2, total: 2 },
```

(delete the `const at = 0;` line.)

- [ ] **Step 4: Labels** — in `src/components/admin/finaleLabels.ts` replace the `case "sealed":` return with

```ts
      return `${fmt(b.sealed, { title: t.achievements.defs[beat.achievementId].title })} · ${beat.playerIds.map(playerName).join(", ")}`;
```

- [ ] **Step 5: Beat UI** — replace the whole `BeatSealed` function in `src/components/screen/finale/beats.tsx` with:

```tsx
export function BeatSealed({ beat, lookups }: { beat: Beat<"sealed">; lookups: FinaleLookups }) {
  const { t } = useI18n();
  const def = t.achievements.defs[beat.achievementId];
  const many = beat.playerIds.length > 3;
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
        <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 1.5 }}>
          <AchievementIcon id={beat.achievementId} className="size-[200px] text-accent" />
        </motion.div>
      </div>
      <div className="ml-[100px] min-w-0">
        <Label>
          {t.finale.sealedAchievement} · {beat.order}/{beat.total}
        </Label>
        <MaskReveal delay={1.6} className="mt-4">
          <div className="font-display text-[150px] uppercase leading-[0.9] tracking-tight">{def.title}</div>
        </MaskReveal>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 2.2 }} className="mt-6 text-[40px] text-muted">
          {def.description}
        </motion.p>
        <ul className="mt-12 flex flex-wrap gap-x-14 gap-y-6 border-t border-line pt-8">
          {beat.playerIds.map((id, i) => {
            const p = lookups.players.get(id);
            return (
              <motion.li
                key={id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE, delay: 3.2 + Math.min(i, 10) * 0.25 }}
                className="flex items-center gap-5"
              >
                <span className={cn("w-[6px] rounded-sm", many ? "h-[48px]" : "h-[76px]")} style={{ backgroundColor: p?.color }} />
                <span className={cn("font-display uppercase leading-none tracking-tight", many ? "text-[64px]" : "text-[100px]")}>
                  {p?.name}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser: `http://localhost:3100/screen?rehearsal=1` — the Giant Slayer slide shows two holders side by side; there are exactly 2 sealed slides.

- [ ] **Step 7: Commit**

```bash
git add src/domain/finale.ts src/domain/finale.test.ts src/components/screen/finale/beats.tsx src/components/admin/finaleLabels.ts src/components/admin/finaleLabels.test.ts
git commit -m "feat(finale): one slide per sealed achievement with all of its holders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Achievements scene lists every holder per achievement

**Files:**
- Modify: `src/components/screen/logic.ts`, `src/components/screen/logic.test.ts`, `src/components/screen/scenes/SceneAchievements.tsx`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Consumes: `AutoScroll` (Task 8).
- Produces: `interface AchievementHolders { achievementId: AchievementId; playerIds: number[]; latestAt: number }`, `holdersByAchievement(unlocks: Unlock[]): AchievementHolders[]` (latest-unlocked achievement first, holders in unlock order); i18n `screen.moreHolders`.

- [ ] **Step 1: Write the failing test** — add `holdersByAchievement` to the import in `src/components/screen/logic.test.ts` and append:

```ts
test("holdersByAchievement groups unlocks, newest achievement first, holders in unlock order", () => {
  const u = (achievementId: "phoenix" | "marathon", playerId: number, at: number) => ({ achievementId, playerId, sessionId: 1, at });
  expect(holdersByAchievement([u("phoenix", 3, 50), u("marathon", 1, 40), u("phoenix", 2, 10)])).toEqual([
    { achievementId: "phoenix", playerIds: [2, 3], latestAt: 50 },
    { achievementId: "marathon", playerIds: [1], latestAt: 40 },
  ]);
  expect(holdersByAchievement([])).toEqual([]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: FAIL — `holdersByAchievement` is not exported.

- [ ] **Step 3: Implement** — in `src/components/screen/logic.ts` add `import type { AchievementId, Unlock } from "@/domain/achievements";` and append:

```ts
export interface AchievementHolders {
  achievementId: AchievementId;
  playerIds: number[];
  latestAt: number;
}

/** Unlocks grouped per achievement: the most recently unlocked achievement first, holders in unlock order. */
export function holdersByAchievement(unlocks: Unlock[]): AchievementHolders[] {
  const groups = new Map<AchievementId, AchievementHolders>();
  for (const u of [...unlocks].sort((a, b) => a.at - b.at)) {
    const group = groups.get(u.achievementId) ?? { achievementId: u.achievementId, playerIds: [], latestAt: u.at };
    group.playerIds.push(u.playerId);
    group.latestAt = Math.max(group.latestAt, u.at);
    groups.set(u.achievementId, group);
  }
  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/screen/logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Strings** — `src/i18n/en.ts` `screen`: add `moreHolders: "+{n} more",`. `src/i18n/ru.ts` `screen`: add `moreHolders: "ещё {n}",`.

- [ ] **Step 6: Scene** — replace `src/components/screen/scenes/SceneAchievements.tsx` with:

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
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { AutoScroll } from "../AutoScroll";
import { holdersByAchievement } from "../logic";
import { SceneHeading } from "./SceneRoom";

const HOLDERS_SHOWN = 6;

export function SceneAchievements({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const { unlocks, sealedUnlockCount, eligiblePlayers } = snapshot.achievements;
  const groups = holdersByAchievement(unlocks);

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="04" title={t.screen.achievements} />
      <div className="mt-14 grid min-h-0 flex-1 grid-cols-[520px_1fr] gap-24">
        <div className="flex flex-col justify-center gap-16">
          <div>
            <NumberRoll value={unlocks.length} className="font-display text-[260px] leading-none" />
            <div className="mt-4 font-display text-[40px] uppercase tracking-[0.2em] text-muted">{t.screen.achievementsUnlocked}</div>
          </div>
          {sealedUnlockCount > 0 ? (
            <div className="flex items-center gap-6 border-t border-line pt-10">
              <Lock className="size-[56px] text-accent" strokeWidth={1.25} />
              <span className="font-display text-[110px] leading-none">{sealedUnlockCount}</span>
              <span className="font-display text-[34px] uppercase tracking-[0.18em] text-muted">{t.screen.sealedUntilFinale}</span>
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col">
          <AutoScroll startDelayMs={1500} windowMs={snapshot.event.sceneDurationSec * 1000}>
            <ul className="divide-y divide-line">
              {groups.map((group, i) => {
                const rarity = rarityOf(group.playerIds.length, eligiblePlayers);
                const shown = group.playerIds.slice(0, HOLDERS_SHOWN);
                const more = group.playerIds.length - shown.length;
                return (
                  <motion.li
                    key={group.achievementId}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.2 + Math.min(i, 8) * 0.1 }}
                    className="grid grid-cols-[90px_1fr_auto] items-center gap-8 py-6"
                  >
                    <AchievementIcon id={group.achievementId} className="size-[64px] text-accent" />
                    <div className="min-w-0">
                      <div className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                        {t.achievements.defs[group.achievementId].title}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[30px] text-muted">
                        {shown.map((id) => {
                          const p = lookups.players.get(id);
                          return (
                            <span key={id} className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: p?.color }} />
                              {p?.name}
                            </span>
                          );
                        })}
                        {more > 0 ? <span className="text-text/70">{fmt(t.screen.moreHolders, { n: more })}</span> : null}
                      </div>
                    </div>
                    {rarity ? (
                      <span className="font-display text-[26px] uppercase tracking-[0.2em] text-muted">{t.achievements.rarity[rarity]}</span>
                    ) : null}
                  </motion.li>
                );
              })}
            </ul>
          </AutoScroll>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser: the Achievements scene shows one row per achievement with several names where several players hold it; the overflow snippet returns `[]`.

- [ ] **Step 8: Commit**

```bash
git add src/components/screen/logic.ts src/components/screen/logic.test.ts src/components/screen/scenes/SceneAchievements.tsx src/i18n
git commit -m "feat(screen): achievements scene lists every holder per achievement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Finale remote jumps to any slide

**Files:**
- Modify: `src/server/services/finale.ts`, `src/server/services/finale.test.ts`, `src/app/admin/actions.ts`, `src/components/admin/FinaleRemote.tsx`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Produces: `finaleGoto(db: Db, step: number): { step: number; total: number }` (throws `invalid_value` unless `0 ≤ step ≤ total` and integer; sticky reveal as for `next`); `finaleGotoAction(step: number)`; i18n `finaleRemote.jumpHint`, `finaleRemote.confirmReveal`.

- [ ] **Step 1: Write the failing test** — in `src/server/services/finale.test.ts` change the import to `import { finaleCommand, finaleGoto, setFinaleRevealed } from "./finale";` and append:

```ts
test("goto jumps anywhere, reveals on or past the podium beat, never hides again and checks bounds", () => {
  expect(() => finaleGoto(ctx.db, 1)).toThrow(ServiceError);
  finishEvent(ctx.db);
  const beats = script();
  expect(finaleGoto(ctx.db, 2)).toEqual({ step: 2, total: beats.length });
  expect(event().finaleRevealed).toBe(false);
  expect(finaleGoto(ctx.db, beats.length).step).toBe(beats.length);
  expect(event().finaleRevealed).toBe(true);
  expect(finaleGoto(ctx.db, 1).step).toBe(1);
  expect(event().finaleRevealed).toBe(true);
  expect(() => finaleGoto(ctx.db, beats.length + 1)).toThrow(ServiceError);
  expect(() => finaleGoto(ctx.db, -1)).toThrow(ServiceError);
  expect(() => finaleGoto(ctx.db, 1.5)).toThrow(ServiceError);
  expect(finaleGoto(ctx.db, 0).step).toBe(0);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/server/services/finale.test.ts`
Expected: FAIL — `finaleGoto` is not exported.

- [ ] **Step 3: Implement** — replace `finaleCommand` in `src/server/services/finale.ts` with:

```ts
function moveFinale(db: Db, pick: (current: number, total: number) => number): { step: number; total: number } {
  return mutate(
    db,
    (tx) => {
      const row = getEventRow(tx);
      if (row.status !== "finished") throw new ServiceError("invalid_status");
      const facts = loadFacts(tx);
      const beats = buildFinaleScript(facts, replay(facts, facts.event.scoring));
      const current = clampStep(row.screenControl.finaleStep, beats);
      const step = clampStep(pick(current, beats.length), beats);
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

export function finaleCommand(db: Db, command: FinaleCommand): { step: number; total: number } {
  return moveFinale(db, (current) => (command === "next" ? current + 1 : command === "back" ? current - 1 : 0));
}

/** Jump straight to a step (0 = back to scenes). Landing on or past the podium beat makes standings public. */
export function finaleGoto(db: Db, step: number): { step: number; total: number } {
  return moveFinale(db, (_current, total) => {
    if (!Number.isInteger(step) || step < 0 || step > total) throw new ServiceError("invalid_value");
    return step;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/server/services/finale.test.ts`
Expected: PASS (existing next/back/exit tests included).

- [ ] **Step 5: Action** — in `src/app/admin/actions.ts` change the finale import to `import { finaleCommand, finaleGoto, setFinaleRevealed, type FinaleCommand } from "@/server/services/finale";` and add after `finaleCommandAction`:

```ts
export async function finaleGotoAction(step: number): Result<{ step: number; total: number }> {
  return runAdminAction((db) => finaleGoto(db, step));
}
```

- [ ] **Step 6: Strings** — `en.ts` `finaleRemote`: add `jumpHint: "Tap a step to jump to it.",` and `confirmReveal: "Tap again: this shows final points",`. `ru.ts` `finaleRemote`: add `jumpHint: "Нажмите на шаг, чтобы перейти к нему.",` and `confirmReveal: "Нажмите ещё раз: откроются итоговые очки",`.

- [ ] **Step 7: Remote UI** — in `src/components/admin/FinaleRemote.tsx`:
  - change the actions import to `import { finaleCommandAction, finaleGotoAction, setFinaleRevealedAction } from "@/app/admin/actions";`
  - after `const [auto, setAuto] = useState(false);` add

```tsx
  const [armed, setArmed] = useState<number | null>(null);
```

  - after the auto-advance `useEffect` add

```tsx
  useEffect(() => {
    if (armed === null) return;
    const id = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(id);
  }, [armed]);
```

  - after `const label = (i: number) => beatLabel(t, lang, finale.beats[i], name);` add

```tsx
  const jump = (step: number) => {
    const reveals = !snapshot.event.finaleRevealed && step >= finale.revealStep;
    if (reveals && armed !== step) {
      setArmed(step);
      return;
    }
    setArmed(null);
    run(() => finaleGotoAction(step));
  };
```

  - replace the step list

```tsx
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
```

with

```tsx
      <p className="text-xs text-muted">{t.finaleRemote.jumpHint}</p>
      <ol className="divide-y divide-line border-y border-line">
        {finale.beats.map((_, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={pending || i + 1 === finale.step}
              onClick={() => jump(i + 1)}
              className={cn(
                "flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent",
                i + 1 === finale.step ? "text-accent" : i + 1 < finale.step ? "text-muted" : "text-text",
              )}
            >
              <span className="w-6 font-mono text-xs">{i + 1}</span>
              <span className={cn(i + 1 === finale.revealStep && "font-display uppercase tracking-wide")}>{label(i)}</span>
              {armed === i + 1 ? <span className="ml-auto text-xs text-down">{t.finaleRemote.confirmReveal}</span> : null}
            </button>
          </li>
        ))}
      </ol>
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser (verify server): finish the event in Settings, open `/admin/finale` and `/screen` side by side; tap step 5 → projector shows beat 5 directly; tap the "Final standings" step → first tap shows the red confirmation, second tap jumps and "Standings public" turns on; tapping step 1 afterwards keeps standings public.

- [ ] **Step 9: Commit**

```bash
git add src/server/services/finale.ts src/server/services/finale.test.ts src/app/admin/actions.ts src/components/admin/FinaleRemote.tsx src/i18n
git commit -m "feat(finale): tap any step in the remote to jump to it, with a confirm before revealing points

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Part D — Custom games & `/admin/games`

### Task 14: Curated game icon catalog with EN/RU search

**Files:**
- Create: `src/components/common/gameIcons.ts`, `src/components/common/gameIcons.test.ts`
- Modify: `src/components/common/GameIcon.tsx`

**Interfaces:**
- Produces: `interface GameIconEntry { name: string; Icon: LucideIcon; keywords: string }`, `GAME_ICON_LIST: GameIconEntry[]`, `GAME_ICONS: Record<string, LucideIcon>`, `searchGameIcons(query: string): GameIconEntry[]`. `GameIcon.tsx` re-exports `GAME_ICONS` so existing imports keep working.

- [ ] **Step 1: Write the failing test** — `src/components/common/gameIcons.test.ts`

```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/common/gameIcons.test.ts`
Expected: FAIL — cannot resolve `./gameIcons`.

- [ ] **Step 3: Implement** — `src/components/common/gameIcons.ts`

```ts
import {
  Anchor,
  Apple,
  Award,
  Banknote,
  Bird,
  Blocks,
  Bomb,
  BookOpen,
  Box,
  Brain,
  Brush,
  Bug,
  Building,
  Cake,
  Car,
  Castle,
  Cat,
  Church,
  Club,
  Coffee,
  Coins,
  Compass,
  Crosshair,
  Crown,
  Diamond,
  Dice1,
  Dice3,
  Dice5,
  Dice6,
  Dices,
  Dog,
  Drama,
  Factory,
  Feather,
  Film,
  Fish,
  Flag,
  FlaskConical,
  Flame,
  Flower,
  Gamepad2,
  Gem,
  Ghost,
  Gift,
  Globe,
  Grid3x3,
  Guitar,
  Hammer,
  Handshake,
  Hash,
  Headphones,
  Heart,
  Hexagon,
  Hourglass,
  Joystick,
  Key,
  Landmark,
  Layers,
  Leaf,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Medal,
  MessageCircle,
  Mic,
  Moon,
  Mountain,
  Music,
  PartyPopper,
  Pencil,
  Pickaxe,
  PiggyBank,
  Pizza,
  Plane,
  Puzzle,
  Pyramid,
  Rabbit,
  Rat,
  Rocket,
  Sailboat,
  Scale,
  ScrollText,
  Shapes,
  Shield,
  Ship,
  Skull,
  Snowflake,
  Spade,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Sword,
  Swords,
  Target,
  Tent,
  Ticket,
  Timer,
  TrainFront,
  TreePine,
  Triangle,
  Trophy,
  Turtle,
  Users,
  VenetianMask,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface GameIconEntry {
  name: string;
  Icon: LucideIcon;
  /** Lowercase English and Russian search words. */
  keywords: string;
}

const entry = (name: string, Icon: LucideIcon, keywords: string): GameIconEntry => ({ name, Icon, keywords });

/** Icons an organizer can pick for a game. `name` is what the database stores. */
export const GAME_ICON_LIST: GameIconEntry[] = [
  entry("Dices", Dices, "dice roll кубики кости"),
  entry("Dice1", Dice1, "dice one кубик один"),
  entry("Dice3", Dice3, "dice three кубик три"),
  entry("Dice5", Dice5, "dice five кубик пять"),
  entry("Dice6", Dice6, "dice six кубик шесть"),
  entry("Spade", Spade, "cards spade poker карты пики покер"),
  entry("Heart", Heart, "cards heart love карты черви сердце"),
  entry("Club", Club, "cards club карты трефы"),
  entry("Diamond", Diamond, "cards diamond карты бубны"),
  entry("Layers", Layers, "cards deck stack карты колода"),
  entry("Ticket", Ticket, "ticket pass билет"),
  entry("Crown", Crown, "king queen royal король корона"),
  entry("Castle", Castle, "castle kingdom medieval замок королевство"),
  entry("Hexagon", Hexagon, "hex tile board гекс плитка поле"),
  entry("Puzzle", Puzzle, "puzzle piece пазл головоломка"),
  entry("Swords", Swords, "battle war fight битва война"),
  entry("Sword", Sword, "sword knight меч рыцарь"),
  entry("Shield", Shield, "defense shield защита щит"),
  entry("Target", Target, "target aim darts цель мишень дартс"),
  entry("Crosshair", Crosshair, "aim shoot прицел"),
  entry("Bomb", Bomb, "bomb explode бомба взрыв"),
  entry("Blocks", Blocks, "blocks build tower блоки башня"),
  entry("Box", Box, "box crate коробка ящик"),
  entry("Pyramid", Pyramid, "pyramid egypt пирамида египет"),
  entry("Triangle", Triangle, "triangle shape треугольник"),
  entry("Shapes", Shapes, "shapes abstract фигуры абстрактная"),
  entry("Grid3x3", Grid3x3, "grid tic tac toe сетка крестики нолики"),
  entry("Hash", Hash, "hash number решётка номер"),
  entry("Joystick", Joystick, "arcade joystick аркада джойстик"),
  entry("Gamepad2", Gamepad2, "video game controller видеоигра геймпад"),
  entry("Trophy", Trophy, "trophy cup win кубок трофей победа"),
  entry("Medal", Medal, "medal award медаль награда"),
  entry("Award", Award, "award ribbon награда"),
  entry("Flag", Flag, "flag race capture флаг гонка"),
  entry("Star", Star, "star favorite звезда"),
  entry("Sparkles", Sparkles, "magic sparkle магия блеск"),
  entry("Map", MapIcon, "map travel карта путешествие"),
  entry("MapPin", MapPin, "location pin место метка"),
  entry("Compass", Compass, "compass explore компас исследование"),
  entry("Globe", Globe, "world globe geography мир глобус география"),
  entry("Mountain", Mountain, "mountain climb гора восхождение"),
  entry("TreePine", TreePine, "forest tree лес дерево ёлка"),
  entry("Sprout", Sprout, "grow farm plant росток ферма растение"),
  entry("Leaf", Leaf, "nature leaf природа лист"),
  entry("Flower", Flower, "garden flower сад цветок"),
  entry("Apple", Apple, "fruit apple food фрукт яблоко еда"),
  entry("Sun", Sun, "sun day солнце день"),
  entry("Moon", Moon, "moon night werewolf луна ночь мафия оборотень"),
  entry("Snowflake", Snowflake, "winter snow зима снег"),
  entry("Flame", Flame, "fire flame огонь пламя"),
  entry("Zap", Zap, "lightning speed energy молния скорость энергия"),
  entry("Anchor", Anchor, "sea anchor pirate море якорь пират"),
  entry("Ship", Ship, "ship sea trade корабль море торговля"),
  entry("Sailboat", Sailboat, "sail boat парус лодка"),
  entry("Rocket", Rocket, "space rocket космос ракета"),
  entry("Plane", Plane, "plane travel самолёт путешествие"),
  entry("Car", Car, "car race машина гонка"),
  entry("TrainFront", TrainFront, "train rail railway поезд железная дорога"),
  entry("Tent", Tent, "camp tent лагерь палатка"),
  entry("Coins", Coins, "money coins gold деньги монеты золото"),
  entry("PiggyBank", PiggyBank, "savings bank копилка банк"),
  entry("Banknote", Banknote, "money cash economy деньги купюра экономика"),
  entry("Gem", Gem, "gem jewel diamond самоцвет камень"),
  entry("Scale", Scale, "trade balance justice весы торговля"),
  entry("Hammer", Hammer, "build craft молоток стройка"),
  entry("Pickaxe", Pickaxe, "mine dig кирка шахта"),
  entry("Key", Key, "key escape unlock ключ квест"),
  entry("Landmark", Landmark, "wonder monument temple чудо памятник храм"),
  entry("Building", Building, "city building город здание"),
  entry("Store", Store, "shop market магазин рынок"),
  entry("Factory", Factory, "industry factory промышленность завод"),
  entry("Church", Church, "church bible церковь библия"),
  entry("Rat", Rat, "rat race крыса гонка"),
  entry("Cat", Cat, "cat kitten кот кошка"),
  entry("Dog", Dog, "dog puppy собака"),
  entry("Rabbit", Rabbit, "rabbit bunny кролик заяц"),
  entry("Bird", Bird, "bird wings птица крылья"),
  entry("Fish", Fish, "fish sea рыба море"),
  entry("Turtle", Turtle, "turtle slow черепаха"),
  entry("Bug", Bug, "bug insect жук насекомое"),
  entry("Ghost", Ghost, "ghost spooky призрак"),
  entry("Skull", Skull, "skull danger череп опасность"),
  entry("Brain", Brain, "brain logic quiz мозг логика викторина"),
  entry("Lightbulb", Lightbulb, "idea quiz trivia идея викторина"),
  entry("Drama", Drama, "theater acting театр актёры"),
  entry("VenetianMask", VenetianMask, "mask bluff mafia маска блеф мафия"),
  entry("Brush", Brush, "paint draw кисть рисование"),
  entry("Pencil", Pencil, "draw write карандаш рисовать писать"),
  entry("BookOpen", BookOpen, "book story книга история"),
  entry("ScrollText", ScrollText, "scroll quest свиток квест"),
  entry("Feather", Feather, "feather write перо"),
  entry("WandSparkles", WandSparkles, "wizard magic wand волшебник магия палочка"),
  entry("FlaskConical", FlaskConical, "potion science зелье наука"),
  entry("Hourglass", Hourglass, "time sand hourglass время песочные часы"),
  entry("Timer", Timer, "timer speed таймер скорость"),
  entry("Music", Music, "music song музыка песня"),
  entry("Mic", Mic, "karaoke sing караоке петь"),
  entry("Headphones", Headphones, "listen music слушать музыка"),
  entry("Guitar", Guitar, "guitar band гитара группа"),
  entry("Film", Film, "movie film кино фильм"),
  entry("MessageCircle", MessageCircle, "talk word chat разговор слова"),
  entry("Handshake", Handshake, "deal cooperate сделка кооператив"),
  entry("Users", Users, "team party people команда люди"),
  entry("PartyPopper", PartyPopper, "party celebrate вечеринка праздник"),
  entry("Gift", Gift, "gift present подарок"),
  entry("Pizza", Pizza, "pizza food пицца еда"),
  entry("Coffee", Coffee, "coffee cafe кофе кафе"),
  entry("Cake", Cake, "cake birthday торт день рождения"),
];

export const GAME_ICONS: Record<string, LucideIcon> = Object.fromEntries(GAME_ICON_LIST.map((e) => [e.name, e.Icon]));

export function searchGameIcons(query: string): GameIconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return GAME_ICON_LIST;
  return GAME_ICON_LIST.filter((e) => e.name.toLowerCase().includes(q) || e.keywords.includes(q));
}
```

- [ ] **Step 4: `GameIcon` uses the catalog** — replace `src/components/common/GameIcon.tsx` with:

```tsx
import { Dices } from "lucide-react";
import { GAME_ICONS } from "./gameIcons";

export { GAME_ICONS };

export function GameIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GAME_ICONS[name] ?? Dices;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass (if `lucide-react` lacks one of the names the first test fails with that name — replace it with another icon from `node -e 'console.log(Object.keys(require("lucide-react")).filter(k=>/^[A-Z]/.test(k)).join(" "))'`).

- [ ] **Step 6: Commit**

```bash
git add src/components/common/gameIcons.ts src/components/common/gameIcons.test.ts src/components/common/GameIcon.tsx
git commit -m "feat(games): curated Lucide icon catalog with English and Russian search

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Create, edit (any field) and delete games

**Files:**
- Create: `src/domain/games.ts`, `src/domain/games.test.ts`
- Modify: `src/server/repo/writes.ts`, `src/server/services/catalog.ts`, `src/server/services/errors.ts`, `src/server/services/core.test.ts`, `src/domain/achievements.test.ts`, `src/domain/snapshot.ts`, `src/domain/snapshot.test.ts`, `src/app/admin/actions.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Produces:
  - `slugify(name: string): string`, `uniqueSlug(name: string, taken: Iterable<string>): string`
  - repo: `insertGame(tx, values): number`, `deleteGameRow(tx, id): void`, `gameHasSessions(tx, gameId): boolean`
  - `type NewGame = Omit<GameFact, "id" | "slug" | "family"> & { family: string | null }` (`null` = own family)
  - `GamePatch` gains `family?: string`
  - `createGame(db, input: NewGame): number`, `updateGame(db, id, patch: GamePatch): void`, `deleteGame(db, id): void`
  - `ErrorCode` gains `"game_in_use"`; `AdminSnapshot.playedGameIds: number[]`
  - actions `createGameAction(input: NewGame): Result<number>`, `deleteGameAction(id: number): Result`

- [ ] **Step 1: Write the failing slug test** — `src/domain/games.test.ts`

```ts
import { expect, test } from "vitest";
import { slugify, uniqueSlug } from "./games";

test("slugify keeps latin and cyrillic words, drops the rest", () => {
  expect(slugify("  Ticket to Ride: Europe ")).toBe("ticket-to-ride-europe");
  expect(slugify("Каркассон")).toBe("каркассон");
  expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  expect(slugify("!!!")).toBe("game");
});

test("uniqueSlug appends the first free number", () => {
  expect(uniqueSlug("Azul", [])).toBe("azul");
  expect(uniqueSlug("Azul", ["azul", "azul-2"])).toBe("azul-3");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/domain/games.test.ts`
Expected: FAIL — cannot resolve `./games`.

- [ ] **Step 3: Implement** — `src/domain/games.ts`

```ts
/** Stable internal id for a game; also the default family of a new game. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "game";
}

export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

Run: `npx vitest run src/domain/games.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing service tests** — in `src/server/services/core.test.ts` change the catalog import to `import { addTable, createGame, deleteGame, removeTable, updateGame, updateTable } from "./catalog";` and append:

```ts
describe("custom games", () => {
  const azul = {
    name: "Azul",
    descriptionEn: "Draft tiles, score patterns.",
    descriptionRu: "Набирайте плитки и собирайте узоры.",
    icon: "Gem",
    category: "abstract",
    durationMin: 40,
    weight: 7,
    minPlayers: 2,
    maxPlayers: 4,
    allowTies: false,
    active: true,
    family: null,
  };
  const game = (id: number) => facts().games.find((g) => g.id === id);

  test("create trims the name and gives a unique slug that is also its family", () => {
    const a = createGame(ctx.db, azul);
    const b = createGame(ctx.db, { ...azul, name: "  Azul " });
    expect(game(a)).toMatchObject({ name: "Azul", slug: "azul", family: "azul", icon: "Gem", weight: 7 });
    expect(game(b)).toMatchObject({ name: "Azul", slug: "azul-2", family: "azul-2" });
  });

  test("a variant joins an existing family; bad input is rejected", () => {
    const seafarers = createGame(ctx.db, { ...azul, name: "Catan: Seafarers", family: "catan" });
    expect(game(seafarers)?.family).toBe("catan");
    expectCode(() => createGame(ctx.db, { ...azul, family: "nope" }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, minPlayers: 5, maxPlayers: 4 }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, icon: "<svg>" }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, name: "   " }), "invalid_value");
    expectCode(() => createGame(ctx.db, { ...azul, category: "" }), "invalid_value");
  });

  test("update renames, re-icons and moves between families but never changes the slug", () => {
    const id = createGame(ctx.db, azul);
    updateGame(ctx.db, id, { name: "Azul Duel", icon: "Crown", family: "catan", descriptionRu: "Дуэль" });
    expect(game(id)).toMatchObject({ name: "Azul Duel", icon: "Crown", family: "catan", slug: "azul", descriptionRu: "Дуэль" });
    updateGame(ctx.db, id, { family: "azul" });
    expect(game(id)?.family).toBe("azul");
    expectCode(() => updateGame(ctx.db, id, { family: "nope" }), "invalid_value");
  });

  test("only games that were never used can be deleted", () => {
    const unused = createGame(ctx.db, azul);
    deleteGame(ctx.db, unused);
    expect(game(unused)).toBeUndefined();
    const used = createGame(ctx.db, { ...azul, name: "Used" });
    const p = insertPlayer(ctx.db, { name: "A", nickname: null, color: "#fff", source: "admin", createdAt: 1 });
    insertSession(ctx.db, { tableId: null, gameId: used, status: "cancelled", createdAt: 1 }, [
      { playerId: p, seat: 0, jokerDeclared: false, placement: null },
    ]);
    expectCode(() => deleteGame(ctx.db, used), "game_in_use");
    expectCode(() => deleteGame(ctx.db, 999), "not_found");
  });
});
```

and in `src/domain/achievements.test.ts` (inside the `describe` that holds the `all-rounder` tests, or at top level) append:

```ts
test("all-rounder counts families: a variant adds nothing, a new custom family does", () => {
  const withCustom = [...games, makeGame(11, 10, { family: "catan" }), makeGame(12, 10, { family: "azul" })];
  const unlocks = (gameIds: number[]) =>
    replay(
      { players, games: withCustom, sessions: gameIds.map((gameId, i) => duel(i + 1, gameId, (i + 1) * 10, 1, 2)) },
      makeSettings(),
    ).unlocks;
  expect(has(unlocks([1, 2, 3, 4, 11]), "all-rounder", 1)).toBe(false);
  expect(has(unlocks([1, 2, 3, 4, 12]), "all-rounder", 1)).toBe(true);
});
```

- [ ] **Step 5: Run to see them fail**

Run: `npx vitest run src/server/services/core.test.ts src/domain/achievements.test.ts`
Expected: FAIL — `createGame` / `deleteGame` not exported (the all-rounder test already passes; it pins the family rule the UI relies on).

- [ ] **Step 6: Repo writes** — append to `src/server/repo/writes.ts`:

```ts
export function insertGame(tx: Tx, values: Omit<typeof s.games.$inferInsert, "id">): number {
  return tx.insert(s.games).values(values).returning({ id: s.games.id }).get().id;
}

export function deleteGameRow(tx: Tx, id: number): void {
  tx.delete(s.games).where(eq(s.games.id, id)).run();
}

export function gameHasSessions(tx: Tx, gameId: number): boolean {
  return Boolean(tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.gameId, gameId)).get());
}
```

- [ ] **Step 7: Error code** — `src/server/services/errors.ts`: add `| "game_in_use"` to `ErrorCode`. `src/i18n/en.ts` `errors`: add `game_in_use: "This game has been played. Deactivate it instead.",`. `src/i18n/ru.ts` `errors`: add `game_in_use: "В эту игру уже играли. Выключите её вместо удаления.",`.

- [ ] **Step 8: Services** — replace the top of `src/server/services/catalog.ts` (imports, `GamePatch`, `invalid`, `updateGame`) with:

```ts
import { uniqueSlug } from "@/domain/games";
import { isOpenSession } from "@/domain/tables";
import type { GameFact } from "@/domain/types";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import {
  deleteGameRow,
  deleteTableRow,
  gameHasSessions,
  insertGame,
  insertTable,
  tableHasSessions,
  updateGameRow,
  updateTableRow,
} from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

export interface GamePatch {
  name?: string;
  family?: string;
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

/** `family: null` puts the game in its own family (its slug). */
export type NewGame = Omit<GameFact, "id" | "slug" | "family"> & { family: string | null };

const invalid = () => new ServiceError("invalid_value");

function normalized<T extends Partial<GameFact>>(g: T): T {
  return {
    ...g,
    ...(g.name !== undefined ? { name: g.name.trim() } : {}),
    ...(g.category !== undefined ? { category: g.category.trim().toLowerCase() } : {}),
    ...(g.descriptionEn !== undefined ? { descriptionEn: g.descriptionEn.trim() } : {}),
    ...(g.descriptionRu !== undefined ? { descriptionRu: g.descriptionRu.trim() } : {}),
  };
}

function checkGame(g: GameFact, families: ReadonlySet<string>): void {
  if (!(g.weight > 0 && g.weight <= 100)) throw invalid();
  if (!Number.isInteger(g.minPlayers) || g.minPlayers < 2) throw invalid();
  if (!Number.isInteger(g.maxPlayers) || g.maxPlayers < g.minPlayers || g.maxPlayers > 20) throw invalid();
  if (!Number.isInteger(g.durationMin) || g.durationMin < 1 || g.durationMin > 600) throw invalid();
  if (g.name.length === 0 || g.name.length > 40) throw invalid();
  if (g.category.length === 0 || g.category.length > 30) throw invalid();
  if (g.descriptionEn.length > 300 || g.descriptionRu.length > 300) throw invalid();
  if (!/^[A-Z][A-Za-z0-9]{1,40}$/.test(g.icon)) throw invalid();
  // A family is the game's own slug or one that another game already uses.
  if (g.family !== g.slug && !families.has(g.family)) throw invalid();
}

const familiesOf = (games: GameFact[], exceptId: number | null) =>
  new Set(games.filter((g) => g.id !== exceptId).map((g) => g.family));

export function createGame(db: Db, input: NewGame): number {
  return mutate(db, (tx) => {
    const games = loadFacts(tx).games;
    const { family, ...fields } = input;
    const base = normalized({ ...fields, id: 0 });
    const slug = uniqueSlug(base.name, games.map((g) => g.slug));
    const game: GameFact = { ...base, slug, family: family ?? slug };
    checkGame(game, familiesOf(games, null));
    const { id: _id, ...values } = game;
    return insertGame(tx, values);
  });
}

export function updateGame(db: Db, id: number, patch: GamePatch): void {
  mutate(db, (tx) => {
    const games = loadFacts(tx).games;
    const game = games.find((g) => g.id === id);
    if (!game) throw new ServiceError("not_found");
    const clean = normalized(patch);
    checkGame({ ...game, ...clean }, familiesOf(games, id));
    updateGameRow(tx, id, clean);
  });
}

export function deleteGame(db: Db, id: number): void {
  mutate(db, (tx: Tx) => {
    if (!loadFacts(tx).games.some((g) => g.id === id)) throw new ServiceError("not_found");
    if (gameHasSessions(tx, id)) throw new ServiceError("game_in_use");
    deleteGameRow(tx, id);
  });
}
```

(Keep `addTable`, `hasOpenSession`, `updateTable`, `removeTable` below unchanged.)

- [ ] **Step 9: Admin snapshot knows which games were used** — in `src/domain/snapshot.ts` add `playedGameIds: number[];` to `AdminSnapshot` after `games: GameFact[];`, and in `buildAdminSnapshot` after `games: facts.games,` add:

```ts
    playedGameIds: [...new Set(facts.sessions.map((s) => s.gameId))].sort((a, b) => a - b),
```

In `src/domain/snapshot.test.ts` append:

```ts
test("admin snapshot lists games that have any session; the public one does not", () => {
  const { pub, admin } = build(facts());
  expect(admin.playedGameIds).toEqual([1, 2]);
  expect("playedGameIds" in pub).toBe(false);
});
```

- [ ] **Step 10: Actions** — in `src/app/admin/actions.ts` change the catalog import to

```ts
import { addTable, createGame, deleteGame, removeTable, updateGame, updateTable, type GamePatch, type NewGame } from "@/server/services/catalog";
```

and under `// Catalog` add:

```ts
export async function createGameAction(input: NewGame): Result<number> {
  return runAdminAction((db) => createGame(db, input));
}

export async function deleteGameAction(id: number): Result {
  return runAdminAction((db) => deleteGame(db, id));
}
```

- [ ] **Step 11: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass, including the existing `catalog` tests in `core.test.ts`.

- [ ] **Step 12: Commit**

```bash
git add src/domain/games.ts src/domain/games.test.ts src/server/repo/writes.ts src/server/services/catalog.ts src/server/services/errors.ts src/server/services/core.test.ts src/domain/achievements.test.ts src/domain/snapshot.ts src/domain/snapshot.test.ts src/app/admin/actions.ts src/i18n
git commit -m "feat(games): create, fully edit and delete unplayed games

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: `/admin/games` card grid, edit sheet and icon picker

**Files:**
- Create: `src/components/admin/IconPicker.tsx`, `src/components/admin/GameEditSheet.tsx`
- Modify: `src/components/admin/GamesView.tsx` (rewrite), `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Consumes: `searchGameIcons` (Task 14); `createGameAction`, `updateGameAction`, `deleteGameAction`, `NewGame`, `snapshot.playedGameIds` (Task 15).
- Produces: `IconPicker({ value, onChange })`, `GameEditSheet({ game: GameFact | null, onClose })`; i18n `games.{add,edit,name,descriptionEn,descriptionRu,icon,iconSearch,iconNone,category,family,ownFamily,variantOf,delete,deleted,created,playedNoDelete}`.

- [ ] **Step 1: Strings** — in `src/i18n/en.ts` replace the `games` block with:

```ts
  games: {
    title: "Games",
    weight: "Weight",
    weightHint: "Weight = points for 1st place. Tap a game to edit it.",
    players: "Players",
    minutes: "Min",
    ties: "Ties",
    active: "Active",
    add: "Add game",
    edit: "Edit game",
    name: "Name",
    descriptionEn: "Description (EN)",
    descriptionRu: "Description (RU)",
    icon: "Icon",
    iconSearch: "Search icons, e.g. cards or кубики",
    iconNone: "No icons match.",
    category: "Category",
    family: "Family",
    ownFamily: "Its own family",
    variantOf: "Variant of {name}",
    delete: "Delete game",
    deleted: "Game deleted",
    created: "Game added",
    playedNoDelete: "This game has been played, so it can only be deactivated.",
  },
```

and in `src/i18n/ru.ts`:

```ts
  games: {
    title: "Игры",
    weight: "Вес",
    weightHint: "Вес = очки за 1-е место. Нажмите на игру, чтобы изменить её.",
    players: "Игроки",
    minutes: "Мин",
    ties: "Ничьи",
    active: "Активна",
    add: "Добавить игру",
    edit: "Изменить игру",
    name: "Название",
    descriptionEn: "Описание (EN)",
    descriptionRu: "Описание (RU)",
    icon: "Иконка",
    iconSearch: "Поиск иконок, например cards или кубики",
    iconNone: "Ничего не найдено.",
    category: "Категория",
    family: "Семейство",
    ownFamily: "Отдельное семейство",
    variantOf: "Вариант игры {name}",
    delete: "Удалить игру",
    deleted: "Игра удалена",
    created: "Игра добавлена",
    playedNoDelete: "В эту игру уже играли, поэтому её можно только выключить.",
  },
```

- [ ] **Step 2: Icon picker** — `src/components/admin/IconPicker.tsx`

```tsx
"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { searchGameIcons } from "../common/gameIcons";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const icons = searchGameIcons(query);

  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.games.iconSearch} className={inputClass} />
      <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto rounded-md border border-line p-1 sm:grid-cols-8">
        {icons.map(({ name, Icon }) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={name === value}
            onClick={() => onChange(name)}
            className={cn(
              "grid aspect-square place-items-center rounded-md transition-colors",
              name === value ? "bg-accent/20 text-accent ring-1 ring-accent" : "text-muted hover:bg-white/5 hover:text-text",
            )}
          >
            <Icon className="size-5" strokeWidth={1.5} />
          </button>
        ))}
        {icons.length === 0 ? <p className="col-span-full p-3 text-sm text-muted">{t.games.iconNone}</p> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Edit sheet** — `src/components/admin/GameEditSheet.tsx`

```tsx
"use client";

import { useState } from "react";
import { createGameAction, deleteGameAction, updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Sheet } from "../ui/Sheet";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { IconPicker } from "./IconPicker";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );
}

const EMPTY = {
  name: "",
  descriptionEn: "",
  descriptionRu: "",
  icon: "Dices",
  category: "",
  durationMin: 30,
  weight: 6,
  minPlayers: 2,
  maxPlayers: 6,
  allowTies: false,
  active: true,
};

/** `game: null` adds a new game. */
export function GameEditSheet({ game, onClose }: { game: GameFact | null; onClose: () => void }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [draft, setDraft] = useState(() => {
    if (!game) return EMPTY;
    const { id: _id, slug: _slug, family: _family, ...fields } = game;
    return fields;
  });
  const [family, setFamily] = useState<string | null>(game && game.family !== game.slug ? game.family : null);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const floor = snapshot.event.scoring.participationFloor;
  const played = game !== null && snapshot.playedGameIds.includes(game.id);

  const families = new Map<string, string>();
  for (const g of snapshot.games) {
    if (g.id === game?.id) continue;
    if (!families.has(g.family) || g.slug === g.family) families.set(g.family, g.name);
  }
  const categories = [...new Set(snapshot.games.map((g) => g.category))].sort();

  const save = () => {
    if (game) {
      run(() => updateGameAction(game.id, { ...draft, family: family ?? game.slug }), { success: t.common.saved, onOk: onClose });
    } else {
      run(() => createGameAction({ ...draft, family }), { success: t.games.created, onOk: onClose });
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={game ? t.games.edit : t.games.add}
      footer={
        <Button variant="primary" size="lg" block loading={pending} disabled={draft.name.trim().length === 0} onClick={save}>
          {t.common.save}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
            <GameIcon name={draft.icon} className="size-6 text-accent" />
          </span>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t.games.name}
            maxLength={40}
            className={inputClass}
            aria-label={t.games.name}
          />
        </div>

        <Field label={t.games.icon}>
          <IconPicker value={draft.icon} onChange={(icon) => set("icon", icon)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.games.category}>
            <input
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              list="game-categories"
              maxLength={30}
              className={inputClass}
            />
            <datalist id="game-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t.games.family}>
            <select value={family ?? ""} onChange={(e) => setFamily(e.target.value || null)} className={inputClass}>
              <option value="">{t.games.ownFamily}</option>
              {[...families].map(([value, name]) => (
                <option key={value} value={value}>
                  {fmt(t.games.variantOf, { name })}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <Field label={`${t.games.weight} · ${formatPoints(draft.weight)} / ${formatPoints(draft.weight * floor)}`}>
            <Stepper value={draft.weight} min={1} max={50} onChange={(v) => set("weight", v)} label={t.games.weight} />
          </Field>
          <Field label={t.games.players}>
            <div className="flex items-center gap-1.5">
              <Stepper value={draft.minPlayers} min={2} max={draft.maxPlayers} onChange={(v) => set("minPlayers", v)} />
              <Stepper value={draft.maxPlayers} min={draft.minPlayers} max={20} onChange={(v) => set("maxPlayers", v)} />
            </div>
          </Field>
          <Field label={t.games.minutes}>
            <Stepper value={draft.durationMin} min={5} max={240} step={5} onChange={(v) => set("durationMin", v)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6">
          <Switch checked={draft.allowTies} onCheckedChange={(v) => set("allowTies", v)} label={t.games.ties} />
          <Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} label={t.games.active} />
        </div>

        <Field label={t.games.descriptionEn}>
          <textarea
            value={draft.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
            maxLength={300}
            rows={2}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
        <Field label={t.games.descriptionRu}>
          <textarea
            value={draft.descriptionRu}
            onChange={(e) => set("descriptionRu", e.target.value)}
            maxLength={300}
            rows={2}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>

        {game ? (
          played ? (
            <p className="border-l-2 border-line-strong pl-3 text-xs text-muted">{t.games.playedNoDelete}</p>
          ) : (
            <ConfirmButton
              size="sm"
              disabled={pending}
              label={t.games.delete}
              confirmLabel={t.common.tapToConfirm}
              onConfirm={() => run(() => deleteGameAction(game.id), { success: t.games.deleted, onOk: onClose })}
            />
          )
        ) : null}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: Card grid** — replace `src/components/admin/GamesView.tsx` with:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { updateGameAction } from "@/app/admin/actions";
import { formatPoints } from "@/domain/scoring";
import type { GameFact } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { GameEditSheet } from "./GameEditSheet";
import { useRunner } from "./useRunner";

export function GamesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const [editing, setEditing] = useState<GameFact | "new" | null>(null);
  const floor = snapshot.event.scoring.participationFloor;
  const games = [...snapshot.games].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.games.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.games.weightHint}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t.games.add}
        </Button>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((game) => (
          <GameCard key={game.id} game={game} floor={floor} onEdit={() => setEditing(game)} />
        ))}
      </ul>
      {editing ? (
        <GameEditSheet
          key={editing === "new" ? "new" : editing.id}
          game={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.68rem] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular">{value}</dd>
    </div>
  );
}

function GameCard({ game, floor, onEdit }: { game: GameFact; floor: number; onEdit: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useRunner();

  return (
    <li className={cn("flex flex-col gap-4 rounded-md border border-line bg-surface p-4", !game.active && "opacity-50")}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
          <GameIcon name={game.icon} className="size-5 text-accent" />
        </span>
        <button type="button" onClick={onEdit} className="group min-w-0 flex-1 text-left">
          <div className="truncate font-display text-lg uppercase leading-tight tracking-wide group-hover:text-accent">{game.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-sm border border-line-strong px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
              {game.category}
            </span>
            {game.family !== game.slug ? (
              <span className="rounded-sm border border-accent/40 px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-accent">
                {game.family}
              </span>
            ) : null}
          </div>
        </button>
        <Switch
          checked={game.active}
          disabled={pending}
          onCheckedChange={(active) => run(() => updateGameAction(game.id, { active }))}
        />
      </div>
      <dl className="grid grid-cols-4 gap-2 border-t border-line pt-3">
        <Stat label={t.games.weight} value={`${formatPoints(game.weight)}/${formatPoints(game.weight * floor)}`} />
        <Stat label={t.games.players} value={`${game.minPlayers}–${game.maxPlayers}`} />
        <Stat label={t.games.minutes} value={game.durationMin} />
        <Stat label={t.games.ties} value={game.allowTies ? "✓" : "–"} />
      </dl>
    </li>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser (verify server, phone width 390×844 and desktop 1440×900): `/admin/games` shows aligned cards in 1 / 2 / 3 columns; "Add game" → name "Azul", search "кубик" and pick an icon, category "abstract", save → card appears; seat a table with Azul in `/admin`, record a result, the projector reveal shows Azul with its icon; open Azul again → Delete is replaced by the "already played" note; open an unused new game → Delete (two taps) removes it.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/IconPicker.tsx src/components/admin/GameEditSheet.tsx src/components/admin/GamesView.tsx src/i18n
git commit -m "feat(games): card grid, add/edit sheet with icon picker and delete for unplayed games

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Part C — Achievement settings & rules

### Task 17: Per-achievement "Sealed" switch

**Files:**
- Modify: `src/server/db/schema.ts`, `drizzle/` (generated `0005_achievement_sealed.sql` + meta)
- Modify: `src/domain/types.ts`, `src/domain/achievements.ts`, `src/domain/achievements.test.ts`, `src/domain/finale.ts`, `src/domain/finale.test.ts`, `src/domain/snapshot.ts`, `src/domain/snapshot.test.ts`, `src/domain/timeline.ts`, `src/domain/timeline.test.ts`, `src/domain/profile.ts`, `src/domain/profile.test.ts`, `src/components/screen/logic.test.ts`
- Modify: `src/server/repo/facts.ts`, `src/server/repo/writes.ts`, `src/server/services/achievements.ts`, `src/server/services/achievements.test.ts`, `src/app/admin/actions.ts`
- Modify: `src/components/admin/AchievementsAdmin.tsx`, `src/components/admin/UnlockFeed.tsx`, `src/components/public/AchievementsView.tsx`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Produces:
  - `Facts.sealedOverrides: Record<string, boolean>` (only achievements whose admin choice differs from the default)
  - `isSealed(id: AchievementId, overrides: Readonly<Record<string, boolean>>): boolean` — the only place that reads `achievementDef(id).sealed`
  - `newPublicUnlocks(before: Unlock[], after: Unlock[], overrides: Readonly<Record<string, boolean>>): Unlock[]` (replaced in Task 18)
  - `AchievementsView.sealed: AchievementId[]` (effective sealed ids, all achievements)
  - `upsertAchievementSetting(tx, achievementId, patch: { enabled?: boolean; sealed?: boolean | null })`
  - `setAchievementSealed(db, input: { achievementId: string; sealed: boolean }): void`; `setAchievementSealedAction(input)`
  - i18n `adminAchievements.enabled`

- [ ] **Step 1: Write the failing domain test** — in `src/domain/achievements.test.ts` add `isSealed` to the `./achievements` import and append inside `describe("definitions", …)`:

```ts
  test("isSealed prefers the admin override over the built-in default", () => {
    expect(isSealed("comeback", {})).toBe(true);
    expect(isSealed("comeback", { comeback: false })).toBe(false);
    expect(isSealed("phoenix", {})).toBe(false);
    expect(isSealed("phoenix", { phoenix: true })).toBe(true);
  });
```

and change the existing `newPublicUnlocks` test calls to pass overrides:

```ts
    expect(newPublicUnlocks([a], [a, b, sealed], {})).toEqual([b]);
    expect(newPublicUnlocks([a, b], [b], {})).toEqual([]);
    expect(newPublicUnlocks([], [sealed], { underdog: false })).toEqual([sealed]);
```

Run: `npx vitest run src/domain/achievements.test.ts`
Expected: FAIL — `isSealed` is not exported.

- [ ] **Step 2: Domain helper** — in `src/domain/achievements.ts` add after `achievementDef`:

```ts
/** The admin's per-achievement choice wins over the built-in default. */
export function isSealed(id: AchievementId, overrides: Readonly<Record<string, boolean>>): boolean {
  return overrides[id] ?? achievementDef(id).sealed;
}
```

and replace `newPublicUnlocks` with:

```ts
export function newPublicUnlocks(
  before: Unlock[],
  after: Unlock[],
  overrides: Readonly<Record<string, boolean>>,
): Unlock[] {
  const known = new Set(before.map(unlockKey));
  return after.filter((u) => !known.has(unlockKey(u)) && !isSealed(u.achievementId, overrides));
}
```

Run: `npx vitest run src/domain/achievements.test.ts`
Expected: PASS.

- [ ] **Step 3: Facts field** — `src/domain/types.ts`, in `Facts` after `disabledAchievements: string[];`:

```ts
  /** Achievement ids whose sealed flag the admin changed, with the chosen value. */
  sealedOverrides: Record<string, boolean>;
```

Add `sealedOverrides: {},` right after `disabledAchievements: [],` in the `facts()` helpers of `src/domain/snapshot.test.ts`, `src/domain/finale.test.ts` and `src/domain/profile.test.ts`. In `src/domain/timeline.test.ts` change `const facts = { sessions };` to `const facts = { sessions, sealedOverrides: {} };`. In `src/components/screen/logic.test.ts` change `noAchievements` to

```ts
const noAchievements = { enabled: [], sealed: [], unlocks: [], sealedUnlockCount: 0, eligiblePlayers: 0 };
```

- [ ] **Step 4: Schema + migration** — in `src/server/db/schema.ts` change `achievementSettings` to:

```ts
export const achievementSettings = sqliteTable("achievement_settings", {
  achievementId: text().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  /** null = the achievement's built-in default. */
  sealed: integer({ mode: "boolean" }),
});
```

Run: `npm run db:generate -- --name achievement_sealed`
Expected: `drizzle/0005_achievement_sealed.sql` with a single `ALTER TABLE \`achievement_settings\` ADD \`sealed\` integer;`.

- [ ] **Step 5: Repo** — `src/server/repo/facts.ts`, in `loadFacts` after the `disabledAchievements` property add:

```ts
    sealedOverrides: Object.fromEntries(
      tx
        .select({ id: s.achievementSettings.achievementId, sealed: s.achievementSettings.sealed })
        .from(s.achievementSettings)
        .all()
        .flatMap((r) => (r.sealed === null ? [] : [[r.id, r.sealed] as const])),
    ),
```

`src/server/repo/writes.ts` — replace `upsertAchievementSetting` with:

```ts
export function upsertAchievementSetting(
  tx: Tx,
  achievementId: string,
  patch: { enabled?: boolean; sealed?: boolean | null },
): void {
  tx.insert(s.achievementSettings)
    .values({ achievementId, enabled: patch.enabled ?? true, sealed: patch.sealed ?? null })
    .onConflictDoUpdate({ target: s.achievementSettings.achievementId, set: patch })
    .run();
}
```

- [ ] **Step 6: Write the failing service tests** — in `src/server/services/achievements.test.ts` change the import to `import { setAchievementEnabled, setAchievementSealed } from "./achievements";` and append:

```ts
test("sealed can be switched per achievement; only choices that differ from the default are stored", () => {
  setAchievementSealed(ctx.db, { achievementId: "comeback", sealed: false });
  setAchievementSealed(ctx.db, { achievementId: "phoenix", sealed: true });
  setAchievementEnabled(ctx.db, { achievementId: "phoenix", enabled: false });
  expect(loadFacts(ctx.db).sealedOverrides).toEqual({ comeback: false, phoenix: true });
  expect(loadFacts(ctx.db).disabledAchievements).toEqual(["phoenix"]);
  setAchievementSealed(ctx.db, { achievementId: "comeback", sealed: true });
  expect(loadFacts(ctx.db).sealedOverrides).toEqual({ phoenix: true });
  expect(() => setAchievementSealed(ctx.db, { achievementId: "nope", sealed: true })).toThrow(ServiceError);
});

test("switching sealed never queues or removes cards, and works after finish", () => {
  recordDirectResult(ctx.db, { gameId: catan, tableId: null, placements: placements(ids) });
  const before = achievementAnnouncements();
  setAchievementSealed(ctx.db, { achievementId: "opening-move", sealed: true });
  expect(achievementAnnouncements()).toEqual(before);
  finishEvent(ctx.db);
  setAchievementSealed(ctx.db, { achievementId: "opening-move", sealed: false });
  expect(loadFacts(ctx.db).sealedOverrides).toEqual({});
});
```

Run: `npx vitest run src/server/services/achievements.test.ts`
Expected: FAIL — `setAchievementSealed` is not exported.

- [ ] **Step 7: Service** — replace `src/server/services/achievements.ts` with:

```ts
import { achievementDef, isAchievementId, newPublicUnlocks, type Unlock } from "@/domain/achievements";
import { replay } from "@/domain/replay";
import type { Db, Tx } from "../db/client";
import { loadFacts } from "../repo/facts";
import { insertAnnouncement, upsertAchievementSetting } from "../repo/writes";
import { ServiceError } from "./errors";
import { mutate } from "./mutate";

function unlocksNow(tx: Tx): { unlocks: Unlock[]; sealedOverrides: Record<string, boolean> } {
  const facts = loadFacts(tx);
  return { unlocks: replay(facts, facts.event.scoring).unlocks, sealedOverrides: facts.sealedOverrides };
}

/** Runs a result-changing write and queues projector cards for public achievements it newly unlocked. */
export function withUnlockAnnouncements<T>(tx: Tx, write: () => T): T {
  const before = unlocksNow(tx).unlocks;
  const value = write();
  const after = unlocksNow(tx);
  const now = Date.now();
  for (const u of newPublicUnlocks(before, after.unlocks, after.sealedOverrides)) {
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
  mutate(db, (tx) => upsertAchievementSetting(tx, id, { enabled: input.enabled }), { allowWhenFinished: true });
}

/** Stores the choice only when it differs from the built-in default. Never queues cards. */
export function setAchievementSealed(db: Db, input: { achievementId: string; sealed: boolean }): void {
  if (!isAchievementId(input.achievementId)) throw new ServiceError("invalid_value");
  const id = input.achievementId;
  const sealed = input.sealed === achievementDef(id).sealed ? null : input.sealed;
  mutate(db, (tx) => upsertAchievementSetting(tx, id, { sealed }), { allowWhenFinished: true });
}
```

and in `src/app/admin/actions.ts` change the import to `import { setAchievementEnabled, setAchievementSealed } from "@/server/services/achievements";` and add after `setAchievementEnabledAction`:

```ts
export async function setAchievementSealedAction(input: { achievementId: string; sealed: boolean }): Result {
  return runAdminAction((db) => setAchievementSealed(db, input));
}
```

Run: `npx vitest run src/server/services/achievements.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing derived-state tests** — append to `src/domain/snapshot.test.ts`:

```ts
test("sealed overrides decide which unlocks stay hidden before the reveal and are listed in the view", () => {
  const { pub } = build({ ...facts(), sealedOverrides: { "joker-master": false, phoenix: true } });
  expect(pub.achievements.sealed).toContain("phoenix");
  expect(pub.achievements.sealed).toContain("underdog");
  expect(pub.achievements.sealed).not.toContain("joker-master");
  expect(pub.achievements.unlocks.some((u) => u.achievementId === "joker-master")).toBe(true);
});
```

and inside the `buildFinaleScript` describe of `src/domain/finale.test.ts`:

```ts
  test("an achievement the admin unsealed gets no finale beat", () => {
    const sessions = [makeDoneSession(1, 1, MIN, [[1, 1, true], [2, 2]])];
    const beatsWith = (overrides: Record<string, boolean>) => {
      const f = { ...facts(sessions), sealedOverrides: overrides };
      return buildFinaleScript(f, replay(f, f.event.scoring)).filter((b) => b.kind === "sealed");
    };
    expect(beatsWith({})).toHaveLength(1);
    expect(beatsWith({ "joker-master": false })).toHaveLength(0);
  });
```

Run: `npx vitest run src/domain/snapshot.test.ts src/domain/finale.test.ts`
Expected: FAIL — `sealed` missing from the view; the unsealed achievement still gets a beat.

- [ ] **Step 9: Use `isSealed` everywhere**
  - `src/domain/finale.ts`: import `{ isSealed, type AchievementId }` instead of `achievementDef`, and change `if (!achievementDef(u.achievementId).sealed) continue;` to `if (!isSealed(u.achievementId, facts.sealedOverrides)) continue;`.
  - `src/domain/snapshot.ts`: import `{ ACHIEVEMENTS, isAchievementId, isSealed, type AchievementId, type Unlock }` (drop `achievementDef`); add `sealed: AchievementId[];` to `AchievementsView` after `enabled`; in `announcements` change the sealed line to `if (isSealed(achievementId, facts.sealedOverrides) && !opts.includeSealed) return [];`; replace `achievementsView` with:

```ts
function achievementsView(facts: Facts, rp: Replay, includeSealed: boolean): AchievementsView {
  const disabled = new Set(facts.disabledAchievements);
  const sealed = (u: Unlock) => isSealed(u.achievementId, facts.sealedOverrides);
  return {
    enabled: ACHIEVEMENTS.filter((d) => !disabled.has(d.id)).map((d) => d.id),
    sealed: ACHIEVEMENTS.filter((d) => isSealed(d.id, facts.sealedOverrides)).map((d) => d.id),
    unlocks: rp.unlocks
      .filter((u) => includeSealed || !sealed(u))
      .map((u, i) => ({ u, i }))
      .sort((a, b) => b.u.at - a.u.at || b.i - a.i)
      .map(({ u }) => u),
    sealedUnlockCount: rp.unlocks.filter(sealed).length,
    eligiblePlayers: rp.standings.filter((r) => r.rank !== null).length,
  };
}
```

  - `src/domain/timeline.ts`: import `{ isSealed, type AchievementId }` instead of `achievementDef`; change the parameter to `facts: Pick<Facts, "sessions" | "sealedOverrides">` and the filter to `if (!opts.includeSealed && isSealed(u.achievementId, facts.sealedOverrides)) continue;`.
  - `src/domain/profile.ts`: import `{ ACHIEVEMENTS, isSealed, type AchievementId }`; replace the `achievements` mapping with:

```ts
  const sealed = (id: AchievementId) => isSealed(id, facts.sealedOverrides);
  const achievements: ProfileAchievement[] = ACHIEVEMENTS.filter((d) => !disabled.has(d.id) && (revealed || !sealed(d.id))).map((d) => ({
    id: d.id,
    sealed: sealed(d.id),
    unlockedAt: unlockedAt.get(d.id) ?? null,
    progress: d.progress ? d.progress(history) : null,
  }));
```

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 10: UI reads the effective flag**
  - `src/components/admin/UnlockFeed.tsx`: remove the `achievementDef` import, add `const sealed = new Set(snapshot.achievements.sealed);` after `lookups`, and change `achievementDef(u.achievementId).sealed ?` to `sealed.has(u.achievementId) ?`.
  - `src/components/public/AchievementsView.tsx`: change the import to `import { rarityOf } from "@/domain/achievements";`, add `const sealed = new Set(snapshot.achievements.sealed);` after `const revealed = …`, and change `const sealedHidden = achievementDef(id).sealed && !revealed;` to `const sealedHidden = sealed.has(id) && !revealed;`.
  - `src/i18n/en.ts` `adminAchievements`: set `hint: "Off hides an achievement everywhere. Sealed keeps its description secret until the finale.",` and add `enabled: "On",`. `src/i18n/ru.ts`: `hint: "Выключенное достижение пропадает везде. Скрытое держит описание в секрете до финала.",` and `enabled: "Вкл",`.
  - `src/components/admin/AchievementsAdmin.tsx`: change the actions import to `import { setAchievementEnabledAction, setAchievementSealedAction } from "@/app/admin/actions";`, add `const sealedIds = new Set(snapshot.achievements.sealed);` after `const enabled = …`, and replace the whole `<li>` rendered for each `def` with:

```tsx
            <li key={def.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <AchievementIcon id={def.id} className={cn("size-5 shrink-0 text-accent", !on && "opacity-50")} />
              <div className={cn("min-w-0 flex-1", !on && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display uppercase tracking-wide">{text.title}</span>
                  {sealed ? (
                    <span className="rounded-sm border border-line-strong px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                      {t.adminAchievements.sealed}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted">
                  {text.description} · {fmt(t.adminAchievements.unlockCount, { n: counts.get(def.id) ?? 0 })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Switch
                  checked={sealed}
                  disabled={pending}
                  onCheckedChange={(next) => run(() => setAchievementSealedAction({ achievementId: def.id, sealed: next }))}
                  label={<span className="text-xs text-muted">{t.adminAchievements.sealed}</span>}
                />
                <Switch
                  checked={on}
                  disabled={pending}
                  onCheckedChange={(next) => run(() => setAchievementEnabledAction({ achievementId: def.id, enabled: next }))}
                  label={<span className="text-xs text-muted">{t.adminAchievements.enabled}</span>}
                />
              </div>
            </li>
```

  with `const sealed = sealedIds.has(def.id);` added next to `const on = enabled.has(def.id);`.

- [ ] **Step 11: Verify no direct reads remain**

Run: `grep -rn "\.sealed\b" src --include='*.ts' --include='*.tsx' | grep "achievementDef" | grep -v "src/domain/achievements.ts" || echo "only isSealed reads the default"`
Expected: `only isSealed reads the default` (tests in `achievements.test.ts` / `snapshot.test.ts` that read `ACHIEVEMENTS…sealed` for the built-in defaults are fine).

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/server/db/schema.ts drizzle src/domain src/server src/app/admin/actions.ts src/components/admin/AchievementsAdmin.tsx src/components/admin/UnlockFeed.tsx src/components/public/AchievementsView.tsx src/components/screen/logic.test.ts src/i18n
git commit -m "feat(achievements): per-achievement Sealed switch in admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Sealed means "description secret until the finale"

**Files:**
- Modify: `src/domain/achievements.ts`, `src/domain/achievements.test.ts`, `src/domain/snapshot.ts`, `src/domain/snapshot.test.ts`, `src/domain/timeline.ts`, `src/domain/timeline.test.ts`, `src/domain/profile.ts`, `src/domain/profile.test.ts`
- Modify: `src/server/services/achievements.ts`, `src/server/services/achievements.test.ts`
- Modify: `src/components/public/AchievementsView.tsx` (rewrite), `src/components/public/ProfileView.tsx`, `src/components/screen/AchievementCard.tsx`, `src/components/screen/scenes/SceneAchievements.tsx`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Consumes: `isSealed`, `AchievementsView.sealed` (Task 17).
- Produces:
  - `type AchievementVisibility = "full" | "titleOnly"`, `achievementVisibility(sealed: boolean, revealed: boolean): AchievementVisibility`
  - `newUnlocks(before: Unlock[], after: Unlock[]): Unlock[]` (replaces `newPublicUnlocks`)
  - `buildTimeline(facts: Pick<Facts, "sessions">, rp, opts: { limit?: number } = {})`
  - public snapshot: every unlock, every achievement announcement; profile lists sealed achievements before the reveal
  - i18n `screen.sealedUnlocked`

- [ ] **Step 1: Update the tests to the new rule (they fail first)**

`src/domain/achievements.test.ts`: import `achievementVisibility` and `newUnlocks` instead of `newPublicUnlocks`; replace the `newPublicUnlocks` test with:

```ts
  test("newUnlocks returns every new unlock, sealed ones included", () => {
    const a: Unlock = { achievementId: "catan-lord", playerId: 1, sessionId: 1, at: 1 };
    const b: Unlock = { achievementId: "opening-move", playerId: 2, sessionId: 2, at: 2 };
    const sealed: Unlock = { achievementId: "underdog", playerId: 2, sessionId: 2, at: 2 };
    expect(newUnlocks([a], [a, b, sealed])).toEqual([b, sealed]);
    expect(newUnlocks([a, b], [b])).toEqual([]);
  });

  test("achievementVisibility hides only a sealed description, only before the reveal", () => {
    expect(achievementVisibility(true, false)).toBe("titleOnly");
    expect(achievementVisibility(true, true)).toBe("full");
    expect(achievementVisibility(false, false)).toBe("full");
  });
```

`src/domain/snapshot.test.ts`:
  - replace the test `"public sees public unlocks and only a sealed count; admin sees everything"` with:

```ts
  test("public sees every unlock, sealed included, plus the sealed count", () => {
    const { pub, admin } = build(facts());
    const sealed = (id: Parameters<typeof achievementDef>[0]) => achievementDef(id).sealed;
    expect(pub.achievements.unlocks).toEqual(admin.achievements.unlocks);
    expect(pub.achievements.unlocks.some((u) => u.achievementId === "joker-master" && u.playerId === 1)).toBe(true);
    expect(pub.achievements.sealedUnlockCount).toBe(admin.achievements.unlocks.filter((u) => sealed(u.achievementId)).length);
    expect(pub.achievements.sealedUnlockCount).toBeGreaterThan(0);
    expect(pub.achievements.eligiblePlayers).toBe(3);
    expect(pub.achievements.enabled).toHaveLength(22);
    expect(pub.counters.achievementsUnlocked).toBe(admin.achievements.unlocks.length);
  });
```

  - in `"achievement announcements: sealed and stale ones never reach the public"` rename it to `"achievement announcements: sealed ones are public, stale ones never are"` and replace its two expectations with:

```ts
    expect(pub.announcements.map((a) => a.id)).toEqual([1, 2]);
    expect(admin.announcements.map((a) => a.id)).toEqual([1, 2]);
```

  - in `"public before the reveal: stats and stories yes, finale stats and sealed timeline items no"` rename it to `"public before the reveal: stats, stories and sealed timeline items yes, finale stats no"` and change the joker-master timeline expectation to `.toBe(true)`.
  - in the Task 17 test `"sealed overrides decide which unlocks stay hidden…"` rename it to `"the view lists effective sealed ids"` and delete its last line (`unlocks.some(… "joker-master")`), which no longer depends on sealing.

`src/domain/timeline.test.ts`: change `buildTimeline(facts, rp, { includeSealed: false })` to `buildTimeline(facts, rp)`, `{ includeSealed: true, limit: 3 }` to `{ limit: 3 }`, and replace the test `"sealed unlocks only when included"` with:

```ts
test("sealed unlocks are part of the timeline", () => {
  expect(buildTimeline(facts, rp).some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(true);
});
```

`src/domain/profile.test.ts`: rename `"room facts only, no standings keys, no sealed achievements"` to `"room facts only, no standings keys, sealed achievements listed"` and replace `expect(p.achievements.some((a) => a.sealed)).toBe(false);` with

```ts
    expect(p.achievements.find((a) => a.id === "joker-master")).toMatchObject({ sealed: true, unlockedAt: 10 * MIN });
```

`src/server/services/achievements.test.ts`: rename `"a new result queues public unlocks only, with its session id"` to `"a new result queues every new unlock, sealed ones too, with its session id"` and change its first expectation to:

```ts
  expect(achievementAnnouncements()).toEqual([`catan-lord:${ids[0]}`, `joker-master:${ids[0]}`, `opening-move:${ids[0]}`]);
```

Run: `npm test`
Expected: FAIL in the files above (old sealed filtering still active, `newUnlocks`/`achievementVisibility` missing).

- [ ] **Step 2: Domain** — in `src/domain/achievements.ts` replace `newPublicUnlocks` with:

```ts
export function newUnlocks(before: Unlock[], after: Unlock[]): Unlock[] {
  const known = new Set(before.map(unlockKey));
  return after.filter((u) => !known.has(unlockKey(u)));
}

export type AchievementVisibility = "full" | "titleOnly";

/** Sealed achievements show title, icon and holders during the event; the description waits for the finale reveal. */
export function achievementVisibility(sealed: boolean, revealed: boolean): AchievementVisibility {
  return sealed && !revealed ? "titleOnly" : "full";
}
```

`src/domain/snapshot.ts`:
  - `announcements(…)`: change `opts: { withPoints: boolean; includeSealed: boolean }` to `opts: { withPoints: boolean }` and delete the line `if (isSealed(achievementId, facts.sealedOverrides) && !opts.includeSealed) return [];`
  - `achievementsView`: change the signature to `function achievementsView(facts: Facts, rp: Replay): AchievementsView` and replace `.filter((u) => includeSealed || !sealed(u))` with nothing (start the chain at `rp.unlocks.map((u, i) => ({ u, i }))`)
  - in `buildPublicSnapshot`: `const achievements = achievementsView(facts, rp);`, `announcements(facts, rp, now, { withPoints: revealed || facts.event.showPointsInReveals })`, `timeline: buildTimeline(facts, rp),`
  - in `buildAdminSnapshot`: `announcements(facts, rp, now, { withPoints: true })`, `achievements: achievementsView(facts, rp),`

`src/domain/timeline.ts`: change the signature to

```ts
export function buildTimeline(
  facts: Pick<Facts, "sessions">,
  rp: Pick<Replay, "results" | "unlocks">,
  opts: { limit?: number } = {},
): TimelineItem[] {
```

delete the sealed `continue` line in the unlock loop, and change the import to `import type { AchievementId } from "./achievements";`.

`src/domain/profile.ts`: change the filter to `ACHIEVEMENTS.filter((d) => !disabled.has(d.id))` (keep `sealed: sealed(d.id)`).

`src/server/services/achievements.ts`: change the domain import to `import { achievementDef, isAchievementId, newUnlocks, type Unlock } from "@/domain/achievements";` and replace `unlocksNow` and `withUnlockAnnouncements` with:

```ts
function unlocksNow(tx: Tx): Unlock[] {
  const facts = loadFacts(tx);
  return replay(facts, facts.event.scoring).unlocks;
}

/** Runs a result-changing write and queues projector cards for every achievement it newly unlocked, sealed ones included. */
export function withUnlockAnnouncements<T>(tx: Tx, write: () => T): T {
  const before = unlocksNow(tx);
  const value = write();
  const now = Date.now();
  for (const u of newUnlocks(before, unlocksNow(tx))) {
    insertAnnouncement(
      tx,
      { type: "achievement", payload: { sessionId: u.sessionId, playerId: u.playerId, achievementId: u.achievementId } },
      now,
    );
  }
  return value;
}
```

Run: `npm test`
Expected: PASS (if `"corrections announce only unlocks that are new"` now reports extra sealed ids, list the actual ids it prints and confirm each is a genuine new unlock of that edit before updating the expected array).

- [ ] **Step 3: Strings** — `src/i18n/en.ts` `screen`: add `sealedUnlocked: "Sealed achievement unlocked",` and change `sealedUntilFinale` to `"Sealed, explained at the finale"`. `src/i18n/ru.ts` `screen`: add `sealedUnlocked: "Открыто скрытое достижение",` and change `sealedUntilFinale` to `"Скрытые, условие раскроется в финале"`.

- [ ] **Step 4: Public achievements page** — replace `src/components/public/AchievementsView.tsx` with:

```tsx
"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { achievementVisibility, rarityOf } from "@/domain/achievements";
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
  const sealed = new Set(snapshot.achievements.sealed);

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
          const titleOnly = achievementVisibility(sealed.has(id), revealed) === "titleOnly";
          const holders = unlocks.filter((u) => u.achievementId === id).reverse();
          const rarity = rarityOf(holders.length, eligiblePlayers);
          const text = t.achievements.defs[id];
          return (
            <li key={id} className={cn("space-y-2 py-4", holders.length === 0 && "opacity-70")}>
              <div className="flex items-center gap-3">
                <AchievementIcon id={id} className={cn("size-5 shrink-0", holders.length > 0 ? "text-accent" : "text-muted")} />
                <span className="font-display text-lg uppercase tracking-wide">{text.title}</span>
                {titleOnly ? <Lock className="size-3.5 shrink-0 text-muted" strokeWidth={1.5} aria-label={t.achievements.sealed} /> : null}
                {rarity ? (
                  <span className="ml-auto label-caps text-accent">{t.achievements.rarity[rarity]}</span>
                ) : titleOnly ? (
                  <span className="ml-auto label-caps">{t.achievements.sealed}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted">{titleOnly ? t.achievements.sealedBody : text.description}</p>
              {holders.length === 0 ? (
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Profile** — in `src/components/public/ProfileView.tsx` change the lucide import to `import { ArrowLeft, Lock } from "lucide-react";`, add `import { achievementVisibility } from "@/domain/achievements";`, and in the achievements list replace

```tsx
                  <div className="font-display uppercase tracking-wide">{text.title}</div>
                  <div className="text-xs text-muted">{text.description}</div>
```

with

```tsx
                  <div className="flex items-center gap-2 font-display uppercase tracking-wide">
                    {text.title}
                    {titleOnly ? <Lock className="size-3.5 text-muted" strokeWidth={1.5} aria-label={t.achievements.sealed} /> : null}
                  </div>
                  <div className="text-xs text-muted">{titleOnly ? t.achievements.sealedBody : text.description}</div>
```

and add `const titleOnly = achievementVisibility(a.sealed, profile.revealed) === "titleOnly";` after `const done = a.unlockedAt !== null;`.

- [ ] **Step 6: Projector card** — in `src/components/screen/AchievementCard.tsx` add `import { Lock } from "lucide-react";` and `import { achievementVisibility } from "@/domain/achievements";` (merge with the existing `type AchievementId` import), add after `const def = …`:

```tsx
  const titleOnly =
    achievementVisibility(snapshot.achievements.sealed.includes(achievementId), snapshot.event.finaleRevealed) === "titleOnly";
```

replace `{t.screen.achievementUnlocked}` with `{titleOnly ? t.screen.sealedUnlocked : t.screen.achievementUnlocked}` and replace

```tsx
          {def.description}
```

with

```tsx
          {titleOnly ? (
            <span className="inline-flex items-center gap-4">
              <Lock className="size-[40px]" strokeWidth={1.5} />
              {t.achievements.sealedBody}
            </span>
          ) : (
            def.description
          )}
```

- [ ] **Step 7: Achievements scene** — in `src/components/screen/scenes/SceneAchievements.tsx` change the domain import to `import { achievementVisibility, rarityOf } from "@/domain/achievements";`, add `const sealed = new Set(snapshot.achievements.sealed);` after `const groups = …`, and replace

```tsx
                      <div className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                        {t.achievements.defs[group.achievementId].title}
                      </div>
```

with

```tsx
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="truncate font-display text-[54px] uppercase leading-none tracking-wide">
                          {t.achievements.defs[group.achievementId].title}
                        </span>
                        {achievementVisibility(sealed.has(group.achievementId), snapshot.event.finaleRevealed) === "titleOnly" ? (
                          <Lock className="size-[36px] shrink-0 text-muted" strokeWidth={1.5} />
                        ) : null}
                      </div>
```

- [ ] **Step 8: Verify**

Run: `grep -rn "includeSealed\|newPublicUnlocks" src || echo "gone"`
Expected: `gone`.

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Browser (verify server, not logged in): `/achievements` shows sealed titles with a lock, their holders, and "Revealed at the finale." instead of the description; `/players/{id}` of a holder shows the same; record a result that unlocks Joker Master → the projector shows "Sealed achievement unlocked · Joker Master" with no description. Finish the event and step the finale past Final standings → the pages show the descriptions.

- [ ] **Step 9: Commit**

```bash
git add src/domain src/server/services src/components/public/AchievementsView.tsx src/components/public/ProfileView.tsx src/components/screen/AchievementCard.tsx src/components/screen/scenes/SceneAchievements.tsx src/i18n
git commit -m "feat(achievements): sealed achievements are public by title and holders; only the description waits for the finale

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 19: Comeback measured among players who were already ranked

**Files:**
- Modify: `src/domain/standings.ts`, `src/domain/standings.test.ts`, `src/domain/achievements.ts`, `src/domain/achievements.test.ts`, `src/domain/stats.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`

**Interfaces:**
- Produces: `priorFieldRise(before: StandingRow[], after: StandingRow[], playerId: number): { from: number; to: number; field: number } | null`; `COMEBACK_MIN_RISE = 3`, `COMEBACK_MIN_FIELD = 8`.

- [ ] **Step 1: Write the failing standings test** — in `src/domain/standings.test.ts` change the import to `import { priorFieldRise, rankStandings, selectCounted, type PlayerTotals, type StandingRow } from "./standings";` and append:

```ts
describe("priorFieldRise", () => {
  const row = (playerId: number, rank: number | null): StandingRow => ({
    playerId,
    rank,
    raw: 0,
    counted: 0,
    wins: 0,
    podiums: 0,
    gamesPlayed: rank === null ? 0 : 1,
    countedSessionIds: [],
    excludedSessionIds: [],
  });

  test("ranks only among players ranked before the result; newcomers count on neither side", () => {
    const before = [row(1, 1), row(2, 2), row(3, 3), row(4, null), row(5, null)];
    const after = [row(4, 1), row(5, 2), row(3, 3), row(1, 4), row(2, 5)];
    expect(priorFieldRise(before, after, 3)).toEqual({ from: 3, to: 1, field: 3 });
    expect(priorFieldRise(before, after, 1)).toEqual({ from: 1, to: 2, field: 3 });
    expect(priorFieldRise(before, after, 4)).toBeNull();
  });
});
```

- [ ] **Step 2: Replace the Comeback test** — in `src/domain/achievements.test.ts` replace the test `"comeback: rise of 3+ ranks counts only from the 10th result"` with:

```ts
  test("comeback: climb 3+ places among already-ranked players, once at least 8 are ranked", () => {
    /** Players 2.. each beat player 12 once, player 1 enters low, then player 1 wins big. `size` players are ranked before that win. */
    const field = (size: number) => {
      const sessions = Array.from({ length: size - 2 }, (_, i) => duel(i + 1, 9, i + 1, i + 2, 12));
      sessions.push(duel(sessions.length + 1, 9, sessions.length + 1, 2, 1));
      sessions.push(duel(sessions.length + 1, 10, sessions.length + 1, 1, 12));
      return sessions;
    };
    expect(has(unlocksOf(field(8)), "comeback", 1)).toBe(true);
    expect(has(unlocksOf(field(7)), "comeback", 1)).toBe(false);
    const newcomerWins = [...field(8).slice(0, -1), duel(99, 10, 99, 11, 12)];
    expect(has(unlocksOf(newcomerWins), "comeback", 11)).toBe(false);
  });
```

Run: `npx vitest run src/domain/standings.test.ts src/domain/achievements.test.ts`
Expected: FAIL — `priorFieldRise` not exported; `field(7)` still unlocks under the old rule.

- [ ] **Step 3: Implement the measure** — append to `src/domain/standings.ts`:

```ts
/**
 * Rank movement measured only among players who were ranked before a result, so first-time scorers
 * in the same result can neither inflate nor hide a climb. `field` is how many players that is.
 */
export function priorFieldRise(
  before: StandingRow[],
  after: StandingRow[],
  playerId: number,
): { from: number; to: number; field: number } | null {
  const prior = new Set(before.filter((r) => r.rank !== null).map((r) => r.playerId));
  const from = before.find((r) => r.playerId === playerId)?.rank ?? null;
  if (from === null) return null;
  const order = after.filter((r) => prior.has(r.playerId) && r.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const to = order.findIndex((r) => r.playerId === playerId) + 1;
  return to === 0 ? null : { from, to, field: prior.size };
}
```

- [ ] **Step 4: New Comeback rule** — in `src/domain/achievements.ts`:
  - change `import type { StandingRow } from "./standings";` to `import { priorFieldRise, type StandingRow } from "./standings";`
  - delete the `rankIn` helper line
  - add above `ACHIEVEMENTS`:

```ts
export const COMEBACK_MIN_RISE = 3;
export const COMEBACK_MIN_FIELD = 8;
```

  - replace the `comeback` definition with:

```ts
  {
    id: "comeback",
    icon: "TrendingUp",
    sealed: true,
    check: (ctx, p) => {
      const rise = priorFieldRise(ctx.before, ctx.after, p);
      return rise !== null && rise.field >= COMEBACK_MIN_FIELD && rise.from - rise.to >= COMEBACK_MIN_RISE;
    },
  },
```

- [ ] **Step 5: Same measure for the stats** — in `src/domain/stats.ts` change `import type { StandingRow } from "./standings";` to `import { priorFieldRise, type StandingRow } from "./standings";` and replace the loop body of `biggestComeback` with:

```ts
    for (const p of rp.results[i].players) {
      const rise = priorFieldRise(step.before, step.after, p.playerId);
      if (!rise || rise.from - rise.to < 1) continue;
      if (!best || rise.from - rise.to > best.from - best.to) {
        best = { playerId: p.playerId, sessionId: step.sessionId, from: rise.from, to: rise.to };
      }
    }
```

(`rankIn` in `stats.ts` stays; `rankRace` still uses it.) Update its doc comment to `/** Largest single-result rise among players ranked before that result. The earliest wins a tie. */`.

- [ ] **Step 6: Description** — `src/i18n/en.ts`: `comeback: { title: "Comeback", description: "Climb three or more places among ranked players with one result." },`. `src/i18n/ru.ts`: `comeback: { title: "Камбэк", description: "Поднимитесь на три места и выше среди игроков с результатами за одну игру." },`.

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass, including the unchanged `"biggest single-result rise"` stats test (its field is all four players, so the result stays `{ playerId: 4, sessionId: 4, from: 4, to: 1 }`).

- [ ] **Step 8: Commit**

```bash
git add src/domain/standings.ts src/domain/standings.test.ts src/domain/achievements.ts src/domain/achievements.test.ts src/domain/stats.ts src/i18n
git commit -m "feat(achievements): Comeback counts places among already-ranked players, with at least eight of them

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 20: Full browser pass, docs and merge

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/plans/2026-09-17-board-games-cup-tier4.md` (check boxes)

- [ ] **Step 1: Production build still works** (the root layout now reads the database)

Run: `npm run build`
Expected: build succeeds. If it fails because a dev server holds `.next`, stop dev servers and rerun.

- [ ] **Step 2: Fresh verify database and server** — follow "Browser checks" (delete and recreate `data/verify.db`, seed demo, start port 3100). Add players until there are at least 30 (`/admin/players`, bulk add), add tables until there are 10.

- [ ] **Step 3: Walk every surface at 1920×1080 and 390×844 with Playwright**

  1. `/` (EN and RU toggle): hero shows the brand; tab title matches; favicon is the brand mark.
  2. Settings → Branding: press the RU preset, save; RU site and a projector set to RU show `HIS^` / `ВЕЧЕР НАСТОЛОК`; clearing the fields returns to the default.
  3. Settings → Network: set the public address; `/screen` footer shows the dark QR beside the link; scan the screenshot with a phone or decode it with `jsqr` in a quick script — it must open the address. `/admin/qr` shows light, gold-eyed codes.
  4. `/screen`: step through all scenes; the overflow snippet returns `[]` in each; Live room and Achievements glide when long.
  5. Record a tie result (1, 2, 2, 4) and a 10-player result; reveals go from last place up, ties together, long list scrolls from the bottom.
  6. `/admin/games`: tidy grid; add a game with a custom icon; use it at a table; delete an unused game.
  7. `/admin/leaderboard`: tapping a name opens the full profile (`?view=admin`); the same URL without `?view=admin` in the same browser shows the public profile (no points before the reveal).
  8. `/achievements` and a profile, logged out: sealed titles and holders visible, descriptions replaced; admin achievements page: toggle Sealed off for Joker Master → description becomes public, no new card plays.
  9. Finish the event; `/admin/finale`: jump to step 4 directly; tap Final standings (confirm), standings become public; the sealed slides each list all holders; the Champion slide has the spotlight and shimmer with nothing blurred parked behind the name.
  10. `/screen?rehearsal=1`: full ceremony still plays.

  Fix anything found with its own small commit before continuing.

- [ ] **Step 4: Document the new rules** — append to `CLAUDE.md` after the Tier 3 section:

```markdown
## Tier 4 (shipped via docs/superpowers/plans/2026-09-17-board-games-cup-tier4.md)

- Brand lines live in four nullable `event` columns; `resolveBrand` (`domain/brand.ts`) falls back per line to English, then `HIS^ BOARD GAMES` / `CUP`. Client code reads `useBrand()`; the projector wraps its own `BrandProvider` fed by the live snapshot.
- `/players/[id]` always renders the public audience unless an admin adds `?view=admin` (the admin leaderboard links do). Don't bring back "admin cookie means admin view" on public pages.
- Projector scenes render inside `SCENE_FRAME` (`components/screen/layout.ts`); never add per-scene bottom padding. Long lists go in `<AutoScroll>`; its timing lives in `scrollPlan.ts`. Keep those two file names distinct: the event laptop runs Windows (case-insensitive paths).
- Sealed now means "description hidden until `finaleRevealed`": sealed unlocks are public, appear in the timeline and queue projector cards. The effective flag is `isSealed(id, facts.sealedOverrides)`; don't read `achievementDef(id).sealed` anywhere else. Descriptions ship in the client dictionary, so "hidden" is presentation, not secrecy.
- The finale has one `sealed` beat per achievement (`playerIds`). `finaleGoto` shares the sticky reveal rule with next/back; the remote asks for a second tap before jumping onto or past the reveal step.
- Comeback uses `priorFieldRise` (rank among players ranked before the result): ≥ 3 places with ≥ 8 such players. `biggestComeback` uses the same measure.
- Games: `createGame` / `updateGame` / `deleteGame` in `services/catalog.ts`. A family is the game's own slug or an existing family; delete is refused (`game_in_use`) once any session references the game. Icons come from the curated `components/common/gameIcons.ts`.
- Styled QR: `qrSvg(url, theme)` in `server/qr.ts`; the projector footer loads `/api/qr?theme=dark`. The QR test decodes a rasterized layout with `jsqr`.
- Browser checks run against `DB_PATH=data/verify.db` on port 3100, never against `data/board-cup.db`.
```

- [ ] **Step 5: Tick every checkbox in this plan, clean up, commit**

```bash
rm -f data/verify.db data/verify.db-shm data/verify.db-wal
sed -i 's/- \[ \]/- [x]/' docs/superpowers/plans/2026-09-17-board-games-cup-tier4.md
npm test && npm run typecheck && npm run lint
git add CLAUDE.md docs/superpowers/plans/2026-09-17-board-games-cup-tier4.md
git commit -m "docs: document Tier 4 rules and check off the plan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge** — use `superpowers:finishing-a-development-branch`: rebase `tier4` onto `master`, fast-forward `master`, delete `tier4` (same flow as Tiers 2–3). Restart the port-3000 dev server if it was stopped, and confirm `ss -ltn | grep 3000` shows it listening.
