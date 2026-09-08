"use client";

import { ArrowRight, Delete } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { loginAction } from "@/app/admin/login/actions";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Wordmark } from "../brand/Wordmark";
import { LangToggle } from "../common/LangToggle";

export function LoginView() {
  const { t } = useI18n();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const press = useCallback((digit: string) => {
    setError(null);
    setPin((p) => (p.length < 8 ? p + digit : p));
  }, []);
  const back = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const submit = useCallback(() => {
    if (pin.length < 4 || pending) return;
    startTransition(async () => {
      const result = await loginAction(pin);
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(t.errors[result.error]);
        setPin("");
      }
    });
  }, [pin, pending, router, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back, submit]);

  const slots = Math.max(4, pin.length);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xs flex-col justify-center gap-10 px-4 py-10">
      <div className="flex items-center justify-between">
        <Wordmark size="sm" />
        <LangToggle />
      </div>
      <div className="space-y-4 text-center">
        <p className="label-caps">{t.login.title}</p>
        <h1 className="font-display text-2xl uppercase tracking-wide">{t.login.subtitle}</h1>
        <div className="flex h-6 items-center justify-center gap-3" aria-live="polite">
          {Array.from({ length: slots }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full border transition-colors duration-150",
                i < pin.length ? "border-accent bg-accent" : "border-line-strong",
              )}
            />
          ))}
        </div>
        <p className="min-h-5 text-sm text-down">{error}</p>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 bg-bg font-display text-2xl active:bg-surface-2">
            {d}
          </button>
        ))}
        <button type="button" onClick={back} className="grid h-16 place-items-center bg-bg text-muted active:bg-surface-2" aria-label={t.login.clear}>
          <Delete className="size-5" strokeWidth={1.5} />
        </button>
        <button type="button" onClick={() => press("0")} className="h-16 bg-bg font-display text-2xl active:bg-surface-2">
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pin.length < 4 || pending}
          className="grid h-16 place-items-center bg-accent text-bg disabled:bg-bg disabled:text-muted"
          aria-label={t.common.confirm}
        >
          <ArrowRight className="size-6" strokeWidth={1.75} />
        </button>
      </div>
    </main>
  );
}
