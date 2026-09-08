import { AdminNav } from "@/components/admin/AdminNav";
import { LiveProvider } from "@/components/live/LiveProvider";
import { Toaster } from "@/components/ui/Toaster";
import { requireAdminPage } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getAdminSnapshot } from "@/server/live";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const snapshot = getAdminSnapshot(getDb());
  return (
    <LiveProvider audience="admin" initial={snapshot}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
        <AdminNav />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-32 md:px-10 md:pt-10 md:pb-12">{children}</main>
      </div>
      <Toaster />
    </LiveProvider>
  );
}
