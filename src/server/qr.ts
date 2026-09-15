import QRCode from "qrcode";

export const QR_TARGETS = ["site", "checkin", "screen", "admin"] as const;
export type QrTarget = (typeof QR_TARGETS)[number];

const PATHS: Record<QrTarget, string> = { site: "/", checkin: "/checkin", screen: "/screen", admin: "/admin" };

/** The configured public address, else the address this page was opened on. Always with a scheme, never a trailing slash. */
export function resolveBaseUrl(publicBaseUrl: string | null, host: string | null): string {
  const raw = publicBaseUrl?.trim() || host || "localhost:3000";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

export function qrLinks(baseUrl: string): { target: QrTarget; url: string }[] {
  return QR_TARGETS.map((target) => ({ target, url: `${baseUrl}${PATHS[target]}` }));
}

export type QrTheme = "dark" | "light";

export interface QrLayout {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** [row, col] of dark modules outside the finder patterns and the logo hole. */
  dots: [number, number][];
  /** Top-left [row, col] of the three 7x7 finder patterns. */
  finders: [number, number][];
  /** Centered square left empty for the brand mark. */
  hole: { start: number; length: number } | null;
}

export function qrLayout(url: string, opts: { logo: boolean }): QrLayout {
  // Level H recovers ~30% of the symbol; the hole below covers ~4-5% of it.
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const finders: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  let hole: QrLayout["hole"] = null;
  if (opts.logo) {
    let length = Math.round(size * 0.2);
    if (length % 2 !== size % 2) length += 1;
    hole = { start: (size - length) / 2, length };
  }
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);
  const inHole = (r: number, c: number) =>
    hole !== null && r >= hole.start && r < hole.start + hole.length && c >= hole.start && c < hole.start + hole.length;
  const dots: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (Boolean(qr.modules.get(r, c)) && !inFinder(r, c) && !inHole(r, c)) dots.push([r, c]);
    }
  }
  return { size, dots, finders, hole };
}

const THEMES: Record<QrTheme, { background: string; dot: string; eye: string; mark: string; pip: string }> = {
  dark: { background: "#131315", dot: "#ece9e2", eye: "#c9a45c", mark: "#ece9e2", pip: "#c9a45c" },
  // Print: finder eyes need contrast against white, so a deeper gold.
  light: { background: "#ffffff", dot: "#111113", eye: "#8a6a2c", mark: "#111113", pip: "#8a6a2c" },
};

const QUIET = 2;

function brandMark(center: number, side: number, colors: (typeof THEMES)[QrTheme]): string {
  const k = side / 40; // BrandMark is drawn on a 40-unit canvas
  const square = (d: number, opacity: number, width: number) =>
    `<rect x="${center - (d / 2) * k}" y="${center - (d / 2) * k}" width="${d * k}" height="${d * k}" transform="rotate(45 ${center} ${center})" fill="none" stroke="${colors.mark}" stroke-opacity="${opacity}" stroke-width="${width * k}"/>`;
  return `${square(24, 1, 2)}${square(14, 0.45, 1.6)}<circle cx="${center}" cy="${center}" r="${2.6 * k}" fill="${colors.pip}"/>`;
}

/** Brand-styled QR: round dots, rounded gold finder eyes and the brand mark in the middle. */
export function qrSvg(url: string, theme: QrTheme = "light"): string {
  const layout = qrLayout(url, { logo: true });
  const colors = THEMES[theme];
  const view = layout.size + QUIET * 2;
  const at = (n: number) => n + QUIET;
  const parts = [`<rect width="${view}" height="${view}" rx="${theme === "dark" ? 2 : 0}" fill="${colors.background}"/>`];
  for (const [r, c] of layout.dots) parts.push(`<circle cx="${at(c) + 0.5}" cy="${at(r) + 0.5}" r="0.48" fill="${colors.dot}"/>`);
  for (const [r, c] of layout.finders) {
    parts.push(
      `<rect x="${at(c) + 0.5}" y="${at(r) + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="${colors.eye}" stroke-width="1"/>`,
      `<rect x="${at(c) + 2}" y="${at(r) + 2}" width="3" height="3" rx="0.8" fill="${colors.eye}"/>`,
    );
  }
  if (layout.hole) parts.push(brandMark(at(layout.hole.start) + layout.hole.length / 2, layout.hole.length * 0.8, colors));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" shape-rendering="geometricPrecision">${parts.join("")}</svg>`;
}
