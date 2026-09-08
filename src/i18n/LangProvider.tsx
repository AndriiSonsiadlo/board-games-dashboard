"use client";

import { createContext, useContext, useMemo } from "react";
import type { Lang } from "@/domain/types";
import { getDict, type Dict } from "./index";

const LangContext = createContext<{ lang: Lang; t: Dict }>({ lang: "en", t: getDict("en") });

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: getDict(lang) }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  return useContext(LangContext);
}
