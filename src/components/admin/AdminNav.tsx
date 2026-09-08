"use client";

import { Armchair, Dices, Eye, LayoutGrid, ListOrdered, LogOut, Menu, MonitorPlay, Settings, Trophy, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/admin/login/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { BrandMark } from "../brand/Wordmark";
import { LangToggle } from "../common/LangToggle";
import { useAdminLive } from "../live/LiveProvider";
import { Sheet } from "../ui/Sheet";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

export function AdminNav() {
  const { t } = useI18n();
  const { stale } = useAdminLive();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary: Item[] = [
    { href: "/admin", label: t.nav.room, icon: LayoutGrid },
    { href: "/admin/results", label: t.nav.results, icon: ListOrdered },
    { href: "/admin/leaderboard", label: t.nav.standings, icon: Trophy },
    { href: "/admin/players", label: t.nav.players, icon: Users },
  ];
  const secondary: Item[] = [
    { href: "/admin/games", label: t.nav.games, icon: Dices },
    { href: "/admin/tables", label: t.nav.tables, icon: Armchair },
    { href: "/admin/settings", label: t.nav.settings, icon: Settings },
    { href: "/screen", label: t.nav.screen, icon: MonitorPlay, external: true },
    { href: "/", label: t.nav.publicSite, icon: Eye, external: true },
  ];

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const link = (item: Item, compact = false) => (
    <Link
      key={item.href}
      href={item.href}
      target={item.external ? "_blank" : undefined}
      onClick={() => setMoreOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-md transition-colors",
        compact ? "flex-1 flex-col justify-center gap-1 py-2 text-[0.62rem]" : "px-3 py-2.5 text-sm",
        isActive(item.href) && !item.external ? "text-text" : "text-muted hover:text-text",
        !compact && isActive(item.href) && !item.external && "bg-white/5",
      )}
    >
      <item.icon className={compact ? "size-5" : "size-4"} strokeWidth={1.5} />
      <span className={compact ? "font-display uppercase tracking-[0.12em]" : ""}>{item.label}</span>
    </Link>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-8 md:flex">
        <div className="mb-8 flex items-center gap-2 px-3">
          <BrandMark className="size-7" />
          <span className="font-display text-sm uppercase tracking-[0.2em]">Cup Admin</span>
          {stale ? <span className="ml-auto size-2 rounded-full bg-down" title="offline" /> : null}
        </div>
        <nav className="flex flex-col gap-1">{primary.map((i) => link(i))}</nav>
        <div className="my-4 border-t border-line" />
        <nav className="flex flex-col gap-1">{secondary.map((i) => link(i))}</nav>
        <div className="mt-auto flex items-center justify-between px-3">
          <LangToggle />
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-2 text-sm text-muted hover:text-text">
              <LogOut className="size-4" strokeWidth={1.5} />
              {t.nav.logout}
            </button>
          </form>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {primary.map((i) => link(i, true))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.62rem] text-muted"
        >
          <Menu className="size-5" strokeWidth={1.5} />
          <span className="font-display uppercase tracking-[0.12em]">{t.nav.more}</span>
          {stale ? <span className="absolute top-2 right-1/3 size-2 rounded-full bg-down" /> : null}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={t.nav.more}>
        <nav className="flex flex-col gap-1">{secondary.map((i) => link(i))}</nav>
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <LangToggle />
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-2 text-sm text-muted">
              <LogOut className="size-4" strokeWidth={1.5} />
              {t.nav.logout}
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
