import type { Story } from "@/domain/stories";
import type { Lang } from "@/domain/types";
import { fmt, plural, type Dict, type PluralForms } from "@/i18n";
import type { NameLookup } from "../common/timelineText";

export interface StoryText {
  kicker: string;
  line: string;
}

export function storyText(story: Story, t: Dict, lang: Lang, names: NameLookup): StoryText {
  const count = (n: number, forms: PluralForms) => `${n} ${plural(lang, n, forms)}`;
  const s = t.stories;
  switch (story.kind) {
    case "streak":
      return {
        kicker: s.streakKicker,
        line: fmt(s.streak, { player: names.player(story.playerId), count: count(story.streak, t.plurals.wins) }),
      };
    case "milestone":
      return {
        kicker: s.milestoneKicker,
        line: fmt(s.milestone, { count: count(story.remaining, t.plurals.games), next: story.next }),
      };
    case "rivals":
      return {
        kicker: s.rivalsKicker,
        line: fmt(s.rivals, {
          a: names.player(story.playerIds[0]),
          b: names.player(story.playerIds[1]),
          count: count(story.count, t.plurals.games),
        }),
      };
    case "collector":
      return {
        kicker: s.collectorKicker,
        line: fmt(s.collector, { player: names.player(story.playerId), count: count(story.count, t.plurals.achievements) }),
      };
    case "popular":
      return {
        kicker: s.popularKicker,
        line: fmt(s.popular, { game: names.game(story.gameId), count: count(story.count, t.plurals.times) }),
      };
    case "longest":
      return {
        kicker: s.longestKicker,
        line: fmt(s.longest, { game: names.game(story.gameId), count: count(story.durationMin, t.plurals.minutes) }),
      };
  }
}
