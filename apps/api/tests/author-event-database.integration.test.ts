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

import { createAuthorEventService } from '../src/events/author-event-service.js';
import { createAuthorChallengeService } from '../src/challenges/author-challenge-service.js';
import { createAuthorCardService } from '../src/cards/author-card-service.js';
import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  StaleAuthorContentVersionError,
} from '../src/authoring/content-workflow.js';

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
    }, 180_000);

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
        automaticPlacement: false,
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

    it('serializes concurrent draft edits that use the same expected version', async () => {
      const service = createAuthorEventService(pool);
      const created = await service.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: false,
        title: 'Concurrent Author Event',
        description: 'Both writers loaded version zero.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-01T08:00:00.000Z',
        endsAt: '2026-09-01T12:00:00.000Z',
      });

      const results = await Promise.allSettled([
        service.updateEvent({
          ...created,
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: created.eventId,
          expectedVersion: 0,
          title: 'Concurrent Author Event A',
        }),
        service.updateEvent({
          ...created,
          actorPlayerId: AUTHOR_TWO_ID,
          eventId: created.eventId,
          expectedVersion: 0,
          title: 'Concurrent Author Event B',
        }),
      ]);

      expect(
        results.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected).toMatchObject({
        reason: expect.any(StaleAuthorContentVersionError),
      });

      const persisted = await pool.query<{
        audit_count: number;
        version: number;
      }>(
        `select event.version,
                (select count(*)::int
                   from public.author_content_audit audit
                  where audit.entity_type = 'event'
                    and audit.entity_id = event.id) audit_count
           from public.events event
          where event.id = $1::uuid`,
        [created.eventId],
      );
      expect(persisted.rows[0]).toEqual({ audit_count: 2, version: 1 });

      const submissions = await Promise.allSettled([
        service.submitEvent({
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: created.eventId,
          expectedVersion: 1,
        }),
        service.submitEvent({
          actorPlayerId: AUTHOR_TWO_ID,
          eventId: created.eventId,
          expectedVersion: 1,
        }),
      ]);
      expect(
        submissions.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        submissions.find(({ status }) => status === 'rejected'),
      ).toMatchObject({
        reason: expect.any(StaleAuthorContentVersionError),
      });

      const submitted = await pool.query<{
        audit_count: number;
        authoring_status: string;
        version: number;
      }>(
        `select event.authoring_status, event.version,
                (select count(*)::int
                   from public.author_content_audit audit
                  where audit.entity_type = 'event'
                    and audit.entity_id = event.id) audit_count
           from public.events event
          where event.id = $1::uuid`,
        [created.eventId],
      );
      expect(submitted.rows[0]).toEqual({
        audit_count: 3,
        authoring_status: 'in_review',
        version: 2,
      });
    });

    it('allows another Author to edit existing content and records that Author', async () => {
      const service = createAuthorEventService(pool);

      const created = await service.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: false,
        title: 'Shared Author Event',
        description: null,
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-02T08:00:00.000Z',
        endsAt: '2026-09-02T12:00:00.000Z',
      });

      const updated = await service.updateEvent({
        expectedVersion: 0,
        actorPlayerId: AUTHOR_TWO_ID,
        automaticPlacement: false,
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
          automaticPlacement: false,
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
        automaticPlacement: false,
        title: 'Incomplete Publication Event',
        description: 'This event has no published challenge.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-09-04T08:00:00.000Z',
        endsAt: '2026-09-04T12:00:00.000Z',
      });

      await expect(
        submitAndApproveEvent(service, event.eventId),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);

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
    }, 180_000);

    it('rejects publication when the event has a published challenge but no Common reward catalogue', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: false,
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

      const disabledRewardIds = await disableCommonRewardCards(pool);
      try {
        await expect(
          submitAndApproveEvent(eventService, event.eventId),
        ).rejects.toMatchObject({
          message:
            'At least one active published Common reward card is required.',
        } satisfies Partial<AuthorContentNotReadyError>);

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
      } finally {
        await restoreRewardCards(pool, disabledRewardIds);
      }
    }, 180_000);

    it('publishes a complete event, freezes it, and records the publishing Author', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      const rewardCardId = await ensureCommonRewardCard(cardService);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: false,
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

      const published = await publishEventThroughReview(
        eventService,
        event.eventId,
        AUTHOR_TWO_ID,
      );

      expect(published).toMatchObject({
        eventId: event.eventId,
        isPublished: true,
        authoringStatus: 'published',
        retiredAt: null,
      });

      await expect(
        eventService.updateEvent({
          expectedVersion: 3,
          actorPlayerId: AUTHOR_ONE_ID,
          automaticPlacement: false,
          eventId: event.eventId,
          title: 'Illegal Published Edit',
          description: 'Must not change.',
          latitude: -26.19,
          longitude: 28.03,
          radiusMetres: 100,
          startsAt: '2026-09-06T09:00:00.000Z',
          endsAt: '2026-09-06T13:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);

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

      const disabledRewardIds = await disableCommonRewardCards(
        pool,
        rewardCardId,
      );
      try {
        const rewardCard = (await cardService.listCards()).find(
          (card) => card.id === rewardCardId,
        );
        if (!rewardCard) throw new Error('Expected reward card to exist.');

        await expect(
          cardService.retireCard({
            actorPlayerId: AUTHOR_ONE_ID,
            cardId: rewardCardId,
            expectedVersion: rewardCard.version,
          }),
        ).rejects.toBeInstanceOf(AuthorContentNotReadyError);
      } finally {
        await restoreRewardCards(pool, disabledRewardIds);
      }
    }, 180_000);

    it('rejects service retirement while the event is live and retains the database guard', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      await ensureCommonRewardCard(cardService);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: false,
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

      await publishEventThroughReview(eventService, event.eventId);

      await expect(
        challengeService.retireChallenge({
          actorPlayerId: AUTHOR_TWO_ID,
          challengeId,
          expectedVersion: 3,
        }),
      ).rejects.toMatchObject({
        message: 'Retire the event before retiring its published challenge.',
        name: 'AuthorContentStateConflictError',
      });

      await expect(
        pool.query(
          `
            update public.event_challenges
            set
              status = 'retired',
              version = version + 1,
              updated_at = now()
            where id = $1::uuid
          `,
          [challengeId],
        ),
      ).rejects.toMatchObject({ code: '55006' });

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
    }, 180_000);

    it('retires a published event, allows its challenge to retire, and prevents republication', async () => {
      const eventService = createAuthorEventService(pool);
      const challengeService = createAuthorChallengeService(pool);
      const cardService = createAuthorCardService(pool);

      await ensureCommonRewardCard(cardService);
      const placement = await seedAuthorPlacementPolicy(pool);

      const event = await eventService.createEvent({
        actorPlayerId: AUTHOR_ONE_ID,
        automaticPlacement: true,
        title: 'Retirable Event',
        description: 'This event will be removed from player visibility.',
        latitude: null,
        longitude: null,
        radiusMetres: 75,
        startsAt: '2026-09-08T08:00:00.000Z',
        endsAt: '2026-09-08T12:00:00.000Z',
      });

      const challengeId = await createPublishedChallenge(
        challengeService,
        event.eventId,
        AUTHOR_ONE_ID,
      );
      const unrelatedChallenge = await challengeService.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId: event.eventId,
      });

      await publishEventThroughReview(eventService, event.eventId);
      const assignmentId = await createActivePlacementAssignment(pool, {
        eventId: event.eventId,
        siteId: placement.siteId,
        zoneId: placement.zoneId,
      });

      const retired = await eventService.retireEvent({
        actorPlayerId: AUTHOR_TWO_ID,
        eventId: event.eventId,
        expectedVersion: 3,
      });

      expect(retired.eventId).toBe(event.eventId);
      expect(retired.isPublished).toBe(false);
      expect(retired.authoringStatus).toBe('retired');
      expect(retired.retiredAt).not.toBeNull();
      expect(retired.automaticPlacement).toBe(false);

      const placementLifecycle = await pool.query<{
        assignment_end_reason: string | null;
        assignment_ended: boolean;
        portability_end_reason: string | null;
        portability_ended: boolean;
      }>(
        `select
           assignment.ends_at is not null assignment_ended,
           assignment.end_reason assignment_end_reason,
           portability.ended_at is not null portability_ended,
           portability.end_reason portability_end_reason
         from public.event_placement_assignments assignment
         join public.event_placement_portability portability
           on portability.event_id = assignment.event_id
        where assignment.id = $1::uuid`,
        [assignmentId],
      );

      expect(placementLifecycle.rows).toEqual([
        {
          assignment_end_reason: 'event_retired',
          assignment_ended: true,
          portability_end_reason: 'event_retired',
          portability_ended: true,
        },
      ]);

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

      const retiredChallenge = await challengeService.retireChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId,
        expectedVersion: 3,
      });

      expect(retiredChallenge.status).toBe('retired');

      const persistedChallenges = await challengeService.listChallenges(
        event.eventId,
      );

      expect(
        persistedChallenges.find(
          (challenge) => challenge.challengeId === challengeId,
        )?.status,
      ).toBe('retired');
      expect(
        persistedChallenges.find(
          (challenge) =>
            challenge.challengeId === unrelatedChallenge.challengeId,
        )?.status,
      ).toBe('draft');

      await expect(
        challengeService.retireChallenge({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId,
          expectedVersion: 4,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);

      const persistedEvent = await eventService.listEvents();
      expect(
        persistedEvent.find((candidate) => candidate.eventId === event.eventId)
          ?.authoringStatus,
      ).toBe('retired');

      await expect(
        eventService.publishEvent({
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: event.eventId,
          expectedVersion: 4,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);

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
    }, 180_000);
  },
);

async function seedAuthorPlacementPolicy(
  database: ReturnType<typeof createDatabasePool>,
): Promise<{ siteId: string; zoneId: string }> {
  const policyId = 'author-event-placement-test';
  const zoneId = 'd2000000-0000-4000-8000-000000000001';
  const siteId = 'd3000000-0000-4000-8000-000000000001';
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into public.event_placement_policy_versions (
         id, automatic_target, preferred_assignments_per_zone,
         mandatory_assignments_per_zone, minimum_separation_metres,
         rotation_timezone, rotation_local_time, replacements_per_rotation,
         site_cooldown_buckets, preview_ttl_minutes, maximum_pin_hours,
         maximum_pause_hours, maximum_exclusion_hours, review_provenance
       ) values ($1, 1, 1, 1, 150, 'Africa/Johannesburg', '04:00:00',
                 1, 0, 15, 168, 168, 720, 'Author event integration test')`,
      [policyId],
    );
    await client.query(
      `insert into public.event_placement_zones (
         id, policy_version_id, zone_key, name, area, status, source_urls,
         review_provenance, reviewed_by_player_id, reviewed_at, activated_at
       ) values (
         $1::uuid, $2, 'author_test_zone', 'Author test zone',
         st_multi(st_geomfromtext(
           'POLYGON((28.02 -26.20, 28.04 -26.20, 28.04 -26.18, 28.02 -26.18, 28.02 -26.20))',
           4326
         )),
         'active', array['https://example.com/author-test-zone'],
         'controlled_policy', null, now(), now()
       )`,
      [zoneId, policyId],
    );
    await client.query(
      `insert into public.event_placement_sites (
         id, zone_id, policy_version_id, site_key, name, location,
         maximum_interaction_radius_metres, status, source_urls,
         review_provenance, reviewed_by_player_id, reviewed_at, activated_at
       ) values (
         $1::uuid, $2::uuid, $3, 'author_test_site', 'Author test site',
         st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
         75, 'active', array['https://example.com/author-test-site'],
         'controlled_policy', null, now(), now()
       )`,
      [siteId, zoneId, policyId],
    );
    await client.query(
      `insert into public.event_placement_state (
         singleton, current_policy_version_id, version
       ) values (true, $1, 0)`,
      [policyId],
    );
    await client.query('commit');
    return { siteId, zoneId };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createActivePlacementAssignment(
  database: ReturnType<typeof createDatabasePool>,
  input: { eventId: string; siteId: string; zoneId: string },
): Promise<string> {
  const state = await database.query<{
    policy_version_id: string;
    version: string;
  }>(
    `select current_policy_version_id policy_version_id, version::text
       from public.event_placement_state where singleton = true`,
  );
  const policyId = state.rows[0]?.policy_version_id;
  const stateVersion = Number(state.rows[0]?.version);
  if (!policyId || !Number.isInteger(stateVersion)) {
    throw new Error('Expected an active placement policy state.');
  }

  const plan = await database.query<{ id: string }>(
    `insert into public.event_placement_plans (
       policy_version_id, rotation_bucket, status, trigger_kind,
       input_digest, expected_state_version, target_assignment_count,
       actual_assignment_count, zone_assignment_counts, valid_until
     ) values (
       $1, '2026-09-08'::date, 'preview', 'scheduled', repeat('b', 64),
       $2, 1, 1, '{"author_test_zone":1}'::jsonb, now() + interval '15 minutes'
     ) returning id::text`,
    [policyId, stateVersion],
  );
  const planId = plan.rows[0]?.id;
  if (!planId) throw new Error('Expected a placement plan ID.');

  await database.query(
    `insert into public.event_placement_plan_entries (
       plan_id, event_id, site_id, zone_id, position, origin
     ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'automatic')`,
    [planId, input.eventId, input.siteId, input.zoneId],
  );
  await database.query(
    `update public.event_placement_plans
        set status = 'applied', committed_state_version = $2, applied_at = now()
      where id = $1::uuid`,
    [planId, stateVersion + 1],
  );
  const assignment = await database.query<{ id: string }>(
    `insert into public.event_placement_assignments (
       plan_id, policy_version_id, event_id, site_id, zone_id, origin, starts_at
     ) values ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, 'automatic', now())
     returning id::text`,
    [planId, policyId, input.eventId, input.siteId, input.zoneId],
  );
  return assignment.rows[0]?.id ?? '';
}

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

    const reviewerId =
      actorPlayerId === AUTHOR_ONE_ID ? AUTHOR_TWO_ID : AUTHOR_ONE_ID;
    await service.submitQuestion({
      actorPlayerId,
      questionId: question.questionId,
      expectedVersion: 0,
    });
    await service.approveQuestion({
      actorPlayerId: reviewerId,
      questionId: question.questionId,
      expectedVersion: 1,
    });
    await service.publishQuestion({
      actorPlayerId,
      questionId: question.questionId,
      expectedVersion: 2,
    });
  }

  const reviewerId =
    actorPlayerId === AUTHOR_ONE_ID ? AUTHOR_TWO_ID : AUTHOR_ONE_ID;
  await service.submitChallenge({
    actorPlayerId,
    challengeId: challenge.challengeId,
    expectedVersion: 0,
  });
  await service.approveChallenge({
    actorPlayerId: reviewerId,
    challengeId: challenge.challengeId,
    expectedVersion: 1,
  });
  const published = await service.publishChallenge({
    actorPlayerId,
    challengeId: challenge.challengeId,
    expectedVersion: 2,
  });

  expect(published.status).toBe('published');

  return challenge.challengeId;
}

async function ensureCommonRewardCard(
  service: ReturnType<typeof createAuthorCardService>,
): Promise<string> {
  const existing = (await service.listCards()).find(
    (card) =>
      card.name === 'Heavy Impact' &&
      card.rarity === 'common' &&
      card.isActive &&
      card.authoringStatus === 'published',
  );

  if (existing) {
    return existing.id;
  }

  const card = await service.createCard({
    actorPlayerId: AUTHOR_ONE_ID,
    name: `Event Publication Reward ${Date.now()}`,
    category: 'power',
    affinity: null,
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

  await service.submitCard({
    actorPlayerId: AUTHOR_ONE_ID,
    cardId: card.id,
    expectedVersion: 0,
  });
  await service.approveCard({
    actorPlayerId: AUTHOR_TWO_ID,
    cardId: card.id,
    expectedVersion: 1,
  });
  const published = await service.publishCard({
    actorPlayerId: AUTHOR_ONE_ID,
    cardId: card.id,
    expectedVersion: 2,
  });

  return published.id;
}

async function disableCommonRewardCards(
  pool: ReturnType<typeof createDatabasePool>,
  exceptCardId: string | null = null,
): Promise<string[]> {
  await pool.query(
    `alter table public.card_definitions
       disable trigger card_definitions_curated_authoring_guard;
     alter table public.card_definitions
       disable trigger card_definitions_content_immutability`,
  );

  try {
    const result = await pool.query<{ id: string }>(
      `update public.card_definitions
          set reward_eligible = false
        where rarity = 'common'
          and reward_eligible
          and authoring_status = 'published'
          and is_active
          and ($1::uuid is null or id <> $1::uuid)
      returning id::text`,
      [exceptCardId],
    );
    return result.rows.map((row) => row.id);
  } finally {
    await pool.query(
      `alter table public.card_definitions
         enable trigger card_definitions_content_immutability;
       alter table public.card_definitions
         enable trigger card_definitions_curated_authoring_guard`,
    );
  }
}

async function restoreRewardCards(
  pool: ReturnType<typeof createDatabasePool>,
  cardIds: string[],
): Promise<void> {
  if (cardIds.length === 0) return;

  await pool.query(
    `alter table public.card_definitions
       disable trigger card_definitions_curated_authoring_guard;
     alter table public.card_definitions
       disable trigger card_definitions_content_immutability`,
  );

  try {
    await pool.query(
      `update public.card_definitions
          set reward_eligible = true
        where id = any($1::uuid[])`,
      [cardIds],
    );
  } finally {
    await pool.query(
      `alter table public.card_definitions
         enable trigger card_definitions_content_immutability;
       alter table public.card_definitions
         enable trigger card_definitions_curated_authoring_guard`,
    );
  }
}

async function submitAndApproveEvent(
  service: ReturnType<typeof createAuthorEventService>,
  eventId: string,
) {
  await service.submitEvent({
    actorPlayerId: AUTHOR_ONE_ID,
    eventId,
    expectedVersion: 0,
  });
  return service.approveEvent({
    actorPlayerId: AUTHOR_TWO_ID,
    eventId,
    expectedVersion: 1,
  });
}

async function publishEventThroughReview(
  service: ReturnType<typeof createAuthorEventService>,
  eventId: string,
  publisherId = AUTHOR_ONE_ID,
) {
  await submitAndApproveEvent(service, eventId);
  return service.publishEvent({
    actorPlayerId: publisherId,
    eventId,
    expectedVersion: 2,
  });
}
