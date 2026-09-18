import { RARITIES, type Rarity } from "@/domain/achievements";
import { BRAND_MAX_LENGTH, type BrandFields } from "@/domain/brand";
import { ALL_SCENES, FOLLOW_TEXT_MAX_LENGTH, type AchievementOrder, type Lang, type SceneId, type ScoringStrategy } from "@/domain/types";
import { isOpenSession } from "@/domain/tables";
import { hashPin, randomSecret, verifyPin } from "../auth/pin";
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
  showFollowLink?: boolean;
  showFollowQr?: boolean;
  followText?: string | null;
  showTicker?: boolean;
  showAchievementCards?: boolean;
  showPodium?: boolean;
  achievementOrder?: AchievementOrder;
  finaleShowcaseRarities?: Rarity[];
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
  if (patch.followText !== undefined) {
    check(patch.followText === null || patch.followText.length <= FOLLOW_TEXT_MAX_LENGTH);
  }
  if (patch.achievementOrder !== undefined) check(patch.achievementOrder === "recent" || patch.achievementOrder === "rarity");
  if (patch.finaleShowcaseRarities !== undefined) {
    check(patch.finaleShowcaseRarities.every((r) => RARITIES.includes(r)));
  }
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
      // Rotate the session secret too, so cookies already issued (up to 12h TTL)
      // stop validating and every device has to log in again with the new PIN.
      updateEventRow(tx, { adminPinHash: hashPin(input.next), sessionSecret: randomSecret() });
    },
    { allowWhenFinished: true },
  );
}

export function clearDemoData(db: Db): void {
  mutate(db, (tx) => deleteDemoData(tx));
}

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
