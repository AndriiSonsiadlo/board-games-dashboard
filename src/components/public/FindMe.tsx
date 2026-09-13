"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { normalizeName } from "@/domain/players";
import type { PlayerView } from "@/domain/snapshot";
import { useI18n } from "@/i18n/LangProvider";
import { Avatar } from "../common/Avatar";

export function FindMe({ players }: { players: PlayerView[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = normalizeName(query);
  const matches = q.length === 0 ? [] : players.filter((p) => normalizeName(p.name).includes(q)).slice(0, 6);

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 focus-within:border-line-strong">
        <Search className="size-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.home.findPlaceholder}
          aria-label={t.home.findMe}
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      {q.length > 0 && matches.length === 0 ? <p className="text-sm text-muted">{t.home.noMatches}</p> : null}
      <ul className="divide-y divide-line">
        {matches.map((p) => (
          <li key={p.id}>
            <Link href={`/players/${p.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
              <Avatar name={p.name} color={p.color} size="sm" />
              {p.name}
              {p.nickname ? <span className="text-sm text-muted">{p.nickname}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
