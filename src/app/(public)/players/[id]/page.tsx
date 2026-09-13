import { notFound } from "next/navigation";
import { ProfileView } from "@/components/public/ProfileView";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/live";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) notFound();
  const audience = (await isAdmin()) ? "admin" : "public";
  const profile = getProfile(getDb(), playerId, audience);
  if (!profile) notFound();
  return <ProfileView profile={profile} />;
}
