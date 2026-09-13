"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  changePinAction,
  clearDemoDataAction,
  finishEventAction,
  goLiveAction,
  reopenEventAction,
  updateEventInfoAction,
  updateScoringAction,
  updateScreenSettingsAction,
} from "@/app/admin/actions";
import { formatPoints, scoreResult } from "@/domain/scoring";
import { ALL_SCENES, type Lang, type SceneId, type ScoringSettings } from "@/domain/types";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { EventStatusBadge } from "../common/EventStatusBadge";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-6">
      <h2 className="font-display text-xl uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded px-4 font-display text-xs uppercase tracking-[0.14em]",
            value === o.value ? "bg-white/10 text-text" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function SettingsView({ addresses, port }: { addresses: { name: string; address: string }[]; port: string }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.settings.title}</h1>
        <EventStatusBadge event={snapshot.event} />
      </header>
      <Section title={t.settings.event.title}>
        <Lifecycle />
        <EventInfo />
      </Section>
      <Section title={t.settings.scoring.title}>
        <ScoringControls key={snapshot.version} scoring={snapshot.event.scoring} />
      </Section>
      <Section title={t.settings.screen.title}>
        <ScreenControls key={snapshot.version} />
      </Section>
      <Section title={t.settings.network.title}>
        <Network addresses={addresses} port={port} />
      </Section>
      <Section title={t.settings.security.title}>
        <PinChange />
      </Section>
      <Section title={t.settings.data.title}>
        <DataControls />
      </Section>
    </div>
  );
}

function Lifecycle() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const hasDemo = snapshot.players.some((p) => p.isDemo);
  const [clearDemo, setClearDemo] = useState(hasDemo);
  const status = snapshot.event.status;

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-4">
      {status === "draft" ? (
        <>
          <p className="text-sm text-muted">{t.settings.event.goLiveHint}</p>
          {hasDemo ? <Switch checked={clearDemo} onCheckedChange={setClearDemo} label={t.settings.event.clearDemo} /> : null}
          <ConfirmButton
            variant="secondary"
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.goLive}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => goLiveAction(clearDemo))}
          />
        </>
      ) : null}
      {status === "live" ? (
        <>
          <p className="text-sm text-muted">{t.settings.event.finishHint}</p>
          <ConfirmButton
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.finish}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => finishEventAction())}
          />
        </>
      ) : null}
      {status === "finished" ? (
        <>
          <Link
            href="/admin/finale"
            className="flex h-14 w-full items-center justify-center rounded-md bg-accent font-display uppercase tracking-[0.08em] text-bg"
          >
            {t.settings.event.openFinale}
          </Link>
          <p className="text-sm text-muted">{t.settings.event.reopenHint}</p>
          <ConfirmButton
            variant="secondary"
            size="lg"
            block
            disabled={pending}
            label={t.settings.event.reopen}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => reopenEventAction())}
          />
        </>
      ) : null}
    </div>
  );
}

function EventInfo() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [name, setName] = useState(snapshot.event.name);
  const [city, setCity] = useState(snapshot.event.city);
  const [year, setYear] = useState(String(snapshot.event.year));
  const [accent, setAccent] = useState(snapshot.event.accentColor);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.settings.event.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.event.city}>
        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.event.year}>
        <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className={inputClass} />
      </Field>
      <Field label={t.settings.event.accent}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-11 w-14 cursor-pointer rounded-md border border-line bg-surface-2 p-1"
          />
          <span className="font-mono text-sm text-muted">{accent}</span>
        </div>
      </Field>
      <div className="sm:col-span-2">
        <Button
          loading={pending}
          onClick={() =>
            run(() => updateEventInfoAction({ name, city, year: Number(year), accentColor: accent }), { success: t.common.saved })
          }
        >
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}

function ScoringControls({ scoring }: { scoring: ScoringSettings }) {
  const { t } = useI18n();
  const { run } = useRunner();
  const [s, setS] = useState(scoring);

  const update = (patch: Partial<ScoringSettings>) => {
    setS((current) => ({ ...current, ...patch }));
    run(() => updateScoringAction(patch));
  };

  const example = scoreResult(
    10,
    [1, 2, 3, 4].map((placement) => ({ playerId: placement, placement, jokerDeclared: false })),
    s,
  );

  return (
    <div className="space-y-5">
      <Field label={t.settings.scoring.strategy} hint={s.strategy === "total" ? t.settings.scoring.totalWarning : undefined}>
        <Segmented
          value={s.strategy}
          options={[
            { value: "bestN", label: t.settings.scoring.bestN },
            { value: "total", label: t.settings.scoring.total },
          ]}
          onChange={(strategy) => update({ strategy })}
        />
      </Field>
      {s.strategy === "bestN" ? (
        <Field label={t.settings.scoring.n}>
          <Stepper value={s.bestN} min={1} max={20} onChange={(bestN) => update({ bestN })} />
        </Field>
      ) : null}
      <Field label={t.settings.scoring.floor} hint={t.settings.scoring.floorHint}>
        <Stepper
          value={Math.round(s.participationFloor * 100)}
          min={0}
          max={50}
          step={5}
          format={(v) => `${v}%`}
          onChange={(v) => update({ participationFloor: v / 100 })}
        />
      </Field>
      <Field label={t.settings.scoring.joker}>
        <Stepper
          value={Math.round(s.jokerMultiplier * 100)}
          min={100}
          max={300}
          step={10}
          format={(v) => `×${(v / 100).toFixed(1)}`}
          onChange={(v) => update({ jokerMultiplier: v / 100 })}
        />
      </Field>
      <div className="rounded-md border border-line bg-surface px-4 py-3">
        <div className="label-caps">{fmt(t.settings.scoring.example, { w: 10 })}</div>
        <div className="mt-2 font-mono text-lg tabular">{example.map((p) => formatPoints(p.points)).join("  ·  ")}</div>
      </div>
    </div>
  );
}

function ScreenControls() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run } = useRunner();
  const [duration, setDuration] = useState(snapshot.event.sceneDurationSec);
  const [scenes, setScenes] = useState<SceneId[]>(snapshot.event.enabledScenes);
  const [showPoints, setShowPoints] = useState(snapshot.event.showPointsInReveals);
  const [lang, setLang] = useState<Lang>(snapshot.event.screenLang);

  const toggleScene = (scene: SceneId, on: boolean) => {
    const next = on ? ALL_SCENES.filter((s) => s === scene || scenes.includes(s)) : scenes.filter((s) => s !== scene);
    if (next.length === 0) return;
    setScenes(next);
    run(() => updateScreenSettingsAction({ enabledScenes: next }));
  };

  return (
    <div className="space-y-5">
      <Field label={t.settings.screen.duration}>
        <Stepper
          value={duration}
          min={5}
          max={120}
          onChange={(v) => {
            setDuration(v);
            run(() => updateScreenSettingsAction({ sceneDurationSec: v }));
          }}
        />
      </Field>
      <Field label={t.settings.screen.scenes}>
        <div className="flex flex-col">
          {ALL_SCENES.map((scene) => (
            <Switch
              key={scene}
              checked={scenes.includes(scene)}
              onCheckedChange={(on) => toggleScene(scene, on)}
              label={
                <span>
                  {t.settings.screen.sceneNames[scene]}
                  {scene === "contenders" ? <span className="block text-xs text-muted">{t.settings.screen.contendersHint}</span> : null}
                </span>
              }
            />
          ))}
        </div>
      </Field>
      <Switch
        checked={showPoints}
        onCheckedChange={(on) => {
          setShowPoints(on);
          run(() => updateScreenSettingsAction({ showPointsInReveals: on }));
        }}
        label={t.settings.screen.showPoints}
      />
      <Field label={t.settings.screen.language}>
        <Segmented
          value={lang}
          options={[
            { value: "en", label: "EN" },
            { value: "ru", label: "RU" },
          ]}
          onChange={(value) => {
            setLang(value);
            run(() => updateScreenSettingsAction({ screenLang: value }));
          }}
        />
      </Field>
    </div>
  );
}

function Network({ addresses, port }: { addresses: { name: string; address: string }[]; port: string }) {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [custom, setCustom] = useState(snapshot.event.publicBaseUrl ?? "");
  const current = snapshot.event.publicBaseUrl;

  return (
    <div className="space-y-4">
      <Field label={t.settings.network.baseUrl} hint={t.settings.network.baseUrlHint}>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t.settings.network.baseUrlPlaceholder}
            className={inputClass}
          />
          <Button
            className="shrink-0"
            loading={pending}
            onClick={() => run(() => updateEventInfoAction({ publicBaseUrl: custom }), { success: t.common.saved })}
          >
            {t.common.save}
          </Button>
        </div>
      </Field>
      <div className="space-y-2">
        <span className="label-caps">{t.settings.network.detected}</span>
        {addresses.length === 0 ? <p className="text-sm text-muted">{t.settings.network.none}</p> : null}
        <ul className="divide-y divide-line rounded-md border border-line">
          {addresses.map((a) => {
            const url = `http://${a.address}:${port}`;
            return (
              <li key={`${a.name}-${a.address}`} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm">{url}</div>
                  <div className="truncate text-xs text-muted">{a.name}</div>
                </div>
                <Button
                  size="sm"
                  variant={current === url ? "primary" : "secondary"}
                  disabled={pending}
                  onClick={() => {
                    setCustom(url);
                    run(() => updateEventInfoAction({ publicBaseUrl: url }), { success: t.common.saved });
                  }}
                >
                  {t.settings.network.use}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PinChange() {
  const { t } = useI18n();
  const { run, pending } = useRunner();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label={t.settings.security.currentPin}>
        <input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t.settings.security.newPin}>
        <input type="password" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </Field>
      <ConfirmButton
        variant="secondary"
        loading={pending}
        disabled={current.length < 4 || next.length < 4}
        label={t.settings.security.change}
        confirmLabel={t.common.tapToConfirm}
        onConfirm={() =>
          run(() => changePinAction({ current, next }), {
            success: t.settings.security.changed,
            onOk: () => {
              setCurrent("");
              setNext("");
            },
          })
        }
      />
    </div>
  );
}

function DataControls() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const hasDemo = snapshot.players.some((p) => p.isDemo);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href="/admin/export"
        className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-4 font-display text-sm uppercase tracking-[0.08em]"
      >
        <Download className="size-4" />
        {t.settings.data.export}
      </a>
      {hasDemo ? (
        <div className="flex flex-col gap-1">
          <ConfirmButton
            disabled={pending}
            label={t.settings.data.clearDemo}
            confirmLabel={t.common.tapToConfirm}
            onConfirm={() => run(() => clearDemoDataAction(), { success: t.settings.data.cleared })}
          />
          <span className="text-xs text-muted">{t.settings.data.clearDemoHint}</span>
        </div>
      ) : null}
    </div>
  );
}
