import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { runSeeds } from '../src/database/seeds.js';
import { createOfflineChallengeService } from '../src/challenges/offline-challenges.js';
import { createChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-attempt-completion-finalizer.js';
import type { OfflineSubmission } from '../src/challenges/offline-policy.js';
import { createMovementEvidenceService } from '../src/events/movement-evidence.js';
import { createTrustService } from '../src/trust/trust-service.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'offline database integration',
  () => {
    let admin: DatabaseConfig;
    let pool: ReturnType<typeof createDatabasePool>;
    const databaseName = `wits_offline_${Date.now()}_${process.pid}`;
    let created = false;
    beforeAll(async () => {
      loadApiEnvironment();
      admin = buildDatabaseConfig({ target: 'test' });
      await withDatabaseClient(admin, async (client) => {
        await client.query(`create database ${databaseName}`);
        created = true;
      });
      const url = new URL(admin.connectionString);
      url.pathname = `/${databaseName}`;
      const config = { ...admin, connectionString: url.toString() };
      await runMigrations(config);
      await runSeeds(config);
      pool = createDatabasePool(config);
    }, 60000);
    afterAll(async () => {
      if (pool) await pool.end();
      if (created)
        await withDatabaseClient(admin, async (client) => {
          await client.query(`drop database ${databaseName} with (force)`);
        });
    }, 30000);

    for (const format of ['multiple_choice', 'ordering'] as const) {
      it(`creates no pack rows and atomically syncs ${format} once after event expiry`, async () => {
        const playerId = randomUUID(),
          eventId = randomUUID(),
          challengeId = randomUUID();
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(
            `insert into public.players (id,auth_issuer,auth_subject,role,lifecycle_status)
          values ($1,'https://auth.example.test/',$2,'player','active')`,
            [playerId, `auth0|${playerId}`],
          );
          await client.query(
            `insert into public.events (id,title,location,radius_metres,starts_at,ends_at,is_published,authoring_status,publication_provenance)
          values ($1,'Offline test',st_setsrid(st_makepoint(28,-26),4326)::geography,75,'2026-09-06T09:00:00Z','2026-09-06T11:00:00Z',true,'published','controlled_seed')`,
            [eventId],
          );
          await client.query(
            `insert into public.event_challenges (id,event_id,format,status) values ($1,$2,$3,'draft')`,
            [challengeId, eventId, format],
          );
          for (let q = 0; q < 6; q++) {
            const id = randomUUID();
            await client.query(
              `insert into public.challenge_questions (id,challenge_id,prompt,difficulty,status,explanation)
            values ($1,$2,'Offline question',1,'draft','Private explanation')`,
              [id, challengeId],
            );
            for (let n = 0; n < 4; n++) {
              const optionId = randomUUID();
              if (format === 'ordering') {
                await client.query(
                  'insert into public.challenge_ordering_items (id,question_id,item_text) values ($1,$2,$3)',
                  [optionId, id, String(n)],
                );
                await client.query(
                  'insert into private.challenge_ordering_answer_keys (question_id,item_id,correct_position) values ($1,$2,$3)',
                  [id, optionId, n + 1],
                );
              } else {
                await client.query(
                  'insert into public.challenge_choices (id,question_id,authoring_position,choice_text) values ($1,$2,$3,$4)',
                  [optionId, id, n + 1, String(n)],
                );
                if (n === 0)
                  await client.query(
                    'insert into private.challenge_answer_keys (question_id,accepted_choice_id) values ($1,$2)',
                    [id, optionId],
                  );
              }
            }
          }
          await client.query(
            `update public.challenge_questions set status='published',version=version+1,publication_provenance='controlled_seed' where challenge_id=$1`,
            [challengeId],
          );
          await client.query(
            `update public.event_challenges set status='published',version=version+1,publication_provenance='controlled_seed' where id=$1`,
            [challengeId],
          );
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
        let now = new Date('2026-09-06T10:00:00Z');
        const service = createOfflineChallengeService(pool, {
          signingKey: 'test-only-offline-key-at-least-32-bytes',
          maxSpeed: 20,
          retentionMs: 86400_000,
          clock: () => now,
          finalizer: createChallengeAttemptCompletionFinalizer({
            randomInt: () => 0,
          }),
          trustService: createTrustService(pool),
        });
        const prepared = await service.packs(playerId, [eventId]);
        expect(prepared).toHaveLength(1);
        expect(JSON.stringify(prepared)).not.toContain('Private explanation');
        expect(
          (
            await pool.query(
              'select id from public.challenge_attempts where player_id=$1',
              [playerId],
            )
          ).rows,
        ).toHaveLength(0);
        const { pack, packToken } = prepared[0]!;
        // Correct answers exercise marking, card issuance and replay together.
        const input: OfflineSubmission = {
          clientAttemptId: randomUUID(),
          packToken,
          startedAt: '2026-09-06T10:01:00Z',
          finishedAt: '2026-09-06T10:02:00Z',
          startLocation: {
            latitude: -26,
            longitude: 28,
            accuracyMetres: 150,
            acquiredAt: '2026-09-06T10:01:00Z',
          },
          finishLocation: {
            latitude: -26,
            longitude: 28,
            accuracyMetres: 150,
            acquiredAt: '2026-09-06T10:02:00Z',
          },
          answers: pack.questions.map((question, index) => ({
            questionId: question.id,
            answeredAt: new Date(
              Date.parse('2026-09-06T10:01:10Z') + index * 10000,
            ).toISOString(),
            optionIds:
              format === 'ordering'
                ? [...question.options]
                    .sort((a, b) => a.text.localeCompare(b.text))
                    .map((option) => option.id)
                : [question.options.find((option) => option.text === '0')!.id],
          })),
        };
        now = new Date('2026-09-06T12:00:00Z');
        for (const sample of ['startLocation'] as const) {
          await expect(
            service.submit(playerId, {
              ...input,
              clientAttemptId: randomUUID(),
              [sample]: { ...input[sample], accuracyMetres: 150.01 },
            }),
          ).rejects.toMatchObject({ code: 'OFFLINE_LOCATION_UNVERIFIABLE' });
        }
        // The signed arrival policy permits indoor completion without finishing GPS.
        delete input.finishLocation;

        // Rejected GPS observations on either side of the offline start must
        // not become trusted movement anchors.
        for (const acquiredAt of [
          '2026-09-06T10:00:59Z',
          '2026-09-06T10:01:01Z',
        ]) {
          const evidenceId = randomUUID();
          await pool.query(
            `insert into public.movement_evidence
            (id,player_id,event_id,latitude,longitude,accuracy_metres,acquired_at,received_at,expires_at,created_at)
            values ($1,$2,$3,0,28,10,$4,$4,'2026-09-07T12:00:00Z',$4)`,
            [evidenceId, playerId, eventId, acquiredAt],
          );
          await pool.query(
            `insert into public.movement_eligibility_decisions
            (id,movement_evidence_id,reachability_status,journey_outcome,max_plausible_speed_metres_per_second,created_at)
            values ($1,$2,'unreachable','not_evaluated',20,$3)`,
            [randomUUID(), evidenceId, acquiredAt],
          );
        }
        await expect(
          service.submit(playerId, {
            ...input,
            startLocation: { ...input.startLocation, latitude: 0 },
          }),
        ).rejects.toMatchObject({ code: 'OFFLINE_UNREACHABLE' });
        expect(
          (
            await pool.query(
              'select id from public.challenge_attempts where player_id=$1',
              [playerId],
            )
          ).rows,
        ).toHaveLength(0);
        // A newer observation collected on reconnect must not invalidate an
        // otherwise plausible historical visit.
        await pool.query(
          `insert into public.movement_evidence
          (id,player_id,event_id,latitude,longitude,accuracy_metres,acquired_at,received_at,expires_at,created_at)
          values ($1,$2,$3,-26,28,10,$4,$4,$5,$4)`,
          [
            randomUUID(),
            playerId,
            eventId,
            now,
            new Date(now.getTime() + 86400000),
          ],
        );
        if (format === 'multiple_choice') {
          const authorId = randomUUID();
          await pool.query(
            `insert into public.players (id,auth_issuer,auth_subject,role,lifecycle_status)
            values ($1,'https://auth.example.test/',$2,'author','active')`,
            [authorId, `auth0|${authorId}`],
          );
          const question = pack.questions[0]!;
          await pool.query(
            "update public.challenge_questions set status='retired',version=version+1 where id=$1",
            [question.id],
          );
          await pool.query(
            `insert into public.author_content_audit
            (actor_player_id,entity_type,entity_id,action,from_status,to_status,resulting_version,occurred_at)
            values ($1,'question',$2,'retire','published','retired',$3,'2026-09-06T10:03:00Z')`,
            [authorId, question.id, question.version + 1],
          );
          const historical = await pool.query(
            `select
            public.offline_content_was_available('question',$1,'retired',$2,$3,'2026-09-06T10:02:00Z') as before,
            public.offline_content_was_available('question',$1,'retired',$2,$3,'2026-09-06T10:04:00Z') as after`,
            [question.id, question.version + 1, question.version],
          );
          expect(historical.rows[0]).toEqual({ before: true, after: false });
        }
        const results = await Promise.all([
          service.submit(playerId, input),
          service.submit(playerId, input),
        ]);
        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results[0]!.attempt).toMatchObject({
          status: 'completed',
          scoreCorrect: 5,
        });
        expect(results[0]!.attempt?.attemptId).toBe(
          results[1]!.attempt?.attemptId,
        );
        expect(
          (
            await pool.query(
              'select id from public.event_completions where player_id=$1',
              [playerId],
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await pool.query(
              "select id from public.player_cards where player_id=$1 and acquisition_kind='event_reward'",
              [playerId],
            )
          ).rows,
        ).toHaveLength(2);
        await expect(
          service.submit(playerId, { ...input, clientAttemptId: randomUUID() }),
        ).rejects.toMatchObject({ code: 'OFFLINE_ATTEMPT_CONFLICT' });

        const conflictingReplay = {
          ...input,
          finishedAt: new Date(
            Date.parse(input.finishedAt) + 1000,
          ).toISOString(),
        };
        await expect(
          service.submit(playerId, conflictingReplay),
        ).rejects.toMatchObject({ code: 'OFFLINE_ATTEMPT_CONFLICT' });
        await expect(
          service.submit(playerId, conflictingReplay),
        ).rejects.toMatchObject({ code: 'OFFLINE_ATTEMPT_CONFLICT' });
        const conflictSignals = await pool.query<{ count: number }>(
          `select count(*)::integer as count
             from private.trust_signals
            where player_id = $1::uuid
              and signal_type = 'idempotency_payload_conflict'`,
          [playerId],
        );
        expect(conflictSignals.rows[0]?.count).toBe(1);

        await expect(service.submit(randomUUID(), input)).rejects.toMatchObject(
          { code: 'OFFLINE_INVALID_PACK' },
        );
      }, 90000);
    }
    it('uses observation chronology and elapsed time when online play resumes after offline sync', async () => {
      const playerId = randomUUID(),
        eventA = randomUUID(),
        eventB = randomUUID();
      await pool.query(
        `insert into public.players (id,auth_issuer,auth_subject,role,lifecycle_status)
        values ($1,'https://auth.example.test/',$2,'player','active')`,
        [playerId, `auth0|${playerId}`],
      );
      for (const eventId of [eventA, eventB])
        await pool.query(
          `insert into public.events
        (id,title,location,radius_metres,starts_at,ends_at,is_published,authoring_status,publication_provenance)
        values ($1,'Movement regression',st_setsrid(st_makepoint(28,-26),4326)::geography,75,'2026-09-06T09:00:00Z','2026-09-07T12:00:00Z',true,'published','controlled_seed')`,
          [eventId],
        );
      const offlineId = randomUUID();
      await pool.query(
        `insert into public.movement_evidence
        (id,player_id,event_id,latitude,longitude,accuracy_metres,acquired_at,received_at,expires_at,created_at,evidence_origin,offline_pack_id)
        values ($1,$2,$3,-26,28,10,'2026-09-06T10:01:00Z','2026-09-06T12:00:00Z','2026-09-07T12:00:00Z','2026-09-06T12:00:00Z','offline',$4)`,
        [offlineId, playerId, eventA, randomUUID()],
      );
      await pool.query(
        `insert into public.movement_eligibility_decisions
        (id,movement_evidence_id,reachability_status,journey_outcome,max_plausible_speed_metres_per_second,created_at,time_basis)
        values ($1,$2,'reachable','baseline',20,'2026-09-06T12:00:00Z','validated_offline_claim')`,
        [randomUUID(), offlineId],
      );
      const movement = createMovementEvidenceService(pool, {
        maxPlausibleJourneySpeedMetresPerSecond: 20,
      });
      const input = {
        playerId,
        eventId: eventB,
        latitude: -26,
        longitude: 28.005,
        accuracyMetres: 10,
        acquiredAt: new Date('2026-09-06T12:00:01Z'),
        receivedAt: new Date('2026-09-06T12:00:01Z'),
      };
      expect(await movement.evaluateJourney(input, 'reachable')).toEqual({
        outcome: 'plausible',
      });
      const decision = await pool.query(
        `select time_basis,elapsed_milliseconds from public.movement_eligibility_decisions
        where prior_movement_evidence_id=$1`,
        [offlineId],
      );
      expect(decision.rows[0]).toMatchObject({
        time_basis: 'validated_offline_claim',
        elapsed_milliseconds: '7141000',
      });
      // A later sync of an older observation must not displace the newer B anchor.
      const olderId = randomUUID();
      await pool.query(
        `insert into public.movement_evidence
        (id,player_id,event_id,latitude,longitude,accuracy_metres,acquired_at,received_at,expires_at,created_at,evidence_origin,offline_pack_id)
        values ($1,$2,$3,-26,28,10,'2026-09-06T10:02:00Z','2026-09-06T12:00:02Z','2026-09-07T12:00:00Z','2026-09-06T12:00:02Z','offline',$4)`,
        [olderId, playerId, eventA, randomUUID()],
      );
      await pool.query(
        `insert into public.movement_eligibility_decisions
        (id,movement_evidence_id,reachability_status,journey_outcome,max_plausible_speed_metres_per_second,created_at,time_basis)
        values ($1,$2,'reachable','baseline',20,'2026-09-06T12:00:02Z','validated_offline_claim')`,
        [randomUUID(), olderId],
      );
      expect(
        await movement.evaluateJourney(
          {
            ...input,
            acquiredAt: new Date('2026-09-06T12:00:03Z'),
            receivedAt: new Date('2026-09-06T12:00:03Z'),
          },
          'reachable',
        ),
      ).toEqual({ outcome: 'same_event' });
    }, 60000);
  },
);
