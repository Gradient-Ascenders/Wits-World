import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';

export const rateLimitPolicies = [
  'player-general',
  'developer-api',
  'critical-write',
  'credential-revoke',
  'gameplay-write',
  'author-expensive',
  'live-ticket',
] as const;

export type RateLimitPolicy = (typeof rateLimitPolicies)[number];

export interface RateLimitPolicyConfig {
  maxRequests: number;
  windowMs: number;
}

export type RateLimitPolicyConfigMap = Record<
  RateLimitPolicy,
  RateLimitPolicyConfig
>;

export interface RateProtectionDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateProtection {
  consume(
    subjectId: string,
    policy: RateLimitPolicy,
  ): Promise<RateProtectionDecision>;
}

export type AuthenticatedRateProtection = RateProtection;

// Explicitly selected for local development only; never selected after an
// Upstash request fails and never selected in production.
export function createLocalRateProtection(
  policies: RateLimitPolicyConfigMap,
  clock: () => number = Date.now,
): RateProtection {
  const windows = new Map<string, number[]>();
  return {
    async consume(subjectId, policy) {
      const now = clock();
      const { maxRequests, windowMs } = policies[policy];
      const key = `${policy}:${subjectId}`;
      const active = (windows.get(key) ?? []).filter(
        (time) => now - time < windowMs,
      );
      active.push(now);
      windows.set(key, active);
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

const failClosedPolicies = new Set<RateLimitPolicy>([
  'critical-write',
  'live-ticket',
]);

export async function enforceRateProtection(
  request: FastifyRequest,
  reply: FastifyReply,
  protection: RateProtection,
  subjectId: string,
  policy: RateLimitPolicy,
): Promise<void> {
  let decision: RateProtectionDecision;
  try {
    decision = await protection.consume(subjectId, policy);
  } catch {
    const failClosed = failClosedPolicies.has(policy);
    request.log.warn(
      {
        rateLimitPolicy: policy,
        outcome: failClosed ? 'fail-closed' : 'fail-open',
      },
      'Rate-limit store unavailable',
    );
    if (failClosed) {
      throw new ApiError({
        statusCode: 503,
        code: 'RATE_LIMIT_UNAVAILABLE',
        title: 'Rate protection unavailable',
        detail: 'This operation is temporarily unavailable. Try again later.',
      });
    }
    return;
  }

  reply.header('RateLimit-Limit', decision.limit);
  reply.header('RateLimit-Remaining', decision.remaining);
  request.log.debug(
    {
      rateLimitPolicy: policy,
      outcome: decision.allowed ? 'allowed' : 'quota-rejected',
    },
    'Rate-limit decision',
  );
  if (!decision.allowed) {
    reply.header('Retry-After', decision.retryAfterSeconds);
    throw new ApiError({
      statusCode: 429,
      code: 'RATE_LIMITED',
      title: 'Too many requests',
      detail:
        policy === 'developer-api'
          ? 'This developer API key has made too many requests. Try again after the indicated delay.'
          : 'This authenticated player has made too many API requests. Try again after the indicated delay.',
    });
  }
}

export interface UpstashRateProtectionOptions {
  url: string;
  token: string;
  timeoutMs: number;
  policies: RateLimitPolicyConfigMap;
  clock?: () => number;
}

export function createUpstashRateProtection({
  url,
  token,
  timeoutMs,
  policies,
  clock = Date.now,
}: UpstashRateProtectionOptions): RateProtection {
  const redis = new Redis({
    url,
    token,
    signal: () => AbortSignal.timeout(timeoutMs),
  });
  const limiters = Object.fromEntries(
    rateLimitPolicies.map((policy) => {
      const { maxRequests, windowMs } = policies[policy];
      return [
        policy,
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
          prefix: `ww:rl:v1:${policy}`,
          analytics: false,
          ephemeralCache: false,
        }),
      ];
    }),
  ) as Record<RateLimitPolicy, Ratelimit>;

  return {
    async consume(subjectId, policy) {
      const result = await withTimeout(
        limiters[policy].limit(subjectId),
        timeoutMs,
      );
      if (result.reason === 'timeout')
        throw new Error('Rate-limit store timed out.');
      return {
        allowed: result.success,
        limit: result.limit,
        remaining: result.remaining,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((result.reset - clock()) / 1_000),
        ),
      };
    },
  };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Rate-limit store timed out.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
