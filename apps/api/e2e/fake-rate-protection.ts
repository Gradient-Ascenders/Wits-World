import type {
  RateProtection,
  RateLimitPolicy,
} from '../src/security/rate-protection.js';

export interface FakeRateProtectionOptions {
  maxRequests: number;
  windowMs: number;
  clock?: () => number;
}

// A deterministic shared store for tests; never used by the production server.
export function createRateProtection({
  maxRequests,
  windowMs,
  clock = Date.now,
}: FakeRateProtectionOptions): RateProtection {
  const events = new Map<string, number[]>();
  return {
    async consume(subjectId: string, policy: RateLimitPolicy) {
      const now = clock();
      const key = `${policy}:${subjectId}`;
      const active = (events.get(key) ?? []).filter(
        (time) => now - time < windowMs,
      );
      active.push(now);
      events.set(key, active);
      return {
        allowed: active.length <= maxRequests,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - active.length),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((active[0]! + windowMs - now) / 1_000),
        ),
      };
    },
  };
}

export const createAuthenticatedRateProtection = createRateProtection;
