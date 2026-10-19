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

export const DEFAULT_BRAND: BrandLines = { top: "BOARD GAMES", main: "CUP" };
export const BRAND_MAX_LENGTH = 40;

const clean = (value: string | null) => (value && value.trim() ? value.trim() : null);

/** Per line: the language's field, then the English field, then the built-in default. */
export function resolveBrand(f: BrandFields): Brand {
  const en = { top: clean(f.brandTopEn) ?? DEFAULT_BRAND.top, main: clean(f.brandMainEn) ?? DEFAULT_BRAND.main };
  return { en, ru: { top: clean(f.brandTopRu) ?? en.top, main: clean(f.brandMainRu) ?? en.main } };
}

export const brandTitle = (b: BrandLines) => `${b.top} ${b.main}`;
