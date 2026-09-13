import type { FinaleBeat } from "@/domain/finale";
import type { Lang } from "@/domain/types";
import { fmt, ordinal, type Dict } from "@/i18n";

/** Host-facing description of a beat; the organizer's phone may show names before the projector does. */
export function beatLabel(t: Dict, lang: Lang, beat: FinaleBeat, playerName: (id: number) => string): string {
  const b = t.finaleRemote.beat;
  switch (beat.kind) {
    case "complete":
      return b.complete;
    case "numbers":
      return b.numbers;
    case "sealed":
      return `${fmt(b.sealed, { title: t.achievements.defs[beat.unlock.achievementId].title })} · ${playerName(beat.unlock.playerId)}`;
    case "place":
      return `${fmt(b.place, { place: ordinal(lang, beat.place) })} · ${playerName(beat.playerId)}`;
    case "champion":
      return [beat.co ? b.coChampions : b.champion, ...beat.playerIds.map(playerName)].join(" · ");
    case "podium":
      return b.podium;
    case "closing":
      return b.closing;
  }
}
