export const HOLD_MS = 1500;
/** px per second; slower than this feels stuck, faster is hard to read from the back of the room. */
export const MIN_SPEED = 30;
export const MAX_SPEED = 120;
export const DEFAULT_SPEED = 60;

export interface ScrollPlan {
  distance: number;
  /** Scroll positions (px from the top) at each keyframe. */
  offsets: number[];
  /** Keyframe times, 0..1. */
  times: number[];
  durationMs: number;
}

/**
 * One loop for content taller than its viewport: rest at the start edge while entrance animations run,
 * glide to the far edge, rest, glide back, rest. Travel time is fitted to `windowMs` (how long the
 * scene is on screen) within readable speeds; null when everything fits.
 */
export function autoScrollPlan(o: {
  viewport: number;
  content: number;
  from: "top" | "bottom";
  startDelayMs: number;
  windowMs?: number;
}): ScrollPlan | null {
  const distance = Math.round(o.content - o.viewport);
  if (distance <= 1) return null;
  const slowest = (distance / MIN_SPEED) * 1000;
  const fastest = (distance / MAX_SPEED) * 1000;
  const fitted =
    o.windowMs === undefined ? (distance / DEFAULT_SPEED) * 1000 : (o.windowMs - o.startDelayMs - HOLD_MS * 2) / 2;
  const travelMs = Math.min(slowest, Math.max(fastest, fitted));
  const start = o.from === "top" ? 0 : distance;
  const end = distance - start;
  const marks = [
    0,
    o.startDelayMs,
    o.startDelayMs + travelMs,
    o.startDelayMs + travelMs + HOLD_MS,
    o.startDelayMs + travelMs * 2 + HOLD_MS,
    o.startDelayMs + travelMs * 2 + HOLD_MS * 2,
  ];
  const durationMs = marks[marks.length - 1];
  return { distance, offsets: [start, start, end, end, start, start], times: marks.map((m) => m / durationMs), durationMs };
}
