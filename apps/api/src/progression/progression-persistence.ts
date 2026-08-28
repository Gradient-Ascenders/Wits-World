import type pg from 'pg';

export type ProgressionSourceKind = 'challenge_completion' | 'cpu_match';

export interface ProgressionQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface ProgressionAwardResult {
  awardId: string;
  playerId: string;
  pointsAwarded: number;
  ruleCode: string;
  ruleVersion: number;
  sourceKind: ProgressionSourceKind;
  wasCreated: boolean;
}

export interface ProgressionPersistence {
  recordChallengeCompletion(
    database: ProgressionQueryable,
    completionId: string,
  ): Promise<ProgressionAwardResult>;
  recordCpuMatch(
    database: ProgressionQueryable,
    matchId: string,
  ): Promise<ProgressionAwardResult>;
}

interface ProgressionAwardRow extends pg.QueryResultRow {
  award_id: string;
  player_id: string;
  points_awarded: number;
  rule_code: string;
  rule_version: number;
  was_created: boolean;
}

export function createProgressionPersistence(): ProgressionPersistence {
  return {
    recordChallengeCompletion(database, completionId) {
      return recordSource(
        database,
        'challenge_completion',
        'private.record_challenge_completion_progression',
        completionId,
      );
    },

    recordCpuMatch(database, matchId) {
      return recordSource(
        database,
        'cpu_match',
        'private.record_cpu_match_progression',
        matchId,
      );
    },
  };
}

async function recordSource(
  database: ProgressionQueryable,
  sourceKind: ProgressionSourceKind,
  databaseFunction: string,
  sourceId: string,
): Promise<ProgressionAwardResult> {
  const result = await database.query<ProgressionAwardRow>(
    `
      select
        award_id::text,
        player_id::text,
        points_awarded,
        rule_code,
        rule_version,
        was_created
      from ${databaseFunction}($1::uuid)
    `,
    [sourceId],
  );
  const award = result.rows[0];

  if (!award) {
    throw new Error(`Progression persistence returned no ${sourceKind} award.`);
  }

  return {
    awardId: award.award_id,
    playerId: award.player_id,
    pointsAwarded: award.points_awarded,
    ruleCode: award.rule_code,
    ruleVersion: award.rule_version,
    sourceKind,
    wasCreated: award.was_created,
  };
}
