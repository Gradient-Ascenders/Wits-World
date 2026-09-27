import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  calculateTrustScore,
  type TrustReviewBand,
  type TrustSignalType,
} from './trust-policy.js';
import type { TrustSignalReviewSummary } from './trust-service.js';
import type { TrustRestrictionScope } from './trust-restrictions.js';

export const TRUST_REVIEW_MAX_PAGE_SIZE = 100;
export const TRUST_REVIEW_DEFAULT_PAGE_SIZE = 20;
export const TRUST_REVIEW_MAX_NOTE_LENGTH = 1000;
export const TRUST_REVIEW_MAX_RESTRICTION_HOURS = 7 * 24;
export const TRUST_REVIEW_MAX_SEARCH_LENGTH = 256;
export const TRUST_REVIEW_DETAIL_PREVIEW_SIZE = 10;
export const TRUST_REVIEW_EXPORT_PAGE_SIZE = 100;

export type TrustCaseStatus = 'open' | 'under_review' | 'resolved';
export type TrustCaseQueueStatus = 'all' | 'active' | TrustCaseStatus;
export type TrustDecisionAction =
  'continue_monitoring' | 'dismiss' | 'mark_false_positive' | 'restrict';
export type WritableTrustRestrictionScope = Exclude<
  TrustRestrictionScope,
  'card_trade_hold'
>;

export interface TrustReviewDatabase {
  connect(): Promise<
    TrustReviewQueryable & {
      release(): void;
    }
  >;
}

export interface TrustReviewQueryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface TrustCaseQueueFilters {
  actorPlayerId: string;
  status: TrustCaseQueueStatus;
  search?: string;
  band?: TrustReviewBand;
  restrictionState?: 'active' | 'none';
  signalType?: TrustSignalType;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page: number;
  pageSize: number;
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
  signalTypes: TrustSignalType[];
  restrictionCount: number;
  activeRestrictionCount: number;
  latestRestrictionExpiry: string | null;
  activeRestrictionScopes: TrustRestrictionScope[];
  canReview: boolean;
  openedAt: string;
  updatedAt: string;
}

export interface TrustCaseEvidenceSummary {
  evidenceId: string;
  signalType: TrustSignalType;
  severity: string;
  basePoints: number;
  effectivePoints: number;
  observedAt: string;
  expiresAt: string;
  policyVersion: string;
  state: 'active' | 'adjusted_false_positive' | 'expired';
  decayState: 'active' | 'expired' | 'reviewed_false_positive';
  safeSourceType: string;
  reviewedFalsePositive: boolean;
  opponentPattern:
    | ({ availability: 'available' } & TrustSignalReviewSummary)
    | {
        availability: 'unavailable';
        reason: 'legacy_summary_not_retained';
        remediation: 'await_fresh_detector_evaluation';
      }
    | null;
}

export interface TrustRestrictionSummary {
  restrictionId: string;
  decisionId: string;
  scope: TrustRestrictionScope;
  startsAt: string;
  originalExpiresAt: string;
  effectiveExpiresAt: string;
  active: boolean;
  appealStatus: 'eligible' | 'submitted' | 'resolved' | 'expired';
}

export interface TrustDecisionHistoryRestriction extends TrustRestrictionSummary {
  expiresAt: string;
}

export interface TrustDecisionHistoryItem {
  decisionId: string;
  actorType: 'system' | 'author';
  actorPlayerId: string | null;
  actorPlayerName: string | null;
  decisionType: string;
  action: string;
  previousStatus: TrustCaseStatus | null;
  resultingStatus: TrustCaseStatus;
  reasonCode: string;
  reasonNote: string | null;
  policyVersion: string;
  caseVersionBefore: number;
  caseVersionAfter: number;
  versionBefore: number;
  versionAfter: number;
  evidenceIds: string[];
  falsePositiveEvidenceIds: string[];
  restrictions: TrustDecisionHistoryRestriction[];
  occurredAt: string;
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

export interface TrustCaseDetail {
  caseId: string;
  playerId: string;
  playerName: string;
  status: TrustCaseStatus;
  version: number;
  score: number;
  band: TrustReviewBand;
  policyVersion: string;
  restrictionCount: number;
  activeRestrictionCount: number;
  latestRestrictionExpiry: string | null;
  canReview: boolean;
  categoryTotals: {
    movement: number;
    submissionConflicts: number;
    opponentPatterns: number;
  };
  sourceSignalCount: number;
  scoreExplanation: TrustScoreExplanation;
  evidence: TrustCaseEvidenceSummary[];
  evidencePreview: TrustCaseEvidenceSummary[];
  evidenceTotalItems: number;
  evidenceTruncated: boolean;
  restrictionPreview: TrustRestrictionSummary[];
  restrictionTotalItems: number;
  restrictionsTruncated: boolean;
  recentHistory: TrustDecisionHistoryItem[];
  history: TrustDecisionHistoryItem[];
  historyTruncated: boolean;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

export interface TrustDecisionInput {
  actorPlayerId: string;
  caseId: string;
  expectedVersion: number;
  action: TrustDecisionAction;
  reasonNote: string;
  evidenceIds: string[];
  restrictionScopes: WritableTrustRestrictionScope[];
  restrictionDurationHours?: number;
}

export interface PaginatedTrustResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TrustReviewService {
  listCases(
    filters: TrustCaseQueueFilters,
  ): Promise<PaginatedTrustResult<TrustCaseQueueItem>>;
  getCase(input: {
    actorPlayerId: string;
    caseId: string;
  }): Promise<TrustCaseDetail>;
  listEvidence(input: {
    actorPlayerId: string;
    caseId: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedTrustResult<TrustCaseEvidenceSummary>>;
  listRestrictions(input: {
    actorPlayerId: string;
    caseId: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedTrustResult<TrustRestrictionSummary>>;
  listHistory(input: {
    actorPlayerId: string;
    caseId: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedTrustResult<TrustDecisionHistoryItem>>;
  decide(input: TrustDecisionInput): Promise<TrustCaseDetail>;
  exportCase(input: {
    actorPlayerId: string;
    caseId: string;
  }): Promise<TrustCaseExport>;
}

export interface TrustCaseExport {
  formatVersion: 'trust-case-review-v1';
  generatedAt: string;
  case: TrustCaseDetail;
  evidence: PaginatedTrustResult<TrustCaseEvidenceSummary>;
  restrictions: PaginatedTrustResult<TrustRestrictionSummary>;
  history: PaginatedTrustResult<TrustDecisionHistoryItem>;
}

export class TrustCaseNotFoundError extends Error {
  constructor() {
    super('The trust case was not found.');
    this.name = 'TrustCaseNotFoundError';
  }
}

export class StaleTrustCaseVersionError extends Error {
  constructor() {
    super('The trust case changed before this decision was applied.');
    this.name = 'StaleTrustCaseVersionError';
  }
}

export class InvalidTrustDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTrustDecisionError';
  }
}

interface CountRow extends pg.QueryResultRow {
  total_items: number;
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
  signal_types: TrustSignalType[] | null;
  restriction_count: number;
  active_restriction_count: number;
  latest_restriction_expiry: Date | null;
  active_restriction_scopes: TrustRestrictionScope[] | null;
  can_review: boolean;
  opened_at: Date;
  updated_at: Date;
}

interface DetailRow extends pg.QueryResultRow {
  case_id: string;
  player_id: string;
  player_name: string | null;
  status: TrustCaseStatus;
  version: number;
  current_score: number;
  current_band: TrustReviewBand;
  policy_version: string;
  snapshot_id: string;
  snapshot_evaluated_at: Date;
  movement_points: number;
  submission_conflict_points: number;
  opponent_pattern_points: number;
  source_signal_count: number;
  restriction_count: number;
  active_restriction_count: number;
  latest_restriction_expiry: Date | null;
  can_review: boolean;
  opened_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  resolution_reason: string | null;
}

interface EvidenceRow extends pg.QueryResultRow {
  evidence_id: string;
  original_signal_id: string;
  signal_type: TrustSignalType;
  severity: string;
  base_points: number;
  effective_points: number;
  observed_at: Date;
  expires_at: Date;
  policy_version: string;
  safe_source_type: string;
  reviewed_false_positive: boolean;
  expired: boolean;
  safe_review_summary: unknown;
}

interface RestrictionRow extends pg.QueryResultRow {
  restriction_id: string;
  decision_id: string;
  scope: TrustRestrictionScope;
  starts_at: Date;
  original_expires_at: Date;
  effective_expires_at: Date;
  active: boolean;
  appeal_status: TrustRestrictionSummary['appealStatus'];
}

interface HistoryRow extends pg.QueryResultRow {
  decision_id: string;
  actor_type: 'system' | 'author';
  actor_player_id: string | null;
  actor_player_name: string | null;
  decision_type: string;
  previous_status: TrustCaseStatus | null;
  resulting_status: TrustCaseStatus;
  reason_code: string;
  reason_note: string | null;
  policy_version: string;
  case_version_before: number;
  case_version_after: number;
  evidence_ids: string[] | null;
  false_positive_evidence_ids: string[] | null;
  restrictions: Array<{
    restrictionId: string;
    decisionId: string;
    scope: TrustRestrictionScope;
    startsAt: string;
    originalExpiresAt: string;
    effectiveExpiresAt: string;
    expiresAt: string;
    active: boolean;
    appealStatus: TrustRestrictionSummary['appealStatus'];
  }> | null;
  created_at: Date;
}

interface DecisionCaseRow extends pg.QueryResultRow {
  id: string;
  player_id: string;
  policy_version: string;
  status: TrustCaseStatus;
  version: number;
  latest_score_snapshot_id: string;
  can_review: boolean;
}

interface ReviewScoreSignalRow extends pg.QueryResultRow {
  id: string;
  signal_type: TrustSignalType;
  base_points: number;
  observed_at: Date;
  adjusted_false_positive: boolean;
}

interface SnapshotProjectionRow extends pg.QueryResultRow {
  movement_points: number;
  submission_conflict_points: number;
  opponent_pattern_points: number;
  final_score: number;
  review_band: TrustReviewBand;
  source_signal_count: number;
  calculation_digest: Buffer;
}

const HISTORY_DETAIL_LIMIT = 20;
const writableRestrictionScopes = new Set<WritableTrustRestrictionScope>([
  'online_verification_required',
  'location_reward_challenge_hold',
  'new_competitive_match_hold',
]);
const reviewerTransitions: Readonly<
  Record<
    TrustCaseStatus,
    Readonly<Partial<Record<TrustDecisionAction, TrustCaseStatus>>>
  >
> = {
  open: {
    continue_monitoring: 'under_review',
    mark_false_positive: 'under_review',
    restrict: 'under_review',
  },
  under_review: {
    continue_monitoring: 'under_review',
    mark_false_positive: 'under_review',
    restrict: 'under_review',
    dismiss: 'resolved',
  },
  resolved: {},
};
const effectiveRestrictionExpirySql = `coalesce(
  case resolution.outcome
    when 'upheld' then restriction.original_expires_at
    else least(restriction.original_expires_at, resolution.effective_expires_at)
  end,
  restriction.original_expires_at
)`;
const activeRestrictionPredicateSql = `${effectiveRestrictionExpirySql} > clock_timestamp()`;
const legacyEvidenceContributesSql = `greatest(0, floor(
  legacy_evidence.base_points * greatest(0, extract(epoch from (
    legacy_evidence.observed_at + interval '90 days' - clock_timestamp()
  ))) / extract(epoch from interval '90 days')
))::integer > 0
  and not exists (
    select 1
      from private.trust_signal_adjustments legacy_adjustment
     where legacy_adjustment.original_signal_id = legacy_evidence.original_signal_id
       and legacy_adjustment.adjustment_type = 'reviewed_false_positive'
       and legacy_adjustment.effective_at <= clock_timestamp()
  )`;
const freshEvidenceContributesSql = `greatest(0, floor(
  fresh_evidence.base_points * greatest(0, extract(epoch from (
    fresh_evidence.observed_at + interval '90 days' - clock_timestamp()
  ))) / extract(epoch from interval '90 days')
))::integer > 0
  and not exists (
    select 1
      from private.trust_signal_adjustments fresh_adjustment
     where fresh_adjustment.original_signal_id = fresh_evidence.original_signal_id
       and fresh_adjustment.adjustment_type = 'reviewed_false_positive'
       and fresh_adjustment.effective_at <= clock_timestamp()
  )`;
const caseCanReviewSql = `trust_case.status <> 'resolved'
  and not exists (
    select 1
      from private.trust_case_evidence legacy_evidence
     where legacy_evidence.case_id = trust_case.id
       and legacy_evidence.signal_type in (
         'opponent_concentration',
         'one_sided_outcome_pattern'
       )
       and legacy_evidence.safe_review_summary is null
       and ${legacyEvidenceContributesSql}
       and not exists (
         select 1
           from private.trust_case_evidence fresh_evidence
          where fresh_evidence.case_id = legacy_evidence.case_id
            and fresh_evidence.signal_type = legacy_evidence.signal_type
            and fresh_evidence.safe_review_summary is not null
            and ${freshEvidenceContributesSql}
            and (fresh_evidence.observed_at, fresh_evidence.id) >
                (legacy_evidence.observed_at, legacy_evidence.id)
       )
  )`;

export function createTrustReviewService(
  database: TrustReviewDatabase,
  { createId = randomUUID }: { createId?: () => string } = {},
): TrustReviewService {
  return {
    async listCases(filters) {
      validatePage(filters.page, filters.pageSize);
      validateSearch(filters.search);
      const client = await database.connect();
      try {
        const { clause, values } = buildQueueWhere(filters);
        const count = await client.query<CountRow>(
          `select count(*)::integer as total_items
             from private.trust_cases trust_case
             join public.players player on player.id = trust_case.player_id
            where ${clause}`,
          values,
        );
        const offset = (filters.page - 1) * filters.pageSize;
        const result = await client.query<QueueRow>(
          `select trust_case.id::text as case_id,
                  trust_case.player_id::text,
                  player.player_name,
                  trust_case.status,
                  trust_case.version,
                  trust_case.current_score,
                  trust_case.current_band,
                  trust_case.policy_version,
                  coalesce((
                    select array_agg(distinct evidence.signal_type order by evidence.signal_type)
                      from private.trust_case_evidence evidence
                     where evidence.case_id = trust_case.id
                  ), array[]::text[]) as signal_types,
                  (select count(*)::integer
                     from private.trust_restrictions restriction
                    where restriction.case_id = trust_case.id
                  ) as restriction_count,
                  (select count(*)::integer
                     from private.trust_restrictions restriction
                     left join private.trust_appeals appeal
                       on appeal.challenged_decision_id = restriction.decision_id
                     left join private.trust_appeal_resolutions resolution
                       on resolution.appeal_id = appeal.id
                    where restriction.case_id = trust_case.id
                      and ${activeRestrictionPredicateSql}
                  ) as active_restriction_count,
                  (select max(${effectiveRestrictionExpirySql})
                     from private.trust_restrictions restriction
                     left join private.trust_appeals appeal
                       on appeal.challenged_decision_id = restriction.decision_id
                     left join private.trust_appeal_resolutions resolution
                       on resolution.appeal_id = appeal.id
                    where restriction.case_id = trust_case.id
                      and ${activeRestrictionPredicateSql}
                  ) as latest_restriction_expiry,
                  coalesce((
                    select array_agg(distinct restriction.scope order by restriction.scope)
                      from private.trust_restrictions restriction
                      left join private.trust_appeals appeal
                        on appeal.challenged_decision_id = restriction.decision_id
                      left join private.trust_appeal_resolutions resolution
                        on resolution.appeal_id = appeal.id
                     where restriction.case_id = trust_case.id
                       and ${activeRestrictionPredicateSql}
                  ), array[]::text[]) as active_restriction_scopes,
                  (${caseCanReviewSql}) as can_review,
                  trust_case.opened_at,
                  trust_case.updated_at
             from private.trust_cases trust_case
             join public.players player on player.id = trust_case.player_id
            where ${clause}
            order by case trust_case.current_band
                       when 'urgent_review' then 0
                       when 'review_required' then 1
                       when 'observe' then 2
                       else 3
                     end,
                     trust_case.updated_at desc,
                     trust_case.id
            limit $${values.length + 1} offset $${values.length + 2}`,
          [...values, filters.pageSize, offset],
        );
        const totalItems = count.rows[0]?.total_items ?? 0;
        return {
          items: result.rows.map(mapQueueRow),
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / filters.pageSize),
        };
      } finally {
        client.release();
      }
    },

    async getCase(input) {
      const client = await database.connect();
      try {
        return await loadDetail(client, input.actorPlayerId, input.caseId);
      } finally {
        client.release();
      }
    },

    async listEvidence(input) {
      validatePage(input.page, input.pageSize);
      const client = await database.connect();
      try {
        await assertAccessibleCase(client, input.actorPlayerId, input.caseId);
        return await loadEvidencePage(
          client,
          input.caseId,
          input.page,
          input.pageSize,
        );
      } finally {
        client.release();
      }
    },

    async listRestrictions(input) {
      validatePage(input.page, input.pageSize);
      const client = await database.connect();
      try {
        await assertAccessibleCase(client, input.actorPlayerId, input.caseId);
        return await loadRestrictionsPage(
          client,
          input.caseId,
          input.page,
          input.pageSize,
        );
      } finally {
        client.release();
      }
    },

    async listHistory(input) {
      validatePage(input.page, input.pageSize);
      const client = await database.connect();
      try {
        await assertAccessibleCase(client, input.actorPlayerId, input.caseId);
        return await loadHistoryPage(
          client,
          input.caseId,
          input.page,
          input.pageSize,
        );
      } finally {
        client.release();
      }
    },

    async decide(input) {
      validateDecision(input);
      const client = await database.connect();
      try {
        await client.query('begin');

        const accessible = await client.query<{ player_id: string }>(
          `select player_id::text
             from private.trust_cases
            where id = $1::uuid
              and player_id <> $2::uuid`,
          [input.caseId, input.actorPlayerId],
        );
        const playerId = accessible.rows[0]?.player_id;
        if (!playerId) throw new TrustCaseNotFoundError();

        await client.query(
          'select pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`trust-player:${playerId}`],
        );
        const targetPlayer = await client.query(
          `select 1
             from public.players
            where id = $1::uuid
              and lifecycle_status = 'active'
            for share`,
          [playerId],
        );
        if (targetPlayer.rows.length === 0) throw new TrustCaseNotFoundError();
        const currentResult = await client.query<DecisionCaseRow>(
          `select id::text,
                  player_id::text,
                  policy_version,
                  status,
                  version,
                  latest_score_snapshot_id::text,
                  (${caseCanReviewSql}) as can_review
             from private.trust_cases trust_case
            where id = $1::uuid
              and player_id <> $2::uuid
            for update`,
          [input.caseId, input.actorPlayerId],
        );
        const current = currentResult.rows[0];
        if (!current) throw new TrustCaseNotFoundError();
        if (current.version !== input.expectedVersion) {
          throw new StaleTrustCaseVersionError();
        }
        if (!current.can_review) {
          throw new InvalidTrustDecisionError(
            'This trust case cannot be reviewed until fresh explainable opponent-pattern evidence is available.',
          );
        }
        const resultingStatus = reviewerResultingStatus(
          current.status,
          input.action,
        );
        if (
          input.action === 'mark_false_positive' &&
          current.policy_version !== 'trust-v1'
        ) {
          throw new InvalidTrustDecisionError(
            'False-positive score adjustment is not supported for this case policy version.',
          );
        }

        const selectedEvidenceIds = input.evidenceIds;
        const evidence = await loadSelectedEvidence(
          client,
          input.caseId,
          selectedEvidenceIds,
        );
        if (evidence.length !== selectedEvidenceIds.length) {
          throw new InvalidTrustDecisionError(
            'One or more selected evidence summaries do not belong to this case.',
          );
        }
        if (
          evidence.some(
            (item) =>
              (item.signal_type === 'opponent_concentration' ||
                item.signal_type === 'one_sided_outcome_pattern') &&
              item.safe_review_summary === null,
          )
        ) {
          throw new InvalidTrustDecisionError(
            'A selected opponent-pattern evidence summary is unavailable.',
          );
        }

        const falsePositiveIds = new Set(
          input.action === 'mark_false_positive' ? input.evidenceIds : [],
        );
        const falsePositiveEvidence = evidence.filter((item) =>
          falsePositiveIds.has(item.evidence_id),
        );
        if (
          falsePositiveEvidence.some((item) => item.reviewed_false_positive)
        ) {
          throw new InvalidTrustDecisionError(
            'A selected evidence summary was already reviewed as a false positive.',
          );
        }

        const nowResult = await client.query<{ now: Date }>(
          'select clock_timestamp() as now',
        );
        const decidedAt = nowResult.rows[0]?.now;
        if (!decidedAt)
          throw new Error('Database did not return decision time.');

        const hasActiveRestriction = await caseHasActiveRestriction(
          client,
          input.caseId,
          decidedAt,
        );
        if (input.action === 'dismiss' && hasActiveRestriction) {
          throw new InvalidTrustDecisionError(
            'A case with an active restriction cannot be resolved.',
          );
        }

        const decisionId = createId();
        const resultingSnapshot = await resultingSnapshotForDecision(client, {
          playerId: current.player_id,
          policyVersion: current.policy_version,
          currentSnapshotId: current.latest_score_snapshot_id,
          decidedAt,
          newlyAdjustedSignalIds: falsePositiveEvidence.map(
            (item) => item.original_signal_id,
          ),
          createId,
        });
        const resolutionReason =
          input.action === 'dismiss' ? 'dismissed' : null;
        const governanceFinalized =
          resultingStatus === 'resolved' &&
          (await caseHasNoRestrictionHistory(client, input.caseId));

        const update = await client.query(
          `update private.trust_cases
              set status = $3,
                  version = $2 + 1,
                  current_score = $7,
                  current_band = $8,
                  latest_score_snapshot_id = $9::uuid,
                  updated_at = $4::timestamptz,
                  resolved_at = case when $3 = 'resolved' then $4::timestamptz else null end,
                  resolution_reason = $5,
                  governance_finalized_at = case
                    when $6::boolean then $4::timestamptz
                    else null
                  end
            where id = $1::uuid
              and version = $2`,
          [
            input.caseId,
            input.expectedVersion,
            resultingStatus,
            decidedAt,
            resolutionReason,
            governanceFinalized,
            resultingSnapshot.finalScore,
            resultingSnapshot.reviewBand,
            resultingSnapshot.snapshotId,
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
             $5, $6, $7, $8, $9, $10, $11,
             $12::uuid, $13::timestamptz
           )`,
          [
            decisionId,
            input.caseId,
            input.actorPlayerId,
            current.policy_version,
            input.expectedVersion,
            input.expectedVersion + 1,
            decisionType(input.action),
            current.status,
            resultingStatus,
            reasonCodeForAction(input.action),
            input.reasonNote,
            resultingSnapshot.snapshotId,
            decidedAt,
          ],
        );

        if (evidence.length > 0) {
          await client.query(
            `insert into private.trust_decision_evidence (
               decision_id, case_evidence_id
             )
             select $1::uuid, evidence_id
               from unnest($2::uuid[]) as evidence_id`,
            [decisionId, evidence.map((item) => item.evidence_id)],
          );
        }

        if (falsePositiveEvidence.length > 0) {
          await client.query(
            `insert into private.trust_signal_adjustments (
               id, case_id, original_signal_id, decision_id,
               policy_version, adjustment_type, effective_at
             )
             select adjustment.id,
                    $1::uuid,
                    adjustment.original_signal_id,
                    $2::uuid,
                    $3,
                    'reviewed_false_positive',
                    $4::timestamptz
               from unnest($5::uuid[], $6::uuid[])
                 as adjustment(id, original_signal_id)`,
            [
              input.caseId,
              decisionId,
              current.policy_version,
              decidedAt,
              falsePositiveEvidence.map(() => createId()),
              falsePositiveEvidence.map((item) => item.original_signal_id),
            ],
          );
        }

        if (input.action === 'restrict') {
          const durationHours = input.restrictionDurationHours;
          if (durationHours === undefined) {
            throw new InvalidTrustDecisionError(
              'A restriction duration is required.',
            );
          }
          const scopes = unique(input.restrictionScopes);
          await client.query(
            `insert into private.trust_restrictions (
               id, case_id, player_id, decision_id, policy_version,
               scope, starts_at, original_expires_at
             )
             select restriction.id,
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    $4,
                    restriction.scope,
                    $5::timestamptz,
                    $5::timestamptz + ($6::integer * interval '1 hour')
               from unnest($7::uuid[], $8::text[])
                 as restriction(id, scope)`,
            [
              input.caseId,
              current.player_id,
              decisionId,
              current.policy_version,
              decidedAt,
              durationHours,
              scopes.map(() => createId()),
              scopes,
            ],
          );
        }

        const detail = await loadDetail(
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

    async exportCase(input) {
      const client = await database.connect();
      try {
        await client.query(
          'begin transaction isolation level repeatable read read only',
        );
        const detail = await loadDetail(
          client,
          input.actorPlayerId,
          input.caseId,
        );
        const evidence = await loadEvidencePage(
          client,
          input.caseId,
          1,
          TRUST_REVIEW_EXPORT_PAGE_SIZE,
        );
        const restrictions = await loadRestrictionsPage(
          client,
          input.caseId,
          1,
          TRUST_REVIEW_EXPORT_PAGE_SIZE,
        );
        const history = await loadHistoryPage(
          client,
          input.caseId,
          1,
          TRUST_REVIEW_EXPORT_PAGE_SIZE,
        );
        const now = await client.query<{ now: Date }>(
          'select clock_timestamp() as now',
        );
        const generatedAt = now.rows[0]?.now;
        if (!generatedAt)
          throw new Error('Database did not return export time.');
        const exported: TrustCaseExport = {
          formatVersion: 'trust-case-review-v1',
          generatedAt: generatedAt.toISOString(),
          case: detail,
          evidence,
          restrictions,
          history,
        };
        await client.query('commit');
        return exported;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function buildQueueWhere(filters: TrustCaseQueueFilters): {
  clause: string;
  values: unknown[];
} {
  const clauses = ['trust_case.player_id <> $1::uuid'];
  const values: unknown[] = [filters.actorPlayerId];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.status === 'active') {
    clauses.push("trust_case.status in ('open', 'under_review')");
  } else if (filters.status !== 'all') {
    add('trust_case.status = ?', filters.status);
  }
  if (filters.search) {
    const searchParameter = `$${values.length + 1}`;
    values.push(filters.search);
    clauses.push(
      isUuid(filters.search)
        ? `(strpos(lower(player.player_name), lower(${searchParameter})) > 0
            or trust_case.id = ${searchParameter}::uuid
            or trust_case.player_id = ${searchParameter}::uuid)`
        : `strpos(lower(player.player_name), lower(${searchParameter})) > 0`,
    );
  }
  if (filters.band) add('trust_case.current_band = ?', filters.band);
  if (filters.createdFrom)
    add('trust_case.opened_at >= ?::timestamptz', filters.createdFrom);
  if (filters.createdTo)
    add('trust_case.opened_at <= ?::timestamptz', filters.createdTo);
  if (filters.updatedFrom)
    add('trust_case.updated_at >= ?::timestamptz', filters.updatedFrom);
  if (filters.updatedTo)
    add('trust_case.updated_at <= ?::timestamptz', filters.updatedTo);
  if (filters.signalType) {
    add(
      `exists (
         select 1 from private.trust_case_evidence evidence
          where evidence.case_id = trust_case.id
            and evidence.signal_type = ?
       )`,
      filters.signalType,
    );
  }
  if (filters.restrictionState) {
    clauses.push(`${filters.restrictionState === 'none' ? 'not ' : ''}exists (
      select 1
        from private.trust_restrictions restriction
        left join private.trust_appeals appeal
          on appeal.challenged_decision_id = restriction.decision_id
        left join private.trust_appeal_resolutions resolution
          on resolution.appeal_id = appeal.id
       where restriction.case_id = trust_case.id
         and ${effectiveRestrictionExpirySql} > clock_timestamp()
    )`);
  }
  return { clause: clauses.join('\n and '), values };
}

async function loadDetail(
  client: TrustReviewQueryable,
  actorPlayerId: string,
  caseId: string,
): Promise<TrustCaseDetail> {
  const result = await client.query<DetailRow>(
    `select trust_case.id::text as case_id,
            trust_case.player_id::text,
            player.player_name,
            trust_case.status,
            trust_case.version,
            trust_case.current_score,
            trust_case.current_band,
            trust_case.policy_version,
            snapshot.id::text as snapshot_id,
            snapshot.evaluated_at as snapshot_evaluated_at,
            snapshot.movement_points,
            snapshot.submission_conflict_points,
            snapshot.opponent_pattern_points,
            snapshot.source_signal_count,
            (select count(*)::integer
               from private.trust_restrictions restriction
              where restriction.case_id = trust_case.id
            ) as restriction_count,
            (select count(*)::integer
               from private.trust_restrictions restriction
               left join private.trust_appeals appeal
                 on appeal.challenged_decision_id = restriction.decision_id
               left join private.trust_appeal_resolutions resolution
                 on resolution.appeal_id = appeal.id
              where restriction.case_id = trust_case.id
                and ${activeRestrictionPredicateSql}
            ) as active_restriction_count,
            (select max(${effectiveRestrictionExpirySql})
               from private.trust_restrictions restriction
               left join private.trust_appeals appeal
                 on appeal.challenged_decision_id = restriction.decision_id
               left join private.trust_appeal_resolutions resolution
                 on resolution.appeal_id = appeal.id
              where restriction.case_id = trust_case.id
                and ${activeRestrictionPredicateSql}
            ) as latest_restriction_expiry,
            (${caseCanReviewSql}) as can_review,
            trust_case.opened_at,
            trust_case.updated_at,
            trust_case.resolved_at,
            trust_case.resolution_reason
       from private.trust_cases trust_case
       join public.players player on player.id = trust_case.player_id
       join private.trust_score_snapshots snapshot
         on snapshot.id = trust_case.latest_score_snapshot_id
      where trust_case.id = $1::uuid
        and trust_case.player_id <> $2::uuid`,
    [caseId, actorPlayerId],
  );
  const row = result.rows[0];
  if (!row) throw new TrustCaseNotFoundError();

  // A pg client executes one query at a time. Keep these reads sequential so
  // the detail projection also works with transaction-bound clients.
  const evidence = await loadEvidencePage(
    client,
    caseId,
    1,
    TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
  );
  const restrictions = await loadRestrictionsPage(
    client,
    caseId,
    1,
    TRUST_REVIEW_DETAIL_PREVIEW_SIZE,
  );
  const history = await loadHistoryPage(
    client,
    caseId,
    1,
    HISTORY_DETAIL_LIMIT + 1,
  );
  const evidencePreview = evidence.items;
  const recentHistory = history.items.slice(0, HISTORY_DETAIL_LIMIT);
  return {
    caseId: row.case_id,
    playerId: row.player_id,
    playerName: safePlayerName(row.player_name),
    status: row.status,
    version: row.version,
    score: row.current_score,
    band: row.current_band,
    policyVersion: row.policy_version,
    restrictionCount: row.restriction_count,
    activeRestrictionCount: row.active_restriction_count,
    latestRestrictionExpiry:
      row.latest_restriction_expiry?.toISOString() ?? null,
    canReview: row.can_review,
    categoryTotals: {
      movement: row.movement_points,
      submissionConflicts: row.submission_conflict_points,
      opponentPatterns: row.opponent_pattern_points,
    },
    sourceSignalCount: row.source_signal_count,
    scoreExplanation: {
      snapshotId: row.snapshot_id,
      evaluatedAt: row.snapshot_evaluated_at.toISOString(),
      movementPoints: row.movement_points,
      submissionConflictPoints: row.submission_conflict_points,
      opponentPatternPoints: row.opponent_pattern_points,
      finalScore: row.current_score,
      reviewBand: row.current_band,
      sourceSignalCount: row.source_signal_count,
    },
    evidence: evidencePreview,
    evidencePreview,
    evidenceTotalItems: evidence.totalItems,
    evidenceTruncated: evidence.totalItems > evidence.items.length,
    restrictionPreview: restrictions.items,
    restrictionTotalItems: restrictions.totalItems,
    restrictionsTruncated: restrictions.totalItems > restrictions.items.length,
    recentHistory,
    history: recentHistory,
    historyTruncated: history.totalItems > HISTORY_DETAIL_LIMIT,
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolutionReason: row.resolution_reason,
  };
}

async function loadEvidencePage(
  client: TrustReviewQueryable,
  caseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedTrustResult<TrustCaseEvidenceSummary>> {
  const count = await client.query<CountRow>(
    `select count(*)::integer as total_items
       from private.trust_case_evidence
      where case_id = $1::uuid`,
    [caseId],
  );
  const result = await client.query<EvidenceRow>(
    `select evidence.id::text as evidence_id,
            evidence.original_signal_id::text,
            evidence.signal_type,
            evidence.severity,
            evidence.base_points,
            case
              when adjustment.id is not null then 0
              else greatest(0, floor(
                evidence.base_points * greatest(0, extract(epoch from (
                  evidence.observed_at + interval '90 days' - clock_timestamp()
                ))) / extract(epoch from interval '90 days')
              ))::integer
            end as effective_points,
            evidence.observed_at,
            evidence.observed_at + interval '90 days' as expires_at,
            evidence.policy_version,
            evidence.safe_source_type,
            evidence.safe_review_summary,
            (adjustment.id is not null) as reviewed_false_positive,
            (evidence.observed_at + interval '90 days' <= clock_timestamp()) as expired
       from private.trust_case_evidence evidence
       left join private.trust_signal_adjustments adjustment
         on adjustment.original_signal_id = evidence.original_signal_id
        and adjustment.adjustment_type = 'reviewed_false_positive'
      where evidence.case_id = $1::uuid
      order by evidence.observed_at desc, evidence.id
      limit $2 offset $3`,
    [caseId, pageSize, (page - 1) * pageSize],
  );
  const totalItems = count.rows[0]?.total_items ?? 0;
  return {
    items: result.rows.map(mapEvidenceRow),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

async function loadRestrictionsPage(
  client: TrustReviewQueryable,
  caseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedTrustResult<TrustRestrictionSummary>> {
  const count = await client.query<CountRow>(
    `select count(*)::integer as total_items
       from private.trust_restrictions
      where case_id = $1::uuid`,
    [caseId],
  );
  const result = await client.query<RestrictionRow>(
    `select restriction.id::text as restriction_id,
            restriction.decision_id::text,
            restriction.scope,
            restriction.starts_at,
            restriction.original_expires_at,
            ${effectiveRestrictionExpirySql} as effective_expires_at,
            ${effectiveRestrictionExpirySql} > clock_timestamp() as active,
            case
              when resolution.appeal_id is not null then 'resolved'
              when appeal.id is not null then 'submitted'
              when clock_timestamp() <= restriction.original_expires_at + interval '30 days'
                then 'eligible'
              else 'expired'
            end as appeal_status
       from private.trust_restrictions restriction
       left join private.trust_appeals appeal
         on appeal.challenged_decision_id = restriction.decision_id
       left join private.trust_appeal_resolutions resolution
         on resolution.appeal_id = appeal.id
      where restriction.case_id = $1::uuid
      order by restriction.starts_at desc, restriction.id
      limit $2 offset $3`,
    [caseId, pageSize, (page - 1) * pageSize],
  );
  const totalItems = count.rows[0]?.total_items ?? 0;
  return {
    items: result.rows.map(mapRestrictionRow),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

async function loadHistoryPage(
  client: TrustReviewQueryable,
  caseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedTrustResult<TrustDecisionHistoryItem>> {
  const count = await client.query<CountRow>(
    `select count(*)::integer as total_items
       from private.trust_case_decisions
      where case_id = $1::uuid`,
    [caseId],
  );
  const result = await client.query<HistoryRow>(
    `select decision.id::text as decision_id,
            decision.actor_type,
            decision.actor_player_id::text,
            case
              when actor.lifecycle_status = 'deleted' then 'Deleted author'
              else actor.player_name
            end as actor_player_name,
            decision.decision_type,
            decision.previous_status,
            decision.resulting_status,
            decision.reason_code,
            decision.reason_note,
            decision.policy_version,
            decision.case_version_before,
            decision.case_version_after,
            coalesce((
              select array_agg(link.case_evidence_id::text order by link.case_evidence_id)
                from private.trust_decision_evidence link
               where link.decision_id = decision.id
            ), array[]::text[]) as evidence_ids,
            coalesce((
              select array_agg(evidence.id::text order by evidence.id)
                from private.trust_signal_adjustments adjustment
                join private.trust_case_evidence evidence
                  on evidence.case_id = adjustment.case_id
                 and evidence.original_signal_id = adjustment.original_signal_id
               where adjustment.decision_id = decision.id
                 and adjustment.adjustment_type = 'reviewed_false_positive'
            ), array[]::text[]) as false_positive_evidence_ids,
            coalesce((
              select jsonb_agg(
                       jsonb_build_object(
                         'restrictionId', restriction.id::text,
                         'decisionId', restriction.decision_id::text,
                         'scope', restriction.scope,
                         'startsAt', restriction.starts_at,
                         'originalExpiresAt', restriction.original_expires_at,
                         'effectiveExpiresAt', ${effectiveRestrictionExpirySql},
                         'expiresAt', restriction.original_expires_at,
                         'active', ${activeRestrictionPredicateSql},
                         'appealStatus', case
                           when resolution.appeal_id is not null then 'resolved'
                           when appeal.id is not null then 'submitted'
                           when clock_timestamp() <= restriction.original_expires_at + interval '30 days'
                             then 'eligible'
                           else 'expired'
                         end
                       ) order by restriction.scope
                     )
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
      order by decision.case_version_after desc, decision.id desc
      limit $2 offset $3`,
    [caseId, pageSize, (page - 1) * pageSize],
  );
  const totalItems = count.rows[0]?.total_items ?? 0;
  return {
    items: result.rows.map(mapHistoryRow),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

async function assertAccessibleCase(
  client: TrustReviewQueryable,
  actorPlayerId: string,
  caseId: string,
): Promise<void> {
  const result = await client.query(
    `select 1
       from private.trust_cases
      where id = $1::uuid
        and player_id <> $2::uuid`,
    [caseId, actorPlayerId],
  );
  if (result.rows.length === 0) throw new TrustCaseNotFoundError();
}

async function loadSelectedEvidence(
  client: TrustReviewQueryable,
  caseId: string,
  evidenceIds: string[],
): Promise<EvidenceRow[]> {
  if (evidenceIds.length === 0) return [];
  const result = await client.query<EvidenceRow>(
    `select evidence.id::text as evidence_id,
            evidence.original_signal_id::text,
            evidence.signal_type,
            evidence.severity,
            evidence.base_points,
            0 as effective_points,
            evidence.observed_at,
            evidence.observed_at + interval '90 days' as expires_at,
            evidence.policy_version,
            evidence.safe_source_type,
            evidence.safe_review_summary,
            (adjustment.id is not null) as reviewed_false_positive,
            false as expired
       from private.trust_case_evidence evidence
       left join private.trust_signal_adjustments adjustment
         on adjustment.original_signal_id = evidence.original_signal_id
        and adjustment.adjustment_type = 'reviewed_false_positive'
      where evidence.case_id = $1::uuid
        and evidence.id = any($2::uuid[])
      order by evidence.id`,
    [caseId, evidenceIds],
  );
  return result.rows;
}

async function resultingSnapshotForDecision(
  client: TrustReviewQueryable,
  input: {
    playerId: string;
    policyVersion: string;
    currentSnapshotId: string;
    decidedAt: Date;
    newlyAdjustedSignalIds: string[];
    createId: () => string;
  },
): Promise<{
  snapshotId: string;
  finalScore: number;
  reviewBand: TrustReviewBand;
}> {
  const current = await client.query<SnapshotProjectionRow>(
    `select movement_points,
            submission_conflict_points,
            opponent_pattern_points,
            final_score,
            review_band,
            source_signal_count,
            calculation_digest
       from private.trust_score_snapshots
      where id = $1::uuid`,
    [input.currentSnapshotId],
  );
  const currentSnapshot = current.rows[0];
  if (!currentSnapshot) {
    throw new Error('Trust case score snapshot is missing.');
  }
  if (input.newlyAdjustedSignalIds.length === 0) {
    return {
      snapshotId: input.currentSnapshotId,
      finalScore: currentSnapshot.final_score,
      reviewBand: currentSnapshot.review_band,
    };
  }

  const signalsResult = await client.query<ReviewScoreSignalRow>(
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
    [input.playerId, input.decidedAt, input.policyVersion],
  );
  const newlyAdjusted = new Set(input.newlyAdjustedSignalIds);
  const score = calculateTrustScore({
    evaluatedAt: input.decidedAt,
    signals: signalsResult.rows.map((row) => ({
      id: row.id,
      signalType: row.signal_type,
      basePoints: row.base_points,
      observedAt: row.observed_at,
      adjustedFalsePositive:
        row.adjusted_false_positive || newlyAdjusted.has(row.id),
    })),
  });
  const sameProjection =
    currentSnapshot.movement_points === score.movementPoints &&
    currentSnapshot.submission_conflict_points ===
      score.submissionConflictPoints &&
    currentSnapshot.opponent_pattern_points === score.opponentPatternPoints &&
    currentSnapshot.final_score === score.finalScore &&
    currentSnapshot.review_band === score.reviewBand &&
    currentSnapshot.source_signal_count === score.sourceSignalCount &&
    currentSnapshot.calculation_digest.equals(score.calculationDigest);
  if (sameProjection) {
    return {
      snapshotId: input.currentSnapshotId,
      finalScore: score.finalScore,
      reviewBand: score.reviewBand,
    };
  }

  const snapshotId = input.createId();
  await client.query(
    `insert into private.trust_score_snapshots (
       id, player_id, policy_version, evaluated_at,
       movement_points, submission_conflict_points, opponent_pattern_points,
       final_score, review_band, source_signal_count, calculation_digest,
       purge_after
     ) values (
       $1::uuid, $2::uuid, $3, $4::timestamptz,
       $5, $6, $7, $8, $9, $10, $11,
       $4::timestamptz + interval '12 months'
     )`,
    [
      snapshotId,
      input.playerId,
      input.policyVersion,
      input.decidedAt,
      score.movementPoints,
      score.submissionConflictPoints,
      score.opponentPatternPoints,
      score.finalScore,
      score.reviewBand,
      score.sourceSignalCount,
      score.calculationDigest,
    ],
  );
  return {
    snapshotId,
    finalScore: score.finalScore,
    reviewBand: score.reviewBand,
  };
}

async function caseHasActiveRestriction(
  client: TrustReviewQueryable,
  caseId: string,
  at: Date,
): Promise<boolean> {
  const result = await client.query<{ active: boolean }>(
    `select exists (
       select 1
         from private.trust_restrictions restriction
         left join private.trust_appeals appeal
           on appeal.challenged_decision_id = restriction.decision_id
         left join private.trust_appeal_resolutions resolution
           on resolution.appeal_id = appeal.id
        where restriction.case_id = $1::uuid
          and ${effectiveRestrictionExpirySql} > $2::timestamptz
     ) as active`,
    [caseId, at],
  );
  return result.rows[0]?.active ?? false;
}

async function caseHasNoRestrictionHistory(
  client: TrustReviewQueryable,
  caseId: string,
): Promise<boolean> {
  const result = await client.query<{ has_none: boolean }>(
    `select not exists (
       select 1 from private.trust_restrictions where case_id = $1::uuid
     ) as has_none`,
    [caseId],
  );
  return result.rows[0]?.has_none ?? false;
}

function validateDecision(input: TrustDecisionInput): void {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new InvalidTrustDecisionError(
      'The expected case version must be a positive integer.',
    );
  }
  if (
    input.reasonNote !== input.reasonNote.trim() ||
    input.reasonNote.length < 1 ||
    input.reasonNote.length > TRUST_REVIEW_MAX_NOTE_LENGTH ||
    /\p{Cc}/u.test(input.reasonNote)
  ) {
    throw new InvalidTrustDecisionError(
      'The reviewer reason must be trimmed, non-empty, and at most 1000 characters.',
    );
  }
  if (input.evidenceIds.length > 100) {
    throw new InvalidTrustDecisionError(
      'A decision may reference at most 100 evidence summaries.',
    );
  }
  if (unique(input.evidenceIds).length !== input.evidenceIds.length) {
    throw new InvalidTrustDecisionError('Evidence identifiers must be unique.');
  }
  if (
    input.action === 'mark_false_positive' &&
    input.evidenceIds.length === 0
  ) {
    throw new InvalidTrustDecisionError(
      'A false-positive decision requires at least one evidence summary.',
    );
  }
  if (
    input.restrictionScopes.some(
      (scope) => !writableRestrictionScopes.has(scope),
    )
  ) {
    throw new InvalidTrustDecisionError(
      'The requested restriction scope is not writable through this API.',
    );
  }
  if (input.action === 'restrict') {
    if (input.restrictionScopes.length === 0) {
      throw new InvalidTrustDecisionError(
        'A restriction decision requires at least one supported scope.',
      );
    }
    if (
      !Number.isInteger(input.restrictionDurationHours) ||
      (input.restrictionDurationHours ?? 0) < 1 ||
      (input.restrictionDurationHours ?? 0) > TRUST_REVIEW_MAX_RESTRICTION_HOURS
    ) {
      throw new InvalidTrustDecisionError(
        'Restriction duration must be between 1 and 168 whole hours.',
      );
    }
  } else if (
    input.restrictionScopes.length > 0 ||
    input.restrictionDurationHours !== undefined
  ) {
    throw new InvalidTrustDecisionError(
      'Only a restriction decision may include scopes or a duration.',
    );
  }
}

function validatePage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError('page must be a positive integer.');
  }
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > TRUST_REVIEW_MAX_PAGE_SIZE
  ) {
    throw new RangeError(
      `pageSize must be between 1 and ${TRUST_REVIEW_MAX_PAGE_SIZE}.`,
    );
  }
}

function validateSearch(search: string | undefined): void {
  if (search === undefined) return;
  if (
    search !== search.trim() ||
    search.length < 1 ||
    search.length > TRUST_REVIEW_MAX_SEARCH_LENGTH ||
    /\p{Cc}/u.test(search)
  ) {
    throw new RangeError(
      `search must be trimmed, non-empty, and at most ${TRUST_REVIEW_MAX_SEARCH_LENGTH} characters.`,
    );
  }
}

function mapQueueRow(row: QueueRow): TrustCaseQueueItem {
  return {
    caseId: row.case_id,
    playerId: row.player_id,
    playerName: safePlayerName(row.player_name),
    status: row.status,
    version: row.version,
    score: row.current_score,
    band: row.current_band,
    policyVersion: row.policy_version,
    signalTypes: row.signal_types ?? [],
    restrictionCount: row.restriction_count,
    activeRestrictionCount: row.active_restriction_count,
    latestRestrictionExpiry:
      row.latest_restriction_expiry?.toISOString() ?? null,
    activeRestrictionScopes: row.active_restriction_scopes ?? [],
    canReview: row.can_review,
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEvidenceRow(row: EvidenceRow): TrustCaseEvidenceSummary {
  const state = row.reviewed_false_positive
    ? 'adjusted_false_positive'
    : row.expired
      ? 'expired'
      : 'active';
  return {
    evidenceId: row.evidence_id,
    signalType: row.signal_type,
    severity: row.severity,
    basePoints: row.base_points,
    effectivePoints: row.effective_points,
    observedAt: row.observed_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    policyVersion: row.policy_version,
    state,
    decayState: row.reviewed_false_positive
      ? 'reviewed_false_positive'
      : row.expired
        ? 'expired'
        : 'active',
    safeSourceType: row.safe_source_type,
    reviewedFalsePositive: row.reviewed_false_positive,
    opponentPattern: safeOpponentPatternSummary(
      row.safe_review_summary,
      row.signal_type,
    ),
  };
}

function mapRestrictionRow(row: RestrictionRow): TrustRestrictionSummary {
  return {
    restrictionId: row.restriction_id,
    decisionId: row.decision_id,
    scope: row.scope,
    startsAt: row.starts_at.toISOString(),
    originalExpiresAt: row.original_expires_at.toISOString(),
    effectiveExpiresAt: row.effective_expires_at.toISOString(),
    active: row.active,
    appealStatus: row.appeal_status,
  };
}

function safeOpponentPatternSummary(
  value: unknown,
  signalType: TrustSignalType,
): TrustCaseEvidenceSummary['opponentPattern'] {
  const isOpponentPattern =
    signalType === 'opponent_concentration' ||
    signalType === 'one_sided_outcome_pattern';
  if (!isOpponentPattern) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      availability: 'unavailable',
      reason: 'legacy_summary_not_retained',
      remediation: 'await_fresh_detector_evaluation',
    };
  }
  const summary = value as Record<string, unknown>;
  if (
    signalType === 'opponent_concentration' &&
    summary.kind === 'opponent_concentration' &&
    isDateTime(summary.evaluationWindowStart) &&
    isDateTime(summary.evaluationWindowEnd) &&
    isNonNegativeInteger(summary.completedMatchCount) &&
    isNonNegativeInteger(summary.repeatedOpponentMatchCount) &&
    typeof summary.opponentConcentrationRatio === 'number' &&
    summary.opponentConcentrationRatio >= 0 &&
    summary.opponentConcentrationRatio <= 1 &&
    summary.minimumCompletedMatchCount === 6 &&
    summary.minimumOpponentConcentrationRatio === 0.8
  ) {
    return {
      availability: 'available',
      kind: 'opponent_concentration',
      evaluationWindowStart: summary.evaluationWindowStart,
      evaluationWindowEnd: summary.evaluationWindowEnd,
      completedMatchCount: summary.completedMatchCount,
      repeatedOpponentMatchCount: summary.repeatedOpponentMatchCount,
      opponentConcentrationRatio: summary.opponentConcentrationRatio,
      minimumCompletedMatchCount: 6,
      minimumOpponentConcentrationRatio: 0.8,
    };
  }
  if (
    signalType === 'one_sided_outcome_pattern' &&
    summary.kind === 'one_sided_outcome_pattern' &&
    isDateTime(summary.evaluationWindowStart) &&
    isDateTime(summary.evaluationWindowEnd) &&
    isNonNegativeInteger(summary.qualifyingForfeitCount) &&
    summary.minimumQualifyingForfeitCount === 4
  ) {
    return {
      availability: 'available',
      kind: 'one_sided_outcome_pattern',
      evaluationWindowStart: summary.evaluationWindowStart,
      evaluationWindowEnd: summary.evaluationWindowEnd,
      qualifyingForfeitCount: summary.qualifyingForfeitCount,
      minimumQualifyingForfeitCount: 4,
    };
  }
  return {
    availability: 'unavailable',
    reason: 'legacy_summary_not_retained',
    remediation: 'await_fresh_detector_evaluation',
  };
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function mapHistoryRow(row: HistoryRow): TrustDecisionHistoryItem {
  return {
    decisionId: row.decision_id,
    actorType: row.actor_type,
    actorPlayerId: row.actor_player_id,
    actorPlayerName:
      row.actor_type === 'author'
        ? safePlayerName(row.actor_player_name)
        : null,
    decisionType: row.decision_type,
    action: row.decision_type,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    reasonCode: row.reason_code,
    reasonNote: row.reason_note,
    policyVersion: row.policy_version,
    caseVersionBefore: row.case_version_before,
    caseVersionAfter: row.case_version_after,
    versionBefore: row.case_version_before,
    versionAfter: row.case_version_after,
    evidenceIds: row.evidence_ids ?? [],
    falsePositiveEvidenceIds: row.false_positive_evidence_ids ?? [],
    restrictions: row.restrictions ?? [],
    occurredAt: row.created_at.toISOString(),
  };
}

function reviewerResultingStatus(
  currentStatus: TrustCaseStatus,
  action: TrustDecisionAction,
): TrustCaseStatus {
  const resultingStatus = reviewerTransitions[currentStatus][action];
  if (resultingStatus) return resultingStatus;
  if (currentStatus === 'resolved') {
    throw new InvalidTrustDecisionError(
      'Resolved trust cases cannot receive another reviewer decision.',
    );
  }
  throw new InvalidTrustDecisionError(
    `The ${action} decision is not allowed while the trust case is ${currentStatus}.`,
  );
}

function safePlayerName(value: string | null): string {
  return value ?? 'Unnamed player';
}

function decisionType(action: TrustDecisionAction): string {
  switch (action) {
    case 'continue_monitoring':
      return 'monitoring_continued';
    case 'dismiss':
      return 'case_dismissed';
    case 'mark_false_positive':
      return 'evidence_marked_false_positive';
    case 'restrict':
      return 'restriction_applied';
  }
}

function reasonCodeForAction(action: TrustDecisionAction): string {
  switch (action) {
    case 'continue_monitoring':
      return 'review_continue_monitoring';
    case 'dismiss':
      return 'review_dismissed';
    case 'mark_false_positive':
      return 'review_false_positive';
    case 'restrict':
      return 'review_restriction_applied';
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
