"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/LangProvider";
import { BrandMark } from "../brand/Wordmark";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { LangToggle } from "../common/LangToggle";
import { usePublicLive } from "../live/LiveProvider";

export function PublicHeader() {
  const { t } = useI18n();
  const { snapshot } = usePublicLive();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label={t.common.appName}>
          <BrandMark className="size-7" />
          <span className="hidden font-display text-sm uppercase tracking-[0.22em] sm:inline">{t.common.appName}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <EventStatusBadge event={snapshot.event} />
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
