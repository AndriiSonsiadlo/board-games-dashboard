"use server";

import { cookies } from "next/headers";
import type { Lang } from "@/domain/types";
import { isLang, LANG_COOKIE } from "@/i18n";

export async function setLangAction(lang: Lang): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
