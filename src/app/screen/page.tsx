import { LiveProvider } from "@/components/live/LiveProvider";
import { ScreenApp } from "@/components/screen/ScreenApp";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

/** Always the public audience, even in a browser that holds the admin cookie. */
export default function ScreenPage() {
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <ScreenApp />
    </LiveProvider>
  );
}
