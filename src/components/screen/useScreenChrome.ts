"use client";

import { useEffect, useState } from "react";

/** Hides the cursor after 3 s idle and keeps the display awake while the screen page is open. */
export function useScreenChrome(): { controlsVisible: boolean } {
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      document.body.style.cursor = "default";
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        document.body.style.cursor = "none";
        setControlsVisible(false);
      }, 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  return { controlsVisible };
}
