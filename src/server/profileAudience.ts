/**
 * `/players/[id]` is a public page. An organizer browsing it with the admin cookie must see what
 * guests see; the full admin profile needs an explicit `?view=admin` as well.
 */
export function profileAudience(isAdmin: boolean, view: string | string[] | undefined): "public" | "admin" {
  return isAdmin && view === "admin" ? "admin" : "public";
}
