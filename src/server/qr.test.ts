import jsQR from "jsqr";
import { expect, test } from "vitest";
import { qrLayout, qrLinks, qrSvg, resolveBaseUrl, type QrLayout } from "./qr";

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

/** Paints a layout the way qrSvg draws it (round dots, solid finder rings) into RGBA pixels. */
function rasterize(layout: QrLayout, invert: boolean, scale = 8, quiet = 4) {
  const px = (layout.size + quiet * 2) * scale;
  const [ink, paper] = invert ? [255, 0] : [0, 255];
  const data = new Uint8ClampedArray(px * px * 4).fill(paper);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const paint = (x: number, y: number, v: number) => {
    const i = (y * px + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  };
  const cells = (row: number, col: number, n: number, v: number) => {
    for (let y = (row + quiet) * scale; y < (row + quiet + n) * scale; y++) {
      for (let x = (col + quiet) * scale; x < (col + quiet + n) * scale; x++) paint(x, y, v);
    }
  };
  for (const [row, col] of layout.dots) {
    const cx = (col + quiet + 0.5) * scale;
    const cy = (row + quiet + 0.5) * scale;
    const r = 0.48 * scale;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) paint(x, y, ink);
      }
    }
  }
  for (const [row, col] of layout.finders) {
    cells(row, col, 7, ink);
    cells(row + 1, col + 1, 5, paper);
    cells(row + 2, col + 2, 3, ink);
  }
  return { data, px };
}

const URLS = ["http://192.168.1.20:3000/", "http://192.168.100.200:3000/checkin"];

test.each(URLS)("the layout with a logo hole still decodes, dark on light and inverted: %s", (url) => {
  const layout = qrLayout(url, { logo: true });
  expect(layout.hole).not.toBeNull();
  const { start, length } = layout.hole!;
  expect(layout.dots.some(([r, c]) => r >= start && r < start + length && c >= start && c < start + length)).toBe(false);
  for (const invert of [false, true]) {
    const { data, px } = rasterize(layout, invert);
    expect(jsQR(data, px, px, { inversionAttempts: "attemptBoth" })?.data).toBe(url);
  }
});

test("qrSvg draws themed, standalone svgs", () => {
  const light = qrSvg("http://192.168.1.20:3000/checkin", "light");
  const dark = qrSvg("http://192.168.1.20:3000/checkin", "dark");
  for (const svg of [light, dark]) {
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  }
  expect(light).toContain('fill="#ffffff"');
  expect(dark).toContain('fill="#131315"');
  expect(dark).toContain("#c9a45c");
});
