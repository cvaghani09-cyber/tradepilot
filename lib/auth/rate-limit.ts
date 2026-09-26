/**
 * Fixed-window in-memory rate limiter.
 * NOTE: per server instance. On serverless/multi-instance deployments replace the
 * store with a shared one (e.g. Redis/Upstash) — the interface stays the same.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { allowed: true, retryAfterMs: 0 };
  }
  b.count++;
  if (b.count > limit) return { allowed: false, retryAfterMs: b.resetAt - now };
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
