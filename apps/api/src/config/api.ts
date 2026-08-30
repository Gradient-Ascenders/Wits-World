import { MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS } from '../events/movement-evidence-cleanup-scheduler.js';
import {
  MAX_MOVEMENT_EVIDENCE_RETENTION_MS,
  MIN_MOVEMENT_EVIDENCE_RETENTION_MS,
} from '../events/movement-evidence.js';
import { MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS } from '../matches/asynchronous-pvp-deadline-scheduler.js';
import { MAX_NODE_TIMER_DELAY_MS } from './timers.js';

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
  movementEvidenceCleanupIntervalMs: number;
  movementEvidenceRetentionMs: number;
  maxPlausibleJourneySpeedMetresPerSecond: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
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
    env.ACCOUNT_DELETION_RETRY_INTERVAL_MS?.trim() ?? '60000';

  const accountDeletionRetryIntervalMs = Number(
    accountDeletionRetryIntervalValue,
  );
  const asyncPvpCursorSigningKey = requireEnvironmentValue(
    env,
    'ASYNC_PVP_CURSOR_SIGNING_KEY',
  );
  const asyncPvpDeadlineSweepIntervalMs = Number(
    env.ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS?.trim() ?? '60000',
  );
  const rateLimitMaxRequests = Number(
    env.RATE_LIMIT_MAX_REQUESTS?.trim() ?? '120',
  );
  const rateLimitWindowMs = Number(env.RATE_LIMIT_WINDOW_MS?.trim() ?? '60000');
  const movementEvidenceRetentionMs = Number(
    env.MOVEMENT_EVIDENCE_RETENTION_MS?.trim() ?? '86400000',
  );
  const movementEvidenceCleanupIntervalMs = Number(
    env.MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS?.trim() ?? '60000',
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
    !Number.isInteger(accountDeletionRetryIntervalMs) ||
    accountDeletionRetryIntervalMs < 1000
  ) {
    throw new Error(
      'ACCOUNT_DELETION_RETRY_INTERVAL_MS must be an integer of at least 1000 milliseconds.',
    );
  }

  if (Buffer.byteLength(asyncPvpCursorSigningKey, 'utf8') < 32) {
    throw new Error(
      'ASYNC_PVP_CURSOR_SIGNING_KEY must contain at least 32 UTF-8 bytes.',
    );
  }

  if (
    !Number.isSafeInteger(asyncPvpDeadlineSweepIntervalMs) ||
    asyncPvpDeadlineSweepIntervalMs <
      MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS ||
    asyncPvpDeadlineSweepIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS must be a safe integer between ${MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
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
    movementEvidenceCleanupIntervalMs <
      MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS ||
    movementEvidenceCleanupIntervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS must be a safe integer between ${MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  return {
    host,
    port,
    logLevel: logLevelValue,
    accountDeletionRetryIntervalMs,
    asyncPvpCursorSigningKey,
    asyncPvpDeadlineSweepIntervalMs,
    movementEvidenceCleanupIntervalMs,
    movementEvidenceRetentionMs,
    maxPlausibleJourneySpeedMetresPerSecond,
    rateLimitMaxRequests,
    rateLimitWindowMs,
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
