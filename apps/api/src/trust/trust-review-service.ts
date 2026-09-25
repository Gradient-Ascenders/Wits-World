import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  calculateTrustScore,
  effectiveSignalPoints,
  type TrustReviewBand,
  type TrustSignalType,
} from './trust-policy.js';
import type { TrustDatabase, TrustQueryable } from './trust-service.js';

export const TRUST_REVIEW_PAGE_SIZE_MAXIMUM = 100;
export const TRUST_RESTRICTION_MAXIMUM_HOURS = 7 * 24;

export type TrustCaseStatus = 'open' | 'under_review' | 'resolved';
export type TrustCaseStatusFilter = TrustCaseStatus | 'active' | 'all';
export type TrustRestrictionScope =
  | 'online_verification_required'
  | 'location_reward_challenge_hold'
  | 'new_competitive_match_hold';
export type TrustReviewAction =
  'continue_monitoring' | 'dismiss' | 'mark_false_positive' | 'restrict';

export interface TrustCaseQueueFilters {
  actorPlayerId: string;
  band?: TrustReviewBand;
  page: number;
  pageSize: number;
  search?: string;
  status?: TrustCaseStatusFilter;
}

export interface TrustCaseQueueItem {
  caseId: string;
  playerId: string;
  playerName: string;
  status: TrustCaseStatus;
  version: number;
  score: number;
  band: TrustReviewBand;
  policyVersion: string;
  openedAt: string;
  updatedAt: string;
  activeRestrictionCount: number;
  latestRestrictionExpiry: string | null;
  canReview: boolean;
}

export interface TrustCaseQueuePage {
  items: TrustCaseQueueItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TrustScoreExplanation {
  snapshotId: string;
  evaluatedAt: string;
  movementPoints: number;
  submissionConflictPoints: number;
  opponentPatternPoints: number;
  finalScore: number;
  reviewBand: TrustReviewBand;
  sourceSignalCount: number;
}

export interface TrustCaseEvidenceItem {
  evidenceId: string;
  signalType: TrustSignalType;
  severity: string;
  basePoints: number;
  effectivePoints: number;
  observedAt: string;
  expiresAt: string;
  state: 'active' | 'adjusted_false_positive' | 'expired';
  safeSourceType: string;
  policyVersion: string;
}

export interface TrustRestrictionItem {
  restrictionId: string;
  decisionId: string;
  scope: TrustRestrictionScope;
  startsAt: string;
  originalExpiresAt: string;
  effectiveExpiresAt: string;
  active: boolean;
}

export interface TrustCaseHistoryItem {
  decisionId: string;
  actorType: 'author' | 'system';
  actorPlayerId: string | null;
  actorPlayerName: string | null;
  policyVersion: string;
  caseVersionBefore: number;
  caseVersionAfter: number;
  decisionType: string;
  previousStatus: TrustCaseStatus | null;
  resultingStatus: TrustCaseStatus;
  reasonCode: string;
  reasonNote: string | null;
  evidenceIds: string[];
  restrictions: TrustRestrictionItem[];
  occurredAt: string;
}

export interface TrustCaseDetail extends TrustCaseQueueItem {
  scoreExplanation: TrustScoreExplanation;
  evidence: TrustCaseEvidenceItem[];
  history: TrustCaseHistoryItem[];
}

export interface TrustReviewDecisionInput {
  actorPlayerId: string;
  action: TrustReviewAction;
  caseId: string;
  durationHours?: number;
  evidenceIds?: string[];
  expectedVersion: number;
  reasonNote: string;
  restrictionScopes?: TrustRestrictionScope[];
}

export interface TrustReviewService {
  listCases(filters: TrustCaseQueueFilters): Promise<TrustCaseQueuePage>;
  getCase(actorPlayerId: string, caseId: string): Promise<TrustCaseDetail>;
  recordDecision(input: TrustReviewDecisionInput): Promise<TrustCaseDetail>;
}

interface QueueRow extends pg.QueryResultRow {
  case_id: string;
  player_id: string;
  player_name: string | null;
  status: TrustCaseStatus;
  version: number;
  current_score: number;
  current_band: TrustReviewBand;
  policy_version: string;
  opened_at: Date;
  updated_at: Date;
  active_restriction_count: number;
  latest_restriction_expiry: Date | null;
  total_items: number;
}

interface LockedCaseRow extends pg.QueryResultRow {
  case_id: string;
  player_id: string;
  status: TrustCaseStatus;
  version: number;
  policy_version: string;
  latest_score_snapshot_id: string;
}

interface EvidenceRow extends pg.QueryResultRow {
  evidence_id: string;
  original_signal_id: string;
  signal_type: TrustSignalType;
  severity: string;
  base_points: number;
  observed_at: Date;
  expires_at: Date;
  safe_source_type: string;
  policy_version: string;
  adjusted_false_positive: boolean;
  signal_exists: boolean;
}

interface SnapshotRow extends pg.QueryResultRow {
  snapshot_id: string;
  evaluated_at: Date;
  movement_points: number;
  submission_conflict_points: number;
  opponent_pattern_points: number;
  final_score: number;
  review_band: TrustReviewBand;
  source_signal_count: number;
}

interface HistoryRow extends pg.QueryResultRow {
  decision_id: string;
  actor_type: 'author' | 'system';
  actor_player_id: string | null;
  actor_player_name: string | null;
  policy_version: string;
  case_version_before: number;
  case_version_after: number;
  decision_type: string;
  previous_status: TrustCaseStatus | null;
  resulting_status: TrustCaseStatus;
  reason_code: string;
  reason_note: string | null;
  evidence_ids: string[];
  restrictions: Array<{
    restrictionId: string;
    decisionId: string;
    scope: TrustRestrictionScope;
    startsAt: string;
    originalExpiresAt: string;
    effectiveExpiresAt: string;
    active: boolean;
  }>;
  created_at: Date;
}

interface DatabaseNowRow extends pg.QueryResultRow {
  now: Date;
}

export class InvalidTrustReviewRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTrustReviewRequestError';
  }
}

export class TrustCaseNotFoundError extends Error {
  constructor() {
    super('The trust case was not found.');
    this.name = 'TrustCaseNotFoundError';
  }
}

export class StaleTrustCaseVersionError extends Error {
  constructor() {
    super(
      'This trust case changed after it was opened. Review the latest case before deciding.',
    );
    this.name = 'StaleTrustCaseVersionError';
  }
}

export class SelfTrustReviewForbiddenError extends Error {
  constructor() {
    super(
      'Authors cannot make review decisions about their own player account.',
    );
    this.name = 'SelfTrustReviewForbiddenError';
  }
}

export class TrustCaseStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustCaseStateConflictError';
  }
}

export function createTrustReviewService(
  database: TrustDatabase,
  { createId = randomUUID }: { createId?: () => string } = {},
): TrustReviewService {
  const service: TrustReviewService = {
    async listCases(filters) {
      validateQueueFilters(filters);
      const client = await database.connect();
      try {
        const offset = (filters.page - 1) * filters.pageSize;
        const search = filters.search?.trim() || null;
        const result = await client.query<QueueRow>(
          `
            with effective_restrictions as (
              select restriction.case_id,
                     restriction.original_expires_at,
                     case resolution.outcome
                       when 'upheld' then restriction.original_expires_at
                       when 'shortened' then least(
                         restriction.original_expires_at,
                         resolution.effective_expires_at
                       )
                       when 'overturned' then resolution.effective_expires_at
                       else restriction.original_expires_at
                     end as effective_expires_at
                from private.trust_restrictions restriction
                left join private.trust_appeals appeal
                  on appeal.challenged_decision_id = restriction.decision_id
                left join private.trust_appeal_resolutions resolution
                  on resolution.appeal_id = appeal.id
            ), filtered as (
              select trust_case.id,
                     trust_case.player_id,
                     player.player_name,
                     trust_case.status,
                     trust_case.version,
                     trust_case.current_score,
                     trust_case.current_band,
                     trust_case.policy_version,
                     trust_case.opened_at,
                     trust_case.updated_at,
                     count(restriction.case_id) filter (
                       where restriction.effective_expires_at > clock_timestamp()
                     )::integer as active_restriction_count,
                     max(restriction.effective_expires_at) filter (
                       where restriction.effective_expires_at > clock_timestamp()
                     ) as latest_restriction_expiry
                from private.trust_cases trust_case
                join public.players player on player.id = trust_case.player_id
                left join effective_restrictions restriction
                  on restriction.case_id = trust_case.id
               where (
                 $1::text is null
                 or position(lower($1::text) in lower(coalesce(player.player_name, ''))) > 0
                 or trust_case.id::text = $1::text
                 or trust_case.player_id::text = $1::text
               )
                 and (
                   $2::text is null
                   or $2::text = 'all'
                   or ($2::text = 'active' and trust_case.status in ('open', 'under_review'))
                   or trust_case.status = $2::text
                 )
                 and ($3::text is null or trust_case.current_band = $3::text)
               group by trust_case.id, player.player_name
            ), page as (
              select *
                from filtered
               order by
                 case current_band
                   when 'urgent_review' then 0
                   when 'review_required' then 1
                   when 'observe' then 2
                   else 3
                 end,
                 updated_at desc,
                 id
               limit $4 offset $5
            ), metadata as (
              select count(*)::integer as total_items from filtered
            )
            select page.id::text as case_id,
                   page.player_id::text,
                   page.player_name,
                   page.status,
                   page.version,
                   page.current_score,
                   page.current_band,
                   page.policy_version,
                   page.opened_at,
                   page.updated_at,
                   page.active_restriction_count,
                   page.latest_restriction_expiry,
                   metadata.total_items
              from metadata
              left join page on true
             order by
               case page.current_band
                 when 'urgent_review' then 0
                 when 'review_required' then 1
                 when 'observe' then 2
                 else 3
               end,
               page.updated_at desc nulls last,
               page.id nulls last
          `,
          [
            search,
            filters.status ?? 'active',
            filters.band ?? null,
            filters.pageSize,
            offset,
          ],
        );
        const totalItems = result.rows[0]?.total_items ?? 0;
        return {
          items: result.rows
            .filter((row) => row.case_id !== null)
            .map((row) => mapQueueRow(row, filters.actorPlayerId)),
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / filters.pageSize),
        };
      } finally {
        client.release();
      }
    },

    async getCase(actorPlayerId, caseId) {
      validateIdentifier(actorPlayerId, 'Reviewer identifier');
      validateIdentifier(caseId, 'Trust case identifier');
      const client = await database.connect();
      try {
        return await loadCaseDetail(client, actorPlayerId, caseId);
      } finally {
        client.release();
      }
    },

    async recordDecision(input) {
      validateDecisionInput(input);
      const client = await database.connect();
      try {
        await client.query('begin');
        const nowResult = await client.query<DatabaseNowRow>(
          'select clock_timestamp() as now',
        );
        const now = nowResult.rows[0]?.now;
        if (!now) throw new Error('Database did not return trust review time.');

        const locked = await client.query<LockedCaseRow>(
          `select id::text as case_id,
                  player_id::text,
                  status,
                  version,
                  policy_version,
                  latest_score_snapshot_id::text
             from private.trust_cases
            where id = $1::uuid
            for update`,
          [input.caseId],
        );
        const current = locked.rows[0];
        if (!current) throw new TrustCaseNotFoundError();
        if (current.version !== input.expectedVersion) {
          throw new StaleTrustCaseVersionError();
        }
        if (current.status === 'resolved') {
          throw new TrustCaseStateConflictError(
            'Resolved trust cases cannot receive another reviewer decision.',
          );
        }
        if (current.player_id === input.actorPlayerId) {
          throw new SelfTrustReviewForbiddenError();
        }

        const evidence = await loadEvidence(client, input.caseId, now);
        const selectedEvidence = selectEvidence(input, evidence);
        let snapshotId = current.latest_score_snapshot_id;
        let resultingScore: number | null = null;

        if (input.action === 'mark_false_positive') {
          const selectedSignalIds = new Set(
            selectedEvidence.map((item) => item.originalSignalId),
          );
          const signalResult = await client.query<{
            id: string;
            signal_type: TrustSignalType;
            base_points: number;
            observed_at: Date;
            adjusted_false_positive: boolean;
          }>(
            `select signal.id::text,
                    signal.signal_type,
                    signal.base_points,
                    signal.observed_at,
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
              order by signal.id`,
            [current.player_id, now, current.policy_version],
          );
          const score = calculateTrustScore({
            evaluatedAt: now,
            signals: signalResult.rows.map((signal) => ({
              id: signal.id,
              signalType: signal.signal_type,
              basePoints: signal.base_points,
              observedAt: signal.observed_at,
              adjustedFalsePositive:
                signal.adjusted_false_positive ||
                selectedSignalIds.has(signal.id),
            })),
          });
          if (score.policyVersion !== current.policy_version) {
            throw new TrustCaseStateConflictError(
              'This case uses a trust policy version that this reviewer workflow cannot change.',
            );
          }
          snapshotId = createId();
          await client.query(
            `insert into private.trust_score_snapshots (
               id, player_id, policy_version, evaluated_at,
               movement_points, submission_conflict_points,
               opponent_pattern_points, final_score, review_band,
               source_signal_count, calculation_digest, purge_after
             ) values (
               $1::uuid, $2::uuid, $3, $4::timestamptz,
               $5, $6, $7, $8, $9, $10, $11,
               $4::timestamptz + interval '12 months'
             )`,
            [
              snapshotId,
              current.player_id,
              current.policy_version,
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
          resultingScore = score.finalScore;
        }

        const activeRestrictionCount = await countActiveRestrictions(
          client,
          input.caseId,
          now,
        );
        const resolvesFromFalsePositive =
          input.action === 'mark_false_positive' &&
          resultingScore !== null &&
          resultingScore < 25 &&
          activeRestrictionCount === 0;
        const resultingStatus: TrustCaseStatus =
          input.action === 'dismiss' || resolvesFromFalsePositive
            ? 'resolved'
            : 'under_review';
        if (input.action === 'dismiss' && activeRestrictionCount > 0) {
          throw new TrustCaseStateConflictError(
            'A case with an active restriction must remain under review until the restriction expires or is overturned.',
          );
        }

        const nextVersion = current.version + 1;
        const decisionId = createId();
        const decisionType = decisionTypeForAction(input.action);
        const reasonCode = reasonCodeForAction(input.action);
        const update = await client.query(
          `update private.trust_cases
              set status = $3,
                  version = $2 + 1,
                  current_score = snapshot.final_score,
                  current_band = snapshot.review_band,
                  latest_score_snapshot_id = $4::uuid,
                  updated_at = $5::timestamptz,
                  resolved_at = case when $3 = 'resolved' then $5::timestamptz else null end,
                  resolution_reason = case when $3 = 'resolved' then $6 else null end
             from private.trust_score_snapshots snapshot
            where trust_cases.id = $1::uuid
              and trust_cases.version = $2
              and snapshot.id = $4::uuid`,
          [
            input.caseId,
            input.expectedVersion,
            resultingStatus,
            snapshotId,
            now,
            resultingStatus === 'resolved' ? reasonCode : null,
          ],
        );
        if (update.rowCount !== 1) throw new StaleTrustCaseVersionError();

        await client.query(
          `insert into private.trust_case_decisions (
             id, case_id, actor_type, actor_player_id, policy_version,
             case_version_before, case_version_after, decision_type,
             previous_status, resulting_status, reason_code, reason_note,
             resulting_score_snapshot_id, created_at
           ) values (
             $1::uuid, $2::uuid, 'author', $3::uuid, $4,
             $5, $6, $7, $8, $9, $10, $11, $12::uuid, $13::timestamptz
           )`,
          [
            decisionId,
            input.caseId,
            input.actorPlayerId,
            current.policy_version,
            input.expectedVersion,
            nextVersion,
            decisionType,
            current.status,
            resultingStatus,
            reasonCode,
            input.reasonNote.trim(),
            snapshotId,
            now,
          ],
        );

        for (const item of selectedEvidence) {
          await client.query(
            `insert into private.trust_decision_evidence (
               decision_id, case_evidence_id
             ) values ($1::uuid, $2::uuid)`,
            [decisionId, item.evidenceId],
          );
        }

        if (input.action === 'mark_false_positive') {
          for (const item of selectedEvidence) {
            await client.query(
              `insert into private.trust_signal_adjustments (
                 id, case_id, original_signal_id, decision_id,
                 policy_version, adjustment_type, effective_at
               ) values (
                 $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                 $5, 'reviewed_false_positive', $6::timestamptz
               )`,
              [
                createId(),
                input.caseId,
                item.originalSignalId,
                decisionId,
                current.policy_version,
                now,
              ],
            );
          }
        }

        if (input.action === 'restrict') {
          const expiresAt = new Date(
            now.getTime() + input.durationHours! * 60 * 60 * 1000,
          );
          for (const scope of input.restrictionScopes!) {
            await client.query(
              `insert into private.trust_restrictions (
                 id, case_id, player_id, decision_id, policy_version,
                 scope, starts_at, original_expires_at
               ) values (
                 $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
                 $6, $7::timestamptz, $8::timestamptz
               )`,
              [
                createId(),
                input.caseId,
                current.player_id,
                decisionId,
                current.policy_version,
                scope,
                now,
                expiresAt,
              ],
            );
          }
        }

        const detail = await loadCaseDetail(
          client,
          input.actorPlayerId,
          input.caseId,
        );
        await client.query('commit');
        return detail;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };

  return service;
}

async function loadCaseDetail(
  client: TrustQueryable,
  actorPlayerId: string,
  caseId: string,
): Promise<TrustCaseDetail> {
  const nowResult = await client.query<DatabaseNowRow>(
    'select clock_timestamp() as now',
  );
  const now = nowResult.rows[0]?.now;
  if (!now) throw new Error('Database did not return trust review time.');
  const queueResult = await client.query<QueueRow>(
    `with effective_restrictions as (
       select restriction.case_id,
              case resolution.outcome
                when 'upheld' then restriction.original_expires_at
                when 'shortened' then least(restriction.original_expires_at, resolution.effective_expires_at)
                when 'overturned' then resolution.effective_expires_at
                else restriction.original_expires_at
              end as effective_expires_at
         from private.trust_restrictions restriction
         left join private.trust_appeals appeal
           on appeal.challenged_decision_id = restriction.decision_id
         left join private.trust_appeal_resolutions resolution
           on resolution.appeal_id = appeal.id
     )
     select trust_case.id::text as case_id,
            trust_case.player_id::text,
            player.player_name,
            trust_case.status,
            trust_case.version,
            trust_case.current_score,
            trust_case.current_band,
            trust_case.policy_version,
            trust_case.opened_at,
            trust_case.updated_at,
            count(restriction.case_id) filter (
              where restriction.effective_expires_at > $2::timestamptz
            )::integer as active_restriction_count,
            max(restriction.effective_expires_at) filter (
              where restriction.effective_expires_at > $2::timestamptz
            ) as latest_restriction_expiry,
            1::integer as total_items
       from private.trust_cases trust_case
       join public.players player on player.id = trust_case.player_id
       left join effective_restrictions restriction
         on restriction.case_id = trust_case.id
      where trust_case.id = $1::uuid
      group by trust_case.id, player.player_name`,
    [caseId, now],
  );
  const queueRow = queueResult.rows[0];
  if (!queueRow) throw new TrustCaseNotFoundError();

  const snapshotResult = await client.query<SnapshotRow>(
    `select snapshot.id::text as snapshot_id,
            snapshot.evaluated_at,
            snapshot.movement_points,
            snapshot.submission_conflict_points,
            snapshot.opponent_pattern_points,
            snapshot.final_score,
            snapshot.review_band,
            snapshot.source_signal_count
       from private.trust_cases trust_case
       join private.trust_score_snapshots snapshot
         on snapshot.id = trust_case.latest_score_snapshot_id
      where trust_case.id = $1::uuid`,
    [caseId],
  );
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) throw new Error('Trust case score snapshot is missing.');
  const evidence = await loadEvidence(client, caseId, now);
  const history = await loadHistory(client, caseId, now);

  return {
    ...mapQueueRow(queueRow, actorPlayerId),
    scoreExplanation: {
      snapshotId: snapshot.snapshot_id,
      evaluatedAt: snapshot.evaluated_at.toISOString(),
      movementPoints: snapshot.movement_points,
      submissionConflictPoints: snapshot.submission_conflict_points,
      opponentPatternPoints: snapshot.opponent_pattern_points,
      finalScore: snapshot.final_score,
      reviewBand: snapshot.review_band,
      sourceSignalCount: snapshot.source_signal_count,
    },
    evidence: evidence.map((item) => item.publicItem),
    history,
  };
}

async function loadEvidence(
  client: TrustQueryable,
  caseId: string,
  now: Date,
): Promise<
  Array<{
    evidenceId: string;
    originalSignalId: string;
    publicItem: TrustCaseEvidenceItem;
  }>
> {
  const result = await client.query<EvidenceRow>(
    `select evidence.id::text as evidence_id,
            evidence.original_signal_id::text,
            evidence.signal_type,
            evidence.severity,
            evidence.base_points,
            evidence.observed_at,
            evidence.observed_at + interval '90 days' as expires_at,
            evidence.safe_source_type,
            evidence.policy_version,
            signal.id is not null as signal_exists,
            exists (
              select 1
                from private.trust_signal_adjustments adjustment
               where adjustment.original_signal_id = evidence.original_signal_id
                 and adjustment.adjustment_type = 'reviewed_false_positive'
                 and adjustment.effective_at <= $2::timestamptz
            ) as adjusted_false_positive
       from private.trust_case_evidence evidence
       left join private.trust_signals signal
         on signal.id = evidence.original_signal_id
        and signal.expires_at > $2::timestamptz
      where evidence.case_id = $1::uuid
      order by evidence.observed_at desc, evidence.id`,
    [caseId, now],
  );
  return result.rows.map((row) => {
    const state = row.adjusted_false_positive
      ? 'adjusted_false_positive'
      : row.signal_exists
        ? 'active'
        : 'expired';
    return {
      evidenceId: row.evidence_id,
      originalSignalId: row.original_signal_id,
      publicItem: {
        evidenceId: row.evidence_id,
        signalType: row.signal_type,
        severity: row.severity,
        basePoints: row.base_points,
        effectivePoints:
          state === 'active'
            ? effectiveSignalPoints(
                {
                  basePoints: row.base_points,
                  observedAt: row.observed_at,
                },
                now,
              )
            : 0,
        observedAt: row.observed_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        state,
        safeSourceType: row.safe_source_type,
        policyVersion: row.policy_version,
      },
    };
  });
}

async function loadHistory(
  client: TrustQueryable,
  caseId: string,
  now: Date,
): Promise<TrustCaseHistoryItem[]> {
  const result = await client.query<HistoryRow>(
    `select decision.id::text as decision_id,
            decision.actor_type,
            decision.actor_player_id::text,
            actor.player_name as actor_player_name,
            decision.policy_version,
            decision.case_version_before,
            decision.case_version_after,
            decision.decision_type,
            decision.previous_status,
            decision.resulting_status,
            decision.reason_code,
            decision.reason_note,
            coalesce((
              select array_agg(link.case_evidence_id::text order by link.case_evidence_id)
                from private.trust_decision_evidence link
               where link.decision_id = decision.id
            ), array[]::text[]) as evidence_ids,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'restrictionId', restriction.id::text,
                'decisionId', restriction.decision_id::text,
                'scope', restriction.scope,
                'startsAt', restriction.starts_at,
                'originalExpiresAt', restriction.original_expires_at,
                'effectiveExpiresAt', case resolution.outcome
                  when 'upheld' then restriction.original_expires_at
                  when 'shortened' then least(restriction.original_expires_at, resolution.effective_expires_at)
                  when 'overturned' then resolution.effective_expires_at
                  else restriction.original_expires_at
                end,
                'active', case resolution.outcome
                  when 'upheld' then restriction.original_expires_at > $2::timestamptz
                  when 'shortened' then least(restriction.original_expires_at, resolution.effective_expires_at) > $2::timestamptz
                  when 'overturned' then false
                  else restriction.original_expires_at > $2::timestamptz
                end
              ) order by restriction.scope)
                from private.trust_restrictions restriction
                left join private.trust_appeals appeal
                  on appeal.challenged_decision_id = restriction.decision_id
                left join private.trust_appeal_resolutions resolution
                  on resolution.appeal_id = appeal.id
               where restriction.decision_id = decision.id
            ), '[]'::jsonb) as restrictions,
            decision.created_at
       from private.trust_case_decisions decision
       left join public.players actor on actor.id = decision.actor_player_id
      where decision.case_id = $1::uuid
      order by decision.case_version_after desc, decision.id`,
    [caseId, now],
  );
  return result.rows.map((row) => ({
    decisionId: row.decision_id,
    actorType: row.actor_type,
    actorPlayerId: row.actor_player_id,
    actorPlayerName: row.actor_player_name,
    policyVersion: row.policy_version,
    caseVersionBefore: row.case_version_before,
    caseVersionAfter: row.case_version_after,
    decisionType: row.decision_type,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    reasonCode: row.reason_code,
    reasonNote: row.reason_note,
    evidenceIds: row.evidence_ids,
    restrictions: row.restrictions,
    occurredAt: row.created_at.toISOString(),
  }));
}

async function countActiveRestrictions(
  client: TrustQueryable,
  caseId: string,
  now: Date,
): Promise<number> {
  const result = await client.query<{ count: number }>(
    `select count(*)::integer as count
       from private.trust_restrictions restriction
       left join private.trust_appeals appeal
         on appeal.challenged_decision_id = restriction.decision_id
       left join private.trust_appeal_resolutions resolution
         on resolution.appeal_id = appeal.id
      where restriction.case_id = $1::uuid
        and case resolution.outcome
          when 'upheld' then restriction.original_expires_at
          when 'shortened' then least(restriction.original_expires_at, resolution.effective_expires_at)
          when 'overturned' then resolution.effective_expires_at
          else restriction.original_expires_at
        end > $2::timestamptz`,
    [caseId, now],
  );
  return result.rows[0]?.count ?? 0;
}

function selectEvidence(
  input: TrustReviewDecisionInput,
  evidence: Awaited<ReturnType<typeof loadEvidence>>,
) {
  const available = new Map(evidence.map((item) => [item.evidenceId, item]));
  const requested =
    input.evidenceIds ?? evidence.map((item) => item.evidenceId);
  const unique = [...new Set(requested)];
  const selected = unique.map((id) => available.get(id));
  if (selected.some((item) => item === undefined)) {
    throw new InvalidTrustReviewRequestError(
      'A selected evidence item does not belong to this trust case.',
    );
  }
  const present = selected.filter((item) => item !== undefined);
  if (input.action === 'mark_false_positive') {
    if (present.length === 0) {
      throw new InvalidTrustReviewRequestError(
        'Select at least one signal to mark as a reviewed false positive.',
      );
    }
    if (present.some((item) => item.publicItem.state !== 'active')) {
      throw new TrustCaseStateConflictError(
        'Only active, unadjusted signals can be marked as reviewed false positives.',
      );
    }
  }
  return present;
}

function mapQueueRow(row: QueueRow, actorPlayerId: string): TrustCaseQueueItem {
  return {
    caseId: row.case_id,
    playerId: row.player_id,
    playerName: row.player_name ?? 'Deleted player',
    status: row.status,
    version: row.version,
    score: row.current_score,
    band: row.current_band,
    policyVersion: row.policy_version,
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    activeRestrictionCount: row.active_restriction_count,
    latestRestrictionExpiry:
      row.latest_restriction_expiry?.toISOString() ?? null,
    canReview: row.player_id !== actorPlayerId && row.status !== 'resolved',
  };
}

function validateQueueFilters(filters: TrustCaseQueueFilters) {
  validateIdentifier(filters.actorPlayerId, 'Reviewer identifier');
  if (!Number.isInteger(filters.page) || filters.page < 1) {
    throw new InvalidTrustReviewRequestError(
      'Page must be a positive integer.',
    );
  }
  if (
    !Number.isInteger(filters.pageSize) ||
    filters.pageSize < 1 ||
    filters.pageSize > TRUST_REVIEW_PAGE_SIZE_MAXIMUM
  ) {
    throw new InvalidTrustReviewRequestError(
      `Page size must be between 1 and ${TRUST_REVIEW_PAGE_SIZE_MAXIMUM}.`,
    );
  }
  if (filters.search !== undefined) {
    const search = filters.search.trim();
    if (
      search.length === 0 ||
      search.length > 100 ||
      /[\p{Cc}]/u.test(search)
    ) {
      throw new InvalidTrustReviewRequestError(
        'Search must contain between 1 and 100 visible characters.',
      );
    }
  }
}

function validateDecisionInput(input: TrustReviewDecisionInput) {
  validateIdentifier(input.actorPlayerId, 'Reviewer identifier');
  validateIdentifier(input.caseId, 'Trust case identifier');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new InvalidTrustReviewRequestError(
      'Expected case version must be a positive integer.',
    );
  }
  const reason = input.reasonNote.trim();
  if (reason.length < 1 || reason.length > 1000 || /[\p{Cc}]/u.test(reason)) {
    throw new InvalidTrustReviewRequestError(
      'Decision context must contain between 1 and 1,000 visible characters.',
    );
  }
  if (input.evidenceIds !== undefined) {
    if (
      input.evidenceIds.length > 100 ||
      input.evidenceIds.some((id) => !isUuid(id))
    ) {
      throw new InvalidTrustReviewRequestError(
        'Evidence identifiers are invalid.',
      );
    }
  }
  if (input.action === 'restrict') {
    const scopes = input.restrictionScopes ?? [];
    if (scopes.length === 0 || new Set(scopes).size !== scopes.length) {
      throw new InvalidTrustReviewRequestError(
        'Select at least one unique restriction scope.',
      );
    }
    if (
      !Number.isInteger(input.durationHours) ||
      input.durationHours! < 1 ||
      input.durationHours! > TRUST_RESTRICTION_MAXIMUM_HOURS
    ) {
      throw new InvalidTrustReviewRequestError(
        `Restriction duration must be between 1 and ${TRUST_RESTRICTION_MAXIMUM_HOURS} hours.`,
      );
    }
  } else if (
    input.durationHours !== undefined ||
    (input.restrictionScopes?.length ?? 0) > 0
  ) {
    throw new InvalidTrustReviewRequestError(
      'Restriction scopes and duration are available only for a restriction decision.',
    );
  }
}

function validateIdentifier(value: string, label: string) {
  if (!isUuid(value)) {
    throw new InvalidTrustReviewRequestError(`${label} is invalid.`);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function decisionTypeForAction(action: TrustReviewAction) {
  switch (action) {
    case 'continue_monitoring':
      return 'monitoring_continued';
    case 'dismiss':
      return 'case_dismissed';
    case 'mark_false_positive':
      return 'signals_marked_false_positive';
    case 'restrict':
      return 'restriction_applied';
  }
}

function reasonCodeForAction(action: TrustReviewAction) {
  switch (action) {
    case 'continue_monitoring':
      return 'continued_monitoring';
    case 'dismiss':
      return 'review_dismissed';
    case 'mark_false_positive':
      return 'reviewed_false_positive';
    case 'restrict':
      return 'activity_review';
  }
}
