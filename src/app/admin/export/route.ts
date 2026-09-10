import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { listAudit, loadFacts } from "@/server/repo/facts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), facts: loadFacts(db), audit: listAudit(db, 100_000) },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="board-cup-export-${Date.now()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
