interface LimiterEntry {
  hits: number[];
  lockedUntil: number;
}

/** A sliding-window counter that locks a key out for `lockMs` after `maxHits` within `windowMs`. */
function createLimiter(windowMs: number, maxHits: number, lockMs: number) {
  const state = new Map<string, LimiterEntry>();
  return {
    lockRemainingMs(key: string, now = Date.now()): number {
      const entry = state.get(key);
      return entry ? Math.max(0, entry.lockedUntil - now) : 0;
    },
    recordHit(key: string, now = Date.now()): void {
      const entry = state.get(key) ?? { hits: [], lockedUntil: 0 };
      entry.hits = [...entry.hits.filter((t) => now - t < windowMs), now];
      if (entry.hits.length >= maxHits) {
        entry.lockedUntil = now + lockMs;
        entry.hits = [];
      }
      state.set(key, entry);
    },
    clear(key: string): void {
      state.delete(key);
    },
    reset(): void {
      state.clear();
    },
  };
}

// PIN login: tight, since a real person types a handful of digits.
const loginLimiter = createLimiter(5 * 60_000, 5, 30_000);

export function lockRemainingMs(key: string, now = Date.now()): number {
  return loginLimiter.lockRemainingMs(key, now);
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  loginLimiter.recordHit(key, now);
}

export function recordLoginSuccess(key: string): void {
  loginLimiter.clear(key);
}

export function resetLoginLimits(): void {
  loginLimiter.reset();
}

// Public self check-in kiosk: many legitimate guests share this endpoint, so this
// is more lenient than PIN login, but still bounds how fast it can be hammered
// (every attempt, successful or not, costs a loadFacts + version-bump rebuild).
const checkinLimiter = createLimiter(60_000, 8, 20_000);

export function checkinLockRemainingMs(key: string, now = Date.now()): number {
  return checkinLimiter.lockRemainingMs(key, now);
}

export function recordCheckinAttempt(key: string, now = Date.now()): void {
  checkinLimiter.recordHit(key, now);
}

export function resetCheckinLimits(): void {
  checkinLimiter.reset();
}
