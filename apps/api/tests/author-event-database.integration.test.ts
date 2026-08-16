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

import {
  AuthorEventNotReadyError,
  AuthorEventStateConflictError,
  createAuthorEventService,
} from '../src/events/author-event-service.js';
import { createAuthorChallengeService } from '../src/challenges/author-challenge-service.js';
import { createAuthorCardService } from '../src/cards/author-card-service.js';

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

    it('rejects event publication without a published challenge', async () => {
      const service = createAuthorEventService(pool);

      const event = await service.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Incomplete Publication Event',
        description: 'This event has no published challenge.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-04T08:00:00.000Z',
        endsAt: '2026-09-04T12:00:00.000Z',
      });

      await expect(
        service.publishEvent(AUTHOR_ONE_ID, event.eventId),
      ).rejects.toBeInstanceOf(AuthorEventNotReadyError);

      const persisted = await pool.query<{
        is_published: boolean;
        retired_at: Date | null;
      }>(
        `
            select
              is_published,
              retired_at
            from public.events
            where id = $1::uuid
          `,
        [event.eventId],
      );

      expect(persisted.rows).toEqual([
        {
          is_published: false,
          retired_at: null,
        },
      ]);
    }, 45_000);

    it('rejects publication when the event has a published challenge but no Common reward catalogue', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'No Reward Catalogue Event',
        description: 'Challenge ready but reward catalogue unavailable.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-05T08:00:00.000Z',
        endsAt: '2026-09-05T12:00:00.000Z',
      });

      await createPublishedChallenge(
        challengeService,
        event.eventId,
        AUTHOR_ONE_ID,
      );

      await expect(
        eventService.publishEvent(AUTHOR_ONE_ID, event.eventId),
      ).rejects.toMatchObject({
        message:
          'At least one active Common reward card is required before event publication.',
      } satisfies Partial<AuthorEventNotReadyError>);

      const persisted = await pool.query<{
        is_published: boolean;
      }>(
        `
            select is_published
            from public.events
            where id = $1::uuid
          `,
        [event.eventId],
      );

      expect(persisted.rows[0]?.is_published).toBe(false);
    }, 45_000);

    it('publishes a complete event, freezes it, and records the publishing Author', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      await ensureCommonRewardCard(cardService);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Playable Published Event',
        description: 'A complete Basic event.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-06T08:00:00.000Z',
        endsAt: '2026-09-06T12:00:00.000Z',
      });

      await createPublishedChallenge(
        challengeService,
        event.eventId,
        AUTHOR_ONE_ID,
      );

      const published = await eventService.publishEvent(
        AUTHOR_TWO_ID,
        event.eventId,
      );

      expect(published).toMatchObject({
        eventId: event.eventId,
        isPublished: true,
        authoringStatus: 'published',
        retiredAt: null,
      });

      await expect(
        eventService.updateEvent({
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: event.eventId,
          title: 'Illegal Published Edit',
          description: 'Must not change.',
          latitude: -26.19,
          longitude: 28.03,
          radiusMetres: 100,
          startsAt: '2026-09-06T09:00:00.000Z',
          endsAt: '2026-09-06T13:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(AuthorEventStateConflictError);

      await expect(
        pool.query(
          `
              update public.events
              set title = 'Illegal Direct Edit',
                  updated_at = now()
              where id = $1::uuid
            `,
          [event.eventId],
        ),
      ).rejects.toThrow();

      const audit = await pool.query<{
        actor_player_id: string;
      }>(
        `
            select actor_player_id::text
            from public.author_content_audit
            where entity_type = 'event'
              and entity_id = $1::uuid
              and action = 'publish'
          `,
        [event.eventId],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);

    it('prevents the live event published challenge from being retired', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      await ensureCommonRewardCard(cardService);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Challenge Guard Event',
        description: 'Its challenge must remain live.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-07T08:00:00.000Z',
        endsAt: '2026-09-07T12:00:00.000Z',
      });

      const challengeId = await createPublishedChallenge(
        challengeService,
        event.eventId,
        AUTHOR_ONE_ID,
      );

      await eventService.publishEvent(AUTHOR_ONE_ID, event.eventId);

      await expect(
        challengeService.retireChallenge(AUTHOR_TWO_ID, challengeId),
      ).rejects.toThrow();

      const challenge = await pool.query<{
        status: string;
      }>(
        `
            select status
            from public.event_challenges
            where id = $1::uuid
          `,
        [challengeId],
      );

      expect(challenge.rows[0]?.status).toBe('published');
    }, 45_000);

    it('retires a published event, allows its challenge to retire, and prevents republication', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      await ensureCommonRewardCard(cardService);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Retirable Event',
        description: 'This event will be removed from player visibility.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-08T08:00:00.000Z',
        endsAt: '2026-09-08T12:00:00.000Z',
      });

      const challengeId = await createPublishedChallenge(
        challengeService,
        event.eventId,
        AUTHOR_ONE_ID,
      );

      await eventService.publishEvent(AUTHOR_ONE_ID, event.eventId);

      const retired = await eventService.retireEvent(
        AUTHOR_TWO_ID,
        event.eventId,
      );

      expect(retired.eventId).toBe(event.eventId);
      expect(retired.isPublished).toBe(false);
      expect(retired.authoringStatus).toBe('retired');
      expect(retired.retiredAt).not.toBeNull();

      const visibility = await pool.query<{
        visible_count: number;
      }>(
        `
            select count(*)::int as visible_count
            from public.events
            where id = $1::uuid
              and is_published = true
          `,
        [event.eventId],
      );

      expect(visibility.rows[0]?.visible_count).toBe(0);

      const retiredChallenge = await challengeService.retireChallenge(
        AUTHOR_ONE_ID,
        challengeId,
      );

      expect(retiredChallenge.status).toBe('retired');

      await expect(
        eventService.publishEvent(AUTHOR_ONE_ID, event.eventId),
      ).rejects.toBeInstanceOf(AuthorEventStateConflictError);

      await expect(
        pool.query(
          `
              update public.events
              set
                is_published = true,
                retired_at = null,
                updated_at = now()
              where id = $1::uuid
            `,
          [event.eventId],
        ),
      ).rejects.toThrow();

      const audit = await pool.query<{
        actor_player_id: string;
      }>(
        `
            select actor_player_id::text
            from public.author_content_audit
            where entity_type = 'event'
              and entity_id = $1::uuid
              and action = 'retire'
          `,
        [event.eventId],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);
  },
);

async function createPublishedChallenge(
  service: ReturnType<typeof createAuthorChallengeService>,
  eventId: string,
  actorPlayerId: string,
): Promise<string> {
  const challenge = await service.createChallenge({
    actorPlayerId,
    eventId,
  });

  for (let index = 1; index <= 5; index += 1) {
    const question = await service.createQuestion({
      actorPlayerId,
      challengeId: challenge.challengeId,
      prompt: `Publication question ${index}`,
      difficulty: (((index - 1) % 3) + 1) as 1 | 2 | 3,
      explanation: `Explanation for publication question ${index}.`,
      choices: [
        `Option A ${index}`,
        `Option B ${index}`,
        `Option C ${index}`,
        `Option D ${index}`,
      ],
      acceptedChoicePosition: 1,
    });

    await service.publishQuestion(actorPlayerId, question.questionId);
  }

  const published = await service.publishChallenge(
    actorPlayerId,
    challenge.challengeId,
  );

  expect(published.status).toBe('published');

  return challenge.challengeId;
}

async function ensureCommonRewardCard(
  service: ReturnType<typeof createAuthorCardService>,
): Promise<void> {
  const existing = await poolHasActiveCommonCard(service);

  if (existing) {
    return;
  }

  const card = await service.createCard({
    actorPlayerId: AUTHOR_ONE_ID,
    name: `Event Publication Reward ${Date.now()}`,
    category: 'power',
    affinity: 'wit',
    rarity: 'common',
    hp: null,
    power: null,
    description: 'A Common card used for event publication readiness.',
    imageUrl: null,
    moves: [],
    effects: [
      {
        position: 1,
        effectType: 'heal',
        effectValue: 10,
      },
    ],
  });

  await service.publishCard(AUTHOR_ONE_ID, card.id);
}

async function poolHasActiveCommonCard(
  service: ReturnType<typeof createAuthorCardService>,
): Promise<boolean> {
  const cards = await service.listCards();

  return cards.some(
    (card) =>
      card.rarity === 'common' &&
      card.isActive &&
      card.authoringStatus === 'published',
  );
}
