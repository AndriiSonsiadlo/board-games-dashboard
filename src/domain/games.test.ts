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
