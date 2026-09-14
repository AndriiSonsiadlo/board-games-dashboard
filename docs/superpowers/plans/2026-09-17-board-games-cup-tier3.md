# Board Games Cup — Tier 3 (Stats, Timeline, QR, Streaks, Stories) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of the shipped Tier 2 app, add the printable QR sheet, `/stats` (with heatmap and finale-only stats), `/timeline`, hot-streak markers, the `story` and `popular` projector scenes, the projector ticker, and removal of demo announcements when demo data is cleared.

**Architecture:** Everything new is derived state computed in `src/domain` from `replay()` output, like Tier 1/2: `stats.ts` grows public stats, a table × hour heatmap, hot streaks and finale-only stats; `stories.ts` turns public stats into ranked story items; `timeline.ts` builds a newest-first feed. `buildPublicSnapshot` carries these as `stats`, `finaleStats` (null until `finaleRevealed`), `streaks`, `stories` and `timeline`, so the existing privacy test automatically guards them. Pure text helpers turn story/timeline items into localized lines shared by the projector and phones. The QR sheet is a server-rendered admin page using `qrcode` SVG output.

**Tech Stack:** Next.js 16.3 (App Router; `params`/`searchParams`/`headers()` are async), React 19, TypeScript strict, Tailwind CSS 4, motion 13 (`motion/react`), lucide-react 1.x, better-sqlite3 13 + drizzle-orm 0.45 + drizzle-kit 0.31, Vitest 5, `qrcode` 1.5 (new).

**Spec:** `docs/superpowers/specs/2026-09-15-board-games-cup-design.md` (Tier 3 row of §1; §3.3, §7 `/admin/qr`, §8 `/stats` + `/timeline`, §9, §10 ticker + `story`/`popular` scenes, §14 clear-demo). Conventions: Tier 2 plan `docs/superpowers/plans/2026-09-16-board-games-cup-tier2.md`.

**Event-night priority:** the event is 2026-09-18. Tasks 1–3 (strings, QR sheet, demo cleanup) matter for running the evening; Tasks 4–11 add spectacle. Execute in order; if time runs out, stop after a green task — every task leaves the app shippable.

## Global Constraints

- No emoji anywhere in UI strings, code, or seed data. Icons come from `lucide-react` or custom SVG.
- Public audience never receives these keys before `event.finaleRevealed` is true: `points`, `base`, `rank`, `counted`, `raw`, `jokerDeclared`, `jokerUsed`, `gamesPlayed`, `wins`, `podiums`, `trend`, `countedSessionIds`, `excludedSessionIds`. New public structures must not use these key names (use `count`, `streak`, `ranks`, `from`/`to` inside finale-only data). Extend `FORBIDDEN_PUBLIC_KEYS` rather than bypassing the test.
- `finaleStats` (biggest comeback, best Joker, most games played, rank race) is `null` in the public snapshot until `finaleRevealed`.
- Sealed achievements never appear in the public timeline, stories or ticker before the reveal.
- "Win" = placement 1, including a tie for 1st. A hot streak is the player's latest unbroken run of wins, shown when it is at least 2 (`HOT_STREAK_MIN`).
- Durations: only sessions with a real duration (`durationMin !== null`) count for longest/fastest; direct results count in the heatmap in the hour they were entered.
- Heatmap hour buckets are `Math.floor(ts / 3_600_000) * 3_600_000` (correct for whole-hour time zones such as Warsaw); at most the latest 12 hours.
- Projector scene order is always `ALL_SCENES` order: `title, room, recent, counters, achievements, story, popular, contenders`. `contenders` stays disabled by default.
- Do not change the `enabledScenes` default in `src/server/db/schema.ts`; existing DBs get the new scenes via a hand-written migration (as 0002 did).
- `/admin/qr` requires a valid admin cookie (`requireAdminPage()`).
- Every mutation goes through `mutate()`; `deleteDemoData` stays inside the existing `clearDemoData`/`goLive` transactions.
- Motion: easing `EASE` from `src/components/motion/FadeRise.tsx`; no new gradients; radius max 6 px; 1 px hairlines.
- Every new string goes into both `src/i18n/en.ts` and `src/i18n/ru.ts` (`ru: Dict`); game names stay in Latin script in Russian text.
- Run `npm test && npm run typecheck && npm run lint` at the end of every task; all three must pass before committing.

## File Structure

```
src/i18n/en.ts, ru.ts             MODIFY  Tier 3 strings (plurals, stats, timeline, stories, qr, scene names)
src/i18n/i18n.test.ts             MODIFY  plural/template checks
package.json                      MODIFY  qrcode, @types/qrcode
src/server/qr.ts (+ .test.ts)     CREATE  resolveBaseUrl, qrLinks, qrSvg
src/app/admin/qr/page.tsx         CREATE  printable QR sheet (outside the panel layout, no nav)
src/components/admin/PrintButton.tsx CREATE
src/components/admin/SettingsView.tsx MODIFY  QR sheet link in Network
src/app/globals.css               MODIFY  print background
src/server/repo/writes.ts         MODIFY  deleteDemoData removes demo announcements
src/server/repo/repo.test.ts      MODIFY
src/domain/stats.ts (+ test)      MODIFY  public stats, heatmap, hot streaks, finale stats
src/domain/stories.ts (+ test)    CREATE  buildStories
src/domain/timeline.ts (+ test)   CREATE  buildTimeline
src/domain/snapshot.ts (+ test)   MODIFY  stats, finaleStats, streaks, stories, timeline
src/components/common/timelineText.ts (+ test) CREATE nameLookup, timelineText, timelineKey
src/components/screen/storyText.ts (+ test)    CREATE storyText
src/domain/types.ts               MODIFY  SceneId story/popular, ALL_SCENES, DEFAULT_SCENES
drizzle/0003_enable_story_popular_scenes.sql CREATE (custom migration)
src/components/screen/logic.ts (+ test) MODIFY availableScenes (canonical order, story/popular)
src/components/screen/scenes/SceneStory.tsx, ScenePopular.tsx CREATE; SceneContenders.tsx MODIFY
src/components/screen/ScreenTicker.tsx CREATE; ScreenApp.tsx MODIFY
src/components/public/rankChart.ts (+ test) MODIFY optional fixed maxRank
src/components/public/SectionTitle.tsx, Heatmap.tsx, RaceChart.tsx, StatsView.tsx, TimelineView.tsx CREATE
src/components/public/HomeView.tsx, ProfileView.tsx MODIFY
src/components/common/StreakMark.tsx CREATE; lookups.ts MODIFY
src/app/(public)/stats/page.tsx, timeline/page.tsx CREATE
README.md, CLAUDE.md              MODIFY
```

---

### Task 1: Tier 3 dictionaries (English and Russian)

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/ru.ts`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: existing `Dict`, `PluralForms`, `plural`, `fmt`.
- Produces (keys later tasks use):
  - `t.plurals.wins | times | achievements | minutes`
  - `t.settings.screen.sceneNames.story | popular`, `t.settings.network.qrSheet`
  - `t.home.stats | timeline | hotStreak` (`hotStreak` has `{n}`)
  - `t.screen.stories | popular`
  - `t.stats.{title, subtitle, back, empty, gamesCompleted, distinctGames, tableSize, popularity, highlights, longest, fastest, rivals, together, heatmap, heatmapHint, finale, finaleLocked, comeback, comebackValue, bestJoker, bestJokerValue, mostGames, race, none}`
  - `t.timeline.{title, subtitle, back, empty, started, startedNoTable, result, unlock, milestone}`
  - `t.stories.{streak, streakKicker, milestone, milestoneKicker, rivals, rivalsKicker, collector, collectorKicker, popular, popularKicker, longest, longestKicker}` (templates use `{count}` = number plus plural word)
  - `t.qr.{title, print, back, noBaseUrl, site, siteHint, checkin, checkinHint, screen, screenHint, admin, adminHint}`

- [x] **Step 1: Write the failing test**

Append to `src/i18n/i18n.test.ts` (inside `describe("dictionaries", ...)`):

```ts
  test("tier 3 plurals and templates", () => {
    expect(plural("ru", 5, ru.plurals.wins)).toBe("побед");
    expect(plural("ru", 3, ru.plurals.times)).toBe("раза");
    expect(plural("ru", 21, ru.plurals.achievements)).toBe("достижение");
    expect(plural("en", 1, en.plurals.minutes)).toBe("minute");
    expect(fmt(en.timeline.result, { winners: "Amy", game: "Uno" })).toBe("Amy won Uno");
    expect(fmt(ru.home.hotStreak, { n: 3 })).toBe("Побед подряд: 3");
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/i18n.test.ts`
Expected: FAIL — `Cannot read properties of undefined` (no `wins` plural, no `timeline` section).

- [x] **Step 3: Add English strings to `src/i18n/en.ts`**

In `plurals`, after `sealedUnlocks: { one: "sealed unlock", other: "sealed unlocks" } as PluralForms,` add:

```ts
    wins: { one: "win", other: "wins" } as PluralForms,
    times: { one: "time", other: "times" } as PluralForms,
    achievements: { one: "achievement", other: "achievements" } as PluralForms,
    minutes: { one: "minute", other: "minutes" } as PluralForms,
```

In `settings.screen.sceneNames`, after `achievements: "Achievements",` add:

```ts
        story: "Stories",
        popular: "Popular games",
```

In `settings.network`, after `use: "Use",` add:

```ts
      qrSheet: "Print QR codes",
```

In `home`, after `latestUnlocks: "Latest unlocks",` add:

```ts
    stats: "Stats",
    timeline: "Timeline",
    hotStreak: "{n} wins in a row",
```

In `screen`, after `podium: "Podium",` add:

```ts
    stories: "Stories of the night",
    popular: "Most played",
```

After the closing `},` of `profile` (the last section, just before `};` and `export type Dict`), add:

```ts
  stats: {
    title: "Stats",
    subtitle: "The evening so far, straight from the results.",
    back: "Back to event",
    empty: "Stats appear after the first result.",
    gamesCompleted: "Games completed",
    distinctGames: "Different games",
    tableSize: "Usual table size",
    popularity: "Game popularity",
    highlights: "Highlights",
    longest: "Longest game",
    fastest: "Fastest game",
    rivals: "Rivals of the night",
    together: "together",
    heatmap: "Tables by hour",
    heatmapHint: "Games in play at each table, per hour.",
    finale: "Finale stats",
    finaleLocked: "Revealed at the finale.",
    comeback: "Biggest comeback",
    comebackValue: "from {from} to {to}",
    bestJoker: "Best Joker",
    bestJokerValue: "+{points} pts in {game}",
    mostGames: "Most games played",
    race: "Race for the cup",
    none: "--",
  },
  timeline: {
    title: "Timeline",
    subtitle: "Everything that happened tonight, newest first.",
    back: "Back to event",
    empty: "Nothing has happened yet.",
    started: "{game} started · {table}",
    startedNoTable: "{game} started",
    result: "{winners} won {game}",
    unlock: "{player} unlocked {achievement}",
    milestone: "{n} games completed",
  },
  stories: {
    streakKicker: "On fire",
    streak: "{player}: {count} in a row",
    milestoneKicker: "Almost there",
    milestone: "{count} to go until game {next}",
    rivalsKicker: "Rivals",
    rivals: "{a} and {b} have shared {count}",
    collectorKicker: "Collector",
    collector: "{player} has unlocked {count}",
    popularKicker: "Crowd favorite",
    popular: "{game}, played {count}",
    longestKicker: "Endurance",
    longest: "{game} lasted {count}",
  },
  qr: {
    title: "QR codes",
    print: "Print",
    back: "Back to settings",
    noBaseUrl: "No public address is set, so these codes use {url}. Pick the Wi-Fi address in Settings first.",
    site: "Follow the evening",
    siteHint: "Live tables, results and achievements",
    checkin: "Check in",
    checkinHint: "Add your name to join the cup",
    screen: "Projector",
    screenHint: "Open on the laptop connected to the projector",
    admin: "Organizer",
    adminHint: "PIN required",
  },
```

- [x] **Step 4: Add Russian strings to `src/i18n/ru.ts`**

In `plurals`, after the `sealedUnlocks` line add:

```ts
    wins: { one: "победа", few: "победы", many: "побед", other: "победы" },
    times: { one: "раз", few: "раза", many: "раз", other: "раза" },
    achievements: { one: "достижение", few: "достижения", many: "достижений", other: "достижения" },
    minutes: { one: "минута", few: "минуты", many: "минут", other: "минуты" },
```

In `settings.screen.sceneNames`, after `achievements: "Достижения",` add:

```ts
        story: "Истории",
        popular: "Популярные игры",
```

In `settings.network`, after `use: "Выбрать",` add:

```ts
      qrSheet: "Распечатать QR-коды",
```

In `home`, after `latestUnlocks: "Новые достижения",` add:

```ts
    stats: "Статистика",
    timeline: "Хроника",
    hotStreak: "Побед подряд: {n}",
```

In `screen`, after `podium: "Пьедестал",` add:

```ts
    stories: "Истории вечера",
    popular: "Самые популярные игры",
```

After the closing `},` of `profile` add:

```ts
  stats: {
    title: "Статистика",
    subtitle: "Вечер в цифрах, прямо из результатов.",
    back: "К событию",
    empty: "Статистика появится после первого результата.",
    gamesCompleted: "Игр сыграно",
    distinctGames: "Разных игр",
    tableSize: "Обычно за столом",
    popularity: "Популярность игр",
    highlights: "Главное",
    longest: "Самая долгая игра",
    fastest: "Самая быстрая игра",
    rivals: "Соперники вечера",
    together: "вместе",
    heatmap: "Столы по часам",
    heatmapHint: "Сколько игр шло за каждым столом в каждый час.",
    finale: "Итоги финала",
    finaleLocked: "Откроется на финале.",
    comeback: "Главный рывок",
    comebackValue: "с {from} на {to} место",
    bestJoker: "Лучший Джокер",
    bestJokerValue: "+{points} очк. в {game}",
    mostGames: "Больше всего игр",
    race: "Гонка за кубок",
    none: "--",
  },
  timeline: {
    title: "Хроника",
    subtitle: "Всё, что произошло за вечер, сначала новое.",
    back: "К событию",
    empty: "Пока ничего не произошло.",
    started: "{game}: старт · {table}",
    startedNoTable: "{game}: старт",
    result: "{game}: побеждает {winners}",
    unlock: "{player}: достижение «{achievement}»",
    milestone: "Сыграно игр: {n}",
  },
  stories: {
    streakKicker: "В ударе",
    streak: "{player}: {count} подряд",
    milestoneKicker: "Почти рубеж",
    milestone: "Ещё {count} до {next}-й игры",
    rivalsKicker: "Соперники",
    rivals: "{a} и {b}: {count} вместе",
    collectorKicker: "Коллекционер",
    collector: "{player}: уже {count}",
    popularKicker: "Любимая игра",
    popular: "{game}: сыграно {count}",
    longestKicker: "Марафон",
    longest: "{game}: {count} за столом",
  },
  qr: {
    title: "QR-коды",
    print: "Печать",
    back: "Назад к настройкам",
    noBaseUrl: "Публичный адрес не задан, поэтому коды ведут на {url}. Сначала выберите адрес Wi-Fi в настройках.",
    site: "Следите за вечером",
    siteHint: "Столы, результаты и достижения в реальном времени",
    checkin: "Регистрация",
    checkinHint: "Добавьте своё имя, чтобы участвовать",
    screen: "Проектор",
    screenHint: "Откройте на ноутбуке, подключённом к проектору",
    admin: "Организатор",
    adminHint: "Нужен PIN",
  },
```

- [x] **Step 5: Run tests and checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS (the key-parity and no-emoji tests also cover the new sections).

- [x] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/ru.ts src/i18n/i18n.test.ts
git commit -m "feat(i18n): add stats, timeline, stories, QR and scene strings in English and Russian"
```

---

### Task 2: Printable QR sheet

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm), `src/components/admin/SettingsView.tsx`, `src/app/globals.css`
- Create: `src/server/qr.ts`, `src/app/admin/qr/page.tsx`, `src/components/admin/PrintButton.tsx`
- Test: `src/server/qr.test.ts`

**Interfaces:**
- Consumes: `t.qr.*`, `t.settings.network.qrSheet` (Task 1); `requireAdminPage()` (`src/server/auth/admin.ts`); `getAdminSnapshot(db)` (`src/server/live.ts`); `getLang()` (`src/i18n/server.ts`); `getDict`, `fmt` (`src/i18n`).
- Produces:
  - `QR_TARGETS = ["site", "checkin", "screen", "admin"] as const`, `type QrTarget`
  - `resolveBaseUrl(publicBaseUrl: string | null, host: string | null): string` — no trailing slash, always with scheme
  - `qrLinks(baseUrl: string): { target: QrTarget; url: string }[]`
  - `qrSvg(url: string): Promise<string>`
  - Route `/admin/qr`.

- [x] **Step 1: Install the dependency**

Run: `npm install qrcode@^1.5.4 && npm install -D @types/qrcode@^1.5.6`
Expected: both added to `package.json`.

- [x] **Step 2: Write the failing test**

Create `src/server/qr.test.ts`:

```ts
import { expect, test } from "vitest";
import { qrLinks, qrSvg, resolveBaseUrl } from "./qr";

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

test("qrSvg renders a standalone svg", async () => {
  const svg = await qrSvg("http://192.168.1.20:3000/checkin");
  expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 \d+ \d+"/);
  expect(svg.trim().endsWith("</svg>")).toBe(true);
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/server/qr.test.ts`
Expected: FAIL — `Cannot find module './qr'`.

- [x] **Step 4: Implement `src/server/qr.ts`**

```ts
import QRCode from "qrcode";

export const QR_TARGETS = ["site", "checkin", "screen", "admin"] as const;
export type QrTarget = (typeof QR_TARGETS)[number];

const PATHS: Record<QrTarget, string> = { site: "/", checkin: "/checkin", screen: "/screen", admin: "/admin" };

/** The configured public address, else the address this page was opened on. Always with a scheme, never a trailing slash. */
export function resolveBaseUrl(publicBaseUrl: string | null, host: string | null): string {
  const raw = publicBaseUrl?.trim() || host || "localhost:3000";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

export function qrLinks(baseUrl: string): { target: QrTarget; url: string }[] {
  return QR_TARGETS.map((target) => ({ target, url: `${baseUrl}${PATHS[target]}` }));
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/qr.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Create `src/components/admin/PrintButton.tsx`**

```tsx
"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-2 rounded-md bg-black px-5 font-display text-sm uppercase tracking-[0.08em] text-white"
    >
      <Printer className="size-4" />
      {label}
    </button>
  );
}
```

- [x] **Step 7: Create `src/app/admin/qr/page.tsx`**

It lives outside `(panel)` so the sheet prints without the admin navigation; it checks the cookie itself.

```tsx
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { PrintButton } from "@/components/admin/PrintButton";
import { BrandMark } from "@/components/brand/Wordmark";
import { fmt, getDict } from "@/i18n";
import { getLang } from "@/i18n/server";
import { requireAdminPage } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getAdminSnapshot } from "@/server/live";
import { qrLinks, qrSvg, resolveBaseUrl, type QrTarget } from "@/server/qr";

export const dynamic = "force-dynamic";

export default async function QrSheetPage() {
  await requireAdminPage();
  const t = getDict(await getLang());
  const { event } = getAdminSnapshot(getDb());
  const base = resolveBaseUrl(event.publicBaseUrl, (await headers()).get("host"));
  const codes = await Promise.all(qrLinks(base).map(async (link) => ({ ...link, svg: await qrSvg(link.url) })));
  const labels: Record<QrTarget, [string, string]> = {
    site: [t.qr.site, t.qr.siteHint],
    checkin: [t.qr.checkin, t.qr.checkinHint],
    screen: [t.qr.screen, t.qr.screenHint],
    admin: [t.qr.admin, t.qr.adminHint],
  };

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
          <Link href="/admin/settings" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="size-4" />
            {t.qr.back}
          </Link>
          <PrintButton label={t.qr.print} />
        </div>
        {event.publicBaseUrl ? null : (
          <p className="mb-6 rounded-md border border-black/30 p-3 text-sm print:hidden">{fmt(t.qr.noBaseUrl, { url: base })}</p>
        )}
        <header className="mb-8 flex items-end justify-between border-b-2 border-black pb-4">
          <div>
            <div className="font-display text-4xl uppercase leading-none tracking-tight">{t.common.appName}</div>
            <div className="mt-2 font-display text-sm uppercase tracking-[0.3em]">
              {event.city} · {event.year}
            </div>
          </div>
          <BrandMark className="size-12" />
        </header>
        <ul className="grid grid-cols-2 gap-6">
          {codes.map((code) => (
            <li key={code.target} className="flex break-inside-avoid flex-col items-center rounded-md border border-black/20 p-6 text-center">
              <div className="w-full max-w-[240px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: code.svg }} />
              <div className="mt-5 font-display text-2xl uppercase tracking-wide">{labels[code.target][0]}</div>
              <div className="mt-1 text-sm">{labels[code.target][1]}</div>
              <div className="mt-3 font-mono text-xs">{code.url}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [x] **Step 8: Print background in `src/app/globals.css`**

Append at the end of the file:

```css
@media print {
  html,
  body {
    background: #fff !important;
    color: #000 !important;
  }
}
```

- [x] **Step 9: Link from Settings**

In `src/components/admin/SettingsView.tsx`, change the lucide import `import { Download } from "lucide-react";` to `import { Download, QrCode } from "lucide-react";`, then replace

```tsx
        <Network addresses={addresses} port={port} />
```

with

```tsx
        <Network addresses={addresses} port={port} />
        <Link
          href="/admin/qr"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-4 font-display text-sm uppercase tracking-[0.08em]"
        >
          <QrCode className="size-4" />
          {t.settings.network.qrSheet}
        </Link>
```

- [x] **Step 10: Verify in the browser**

Check the dev server (`ss -ltn | grep 3000`; restart with `npm run dev` if nothing listens — see CLAUDE.md). Log into `/admin` (PIN `1234`), open Settings → Network → "Print QR codes". Expected: white page, four QR codes with labels and URLs; the header buttons and base-URL warning disappear in print preview (Playwright: `page.emulateMedia({ media: "print" })` then screenshot). Scan one code from a phone if available, or decode the screenshot, to confirm the URL. Opening `/admin/qr` in a context without the cookie redirects to `/admin/login`.

- [x] **Step 11: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add package.json package-lock.json src/server/qr.ts src/server/qr.test.ts src/app/admin/qr/page.tsx src/components/admin/PrintButton.tsx src/components/admin/SettingsView.tsx src/app/globals.css
git commit -m "feat(admin): add printable QR sheet for site, check-in, screen and admin"
```

---

### Task 3: Clearing demo data also removes demo announcements

**Files:**
- Modify: `src/server/repo/writes.ts`
- Test: `src/server/repo/repo.test.ts`

**Interfaces:**
- Consumes: `deleteDemoData(tx)`, `insertAnnouncement`, `insertSession`, `insertPlayer`, `loadFacts`.
- Produces: `deleteDemoData` additionally deletes announcements whose `payload.sessionId` is a deleted demo session, whose `payload.playerId` is a deleted demo player, and milestone announcements whose `count` exceeds the number of remaining `done` sessions (so real milestones can fire again). Signature unchanged.

- [x] **Step 1: Write the failing test**

In `src/server/repo/repo.test.ts`, inside `describe("version, announcements, audit, demo cleanup", ...)`, add:

```ts
  test("deleteDemoData also removes announcements about demo games or players and milestones past the remaining results", () => {
    const now = Date.now();
    const real = insertPlayer(ctx.db, { name: "Real", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const real2 = insertPlayer(ctx.db, { name: "Real 2", nickname: null, color: "#fff", source: "admin", createdAt: now });
    const demo = insertPlayer(ctx.db, { name: "Demo", nickname: null, color: "#fff", source: "admin", isDemo: true, createdAt: now });
    const demoGame = insertSession(ctx.db, { gameId: 1, status: "done", createdAt: now, isDemo: true }, [
      { playerId: demo, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: real, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    const realGame = insertSession(ctx.db, { gameId: 1, status: "done", createdAt: now, isDemo: false }, [
      { playerId: real, seat: 0, jokerDeclared: false, placement: 1 },
      { playerId: real2, seat: 1, jokerDeclared: false, placement: 2 },
    ]);
    const keepReveal = insertAnnouncement(ctx.db, { type: "result_reveal", payload: { sessionId: realGame } }, 1);
    insertAnnouncement(ctx.db, { type: "result_reveal", payload: { sessionId: demoGame } }, 2);
    insertAnnouncement(ctx.db, { type: "achievement", payload: { sessionId: demoGame, playerId: real, achievementId: "phoenix" } }, 3);
    insertAnnouncement(ctx.db, { type: "achievement", payload: { sessionId: realGame + 100, playerId: demo, achievementId: "marathon" } }, 4);
    const keepMilestone = insertAnnouncement(ctx.db, { type: "milestone", payload: { count: 1 } }, 5);
    insertAnnouncement(ctx.db, { type: "milestone", payload: { count: 2 } }, 6);

    deleteDemoData(ctx.db);

    expect(loadFacts(ctx.db).announcements.map((a) => a.id).sort((a, b) => a - b)).toEqual([keepReveal, keepMilestone]);
    expect(milestoneExists(ctx.db, 2)).toBe(false);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/repo/repo.test.ts -t "announcements about demo"`
Expected: FAIL — received ids include the four stale announcements.

- [x] **Step 3: Implement in `src/server/repo/writes.ts`**

Replace the whole `deleteDemoData` function with:

```ts
/** Announcements about deleted demo games/players, and milestones the remaining results have not reached. */
function deleteDemoAnnouncements(tx: Tx, sessionIds: Set<number>, playerIds: Set<number>): void {
  const remainingResults = tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.status, "done")).all().length;
  const stale = tx
    .select()
    .from(s.announcements)
    .all()
    .filter((a) => {
      const payload = a.payload;
      if (a.type === "milestone") return typeof payload.count === "number" && payload.count > remainingResults;
      if (typeof payload.sessionId === "number" && sessionIds.has(payload.sessionId)) return true;
      return typeof payload.playerId === "number" && playerIds.has(payload.playerId);
    })
    .map((a) => a.id);
  if (stale.length > 0) tx.delete(s.announcements).where(inArray(s.announcements.id, stale)).run();
}

export function deleteDemoData(tx: Tx): void {
  const demoIds = tx
    .select({ id: s.players.id })
    .from(s.players)
    .where(eq(s.players.isDemo, true))
    .all()
    .map((p) => p.id);

  if (demoIds.length > 0) {
    // A demo player can also hold a seat in a non-demo session (e.g. a rehearsal game
    // that included a real player never marks the session isDemo). Hand-deleting that
    // seat here would silently corrupt or vanish real session data, so refuse instead.
    const seatedElsewhere = tx
      .select({ sessionId: s.sessionPlayers.sessionId })
      .from(s.sessionPlayers)
      .innerJoin(s.sessions, eq(s.sessionPlayers.sessionId, s.sessions.id))
      .where(and(inArray(s.sessionPlayers.playerId, demoIds), eq(s.sessions.isDemo, false)))
      .get();
    if (seatedElsewhere) throw new ServiceError("demo_player_in_use");
  }

  const demoSessionIds = tx
    .select({ id: s.sessions.id })
    .from(s.sessions)
    .where(eq(s.sessions.isDemo, true))
    .all()
    .map((r) => r.id);

  tx.delete(s.sessions).where(eq(s.sessions.isDemo, true)).run();
  if (demoIds.length > 0) {
    tx.delete(s.sessionPlayers).where(inArray(s.sessionPlayers.playerId, demoIds)).run();
    tx.delete(s.players).where(inArray(s.players.id, demoIds)).run();
  }
  deleteDemoAnnouncements(tx, new Set(demoSessionIds), new Set(demoIds));
}
```

If TypeScript reports `payload.count` as not indexable, the column's `$type` is narrower than `Record<string, unknown>`; cast once: `const payload = a.payload as Record<string, unknown>;`.

- [x] **Step 4: Run tests**

Run: `npx vitest run src/server/repo/repo.test.ts src/server/seed/demo.test.ts src/server/services/core.test.ts`
Expected: PASS.

- [x] **Step 5: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/server/repo/writes.ts src/server/repo/repo.test.ts
git commit -m "fix(server): remove demo announcements and unreached milestones when clearing demo data"
```

---

### Task 4: Public event stats, heatmap and hot streaks

**Files:**
- Modify: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

**Interfaces:**
- Consumes: `ReplayResult`, `PlayerResult`, `Replay` (`src/domain/replay.ts`); `GameFact`, `TableFact`, `Facts` (`src/domain/types.ts`); existing `longestResult`, `rivals`, `topCount`.
- Produces:
  - `type TimedResult = LongestResult`
  - `interface FamilyCount { family: string; gameId: number; count: number }` — `gameId` is the family's representative game (shortest name, then lowest id)
  - `interface SizeCount { size: number; count: number }`
  - `interface HeatmapRow { tableId: number; number: number; cells: number[] }`, `interface Heatmap { hours: number[]; rows: HeatmapRow[]; max: number }`
  - `interface Streak { playerId: number; streak: number }`
  - `HOUR_MS = 3_600_000`, `HEATMAP_MAX_HOURS = 12`, `HOT_STREAK_MIN = 2`
  - `distinctGames(results): number`, `popularity(results, games): FamilyCount[]` (count desc, family asc), `commonTableSize(results): SizeCount | null` (ties → smaller size), `fastestResult(results): TimedResult | null` (ties → earlier), `heatmap(results, tables): Heatmap | null`, `hotStreaks(byPlayer: Map<number, PlayerResult[]>): Streak[]` (streak desc, playerId asc)
  - `interface PublicStats { gamesCompleted: number; distinctGames: number; popularity: FamilyCount[]; tableSize: SizeCount | null; longest: TimedResult | null; fastest: TimedResult | null; rivals: RivalPair | null; heatmap: Heatmap | null }`
  - `buildPublicStats(facts: Pick<Facts, "games" | "tables">, rp: Pick<Replay, "results">): PublicStats`

- [x] **Step 1: Write the failing tests**

In `src/domain/stats.test.ts`, change the imports to:

```ts
import { describe, expect, test } from "vitest";
import { makeDoneSession, makeGame, makePlayer, makeSettings, makeTable } from "./fixtures";
import { replay } from "./replay";
import {
  buildPublicStats,
  busiestTable,
  commonTableSize,
  distinctGames,
  fastestResult,
  heatmap,
  hotStreaks,
  longestResult,
  mostPlayedGame,
  popularity,
  rivals,
} from "./stats";
```

Append:

```ts
describe("public event stats", () => {
  const H = 3_600_000;
  const T0 = 100 * H;
  const eventGames = [
    makeGame(1, 6, { family: "catan", name: "Catan" }),
    makeGame(2, 10, { family: "catan", name: "Catan + Expansion" }),
    makeGame(3, 4, { family: "uno", name: "Uno" }),
  ];
  const tables = [makeTable(1), makeTable(2), makeTable(3)];
  const rp = replay(
    {
      players,
      games: eventGames,
      sessions: [
        makeDoneSession(1, 1, T0 + 50 * MIN, [[1, 1], [2, 2], [3, 3]], { tableId: 1, startedAt: T0 + 10 * MIN }),
        makeDoneSession(2, 2, T0 + H + 30 * MIN, [[2, 1], [1, 2], [3, 3]], { tableId: 2, startedAt: T0 + 20 * MIN }),
        // direct result: no real duration, counts in the hour it was entered
        makeDoneSession(3, 3, T0 + H + 40 * MIN, [[1, 1], [4, 2]], { tableId: 2, startedAt: T0 + H + 40 * MIN }),
        makeDoneSession(4, 1, T0 + 2 * H + 15 * MIN, [[1, 1], [2, 2]], { tableId: null, startedAt: T0 + 2 * H + 5 * MIN }),
      ],
    },
    makeSettings(),
  );
  const expectedHeatmap = {
    hours: [T0, T0 + H],
    rows: [
      { tableId: 1, number: 1, cells: [1, 0] },
      { tableId: 2, number: 2, cells: [1, 2] },
    ],
    max: 2,
  };

  test("popularity by family, table size, fastest game, distinct games", () => {
    expect(distinctGames(rp.results)).toBe(3);
    expect(popularity(rp.results, eventGames)).toEqual([
      { family: "catan", gameId: 1, count: 3 },
      { family: "uno", gameId: 3, count: 1 },
    ]);
    expect(commonTableSize(rp.results)).toEqual({ size: 2, count: 2 });
    expect(fastestResult(rp.results)).toEqual({ sessionId: 4, gameId: 1, tableId: null, durationMin: 10 });
  });

  test("heatmap counts games in play per table per hour", () => {
    expect(heatmap(rp.results, tables)).toEqual(expectedHeatmap);
  });

  test("heatmap keeps the latest 12 hours", () => {
    const long = replay(
      {
        players,
        games: eventGames,
        sessions: [
          makeDoneSession(1, 3, T0 + 10 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: T0 }),
          makeDoneSession(2, 3, T0 + 20 * H + 10 * MIN, [[1, 1], [2, 2]], { tableId: 1, startedAt: T0 + 20 * H }),
        ],
      },
      makeSettings(),
    ).results;
    const map = heatmap(long, tables)!;
    expect(map.hours).toHaveLength(12);
    expect(map.hours[0]).toBe(T0 + 9 * H);
    expect(map.rows).toEqual([{ tableId: 1, number: 1, cells: [...Array(11).fill(0), 1] }]);
    expect(map.max).toBe(1);
  });

  test("buildPublicStats combines everything", () => {
    expect(buildPublicStats({ games: eventGames, tables }, rp)).toEqual({
      gamesCompleted: 4,
      distinctGames: 3,
      popularity: [
        { family: "catan", gameId: 1, count: 3 },
        { family: "uno", gameId: 3, count: 1 },
      ],
      tableSize: { size: 2, count: 2 },
      longest: { sessionId: 2, gameId: 2, tableId: 2, durationMin: 70 },
      fastest: { sessionId: 4, gameId: 1, tableId: null, durationMin: 10 },
      rivals: { playerIds: [1, 2], count: 3 },
      heatmap: expectedHeatmap,
    });
  });

  test("an empty evening has empty stats and no streaks", () => {
    const empty = replay({ players, games: eventGames, sessions: [] }, makeSettings());
    expect(buildPublicStats({ games: eventGames, tables }, empty)).toEqual({
      gamesCompleted: 0,
      distinctGames: 0,
      popularity: [],
      tableSize: null,
      longest: null,
      fastest: null,
      rivals: null,
      heatmap: null,
    });
    expect(hotStreaks(empty.byPlayer)).toEqual([]);
  });

  test("hot streaks count only the latest unbroken wins, longest first", () => {
    expect(hotStreaks(rp.byPlayer)).toEqual([{ playerId: 1, streak: 2 }]);
    const duels = replay(
      {
        players,
        games: eventGames,
        sessions: [
          makeDoneSession(1, 3, 1 * MIN, [[3, 1], [4, 2]]),
          makeDoneSession(2, 3, 2 * MIN, [[3, 1], [4, 2]]),
          makeDoneSession(3, 3, 3 * MIN, [[3, 1], [1, 2]]),
          makeDoneSession(4, 3, 4 * MIN, [[2, 1], [4, 2]]),
          makeDoneSession(5, 3, 5 * MIN, [[2, 1], [1, 2]]),
          makeDoneSession(6, 3, 6 * MIN, [[4, 1], [1, 2]]),
        ],
      },
      makeSettings(),
    );
    expect(hotStreaks(duels.byPlayer)).toEqual([
      { playerId: 3, streak: 3 },
      { playerId: 2, streak: 2 },
    ]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/stats.test.ts`
Expected: FAIL — `buildPublicStats is not a function` (and the other new imports).

- [x] **Step 3: Implement in `src/domain/stats.ts`**

Change the first import line to:

```ts
import type { PlayerResult, Replay, ReplayResult } from "./replay";
import type { Facts, GameFact, TableFact } from "./types";
```

Append to the file:

```ts
export type TimedResult = LongestResult;

export interface FamilyCount {
  family: string;
  /** Representative game for the name and icon: shortest name, then lowest id. */
  gameId: number;
  count: number;
}

export interface SizeCount {
  size: number;
  count: number;
}

export interface HeatmapRow {
  tableId: number;
  number: number;
  cells: number[];
}

export interface Heatmap {
  /** Start of each hour bucket, epoch ms. */
  hours: number[];
  rows: HeatmapRow[];
  max: number;
}

export interface Streak {
  playerId: number;
  streak: number;
}

export interface PublicStats {
  gamesCompleted: number;
  distinctGames: number;
  popularity: FamilyCount[];
  tableSize: SizeCount | null;
  longest: TimedResult | null;
  fastest: TimedResult | null;
  rivals: RivalPair | null;
  heatmap: Heatmap | null;
}

export const HOUR_MS = 3_600_000;
export const HEATMAP_MAX_HOURS = 12;
export const HOT_STREAK_MIN = 2;

export function distinctGames(results: ReplayResult[]): number {
  return new Set(results.map((r) => r.gameId)).size;
}

export function popularity(results: ReplayResult[], games: GameFact[]): FamilyCount[] {
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const counts = new Map<string, number>();
  for (const r of results) {
    const game = gamesById.get(r.gameId);
    if (game) counts.set(game.family, (counts.get(game.family) ?? 0) + 1);
  }
  const representative = (family: string) =>
    games.filter((g) => g.family === family).sort((a, b) => a.name.length - b.name.length || a.id - b.id)[0].id;
  return [...counts]
    .map(([family, count]) => ({ family, gameId: representative(family), count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

export function commonTableSize(results: ReplayResult[]): SizeCount | null {
  const top = topCount(results.map((r) => r.players.length));
  return top ? { size: top.key, count: top.count } : null;
}

/** Only sessions with a real duration; ties go to the earlier result. */
export function fastestResult(results: ReplayResult[]): TimedResult | null {
  let best: TimedResult | null = null;
  for (const r of results) {
    if (r.durationMin === null) continue;
    if (!best || r.durationMin < best.durationMin) {
      best = { sessionId: r.sessionId, gameId: r.gameId, tableId: r.tableId, durationMin: r.durationMin };
    }
  }
  return best;
}

const hourOf = (ts: number) => Math.floor(ts / HOUR_MS) * HOUR_MS;

/** Games in play per table per hour (latest 12 hours). Direct results count in the hour they were entered. */
export function heatmap(results: ReplayResult[], tables: TableFact[]): Heatmap | null {
  const numbers = new Map(tables.map((t) => [t.id, t.number]));
  const spans = results.flatMap((r) =>
    r.tableId !== null && numbers.has(r.tableId)
      ? [
          {
            tableId: r.tableId,
            from: hourOf(r.durationMin !== null && r.startedAt !== null ? r.startedAt : r.finishedAt),
            to: hourOf(r.finishedAt),
          },
        ]
      : [],
  );
  if (spans.length === 0) return null;
  const last = Math.max(...spans.map((s) => s.to));
  const first = Math.max(Math.min(...spans.map((s) => s.from)), last - (HEATMAP_MAX_HOURS - 1) * HOUR_MS);
  const hours: number[] = [];
  for (let h = first; h <= last; h += HOUR_MS) hours.push(h);
  const rows = [...new Set(spans.map((s) => s.tableId))]
    .map((tableId) => ({
      tableId,
      number: numbers.get(tableId)!,
      cells: hours.map((h) => spans.filter((s) => s.tableId === tableId && s.from <= h && h <= s.to).length),
    }))
    .sort((a, b) => a.number - b.number);
  return { hours, rows, max: Math.max(...rows.flatMap((r) => r.cells)) };
}

export function hotStreaks(byPlayer: Map<number, PlayerResult[]>): Streak[] {
  const streaks: Streak[] = [];
  for (const [playerId, history] of byPlayer) {
    let streak = 0;
    for (let i = history.length - 1; i >= 0 && history[i].placement === 1; i--) streak++;
    if (streak >= HOT_STREAK_MIN) streaks.push({ playerId, streak });
  }
  return streaks.sort((a, b) => b.streak - a.streak || a.playerId - b.playerId);
}

export function buildPublicStats(facts: Pick<Facts, "games" | "tables">, rp: Pick<Replay, "results">): PublicStats {
  const { results } = rp;
  return {
    gamesCompleted: results.length,
    distinctGames: distinctGames(results),
    popularity: popularity(results, facts.games),
    tableSize: commonTableSize(results),
    longest: longestResult(results),
    fastest: fastestResult(results),
    rivals: rivals(results),
    heatmap: heatmap(results, facts.tables),
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/stats.test.ts src/domain/finale.test.ts`
Expected: PASS.

- [x] **Step 5: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): add game popularity, table size, fastest game, table-hour heatmap and hot streaks"
```

---

### Task 5: Finale-only stats

**Files:**
- Modify: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

**Interfaces:**
- Consumes: `Replay` (`steps`, `results`, `standings`), `StandingRow` (`src/domain/standings.ts`), `ScoredPlacement.jokerBonus`.
- Produces:
  - `RACE_PLAYERS = 5`
  - `interface Comeback { playerId: number; sessionId: number; from: number; to: number }`
  - `interface BestJoker { playerId: number; sessionId: number; gameId: number; bonus: number }`
  - `interface MostGames { playerIds: number[]; count: number }`
  - `interface RaceSeries { playerId: number; ranks: Array<number | null> }` — one entry per replay step
  - `interface FinaleStats { comeback: Comeback | null; bestJoker: BestJoker | null; mostGames: MostGames | null; race: RaceSeries[] }`
  - `biggestComeback(rp: Pick<Replay, "results" | "steps">): Comeback | null` (earliest wins ties), `bestJoker(results): BestJoker | null`, `mostGamesPlayed(standings: StandingRow[]): MostGames | null`, `rankRace(rp: Pick<Replay, "standings" | "steps">, limit = RACE_PLAYERS): RaceSeries[]`, `buildFinaleStats(rp: Replay): FinaleStats`

- [x] **Step 1: Write the failing tests**

Add `bestJoker, biggestComeback, buildFinaleStats, mostGamesPlayed, rankRace` to the `./stats` import in `src/domain/stats.test.ts`, then append:

```ts
describe("finale stats", () => {
  const four = [1, 2, 3, 4].map((id) => makePlayer(id, `P${id}`));
  const finaleGames = [makeGame(1, 10), makeGame(2, 8)];
  // weights 10 and 8, three players, floor 0: 1st = W, 2nd = W/2, 3rd = 0
  // totals after each result: s1 P1 10, P2 5, P3 0 | s2 P2 11, P1 10, P4 8, P3 0
  // s3 P1 17.5, P2 11, P3 10, P4 8 | s4 P4 18, P1 17.5, P2 16, P3 10
  const rp = replay(
    {
      players: four,
      games: finaleGames,
      sessions: [
        makeDoneSession(1, 1, 1 * MIN, [[1, 1], [2, 2], [3, 3]]),
        makeDoneSession(2, 2, 2 * MIN, [[4, 1], [2, 2, true], [3, 3]]),
        makeDoneSession(3, 1, 3 * MIN, [[3, 1], [1, 2, true], [4, 3]]),
        makeDoneSession(4, 1, 4 * MIN, [[4, 1], [2, 2], [3, 3]]),
      ],
    },
    makeSettings(),
  );

  test("biggest single-result rise", () => {
    expect(biggestComeback(rp)).toEqual({ playerId: 4, sessionId: 4, from: 4, to: 1 });
  });

  test("best Joker is the largest bonus", () => {
    expect(bestJoker(rp.results)).toEqual({ playerId: 1, sessionId: 3, gameId: 1, bonus: 2.5 });
  });

  test("most games played", () => {
    expect(mostGamesPlayed(rp.standings)).toEqual({ playerIds: [3], count: 4 });
  });

  test("rank race follows the final top players through every result", () => {
    expect(rankRace(rp)).toEqual([
      { playerId: 4, ranks: [null, 3, 4, 1] },
      { playerId: 1, ranks: [1, 2, 1, 2] },
      { playerId: 2, ranks: [2, 1, 2, 3] },
      { playerId: 3, ranks: [3, 4, 3, 4] },
    ]);
    expect(rankRace(rp, 2).map((s) => s.playerId)).toEqual([4, 1]);
  });

  test("buildFinaleStats on an empty evening", () => {
    const empty = replay({ players: four, games: finaleGames, sessions: [] }, makeSettings());
    expect(buildFinaleStats(empty)).toEqual({ comeback: null, bestJoker: null, mostGames: null, race: [] });
    expect(buildFinaleStats(rp).race).toHaveLength(4);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/stats.test.ts -t "finale stats"`
Expected: FAIL — `biggestComeback is not a function`.

- [x] **Step 3: Implement in `src/domain/stats.ts`**

Add below the existing imports:

```ts
import type { StandingRow } from "./standings";
```

Append:

```ts
export const RACE_PLAYERS = 5;

export interface Comeback {
  playerId: number;
  sessionId: number;
  from: number;
  to: number;
}

export interface BestJoker {
  playerId: number;
  sessionId: number;
  gameId: number;
  bonus: number;
}

export interface MostGames {
  playerIds: number[];
  count: number;
}

export interface RaceSeries {
  playerId: number;
  /** Rank after every result of the evening, null before the player's first result. */
  ranks: Array<number | null>;
}

export interface FinaleStats {
  comeback: Comeback | null;
  bestJoker: BestJoker | null;
  mostGames: MostGames | null;
  race: RaceSeries[];
}

const rankIn = (rows: StandingRow[], playerId: number) => rows.find((r) => r.playerId === playerId)?.rank ?? null;

/** Largest rank rise from one result, for players in that result. The earliest wins a tie. */
export function biggestComeback(rp: Pick<Replay, "results" | "steps">): Comeback | null {
  let best: Comeback | null = null;
  for (let i = 0; i < rp.steps.length; i++) {
    const step = rp.steps[i];
    for (const p of rp.results[i].players) {
      const from = rankIn(step.before, p.playerId);
      const to = rankIn(step.after, p.playerId);
      if (from === null || to === null || from - to < 1) continue;
      if (!best || from - to > best.from - best.to) best = { playerId: p.playerId, sessionId: step.sessionId, from, to };
    }
  }
  return best;
}

export function bestJoker(results: ReplayResult[]): BestJoker | null {
  let best: BestJoker | null = null;
  for (const r of results) {
    for (const p of r.players) {
      if (p.jokerBonus <= 0) continue;
      if (!best || p.jokerBonus > best.bonus) {
        best = { playerId: p.playerId, sessionId: r.sessionId, gameId: r.gameId, bonus: p.jokerBonus };
      }
    }
  }
  return best;
}

export function mostGamesPlayed(standings: StandingRow[]): MostGames | null {
  const count = Math.max(0, ...standings.map((r) => r.gamesPlayed));
  if (count === 0) return null;
  return { playerIds: standings.filter((r) => r.gamesPlayed === count).map((r) => r.playerId), count };
}

export function rankRace(rp: Pick<Replay, "standings" | "steps">, limit = RACE_PLAYERS): RaceSeries[] {
  return rp.standings
    .filter((r) => r.rank !== null)
    .slice(0, limit)
    .map((r) => ({ playerId: r.playerId, ranks: rp.steps.map((step) => rankIn(step.after, r.playerId)) }));
}

export function buildFinaleStats(rp: Replay): FinaleStats {
  return {
    comeback: biggestComeback(rp),
    bestJoker: bestJoker(rp.results),
    mostGames: mostGamesPlayed(rp.standings),
    race: rankRace(rp),
  };
}
```

`replay.ts` pushes `results` and `steps` in the same loop iteration (both skip a malformed result), so `results[i]` belongs to `steps[i]`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/stats.test.ts`
Expected: PASS.

- [x] **Step 5: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): add finale-only stats: biggest comeback, best Joker, most games and rank race"
```

---

### Task 6: Stories and timeline builders

**Files:**
- Create: `src/domain/stories.ts`, `src/domain/timeline.ts`
- Test: `src/domain/stories.test.ts`, `src/domain/timeline.test.ts`

**Interfaces:**
- Consumes: `PublicStats`, `Streak` (Task 4); `Unlock`, `AchievementId`, `achievementDef` (`src/domain/achievements.ts`); `MILESTONES`, `Facts`, `SessionStatus` (`src/domain/types.ts`); `Replay`.
- Produces:
  - `MILESTONE_NEAR = 3`, `COLLECTOR_MIN = 3`
  - `type Story = { kind: "streak"; playerId; streak } | { kind: "milestone"; next; remaining } | { kind: "rivals"; playerIds: [number, number]; count } | { kind: "collector"; playerId; count } | { kind: "popular"; gameId; count } | { kind: "longest"; gameId; tableId: number | null; durationMin }` (all numbers)
  - `buildStories(input: { streaks: Streak[]; stats: PublicStats; unlocks: Unlock[] }): Story[]` — priority order streak, milestone, rivals, collector, popular, longest; `unlocks` must already be audience-filtered
  - `TIMELINE_LIMIT = 200`
  - `type TimelineItem = { kind: "started"; at; sessionId; gameId; tableId: number | null; playerIds: number[] } | { kind: "result"; at; sessionId; gameId; tableId: number | null; winnerIds: number[]; playerCount } | { kind: "unlock"; at; sessionId; achievementId: AchievementId; playerId } | { kind: "milestone"; at; count }`
  - `buildTimeline(facts: Pick<Facts, "sessions">, rp: Pick<Replay, "results" | "unlocks">, opts: { includeSealed: boolean; limit?: number }): TimelineItem[]` — newest first; at equal time: milestone, unlock, result, started

- [x] **Step 1: Write the failing stories test**

Create `src/domain/stories.test.ts`:

```ts
import { expect, test } from "vitest";
import type { AchievementId, Unlock } from "./achievements";
import type { PublicStats } from "./stats";
import { buildStories } from "./stories";

const stats: PublicStats = {
  gamesCompleted: 8,
  distinctGames: 2,
  popularity: [{ family: "catan", gameId: 1, count: 5 }],
  tableSize: null,
  longest: { sessionId: 3, gameId: 1, tableId: 2, durationMin: 95 },
  fastest: null,
  rivals: { playerIds: [2, 5], count: 3 },
  heatmap: null,
};
const unlock = (playerId: number, achievementId: AchievementId, at: number): Unlock => ({
  achievementId,
  playerId,
  sessionId: at,
  at,
});

test("all stories in priority order", () => {
  const stories = buildStories({
    streaks: [
      { playerId: 4, streak: 3 },
      { playerId: 1, streak: 2 },
    ],
    stats,
    unlocks: [unlock(7, "phoenix", 1), unlock(7, "marathon", 2), unlock(7, "opening-move", 3), unlock(1, "phoenix", 4)],
  });
  expect(stories).toEqual([
    { kind: "streak", playerId: 4, streak: 3 },
    { kind: "milestone", next: 10, remaining: 2 },
    { kind: "rivals", playerIds: [2, 5], count: 3 },
    { kind: "collector", playerId: 7, count: 3 },
    { kind: "popular", gameId: 1, count: 5 },
    { kind: "longest", gameId: 1, tableId: 2, durationMin: 95 },
  ]);
});

test("a quiet evening has no stories", () => {
  expect(
    buildStories({
      streaks: [],
      stats: { ...stats, gamesCompleted: 4, popularity: [{ family: "catan", gameId: 1, count: 1 }], longest: null, rivals: null },
      unlocks: [unlock(1, "phoenix", 1)],
    }),
  ).toEqual([]);
});

test("milestone story only when the next milestone is close", () => {
  const kinds = (gamesCompleted: number) =>
    buildStories({ streaks: [], stats: { ...stats, gamesCompleted, longest: null, rivals: null, popularity: [] }, unlocks: [] });
  expect(kinds(99)).toEqual([{ kind: "milestone", next: 100, remaining: 1 }]);
  expect(kinds(100)).toEqual([]);
  expect(kinds(0)).toEqual([]);
});
```

- [x] **Step 2: Write the failing timeline test**

Create `src/domain/timeline.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeDoneSession, makeGame, makeOpenSession, makePlayer, makeSettings } from "./fixtures";
import { replay } from "./replay";
import { buildTimeline } from "./timeline";

const MIN = 60_000;
const players = [1, 2, 3].map((id) => makePlayer(id, `P${id}`));
const games = [makeGame(1, 10)];
const sessions = [
  ...Array.from({ length: 10 }, (_, i) =>
    makeDoneSession(
      i + 1,
      1,
      (i + 1) * 100 * MIN,
      [[1, 1, i === 1], [2, 2]],
      // session 1 is a direct result: no real start
      i === 0 ? { startedAt: 100 * MIN } : {},
    ),
  ),
  makeOpenSession(20, 2, 1, "playing", [[3]], 1050 * MIN),
  makeOpenSession(21, 3, 1, "setup", [[3]]),
];
const facts = { sessions };
const rp = replay({ players, games, sessions }, makeSettings());

test("newest first with started, result, unlock and milestone items", () => {
  const items = buildTimeline(facts, rp, { includeSealed: false });
  expect(items[0]).toEqual({ kind: "started", at: 1050 * MIN, sessionId: 20, gameId: 1, tableId: 2, playerIds: [3] });
  const started = items.flatMap((i) => (i.kind === "started" ? [i.sessionId] : []));
  expect(started).toEqual([20, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  expect(items.filter((i) => i.kind === "result")).toHaveLength(10);
  expect(items.find((i) => i.kind === "result" && i.sessionId === 1)).toEqual({
    kind: "result",
    at: 100 * MIN,
    sessionId: 1,
    gameId: 1,
    tableId: 1,
    winnerIds: [1],
    playerCount: 2,
  });
  expect(items.filter((i) => i.kind === "milestone")).toEqual([{ kind: "milestone", at: 1000 * MIN, count: 10 }]);
  const atTen = items.filter((i) => i.at === 1000 * MIN).map((i) => i.kind);
  expect(atTen[0]).toBe("milestone");
  expect(atTen.at(-1)).toBe("result");
  expect(items.some((i) => i.kind === "unlock" && i.achievementId === "opening-move")).toBe(true);
});

test("sealed unlocks only when included", () => {
  const sealed = (includeSealed: boolean) =>
    buildTimeline(facts, rp, { includeSealed }).some((i) => i.kind === "unlock" && i.achievementId === "joker-master");
  expect(sealed(false)).toBe(false);
  expect(sealed(true)).toBe(true);
});

test("limit keeps the newest items", () => {
  const items = buildTimeline(facts, rp, { includeSealed: true, limit: 3 });
  expect(items).toHaveLength(3);
  expect(items[0].kind).toBe("started");
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/stories.test.ts src/domain/timeline.test.ts`
Expected: FAIL — `Cannot find module './stories'` / `'./timeline'`.

- [x] **Step 4: Implement `src/domain/stories.ts`**

```ts
import type { Unlock } from "./achievements";
import type { PublicStats, Streak } from "./stats";
import { MILESTONES } from "./types";

export const MILESTONE_NEAR = 3;
export const COLLECTOR_MIN = 3;

export type Story =
  | { kind: "streak"; playerId: number; streak: number }
  | { kind: "milestone"; next: number; remaining: number }
  | { kind: "rivals"; playerIds: [number, number]; count: number }
  | { kind: "collector"; playerId: number; count: number }
  | { kind: "popular"; gameId: number; count: number }
  | { kind: "longest"; gameId: number; tableId: number | null; durationMin: number };

function topCollector(unlocks: Unlock[]): { playerId: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const u of unlocks) counts.set(u.playerId, (counts.get(u.playerId) ?? 0) + 1);
  let best: { playerId: number; count: number } | null = null;
  for (const [playerId, count] of counts) {
    if (!best || count > best.count || (count === best.count && playerId < best.playerId)) best = { playerId, count };
  }
  return best;
}

/** Headlines from public facts, most exciting first. `unlocks` must already be filtered for the audience. */
export function buildStories(input: { streaks: Streak[]; stats: PublicStats; unlocks: Unlock[] }): Story[] {
  const { streaks, stats, unlocks } = input;
  const stories: Story[] = [];

  const streak = streaks[0];
  if (streak) stories.push({ kind: "streak", playerId: streak.playerId, streak: streak.streak });

  const next = MILESTONES.find((m) => m > stats.gamesCompleted);
  if (next !== undefined && stats.gamesCompleted > 0 && next - stats.gamesCompleted <= MILESTONE_NEAR) {
    stories.push({ kind: "milestone", next, remaining: next - stats.gamesCompleted });
  }

  if (stats.rivals) stories.push({ kind: "rivals", playerIds: stats.rivals.playerIds, count: stats.rivals.count });

  const collector = topCollector(unlocks);
  if (collector && collector.count >= COLLECTOR_MIN) stories.push({ kind: "collector", ...collector });

  const popular = stats.popularity[0];
  if (popular && popular.count >= 2) stories.push({ kind: "popular", gameId: popular.gameId, count: popular.count });

  if (stats.longest) {
    const { gameId, tableId, durationMin } = stats.longest;
    stories.push({ kind: "longest", gameId, tableId, durationMin });
  }
  return stories;
}
```

- [x] **Step 5: Implement `src/domain/timeline.ts`**

```ts
import { achievementDef, type AchievementId } from "./achievements";
import type { Replay } from "./replay";
import { MILESTONES, type Facts, type SessionStatus } from "./types";

export const TIMELINE_LIMIT = 200;

export type TimelineItem =
  | { kind: "started"; at: number; sessionId: number; gameId: number; tableId: number | null; playerIds: number[] }
  | { kind: "result"; at: number; sessionId: number; gameId: number; tableId: number | null; winnerIds: number[]; playerCount: number }
  | { kind: "unlock"; at: number; sessionId: number; achievementId: AchievementId; playerId: number }
  | { kind: "milestone"; at: number; count: number };

/** At the same moment the bigger news goes first. */
const KIND_ORDER: Record<TimelineItem["kind"], number> = { milestone: 0, unlock: 1, result: 2, started: 3 };
const STARTED: SessionStatus[] = ["playing", "pending", "done"];
const sessionOf = (item: TimelineItem) => (item.kind === "milestone" ? 0 : item.sessionId);

export function buildTimeline(
  facts: Pick<Facts, "sessions">,
  rp: Pick<Replay, "results" | "unlocks">,
  opts: { includeSealed: boolean; limit?: number },
): TimelineItem[] {
  const timed = new Map(rp.results.map((r) => [r.sessionId, r.durationMin !== null]));
  const items: TimelineItem[] = [];

  for (const s of facts.sessions) {
    if (!STARTED.includes(s.status) || s.startedAt === null) continue;
    // Direct results have no real start; a done session must also be a valid result.
    if (s.status === "done" && !timed.get(s.id)) continue;
    items.push({
      kind: "started",
      at: s.startedAt,
      sessionId: s.id,
      gameId: s.gameId,
      tableId: s.tableId,
      playerIds: [...s.players].sort((a, b) => a.seat - b.seat).map((p) => p.playerId),
    });
  }

  for (const r of rp.results) {
    items.push({
      kind: "result",
      at: r.finishedAt,
      sessionId: r.sessionId,
      gameId: r.gameId,
      tableId: r.tableId,
      winnerIds: r.players
        .filter((p) => p.placement === 1)
        .map((p) => p.playerId)
        .sort((a, b) => a - b),
      playerCount: r.players.length,
    });
  }

  for (const u of rp.unlocks) {
    if (!opts.includeSealed && achievementDef(u.achievementId).sealed) continue;
    items.push({ kind: "unlock", at: u.at, sessionId: u.sessionId, achievementId: u.achievementId, playerId: u.playerId });
  }

  for (const count of MILESTONES) {
    if (count > rp.results.length) break;
    items.push({ kind: "milestone", at: rp.results[count - 1].finishedAt, count });
  }

  return items
    .sort((a, b) => b.at - a.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || sessionOf(b) - sessionOf(a))
    .slice(0, opts.limit ?? TIMELINE_LIMIT);
}
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/domain/stories.test.ts src/domain/timeline.test.ts`
Expected: PASS. If `opening-move` is not among the unlocks, print `rp.unlocks` and check `src/domain/achievements.ts` — do not weaken the sealed-filter assertions.

- [x] **Step 7: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/domain/stories.ts src/domain/stories.test.ts src/domain/timeline.ts src/domain/timeline.test.ts
git commit -m "feat(domain): build featured stories and the event timeline from public facts"
```

---

### Task 7: Public snapshot carries stats, streaks, stories and timeline

**Files:**
- Modify: `src/domain/snapshot.ts`
- Test: `src/domain/snapshot.test.ts`

**Interfaces:**
- Consumes: `buildPublicStats`, `buildFinaleStats`, `hotStreaks`, `PublicStats`, `FinaleStats`, `Streak` (Tasks 4–5); `buildStories`, `Story`, `buildTimeline`, `TimelineItem` (Task 6).
- Produces — `PublicSnapshot` gains:
  - `stats: PublicStats`
  - `finaleStats: FinaleStats | null` (null until `finaleRevealed`)
  - `streaks: Streak[]`
  - `stories: Story[]` (built from the audience-filtered unlocks)
  - `timeline: TimelineItem[]` (newest first; sealed unlocks only after reveal)
  `AdminSnapshot` is unchanged.

- [x] **Step 1: Write the failing tests**

Append to `src/domain/snapshot.test.ts`:

```ts
describe("stats, streaks, stories and timeline", () => {
  test("public before the reveal: stats and stories yes, finale stats and sealed timeline items no", () => {
    const { pub } = build(facts());
    expect(pub.stats.gamesCompleted).toBe(2);
    expect(pub.stats.rivals).toEqual({ playerIds: [2, 3], count: 2 });
    expect(pub.finaleStats).toBeNull();
    expect(pub.streaks).toEqual([]);
    expect(pub.stories.map((s) => s.kind)).toEqual(["rivals", "longest"]);
    expect(pub.timeline.flatMap((i) => (i.kind === "started" ? [i.sessionId] : []))).toEqual([11, 10, 12]);
    expect(pub.timeline.some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(false);
    expect(keysDeep(pub).filter(([key]) => FORBIDDEN_PUBLIC_KEYS.includes(key))).toEqual([]);
  });

  test("after the reveal: finale stats and sealed unlocks join the public views", () => {
    const { pub } = build(facts({ status: "finished", finaleRevealed: true }));
    expect(pub.finaleStats?.race.map((s) => s.playerId)).toEqual(
      pub.leaderboard!.filter((r) => r.rank !== null).slice(0, 5).map((r) => r.playerId),
    );
    expect(pub.timeline.some((i) => i.kind === "unlock" && i.achievementId === "joker-master")).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/snapshot.test.ts`
Expected: FAIL — TypeScript/vitest reports `pub.stats` is undefined.

- [x] **Step 3: Implement in `src/domain/snapshot.ts`**

Add imports after the `./standings` import:

```ts
import { buildFinaleStats, buildPublicStats, hotStreaks, type FinaleStats, type PublicStats, type Streak } from "./stats";
import { buildStories, type Story } from "./stories";
```

and after the `./tables` import:

```ts
import { buildTimeline, type TimelineItem } from "./timeline";
```

In `interface PublicSnapshot`, after `leaderboard: LeaderboardRow[] | null;` add:

```ts
  stats: PublicStats;
  /** Only after the finale reveal. */
  finaleStats: FinaleStats | null;
  streaks: Streak[];
  stories: Story[];
  /** Newest first. */
  timeline: TimelineItem[];
```

In `buildPublicSnapshot`, replace

```ts
  const script = finaleScript(facts, rp);
  const finaleStep = facts.event.screenControl.finaleStep;
```

with

```ts
  const script = finaleScript(facts, rp);
  const finaleStep = facts.event.screenControl.finaleStep;
  const achievements = achievementsView(facts, rp, revealed);
  const stats = buildPublicStats(facts, rp);
  const streaks = hotStreaks(rp.byPlayer);
```

In the returned object, replace `achievements: achievementsView(facts, rp, revealed),` with `achievements,` and replace

```ts
    leaderboard: revealed ? leaderboard(facts, rp) : null,
  };
}

export function buildAdminSnapshot
```

with

```ts
    leaderboard: revealed ? leaderboard(facts, rp) : null,
    stats,
    finaleStats: revealed ? buildFinaleStats(rp) : null,
    streaks,
    stories: buildStories({ streaks, stats, unlocks: achievements.unlocks }),
    timeline: buildTimeline(facts, rp, { includeSealed: revealed }),
  };
}

export function buildAdminSnapshot
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/snapshot.test.ts src/server/live.test.ts`
Expected: PASS, including the existing "contains no standings, points or joker fields anywhere" test.

- [x] **Step 5: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS. If `typecheck` fails in `src/components/screen/logic.test.ts` or elsewhere because a hand-built object is typed as a full `PublicSnapshot`, add the five new fields to that object (`stats` from `buildPublicStats({ games: [], tables: [] }, { results: [] })`, the others `null`/`[]`).

```bash
git add src/domain/snapshot.ts src/domain/snapshot.test.ts
git commit -m "feat(domain): expose stats, hot streaks, stories, timeline and finale-only stats in the public snapshot"
```

---

### Task 8: Text for timeline items and stories

**Files:**
- Create: `src/components/common/timelineText.ts`, `src/components/screen/storyText.ts`
- Test: `src/components/common/timelineText.test.ts`, `src/components/screen/storyText.test.ts`

**Interfaces:**
- Consumes: `TimelineItem` (Task 6), `Story` (Task 6), `PublicSnapshot` fields `players`, `games`, `tables`; `Dict`, `PluralForms`, `fmt`, `plural` (`src/i18n`); strings from Task 1.
- Produces:
  - `interface NameLookup { player(id: number): string; game(id: number): string; tableNumber(id: number | null): number | null }` — unknown player/game → `"?"`, unknown table → `null`
  - `nameLookup(s: Pick<PublicSnapshot, "players" | "games" | "tables">): NameLookup`
  - `timelineText(item: TimelineItem, t: Dict, names: NameLookup): string`
  - `timelineKey(item: TimelineItem): string` — stable React key
  - `interface StoryText { kicker: string; line: string }`, `storyText(story: Story, t: Dict, lang: Lang, names: NameLookup): StoryText`

- [x] **Step 1: Write the failing tests**

Create `src/components/common/timelineText.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeGame } from "@/domain/fixtures";
import type { TimelineItem } from "@/domain/timeline";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import { nameLookup, timelineKey, timelineText } from "./timelineText";

const names = nameLookup({
  players: [
    { id: 1, name: "Amy", nickname: null, color: "#fff" },
    { id: 2, name: "Bob", nickname: null, color: "#fff" },
  ],
  games: [makeGame(1, 10, { name: "Catan" })],
  tables: [{ tableId: 7, number: 3, label: null, state: "available", session: null }],
});

const started: TimelineItem = { kind: "started", at: 0, sessionId: 1, gameId: 1, tableId: 7, playerIds: [1, 2] };
const result: TimelineItem = { kind: "result", at: 0, sessionId: 1, gameId: 1, tableId: 7, winnerIds: [1, 2], playerCount: 4 };
const unlock: TimelineItem = { kind: "unlock", at: 0, sessionId: 1, achievementId: "phoenix", playerId: 2 };
const milestone: TimelineItem = { kind: "milestone", at: 0, count: 25 };

test("english lines", () => {
  expect(timelineText(started, en, names)).toBe("Catan started · Table 3");
  expect(timelineText({ ...started, tableId: null }, en, names)).toBe("Catan started");
  expect(timelineText(result, en, names)).toBe("Amy & Bob won Catan");
  expect(timelineText(unlock, en, names)).toBe("Bob unlocked Phoenix");
  expect(timelineText(milestone, en, names)).toBe("25 games completed");
});

test("russian lines", () => {
  expect(timelineText(result, ru, names)).toBe("Catan: побеждает Amy & Bob");
  expect(timelineText(milestone, ru, names)).toBe("Сыграно игр: 25");
});

test("unknown ids fall back", () => {
  expect(names.player(99)).toBe("?");
  expect(names.game(99)).toBe("?");
  expect(names.tableNumber(99)).toBeNull();
  expect(names.tableNumber(null)).toBeNull();
});

test("keys are distinct per item", () => {
  const keys = [started, result, unlock, milestone].map(timelineKey);
  expect(new Set(keys).size).toBe(4);
});
```

Create `src/components/screen/storyText.test.ts`:

```ts
import { expect, test } from "vitest";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import type { NameLookup } from "../common/timelineText";
import { storyText } from "./storyText";

const playerNames: Record<number, string> = { 1: "Amy", 2: "Bob" };
const names: NameLookup = {
  player: (id) => playerNames[id] ?? "?",
  game: () => "Catan",
  tableNumber: () => 3,
};

test("english stories", () => {
  expect(storyText({ kind: "streak", playerId: 1, streak: 3 }, en, "en", names)).toEqual({
    kicker: "On fire",
    line: "Amy: 3 wins in a row",
  });
  expect(storyText({ kind: "milestone", next: 25, remaining: 1 }, en, "en", names).line).toBe("1 game to go until game 25");
  expect(storyText({ kind: "rivals", playerIds: [1, 2], count: 4 }, en, "en", names).line).toBe("Amy and Bob have shared 4 games");
  expect(storyText({ kind: "collector", playerId: 2, count: 3 }, en, "en", names).line).toBe("Bob has unlocked 3 achievements");
  expect(storyText({ kind: "popular", gameId: 1, count: 5 }, en, "en", names).line).toBe("Catan, played 5 times");
  expect(storyText({ kind: "longest", gameId: 1, tableId: 2, durationMin: 1 }, en, "en", names).line).toBe("Catan lasted 1 minute");
});

test("russian plurals", () => {
  expect(storyText({ kind: "streak", playerId: 1, streak: 5 }, ru, "ru", names).line).toBe("Amy: 5 побед подряд");
  expect(storyText({ kind: "popular", gameId: 1, count: 3 }, ru, "ru", names).line).toBe("Catan: сыграно 3 раза");
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/common/timelineText.test.ts src/components/screen/storyText.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement `src/components/common/timelineText.ts`**

```ts
import type { PublicSnapshot } from "@/domain/snapshot";
import type { TimelineItem } from "@/domain/timeline";
import { fmt, type Dict } from "@/i18n";

export interface NameLookup {
  player(id: number): string;
  game(id: number): string;
  tableNumber(id: number | null): number | null;
}

export function nameLookup(s: Pick<PublicSnapshot, "players" | "games" | "tables">): NameLookup {
  const players = new Map(s.players.map((p) => [p.id, p.name]));
  const games = new Map(s.games.map((g) => [g.id, g.name]));
  const tables = new Map(s.tables.map((t) => [t.tableId, t.number]));
  return {
    player: (id) => players.get(id) ?? "?",
    game: (id) => games.get(id) ?? "?",
    tableNumber: (id) => (id === null ? null : (tables.get(id) ?? null)),
  };
}

export function timelineText(item: TimelineItem, t: Dict, names: NameLookup): string {
  switch (item.kind) {
    case "started": {
      const table = names.tableNumber(item.tableId);
      const game = names.game(item.gameId);
      return table === null
        ? fmt(t.timeline.startedNoTable, { game })
        : fmt(t.timeline.started, { game, table: fmt(t.common.tableN, { n: table }) });
    }
    case "result":
      return fmt(t.timeline.result, { game: names.game(item.gameId), winners: item.winnerIds.map(names.player).join(" & ") });
    case "unlock":
      return fmt(t.timeline.unlock, {
        player: names.player(item.playerId),
        achievement: t.achievements.defs[item.achievementId].title,
      });
    case "milestone":
      return fmt(t.timeline.milestone, { n: item.count });
  }
}

export function timelineKey(item: TimelineItem): string {
  switch (item.kind) {
    case "unlock":
      return `unlock-${item.achievementId}-${item.playerId}`;
    case "milestone":
      return `milestone-${item.count}`;
    default:
      return `${item.kind}-${item.sessionId}`;
  }
}
```

- [x] **Step 4: Implement `src/components/screen/storyText.ts`**

```ts
import type { Story } from "@/domain/stories";
import type { Lang } from "@/domain/types";
import { fmt, plural, type Dict, type PluralForms } from "@/i18n";
import type { NameLookup } from "../common/timelineText";

export interface StoryText {
  kicker: string;
  line: string;
}

export function storyText(story: Story, t: Dict, lang: Lang, names: NameLookup): StoryText {
  const count = (n: number, forms: PluralForms) => `${n} ${plural(lang, n, forms)}`;
  const s = t.stories;
  switch (story.kind) {
    case "streak":
      return {
        kicker: s.streakKicker,
        line: fmt(s.streak, { player: names.player(story.playerId), count: count(story.streak, t.plurals.wins) }),
      };
    case "milestone":
      return {
        kicker: s.milestoneKicker,
        line: fmt(s.milestone, { count: count(story.remaining, t.plurals.games), next: story.next }),
      };
    case "rivals":
      return {
        kicker: s.rivalsKicker,
        line: fmt(s.rivals, {
          a: names.player(story.playerIds[0]),
          b: names.player(story.playerIds[1]),
          count: count(story.count, t.plurals.games),
        }),
      };
    case "collector":
      return {
        kicker: s.collectorKicker,
        line: fmt(s.collector, { player: names.player(story.playerId), count: count(story.count, t.plurals.achievements) }),
      };
    case "popular":
      return {
        kicker: s.popularKicker,
        line: fmt(s.popular, { game: names.game(story.gameId), count: count(story.count, t.plurals.times) }),
      };
    case "longest":
      return {
        kicker: s.longestKicker,
        line: fmt(s.longest, { game: names.game(story.gameId), count: count(story.durationMin, t.plurals.minutes) }),
      };
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/common/timelineText.test.ts src/components/screen/storyText.test.ts`
Expected: PASS.

- [x] **Step 6: Run checks and commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/components/common/timelineText.ts src/components/common/timelineText.test.ts src/components/screen/storyText.ts src/components/screen/storyText.test.ts
git commit -m "feat(ui): localize timeline items and stories for phones and the projector"
```

---

### Task 9: Projector — story and popular scenes, ticker

**Files:**
- Modify: `src/domain/types.ts`, `src/server/repo/repo.test.ts`, `src/components/screen/logic.ts`, `src/components/screen/logic.test.ts`, `src/components/screen/ScreenApp.tsx`, `src/components/screen/scenes/SceneContenders.tsx`
- Create: `drizzle/0003_enable_story_popular_scenes.sql` (custom migration), `src/components/screen/scenes/SceneStory.tsx`, `src/components/screen/scenes/ScenePopular.tsx`, `src/components/screen/ScreenTicker.tsx`

**Interfaces:**
- Consumes: `snapshot.stories`, `snapshot.stats.popularity`, `snapshot.timeline` (Task 7); `nameLookup`, `timelineText`, `timelineKey`, `storyText` (Task 8); `t.screen.stories`, `t.screen.popular`, `t.settings.screen.sceneNames.story|popular` (Task 1); `SceneHeading` (`scenes/SceneRoom.tsx`), `usePublicLookups`, `GameIcon`, `EASE`.
- Produces:
  - `SceneId` adds `"story" | "popular"`; `ALL_SCENES = ["title", "room", "recent", "counters", "achievements", "story", "popular", "contenders"]`; `DEFAULT_SCENES = ["title", "room", "recent", "counters", "achievements", "story", "popular"]`.
  - `availableScenes(enabled, snapshot: Pick<PublicSnapshot, "recentResults" | "contenders" | "achievements" | "stories"> & { stats: Pick<PublicStats, "popularity"> })` — result is in `ALL_SCENES` order; `story` needs ≥ 1 story, `popular` ≥ 1 popularity row.
  - `<SceneStory snapshot>`, `<ScenePopular snapshot>`, `<ScreenTicker snapshot>` (40 px strip directly above the footer; one timeline item every 6 s from the latest 8).

- [x] **Step 1: Write the failing tests**

In `src/components/screen/logic.test.ts`, replace the whole `test("availableScenes drops empty scenes and never returns an empty list", ...)` block with:

```ts
const empty = { recentResults: [], contenders: null, achievements: noAchievements, stories: [], stats: { popularity: [] } };

test("availableScenes drops empty scenes, keeps canonical order and never returns an empty list", () => {
  expect(availableScenes(["title", "recent", "contenders", "room", "achievements", "story", "popular"], empty)).toEqual([
    "title",
    "room",
  ]);
  expect(
    availableScenes(["popular", "story", "recent", "contenders", "achievements"], {
      recentResults: [result],
      contenders: [3],
      achievements: { ...noAchievements, sealedUnlockCount: 1 },
      stories: [{ kind: "milestone", next: 10, remaining: 1 }],
      stats: { popularity: [{ family: "uno", gameId: 1, count: 1 }] },
    }),
  ).toEqual(["recent", "achievements", "story", "popular", "contenders"]);
  expect(availableScenes(["recent"], { ...empty, contenders: [] })).toEqual(["title"]);
});
```

In `src/server/repo/repo.test.ts` change

```ts
    expect(facts.event.enabledScenes).toEqual(["title", "room", "recent", "counters", "achievements"]);
```

to

```ts
    expect(facts.event.enabledScenes).toEqual(["title", "room", "recent", "counters", "achievements", "story", "popular"]);
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/screen/logic.test.ts src/server/repo/repo.test.ts`
Expected: FAIL — order `["popular","story",...]` is returned as given and seed lacks `story`/`popular`.

- [x] **Step 3: Register the scenes in `src/domain/types.ts`**

Replace the `SceneId`, `ALL_SCENES` and `DEFAULT_SCENES` lines with:

```ts
export type SceneId = "title" | "room" | "recent" | "counters" | "achievements" | "story" | "popular" | "contenders";
```

```ts
export const ALL_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements", "story", "popular", "contenders"];
export const DEFAULT_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements", "story", "popular"];
```

- [x] **Step 4: Migrate existing databases**

Run: `npx drizzle-kit generate --custom --name enable_story_popular_scenes`
Expected: creates an empty `drizzle/0003_enable_story_popular_scenes.sql`, a journal entry and a snapshot. Put this single statement into the file (below the generated comment):

```sql
UPDATE `event`
SET `enabledScenes` = json_insert(json_insert(`enabledScenes`, '$[#]', 'story'), '$[#]', 'popular')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`event`.`enabledScenes`) WHERE json_each.value IN ('story', 'popular'));
```

Do not touch the `enabledScenes` default in `src/server/db/schema.ts`.

- [x] **Step 5: Update `availableScenes` in `src/components/screen/logic.ts`**

Change the imports to:

```ts
import { ANNOUNCEMENT_WINDOW_MS, type PublicSnapshot, type ScreenAnnouncement } from "@/domain/snapshot";
import type { PublicStats } from "@/domain/stats";
import { ALL_SCENES, type SceneId } from "@/domain/types";
```

Replace `availableScenes` with:

```ts
export function availableScenes(
  enabled: SceneId[],
  snapshot: Pick<PublicSnapshot, "recentResults" | "contenders" | "achievements" | "stories"> & {
    stats: Pick<PublicStats, "popularity">;
  },
): SceneId[] {
  const scenes = ALL_SCENES.filter((scene) => enabled.includes(scene)).filter((scene) => {
    if (scene === "recent") return snapshot.recentResults.length > 0;
    if (scene === "contenders") return (snapshot.contenders?.length ?? 0) > 0;
    if (scene === "achievements") {
      return snapshot.achievements.unlocks.length > 0 || snapshot.achievements.sealedUnlockCount > 0;
    }
    if (scene === "story") return snapshot.stories.length > 0;
    if (scene === "popular") return snapshot.stats.popularity.length > 0;
    return true;
  });
  return scenes.length > 0 ? scenes : ["title"];
}
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/screen/logic.test.ts src/server/repo/repo.test.ts`
Expected: PASS.

- [x] **Step 7: Create `src/components/screen/scenes/SceneStory.tsx`**

```tsx
"use client";

import { Award, Flag, Flame, Hourglass, Swords, TrendingUp, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { nameLookup } from "@/components/common/timelineText";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { Story } from "@/domain/stories";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { storyText } from "../storyText";
import { SceneHeading } from "./SceneRoom";

const STORY_SLOTS = 3;

const ICONS: Record<Story["kind"], LucideIcon> = {
  streak: Flame,
  milestone: Flag,
  rivals: Swords,
  collector: Award,
  popular: TrendingUp,
  longest: Hourglass,
};

export function SceneStory({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);
  const stories = snapshot.stories.slice(0, STORY_SLOTS);

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="05" title={t.screen.stories} />
      <ul className="flex flex-1 flex-col justify-center divide-y divide-line">
        {stories.map((story, i) => {
          const Icon = ICONS[story.kind];
          const text = storyText(story, t, lang, names);
          return (
            <motion.li
              key={`${story.kind}-${i}`}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.35 }}
              className="grid grid-cols-[120px_1fr] items-center gap-10 py-10"
            >
              <Icon className={cn("size-[88px]", i === 0 ? "text-accent" : "text-muted")} strokeWidth={1.25} />
              <div className="min-w-0">
                <div className="font-display text-[30px] uppercase tracking-[0.3em] text-accent">{text.kicker}</div>
                <div
                  className={cn(
                    "mt-3 font-display uppercase leading-[0.95] tracking-tight",
                    i === 0 ? "text-[96px]" : "text-[64px] text-text/85",
                  )}
                >
                  {text.line}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [x] **Step 8: Create `src/components/screen/scenes/ScenePopular.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { GameIcon } from "@/components/common/GameIcon";
import { usePublicLookups } from "@/components/common/lookups";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { SceneHeading } from "./SceneRoom";

const ROWS = 8;

export function ScenePopular({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const lookups = usePublicLookups(snapshot);
  const rows = snapshot.stats.popularity.slice(0, ROWS);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = snapshot.stats.gamesCompleted;

  return (
    <div className="flex h-full flex-col px-[120px] pt-[110px] pb-[150px]">
      <SceneHeading index="06" title={t.screen.popular} note={`${total} ${plural(lang, total, t.plurals.games)}`} />
      <ul className="mt-12 flex flex-1 flex-col justify-center gap-7">
        {rows.map((row, i) => {
          const game = lookups.games.get(row.gameId);
          return (
            <li key={row.family} className="grid grid-cols-[64px_460px_1fr_140px] items-center gap-8">
              {game ? <GameIcon name={game.icon} className={cn("size-[52px]", i === 0 ? "text-accent" : "text-muted")} /> : <span />}
              <span className="truncate font-display text-[54px] uppercase leading-none tracking-wide">{game?.name}</span>
              <div className="h-[18px] bg-line">
                <motion.div
                  className={cn("h-full origin-left", i === 0 ? "bg-accent" : "bg-text/40")}
                  style={{ width: `${(row.count / max) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.3 + i * 0.12 }}
                />
              </div>
              <span className="text-right font-display text-[64px] leading-none tabular">{row.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [x] **Step 9: Create `src/components/screen/ScreenTicker.tsx`**

```tsx
"use client";

import { Award, Flag, Play, Trophy, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { TimelineItem } from "@/domain/timeline";
import { useI18n } from "@/i18n/LangProvider";
import { formatClock } from "@/lib/format";
import { nameLookup, timelineKey, timelineText } from "../common/timelineText";
import { EASE } from "../motion/FadeRise";

const TICKER_ITEMS = 8;
const TICKER_MS = 6000;

const ICONS: Record<TimelineItem["kind"], LucideIcon> = { started: Play, result: Trophy, unlock: Award, milestone: Flag };

/** One recent timeline item at a time, in a strip just above the footer. */
export function ScreenTicker({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICKER_MS);
    return () => clearInterval(id);
  }, []);

  const items = snapshot.timeline.slice(0, TICKER_ITEMS);
  if (items.length === 0) return null;
  const item = items[tick % items.length];
  const Icon = ICONS[item.kind];

  return (
    <div className="absolute inset-x-0 bottom-[110px] z-10 h-[40px] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${timelineKey(item)}-${tick}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-y-0 right-[120px] left-[120px] flex items-center gap-4"
        >
          <span className="font-mono text-[22px] text-muted" suppressHydrationWarning>
            {formatClock(item.at)}
          </span>
          <Icon className="size-[24px] shrink-0 text-accent" strokeWidth={1.5} />
          <span className="truncate text-[26px] text-text/90">{timelineText(item, t, names)}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [x] **Step 10: Wire into `src/components/screen/ScreenApp.tsx`**

Add imports (keep alphabetical order with the others):

```tsx
import { ScenePopular } from "./scenes/ScenePopular";
import { SceneStory } from "./scenes/SceneStory";
import { ScreenTicker } from "./ScreenTicker";
```

In `SCENES`, after `achievements: SceneAchievements,` add:

```tsx
  story: SceneStory,
  popular: ScenePopular,
```

Replace

```tsx
          <ScreenFooter snapshot={snapshot} scenes={scenes} scene={scene} cycle={cycle} paused={paused} />
```

with

```tsx
          <ScreenFooter snapshot={snapshot} scenes={scenes} scene={scene} cycle={cycle} paused={paused} />
          <ScreenTicker snapshot={snapshot} />
```

In `src/components/screen/scenes/SceneContenders.tsx` change `index="05"` to `index="07"`.

- [x] **Step 11: Run checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [x] **Step 12: Verify on the projector**

Restart the dev server so the cached DB handle runs migration 0003 (`ss -ltn | grep 3000`; kill stale `next-server` PIDs; `npm run dev`). If the dev DB has no demo data run `npm run db:seed:demo` first. With Playwright at 1920×1080 open `/screen`:
1. `/admin/settings` → Projector lists "Stories" and "Popular games" switched on (dev DB migrated).
2. Use the control-room "Next scene" button until the Stories scene shows (heading `05`), then Popular (`06`). Screenshot both. Check that no text overflows the 1920×1080 stage and that the ticker strip sits between scene content and the footer without overlapping the footer hairline.
3. The ticker changes item every 6 s.
4. Switch the screen language to Russian in Settings; the story lines use Russian plural forms.

- [x] **Step 13: Commit**

```bash
git add src/domain/types.ts drizzle/ src/server/repo/repo.test.ts src/components/screen/
git commit -m "feat(screen): add story and popular scenes and a timeline ticker"
```

---

### Task 10: Public `/stats` page

**Files:**
- Modify: `src/components/public/rankChart.ts`, `src/components/public/rankChart.test.ts`, `src/components/public/HomeView.tsx`
- Create: `src/components/public/SectionTitle.tsx`, `src/components/public/Heatmap.tsx`, `src/components/public/RaceChart.tsx`, `src/components/public/StatsView.tsx`, `src/app/(public)/stats/page.tsx`

**Interfaces:**
- Consumes: `snapshot.stats`, `snapshot.finaleStats` (Task 7); `Heatmap`, `RaceSeries`, `TimedResult` types (Tasks 4–5); `t.stats.*` (Task 1); `formatPoints` (`src/domain/scoring.ts`); `usePublicLookups`, `GameIcon`, `FadeRise`.
- Produces:
  - `rankChart(history, width, height, pad = 12, fixedMaxRank?: number)` — when given, every series shares the same vertical scale.
  - `<SectionTitle index children>` (moved out of `HomeView.tsx`).
  - `<Heatmap data: Heatmap>`, `<RaceChart race: RaceSeries[] colorOf: (playerId) => string>`, `<StatsView>`, route `/stats`.

- [x] **Step 1: Write the failing test**

Append to `src/components/public/rankChart.test.ts`:

```ts
test("a fixed max rank shares the scale between series", () => {
  const chart = rankChart([{ rank: 1 }, { rank: 2 }], 100, 100, 0, 4);
  expect(chart.maxRank).toBe(4);
  expect(chart.path).toBe("M0,0 L100,33.3");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/public/rankChart.test.ts`
Expected: FAIL — `maxRank` is 2.

- [x] **Step 3: Implement in `src/components/public/rankChart.ts`**

Change the signature and the `maxRank` line:

```ts
export function rankChart(
  history: { rank: number | null }[],
  width: number,
  height: number,
  pad = 12,
  fixedMaxRank?: number,
): { path: string; points: { x: number; y: number; rank: number }[]; maxRank: number } {
  const ranks = history.flatMap((h) => (h.rank === null ? [] : [h.rank]));
  const maxRank = fixedMaxRank ?? Math.max(1, ...ranks);
```

(the rest of the function is unchanged).

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/public/rankChart.test.ts`
Expected: PASS.

- [x] **Step 5: Extract `SectionTitle`**

Create `src/components/public/SectionTitle.tsx`:

```tsx
export function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 border-b border-line pb-3">
      <span className="font-mono text-xs text-accent">{index}</span>
      <span className="label-caps text-text">{children}</span>
    </h2>
  );
}
```

In `src/components/public/HomeView.tsx` delete the local `function SectionTitle(...) { ... }` block (the 8 lines right after the imports) and add `import { SectionTitle } from "./SectionTitle";` after `import { FindMe } from "./FindMe";`.

- [x] **Step 6: Create `src/components/public/Heatmap.tsx`**

```tsx
"use client";

import type { Heatmap as HeatmapData } from "@/domain/stats";
import { formatClock, pad2 } from "@/lib/format";

export function Heatmap({ data }: { data: HeatmapData }) {
  const columns = { gridTemplateColumns: `2.25rem repeat(${data.hours.length}, minmax(0, 1fr))` };
  const labelEvery = data.hours.length <= 6 ? 1 : 2;

  return (
    <div className="space-y-1">
      <div className="grid gap-1" style={columns}>
        <span />
        {data.hours.map((hour, i) => (
          <span key={hour} className="text-center font-mono text-[10px] text-muted" suppressHydrationWarning>
            {i % labelEvery === 0 ? formatClock(hour).slice(0, 2) : ""}
          </span>
        ))}
      </div>
      {data.rows.map((row) => (
        <div key={row.tableId} className="grid gap-1" style={columns}>
          <span className="font-display text-sm leading-7 text-muted tabular">{pad2(row.number)}</span>
          {row.cells.map((value, i) => (
            <span
              key={data.hours[i]}
              className="grid h-7 place-items-center rounded-sm border border-line font-mono text-[10px]"
              style={
                value > 0
                  ? { backgroundColor: `color-mix(in oklab, var(--color-accent) ${Math.round(15 + (70 * value) / data.max)}%, transparent)` }
                  : undefined
              }
            >
              {value > 0 ? value : ""}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 7: Create `src/components/public/RaceChart.tsx`**

```tsx
import type { RaceSeries } from "@/domain/stats";
import { rankChart } from "./rankChart";

const W = 640;
const H = 240;
const PAD = 16;

/** Rank after every result for the final top players; the champion is drawn last, in the accent color. */
export function RaceChart({ race, colorOf }: { race: RaceSeries[]; colorOf: (playerId: number) => string }) {
  const maxRank = Math.max(1, ...race.flatMap((s) => s.ranks.flatMap((r) => (r === null ? [] : [r]))));
  const leaderId = race[0]?.playerId;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      <line x1={PAD} x2={W - PAD} y1={PAD} y2={PAD} stroke="var(--color-line-strong)" strokeWidth={1} />
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--color-line)" strokeWidth={1} />
      {[...race].reverse().map((series) => {
        const chart = rankChart(series.ranks.map((rank) => ({ rank })), W, H, PAD, maxRank);
        const leader = series.playerId === leaderId;
        return (
          <path
            key={series.playerId}
            d={chart.path}
            fill="none"
            stroke={leader ? "var(--color-accent)" : colorOf(series.playerId)}
            strokeWidth={leader ? 3 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
      <text x={W - PAD} y={12} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        1
      </text>
      <text x={W - PAD} y={H - 2} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        {maxRank}
      </text>
    </svg>
  );
}
```

- [x] **Step 8: Create `src/components/public/StatsView.tsx`**

```tsx
"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { formatPoints } from "@/domain/scoring";
import type { TimedResult } from "@/domain/stats";
import { fmt, plural } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { GameIcon } from "../common/GameIcon";
import { usePublicLookups } from "../common/lookups";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { Heatmap } from "./Heatmap";
import { RaceChart } from "./RaceChart";
import { SectionTitle } from "./SectionTitle";

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-5 pr-3">
      <div className="font-display text-4xl tabular sm:text-5xl">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-baseline gap-3 py-3">
      <dt className="label-caps">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function StatsView() {
  const { t, lang } = useI18n();
  const { snapshot } = usePublicLive();
  const lookups = usePublicLookups(snapshot);
  const { stats, finaleStats } = snapshot;
  const name = (id: number) => lookups.players.get(id)?.name ?? t.stats.none;
  const gameName = (id: number) => lookups.games.get(id)?.name ?? t.stats.none;
  const games = (n: number) => `${n} ${plural(lang, n, t.plurals.games)}`;
  const timed = (r: TimedResult | null) =>
    r === null ? t.stats.none : `${gameName(r.gameId)} · ${fmt(t.common.minutesShort, { n: r.durationMin })}`;
  const maxPopularity = Math.max(1, ...stats.popularity.map((p) => p.count));

  return (
    <div className="space-y-12 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.stats.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.stats.title}</h1>
        <p className="mt-1 text-muted">{t.stats.subtitle}</p>
      </FadeRise>

      {stats.gamesCompleted === 0 ? (
        <p className="text-muted">{t.stats.empty}</p>
      ) : (
        <>
          <section className="grid grid-cols-3 border-y border-line">
            <Figure label={t.stats.gamesCompleted} value={stats.gamesCompleted} />
            <Figure label={t.stats.distinctGames} value={stats.distinctGames} />
            <Figure label={t.stats.tableSize} value={stats.tableSize ? stats.tableSize.size : t.stats.none} />
          </section>

          <section className="space-y-4">
            <SectionTitle index="01">{t.stats.popularity}</SectionTitle>
            <ul className="space-y-3">
              {stats.popularity.map((row, i) => {
                const game = lookups.games.get(row.gameId);
                return (
                  <li key={row.family} className="grid grid-cols-[1.25rem_7.5rem_1fr_2rem] items-center gap-3 text-sm">
                    {game ? <GameIcon name={game.icon} className="size-4 text-accent" /> : <span />}
                    <span className="truncate font-display uppercase tracking-wide">{game?.name}</span>
                    <span className="h-2 bg-line">
                      <span
                        className={cn("block h-full", i === 0 ? "bg-accent" : "bg-text/40")}
                        style={{ width: `${(row.count / maxPopularity) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-mono tabular">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <SectionTitle index="02">{t.stats.highlights}</SectionTitle>
            <dl className="divide-y divide-line">
              <Row label={t.stats.longest}>{timed(stats.longest)}</Row>
              <Row label={t.stats.fastest}>{timed(stats.fastest)}</Row>
              <Row label={t.stats.rivals}>
                {stats.rivals ? (
                  <>
                    {name(stats.rivals.playerIds[0])} &amp; {name(stats.rivals.playerIds[1])}{" "}
                    <span className="text-muted">
                      {games(stats.rivals.count)} {t.stats.together}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
            </dl>
          </section>

          {stats.heatmap ? (
            <section className="space-y-4">
              <SectionTitle index="03">{t.stats.heatmap}</SectionTitle>
              <p className="text-xs text-muted">{t.stats.heatmapHint}</p>
              <Heatmap data={stats.heatmap} />
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-4">
        <SectionTitle index="04">{t.stats.finale}</SectionTitle>
        {finaleStats === null ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted">
            <Lock className="size-4 text-accent" strokeWidth={1.5} />
            {t.stats.finaleLocked}
          </p>
        ) : (
          <>
            <dl className="divide-y divide-line">
              <Row label={t.stats.comeback}>
                {finaleStats.comeback ? (
                  <>
                    {name(finaleStats.comeback.playerId)}{" "}
                    <span className="text-muted">
                      {fmt(t.stats.comebackValue, { from: finaleStats.comeback.from, to: finaleStats.comeback.to })}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
              <Row label={t.stats.bestJoker}>
                {finaleStats.bestJoker ? (
                  <>
                    {name(finaleStats.bestJoker.playerId)}{" "}
                    <span className="text-muted">
                      {fmt(t.stats.bestJokerValue, {
                        points: formatPoints(finaleStats.bestJoker.bonus),
                        game: gameName(finaleStats.bestJoker.gameId),
                      })}
                    </span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
              <Row label={t.stats.mostGames}>
                {finaleStats.mostGames ? (
                  <>
                    {finaleStats.mostGames.playerIds.map(name).join(", ")}{" "}
                    <span className="text-muted">{games(finaleStats.mostGames.count)}</span>
                  </>
                ) : (
                  t.stats.none
                )}
              </Row>
            </dl>
            {finaleStats.race.length > 0 ? (
              <div className="space-y-3">
                <h3 className="label-caps">{t.stats.race}</h3>
                <RaceChart race={finaleStats.race} colorOf={(id) => lookups.players.get(id)?.color ?? "var(--color-muted)"} />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {finaleStats.race.map((series, i) => (
                    <li key={series.playerId} className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: i === 0 ? "var(--color-accent)" : lookups.players.get(series.playerId)?.color }}
                      />
                      <Link href={`/players/${series.playerId}`} className="hover:text-accent">
                        {name(series.playerId)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
```

- [x] **Step 9: Create `src/app/(public)/stats/page.tsx`**

```tsx
import { StatsView } from "@/components/public/StatsView";

export default function StatsPage() {
  return <StatsView />;
}
```

- [x] **Step 10: Run checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [x] **Step 11: Verify in the browser**

With demo data loaded and the dev server running, open `/stats` at 390×844 in a context without the admin cookie. Expected: three figures, popularity bars, longest/fastest/rivals rows, the heatmap fits the width without horizontal scrolling, and the finale section shows the locked line. In the console, `fetch('/api/live').then(r => r.json()).then(d => d.snapshot.finaleStats)` returns `null`. Then in admin: Settings → Finish event (cancel open demo tables first) → Finale remote → Standings public switch on; reload `/stats` and confirm the finale rows and race chart render. Switch standings public off again and reopen the event. Screenshot both states. Toggle RU and check the page.

- [x] **Step 12: Commit**

```bash
git add src/components/public/ "src/app/(public)/stats/page.tsx"
git commit -m "feat(public): add stats page with popularity, highlights, table-hour heatmap and finale race"
```

---

### Task 11: Public `/timeline`, hot-streak markers and home links

**Files:**
- Modify: `src/components/common/lookups.ts`, `src/components/public/HomeView.tsx`, `src/components/public/ProfileView.tsx`
- Create: `src/components/common/StreakMark.tsx`, `src/components/public/TimelineView.tsx`, `src/app/(public)/timeline/page.tsx`

**Interfaces:**
- Consumes: `snapshot.timeline`, `snapshot.streaks` (Task 7); `nameLookup`, `timelineText`, `timelineKey` (Task 8); `t.timeline.*`, `t.home.stats|timeline|hotStreak` (Task 1).
- Produces:
  - `usePublicLookups(s)` also returns `streaks: Map<number, number>` (playerId → current streak, only players with a hot streak).
  - `<StreakMark streak: number | undefined className?>` — renders nothing when `streak` is falsy.
  - `<TimelineView>`, route `/timeline`; home links to `/stats` and `/timeline`.

- [x] **Step 1: Add streaks to public lookups**

In `src/components/common/lookups.ts`, inside `usePublicLookups`, after the `tables:` line add:

```ts
      streaks: new Map(s.streaks.map((x) => [x.playerId, x.streak])),
```

- [x] **Step 2: Create `src/components/common/StreakMark.tsx`**

```tsx
"use client";

import { Flame } from "lucide-react";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function StreakMark({ streak, className }: { streak: number | undefined; className?: string }) {
  const { t } = useI18n();
  if (!streak) return null;
  const label = fmt(t.home.hotStreak, { n: streak });
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-accent", className)} title={label} aria-label={label}>
      <Flame className="size-[1em]" strokeWidth={1.75} aria-hidden />
      {streak}
    </span>
  );
}
```

- [x] **Step 3: Create `src/components/public/TimelineView.tsx`**

```tsx
"use client";

import { ArrowLeft, Award, Flag, Play, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { TimelineItem } from "@/domain/timeline";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { nameLookup, timelineKey, timelineText } from "../common/timelineText";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";

const ICONS: Record<TimelineItem["kind"], LucideIcon> = { started: Play, result: Trophy, unlock: Award, milestone: Flag };

export function TimelineView() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);

  return (
    <div className="space-y-8 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {t.timeline.back}
      </Link>
      <FadeRise>
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.timeline.title}</h1>
        <p className="mt-1 text-muted">{t.timeline.subtitle}</p>
      </FadeRise>
      {snapshot.timeline.length === 0 ? <p className="text-muted">{t.timeline.empty}</p> : null}
      <ol className="ml-2 border-l border-line pl-5">
        {snapshot.timeline.map((item) => {
          const Icon = ICONS[item.kind];
          const strong = item.kind === "result" || item.kind === "milestone";
          return (
            <li key={timelineKey(item)} className="relative py-3">
              <span className="absolute top-[0.95rem] -left-7 grid size-4 place-items-center bg-bg">
                <Icon className={cn("size-3.5", strong ? "text-accent" : "text-muted")} strokeWidth={1.75} />
              </span>
              <div className="flex items-baseline gap-3">
                <span className="w-11 shrink-0 font-mono text-xs text-muted" suppressHydrationWarning>
                  {formatClock(item.at)}
                </span>
                <span className={cn("text-sm", strong ? "text-text" : "text-text/75")}>{timelineText(item, t, names)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [x] **Step 4: Create `src/app/(public)/timeline/page.tsx`**

```tsx
import { TimelineView } from "@/components/public/TimelineView";

export default function TimelinePage() {
  return <TimelineView />;
}
```

- [x] **Step 5: Home links and streak marks in `src/components/public/HomeView.tsx`**

Change the lucide import to:

```tsx
import { ArrowRight, Award, ChartColumn, History, Lock, UserPlus, UserRound } from "lucide-react";
```

Add `import { StreakMark } from "../common/StreakMark";` after the `StateLabel` import.

After the `/achievements` `<Link>...</Link>` block (the one ending with `{t.home.achievements}` and `</Link>`) add:

```tsx
          <Link
            href="/stats"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            <ChartColumn className="size-4" />
            {t.home.stats}
          </Link>
          <Link
            href="/timeline"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]"
          >
            <History className="size-4" />
            {t.home.timeline}
          </Link>
```

Replace the live-table player names

```tsx
                  <p className="text-sm text-muted">
                    {session?.players.map((p) => lookups.players.get(p.playerId)?.name).filter(Boolean).join(" · ")}
                  </p>
```

with

```tsx
                  <p className="flex flex-wrap gap-x-2 text-sm text-muted">
                    {session?.players.map((p, i) => (
                      <span key={p.playerId} className="inline-flex items-center gap-1">
                        {i > 0 ? <span aria-hidden>·</span> : null}
                        {lookups.players.get(p.playerId)?.name}
                        <StreakMark streak={lookups.streaks.get(p.playerId)} className="text-xs" />
                      </span>
                    ))}
                  </p>
```

- [x] **Step 6: Streak mark on the profile in `src/components/public/ProfileView.tsx`**

Add `import { StreakMark } from "../common/StreakMark";` after the `GameIcon` import. Replace

```tsx
          <h1 className="truncate font-display text-4xl uppercase tracking-tight">{profile.player.name}</h1>
```

with

```tsx
          <div className="flex items-center gap-3">
            <h1 className="truncate font-display text-4xl uppercase tracking-tight">{profile.player.name}</h1>
            <StreakMark streak={lookups.streaks.get(profile.player.id)} className="text-lg" />
          </div>
```

- [x] **Step 7: Run checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [x] **Step 8: Verify in the browser**

At 390×844 without the admin cookie:
1. `/` shows Stats and Timeline buttons (they wrap cleanly under Check in / Standings / Achievements).
2. `/timeline` lists items newest first with times and icons; no sealed achievement titles (Comeback, Underdog, Giant Slayer, Joker Master, Risk Taker) appear.
3. Create a hot streak: in admin enter two consecutive direct results won by the same player, then seat that player at a table. Home live tables show the flame mark with `2` next to the name; the player's profile shows it too; `/screen` Stories scene shows "On fire".
4. Undo those results (admin Results → Undo twice) and confirm the mark disappears.

- [x] **Step 9: Commit**

```bash
git add src/components/common/lookups.ts src/components/common/StreakMark.tsx src/components/public/TimelineView.tsx src/components/public/HomeView.tsx src/components/public/ProfileView.tsx "src/app/(public)/timeline/page.tsx"
git commit -m "feat(public): add timeline page, hot-streak markers and home links to stats and timeline"
```

---

### Task 12: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [x] **Step 1: Update `README.md`**

1. In the URL table (the one with the `/achievements` row) add:

```markdown
| `/stats` | Game popularity, longest and fastest games, rivals, table-hour heatmap; finale stats after the reveal |
| `/timeline` | Everything that happened, newest first |
| `/admin/qr` | Printable QR codes for the site, check-in, screen and admin (Settings → Network) |
```

2. In "Anonymous mode", append to the paragraph starting "Achievements are recomputed": `Stats, stories, the timeline and hot-streak markers only use facts visible in the room; biggest comeback, best Joker, most games played and the rank race stay hidden until the finale.`

3. In "Projector mode", change the scene list to "(Title, Live room, Recent results, Event stats, Achievements, Stories, Popular games, optional Contenders)" and append: `A ticker above the footer cycles through the latest timeline items.`

4. In "Event night on Windows", in the step that selects the Wi-Fi address, add: `then Settings → Network → Print QR codes`.

5. In "Troubleshooting" add: `- Demo announcements or milestones reappear after going live: they are removed together with demo data; if a result was entered on demo players by hand, clear demo data again from Settings → Data.`

6. Replace the Roadmap section body with: `- All tiers shipped. Out of scope: sound effects, in-game raw scores, player accounts, websockets.`

- [x] **Step 2: Update `CLAUDE.md`**

Replace the `## Deferred to Tier 3 (not in this plan, don't add scope)` section with:

```markdown
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
```

Keep the user's other uncommitted edits in `CLAUDE.md` intact; only swap this section.

- [x] **Step 3: Full automated check**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass; `next build` completes without type or prerender errors.

- [x] **Step 4: End-to-end run with Playwright (390×844 and 1920×1080)**

Start fresh: `npm run db:reset && npm run db:seed:demo && npm run dev`.

1. 1920×1080 `/screen`: step through scenes with the admin "Next scene" button; Stories and Popular games render; ticker updates.
2. 390×844 public: `/`, `/stats`, `/timeline`, a profile. `fetch('/api/live').then(r => r.json())` has no forbidden keys (`counted`, `rank`, `jokerDeclared`, `wins`, `gamesPlayed`), `finaleStats` is `null`, and no timeline unlock has a sealed id.
3. Admin: Settings → Network → Print QR codes renders four codes; print emulation hides the buttons.
4. Admin: Settings → Data → Remove demo data. `/screen` shows no demo reveal or milestone replays; `/timeline` is empty; `/stats` shows the empty state.
5. Enter two real results, finish the event, run the finale to the final standings step; `/stats` finale section and race chart appear; reopen the event and confirm they are hidden again.
6. Repeat 1–2 with RU.

Record any defect as its own fix commit (use superpowers:systematic-debugging); do not mark this task complete with a known failure.

- [x] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document stats, timeline, QR sheet, stories and hot streaks"
```
