import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { getLiveState } from "@/server/live";
import { qrSvg } from "@/server/qr";

export const dynamic = "force-dynamic";

/** The public site address as a styled QR code. Encodes only the address the organizer published. */
export function GET(request: NextRequest) {
  const base = getLiveState(getDb()).facts.event.publicBaseUrl;
  if (!base) return new NextResponse(null, { status: 404 });
  const theme = request.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  return new NextResponse(qrSvg(`${base}/`, theme), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}
