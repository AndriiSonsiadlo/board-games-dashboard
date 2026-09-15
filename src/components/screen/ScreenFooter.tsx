"use client";

import { useBrand } from "@/components/brand/BrandProvider";
import { BrandMark } from "@/components/brand/Wordmark";
import { brandTitle } from "@/domain/brand";
import type { PublicSnapshot } from "@/domain/snapshot";
import type { SceneId } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function ScreenFooter({
  snapshot,
  scenes,
  scene,
  cycle,
  paused,
}: {
  snapshot: PublicSnapshot;
  scenes: SceneId[];
  scene: SceneId;
  cycle: number;
  paused: boolean;
}) {
  const { t } = useI18n();
  const brand = useBrand();
  const url = snapshot.event.publicBaseUrl?.replace(/^https?:\/\//, "");

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 h-[110px] border-t border-line px-[120px]">
      {!paused ? (
        <span
          key={`${scene}-${cycle}`}
          className="animate-hairline-scan absolute top-[-1px] left-0 h-px w-full bg-accent/70"
          style={{ ["--scene-ms" as string]: `${snapshot.event.sceneDurationSec * 1000}ms` }}
        />
      ) : null}
      <div className="flex h-full items-center gap-8">
        <BrandMark className="size-[44px] text-text" />
        <span className="font-display text-[26px] uppercase tracking-[0.3em]">{brandTitle(brand)}</span>
        <span className="font-display text-[22px] uppercase tracking-[0.3em] text-muted">
          {snapshot.event.city} · {snapshot.event.year}
        </span>
        <div className="mx-auto flex gap-3">
          {scenes.map((s) => (
            <span key={s} className={cn("h-[6px] w-[34px] rounded-full", s === scene ? "bg-text" : "bg-line-strong")} />
          ))}
        </div>
        {url ? (
          <div className="flex items-center gap-5">
            <span className="text-right text-[24px] leading-tight text-muted">
              {t.screen.follow}
              <span className="block font-mono text-text">{url}</span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- live SVG from /api/qr, no optimization wanted */}
            <img src={`/api/qr?theme=dark&u=${encodeURIComponent(url)}`} alt="" className="size-[88px] rounded-[4px]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
