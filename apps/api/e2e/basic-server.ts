import { randomUUID } from 'node:crypto';

import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
} from '../src/config/database.js';
import { createDatabasePool } from '../src/database/connection.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createEventEligibilityService } from '../src/events/event-eligibility.js';
import { createPlayerIdentityService } from '../src/players/player-identity.js';
import { createChallengeAttemptStartService } from '../src/challenges/challenge-attempt-start.js';
import { createChallengeAnswerSubmissionService } from '../src/challenges/challenge-answer-submission.js';
import { createChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-attempt-completion-finalizer.js';
import { createChallengeAttemptFetchService } from '../src/challenges/challenge-attempt-fetch.js';
import { createStarterGrantService } from '../src/cards/starter-grant.js';
import { createCardCollectionService } from '../src/cards/card-collection.js';
import { createDeckService } from '../src/cards/deck-service.js';
import { createCpuMatchService } from '../src/matches/cpu-match-service.js';
import { createAuthorEventService } from '../src/events/author-event-service.js';
import { createAuthorChallengeService } from '../src/challenges/author-challenge-service.js';
import { createAuthorCardService } from '../src/cards/author-card-service.js';
import { createAuthenticatedRateProtection } from '../src/security/rate-protection.js';
import { createMovementEvidenceService } from '../src/events/movement-evidence.js';
import { SPRINT1_E2E_ACCESS_TOKEN } from './sprint1-auth.js';

export const BASIC_E2E_NOW = new Date('2026-08-18T10:00:00.000Z');

const authConfig: AuthConfig = {
  audience: 'https://basic-e2e.invalid/api',
  domain: 'basic-e2e.invalid',
  issuer: 'https://basic-e2e.invalid/',
  jwksUrl: new URL('https://basic-e2e.invalid/.well-known/jwks.json'),
  spaClientId: 'basic-e2e-client',
};

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const runId = process.env.BASIC_E2E_RUN_ID?.trim();
  if (!runId || !/^[0-9a-f-]{36}$/iu.test(runId)) {
    throw new Error(
      'BASIC_E2E_RUN_ID must be supplied by npm run test:e2e:basic.',
    );
  }

  const databaseConfig = buildDatabaseConfig({ target: 'test' });
  const database = createDatabasePool(databaseConfig);
  const subject = `basic-e2e-${runId}`;
  const playerName = `e2e_${runId.replaceAll('-', '').slice(0, 16)}`;
  const clock = () => new Date(BASIC_E2E_NOW);
  const movementEvidenceService = createMovementEvidenceService(database, {
    // Test-only permissive value; production has no default.
    maxPlausibleJourneySpeedMetresPerSecond: 1_000,
  });

  await database.query(
    `
      insert into public.players (
        id, auth_issuer, auth_subject, player_name, role, lifecycle_status
      )
      values ($1::uuid, $2, $3, $4, 'author', 'active')
      on conflict (auth_issuer, auth_subject)
      do update set
        player_name = excluded.player_name,
        role = 'author',
        lifecycle_status = 'active'
    `,
    [randomUUID(), authConfig.issuer, subject, playerName],
  );

  const finalizer = createChallengeAttemptCompletionFinalizer({
    randomInt: () => 0,
    rewardPolicyVersion: 'basic-e2e-v1',
  });

  const app = await buildApp({
    accessTokenVerifier: {
      async verify(token) {
        if (token !== SPRINT1_E2E_ACCESS_TOKEN) {
          throw new Error('The Basic E2E bearer token was rejected.');
        }

        return {
          connectionStrategy: 'auth0',
          issuer: authConfig.issuer,
          playerName,
          subject,
          tokenIssuedAt: new Date(),
        };
      },
    },
    authConfig,
    config: { logLevel: 'silent' },
    corsConfig: { allowedOrigin: 'http://127.0.0.1:5175' },
    playerIdentityService: createPlayerIdentityService(database),
    rateProtection: createAuthenticatedRateProtection({
      maxRequests: 1_000,
      windowMs: 60_000,
    }),
    eventServices: {
      clock,
      discovery: createEventDiscoveryService(database, { clock }),
      eligibility: createEventEligibilityService(database, { clock }),
      movementEvidence: movementEvidenceService,
    },
    challengeAttemptServices: {
      start: createChallengeAttemptStartService(database, {
        clock,
        movementEvidenceService,
        randomIndex: () => 0,
      }),
      answerSubmission: createChallengeAnswerSubmissionService(database, {
        clock,
        finalizer,
      }),
      fetch: createChallengeAttemptFetchService(database, { clock, finalizer }),
    },
    cardServices: {
      starterGrant: createStarterGrantService(database),
      collection: createCardCollectionService(database),
      decks: createDeckService(database),
    },
    cpuMatchService: createCpuMatchService(database, {
      clock: { now: clock },
      randomInt: () => 0,
    }),
    authorContentServices: {
      events: createAuthorEventService(database),
      challenges: createAuthorChallengeService(database),
      cards: createAuthorCardService(database),
    },
  });

  app.addHook('onClose', async () => {
    await database.end();
  });

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };

  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());

  try {
    await app.listen({ host: '127.0.0.1', port: 3002 });
  } catch (error) {
    app.log.fatal(
      { err: error },
      'Basic deterministic E2E API failed to start',
    );
    await app.close();
    process.exitCode = 1;
  }
}

await startServer();
