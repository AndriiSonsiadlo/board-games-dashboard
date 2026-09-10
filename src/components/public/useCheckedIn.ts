"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayerView } from "@/domain/snapshot";

const KEY = "bgc_player";

export function useCheckedIn(players: PlayerView[]) {
  const [stored, setStored] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setStored(JSON.parse(raw) as { id: number; name: string });
    } catch {
      // storage unavailable: behave as not checked in
    }
  }, []);

  const remember = useCallback((me: { id: number; name: string }) => {
    setStored(me);
    try {
      localStorage.setItem(KEY, JSON.stringify(me));
    } catch {
      // ignore
    }
  }, []);

  const player = stored ? players.find((p) => p.id === stored.id) : undefined;
  return { me: player ? { id: player.id, name: player.name } : null, remember };
}
