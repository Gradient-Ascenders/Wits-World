import { describe, expect, it } from 'vitest';

import { buildApiConfig } from '../src/config/api.js';
import {
  DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../src/config/timers.js';
import { MAX_MOVEMENT_EVIDENCE_RETENTION_MS } from '../src/events/movement-evidence.js';

const validEnvironment: NodeJS.ProcessEnv = {
  HOST: '127.0.0.1',
  PORT: '3000',
  LOG_LEVEL: 'info',
  MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND: '12.5',
  ASYNC_PVP_CURSOR_SIGNING_KEY: 'test-only-key-with-at-least-32-bytes',
};

describe('API configuration', () => {
  it('builds a valid API configuration', () => {
    expect(buildApiConfig({ env: validEnvironment })).toEqual({
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      accountDeletionRetryIntervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      asyncPvpCursorSigningKey: 'test-only-key-with-at-least-32-bytes',
      asyncPvpDeadlineSweepIntervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      livePvpWebSocketUrl: 'ws://127.0.0.1:3000/api/v1/realtime/live',
      livePvpDeadlineSweepIntervalMs: 1000,
      livePvpTransientCleanupIntervalMs:
        DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      rankedSweepIntervalMs: 1000,
      movementEvidenceCleanupIntervalMs:
        DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      movementEvidenceRetentionMs: 86400000,
      maxPlausibleJourneySpeedMetresPerSecond: 12.5,
      rateLimitMaxRequests: 120,
      rateLimitWindowMs: 60000,
      trustEvaluationIntervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
    });
  });

  it.each(['249', '30001', 'not-a-number'])(
    'rejects an invalid ranked sweep interval of %s',
    (value) => {
      expect(() =>
        buildApiConfig({
          env: { ...validEnvironment, RANKED_SWEEP_INTERVAL_MS: value },
        }),
      ).toThrow(/RANKED_SWEEP_INTERVAL_MS/u);
    },
  );

  it.each([
    'HOST',
    'PORT',
    'LOG_LEVEL',
    'MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND',
    'ASYNC_PVP_CURSOR_SIGNING_KEY',
  ] as const)('rejects a missing %s value', (variableName) => {
    const env = {
      ...validEnvironment,
    };

    delete env[variableName];

    expect(() => buildApiConfig({ env })).toThrow(
      `${variableName} is required to start the API.`,
    );
  });

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
        ...validEnvironment,
        ACCOUNT_DELETION_RETRY_INTERVAL_MS: '1200000',
      },
    });

    expect(config.accountDeletionRetryIntervalMs).toBe(1_200_000);
  });

  it('rejects an invalid account deletion retry interval', () => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          ACCOUNT_DELETION_RETRY_INTERVAL_MS: '0',
        },
      }),
    ).toThrow(
      'ACCOUNT_DELETION_RETRY_INTERVAL_MS must be a safe integer between',
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

  it('reads and validates asynchronous PvP worker configuration', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS: '1200000',
      },
    });

    expect(config.asyncPvpDeadlineSweepIntervalMs).toBe(1_200_000);
  });

  it('reads and validates live PvP runtime configuration', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        LIVE_PVP_WEBSOCKET_URL: 'wss://api.example.test/api/v1/realtime/live',
        LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS: '750',
        LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS: '1200000',
      },
    });

    expect(config.livePvpWebSocketUrl).toBe(
      'wss://api.example.test/api/v1/realtime/live',
    );
    expect(config.livePvpDeadlineSweepIntervalMs).toBe(750);
    expect(config.livePvpTransientCleanupIntervalMs).toBe(1_200_000);
  });

  it.each([
    'https://api.example.test/api/v1/realtime/live',
    'wss://user:pass@api.example.test/api/v1/realtime/live',
    'wss://api.example.test/api/v1/realtime/live?ticket=secret',
    'not-a-url',
  ])('rejects the unsafe live PvP WebSocket URL %s', (value) => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          LIVE_PVP_WEBSOCKET_URL: value,
        },
      }),
    ).toThrow('LIVE_PVP_WEBSOCKET_URL');
  });

  it.each(['249', '5001', '1.5', 'not-a-number'])(
    'rejects the invalid live PvP deadline sweep interval %s',
    (value) => {
      expect(() =>
        buildApiConfig({
          env: {
            ...validEnvironment,
            LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS: value,
          },
        }),
      ).toThrow('LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS');
    },
  );

  it.each(['59999', String(MAX_NODE_TIMER_DELAY_MS + 1), '1.5'])(
    'rejects the invalid live PvP cleanup interval %s',
    (value) => {
      expect(() =>
        buildApiConfig({
          env: {
            ...validEnvironment,
            LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS: value,
          },
        }),
      ).toThrow('LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS');
    },
  );

  it('rejects a short asynchronous PvP cursor key', () => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          ASYNC_PVP_CURSOR_SIGNING_KEY: 'too-short',
        },
      }),
    ).toThrow('must contain at least 32 UTF-8 bytes');
  });

  it('reads and validates the trust evaluation interval', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        TRUST_EVALUATION_INTERVAL_MS: '1200000',
      },
    });

    expect(config.trustEvaluationIntervalMs).toBe(1_200_000);
  });

  it('rejects an unsafe trust evaluation interval', () => {
    expect(() =>
      buildApiConfig({
        env: {
          ...validEnvironment,
          TRUST_EVALUATION_INTERVAL_MS: '1000',
        },
      }),
    ).toThrow('TRUST_EVALUATION_INTERVAL_MS must be a safe integer between');
  });

  it('reads configured movement evidence retention and cleanup intervals', () => {
    const config = buildApiConfig({
      env: {
        ...validEnvironment,
        MOVEMENT_EVIDENCE_RETENTION_MS: '3600000',
        MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS: '1200000',
      },
    });

    expect(config.movementEvidenceRetentionMs).toBe(3_600_000);
    expect(config.movementEvidenceCleanupIntervalMs).toBe(1_200_000);
  });

  it.each(['0', '-1', 'Infinity', 'not-a-number'])(
    'rejects the invalid maximum plausible journey speed %s',
    (value) => {
      expect(() =>
        buildApiConfig({
          env: {
            ...validEnvironment,
            MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND: value,
          },
        }),
      ).toThrow(
        'MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND must be a finite number greater than zero.',
      );
    },
  );

  it.each([
    [
      'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS',
      String(MIN_DATABASE_MAINTENANCE_INTERVAL_MS),
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    ],
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
    [
      'MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS',
      String(MIN_DATABASE_MAINTENANCE_INTERVAL_MS - 1),
    ],
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
