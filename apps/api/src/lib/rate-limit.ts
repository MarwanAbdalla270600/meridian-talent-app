/**
 * In-memory sliding-window rate limiter (single API instance).
 * For horizontal scaling, replace with a shared store (e.g. Redis) behind the same interface.
 */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimiter {
  /** Returns remaining capacity or `null` (with retry-after seconds) when exceeded. */
  hit(key: string, rule: RateLimitRule): { ok: true } | { ok: false; retryAfter: number };
  reset(key?: string): void;
}

export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = now();
  return {
    hit(key, rule) {
      const t = now();
      if (t - lastSweep > 60_000) {
        for (const [k, v] of hits)
          if (!v.length || v[v.length - 1]! < t - 3_600_000) hits.delete(k);
        lastSweep = t;
      }
      const list = (hits.get(key) ?? []).filter((x) => x > t - rule.windowMs);
      if (list.length >= rule.limit) {
        hits.set(key, list);
        return { ok: false, retryAfter: Math.ceil((list[0]! + rule.windowMs - t) / 1000) };
      }
      list.push(t);
      hits.set(key, list);
      return { ok: true };
    },
    reset(key) {
      if (key) hits.delete(key);
      else hits.clear();
    },
  };
}

export const RATE_LIMITS = {
  global: { limit: 600, windowMs: 60_000 },
  login: { limit: 10, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  upload: { limit: 30, windowMs: 10 * 60_000 },
  pdf: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;
