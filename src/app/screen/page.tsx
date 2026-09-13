import { LiveProvider } from "@/components/live/LiveProvider";
import { RehearsalApp } from "@/components/screen/finale/RehearsalApp";
import { ScreenApp } from "@/components/screen/ScreenApp";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

/** Always the public audience, even in a browser that holds the admin cookie. `?rehearsal=1` reads no data. */
export default async function ScreenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.rehearsal === "1") return <RehearsalApp lang={params.lang === "ru" ? "ru" : "en"} />;
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <ScreenApp />
    </LiveProvider>
  );
}
