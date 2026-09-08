"use client";

import { useMemo } from "react";
import type { AdminSnapshot, PublicSnapshot } from "@/domain/snapshot";

export function useAdminLookups(s: AdminSnapshot) {
  return useMemo(
    () => ({
      players: new Map(s.players.map((p) => [p.id, p])),
      games: new Map(s.games.map((g) => [g.id, g])),
      tables: new Map(s.allTables.map((t) => [t.id, { id: t.id, number: t.number, label: t.label }])),
    }),
    [s],
  );
}

export function usePublicLookups(s: PublicSnapshot) {
  return useMemo(
    () => ({
      players: new Map(s.players.map((p) => [p.id, p])),
      games: new Map(s.games.map((g) => [g.id, g])),
      tables: new Map(s.tables.map((t) => [t.tableId, { id: t.tableId, number: t.number, label: t.label }])),
    }),
    [s],
  );
}
