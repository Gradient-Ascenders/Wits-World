import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
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
import { getMigrationsDirectory } from '../src/database/paths.js';
import { createProgressionPersistence } from '../src/progression/progression-persistence.js';
import {
  createProgressionReadService,
  ProgressionProfileUnavailableError,
} from '../src/progression/progression-read-service.js';

const BACKFILL_PLAYER_ID = '17100000-0000-4000-8000-000000000001';
const CONCURRENT_PLAYER_ID = '17100000-0000-4000-8000-000000000002';
const STREAK_PLAYER_ID = '17100000-0000-4000-8000-000000000003';
const TIE_ALPHA_PLAYER_ID = '17100000-0000-4000-8000-000000000004';
const TIE_BETA_PLAYER_ID = '17100000-0000-4000-8000-000000000005';
const ZERO_PLAYER_ID = '17100000-0000-4000-8000-000000000006';
const DELETED_PLAYER_ID = '17100000-0000-4000-8000-000000000007';
const VERSION_PLAYER_ID = '17100000-0000-4000-8000-000000000008';

const BACKFILL_COMPLETION_ID = '17110000-0000-4000-8000-000000000001';
const BACKFILL_WIN_ID = '17120000-0000-4000-8000-000000000001';
const BACKFILL_LOSS_ID = '17120000-0000-4000-8000-000000000002';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'progression persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let previousMigrationsDirectory: string;
    let pool: ReturnType<typeof createDatabasePool>;

    const persistence = createProgressionPersistence();

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_progression_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      previousMigrationsDirectory = await copyMigrationsBeforeProgression();
      await runMigrations(temporaryConfig, previousMigrationsDirectory);

      await withDatabaseClient(temporaryConfig, async (client) => {
        await seedPlayers(client);
        await insertChallengeCompletion(client, {
          completionId: BACKFILL_COMPLETION_ID,
          completedAt: '2026-07-31T21:59:00.000Z',
          namespace: '17130001',
          playerId: BACKFILL_PLAYER_ID,
          scoreCorrect: 5,
        });
        await insertCompletedCpuMatch(client, {
          completedAt: '2026-07-31T22:01:00.000Z',
          matchId: BACKFILL_WIN_ID,
          playerId: BACKFILL_PLAYER_ID,
          winner: 'player',
        });
        await insertCompletedCpuMatch(client, {
          completedAt: '2026-08-01T12:00:00.000Z',
          matchId: BACKFILL_LOSS_ID,
          playerId: BACKFILL_PLAYER_ID,
          winner: 'cpu',
        });
      });

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toEqual([
        '0026_create_player_progression.sql',
        '0027_create_ordered_trails.sql',
        '0028_create_asynchronous_pvp_persistence.sql',
        '0029_curate_author_content_lifecycle.sql',
        '0030_create_campaign_scheduling.sql',
        '0031_create_movement_evidence.sql',
        '0032_add_movement_eligibility_decisions.sql',
        '0033_add_async_pvp_invitation_invalidation.sql',
        '0034_retire_coin_rewards.sql',
        '0035_deny_deleted_identity_tokens.sql',
        '0036_remove_duplicate_indexes.sql',
        '0037_add_async_pvp_voluntary_resignation.sql',
        '0038_add_question_performance_analytics_indexes.sql',
        '0039_add_async_pvp_invitation_cancellation.sql',
        '0040_add_offline_challenge_attempts.sql',
        '0041_complete_card_catalogue.sql',
        '0042_implement_card_evolution.sql',
        '0043_add_content_source_evidence.sql',
        '0044_create_live_pvp_persistence.sql',
        '0045_create_event_placement_persistence.sql',
        '0046_persist_longitudinal_trust.sql',
        '0047_persist_ranked_competition.sql',
        '0048_implement_trust_scoring_and_enforcement.sql',
        '0049_enable_event_placement_services.sql',
        '0050_create_ranked_standings_snapshots.sql',
        '0051_allow_ranked_acceptance_withdrawal.sql',
        '0052_ranked_invalid_proposal_cooldowns.sql',
        '0053_persist_contested_territory.sql',
        '0054_implement_contested_territory_runtime.sql',
        '0055_persist_versioned_card_trades.sql',
        '0056_add_card_trade_submission_receipts.sql',
        '0057_create_advanced_analytics.sql',
        '0058_create_developer_api_access.sql',
        '0059_enable_event_editor_automatic_placement.sql',
        '0060_allow_unlocated_portable_events.sql',
        '0061_persist_trust_review_evidence_summaries.sql',
        '0062_detach_deleted_player_history.sql',
        '0063_purge_deleted_player_progression.sql',
      ]);

      pool = createDatabasePool(temporaryConfig);
    }, 60_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (previousMigrationsDirectory) {
        await rm(previousMigrationsDirectory, {
          force: true,
          recursive: true,
        });
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

    it(
      'backfills versioned points, Johannesburg days, months, and achievements',
      { timeout: 30_000 },
      async () => {
        const rules = await pool.query<{
          outcome_key: string;
          points: number;
          source_kind: string;
        }>(
          `select source_kind, outcome_key, points
           from public.progression_point_rules
          where is_active = true
          order by source_kind, outcome_key`,
        );
        expect(rules.rows).toHaveLength(16);
        expect(rules.rows).toContainEqual({
          source_kind: 'challenge_completion',
          outcome_key: 'score_5',
          points: 50,
        });
        expect(rules.rows).toContainEqual({
          source_kind: 'cpu_match',
          outcome_key: 'loss',
          points: 0,
        });
        expect(rules.rows).toContainEqual({
          source_kind: 'asynchronous_pvp',
          outcome_key: 'turn_forfeit_win',
          points: 25,
        });
        expect(rules.rows).toContainEqual({
          source_kind: 'asynchronous_pvp',
          outcome_key: 'voluntary_resignation_win',
          points: 25,
        });
        expect(rules.rows).toContainEqual({
          source_kind: 'asynchronous_pvp',
          outcome_key: 'voluntary_resignation_loss',
          points: 0,
        });

        const awards = await pool.query<{
          activity_day: string;
          points_awarded: number;
          rule_code: string;
        }>(
          `select activity_day::text, points_awarded, rule_code
           from public.player_point_awards
          where player_id = $1::uuid
          order by occurred_at, id`,
          [BACKFILL_PLAYER_ID],
        );
        expect(awards.rows).toEqual([
          {
            activity_day: '2026-07-31',
            points_awarded: 50,
            rule_code: 'challenge_score_5',
          },
          {
            activity_day: '2026-08-01',
            points_awarded: 25,
            rule_code: 'cpu_match_win',
          },
          {
            activity_day: '2026-08-01',
            points_awarded: 0,
            rule_code: 'cpu_match_loss',
          },
        ]);

        const state = await loadProgressionState(BACKFILL_PLAYER_ID);
        expect(state).toEqual({
          last_activity_day: '2026-08-01',
          longest_streak: 2,
          streak_at_last_activity: 2,
          total_points: 75,
        });

        const monthly = await pool.query<{
          completed_activity_count: number;
          month_start: string;
          total_points: number;
        }>(
          `select month_start::text, total_points, completed_activity_count
           from public.player_monthly_progression
          where player_id = $1::uuid
          order by month_start`,
          [BACKFILL_PLAYER_ID],
        );
        expect(monthly.rows).toEqual([
          {
            completed_activity_count: 1,
            month_start: '2026-07-01',
            total_points: 50,
          },
          {
            completed_activity_count: 2,
            month_start: '2026-08-01',
            total_points: 25,
          },
        ]);

        const achievements = await loadAchievementCodes(BACKFILL_PLAYER_ID);
        expect(achievements).toEqual([
          'first_cpu_win',
          'first_quiz',
          'perfect_quiz',
        ]);
      },
    );

    it(
      'converges concurrent replay on one immutable award',
      { timeout: 30_000 },
      async () => {
        const matchId = '17120000-0000-4000-8000-000000000010';
        await withDatabaseClient(temporaryConfig, (client) =>
          insertCompletedCpuMatch(client, {
            completedAt: '2026-08-04T10:00:00.000Z',
            matchId,
            playerId: CONCURRENT_PLAYER_ID,
            winner: 'player',
          }),
        );

        const results = await Promise.all([
          persistence.recordCpuMatch(pool, matchId),
          persistence.recordCpuMatch(pool, matchId),
        ]);

        expect(results.map((result) => result.wasCreated).sort()).toEqual([
          false,
          true,
        ]);
        expect(new Set(results.map((result) => result.awardId)).size).toBe(1);

        const persisted = await pool.query<{ count: string }>(
          `select count(*)::text
           from public.player_point_awards
          where cpu_match_id = $1::uuid`,
          [matchId],
        );
        expect(persisted.rows[0]?.count).toBe('1');

        await expect(
          pool.query(
            `update public.player_point_awards
              set points_awarded = 999
            where cpu_match_id = $1::uuid`,
            [matchId],
          ),
        ).rejects.toThrow();
      },
    );

    it('preserves historical progression when its completed event is retired', async () => {
      const readService = createProgressionReadService(pool);
      const profileBefore =
        await readService.getCurrentProfile(BACKFILL_PLAYER_ID);
      const standingsBefore = await pool.query(
        `select standing_rank, total_points, current_streak, longest_streak
         from public.player_progression_all_time_standings
         where player_id = $1::uuid`,
        [BACKFILL_PLAYER_ID],
      );

      await pool.query(
        `update public.events event
         set authoring_status = 'retired',
             is_published = false,
             retired_at = now(),
             version = version + 1,
             updated_at = now()
         from public.event_completions completion
         where completion.id = $1::uuid
           and event.id = completion.event_id`,
        [BACKFILL_COMPLETION_ID],
      );

      const profileAfter =
        await readService.getCurrentProfile(BACKFILL_PLAYER_ID);
      const standingsAfter = await pool.query(
        `select standing_rank, total_points, current_streak, longest_streak
         from public.player_progression_all_time_standings
         where player_id = $1::uuid`,
        [BACKFILL_PLAYER_ID],
      );
      const preserved = await pool.query<{
        award_count: number;
        completion_count: number;
        event_status: string;
        provenance: string;
      }>(
        `select
           (select count(*)::int from public.event_completions where id = $1::uuid) completion_count,
           (select count(*)::int from public.player_point_awards where event_completion_id = $1::uuid) award_count,
           event.authoring_status event_status,
           event.publication_provenance provenance
         from public.events event
         join public.event_completions completion on completion.event_id = event.id
         where completion.id = $1::uuid`,
        [BACKFILL_COMPLETION_ID],
      );

      expect(profileAfter).toEqual(profileBefore);
      expect(standingsAfter.rows).toEqual(standingsBefore.rows);
      expect(preserved.rows[0]).toEqual({
        award_count: 1,
        completion_count: 1,
        event_status: 'retired',
        provenance: 'legacy',
      });
    });

    it(
      'serializes concurrent unlocks for five completed matches',
      { timeout: 30_000 },
      async () => {
        const matchIds = Array.from(
          { length: 5 },
          (_, index) =>
            `17120000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
        );

        await withDatabaseClient(temporaryConfig, async (client) => {
          for (const [index, matchId] of matchIds.entries()) {
            await insertCompletedCpuMatch(client, {
              completedAt: `2026-08-05T10:0${index}:00.000Z`,
              matchId,
              playerId: TIE_ALPHA_PLAYER_ID,
              winner: 'player',
            });
          }
        });

        await Promise.all(
          matchIds.map((matchId) => persistence.recordCpuMatch(pool, matchId)),
        );

        expect(await loadAchievementCodes(TIE_ALPHA_PLAYER_ID)).toEqual([
          'first_cpu_win',
          'five_cpu_matches',
        ]);
        expect(await loadProgressionState(TIE_ALPHA_PLAYER_ID)).toMatchObject({
          longest_streak: 1,
          total_points: 125,
        });

        const unlockCount = await pool.query<{ count: string }>(
          `select count(*)::text
           from public.player_achievement_unlocks
          where player_id = $1::uuid
            and achievement_code = 'five_cpu_matches'`,
          [TIE_ALPHA_PLAYER_ID],
        );
        expect(unlockCount.rows[0]?.count).toBe('1');
      },
    );

    it(
      'reconstructs streaks across local midnight and out-of-order activity',
      { timeout: 30_000 },
      async () => {
        const fixtures = [
          ['17120000-0000-4000-8000-000000000030', '2026-07-31T21:59:00.000Z'],
          ['17120000-0000-4000-8000-000000000031', '2026-07-31T22:01:00.000Z'],
          ['17120000-0000-4000-8000-000000000032', '2026-08-01T08:00:00.000Z'],
          ['17120000-0000-4000-8000-000000000033', '2026-08-03T08:00:00.000Z'],
        ] as const;

        for (const [matchId, completedAt] of fixtures) {
          await withDatabaseClient(temporaryConfig, (client) =>
            insertCompletedCpuMatch(client, {
              completedAt,
              matchId,
              playerId: STREAK_PLAYER_ID,
              winner: 'cpu',
            }),
          );
          await persistence.recordCpuMatch(pool, matchId);
        }

        expect(await loadProgressionState(STREAK_PLAYER_ID)).toEqual({
          last_activity_day: '2026-08-03',
          longest_streak: 2,
          streak_at_last_activity: 1,
          total_points: 0,
        });

        const missingDayMatch = '17120000-0000-4000-8000-000000000034';
        await withDatabaseClient(temporaryConfig, (client) =>
          insertCompletedCpuMatch(client, {
            completedAt: '2026-08-02T08:00:00.000Z',
            matchId: missingDayMatch,
            playerId: STREAK_PLAYER_ID,
            winner: 'cpu',
          }),
        );
        await persistence.recordCpuMatch(pool, missingDayMatch);

        expect(await loadProgressionState(STREAK_PLAYER_ID)).toEqual({
          last_activity_day: '2026-08-03',
          longest_streak: 4,
          streak_at_last_activity: 4,
          total_points: 0,
        });
        expect(await loadAchievementCodes(STREAK_PLAYER_ID)).toContain(
          'three_day_streak',
        );
      },
    );

    it(
      'uses prospective rule versions without rewriting old awards',
      { timeout: 30_000 },
      async () => {
        const firstMatchId = '17120000-0000-4000-8000-000000000040';
        const secondMatchId = '17120000-0000-4000-8000-000000000041';

        await withDatabaseClient(temporaryConfig, async (client) => {
          await insertCompletedCpuMatch(client, {
            completedAt: '2026-08-06T08:00:00.000Z',
            matchId: firstMatchId,
            playerId: VERSION_PLAYER_ID,
            winner: 'player',
          });
        });
        await persistence.recordCpuMatch(pool, firstMatchId);

        await withDatabaseClient(temporaryConfig, async (client) => {
          await client.query('begin');
          try {
            await client.query(
              `update public.progression_point_rules
                set is_active = false
              where rule_code = 'cpu_match_win'
                and version = 1`,
            );
            await client.query(
              `insert into public.progression_point_rules (
               rule_code, version, source_kind, outcome_key, points, is_active
             ) values ('cpu_match_win', 2, 'cpu_match', 'win', 30, true)`,
            );
            await client.query('commit');
          } catch (error) {
            await client.query('rollback');
            throw error;
          }
        });

        await withDatabaseClient(temporaryConfig, async (client) => {
          await insertCompletedCpuMatch(client, {
            completedAt: '2026-08-07T08:00:00.000Z',
            matchId: secondMatchId,
            playerId: VERSION_PLAYER_ID,
            winner: 'player',
          });
        });
        await persistence.recordCpuMatch(pool, secondMatchId);

        const awards = await pool.query<{
          points_awarded: number;
          rule_version: number;
        }>(
          `select points_awarded, rule_version
           from public.player_point_awards
          where player_id = $1::uuid
          order by occurred_at`,
          [VERSION_PLAYER_ID],
        );
        expect(awards.rows).toEqual([
          { points_awarded: 25, rule_version: 1 },
          { points_awarded: 30, rule_version: 2 },
        ]);

        await expect(
          pool.query(
            `update public.progression_point_rules
              set points = 100
            where rule_code = 'cpu_match_win'
              and version = 2`,
          ),
        ).rejects.toThrow();

        await withDatabaseClient(temporaryConfig, async (client) => {
          await client.query('begin');
          try {
            await client.query(
              `update public.progression_point_rules
                set is_active = false
              where rule_code = 'cpu_match_win'
                and version = 2`,
            );
            await client.query(
              `update public.progression_point_rules
                set is_active = true
              where rule_code = 'cpu_match_win'
                and version = 1`,
            );
            await client.query('commit');
          } catch (error) {
            await client.query('rollback');
            throw error;
          }
        });
      },
    );

    it(
      'returns competition ranks, stable tie order, and active zero-point players',
      { timeout: 30_000 },
      async () => {
        const tieMatchId = '17120000-0000-4000-8000-000000000050';
        await withDatabaseClient(temporaryConfig, (client) =>
          insertCompletedCpuMatch(client, {
            completedAt: '2026-08-05T12:00:00.000Z',
            matchId: tieMatchId,
            playerId: TIE_BETA_PLAYER_ID,
            winner: 'player',
          }),
        );
        await persistence.recordCpuMatch(pool, tieMatchId);

        const allTime = await pool.query<{
          player_id: string;
          player_name: string | null;
          standing_rank: string;
          total_points: number;
        }>(
          `select player_id::text, player_name, total_points,
                standing_rank::text
           from public.player_progression_all_time_standings
          order by total_points desc, player_name asc nulls last, player_id`,
        );

        for (const row of allTime.rows) {
          const expectedRank =
            allTime.rows.filter(
              (candidate) => candidate.total_points > row.total_points,
            ).length + 1;
          expect(Number(row.standing_rank)).toBe(expectedRank);
        }

        const monthly = await pool.query<{
          player_id: string;
          player_name: string | null;
          standing_rank: string;
          total_points: number;
        }>(
          `select player_id::text, player_name, total_points,
                standing_rank::text
           from public.player_progression_monthly_standings('2026-08-01')
          order by total_points desc, player_name asc nulls last, player_id`,
        );
        expect(monthly.rows.map((row) => row.player_id)).toContain(
          ZERO_PLAYER_ID,
        );
        expect(
          monthly.rows.find((row) => row.player_id === ZERO_PLAYER_ID),
        ).toMatchObject({ total_points: 0 });

        const equalTwentyFive = monthly.rows.filter(
          (row) => row.total_points === 25,
        );
        const names = equalTwentyFive.map((row) => row.player_name);
        expect(names).toEqual(
          [...names].sort((left, right) =>
            (left ?? '').localeCompare(right ?? ''),
          ),
        );
        expect(
          new Set(equalTwentyFive.map((row) => row.standing_rank)).size,
        ).toBe(1);

        const readService = createProgressionReadService(pool);
        const profile =
          await readService.getCurrentProfile(TIE_ALPHA_PLAYER_ID);
        expect(profile).toMatchObject({
          playerName: 'alpha_progression',
          points: 125,
          currentStreak: expect.any(Number),
          longestStreak: expect.any(Number),
          rank: expect.any(Number),
        });
        expect(profile.achievements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'five_cpu_matches',
              earned: true,
              progress: 5,
              target: 5,
            }),
          ]),
        );

        const allTimePage = await readService.listStandings({
          playerId: ZERO_PLAYER_ID,
          period: 'all_time',
          page: 1,
          pageSize: 1,
        });
        expect(allTimePage.entries).toHaveLength(1);
        expect(allTimePage.currentPlayer).toMatchObject({
          playerName: 'zero_progression',
          points: 0,
          isCurrentPlayer: true,
        });
        expect(allTimePage.entries[0]?.isCurrentPlayer).toBe(false);
        expect(allTimePage.pagination).toMatchObject({
          page: 1,
          pageSize: 1,
          totalPlayers: 8,
          totalPages: 8,
        });
        expect(JSON.stringify(allTimePage)).not.toContain(ZERO_PLAYER_ID);

        const monthlyPage = await readService.listStandings({
          playerId: ZERO_PLAYER_ID,
          period: 'monthly',
          month: '2026-08',
          page: 1,
          pageSize: 2,
        });
        expect(monthlyPage).toMatchObject({
          period: 'monthly',
          month: '2026-08',
          currentPlayer: {
            playerName: 'zero_progression',
            points: 0,
            isCurrentPlayer: true,
          },
        });
      },
    );

    it(
      'retains anonymous progression but excludes a deleted player from standings',
      { timeout: 30_000 },
      async () => {
        const matchId = '17120000-0000-4000-8000-000000000060';
        await withDatabaseClient(temporaryConfig, (client) =>
          insertCompletedCpuMatch(client, {
            completedAt: '2026-08-08T08:00:00.000Z',
            matchId,
            playerId: DELETED_PLAYER_ID,
            winner: 'player',
          }),
        );
        await persistence.recordCpuMatch(pool, matchId);

        await pool.query(
          `update public.players
            set auth_issuer = null,
                auth_subject = null,
                player_name = null,
                role = null,
                lifecycle_status = 'deleted',
                updated_at = now()
          where id = $1::uuid`,
          [DELETED_PLAYER_ID],
        );

        expect(await loadProgressionState(DELETED_PLAYER_ID)).toMatchObject({
          total_points: 25,
        });
        expect(await loadAchievementCodes(DELETED_PLAYER_ID)).toContain(
          'first_cpu_win',
        );

        const allTime = await pool.query<{ count: string }>(
          `select count(*)::text
           from public.player_progression_all_time_standings
          where player_id = $1::uuid`,
          [DELETED_PLAYER_ID],
        );
        const monthly = await pool.query<{ count: string }>(
          `select count(*)::text
           from public.player_progression_monthly_standings('2026-08-01')
          where player_id = $1::uuid`,
          [DELETED_PLAYER_ID],
        );
        expect(allTime.rows[0]?.count).toBe('0');
        expect(monthly.rows[0]?.count).toBe('0');

        const readService = createProgressionReadService(pool);
        await expect(
          readService.getCurrentProfile(DELETED_PLAYER_ID),
        ).rejects.toBeInstanceOf(ProgressionProfileUnavailableError);
      },
    );

    it(
      'rejects unfinished and unknown authoritative sources',
      { timeout: 30_000 },
      async () => {
        const activeMatchId = '17120000-0000-4000-8000-000000000070';
        await pool.query(
          `insert into public.cpu_matches (
           id, player_id, status, state, started_at, created_at, updated_at
         ) values (
           $1, $2, 'active', '{}'::jsonb,
           '2026-08-09T08:00:00.000Z',
           '2026-08-09T08:00:00.000Z',
           '2026-08-09T08:00:00.000Z'
         )`,
          [activeMatchId, CONCURRENT_PLAYER_ID],
        );

        await expect(
          persistence.recordCpuMatch(pool, activeMatchId),
        ).rejects.toThrow();
        await expect(
          persistence.recordChallengeCompletion(
            pool,
            '17110000-0000-4000-8000-000000000099',
          ),
        ).rejects.toThrow();
      },
    );

    async function loadProgressionState(playerId: string) {
      const result = await pool.query<{
        last_activity_day: string;
        longest_streak: number;
        streak_at_last_activity: number;
        total_points: number;
      }>(
        `select total_points, streak_at_last_activity, longest_streak,
                last_activity_day::text
           from public.player_progression_state
          where player_id = $1::uuid`,
        [playerId],
      );

      return result.rows[0];
    }

    async function loadAchievementCodes(playerId: string): Promise<string[]> {
      const result = await pool.query<{ achievement_code: string }>(
        `select achievement_code
           from public.player_achievement_unlocks
          where player_id = $1::uuid
          order by achievement_code`,
        [playerId],
      );

      return result.rows.map((row) => row.achievement_code);
    }
  },
);

async function copyMigrationsBeforeProgression(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(
    join(tmpdir(), 'wits-progression-migrations-'),
  );
  const migrationNames = (await readdir(sourceDirectory))
    .filter(
      (name) =>
        name.endsWith('.sql') && name < '0026_create_player_progression.sql',
    )
    .sort();

  await Promise.all(
    migrationNames.map((name) =>
      copyFile(join(sourceDirectory, name), join(targetDirectory, name)),
    ),
  );

  return targetDirectory;
}

async function seedPlayers(client: pg.PoolClient): Promise<void> {
  const players = [
    [BACKFILL_PLAYER_ID, 'progression_backfill'],
    [CONCURRENT_PLAYER_ID, 'p_concurrent'],
    [STREAK_PLAYER_ID, 'p_streak'],
    [TIE_ALPHA_PLAYER_ID, 'alpha_progression'],
    [TIE_BETA_PLAYER_ID, 'beta_progression'],
    [ZERO_PLAYER_ID, 'zero_progression'],
    [DELETED_PLAYER_ID, 'deleted_progression'],
    [VERSION_PLAYER_ID, 'version_progression'],
  ] as const;

  for (const [playerId, playerName] of players) {
    await client.query(
      `insert into public.players (
         id, auth_issuer, auth_subject, player_name, role
       ) values ($1, 'https://issuer.example/', $2, $3, 'player')`,
      [playerId, `auth0|${playerName}`, playerName],
    );
  }
}

async function insertCompletedCpuMatch(
  client: Pick<pg.PoolClient, 'query'>,
  input: {
    completedAt: string;
    matchId: string;
    playerId: string;
    winner: 'cpu' | 'player';
  },
): Promise<void> {
  const startedAt = new Date(
    new Date(input.completedAt).getTime() - 5 * 60 * 1000,
  ).toISOString();

  await client.query(
    `insert into public.cpu_matches (
       id, player_id, status, state, winner, started_at, completed_at,
       created_at, updated_at
     ) values (
       $1, $2, 'completed', '{}'::jsonb, $3,
       $4, $5, $4, $5
     )`,
    [input.matchId, input.playerId, input.winner, startedAt, input.completedAt],
  );
}

async function insertChallengeCompletion(
  client: pg.PoolClient,
  input: {
    completionId: string;
    completedAt: string;
    namespace: string;
    playerId: string;
    scoreCorrect: number;
  },
): Promise<void> {
  const eventId = fixtureUuid(input.namespace, 1);
  const challengeId = fixtureUuid(input.namespace, 2);
  const attemptId = fixtureUuid(input.namespace, 3);
  const startedAt = new Date(
    new Date(input.completedAt).getTime() - 60 * 1000,
  ).toISOString();
  const deadline = new Date(
    new Date(startedAt).getTime() + 90 * 1000,
  ).toISOString();

  await client.query('begin');

  try {
    await client.query(
      `insert into public.events (
         id, title, location, radius_metres, starts_at, ends_at, is_published
       ) values (
         $1,
         'Progression fixture',
         st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
         75,
         '2026-01-01T00:00:00.000Z',
         '2027-01-01T00:00:00.000Z',
         true
       )`,
      [eventId],
    );
    await client.query(
      `insert into public.event_challenges (id, event_id, status)
       values ($1, $2, 'draft')`,
      [challengeId, eventId],
    );

    await client.query(
      'alter table public.challenge_attempts disable trigger challenge_attempts_snapshot_integrity',
    );
    await client.query(
      `insert into public.challenge_attempts (
         id, player_id, event_id, challenge_id, status, started_at,
         deadline, time_limit_seconds, average_difficulty, completed_at,
         completion_reason, score_correct, created_at, updated_at
       ) values (
         $1, $2, $3, $4, 'completed', $5, $6, 90, 1.00, $7,
         'answered', $8, $5, $7
       )`,
      [
        attemptId,
        input.playerId,
        eventId,
        challengeId,
        startedAt,
        deadline,
        input.completedAt,
        input.scoreCorrect,
      ],
    );
    await client.query(
      'alter table public.challenge_attempts enable trigger challenge_attempts_snapshot_integrity',
    );
    await client.query(
      `insert into public.event_completions (
         id, attempt_id, player_id, event_id, score_correct,
         average_difficulty, coins_awarded, reward_policy_version,
         completed_at
       ) values ($1, $2, $3, $4, $5, 1.00, 0, 'progression-test', $6)`,
      [
        input.completionId,
        attemptId,
        input.playerId,
        eventId,
        input.scoreCorrect,
        input.completedAt,
      ],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function fixtureUuid(namespace: string, value: number): string {
  return `${namespace}-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
