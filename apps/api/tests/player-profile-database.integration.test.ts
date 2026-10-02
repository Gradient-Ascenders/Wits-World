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
import { createStarterGrantService } from '../src/cards/starter-grant.js';
import {
  createPlayerProfileService,
  type ProfileEdit,
  type PlayerProfileService,
} from '../src/players/player-profile.js';

const ownerId = '17400000-0000-4000-8000-000000000001';
const visitorId = '17400000-0000-4000-8000-000000000002';
const blank: ProfileEdit = {
  expectedVersion: 0,
  bio: 'Campus collector',
  degree: '',
  studyYear: '',
  avatarDataUrl: null,
  statusEmoji: '📚',
  statusText: 'Studying',
  statusExpiry: 'never',
  isPublic: true,
  activityVisible: false,
  featuredOwnedCardIds: [],
};

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'player profile database',
  () => {
    let admin: DatabaseConfig;
    let config: DatabaseConfig;
    let name: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let service: PlayerProfileService;
    let ownedId: string;
    let foreignId: string;
    let visitorGrantId: string;
    beforeAll(async () => {
      loadApiEnvironment();
      admin = buildDatabaseConfig({ target: 'test' });
      name = `wits_profile_${Date.now()}_${process.pid}`;
      await withDatabaseClient(admin, (client) =>
        client.query(`create database ${name}`),
      );
      const url = new URL(admin.connectionString);
      url.pathname = `/${name}`;
      config = { ...admin, connectionString: url.toString() };
      await runMigrations(config);
      await runSeeds(config);
      pool = createDatabasePool(config);
      service = createPlayerProfileService(pool);
      await pool.query(
        `insert into public.players (id, auth_issuer, auth_subject, player_name, role) values ($1, 'https://profile.test/', 'profile-one', 'profile-one', 'player'), ($2, 'https://profile.test/', 'profile-two', 'profile-two', 'player')`,
        [ownerId, visitorId],
      );
      const starter = createStarterGrantService(pool);
      const owner = await starter.selectStarter({
        playerId: ownerId,
        affinity: 'wit',
      });
      const visitor = await starter.selectStarter({
        playerId: visitorId,
        affinity: 'spark',
      });
      ownedId = owner.grant.cards[0]!.ownedCardId;
      foreignId = visitor.grant.cards[0]!.ownedCardId;
      visitorGrantId = visitor.grant.starterGrantId;
    }, 120000);
    afterAll(async () => {
      if (pool) await pool.end();
      if (admin && name)
        await withDatabaseClient(admin, (client) =>
          client.query(`drop database if exists ${name} with (force)`),
        );
    }, 30000);

    it('starts private and publishes only selected presentation and earned achievements', async () => {
      expect(await service.get(ownerId)).toMatchObject({
        isOwner: true,
        version: 0,
        isPublic: false,
      });
      await expect(service.get(visitorId, 'profile-one')).rejects.toMatchObject(
        { statusCode: 404 },
      );
      const saved = await service.save(ownerId, {
        ...blank,
        featuredOwnedCardIds: [ownedId],
      });
      expect(saved).toMatchObject({
        version: 1,
        featuredOwnedCardIds: [ownedId],
      });
      const visitor = await service.get(visitorId, 'profile-one');
      expect(visitor).toMatchObject({
        isOwner: false,
        version: null,
        featuredOwnedCardIds: [],
        activity: null,
      });
      expect(visitor.featuredCards).toHaveLength(1);
      expect(visitor.featuredCards[0]).not.toHaveProperty('ownedCardId');
      expect(visitor.featuredCards[0]).not.toHaveProperty('acquiredAt');
      expect(visitor.achievements.every((entry) => entry.earned)).toBe(true);
    }, 30000);
    it('rejects stale versions and foreign copies without changing the saved profile', async () => {
      await expect(service.save(ownerId, blank)).rejects.toMatchObject({
        code: 'PROFILE_VERSION_CONFLICT',
      });
      await expect(
        service.save(ownerId, {
          ...blank,
          expectedVersion: 1,
          featuredOwnedCardIds: [foreignId],
        }),
      ).rejects.toMatchObject({ code: 'PROFILE_CARD_UNAVAILABLE' });
      expect(await service.get(ownerId)).toMatchObject({
        version: 1,
        bio: 'Campus collector',
        featuredOwnedCardIds: [ownedId],
      });
    }, 30000);
    it('allows exactly one concurrent writer for the same version', async () => {
      const outcomes = await Promise.allSettled([
        service.save(ownerId, {
          ...blank,
          expectedVersion: 1,
          bio: 'First draft',
        }),
        service.save(ownerId, {
          ...blank,
          expectedVersion: 1,
          bio: 'Second draft',
        }),
      ]);
      expect(
        outcomes.filter((entry) => entry.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((entry) => entry.status === 'rejected'),
      ).toHaveLength(1);
      expect((await service.get(ownerId)).version).toBe(2);
    }, 30000);
    it('uses server time to expire custom status and Johannesburg midnight', async () => {
      await service.save(ownerId, {
        ...blank,
        expectedVersion: 2,
        statusExpiry: 'today',
      });
      const expiration = await pool.query<{ correct: boolean }>(
        `select status_expires_at = (((now() at time zone 'Africa/Johannesburg')::date + 1)::timestamp at time zone 'Africa/Johannesburg') as correct from public.player_profiles where player_id = $1`,
        [ownerId],
      );
      expect(expiration.rows[0]?.correct).toBe(true);
      await pool.query(
        `update public.player_profiles set status_expires_at = now() - interval '1 second' where player_id = $1`,
        [ownerId],
      );
      expect((await service.get(ownerId)).status).toBeNull();
    }, 30000);
    it('removes transferred featured copies without blocking the ownership change', async () => {
      await service.save(ownerId, {
        ...blank,
        expectedVersion: 3,
        featuredOwnedCardIds: [ownedId],
      });
      await pool.query(
        `update public.player_cards set player_id = $1, source_starter_grant_id = $2 where id = $3`,
        [visitorId, visitorGrantId, ownedId],
      );
      expect((await service.get(ownerId)).featuredCards).toEqual([]);
      const selected = await pool.query(
        'select * from public.player_profile_cards where owned_card_id = $1',
        [ownedId],
      );
      expect(selected.rows).toHaveLength(0);
    }, 30000);
    it('hides pending deletion profiles and purges personal metadata when deleted', async () => {
      const deletionRequestId = '17400000-0000-4000-8000-000000000003';
      await pool.query(
        `insert into public.account_deletion_requests (id, requested_at, status) values ($1, now(), 'pending')`,
        [deletionRequestId],
      );
      await pool.query(
        `update public.players set lifecycle_status = 'deletion_pending', deletion_request_id = $2 where id = $1`,
        [ownerId, deletionRequestId],
      );
      await expect(service.get(visitorId, 'profile-one')).rejects.toMatchObject(
        { statusCode: 404 },
      );
      await pool.query(
        `update public.players set lifecycle_status = 'deleted', player_name = null, auth_issuer = null, auth_subject = null, role = null, deletion_request_id = null where id = $1`,
        [ownerId],
      );
      expect(
        (
          await pool.query(
            'select * from public.player_profiles where player_id = $1',
            [ownerId],
          )
        ).rows,
      ).toEqual([]);
    }, 30000);
  },
);
