import {
  MAX_MOVEMENT_EVIDENCE_RETENTION_MS,
  MIN_MOVEMENT_EVIDENCE_RETENTION_MS,
} from '../events/movement-evidence.js';
import {
  DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from './timers.js';
import type { RateLimitPolicyConfigMap } from '../security/rate-protection.js';

export const apiLogLevels = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type ApiLogLevel = (typeof apiLogLevels)[number];

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: ApiLogLevel;
  accountDeletionRetryIntervalMs: number;
  asyncPvpCursorSigningKey: string;
  asyncPvpDeadlineSweepIntervalMs: number;
  livePvpWebSocketUrl: string;
  livePvpDeadlineSweepIntervalMs: number;
  livePvpTransientCleanupIntervalMs: number;
  rankedSweepIntervalMs: number;
  gameplaySchedulerBackend: 'polling' | 'upstash';
  gameplaySchedulerNamespace?: string;
  movementEvidenceCleanupIntervalMs: number;
  movementEvidenceRetentionMs: number;
  maxPlausibleJourneySpeedMetresPerSecond: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  developerApiRateLimitMaxRequests: number;
  developerApiRateLimitWindowMs: number;
  rateLimitPolicies: RateLimitPolicyConfigMap;
  rateLimitBackend: 'upstash' | 'local';
  rateLimitTimeoutMs: number;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
  trustEvaluationIntervalMs: number;
  cardTradeMaintenanceIntervalMs: number;
}

interface BuildApiConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export function buildApiConfig({
  env = process.env,
}: BuildApiConfigOptions = {}): ApiConfig {
  const host = requireEnvironmentValue(env, 'HOST');
  const portValue = requireEnvironmentValue(env, 'PORT');
  const logLevelValue = requireEnvironmentValue(env, 'LOG_LEVEL');
  const maxPlausibleJourneySpeedValue = requireEnvironmentValue(
    env,
    'MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND',
  );

  const port = Number(portValue);
  const maxPlausibleJourneySpeedMetresPerSecond = Number(
    maxPlausibleJourneySpeedValue,
  );

  const accountDeletionRetryIntervalValue =
    env.ACCOUNT_DELETION_RETRY_INTERVAL_MS?.trim() ??
    String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS);

  const accountDeletionRetryIntervalMs = Number(
    accountDeletionRetryIntervalValue,
  );
  const asyncPvpCursorSigningKey = requireEnvironmentValue(
    env,
    'ASYNC_PVP_CURSOR_SIGNING_KEY',
  );
  const asyncPvpDeadlineSweepIntervalMs = Number(
    env.ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS?.trim() ??
      String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS),
  );
  const livePvpWebSocketUrl =
    env.LIVE_PVP_WEBSOCKET_URL?.trim() ??
    `ws://${host}:${port}/api/v1/realtime/live`;
  const livePvpDeadlineSweepIntervalMs = Number(
    env.LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS?.trim() ?? '1000',
  );
  const livePvpTransientCleanupIntervalMs = Number(
    env.LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS?.trim() ??
      String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS),
  );
  const rankedSweepIntervalMs = Number(
    env.RANKED_SWEEP_INTERVAL_MS?.trim() ?? '1000',
  );
  const gameplaySchedulerBackend =
    env.GAMEPLAY_SCHEDULER_BACKEND?.trim() ?? 'polling';
  const gameplaySchedulerNamespace =
    env.GAMEPLAY_SCHEDULER_NAMESPACE?.trim() || undefined;
  if (!['polling', 'upstash'].includes(gameplaySchedulerBackend)) {
    throw new Error('GAMEPLAY_SCHEDULER_BACKEND must be polling or upstash.');
  }
  if (
    gameplaySchedulerNamespace !== undefined &&
    !/^[A-Za-z0-9_-]{1,80}$/u.test(gameplaySchedulerNamespace)
  ) {
    throw new Error('GAMEPLAY_SCHEDULER_NAMESPACE must be a safe namespace.');
  }
  const rateLimitMaxRequests = Number(
    env.RATE_LIMIT_MAX_REQUESTS?.trim() ?? '120',
  );
  const rateLimitWindowMs = Number(env.RATE_LIMIT_WINDOW_MS?.trim() ?? '60000');
  const developerApiRateLimitMaxRequests = Number(
    env.DEVELOPER_API_RATE_LIMIT_MAX_REQUESTS?.trim() ?? '120',
  );
  const developerApiRateLimitWindowMs = Number(
    env.DEVELOPER_API_RATE_LIMIT_WINDOW_MS?.trim() ?? '60000',
  );
  const rateLimitTimeoutMs = Number(env.RATE_LIMIT_TIMEOUT_MS?.trim() ?? '500');
  const rateLimitBackend = env.RATE_LIMIT_BACKEND?.trim() ?? 'upstash';
  const policy = (
    prefix: string,
    defaultMax: number,
  ): { maxRequests: number; windowMs: number } => ({
    maxRequests: Number(
      env[`${prefix}_MAX_REQUESTS`]?.trim() ?? String(defaultMax),
    ),
    windowMs: Number(env[`${prefix}_WINDOW_MS`]?.trim() ?? '60000'),
  });
  const rateLimitPolicies: RateLimitPolicyConfigMap = {
    'player-general': {
      maxRequests: rateLimitMaxRequests,
      windowMs: rateLimitWindowMs,
    },
    'developer-api': {
      maxRequests: developerApiRateLimitMaxRequests,
      windowMs: developerApiRateLimitWindowMs,
    },
    'critical-write': policy('RATE_LIMIT_CRITICAL_WRITE', 10),
    'credential-revoke': policy('RATE_LIMIT_CREDENTIAL_REVOKE', 10),
    'gameplay-write': policy('RATE_LIMIT_GAMEPLAY_WRITE', 30),
    'author-expensive': policy('RATE_LIMIT_AUTHOR_EXPENSIVE', 30),
    'live-ticket': policy('RATE_LIMIT_LIVE_TICKET', 30),
  };
  const upstashRedisRestUrl = env.UPSTASH_REDIS_REST_URL?.trim() || undefined;
  const upstashRedisRestToken =
    env.UPSTASH_REDIS_REST_TOKEN?.trim() || undefined;
  const movementEvidenceRetentionMs = Number(
    env.MOVEMENT_EVIDENCE_RETENTION_MS?.trim() ?? '86400000',
  );
  const movementEvidenceCleanupIntervalMs = Number(
    env.MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS?.trim() ??
      String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS),
  );
  const trustEvaluationIntervalMs = Number(
    env.TRUST_EVALUATION_INTERVAL_MS?.trim() ??
      String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS),
  );
  const cardTradeMaintenanceIntervalMs = Number(
    env.CARD_TRADE_MAINTENANCE_INTERVAL_MS?.trim() ??
      String(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS),
  );

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  if (!isApiLogLevel(logLevelValue)) {
    throw new Error(`LOG_LEVEL must be one of: ${apiLogLevels.join(', ')}.`);
  }

  if (
    !Number.isFinite(maxPlausibleJourneySpeedMetresPerSecond) ||
    maxPlausibleJourneySpeedMetresPerSecond <= 0
  ) {
    throw new Error(
      'MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND must be a finite number greater than zero.',
    );
  }

  if (
    !Number.isSafeInteger(accountDeletionRetryIntervalMs) ||
    accountDeletionRetryIntervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    accountDeletionRetryIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `ACCOUNT_DELETION_RETRY_INTERVAL_MS must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  if (Buffer.byteLength(asyncPvpCursorSigningKey, 'utf8') < 32) {
    throw new Error(
      'ASYNC_PVP_CURSOR_SIGNING_KEY must contain at least 32 UTF-8 bytes.',
    );
  }

  if (
    !Number.isSafeInteger(asyncPvpDeadlineSweepIntervalMs) ||
    asyncPvpDeadlineSweepIntervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    asyncPvpDeadlineSweepIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  validateLivePvpWebSocketUrl(livePvpWebSocketUrl);

  if (
    !Number.isSafeInteger(livePvpDeadlineSweepIntervalMs) ||
    livePvpDeadlineSweepIntervalMs < 250 ||
    livePvpDeadlineSweepIntervalMs > 5000
  ) {
    throw new Error(
      'LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS must be a safe integer between 250 and 5000 milliseconds.',
    );
  }

  if (
    !Number.isSafeInteger(livePvpTransientCleanupIntervalMs) ||
    livePvpTransientCleanupIntervalMs < 60000 ||
    livePvpTransientCleanupIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS must be a safe integer between 60000 and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  if (
    !Number.isSafeInteger(rankedSweepIntervalMs) ||
    rankedSweepIntervalMs < 250 ||
    rankedSweepIntervalMs > 30_000
  ) {
    throw new Error(
      'RANKED_SWEEP_INTERVAL_MS must be a safe integer between 250 and 30000 milliseconds.',
    );
  }

  if (!Number.isInteger(rateLimitMaxRequests) || rateLimitMaxRequests < 1) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be a positive integer.');
  }

  if (!Number.isInteger(rateLimitWindowMs) || rateLimitWindowMs < 1000) {
    throw new Error(
      'RATE_LIMIT_WINDOW_MS must be an integer of at least 1000 milliseconds.',
    );
  }

  if (
    !Number.isInteger(developerApiRateLimitMaxRequests) ||
    developerApiRateLimitMaxRequests < 1
  ) {
    throw new Error(
      'DEVELOPER_API_RATE_LIMIT_MAX_REQUESTS must be a positive integer.',
    );
  }

  if (
    !Number.isInteger(developerApiRateLimitWindowMs) ||
    developerApiRateLimitWindowMs < 1000
  ) {
    throw new Error(
      'DEVELOPER_API_RATE_LIMIT_WINDOW_MS must be an integer of at least 1000 milliseconds.',
    );
  }
  for (const [name, settings] of Object.entries(rateLimitPolicies)) {
    if (!Number.isInteger(settings.maxRequests) || settings.maxRequests < 1) {
      throw new Error(`${name} rate-limit maximum must be a positive integer.`);
    }
    if (!Number.isInteger(settings.windowMs) || settings.windowMs < 1000) {
      throw new Error(
        `${name} rate-limit window must be an integer of at least 1000 milliseconds.`,
      );
    }
  }
  if (
    !Number.isInteger(rateLimitTimeoutMs) ||
    rateLimitTimeoutMs < 1 ||
    rateLimitTimeoutMs > 10000
  ) {
    throw new Error(
      'RATE_LIMIT_TIMEOUT_MS must be an integer between 1 and 10000 milliseconds.',
    );
  }
  if (rateLimitBackend !== 'upstash' && rateLimitBackend !== 'local') {
    throw new Error('RATE_LIMIT_BACKEND must be upstash or local.');
  }
  if (env.NODE_ENV === 'production' && rateLimitBackend !== 'upstash') {
    throw new Error('RATE_LIMIT_BACKEND must be upstash in production.');
  }
  if (
    rateLimitBackend === 'upstash' ||
    gameplaySchedulerBackend === 'upstash'
  ) {
    let parsed: URL;
    try {
      parsed = new URL(upstashRedisRestUrl ?? '');
    } catch {
      throw new Error('UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.');
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error('UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.');
    }
    if (!upstashRedisRestToken)
      throw new Error('UPSTASH_REDIS_REST_TOKEN is required.');
  }

  if (
    !Number.isSafeInteger(movementEvidenceRetentionMs) ||
    movementEvidenceRetentionMs < MIN_MOVEMENT_EVIDENCE_RETENTION_MS ||
    movementEvidenceRetentionMs > MAX_MOVEMENT_EVIDENCE_RETENTION_MS
  ) {
    throw new Error(
      `MOVEMENT_EVIDENCE_RETENTION_MS must be a safe integer between ${MIN_MOVEMENT_EVIDENCE_RETENTION_MS} and ${MAX_MOVEMENT_EVIDENCE_RETENTION_MS} milliseconds.`,
    );
  }

  if (
    !Number.isSafeInteger(movementEvidenceCleanupIntervalMs) ||
    movementEvidenceCleanupIntervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    movementEvidenceCleanupIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  if (
    !Number.isSafeInteger(trustEvaluationIntervalMs) ||
    trustEvaluationIntervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    trustEvaluationIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `TRUST_EVALUATION_INTERVAL_MS must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  if (
    !Number.isSafeInteger(cardTradeMaintenanceIntervalMs) ||
    cardTradeMaintenanceIntervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    cardTradeMaintenanceIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `CARD_TRADE_MAINTENANCE_INTERVAL_MS must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  return {
    host,
    port,
    logLevel: logLevelValue,
    accountDeletionRetryIntervalMs,
    asyncPvpCursorSigningKey,
    asyncPvpDeadlineSweepIntervalMs,
    livePvpWebSocketUrl,
    livePvpDeadlineSweepIntervalMs,
    livePvpTransientCleanupIntervalMs,
    rankedSweepIntervalMs,
    gameplaySchedulerBackend: gameplaySchedulerBackend as 'polling' | 'upstash',
    gameplaySchedulerNamespace,
    movementEvidenceCleanupIntervalMs,
    movementEvidenceRetentionMs,
    maxPlausibleJourneySpeedMetresPerSecond,
    rateLimitMaxRequests,
    rateLimitWindowMs,
    developerApiRateLimitMaxRequests,
    developerApiRateLimitWindowMs,
    rateLimitPolicies,
    rateLimitBackend,
    rateLimitTimeoutMs,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    trustEvaluationIntervalMs,
    cardTradeMaintenanceIntervalMs,
  };
}

function requireEnvironmentValue(
  env: NodeJS.ProcessEnv,
  variableName: string,
): string {
  const value = env[variableName]?.trim();

  if (!value) {
    throw new Error(`${variableName} is required to start the API.`);
  }

  return value;
}

function isApiLogLevel(value: string): value is ApiLogLevel {
  return apiLogLevels.includes(value as ApiLogLevel);
}

function validateLivePvpWebSocketUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'LIVE_PVP_WEBSOCKET_URL must be a valid ws:// or wss:// URL.',
    );
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('LIVE_PVP_WEBSOCKET_URL must use ws:// or wss://.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'LIVE_PVP_WEBSOCKET_URL must not contain credentials, query parameters, or fragments.',
    );
  }
}
