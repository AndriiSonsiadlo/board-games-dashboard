import { toast } from "sonner";
import type { Dict } from "@/i18n";
import type { ActionResult } from "./action";

/** Shows a toast for failures (and optional success). Returns true when the action succeeded. */
export function handleResult<T>(
  result: ActionResult<T>,
  t: Dict,
  success?: string,
): result is { ok: true; data: T } {
  if (result.ok) {
    if (success) toast.success(success);
    return true;
  }
  toast.error(t.errors[result.error]);
  if (result.error === "unauthorized") window.location.assign("/admin/login");
  return false;
}
