"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLangAction } from "@/app/lang/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";

export function LangToggle({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("inline-flex h-8 items-stretch rounded-md border border-line text-xs", className)} role="group" aria-label={t.common.language}>
      {(["en", "ru"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          aria-pressed={lang === code}
          onClick={() =>
            startTransition(async () => {
              await setLangAction(code);
              router.refresh();
            })
          }
          className={cn(
            "px-2.5 font-display uppercase tracking-[0.12em] transition-colors",
            lang === code ? "bg-white/10 text-text" : "text-muted hover:text-text",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
