import { SettingsView } from "@/components/admin/SettingsView";
import { listLanAddresses } from "@/server/network";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return <SettingsView addresses={listLanAddresses()} port={process.env.PORT ?? "3000"} />;
}
