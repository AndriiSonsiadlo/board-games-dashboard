"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneId } from "@/domain/types";

export function useRotation(scenes: SceneId[], durationMs: number, paused: boolean, skipNonce: number) {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const lastNonce = useRef(skipNonce);
  const count = Math.max(1, scenes.length);

  const advance = () => {
    setIndex((i) => (i + 1) % count);
    setCycle((c) => c + 1);
  };

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(advance, durationMs);
    return () => clearTimeout(id);
    // advance only depends on count, which is listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, paused, durationMs, count]);

  useEffect(() => {
    if (skipNonce === lastNonce.current) return;
    lastNonce.current = skipNonce;
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipNonce]);

  return { scene: scenes[index % count] ?? "title", cycle };
}
