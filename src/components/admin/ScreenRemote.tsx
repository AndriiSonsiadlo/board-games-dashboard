"use client";

import { MonitorPlay, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { replayLastRevealAction, screenCommandAction } from "@/app/admin/actions";
import { useI18n } from "@/i18n/LangProvider";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { useRunner } from "./useRunner";

export function ScreenRemote() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const paused = snapshot.event.screenControl.paused;

  return (
    <section className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5">
      <a
        href="/screen"
        target="_blank"
        rel="noreferrer"
        className="mr-auto flex items-center gap-2 px-2 font-display text-xs uppercase tracking-[0.16em] text-muted hover:text-text"
      >
        <MonitorPlay className="size-4" strokeWidth={1.5} />
        {t.remote.title}
      </a>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => screenCommandAction(paused ? "resume" : "pause"))}>
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        {paused ? t.remote.resume : t.remote.pause}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => screenCommandAction("skip"))}>
        <SkipForward className="size-3.5" />
        {t.remote.skip}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => replayLastRevealAction(), { success: t.remote.sent })}>
        <RotateCcw className="size-3.5" />
        {t.remote.replay}
      </Button>
    </section>
  );
}
