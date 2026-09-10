import { LiveProvider } from "@/components/live/LiveProvider";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Toaster } from "@/components/ui/Toaster";
import { getDb } from "@/server/db/client";
import { getPublicSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const snapshot = getPublicSnapshot(getDb());
  return (
    <LiveProvider audience="public" initial={snapshot}>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20">{children}</main>
      <Toaster />
    </LiveProvider>
  );
}
