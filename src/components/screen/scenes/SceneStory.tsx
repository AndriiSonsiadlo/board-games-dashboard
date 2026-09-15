"use client";

import { Award, Flag, Flame, Hourglass, Swords, TrendingUp, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { nameLookup } from "@/components/common/timelineText";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { Story } from "@/domain/stories";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { AutoScroll } from "../AutoScroll";
import { storyText } from "../storyText";
import { SceneHeading } from "./SceneRoom";

const STORY_SLOTS = 3;

const ICONS: Record<Story["kind"], LucideIcon> = {
  streak: Flame,
  milestone: Flag,
  rivals: Swords,
  collector: Award,
  popular: TrendingUp,
  longest: Hourglass,
};

export function SceneStory({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t, lang } = useI18n();
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);
  const stories = snapshot.stories.slice(0, STORY_SLOTS);

  return (
    <div className="flex h-full flex-col">
      <SceneHeading index="05" title={t.screen.stories} />
      <AutoScroll startDelayMs={2000} windowMs={snapshot.event.sceneDurationSec * 1000}>
      <ul className="flex flex-col divide-y divide-line">
        {stories.map((story, i) => {
          const Icon = ICONS[story.kind];
          const text = storyText(story, t, lang, names);
          return (
            <motion.li
              key={`${story.kind}-${i}`}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.35 }}
              className="grid grid-cols-[120px_1fr] items-center gap-10 py-10"
            >
              <Icon className={cn("size-[88px]", i === 0 ? "text-accent" : "text-muted")} strokeWidth={1.25} />
              <div className="min-w-0">
                <div className="font-display text-[30px] uppercase tracking-[0.3em] text-accent">{text.kicker}</div>
                <div
                  className={cn(
                    "mt-3 font-display uppercase leading-[0.95] tracking-tight",
                    i === 0 ? "text-[96px]" : "text-[64px] text-text/85",
                  )}
                >
                  {text.line}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
      </AutoScroll>
    </div>
  );
}
