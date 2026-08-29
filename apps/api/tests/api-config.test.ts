import { describe, expect, it } from 'vitest';

import { buildApiConfig } from '../src/config/api.js';
import { MAX_NODE_TIMER_DELAY_MS } from '../src/events/movement-evidence-cleanup-scheduler.js';
import { MAX_MOVEMENT_EVIDENCE_RETENTION_MS } from '../src/events/movement-evidence.js';

const validEnvironment: NodeJS.ProcessEnv = {
  HOST: '127.0.0.1',
  PORT: '3000',
  LOG_LEVEL: 'info',
};

describe('API configuration', () => {
  it('builds a valid API configuration', () => {
    expect(buildApiConfig({ env: validEnvironment })).toEqual({
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      accountDeletionRetryIntervalMs: 60000,
      movementEvidenceCleanupIntervalMs: 60000,
      movementEvidenceRetentionMs: 86400000,
      rateLimitMaxRequests: 120,
      rateLimitWindowMs: 60000,
    });
  });

  it.each(['HOST', 'PORT', 'LOG_LEVEL'] as const)(
    'rejects a missing %s value',
    (variableName) => {
      const env = {
        ...validEnvironment,
      };

      delete env[variableName];

      expect(() => buildApiConfig({ env })).toThrow(
        `${variableName} is required to start the API.`,
      );
    },
  );

  it.each(['0', '65536', '3.5', 'not-a-port'])(
    'rejects the invalid port %s',
    (port) => {
      expect(() =>
        buildApiConfig({
          env: {
            ...validEnvironment,
            PORT: port,
          },
        }),
      ).toThrow('PORT must be an integer between 1 and 65535.');
    },
  );

  it('rejects an unsupported log level', () => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          LOG_LEVEL: 'verbose',
        },
      }),
    ).toThrow(
      'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent.',
    );
  });

  it('reads a configured account deletion retry interval', () => {
    const config = buildApiConfig({
      env: {
        HOST: '127.0.0.1',
        PORT: '3000',
        LOG_LEVEL: 'info',
        ACCOUNT_DELETION_RETRY_INTERVAL_MS: '15000',
      },
    });

    expect(config.accountDeletionRetryIntervalMs).toBe(15000);
  });

  it('rejects an invalid account deletion retry interval', () => {
    expect(() =>
      buildApiConfig({
        env: {
          HOST: '127.0.0.1',
          PORT: '3000',
          LOG_LEVEL: 'info',
          ACCOUNT_DELETION_RETRY_INTERVAL_MS: '0',
        },
      }),
    ).toThrow(
      'ACCOUNT_DELETION_RETRY_INTERVAL_MS must be an integer of at least 1000 milliseconds.',
    );
  });

  it('reads configured rate-protection limits', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        RATE_LIMIT_MAX_REQUESTS: '40',
        RATE_LIMIT_WINDOW_MS: '30000',
      },
    });

    expect(config.rateLimitMaxRequests).toBe(40);
    expect(config.rateLimitWindowMs).toBe(30000);
  });

  it('reads configured movement evidence retention and cleanup intervals', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        MOVEMENT_EVIDENCE_RETENTION_MS: '3600000',
        MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS: '30000',
      },
    });

    expect(config.movementEvidenceRetentionMs).toBe(3_600_000);
    expect(config.movementEvidenceCleanupIntervalMs).toBe(30_000);
  });

  it.each([
    ['MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS', '1000', 1_000],
    [
      'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS',
      String(MAX_NODE_TIMER_DELAY_MS),
      MAX_NODE_TIMER_DELAY_MS,
    ],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', '1000', 1_000],
    [
      'MOVEMENT_EVIDENCE_RETENTION_MS',
      String(MAX_MOVEMENT_EVIDENCE_RETENTION_MS),
      MAX_MOVEMENT_EVIDENCE_RETENTION_MS,
    ],
  ])('accepts the safe %s boundary %s', (name, value, expected) => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        [name]: value,
      },
    });

    expect(
      name === 'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS'
        ? config.movementEvidenceCleanupIntervalMs
        : config.movementEvidenceRetentionMs,
    ).toBe(expected);
  });

  it.each([
    ['MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS', '999'],
    [
      'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS',
      String(MAX_NODE_TIMER_DELAY_MS + 1),
    ],
    ['MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS', String(Number.MAX_SAFE_INTEGER)],
    [
      'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS',
      String(Number.MAX_SAFE_INTEGER + 1),
    ],
    ['MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS', '-1000'],
    ['MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS', '1.5'],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', '999'],
    [
      'MOVEMENT_EVIDENCE_RETENTION_MS',
      String(MAX_MOVEMENT_EVIDENCE_RETENTION_MS + 1),
    ],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', String(Number.MAX_SAFE_INTEGER)],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', String(Number.MAX_SAFE_INTEGER + 1)],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', '-1000'],
    ['MOVEMENT_EVIDENCE_RETENTION_MS', '1.5'],
  ])('rejects the unsafe %s value %s', (name, value) => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          [name]: value,
        },
      }),
    ).toThrow('must be a safe integer between');
  });

  it.each([
    ['RATE_LIMIT_MAX_REQUESTS', '0', 'positive integer'],
    ['RATE_LIMIT_MAX_REQUESTS', '1.5', 'positive integer'],
    ['RATE_LIMIT_WINDOW_MS', '999', 'at least 1000 milliseconds'],
  ])('rejects invalid %s', (name, value, message) => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          [name]: value,
        },
      }),
    ).toThrow(message);
  });
});
