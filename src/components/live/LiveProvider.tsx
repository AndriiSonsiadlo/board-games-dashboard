"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdminSnapshot, PublicSnapshot, Snapshot } from "@/domain/snapshot";
import type { LiveResponse } from "@/lib/action";

export const POLL_MS = 2000;

export interface LiveValue<S> {
  snapshot: S;
  refresh: () => void;
  stale: boolean;
}

const LiveContext = createContext<LiveValue<Snapshot> | null>(null);

export function LiveProvider({
  audience,
  initial,
  children,
}: {
  audience: "public" | "admin";
  initial: Snapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [stale, setStale] = useState(false);
  const version = useRef(initial.version);
  const inFlight = useRef(false);
  const again = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const res = await fetch(`/api/live?aud=${audience}&v=${version.current}`, { cache: "no-store" });
        if (res.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        if (!res.ok) throw new Error(`live ${res.status}`);
        const data = (await res.json()) as LiveResponse<Snapshot>;
        if (data.changed) {
          version.current = data.version;
          setSnapshot(data.snapshot);
        }
        setStale(false);
      } while (again.current);
    } catch {
      setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, [audience]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await poll();
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };
    timer = setTimeout(loop, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", snapshot.event.accentColor);
  }, [snapshot.event.accentColor]);

  const value = useMemo(() => ({ snapshot, refresh: () => void poll(), stale }), [snapshot, poll, stale]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function usePublicLive(): LiveValue<PublicSnapshot> {
  const ctx = useContext(LiveContext);
  if (!ctx || ctx.snapshot.audience !== "public") throw new Error("usePublicLive requires a public LiveProvider");
  return ctx as LiveValue<PublicSnapshot>;
}

export function useAdminLive(): LiveValue<AdminSnapshot> {
  const ctx = useContext(LiveContext);
  if (!ctx || ctx.snapshot.audience !== "admin") throw new Error("useAdminLive requires an admin LiveProvider");
  return ctx as LiveValue<AdminSnapshot>;
}
