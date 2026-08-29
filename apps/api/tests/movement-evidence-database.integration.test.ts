import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  createMovementEvidenceService,
  InvalidMovementEvidenceContextError,
  NonMonotonicMovementEvidenceError,
} from '../src/events/movement-evidence.js';
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const PLAYER_ID = '16800000-0000-4000-8000-000000000001';
const DELETION_PLAYER_ID = '16800000-0000-4000-8000-000000000002';
const EVENT_ID = '16810000-0000-4000-8000-000000000001';
const INACTIVE_EVENT_ID = '16810000-0000-4000-8000-000000000002';
const SECOND_ACTIVE_EVENT_ID = '16810000-0000-4000-8000-000000000003';
const ISSUER = 'https://auth.example.test/';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'movement evidence database integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_movement_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(
        '0031_create_movement_evidence.sql',
      );
      expect(migrationResult.applied).toContain(
        '0032_add_movement_eligibility_decisions.sql',
      );
      pool = createDatabasePool(temporaryConfig);

      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values
           ($1, $3, 'auth0|movement-player', 'movement_player', 'player', 'active'),
           ($2, $3, 'auth0|deletion-player', 'deletion_player', 'player', 'active')`,
        [PLAYER_ID, DELETION_PLAYER_ID, ISSUER],
      );
      await pool.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at, is_published,
           authoring_status, publication_provenance
         ) values (
           $1,
           'Movement evidence fixture',
           st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
           75,
           '2026-08-01T00:00:00.000Z',
           '2026-09-30T00:00:00.000Z',
           true,
           'published',
           'controlled_seed'
         ), (
           $2,
           'Inactive movement evidence fixture',
           st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
           75,
           '2026-08-01T00:00:00.000Z',
           '2026-09-30T00:00:00.000Z',
           false,
           'draft',
           null
         ), (
           $3,
           'Second active movement evidence fixture',
           st_setsrid(st_makepoint(28.031, -26.193), 4326)::geography,
           75,
           '2026-08-01T00:00:00.000Z',
           '2026-09-30T00:00:00.000Z',
           true,
           'published',
           'controlled_seed'
         )`,
        [EVENT_ID, INACTIVE_EVENT_ID, SECOND_ACTIVE_EVENT_ID],
      );
    }, 60_000);

    beforeEach(async () => {
      await pool.query('delete from public.movement_evidence');
    });

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (!administrationConfig || !temporaryDatabaseName) {
        return;
      }

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('persists an immutable, expiring sample with authoritative ownership and event context', async () => {
      const service = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000001',
        retentionMs: 3_600_000,
      });

      await service.record(sample());

      const result = await pool.query<{
        accuracy_metres: number;
        acquired_at: Date;
        created_at: Date;
        event_id: string;
        expires_at: Date;
        latitude: number;
        longitude: number;
        player_id: string;
        received_at: Date;
      }>(
        `select player_id::text, event_id::text, latitude, longitude,
                accuracy_metres, acquired_at, received_at, expires_at, created_at
           from public.movement_evidence
          where player_id = $1::uuid`,
        [PLAYER_ID],
      );

      expect(result.rows).toEqual([
        {
          player_id: PLAYER_ID,
          event_id: EVENT_ID,
          latitude: -26.19205,
          longitude: 28.03038,
          accuracy_metres: 10,
          acquired_at: new Date('2026-08-29T09:59:30.000Z'),
          received_at: new Date('2026-08-29T10:00:00.000Z'),
          expires_at: new Date('2026-08-29T11:00:00.000Z'),
          created_at: new Date('2026-08-29T10:00:00.000Z'),
        },
      ]);

      await expect(
        pool.query(
          `update public.movement_evidence
              set latitude = -26
            where player_id = $1::uuid`,
          [PLAYER_ID],
        ),
      ).rejects.toThrow('Movement evidence records are immutable');
    });

    it('reuses an identical physical sample across events and idempotently within one event', async () => {
      const ids = [
        '16820000-0000-4000-8000-000000000002',
        '16820000-0000-4000-8000-000000000003',
        '16820000-0000-4000-8000-000000000004',
      ];
      const service = createMovementEvidenceService(pool, {
        createId: () => {
          const id = ids.shift();
          if (!id) {
            throw new Error(
              'Movement evidence test ID sequence was exhausted.',
            );
          }
          return id;
        },
      });
      await service.record(sample());
      await service.record({ ...sample(), eventId: SECOND_ACTIVE_EVENT_ID });
      await service.record(sample());

      const reused = await pool.query<{
        event_id: string;
      }>(
        `select event_id::text
           from public.movement_evidence
          where player_id = $1::uuid
          order by event_id`,
        [PLAYER_ID],
      );
      expect(reused.rows).toEqual([
        { event_id: EVENT_ID },
        { event_id: SECOND_ACTIVE_EVENT_ID },
      ]);

      await expect(
        service.record({ ...sample(), latitude: -26.2 }),
      ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);
      await expect(
        service.record({ ...sample(), accuracyMetres: 11 }),
      ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);
      await expect(
        service.record({
          ...sample(),
          acquiredAt: new Date('2026-08-29T09:59:29.000Z'),
        }),
      ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);

      await expect(
        service.record({
          ...sample(),
          acquiredAt: new Date('2026-08-29T09:59:31.000Z'),
        }),
      ).resolves.toBeUndefined();

      const finalCount = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from public.movement_evidence
          where player_id = $1::uuid`,
        [PLAYER_ID],
      );
      expect(finalCount.rows[0]?.count).toBe('3');
    }, 30_000);

    it('rejects inactive or unknown ownership contexts', async () => {
      const service = createMovementEvidenceService(pool);

      await expect(
        service.record({
          ...sample(),
          playerId: '16800000-0000-4000-8000-000000000099',
        }),
      ).rejects.toBeInstanceOf(InvalidMovementEvidenceContextError);
      await expect(
        service.record({
          ...sample(),
          eventId: '16810000-0000-4000-8000-000000000099',
        }),
      ).rejects.toBeInstanceOf(InvalidMovementEvidenceContextError);

      await expect(
        service.record({
          ...sample(),
          eventId: INACTIVE_EVENT_ID,
        }),
      ).rejects.toBeInstanceOf(InvalidMovementEvidenceContextError);
    });

    it('serializes concurrent identical same-event retries without duplication', async () => {
      const first = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000010',
      });
      const second = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000011',
      });

      await expect(
        Promise.all([first.record(sample()), second.record(sample())]),
      ).resolves.toEqual([undefined, undefined]);

      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from public.movement_evidence
          where player_id = $1::uuid
            and event_id = $2::uuid
            and acquired_at = $3::timestamptz`,
        [PLAYER_ID, EVENT_ID, sample().acquiredAt],
      );
      expect(result.rows[0]?.count).toBe('1');
    });

    it('serializes concurrent identical cross-event reuse deterministically', async () => {
      const first = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000012',
      });
      const second = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000013',
      });

      await expect(
        Promise.all([
          first.record(sample()),
          second.record({ ...sample(), eventId: SECOND_ACTIVE_EVENT_ID }),
        ]),
      ).resolves.toEqual([undefined, undefined]);

      const result = await pool.query<{ event_id: string }>(
        `select event_id::text
           from public.movement_evidence
          where player_id = $1::uuid
            and acquired_at = $2::timestamptz
          order by event_id`,
        [PLAYER_ID, sample().acquiredAt],
      );
      expect(result.rows).toEqual([
        { event_id: EVENT_ID },
        { event_id: SECOND_ACTIVE_EVENT_ID },
      ]);
    });

    it('rejects a duplicate player, event, and acquisition context at the database boundary', async () => {
      await insertSample({
        id: '16820000-0000-4000-8000-000000000014',
        acquiredAt: '2026-08-29T09:59:30.000Z',
        expiresAt: '2026-08-30T10:00:00.000Z',
        receivedAt: '2026-08-29T10:00:00.000Z',
      });

      await expect(
        insertSample({
          id: '16820000-0000-4000-8000-000000000015',
          acquiredAt: '2026-08-29T09:59:30.000Z',
          expiresAt: '2026-08-30T10:00:01.000Z',
          receivedAt: '2026-08-29T10:00:01.000Z',
        }),
      ).rejects.toThrow();
    });

    it('rejects equal-timestamp concurrent inconsistent physical samples', async () => {
      const first = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000016',
      });
      const second = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000017',
      });

      const results = await Promise.allSettled([
        first.record(sample()),
        second.record({ ...sample(), longitude: 28.04 }),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        reason: expect.any(NonMonotonicMovementEvidenceError),
        status: 'rejected',
      });
    });

    it('preserves global ordering after cross-event reuse', async () => {
      const service = createMovementEvidenceService(pool);
      await service.record(sample());
      await service.record({ ...sample(), eventId: SECOND_ACTIVE_EVENT_ID });

      await expect(
        service.record({
          ...sample(),
          eventId: SECOND_ACTIVE_EVENT_ID,
          acquiredAt: new Date('2026-08-29T09:59:29.000Z'),
        }),
      ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);
    });

    it.each([
      ['latitude', '91'],
      ['longitude', '-181'],
      ['accuracy_metres', "'Infinity'::double precision"],
      ['acquired_at', "'-infinity'::timestamptz"],
      ['acquired_at', "'2026-08-29T10:00:01.000Z'::timestamptz"],
      ['expires_at', "'2026-08-29T10:00:00.000Z'::timestamptz"],
    ])('enforces the %s database constraint', async (field, invalidValue) => {
      const values: Record<string, string> = {
        latitude: '-26.19205',
        longitude: '28.03038',
        accuracy_metres: '10',
        acquired_at: "'2026-08-29T09:59:30.000Z'::timestamptz",
        received_at: "'2026-08-29T10:00:00.000Z'::timestamptz",
        expires_at: "'2026-08-30T10:00:00.000Z'::timestamptz",
      };
      values[field] = invalidValue;

      await expect(
        pool.query(
          `insert into public.movement_evidence (
             id, player_id, event_id, latitude, longitude, accuracy_metres,
             acquired_at, received_at, expires_at, created_at
           ) values (
             gen_random_uuid(), $1, $2, ${values.latitude}, ${values.longitude},
             ${values.accuracy_metres}, ${values.acquired_at},
             ${values.received_at}, ${values.expires_at},
             ${values.received_at}
           )`,
          [PLAYER_ID, EVENT_ID],
        ),
      ).rejects.toThrow();
    });

    it('removes expired samples idempotently and preserves unexpired evidence', async () => {
      await insertSample({
        id: '16820000-0000-4000-8000-000000000003',
        acquiredAt: '2026-08-29T08:59:30.000Z',
        expiresAt: '2026-08-29T10:00:00.000Z',
        receivedAt: '2026-08-29T09:00:00.000Z',
      });
      await insertSample({
        id: '16820000-0000-4000-8000-000000000004',
        acquiredAt: '2026-08-29T09:59:30.000Z',
        expiresAt: '2026-08-30T10:00:00.000Z',
        receivedAt: '2026-08-29T10:00:00.000Z',
      });
      const service = createMovementEvidenceService(pool);
      const cutoff = new Date('2026-08-29T10:00:00.000Z');

      await expect(service.purgeExpired(cutoff)).resolves.toBe(1);
      await expect(service.purgeExpired(cutoff)).resolves.toBe(0);

      const remaining = await pool.query<{ id: string }>(
        'select id::text from public.movement_evidence order by id',
      );
      expect(remaining.rows).toEqual([
        { id: '16820000-0000-4000-8000-000000000004' },
      ]);
    });

    it('deletes precise evidence transactionally when account deletion starts', async () => {
      const evidenceService = createMovementEvidenceService(pool, {
        createId: () => '16820000-0000-4000-8000-000000000005',
        createDecisionId: () => '16850000-0000-4000-8000-000000000005',
        maxPlausibleJourneySpeedMetresPerSecond: 10,
      });
      await evidenceService.evaluateJourney(
        {
          ...sample(),
          playerId: DELETION_PLAYER_ID,
        },
        'reachable',
      );
      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-29T10:01:00.000Z'),
        createId: () => '16830000-0000-4000-8000-000000000001',
      });

      await lifecycle.request({
        issuer: ISSUER,
        subject: 'auth0|deletion-player',
      });

      const remaining = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from public.movement_evidence
          where player_id = $1::uuid`,
        [DELETION_PLAYER_ID],
      );
      expect(remaining.rows[0]?.count).toBe('0');

      const remainingDecisions = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from public.movement_eligibility_decisions
          where movement_evidence_id = $1::uuid`,
        ['16820000-0000-4000-8000-000000000005'],
      );
      expect(remainingDecisions.rows[0]?.count).toBe('0');
    });

    it('audits plausible and impossible journeys without trusting a rejected sample', async () => {
      const evidenceIds = [
        '16840000-0000-4000-8000-000000000001',
        '16840000-0000-4000-8000-000000000002',
        '16840000-0000-4000-8000-000000000003',
      ];
      const decisionIds = [
        '16850000-0000-4000-8000-000000000001',
        '16850000-0000-4000-8000-000000000002',
        '16850000-0000-4000-8000-000000000003',
      ];
      const service = createMovementEvidenceService(pool, {
        createId: () => requiredNextId(evidenceIds),
        createDecisionId: () => requiredNextId(decisionIds),
        maxPlausibleJourneySpeedMetresPerSecond: 10,
      });

      await expect(
        service.evaluateJourney(
          journeySample({
            acquiredAt: '2026-08-29T10:00:00.000Z',
            accuracyMetres: 0,
            receivedAt: '2026-08-29T10:00:00.000Z',
          }),
          'reachable',
        ),
      ).resolves.toEqual({ outcome: 'baseline' });

      await expect(
        service.evaluateJourney(
          journeySample({
            acquiredAt: '2026-08-29T10:00:01.000Z',
            accuracyMetres: 0,
            eventId: SECOND_ACTIVE_EVENT_ID,
            latitude: -26.193,
            longitude: 28.031,
            receivedAt: '2026-08-29T10:00:01.000Z',
          }),
          'reachable',
        ),
      ).resolves.toEqual({ outcome: 'too_fast' });

      await expect(
        service.evaluateJourney(
          journeySample({
            acquiredAt: '2026-08-29T10:00:30.000Z',
            accuracyMetres: 0,
            eventId: SECOND_ACTIVE_EVENT_ID,
            latitude: -26.193,
            longitude: 28.031,
            receivedAt: '2026-08-29T10:00:30.000Z',
          }),
          'reachable',
        ),
      ).resolves.toEqual({ outcome: 'plausible' });

      const decisions = await pool.query<{
        evidence_id: string;
        journey_outcome: string;
        prior_evidence_id: string | null;
      }>(
        `select evidence.id::text as evidence_id,
                decision.prior_movement_evidence_id::text as prior_evidence_id,
                decision.journey_outcome
           from public.movement_eligibility_decisions decision
           join public.movement_evidence evidence
             on evidence.id = decision.movement_evidence_id
          order by evidence.received_at`,
      );

      expect(decisions.rows).toEqual([
        {
          evidence_id: '16840000-0000-4000-8000-000000000001',
          prior_evidence_id: null,
          journey_outcome: 'baseline',
        },
        {
          evidence_id: '16840000-0000-4000-8000-000000000002',
          prior_evidence_id: '16840000-0000-4000-8000-000000000001',
          journey_outcome: 'too_fast',
        },
        {
          evidence_id: '16840000-0000-4000-8000-000000000003',
          prior_evidence_id: '16840000-0000-4000-8000-000000000001',
          journey_outcome: 'plausible',
        },
      ]);

      await expect(
        pool.query(
          `update public.movement_eligibility_decisions
              set journey_outcome = 'baseline'
            where id = $1::uuid`,
          ['16850000-0000-4000-8000-000000000002'],
        ),
      ).rejects.toThrow('Movement eligibility decisions are immutable');
    });

    it('ignores expired accepted anchors even before the cleanup sweep runs', async () => {
      const evidenceIds = [
        '16840000-0000-4000-8000-000000000011',
        '16840000-0000-4000-8000-000000000012',
      ];
      const decisionIds = [
        '16850000-0000-4000-8000-000000000011',
        '16850000-0000-4000-8000-000000000012',
      ];
      const service = createMovementEvidenceService(pool, {
        createId: () => requiredNextId(evidenceIds),
        createDecisionId: () => requiredNextId(decisionIds),
        maxPlausibleJourneySpeedMetresPerSecond: 10,
        retentionMs: 1_000,
      });

      await service.evaluateJourney(
        journeySample({
          acquiredAt: '2026-08-29T10:00:00.000Z',
          receivedAt: '2026-08-29T10:00:00.000Z',
        }),
        'reachable',
      );

      await expect(
        service.evaluateJourney(
          journeySample({
            acquiredAt: '2026-08-29T10:00:02.000Z',
            eventId: SECOND_ACTIVE_EVENT_ID,
            latitude: -26.193,
            longitude: 28.031,
            receivedAt: '2026-08-29T10:00:02.000Z',
          }),
          'reachable',
        ),
      ).resolves.toEqual({ outcome: 'baseline' });
    });

    it('serializes near-simultaneous impossible attempts idempotently', async () => {
      const baseline = createMovementEvidenceService(pool, {
        createId: () => '16840000-0000-4000-8000-000000000021',
        createDecisionId: () => '16850000-0000-4000-8000-000000000021',
        maxPlausibleJourneySpeedMetresPerSecond: 10,
      });
      await baseline.evaluateJourney(
        journeySample({
          acquiredAt: '2026-08-29T10:00:00.000Z',
          accuracyMetres: 0,
          receivedAt: '2026-08-29T10:00:00.000Z',
        }),
        'reachable',
      );

      const first = createMovementEvidenceService(pool, {
        createId: () => '16840000-0000-4000-8000-000000000022',
        createDecisionId: () => '16850000-0000-4000-8000-000000000022',
        maxPlausibleJourneySpeedMetresPerSecond: 10,
      });
      const second = createMovementEvidenceService(pool, {
        createId: () => '16840000-0000-4000-8000-000000000023',
        createDecisionId: () => '16850000-0000-4000-8000-000000000023',
        maxPlausibleJourneySpeedMetresPerSecond: 10,
      });
      const impossible = journeySample({
        acquiredAt: '2026-08-29T10:00:01.000Z',
        accuracyMetres: 0,
        eventId: SECOND_ACTIVE_EVENT_ID,
        latitude: -26.193,
        longitude: 28.031,
        receivedAt: '2026-08-29T10:00:01.000Z',
      });

      await expect(
        Promise.all([
          first.evaluateJourney(impossible, 'reachable'),
          second.evaluateJourney(impossible, 'reachable'),
        ]),
      ).resolves.toEqual([{ outcome: 'too_fast' }, { outcome: 'too_fast' }]);

      const counts = await pool.query<{
        decision_count: string;
        evidence_count: string;
      }>(
        `select
           (select count(*)::text
              from public.movement_evidence
             where event_id = $1::uuid) as evidence_count,
           (select count(*)::text
              from public.movement_eligibility_decisions decision
              join public.movement_evidence evidence
                on evidence.id = decision.movement_evidence_id
             where evidence.event_id = $1::uuid) as decision_count`,
        [SECOND_ACTIVE_EVENT_ID],
      );
      expect(counts.rows[0]).toEqual({
        evidence_count: '1',
        decision_count: '1',
      });
    }, 30_000);

    async function insertSample(input: {
      id: string;
      playerId?: string;
      acquiredAt: string;
      receivedAt: string;
      expiresAt: string;
    }): Promise<void> {
      await pool.query(
        `insert into public.movement_evidence (
           id, player_id, event_id, latitude, longitude, accuracy_metres,
           acquired_at, received_at, expires_at, created_at
         ) values ($1, $2, $3, -26.19205, 28.03038, 10, $4, $5, $6, $5)`,
        [
          input.id,
          input.playerId ?? PLAYER_ID,
          EVENT_ID,
          input.acquiredAt,
          input.receivedAt,
          input.expiresAt,
        ],
      );
    }
  },
);

function sample() {
  return {
    playerId: PLAYER_ID,
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: new Date('2026-08-29T09:59:30.000Z'),
    receivedAt: new Date('2026-08-29T10:00:00.000Z'),
  };
}

function journeySample({
  acquiredAt,
  accuracyMetres = 10,
  eventId = EVENT_ID,
  latitude = -26.19205,
  longitude = 28.03038,
  receivedAt,
}: {
  acquiredAt: string;
  accuracyMetres?: number;
  eventId?: string;
  latitude?: number;
  longitude?: number;
  receivedAt: string;
}) {
  return {
    playerId: PLAYER_ID,
    eventId,
    latitude,
    longitude,
    accuracyMetres,
    acquiredAt: new Date(acquiredAt),
    receivedAt: new Date(receivedAt),
  };
}

function requiredNextId(ids: string[]): string {
  const id = ids.shift();
  if (!id) {
    throw new Error('Movement journey test ID sequence was exhausted.');
  }
  return id;
}
