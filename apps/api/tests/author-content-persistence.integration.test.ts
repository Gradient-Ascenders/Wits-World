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
import { createAuthorContentReadService } from '../src/authoring/content-read-service.js';

const AUTHOR_ID = 'a7700000-0000-4000-8000-000000000001';
const PLAYER_ID = 'a7700000-0000-4000-8000-000000000002';

const EVENT_ID = 'a7710000-0000-4000-8000-000000000001';
const CHALLENGE_ID = 'a7720000-0000-4000-8000-000000000001';
const QUESTION_ID = 'a7730000-0000-4000-8000-000000000001';
const TOMBSTONE_EVENT_ID = 'a7710000-0000-4000-8000-000000000002';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'author content persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();

      administrationConfig = buildDatabaseConfig({
        target: 'test',
      });

      temporaryDatabaseName = `wits_quest_author_content_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;

      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      await runMigrations(temporaryConfig);

      pool = createDatabasePool(temporaryConfig);

      await seedContentFoundation();
    }, 45_000);

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

    it('stores an explanation for an authored question', async () => {
      await pool.query(
        `
          update public.challenge_questions
          set explanation = $2,
              version = version + 1,
              updated_at = now()
          where id = $1::uuid
        `,
        [QUESTION_ID, 'The Great Hall is on East Campus.'],
      );

      const result = await pool.query<{
        explanation: string | null;
      }>(
        `
          select explanation
          from public.challenge_questions
          where id = $1::uuid
        `,
        [QUESTION_ID],
      );

      expect(result.rows[0]?.explanation).toBe(
        'The Great Hall is on East Campus.',
      );
    });

    it('rejects a blank question explanation', async () => {
      await expect(
        pool.query(
          `
            update public.challenge_questions
            set explanation = '   '
            where id = $1::uuid
          `,
          [QUESTION_ID],
        ),
      ).rejects.toThrow();
    });

    it('records the acting active Author and timestamp', async () => {
      const result = await pool.query<{
        action: string;
        actor_player_id: string;
        entity_id: string;
        entity_type: string;
        occurred_at: Date;
      }>(
        `
          insert into public.author_content_audit (
            actor_player_id,
            entity_type,
            entity_id,
            action
          )
          values ($1::uuid, 'event', $2::uuid, 'edit')
          returning
            actor_player_id::text,
            entity_type,
            entity_id::text,
            action,
            occurred_at
        `,
        [AUTHOR_ID, EVENT_ID],
      );

      expect(result.rows[0]).toMatchObject({
        actor_player_id: AUTHOR_ID,
        entity_type: 'event',
        entity_id: EVENT_ID,
        action: 'edit',
        occurred_at: expect.any(Date),
      });
    });

    it('rejects a Player as an audit actor', async () => {
      await expect(
        pool.query(
          `
            insert into public.author_content_audit (
              actor_player_id,
              entity_type,
              entity_id,
              action
            )
            values ($1::uuid, 'event', $2::uuid, 'edit')
          `,
          [PLAYER_ID, EVENT_ID],
        ),
      ).rejects.toThrow();
    });

    it('rejects an inactive Author as an audit actor', async () => {
      const deletionRequestId = 'a7750000-0000-4000-8000-000000000001';

      await pool.query(
        `
            insert into public.account_deletion_requests (
                id,
                requested_at,
                status
            )
            values ($1::uuid, now(), 'pending')
            `,
        [deletionRequestId],
      );

      await pool.query(
        `
            update public.players
            set lifecycle_status = 'deletion_pending',
                deletion_request_id = $2::uuid,
                updated_at = now()
            where id = $1::uuid
            `,
        [AUTHOR_ID, deletionRequestId],
      );

      try {
        await expect(
          pool.query(
            `
                insert into public.author_content_audit (
                    actor_player_id,
                    entity_type,
                    entity_id,
                    action
                )
                values ($1::uuid, 'question', $2::uuid, 'edit')
                `,
            [AUTHOR_ID, QUESTION_ID],
          ),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          `
                update public.players
                set lifecycle_status = 'active',
                    deletion_request_id = null,
                    updated_at = now()
                where id = $1::uuid
            `,
          [AUTHOR_ID],
        );

        await pool.query(
          `
                delete from public.account_deletion_requests
                where id = $1::uuid
            `,
          [deletionRequestId],
        );
      }
    });

    it('preserves safe queue and history labels after the submitting Author is deleted', async () => {
      await pool.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at
         ) values (
           $1::uuid,
           'Deleted Author review event',
           st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
           75,
           '2026-09-02T08:00:00Z',
           '2026-09-02T12:00:00Z'
         )`,
        [TOMBSTONE_EVENT_ID],
      );
      await pool.query('begin');
      try {
        await pool.query(
          `update public.events
              set authoring_status = 'in_review',
                  version = version + 1,
                  submitted_by_player_id = $2::uuid,
                  submitted_at = now(),
                  updated_at = now()
            where id = $1::uuid`,
          [TOMBSTONE_EVENT_ID, AUTHOR_ID],
        );
        await pool.query(
          `insert into public.author_content_audit (
             actor_player_id, entity_type, entity_id, action,
             from_status, to_status, resulting_version
           ) values ($1::uuid, 'event', $2::uuid, 'submit', 'draft', 'in_review', 1)`,
          [AUTHOR_ID, TOMBSTONE_EVENT_ID],
        );
        await pool.query('commit');
      } catch (error) {
        await pool.query('rollback');
        throw error;
      }

      const reads = createAuthorContentReadService(pool);
      const activeQueue = await reads.listReviewQueue({
        actorPlayerId: PLAYER_ID,
        entityType: 'event',
        page: 1,
        pageSize: 100,
      });
      expect(
        activeQueue.items.find((item) => item.entityId === TOMBSTONE_EVENT_ID),
      ).toMatchObject({ submittedByName: 'Unnamed author' });

      await pool.query(
        `update public.players
            set auth_issuer = null,
                auth_subject = null,
                player_name = null,
                role = null,
                lifecycle_status = 'deleted',
                updated_at = now()
          where id = $1::uuid`,
        [AUTHOR_ID],
      );

      try {
        const deletedQueue = await reads.listReviewQueue({
          actorPlayerId: PLAYER_ID,
          entityType: 'event',
          page: 1,
          pageSize: 100,
        });
        expect(
          deletedQueue.items.find(
            (item) => item.entityId === TOMBSTONE_EVENT_ID,
          ),
        ).toMatchObject({ submittedByName: 'Deleted author' });

        const history = await reads.getHistory({
          entityType: 'event',
          entityId: TOMBSTONE_EVENT_ID,
          page: 1,
          pageSize: 100,
        });
        expect(history.items).toEqual([
          expect.objectContaining({
            action: 'submit',
            actorPlayerId: AUTHOR_ID,
            actorPlayerName: 'Deleted author',
          }),
        ]);
      } finally {
        await pool.query(
          `update public.players
              set auth_issuer = 'https://auth.example.test/',
                  auth_subject = 'author-content-author',
                  role = 'author',
                  lifecycle_status = 'active',
                  updated_at = now()
            where id = $1::uuid`,
          [AUTHOR_ID],
        );
      }
    }, 45_000);

    it('keeps audit entries immutable', async () => {
      const inserted = await pool.query<{
        id: string;
      }>(
        `
          insert into public.author_content_audit (
            actor_player_id,
            entity_type,
            entity_id,
            action
          )
          values ($1::uuid, 'challenge', $2::uuid, 'create')
          returning id::text
        `,
        [AUTHOR_ID, CHALLENGE_ID],
      );

      const auditId = inserted.rows[0]?.id;

      if (!auditId) {
        throw new Error('Expected an author audit entry.');
      }

      await expect(
        pool.query(
          `
            update public.author_content_audit
            set action = 'edit'
            where id = $1::uuid
          `,
          [auditId],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `
            delete from public.author_content_audit
            where id = $1::uuid
          `,
          [auditId],
        ),
      ).rejects.toThrow();
    });

    it('keeps a published question explanation immutable', async () => {
      await publishQuestion();

      await expect(
        pool.query(
          `
            update public.challenge_questions
            set explanation = 'Changed after publication'
            where id = $1::uuid
          `,
          [QUESTION_ID],
        ),
      ).rejects.toThrow();
    });

    async function seedContentFoundation(): Promise<void> {
      await pool.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role
          )
          values
            ($1::uuid, 'https://auth.example.test/', 'author-content-author', 'author'),
            ($2::uuid, 'https://auth.example.test/', 'author-content-player', 'player')
        `,
        [AUTHOR_ID, PLAYER_ID],
      );

      await pool.query(
        `
          insert into public.events (
            id,
            title,
            location,
            radius_metres,
            starts_at,
            ends_at
          )
          values (
            $1::uuid,
            'Author content event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75,
            '2026-09-01T08:00:00Z',
            '2026-09-01T12:00:00Z'
          )
        `,
        [EVENT_ID],
      );

      await pool.query(
        `
          insert into public.event_challenges (
            id,
            event_id
          )
          values ($1::uuid, $2::uuid)
        `,
        [CHALLENGE_ID, EVENT_ID],
      );

      await pool.query(
        `
          insert into public.challenge_questions (
            id,
            challenge_id,
            prompt,
            difficulty,
            explanation
          )
          values (
            $1::uuid,
            $2::uuid,
            'Where is the Great Hall?',
            1,
            'The Great Hall is on East Campus.'
          )
        `,
        [QUESTION_ID, CHALLENGE_ID],
      );
    }

    async function publishQuestion(): Promise<void> {
      const choiceIds = [
        'a7740000-0000-4000-8000-000000000001',
        'a7740000-0000-4000-8000-000000000002',
        'a7740000-0000-4000-8000-000000000003',
        'a7740000-0000-4000-8000-000000000004',
      ];

      await pool.query('begin');

      try {
        for (const [index, choiceId] of choiceIds.entries()) {
          await pool.query(
            `
              insert into public.challenge_choices (
                id,
                question_id,
                authoring_position,
                choice_text
              )
              values ($1::uuid, $2::uuid, $3, $4)
            `,
            [choiceId, QUESTION_ID, index + 1, `Choice ${index + 1}`],
          );
        }

        await pool.query(
          `
            insert into private.challenge_answer_keys (
              question_id,
              accepted_choice_id
            )
            values ($1::uuid, $2::uuid)
          `,
          [QUESTION_ID, choiceIds[0]],
        );

        await pool.query(
          `
            update public.challenge_questions
            set status = 'published',
                version = version + 1,
                publication_provenance = 'controlled_seed',
                updated_at = now()
            where id = $1::uuid
          `,
          [QUESTION_ID],
        );

        await pool.query('commit');
      } catch (error) {
        await pool.query('rollback');
        throw error;
      }
    }
  },
);
