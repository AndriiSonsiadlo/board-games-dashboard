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
