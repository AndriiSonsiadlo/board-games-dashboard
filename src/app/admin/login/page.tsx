import { redirect } from "next/navigation";
import { LoginView } from "@/components/admin/LoginView";
import { isAdmin } from "@/server/auth/admin";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <LoginView />;
}
