import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { currentVersion, getAdminSnapshot, getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wantsAdmin = params.get("aud") === "admin";
  if (wantsAdmin && !(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const db = getDb();
  const version = currentVersion(db);
  if (Number(params.get("v")) === version) {
    return NextResponse.json({ changed: false, version }, { headers });
  }
  const snapshot = wantsAdmin ? getAdminSnapshot(db) : getPublicSnapshot(db);
  return NextResponse.json({ changed: true, version: snapshot.version, snapshot }, { headers });
}
