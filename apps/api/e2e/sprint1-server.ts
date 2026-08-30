import { buildApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
} from '../src/config/database.js';
import { createDatabasePool } from '../src/database/connection.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createEventEligibilityService } from '../src/events/event-eligibility.js';
import { createMovementEvidenceService } from '../src/events/movement-evidence.js';
import { createPlayerIdentityService } from '../src/players/player-identity.js';
import { createSprint1E2eAccessTokenVerifier } from './sprint1-auth.js';

export const SPRINT1_E2E_NOW = new Date('2026-08-18T10:00:00.000Z');

const authConfig: AuthConfig = {
  audience: 'https://sprint1-e2e.invalid/api',
  domain: 'sprint1-e2e.invalid',
  issuer: 'https://sprint1-e2e.invalid/',
  jwksUrl: new URL('https://sprint1-e2e.invalid/.well-known/jwks.json'),
  spaClientId: 'sprint1-e2e-client',
};

async function startServer(): Promise<void> {
  loadApiEnvironment();

  const databaseConfig = buildDatabaseConfig({ target: 'test' });
  const database = createDatabasePool(databaseConfig);
  const clock = () => new Date(SPRINT1_E2E_NOW);
  const playerIdentityService = createPlayerIdentityService(database);
  const movementEvidenceService = createMovementEvidenceService(database, {
    // Historical deterministic runner only; production has no default.
    maxPlausibleJourneySpeedMetresPerSecond: 1_000,
  });

  const app = await buildApp({
    accessTokenVerifier: createSprint1E2eAccessTokenVerifier(),
    authConfig,
    config: { logLevel: 'info' },
    corsConfig: { allowedOrigin: 'http://127.0.0.1:5174' },
    eventServices: {
      clock,
      discovery: createEventDiscoveryService(database, { clock }),
      eligibility: createEventEligibilityService(database, { clock }),
      movementEvidence: movementEvidenceService,
    },
    playerIdentityService,
    playerNameSetupService: playerIdentityService,
  });

  app.addHook('onClose', async () => {
    await database.end();
  });

  let closing = false;
  const close = async () => {
    if (closing) {
      return;
    }

    closing = true;
    await app.close();
  };

  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());

  try {
    await app.listen({ host: '127.0.0.1', port: 3001 });
  } catch (error) {
    app.log.fatal(
      { err: error },
      'Sprint 1 deterministic E2E API failed to start',
    );
    await app.close();
    process.exitCode = 1;
  }
}

await startServer();
