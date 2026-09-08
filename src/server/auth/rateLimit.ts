const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 30_000;

const state = new Map<string, { failures: number[]; lockedUntil: number }>();

export function lockRemainingMs(key: string, now = Date.now()): number {
  const entry = state.get(key);
  return entry ? Math.max(0, entry.lockedUntil - now) : 0;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const entry = state.get(key) ?? { failures: [], lockedUntil: 0 };
  entry.failures = [...entry.failures.filter((t) => now - t < WINDOW_MS), now];
  if (entry.failures.length >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failures = [];
  }
  state.set(key, entry);
}

export function recordLoginSuccess(key: string): void {
  state.delete(key);
}

export function resetLoginLimits(): void {
  state.clear();
}
