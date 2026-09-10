"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { EASE } from "@/components/motion/FadeRise";
import { useI18n } from "@/i18n/LangProvider";

export function MilestoneCard({ count, onDone }: { count: number; onDone: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const id = setTimeout(onDone, 5000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070708]/95"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE }}
        className="font-display text-[520px] leading-none tabular text-accent"
      >
        {count}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.8em" }}
        animate={{ opacity: 1, letterSpacing: "0.35em" }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
        className="font-display text-[64px] uppercase"
      >
        {t.screen.milestone}
      </motion.div>
    </motion.div>
  );
}
