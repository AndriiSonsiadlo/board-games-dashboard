import { notFound } from "next/navigation";
import { ProfileView } from "@/components/public/ProfileView";
import { isAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/live";
import { profileAudience } from "@/server/profileAudience";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const playerId = Number(id);
  if (!Number.isInteger(playerId) || playerId <= 0) notFound();
  const profile = getProfile(getDb(), playerId, profileAudience(await isAdmin(), view));
  if (!profile) notFound();
  return <ProfileView profile={profile} />;
}
