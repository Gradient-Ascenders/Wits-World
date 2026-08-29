import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  createMovementEvidenceService,
  type MovementEvidenceService,
} from '../src/events/movement-evidence.js';

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('movement evidence log redaction', () => {
  let app: FastifyInstance;
  let output: string;

  beforeEach(async () => {
    output = '';
    app = await buildLoggingApp(
      {
        evaluateJourney: vi.fn().mockResolvedValue({ outcome: 'baseline' }),
        evaluateJourneyWithinTransaction: vi
          .fn()
          .mockResolvedValue({ outcome: 'baseline' }),
        record: vi.fn().mockResolvedValue(undefined),
        purgeExpired: vi.fn().mockResolvedValue(0),
      },
      (message) => {
        output += message;
      },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps precise claims out of ordinary structured logs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events/00000000-0000-4000-8000-000000000018/eligibility',
      headers: { authorization: 'Bearer test-access-token' },
      payload: {
        latitude: -26.19205,
        longitude: 28.03038,
        accuracyMetres: 10,
        acquiredAt: '2026-08-29T09:59:30.000Z',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(output).toContain('Redaction regression probe');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('-26.19205');
    expect(output).not.toContain('28.03038');
    expect(output).not.toContain('2026-08-29T09:59:30.000Z');
  });

  it('keeps a database failing-row detail out of Fastify error logs', async () => {
    await app.close();
    output = '';
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select player.id::text')) {
        return {
          rows: [{ player_id: '00000000-0000-4000-8000-000000000101' }],
        };
      }

      if (statement.includes('select event_id::text')) {
        return { rows: [] };
      }

      if (statement.includes('insert into public.movement_evidence')) {
        throw new Error('failing row contains -26.19205 and 28.03038');
      }

      return { rows: [] };
    });
    const client = {
      query,
      release: vi.fn(),
    } as unknown as pg.PoolClient;
    const movementEvidence = createMovementEvidenceService(
      {
        connect: vi.fn().mockResolvedValue(client),
      } as unknown as Pick<pg.Pool, 'connect'>,
      { maxPlausibleJourneySpeedMetresPerSecond: 10 },
    );
    app = await buildLoggingApp(movementEvidence, (message) => {
      output += message;
    });

    const response = await eligibilityRequest();

    expect(response.statusCode).toBe(500);
    expect(output).toContain('Unhandled API error');
    expect(output).not.toContain('failing row');
    expect(output).not.toContain('-26.19205');
    expect(output).not.toContain('28.03038');
  });

  function eligibilityRequest() {
    return app.inject({
      method: 'POST',
      url: '/api/v1/events/00000000-0000-4000-8000-000000000018/eligibility',
      headers: { authorization: 'Bearer test-access-token' },
      payload: {
        latitude: -26.19205,
        longitude: 28.03038,
        accuracyMetres: 10,
        acquiredAt: '2026-08-29T09:59:30.000Z',
      },
    });
  }
});

async function buildLoggingApp(
  movementEvidence: MovementEvidenceService,
  writeLog: (message: string) => void,
): Promise<FastifyInstance> {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn().mockResolvedValue({
      connectionStrategy: 'auth0',
      issuer: authConfig.issuer,
      playerName: 'private-player',
      subject: 'auth0|private-player',
    }),
  };
  const app = await buildApp({
    authConfig,
    accessTokenVerifier,
    logger: true,
    logDestination: { write: writeLog },
    playerIdentityService: {
      resolve: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000101',
        playerName: 'private-player',
        role: 'player',
        lifecycleStatus: 'active',
      }),
    },
    eventServices: {
      discovery: { list: vi.fn().mockResolvedValue([]) },
      eligibility: {
        evaluate: vi.fn().mockResolvedValue({
          outcome: 'evaluated',
          eventId: '00000000-0000-4000-8000-000000000018',
          eligible: true,
          distanceMetres: 10,
          radiusMetres: 75,
        }),
      },
      movementEvidence,
      clock: () => new Date('2026-08-29T10:00:00.000Z'),
    },
  });

  app.addHook('preHandler', async (request) => {
    request.log.info({ body: request.body }, 'Redaction regression probe');
  });

  return app;
}
