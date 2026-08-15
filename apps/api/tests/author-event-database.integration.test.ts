import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthorEventService } from '../src/events/author-event-service.js';
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

const AUTHOR_ONE_ID = 'd1000000-0000-4000-8000-000000000001';
const AUTHOR_TWO_ID = 'd1000000-0000-4000-8000-000000000002';
const PLAYER_ID = 'd1000000-0000-4000-8000-000000000003';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'author event database integration',
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

      temporaryDatabaseName = `wits_quest_author_events_${Date.now()}_${process.pid}`;

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

      await pool.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role
          )
          values
            (
              $1::uuid,
              'https://auth.example.test/',
              'author-event-one',
              'author'
            ),
            (
              $2::uuid,
              'https://auth.example.test/',
              'author-event-two',
              'author'
            ),
            (
              $3::uuid,
              'https://auth.example.test/',
              'author-event-player',
              'player'
            )
        `,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID, PLAYER_ID],
      );
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

    it('creates an unpublished event with PostGIS coordinates and an Author audit record', async () => {
      const service = createAuthorEventService(pool);

      const created = await service.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: '  Great Hall Author Event  ',
        description: '  Explore East Campus.  ',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-01T08:00:00.000Z',
        endsAt: '2026-09-01T12:00:00.000Z',
      });

      expect(created).toMatchObject({
        title: 'Great Hall Author Event',
        description: 'Explore East Campus.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        isPublished: false,
      });

      const persisted = await pool.query<{
        latitude: number;
        longitude: number;
        is_published: boolean;
      }>(
        `
          select
            st_y(location::geometry) as latitude,
            st_x(location::geometry) as longitude,
            is_published
          from public.events
          where id = $1::uuid
        `,
        [created.eventId],
      );

      expect(persisted.rows[0]).toEqual({
        latitude: -26.19205,
        longitude: 28.03038,
        is_published: false,
      });

      const audit = await pool.query<{
        actor_player_id: string;
        action: string;
        entity_type: string;
      }>(
        `
          select
            actor_player_id::text,
            entity_type,
            action
          from public.author_content_audit
          where entity_type = 'event'
            and entity_id = $1::uuid
        `,
        [created.eventId],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_ONE_ID,
          entity_type: 'event',
          action: 'create',
        },
      ]);

      const listed = await service.listEvents();

      expect(listed.some((event) => event.eventId === created.eventId)).toBe(
        true,
      );
    });

    it('allows another Author to edit existing content and records that Author', async () => {
      const service = createAuthorEventService(pool);

      const created = await service.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Shared Author Event',
        description: null,
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-02T08:00:00.000Z',
        endsAt: '2026-09-02T12:00:00.000Z',
      });

      const updated = await service.updateEvent({
        actorPlayerId: AUTHOR_TWO_ID,
        eventId: created.eventId,
        title: 'Edited By Another Author',
        description: 'Authors may manage shared Basic content.',
        latitude: -26.19,
        longitude: 28.03,
        radiusMetres: 100,
        startsAt: '2026-09-02T09:00:00.000Z',
        endsAt: '2026-09-02T13:00:00.000Z',
      });

      expect(updated).toMatchObject({
        eventId: created.eventId,
        title: 'Edited By Another Author',
        description: 'Authors may manage shared Basic content.',
        latitude: -26.19,
        longitude: 28.03,
        radiusMetres: 100,
      });

      const createAudit = await pool.query<{
        actor_player_id: string;
      }>(
        `
          select actor_player_id::text
          from public.author_content_audit
          where entity_type = 'event'
            and entity_id = $1::uuid
            and action = 'create'
        `,
        [created.eventId],
      );

      expect(createAudit.rows).toEqual([
        {
          actor_player_id: AUTHOR_ONE_ID,
        },
      ]);

      const editAudit = await pool.query<{
        actor_player_id: string;
      }>(
        `
          select actor_player_id::text
          from public.author_content_audit
          where entity_type = 'event'
            and entity_id = $1::uuid
            and action = 'edit'
        `,
        [created.eventId],
      );

      expect(editAudit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    });

    it('rolls back event creation when the audit actor is not an Author', async () => {
      const service = createAuthorEventService(pool);

      const title = 'Player Audit Rollback Event';

      await expect(
        service.createEvent({
          actorPlayerId: PLAYER_ID,
          title,
          description: null,
          latitude: -26.19205,
          longitude: 28.03038,
          radiusMetres: 75,
          startsAt: '2026-09-03T08:00:00.000Z',
          endsAt: '2026-09-03T12:00:00.000Z',
        }),
      ).rejects.toThrow();

      const persisted = await pool.query<{
        event_count: number;
      }>(
        `
          select count(*)::int as event_count
          from public.events
          where title = $1
        `,
        [title],
      );

      expect(persisted.rows[0]?.event_count).toBe(0);
    });
  },
);
