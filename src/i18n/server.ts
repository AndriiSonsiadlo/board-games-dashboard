import { cookies } from "next/headers";
import type { Lang } from "@/domain/types";
import { isLang, LANG_COOKIE } from "./index";

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "en";
}
