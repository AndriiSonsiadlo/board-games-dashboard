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

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
