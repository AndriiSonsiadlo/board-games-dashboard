import type { PublicSnapshot } from "@/domain/snapshot";
import type { TimelineItem } from "@/domain/timeline";
import { fmt, type Dict } from "@/i18n";

export interface NameLookup {
  player(id: number): string;
  game(id: number): string;
  tableNumber(id: number | null): number | null;
}

export function nameLookup(s: Pick<PublicSnapshot, "players" | "games" | "tables">): NameLookup {
  const players = new Map(s.players.map((p) => [p.id, p.name]));
  const games = new Map(s.games.map((g) => [g.id, g.name]));
  const tables = new Map(s.tables.map((t) => [t.tableId, t.number]));
  return {
    player: (id) => players.get(id) ?? "?",
    game: (id) => games.get(id) ?? "?",
    tableNumber: (id) => (id === null ? null : (tables.get(id) ?? null)),
  };
}

export function timelineText(item: TimelineItem, t: Dict, names: NameLookup): string {
  switch (item.kind) {
    case "started": {
      const table = names.tableNumber(item.tableId);
      const game = names.game(item.gameId);
      return table === null
        ? fmt(t.timeline.startedNoTable, { game })
        : fmt(t.timeline.started, { game, table: fmt(t.common.tableN, { n: table }) });
    }
    case "result":
      return fmt(t.timeline.result, { game: names.game(item.gameId), winners: item.winnerIds.map(names.player).join(" & ") });
    case "unlock":
      return fmt(t.timeline.unlock, {
        player: names.player(item.playerId),
        achievement: t.achievements.defs[item.achievementId].title,
      });
    case "milestone":
      return fmt(t.timeline.milestone, { n: item.count });
  }
}

export function timelineKey(item: TimelineItem): string {
  switch (item.kind) {
    case "unlock":
      return `unlock-${item.achievementId}-${item.playerId}`;
    case "milestone":
      return `milestone-${item.count}`;
    default:
      return `${item.kind}-${item.sessionId}`;
  }
}
