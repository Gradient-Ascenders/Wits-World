import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  calculateTrustScore,
  effectiveSignalPoints,
  impossibleMovementSignal,
  TRUST_POLICY_VERSION,
  type TrustReviewBand,
  type TrustSignalType,
} from './trust-policy.js';

export interface TrustQueryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface TrustDatabase {
  connect(): Promise<TrustQueryable & { release(): void }>;
}

interface TrustSignalInputBase {
  playerId: string;
  severity: string;
  basePoints: number;
  observedAt: Date;
  sourceType: string;
  sourceIdentifier: string;
  deduplicationKey: string;
}

export type OpponentConcentrationReviewSummary = {
  kind: 'opponent_concentration';
  evaluationWindowStart: string;
  evaluationWindowEnd: string;
  completedMatchCount: number;
  repeatedOpponentMatchCount: number;
  opponentConcentrationRatio: number;
  minimumCompletedMatchCount: 6;
  minimumOpponentConcentrationRatio: 0.8;
};

export type OneSidedOutcomeReviewSummary = {
  kind: 'one_sided_outcome_pattern';
  evaluationWindowStart: string;
  evaluationWindowEnd: string;
  qualifyingForfeitCount: number;
  minimumQualifyingForfeitCount: 4;
};

export type TrustSignalReviewSummary =
  OpponentConcentrationReviewSummary | OneSidedOutcomeReviewSummary;

type NonOpponentPatternSignalType = Exclude<
  TrustSignalType,
  'opponent_concentration' | 'one_sided_outcome_pattern'
>;

export type TrustSignalInput = TrustSignalInputBase &
  (
    | {
        signalType: 'opponent_concentration';
        reviewSummary: OpponentConcentrationReviewSummary;
      }
    | {
        signalType: 'one_sided_outcome_pattern';
        reviewSummary: OneSidedOutcomeReviewSummary;
      }
    | {
        signalType: NonOpponentPatternSignalType;
        reviewSummary?: never;
      }
  );

export interface TrustEvaluationResult {
  snapshotId: string;
  finalScore: number;
  reviewBand: TrustReviewBand;
  createdCaseId: string | null;
  caseId: string | null;
}

export interface TrustRetentionCleanupResult {
  signalRowsDeleted: number;
  snapshotRowsDeleted: number;
  caseRowsDeleted: number;
}

export interface TrustService {
  recordSignal(input: TrustSignalInput): Promise<boolean>;
  recordSignalWithinTransaction(
    client: TrustQueryable,
    input: TrustSignalInput,
    evaluatedAt?: Date,
  ): Promise<boolean>;
  recordImpossibleMovementWithinTransaction(
    client: TrustQueryable,
    input: {
      playerId: string;
      decisionId: string;
      requiredSpeedMetresPerSecond: number;
      maxPlausibleSpeedMetresPerSecond: number;
    },
  ): Promise<boolean>;
  recordSubmissionConflict(input: {
    playerId: string;
    operation: string;
    resourceIdentifier: string;
    submissionId: string;
  }): Promise<boolean>;
  evaluatePlayer(playerId: string): Promise<TrustEvaluationResult>;
  evaluatePlayerWithinTransaction(
    client: TrustQueryable,
    playerId: string,
    evaluatedAt?: Date,
  ): Promise<TrustEvaluationResult>;
  evaluateOpponentPatternsForMatch(matchId: string): Promise<void>;
  evaluateOpponentPatternsForMatchWithinTransaction(
    client: TrustQueryable,
    matchId: string,
  ): Promise<void>;
  evaluateMaintenanceBatch(limit?: number): Promise<number>;
  purgeExpiredData(): Promise<TrustRetentionCleanupResult>;
}

interface SignalRow extends pg.QueryResultRow {
  id: string;
  signal_type: TrustSignalType;
  base_points: number;
  observed_at: Date;
  adjusted_false_positive: boolean;
  severity: string;
  source_type: string;
  review_summary: TrustSignalReviewSummary | null;
}

interface CaseRow extends pg.QueryResultRow {
  id: string;
  status: 'open' | 'under_review';
  version: number;
  current_score: number;
  current_band: TrustReviewBand;
  opened_at: Date;
  updated_at: Date;
}

interface MatchPatternRow extends pg.QueryResultRow {
  player_low_id: string;
  player_high_id: string;
  completed_at: Date;
}

interface PairCountRow extends pg.QueryResultRow {
  player_id: string;
  total_matches: number;
  pair_matches: number;
}

interface OneSidedRow extends pg.QueryResultRow {
  winner_player_id: string;
  matching_forfeits: number;
}

interface DatabaseNowRow extends pg.QueryResultRow {
  now: Date;
}

const DECAY_RESOLUTION_MS = 7 * 24 * 60 * 60 * 1000;

export function createTrustService(
  database: TrustDatabase,
  { createId = randomUUID }: { createId?: () => string } = {},
): TrustService {
  const service: TrustService = {
    async recordSignal(input) {
      const client = await database.connect();
      try {
        await client.query('begin');
        const inserted = await service.recordSignalWithinTransaction(
          client,
          input,
        );
        await client.query('commit');
        return inserted;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async recordSignalWithinTransaction(client, input, evaluatedAt) {
      validateSignalInput(input);
      await lockPlayerTrust(client, input.playerId);
      const digest = createHash('sha256')
        .update(
          stableJson({
            policyVersion: TRUST_POLICY_VERSION,
            playerId: input.playerId,
            signalType: input.signalType,
            deduplicationKey: input.deduplicationKey,
          }),
        )
        .digest();
      const insert = await client.query<{ id: string }>(
        `
          insert into private.trust_signals (
            id, player_id, policy_version, signal_type, severity, base_points,
            observed_at, expires_at, source_type, source_identifier,
            deduplication_digest, review_summary
          ) values (
            $1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz,
            $7::timestamptz + interval '90 days',
            $8, $9, $10, $11::jsonb
          )
          on conflict (player_id, policy_version, signal_type, deduplication_digest)
          do nothing
          returning id::text
        `,
        [
          createId(),
          input.playerId,
          TRUST_POLICY_VERSION,
          input.signalType,
          input.severity,
          input.basePoints,
          input.observedAt,
          input.sourceType,
          input.sourceIdentifier,
          digest,
          input.reviewSummary ? JSON.stringify(input.reviewSummary) : null,
        ],
      );
      if (!insert.rows[0]) return false;

      if (input.signalType === 'idempotency_payload_conflict') {
        await maybeRecordSubmissionPattern(
          client,
          input.playerId,
          input.observedAt,
          createId,
        );
      }
      await service.evaluatePlayerWithinTransaction(
        client,
        input.playerId,
        evaluatedAt,
      );
      return true;
    },

    async recordImpossibleMovementWithinTransaction(client, input) {
      const derived = impossibleMovementSignal(
        input.requiredSpeedMetresPerSecond,
        input.maxPlausibleSpeedMetresPerSecond,
      );
      const observedAt = await databaseNow(client);
      return service.recordSignalWithinTransaction(
        client,
        {
          playerId: input.playerId,
          signalType: 'impossible_movement',
          severity: derived.severity,
          basePoints: derived.basePoints,
          observedAt,
          sourceType: 'movement_decision',
          sourceIdentifier: input.decisionId,
          deduplicationKey: input.decisionId,
        },
        observedAt,
      );
    },

    async recordSubmissionConflict(input) {
      const client = await database.connect();
      try {
        await client.query('begin');
        const now = await databaseNow(client);
        const inserted = await service.recordSignalWithinTransaction(
          client,
          {
            playerId: input.playerId,
            signalType: 'idempotency_payload_conflict',
            severity: 'conflict',
            basePoints: 10,
            observedAt: now,
            sourceType: 'submission_conflict',
            sourceIdentifier: `${input.operation}:${input.resourceIdentifier}:${input.submissionId}`,
            deduplicationKey: `${input.operation}:${input.resourceIdentifier}:${input.submissionId}`,
          },
          now,
        );
        await client.query('commit');
        return inserted;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async evaluatePlayer(playerId) {
      const client = await database.connect();
      try {
        await client.query('begin');
        const result = await service.evaluatePlayerWithinTransaction(
          client,
          playerId,
        );
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async evaluatePlayerWithinTransaction(client, playerId, evaluatedAt) {
      await lockPlayerTrust(client, playerId);
      const now = evaluatedAt ?? (await databaseNow(client));
      const signalsResult = await client.query<SignalRow>(
        `
          select signal.id::text,
                 signal.signal_type,
                 signal.severity,
                 signal.base_points,
                 signal.observed_at,
                 signal.source_type,
                 signal.review_summary,
                 exists (
                   select 1
                     from private.trust_signal_adjustments adjustment
                    where adjustment.original_signal_id = signal.id
                      and adjustment.adjustment_type = 'reviewed_false_positive'
                      and adjustment.effective_at <= $2::timestamptz
                 ) as adjusted_false_positive
            from private.trust_signals signal
           where signal.player_id = $1::uuid
             and signal.policy_version = $3
             and signal.observed_at <= $2::timestamptz
             and signal.expires_at > $2::timestamptz
           order by signal.id
        `,
        [playerId, now, TRUST_POLICY_VERSION],
      );
      const signals = signalsResult.rows.map((row) => ({
        id: row.id,
        signalType: row.signal_type,
        basePoints: row.base_points,
        observedAt: row.observed_at,
        adjustedFalsePositive: row.adjusted_false_positive,
      }));
      const score = calculateTrustScore({ evaluatedAt: now, signals });
      const latest = await client.query<{
        id: string;
        movement_points: number;
        submission_conflict_points: number;
        opponent_pattern_points: number;
        final_score: number;
        review_band: TrustReviewBand;
        source_signal_count: number;
        calculation_digest: Buffer;
      }>(
        `
          select id::text, movement_points, submission_conflict_points,
                 opponent_pattern_points, final_score, review_band,
                 source_signal_count, calculation_digest
            from private.trust_score_snapshots
           where player_id = $1::uuid
             and policy_version = $2
           order by evaluated_at desc, id desc
           limit 1
        `,
        [playerId, TRUST_POLICY_VERSION],
      );
      const previous = latest.rows[0];
      const sameProjection =
        previous?.movement_points === score.movementPoints &&
        previous.submission_conflict_points ===
          score.submissionConflictPoints &&
        previous.opponent_pattern_points === score.opponentPatternPoints &&
        previous.final_score === score.finalScore &&
        previous.review_band === score.reviewBand &&
        previous.source_signal_count === score.sourceSignalCount &&
        previous.calculation_digest.equals(score.calculationDigest);

      const snapshotId = sameProjection && previous ? previous.id : createId();
      if (!(sameProjection && previous)) {
        await client.query(
          `
            insert into private.trust_score_snapshots (
              id, player_id, policy_version, evaluated_at,
              movement_points, submission_conflict_points,
              opponent_pattern_points, final_score, review_band,
              source_signal_count, calculation_digest,
              purge_after
            ) values (
              $1::uuid, $2::uuid, $3, $4::timestamptz,
              $5, $6, $7, $8, $9, $10, $11,
              $4::timestamptz + interval '12 months'
            )
          `,
          [
            snapshotId,
            playerId,
            TRUST_POLICY_VERSION,
            now,
            score.movementPoints,
            score.submissionConflictPoints,
            score.opponentPatternPoints,
            score.finalScore,
            score.reviewBand,
            score.sourceSignalCount,
            score.calculationDigest,
          ],
        );
      }

      const caseResult = await client.query<CaseRow>(
        `
          select id::text, status, version, current_score, current_band,
                 opened_at, updated_at
            from private.trust_cases
           where player_id = $1::uuid
             and status in ('open', 'under_review')
           for update
        `,
        [playerId],
      );
      const currentCase = caseResult.rows[0];
      let caseId = currentCase?.id ?? null;
      let createdCaseId: string | null = null;
      let canOpenCase = score.finalScore >= 25;

      if (!currentCase && canOpenCase) {
        const latestResolved = await client.query<{ resolved_at: Date }>(
          `
            select resolved_at
              from private.trust_cases
             where player_id = $1::uuid
               and status = 'resolved'
               and resolved_at is not null
             order by resolved_at desc, id desc
             limit 1
          `,
          [playerId],
        );
        const resolvedAt = latestResolved.rows[0]?.resolved_at;
        if (resolvedAt) {
          canOpenCase = signalsResult.rows.some(
            (row) =>
              !row.adjusted_false_positive &&
              row.observed_at > resolvedAt &&
              effectiveSignalPoints(
                { basePoints: row.base_points, observedAt: row.observed_at },
                now,
              ) > 0,
          );
        }
      }

      if (!currentCase && canOpenCase) {
        caseId = createId();
        createdCaseId = caseId;
        await client.query(
          `
            insert into private.trust_cases (
              id, player_id, policy_version, status, version,
              current_score, current_band, latest_score_snapshot_id,
              opened_at, updated_at
            ) values ($1::uuid, $2::uuid, $3, 'open', 1, $4, $5, $6::uuid, $7, $7)
          `,
          [
            caseId,
            playerId,
            TRUST_POLICY_VERSION,
            score.finalScore,
            score.reviewBand,
            snapshotId,
            now,
          ],
        );
        await insertSystemDecision(client, {
          id: createId(),
          caseId,
          versionBefore: 0,
          versionAfter: 1,
          previousStatus: null,
          resultingStatus: 'open',
          decisionType: 'case_opened',
          reasonCode: 'score_threshold_crossed',
          snapshotId,
          createdAt: now,
        });
      } else if (currentCase) {
        const shouldDecayResolve =
          currentCase.status === 'open' &&
          score.finalScore < 25 &&
          (await belowThresholdForSevenDays(client, playerId, now)) &&
          !(await hasActiveRestriction(client, currentCase.id, now));
        const projectionChanged =
          !sameProjection ||
          currentCase.current_score !== score.finalScore ||
          currentCase.current_band !== score.reviewBand;
        if (shouldDecayResolve || projectionChanged) {
          const resultingStatus = shouldDecayResolve
            ? ('resolved' as const)
            : currentCase.status;
          const nextVersion = currentCase.version + 1;
          await client.query(
            `
              update private.trust_cases
                 set status = $2,
                     version = $3,
                     current_score = $4,
                     current_band = $5,
                     latest_score_snapshot_id = $6::uuid,
                     updated_at = $7,
                     resolved_at = case when $2 = 'resolved' then $7 else resolved_at end,
                     resolution_reason = case when $2 = 'resolved' then 'decayed' else resolution_reason end
               where id = $1::uuid
            `,
            [
              currentCase.id,
              resultingStatus,
              nextVersion,
              score.finalScore,
              score.reviewBand,
              snapshotId,
              now,
            ],
          );
          await insertSystemDecision(client, {
            id: createId(),
            caseId: currentCase.id,
            versionBefore: currentCase.version,
            versionAfter: nextVersion,
            previousStatus: currentCase.status,
            resultingStatus,
            decisionType: shouldDecayResolve
              ? 'case_resolved'
              : 'score_updated',
            reasonCode: shouldDecayResolve ? 'decayed' : 'score_recalculated',
            snapshotId,
            createdAt: now,
          });
        }
      }

      if (caseId) {
        for (const row of signalsResult.rows) {
          if (
            row.adjusted_false_positive ||
            effectiveSignalPoints(
              { basePoints: row.base_points, observedAt: row.observed_at },
              now,
            ) <= 0
          ) {
            continue;
          }
          await client.query(
            `
              insert into private.trust_case_evidence (
                id, case_id, original_signal_id, signal_type, severity,
                base_points, observed_at, policy_version, safe_source_type,
                safe_review_summary
              ) values (
                $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
                $10::jsonb
              )
              on conflict (case_id, original_signal_id) do nothing
            `,
            [
              createId(),
              caseId,
              row.id,
              row.signal_type,
              row.severity,
              row.base_points,
              row.observed_at,
              TRUST_POLICY_VERSION,
              row.source_type,
              row.review_summary ? JSON.stringify(row.review_summary) : null,
            ],
          );
        }
      }

      return {
        snapshotId,
        finalScore: score.finalScore,
        reviewBand: score.reviewBand,
        createdCaseId,
        caseId,
      };
    },

    async evaluateOpponentPatternsForMatch(matchId) {
      const client = await database.connect();
      try {
        await client.query('begin');
        await service.evaluateOpponentPatternsForMatchWithinTransaction(
          client,
          matchId,
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async evaluateOpponentPatternsForMatchWithinTransaction(client, matchId) {
      const context = await loadCompletedPvpMatchContext(client, matchId);
      if (!context) return;

      const now = context.completed_at;
      const pairKey = [context.player_low_id, context.player_high_id].sort();
      if (!(await bothPlayersAreActive(client, pairKey))) return;

      const counts = await loadThirtyDayPairCounts(client, pairKey, now);
      const eligible =
        counts.length === 2 &&
        counts.every((row) => {
          return (
            Number(row.total_matches) >= 6 &&
            Number(row.pair_matches) / Number(row.total_matches) >= 0.8
          );
        });
      if (eligible) {
        const week = utcWeekKey(now);
        for (const playerId of pairKey) {
          const playerCounts = counts.find((row) => row.player_id === playerId);
          if (!playerCounts) continue;
          const completedMatchCount = Number(playerCounts.total_matches);
          const repeatedOpponentMatchCount = Number(playerCounts.pair_matches);
          await service.recordSignalWithinTransaction(client, {
            playerId,
            signalType: 'opponent_concentration',
            severity: 'pattern',
            basePoints: 20,
            observedAt: now,
            sourceType: 'pvp_pattern',
            sourceIdentifier: matchId,
            deduplicationKey: `opponent_concentration:${pairKey.join(':')}:${week}`,
            reviewSummary: {
              kind: 'opponent_concentration',
              evaluationWindowStart: windowStart(now, 30),
              evaluationWindowEnd: now.toISOString(),
              completedMatchCount,
              repeatedOpponentMatchCount,
              opponentConcentrationRatio:
                repeatedOpponentMatchCount / completedMatchCount,
              minimumCompletedMatchCount: 6,
              minimumOpponentConcentrationRatio: 0.8,
            },
          });
        }
      }

      const oneSided = await loadSevenDayOneSidedCounts(client, pairKey, now);
      const repeatedWinner = oneSided.rows.find(
        (row) => Number(row.matching_forfeits) >= 4,
      );
      if (repeatedWinner) {
        const week = utcWeekKey(now);
        const qualifyingForfeitCount = Number(repeatedWinner.matching_forfeits);
        for (const playerId of pairKey) {
          await service.recordSignalWithinTransaction(client, {
            playerId,
            signalType: 'one_sided_outcome_pattern',
            severity: 'pattern',
            basePoints: 10,
            observedAt: now,
            sourceType: 'pvp_pattern',
            sourceIdentifier: matchId,
            deduplicationKey: `one_sided_outcome:${pairKey.join(':')}:${week}`,
            reviewSummary: {
              kind: 'one_sided_outcome_pattern',
              evaluationWindowStart: windowStart(now, 7),
              evaluationWindowEnd: now.toISOString(),
              qualifyingForfeitCount,
              minimumQualifyingForfeitCount: 4,
            },
          });
        }
      }
    },

    async evaluateMaintenanceBatch(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new RangeError(
          'Trust maintenance batch size must be between 1 and 1000.',
        );
      }
      const client = await database.connect();
      let candidates: { player_id: string }[];
      let recentMatches: { match_id: string }[];
      try {
        candidates = (
          await client.query<{ player_id: string }>(
            `
              select distinct candidate.player_id::text as player_id
                from (
                  select signal.player_id
                    from private.trust_signals signal
                    join public.players player on player.id = signal.player_id
                   where player.lifecycle_status = 'active'
                     and signal.expires_at > clock_timestamp()
                  union
                  select trust_case.player_id
                    from private.trust_cases trust_case
                    join public.players player on player.id = trust_case.player_id
                   where player.lifecycle_status = 'active'
                     and trust_case.status in ('open', 'under_review')
                ) candidate
               order by candidate.player_id::text
               limit $1
            `,
            [limit],
          )
        ).rows;
        recentMatches = (
          await client.query<{ match_id: string }>(
            `
              select match_id
                from (
                  select match.id::text as match_id, match.completed_at
                    from public.async_pvp_matches match
                   where match.status = 'completed'
                     and match.completed_at > clock_timestamp() - interval '30 days'
                  union all
                  select match.id::text as match_id, match.completed_at
                    from public.live_pvp_matches match
                   where match.status = 'completed'
                     and match.completed_at > clock_timestamp() - interval '30 days'
                ) completed
               order by md5(
                 match_id || ':' || date_trunc('hour', clock_timestamp())::text
               ), match_id
               limit $1
            `,
            [limit],
          )
        ).rows;
      } finally {
        client.release();
      }

      let evaluated = 0;
      for (const candidate of candidates) {
        await service.evaluatePlayer(candidate.player_id);
        evaluated += 1;
      }
      for (const match of recentMatches) {
        await service.evaluateOpponentPatternsForMatch(match.match_id);
      }
      return evaluated;
    },

    async purgeExpiredData() {
      const client = await database.connect();
      try {
        const result = await client.query<{
          signal_rows_deleted: number;
          snapshot_rows_deleted: number;
          case_rows_deleted: number;
        }>(
          `
            select
              signal_rows_deleted,
              snapshot_rows_deleted,
              case_rows_deleted
            from private.purge_expired_trust_data(clock_timestamp())
          `,
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error('Trust retention cleanup returned no result.');
        }
        return {
          signalRowsDeleted: Number(row.signal_rows_deleted),
          snapshotRowsDeleted: Number(row.snapshot_rows_deleted),
          caseRowsDeleted: Number(row.case_rows_deleted),
        };
      } finally {
        client.release();
      }
    },
  };

  return service;
}

async function maybeRecordSubmissionPattern(
  client: TrustQueryable,
  playerId: string,
  observedAt: Date,
  createId: () => string,
): Promise<void> {
  const count = await client.query<{ conflict_count: number }>(
    `
      select count(*)::integer as conflict_count
        from private.trust_signals
       where player_id = $1::uuid
         and policy_version = $2
         and signal_type = 'idempotency_payload_conflict'
         and observed_at > $3::timestamptz - interval '24 hours'
         and observed_at <= $3::timestamptz
    `,
    [playerId, TRUST_POLICY_VERSION, observedAt],
  );
  if ((count.rows[0]?.conflict_count ?? 0) < 3) return;

  const bucket = String(Math.floor(observedAt.getTime() / 86_400_000));
  const digest = createHash('sha256')
    .update(
      stableJson({
        policyVersion: TRUST_POLICY_VERSION,
        playerId,
        signalType: 'submission_conflict_pattern',
        bucket,
      }),
    )
    .digest();
  await client.query(
    `
      insert into private.trust_signals (
        id, player_id, policy_version, signal_type, severity, base_points,
        observed_at, expires_at, source_type, source_identifier,
        deduplication_digest
      ) values (
        $1::uuid, $2::uuid, $3, 'submission_conflict_pattern', 'pattern', 10,
        $4::timestamptz, $4::timestamptz + interval '90 days',
        'submission_pattern', $5, $6
      )
      on conflict (player_id, policy_version, signal_type, deduplication_digest)
      do nothing
    `,
    [createId(), playerId, TRUST_POLICY_VERSION, observedAt, bucket, digest],
  );
}

async function lockPlayerTrust(
  client: TrustQueryable,
  playerId: string,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `trust-player:${playerId}`,
  ]);
}

async function databaseNow(client: TrustQueryable): Promise<Date> {
  const result = await client.query<DatabaseNowRow>(
    'select clock_timestamp() as now',
  );
  const now = result.rows[0]?.now;
  if (!now) throw new Error('Database did not return trust evaluation time.');
  return now;
}

async function insertSystemDecision(
  client: TrustQueryable,
  input: {
    id: string;
    caseId: string;
    versionBefore: number;
    versionAfter: number;
    previousStatus: 'open' | 'under_review' | null;
    resultingStatus: 'open' | 'under_review' | 'resolved';
    decisionType: string;
    reasonCode: string;
    snapshotId: string;
    createdAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into private.trust_case_decisions (
        id, case_id, actor_type, actor_player_id, policy_version,
        case_version_before, case_version_after, decision_type,
        previous_status, resulting_status, reason_code,
        resulting_score_snapshot_id, created_at
      ) values (
        $1::uuid, $2::uuid, 'system', null, $3,
        $4, $5, $6, $7, $8, $9, $10::uuid, $11
      )
    `,
    [
      input.id,
      input.caseId,
      TRUST_POLICY_VERSION,
      input.versionBefore,
      input.versionAfter,
      input.decisionType,
      input.previousStatus,
      input.resultingStatus,
      input.reasonCode,
      input.snapshotId,
      input.createdAt,
    ],
  );
}

async function belowThresholdForSevenDays(
  client: TrustQueryable,
  playerId: string,
  now: Date,
): Promise<boolean> {
  const result = await client.query<{ below_since: Date | null }>(
    `
      with last_above as (
        select max(evaluated_at) as evaluated_at
          from private.trust_score_snapshots
         where player_id = $1::uuid
           and policy_version = $2
           and final_score >= 25
           and evaluated_at <= $3
      )
      select min(snapshot.evaluated_at) as below_since
        from private.trust_score_snapshots snapshot, last_above
       where snapshot.player_id = $1::uuid
         and snapshot.policy_version = $2
         and snapshot.final_score < 25
         and snapshot.evaluated_at <= $3
         and (last_above.evaluated_at is null
              or snapshot.evaluated_at > last_above.evaluated_at)
    `,
    [playerId, TRUST_POLICY_VERSION, now],
  );
  const belowSince = result.rows[0]?.below_since;
  return Boolean(
    belowSince && now.getTime() - belowSince.getTime() >= DECAY_RESOLUTION_MS,
  );
}

async function hasActiveRestriction(
  client: TrustQueryable,
  caseId: string,
  now: Date,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      select exists (
        select 1
          from private.trust_restrictions restriction
          left join private.trust_appeals appeal
            on appeal.challenged_decision_id = restriction.decision_id
          left join private.trust_appeal_resolutions resolution
            on resolution.appeal_id = appeal.id
         where restriction.case_id = $1::uuid
           and coalesce(
                 case resolution.outcome
                   when 'upheld' then restriction.original_expires_at
                   else least(restriction.original_expires_at, resolution.effective_expires_at)
                 end,
                 restriction.original_expires_at
               ) > $2
      ) as exists
    `,
    [caseId, now],
  );
  return result.rows[0]?.exists ?? false;
}

async function loadCompletedPvpMatchContext(
  client: TrustQueryable,
  matchId: string,
): Promise<MatchPatternRow | null> {
  const result = await client.query<MatchPatternRow>(
    `
      with completed as (
        select participant.player_id::text,
               match.completed_at
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant
            on participant.match_id = match.id
         where match.id = $1::uuid
           and match.status = 'completed'
        union all
        select participant.player_id::text,
               match.completed_at
          from public.live_pvp_matches match
          join public.live_pvp_match_participants participant
            on participant.match_id = match.id
         where match.id = $1::uuid
           and match.status = 'completed'
      )
      select min(player_id) as player_low_id,
             max(player_id) as player_high_id,
             max(completed_at) as completed_at
        from completed
      having count(*) = 2
    `,
    [matchId],
  );
  return result.rows[0] ?? null;
}

async function bothPlayersAreActive(
  client: TrustQueryable,
  pair: readonly string[],
): Promise<boolean> {
  const result = await client.query<{ count: number }>(
    `
      select count(*)::integer as count
        from public.players
       where id = any(array[$1::uuid, $2::uuid])
         and lifecycle_status = 'active'
    `,
    [pair[0], pair[1]],
  );
  return (result.rows[0]?.count ?? 0) === 2;
}

async function loadThirtyDayPairCounts(
  client: TrustQueryable,
  pair: readonly string[],
  now: Date,
): Promise<PairCountRow[]> {
  const result = await client.query<PairCountRow>(
    `
      with completed as (
        select 'async:' || match.id::text as match_id,
               match.completed_at,
               participant.player_id::text
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '30 days'
           and match.completed_at <= $3::timestamptz
        union all
        select 'live:' || match.id::text,
               match.completed_at,
               participant.player_id::text
          from public.live_pvp_matches match
          join public.live_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '30 days'
           and match.completed_at <= $3::timestamptz
      ), matches as (
        select match_id,
               max(completed_at) as completed_at,
               array_agg(player_id order by player_id) as players
          from completed
         group by match_id
        having count(*) = 2
      )
      select player.player_id,
             count(*)::integer as total_matches,
             count(*) filter (where matches.players = array[$1::text, $2::text])::integer as pair_matches
        from (values ($1::text), ($2::text)) player(player_id)
        join matches on player.player_id = any(matches.players)
       group by player.player_id
    `,
    [pair[0], pair[1], now],
  );
  return result.rows;
}

async function loadSevenDayOneSidedCounts(
  client: TrustQueryable,
  pair: readonly string[],
  now: Date,
): Promise<{ rows: OneSidedRow[] }> {
  return client.query<OneSidedRow>(
    `
      with outcomes as (
        select match.winner_player_id::text as winner_player_id,
               array_agg(participant.player_id::text order by participant.player_id::text) as players
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '7 days'
           and match.completed_at <= $3::timestamptz
           and match.completion_reason in ('turn_forfeit', 'voluntary_resignation')
         group by match.id
        union all
        select match.winner_player_id::text,
               array_agg(participant.player_id::text order by participant.player_id::text)
          from public.live_pvp_matches match
          join public.live_pvp_match_participants participant on participant.match_id = match.id
         where match.status = 'completed'
           and match.completed_at > $3::timestamptz - interval '7 days'
           and match.completed_at <= $3::timestamptz
           and match.completion_reason in ('abandonment_forfeit', 'voluntary_resignation')
         group by match.id
      )
      select winner_player_id,
             count(*)::integer as matching_forfeits
        from outcomes
       where players = array[$1::text, $2::text]
       group by winner_player_id
    `,
    [pair[0], pair[1], now],
  );
}

function utcWeekKey(value: Date): string {
  const date = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function validateSignalInput(input: TrustSignalInput): void {
  if (!input.playerId || !input.sourceIdentifier || !input.deduplicationKey) {
    throw new RangeError('Trust signal identity fields are required.');
  }
  if (!Number.isFinite(input.observedAt.getTime())) {
    throw new RangeError('Trust signal observation time must be valid.');
  }
  if (!Number.isInteger(input.basePoints) || input.basePoints <= 0) {
    throw new RangeError('Trust signal points must be a positive integer.');
  }
  const reviewSummary = (
    input as TrustSignalInputBase & {
      signalType: TrustSignalType;
      reviewSummary?: TrustSignalReviewSummary;
    }
  ).reviewSummary;
  const isOpponentPattern =
    input.signalType === 'opponent_concentration' ||
    input.signalType === 'one_sided_outcome_pattern';
  if (isOpponentPattern && reviewSummary === undefined) {
    throw new RangeError(
      'Opponent-pattern trust signals require a reviewer-safe summary.',
    );
  }
  if (!isOpponentPattern && reviewSummary !== undefined) {
    throw new RangeError(
      'Only opponent-pattern trust signals may include a review summary.',
    );
  }
  if (reviewSummary !== undefined && reviewSummary.kind !== input.signalType) {
    throw new RangeError(
      'Trust signal review summary must match its opponent-pattern signal type.',
    );
  }
  if (reviewSummary !== undefined) {
    validateSignalReviewSummary(reviewSummary);
  }
}

function validateSignalReviewSummary(summary: TrustSignalReviewSummary): void {
  const keys = Object.keys(summary).sort();
  const commonValid =
    Number.isFinite(Date.parse(summary.evaluationWindowStart)) &&
    Number.isFinite(Date.parse(summary.evaluationWindowEnd)) &&
    Date.parse(summary.evaluationWindowStart) <
      Date.parse(summary.evaluationWindowEnd);
  if (!commonValid) {
    throw new RangeError(
      'Trust signal review windows must be valid and ordered.',
    );
  }
  if (summary.kind === 'opponent_concentration') {
    const expectedKeys = [
      'completedMatchCount',
      'evaluationWindowEnd',
      'evaluationWindowStart',
      'kind',
      'minimumCompletedMatchCount',
      'minimumOpponentConcentrationRatio',
      'opponentConcentrationRatio',
      'repeatedOpponentMatchCount',
    ].sort();
    if (
      keys.join('|') !== expectedKeys.join('|') ||
      !Number.isInteger(summary.completedMatchCount) ||
      summary.completedMatchCount < 0 ||
      !Number.isInteger(summary.repeatedOpponentMatchCount) ||
      summary.repeatedOpponentMatchCount < 0 ||
      summary.repeatedOpponentMatchCount > summary.completedMatchCount ||
      !Number.isFinite(summary.opponentConcentrationRatio) ||
      summary.completedMatchCount < 6 ||
      summary.opponentConcentrationRatio !==
        summary.repeatedOpponentMatchCount / summary.completedMatchCount ||
      summary.opponentConcentrationRatio < 0.8 ||
      summary.minimumCompletedMatchCount !== 6 ||
      summary.minimumOpponentConcentrationRatio !== 0.8
    ) {
      throw new RangeError(
        'Opponent-concentration review summary does not match trust-v1.',
      );
    }
    return;
  }
  const expectedKeys = [
    'evaluationWindowEnd',
    'evaluationWindowStart',
    'kind',
    'minimumQualifyingForfeitCount',
    'qualifyingForfeitCount',
  ].sort();
  if (
    keys.join('|') !== expectedKeys.join('|') ||
    !Number.isInteger(summary.qualifyingForfeitCount) ||
    summary.qualifyingForfeitCount < 4 ||
    summary.minimumQualifyingForfeitCount !== 4
  ) {
    throw new RangeError(
      'One-sided-outcome review summary does not match trust-v1.',
    );
  }
}

function windowStart(value: Date, days: number): string {
  return new Date(value.getTime() - days * 86_400_000).toISOString();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
