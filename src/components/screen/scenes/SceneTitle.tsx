"use client";

import { motion } from "motion/react";
import { useBrand } from "@/components/brand/BrandProvider";
import { BrandMark } from "@/components/brand/Wordmark";
import { ElapsedClock } from "@/components/common/ElapsedClock";
import { EASE } from "@/components/motion/FadeRise";
import type { PublicSnapshot } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function SceneTitle({ snapshot }: { snapshot: PublicSnapshot }) {
  const { t } = useI18n();
  const brand = useBrand();
  const e = snapshot.event;
  const statusLine = e.status === "draft" ? t.screen.startsSoon : e.status === "finished" ? t.screen.finished : t.screen.liveEvent;

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: EASE }}>
        <BrandMark className="size-[140px] text-text" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.8em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        className="mt-12 font-display text-[56px] uppercase text-muted"
      >
        {brand.top}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
        className={cn(
          "font-display font-semibold uppercase leading-[0.82] tracking-tight",
          brand.main.length > 6 ? "text-[150px]" : "text-[260px]",
        )}
      >
        {brand.main}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="mt-14 flex items-center gap-10 font-display text-[36px] uppercase tracking-[0.3em] text-muted"
      >
        <span>{e.city}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span>{e.year}</span>
        <span className="h-px w-24 bg-line-strong" />
        <span className="text-accent">{statusLine}</span>
      </motion.div>
      {e.startedAt ? (
        <ElapsedClock from={e.startedAt} to={e.finishedAt} className="mt-10 font-mono text-[64px] text-text/90" />
      ) : null}
    </div>
  );
}
