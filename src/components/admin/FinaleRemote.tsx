"use client";

import { ChevronLeft, ChevronRight, MonitorPlay, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { finaleCommandAction, finaleGotoAction, setFinaleRevealedAction } from "@/app/admin/actions";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { useAdminLookups } from "../common/lookups";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { beatLabel } from "./finaleLabels";
import { useRunner } from "./useRunner";

const AUTO_MS = 10_000;

export function FinaleRemote() {
  const { t, lang } = useI18n();
  const { snapshot } = useAdminLive();
  const lookups = useAdminLookups(snapshot);
  const { run, pending } = useRunner();
  const [auto, setAuto] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  const finale = snapshot.finale;
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const atEnd = finale !== null && finale.step >= finale.total;

  useEffect(() => {
    if (!auto || atEnd) return;
    const id = setInterval(() => runRef.current(() => finaleCommandAction("next")), AUTO_MS);
    return () => clearInterval(id);
  }, [auto, atEnd]);

  useEffect(() => {
    if (armed === null) return;
    const id = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  if (!finale) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.finaleRemote.title}</h1>
        <p className="border-l-2 border-accent pl-3 text-sm text-muted">{t.finaleRemote.notFinished}</p>
        <Link href="/admin/settings" className="inline-flex h-11 items-center rounded-md border border-line-strong px-4 font-display text-sm uppercase tracking-[0.08em]">
          {t.finaleRemote.openSettings}
        </Link>
      </div>
    );
  }

  const name = (id: number) => lookups.players.get(id)?.name ?? "";
  const label = (i: number) => beatLabel(t, lang, finale.beats[i], name);
  const jump = (step: number) => {
    const reveals = !snapshot.event.finaleRevealed && step >= finale.revealStep;
    if (reveals && armed !== step) {
      setArmed(step);
      return;
    }
    setArmed(null);
    run(() => finaleGotoAction(step));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.finaleRemote.title}</h1>
        <span className="font-mono text-sm text-muted">
          {finale.step === 0 ? t.finaleRemote.notStarted : fmt(t.finaleRemote.stepOf, { step: finale.step, total: finale.total })}
        </span>
      </header>

      <section className="space-y-2 rounded-md border border-line bg-surface p-4">
        <p className="label-caps">{t.finaleRemote.current}</p>
        <p className="font-display text-xl uppercase tracking-wide">{finale.step > 0 ? label(finale.step - 1) : "—"}</p>
        {finale.step < finale.total ? (
          <p className="text-sm text-muted">
            {t.finaleRemote.upNext}: {label(finale.step)}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button size="lg" disabled={pending || finale.step === 0} onClick={() => run(() => finaleCommandAction("back"))}>
          <ChevronLeft className="size-5" />
          {t.finaleRemote.back}
        </Button>
        <Button size="lg" variant="primary" disabled={pending || atEnd} onClick={() => run(() => finaleCommandAction("next"))}>
          {t.finaleRemote.next}
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="space-y-1 border-y border-line py-2">
        <Switch checked={auto} onCheckedChange={setAuto} label={t.finaleRemote.auto} />
        <Switch
          checked={snapshot.event.finaleRevealed}
          disabled={pending}
          onCheckedChange={(on) => run(() => setFinaleRevealedAction(on))}
          label={
            <span>
              {t.finaleRemote.revealed}
              <span className="block text-xs text-muted">{t.finaleRemote.revealedHint}</span>
            </span>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || finale.step === 0} onClick={() => run(() => finaleCommandAction("exit"))}>
          <Square className="size-4" />
          {t.finaleRemote.exit}
        </Button>
        <a
          href={`/screen?rehearsal=1&lang=${snapshot.event.screenLang}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md px-4 font-display text-sm uppercase tracking-[0.08em] text-muted hover:text-text"
        >
          <MonitorPlay className="size-4" strokeWidth={1.5} />
          {t.finaleRemote.rehearsal}
        </a>
      </div>
      <p className="text-xs text-muted">{t.finaleRemote.rehearsalHint}</p>

      <p className="text-xs text-muted">{t.finaleRemote.jumpHint}</p>
      <ol className="divide-y divide-line border-y border-line">
        {finale.beats.map((_, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={pending || i + 1 === finale.step}
              onClick={() => jump(i + 1)}
              className={cn(
                "flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent",
                i + 1 === finale.step ? "text-accent" : i + 1 < finale.step ? "text-muted" : "text-text",
              )}
            >
              <span className="w-6 font-mono text-xs">{i + 1}</span>
              <span className={cn(i + 1 === finale.revealStep && "font-display uppercase tracking-wide")}>{label(i)}</span>
              {armed === i + 1 ? <span className="ml-auto text-xs text-down">{t.finaleRemote.confirmReveal}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
