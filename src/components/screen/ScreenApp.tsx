"use client";

import { Maximize } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { SceneId } from "@/domain/types";
import { LangProvider, useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { BrandProvider } from "../brand/BrandProvider";
import { usePublicLive } from "../live/LiveProvider";
import { EASE } from "../motion/FadeRise";
import { AnnouncementPlayer } from "./AnnouncementPlayer";
import { FinaleStage } from "./finale/FinaleStage";
import { lookupsFromSnapshot } from "./finale/lookups";
import { availableScenes } from "./logic";
import { SceneAchievements } from "./scenes/SceneAchievements";
import { SceneContenders } from "./scenes/SceneContenders";
import { SceneCounters } from "./scenes/SceneCounters";
import { ScenePopular } from "./scenes/ScenePopular";
import { SceneRecent } from "./scenes/SceneRecent";
import { SceneRoom } from "./scenes/SceneRoom";
import { SceneStory } from "./scenes/SceneStory";
import { SceneTitle } from "./scenes/SceneTitle";
import { ScreenFooter } from "./ScreenFooter";
import { ScreenTicker } from "./ScreenTicker";
import { Stage } from "./Stage";
import { useRotation } from "./useRotation";
import { useScreenChrome } from "./useScreenChrome";

const SCENES: Record<SceneId, (props: { snapshot: PublicSnapshot }) => React.ReactNode> = {
  title: SceneTitle,
  room: SceneRoom,
  recent: SceneRecent,
  counters: SceneCounters,
  achievements: SceneAchievements,
  story: SceneStory,
  popular: ScenePopular,
  contenders: SceneContenders,
};

export function ScreenApp() {
  const { snapshot } = usePublicLive();
  return (
    <LangProvider lang={snapshot.event.screenLang}>
      <BrandProvider brand={snapshot.event.brand}>
        <ScreenInner snapshot={snapshot} />
      </BrandProvider>
    </LangProvider>
  );
}

function ScreenInner({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const { controlsVisible } = useScreenChrome();
  const [announcing, setAnnouncing] = useState(false);
  const onActiveChange = useCallback((active: boolean) => setAnnouncing(active), []);

  const scenes = availableScenes(snapshot.event.enabledScenes, snapshot);
  const paused = snapshot.event.screenControl.paused || announcing;
  const { scene, cycle } = useRotation(scenes, snapshot.event.sceneDurationSec * 1000, paused, snapshot.event.screenControl.skipNonce);
  const Scene = SCENES[scene];
  const finale = snapshot.finale;

  return (
    <Stage>
      {finale ? (
        <FinaleStage
          current={finale.current}
          step={finale.step}
          lookups={lookupsFromSnapshot(snapshot)}
          event={{ city: snapshot.event.city, year: snapshot.event.year }}
        />
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${scene}-${cycle}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Scene snapshot={snapshot} />
            </motion.div>
          </AnimatePresence>

          <ScreenFooter snapshot={snapshot} scenes={scenes} scene={scene} cycle={cycle} paused={paused} />
          <ScreenTicker snapshot={snapshot} />
          <AnnouncementPlayer snapshot={snapshot} onActiveChange={onActiveChange} />
        </>
      )}

      <button
        type="button"
        onClick={() => void document.documentElement.requestFullscreen?.()}
        className={cn(
          "absolute top-10 right-10 z-30 flex items-center gap-3 rounded-md border border-line-strong px-5 py-3 font-display text-[22px] uppercase tracking-[0.2em] text-muted transition-opacity duration-500",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Maximize className="size-6" />
        {t.screen.fullscreen}
      </button>
    </Stage>
  );
}
