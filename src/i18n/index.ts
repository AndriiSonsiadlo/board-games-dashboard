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
