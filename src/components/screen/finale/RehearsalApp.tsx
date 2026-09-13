"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRehearsal } from "@/domain/finale";
import type { Lang } from "@/domain/types";
import { LangProvider, useI18n } from "@/i18n/LangProvider";
import { Stage } from "../Stage";
import { useScreenChrome } from "../useScreenChrome";
import { FinaleStage } from "./FinaleStage";
import { lookupsFromRehearsal } from "./lookups";

const AUTO_MS = 10_000;

/** Plays the finale with placeholder data. Never reads or writes real state. */
export function RehearsalApp({ lang }: { lang: Lang }) {
  return (
    <LangProvider lang={lang}>
      <Rehearsal />
    </LangProvider>
  );
}

function Rehearsal() {
  const { t } = useI18n();
  const { controlsVisible } = useScreenChrome();
  const data = useMemo(() => buildRehearsal(), []);
  const lookups = useMemo(() => lookupsFromRehearsal(data), [data]);
  const [step, setStep] = useState(1);
  const total = data.beats.length;

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s >= total ? 1 : s + 1)), AUTO_MS);
    return () => clearTimeout(id);
  }, [step, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setStep((s) => Math.min(total, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <Stage>
      <FinaleStage current={data.beats[step - 1]} step={step} lookups={lookups} event={{ city: data.city, year: data.year }} />
      <div
        className={`absolute top-10 left-10 z-30 flex items-center gap-4 font-display text-[22px] uppercase tracking-[0.2em] transition-opacity duration-500 ${controlsVisible ? "opacity-100" : "opacity-40"}`}
      >
        <span className="rounded-md border border-accent/60 px-4 py-2 text-accent">{t.finale.rehearsal}</span>
        <span className="font-mono text-muted">
          {step}/{total}
        </span>
        {controlsVisible ? <span className="text-muted">{t.finale.rehearsalHint}</span> : null}
      </div>
    </Stage>
  );
}
