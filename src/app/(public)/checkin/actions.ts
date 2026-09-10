"use server";

import type { ActionResult } from "@/lib/action";
import { runPublicAction } from "@/server/runAction";
import { checkIn } from "@/server/services/players";

export async function checkInAction(input: {
  name: string;
  nickname?: string | null;
}): Promise<ActionResult<{ id: number; name: string }>> {
  return runPublicAction((db) => {
    const id = checkIn(db, input);
    return { id, name: input.name.trim().replace(/\s+/g, " ") };
  });
}
