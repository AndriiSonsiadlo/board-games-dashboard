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
