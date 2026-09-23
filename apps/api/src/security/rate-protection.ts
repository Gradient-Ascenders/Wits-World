export interface RateProtectionDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateProtection {
  consume(subjectId: string): RateProtectionDecision;
}

export type AuthenticatedRateProtection = RateProtection;

export interface RateProtectionOptions {
  maxRequests: number;
  windowMs: number;
  clock?: () => number;
}

interface WindowState {
  count: number;
  startedAt: number;
}

export function createRateProtection({
  maxRequests,
  windowMs,
  clock = Date.now,
}: RateProtectionOptions): RateProtection {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('Rate-protection maxRequests must be a positive integer.');
  }

  if (!Number.isInteger(windowMs) || windowMs < 1_000) {
    throw new Error(
      'Rate-protection windowMs must be an integer of at least 1000 milliseconds.',
    );
  }

  const windows = new Map<string, WindowState>();
  let nextCleanupAt = 0;

  return {
    consume(subjectId) {
      const now = clock();

      if (!Number.isFinite(now)) {
        throw new Error('Rate-protection clock returned an invalid timestamp.');
      }

      if (now >= nextCleanupAt) {
        for (const [key, window] of windows) {
          if (now - window.startedAt >= windowMs) windows.delete(key);
        }
        nextCleanupAt = now + windowMs;
      }

      const existing = windows.get(subjectId);
      const state =
        !existing || now - existing.startedAt >= windowMs
          ? { count: 0, startedAt: now }
          : existing;

      state.count += 1;
      windows.set(subjectId, state);

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.startedAt + windowMs - now) / 1_000),
      );

      return {
        allowed: state.count <= maxRequests,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - state.count),
        retryAfterSeconds,
      };
    },
  };
}

export const createAuthenticatedRateProtection = createRateProtection;
