"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { checkInAction } from "@/app/(public)/checkin/actions";
import { findSimilarPlayers } from "@/domain/players";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { handleResult } from "@/lib/notify";
import { Avatar } from "../common/Avatar";
import { usePublicLive } from "../live/LiveProvider";
import { FadeRise } from "../motion/FadeRise";
import { Button } from "../ui/Button";
import { useCheckedIn } from "./useCheckedIn";

const inputClass =
  "h-12 w-full rounded-md border border-line bg-surface-2 px-3 text-base outline-none placeholder:text-muted focus:border-line-strong";

export function CheckinForm() {
  const { t } = useI18n();
  const { snapshot, refresh } = usePublicLive();
  const { me, remember } = useCheckedIn(snapshot.players);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [similar, setSimilar] = useState<typeof snapshot.players | null>(null);
  const [pending, startTransition] = useTransition();

  const back = (
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-text">
      <ArrowLeft className="size-4" />
      {t.checkin.back}
    </Link>
  );

  if (snapshot.event.status === "finished") {
    return (
      <div className="space-y-6 pt-10">
        <p className="text-lg">{t.checkin.closed}</p>
        {back}
      </div>
    );
  }

  if (me) {
    return (
      <FadeRise className="space-y-6 pt-12">
        <div className="grid size-14 place-items-center rounded-full border border-accent text-accent">
          <Check className="size-7" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">{fmt(t.checkin.success, { name: me.name })}</h1>
        <p className="text-muted">{t.checkin.successHint}</p>
        {back}
      </FadeRise>
    );
  }

  const create = () =>
    startTransition(async () => {
      const result = await checkInAction({ name, nickname });
      if (handleResult(result, t)) {
        remember(result.data);
        refresh();
      }
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const matches = findSimilarPlayers(snapshot.players, name);
    if (matches.length > 0 && similar === null) {
      setSimilar(matches);
      return;
    }
    create();
  };

  return (
    <div className="space-y-8 pt-10">
      <div className="space-y-2">
        <h1 className="font-display text-4xl uppercase tracking-tight">{t.checkin.title}</h1>
        <p className="text-muted">{t.checkin.subtitle}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label-caps">{t.checkin.name}</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSimilar(null);
            }}
            autoComplete="given-name"
            className={inputClass}
            maxLength={40}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label-caps">
            {t.checkin.nickname} <span className="normal-case tracking-normal">({t.checkin.nicknameHint})</span>
          </span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} maxLength={24} />
        </label>

        {similar && similar.length > 0 ? (
          <FadeRise className="space-y-3 rounded-md border border-accent/50 bg-accent/5 p-4">
            <p className="font-display uppercase tracking-wide">{t.checkin.similar}</p>
            <ul className="space-y-2">
              {similar.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => remember({ id: p.id, name: p.name })}
                    className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-accent"
                  >
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <span className="flex-1">{p.name}</span>
                    <span className="font-display text-xs uppercase tracking-[0.12em] text-accent">{t.checkin.thatsMe}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="submit" variant="ghost" block loading={pending}>
              {t.checkin.addNew}
            </Button>
          </FadeRise>
        ) : (
          <Button type="submit" variant="primary" size="lg" block loading={pending} disabled={!name.trim()}>
            {t.checkin.submit}
          </Button>
        )}
      </form>
      {back}
    </div>
  );
}
