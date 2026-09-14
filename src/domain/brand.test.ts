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
