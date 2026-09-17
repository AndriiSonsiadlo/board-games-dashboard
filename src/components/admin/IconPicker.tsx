"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { searchGameIcons } from "../common/gameIcons";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const icons = searchGameIcons(query);

  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.games.iconSearch} className={inputClass} />
      <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto rounded-md border border-line p-1 sm:grid-cols-8">
        {icons.map(({ name, Icon }) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={name === value}
            onClick={() => onChange(name)}
            className={cn(
              "grid aspect-square place-items-center rounded-md transition-colors",
              name === value ? "bg-accent/20 text-accent ring-1 ring-accent" : "text-muted hover:bg-white/5 hover:text-text",
            )}
          >
            <Icon className="size-5" strokeWidth={1.5} />
          </button>
        ))}
        {icons.length === 0 ? <p className="col-span-full p-3 text-sm text-muted">{t.games.iconNone}</p> : null}
      </div>
    </div>
  );
}
