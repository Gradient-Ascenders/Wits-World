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
export const TRUST_REVIEW_MAX_SEARCH_LENGTH = 64;
export const TRUST_REVIEW_DETAIL_PREVIEW_SIZE = 10;
export const TRUST_REVIEW_EXPORT_PAGE_SIZE = 100;

export type TrustCaseStatus = 'open' | 'under_review' | 'resolved';
export type TrustCaseQueueStatus = 'active' | TrustCaseStatus;
export type TrustDecisionAction =
  'monitor' | 'dismiss' | 'restrict' | 'resolve';
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
  currentScore: number;
  currentBand: TrustReviewBand;
  policyVersion: string;
  signalTypes: TrustSignalType[];
  activeRestrictionScopes: TrustRestrictionScope[];
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
  decayState: 'active' | 'expired' | 'reviewed_false_positive';
  safeSourceType: string;
  reviewedFalsePositive: boolean;
  opponentPattern: TrustSignalReviewSummary | null;
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

export interface TrustDecisionHistoryItem {
  decisionId: string;
  actorType: 'system' | 'author';
  actorPlayerId: string | null;
  actorPlayerName: string | null;
  action: string;
  previousStatus: TrustCaseStatus | null;
  resultingStatus: TrustCaseStatus;
  reasonCode: string;
  reasonNote: string | null;
  policyVersion: string;
  versionBefore: number;
  versionAfter: number;
  evidenceIds: string[];
  falsePositiveEvidenceIds: string[];
  restrictions: Array<{
    scope: TrustRestrictionScope;
    startsAt: string;
    expiresAt: string;
  }>;
  occurredAt: string;
}

export interface TrustCaseDetail {
  caseId: string;
  playerId: string;
  playerName: string;
  status: TrustCaseStatus;
  version: number;
  currentScore: number;
  currentBand: TrustReviewBand;
  policyVersion: string;
  categoryTotals: {
    movement: number;
    submissionConflicts: number;
    opponentPatterns: number;
  };
  sourceSignalCount: number;
  evidencePreview: TrustCaseEvidenceSummary[];
  evidenceTotalItems: number;
  evidenceTruncated: boolean;
  restrictionPreview: TrustRestrictionSummary[];
  restrictionTotalItems: number;
  restrictionsTruncated: boolean;
  recentHistory: TrustDecisionHistoryItem[];
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
  reasonCode: string;
  note: string;
  evidenceIds: string[];
  falsePositiveEvidenceIds: string[];
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
  active_restriction_scopes: TrustRestrictionScope[] | null;
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
  movement_points: number;
  submission_conflict_points: number;
  opponent_pattern_points: number;
  source_signal_count: number;
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
    scope: TrustRestrictionScope;
    startsAt: string;
    expiresAt: string;
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
const reasonCodePattern = /^[a-z][a-z0-9_]{0,63}$/u;
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
    monitor: 'under_review',
    restrict: 'under_review',
  },
  under_review: {
    monitor: 'under_review',
    restrict: 'under_review',
    dismiss: 'resolved',
    resolve: 'resolved',
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
                  coalesce((
                    select array_agg(distinct restriction.scope order by restriction.scope)
                      from private.trust_restrictions restriction
                      left join private.trust_appeals appeal
                        on appeal.challenged_decision_id = restriction.decision_id
                      left join private.trust_appeal_resolutions resolution
                        on resolution.appeal_id = appeal.id
                     where restriction.case_id = trust_case.id
                       and ${effectiveRestrictionExpirySql} > clock_timestamp()
                  ), array[]::text[]) as active_restriction_scopes,
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
                  latest_score_snapshot_id::text
             from private.trust_cases
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
        const resultingStatus = reviewerResultingStatus(
          current.status,
          input.action,
        );
        if (
          input.falsePositiveEvidenceIds.length > 0 &&
          current.policy_version !== 'trust-v1'
        ) {
          throw new InvalidTrustDecisionError(
            'False-positive score adjustment is not supported for this case policy version.',
          );
        }

        const selectedEvidenceIds = unique([
          ...input.evidenceIds,
          ...input.falsePositiveEvidenceIds,
        ]);
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

        const falsePositiveIds = new Set(input.falsePositiveEvidenceIds);
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
        if (
          (input.action === 'dismiss' || input.action === 'resolve') &&
          hasActiveRestriction
        ) {
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
          input.action === 'dismiss'
            ? 'dismissed'
            : input.action === 'resolve'
              ? 'review_complete'
              : null;
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
            input.reasonCode,
            input.note,
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
  } else {
    add('trust_case.status = ?', filters.status);
  }
  if (filters.search) {
    add('strpos(lower(player.player_name), lower(?)) > 0', filters.search);
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
            snapshot.movement_points,
            snapshot.submission_conflict_points,
            snapshot.opponent_pattern_points,
            snapshot.source_signal_count,
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
  return {
    caseId: row.case_id,
    playerId: row.player_id,
    playerName: safePlayerName(row.player_name),
    status: row.status,
    version: row.version,
    currentScore: row.current_score,
    currentBand: row.current_band,
    policyVersion: row.policy_version,
    categoryTotals: {
      movement: row.movement_points,
      submissionConflicts: row.submission_conflict_points,
      opponentPatterns: row.opponent_pattern_points,
    },
    sourceSignalCount: row.source_signal_count,
    evidencePreview: evidence.items,
    evidenceTotalItems: evidence.totalItems,
    evidenceTruncated: evidence.totalItems > evidence.items.length,
    restrictionPreview: restrictions.items,
    restrictionTotalItems: restrictions.totalItems,
    restrictionsTruncated: restrictions.totalItems > restrictions.items.length,
    recentHistory: history.items.slice(0, HISTORY_DETAIL_LIMIT),
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
                         'scope', restriction.scope,
                         'startsAt', restriction.starts_at,
                         'expiresAt', restriction.original_expires_at
                       ) order by restriction.scope
                     )
                from private.trust_restrictions restriction
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
  if (!reasonCodePattern.test(input.reasonCode)) {
    throw new InvalidTrustDecisionError('The reason code is invalid.');
  }
  if (
    input.note !== input.note.trim() ||
    input.note.length < 1 ||
    input.note.length > TRUST_REVIEW_MAX_NOTE_LENGTH ||
    /\p{Cc}/u.test(input.note)
  ) {
    throw new InvalidTrustDecisionError(
      'The reviewer note must be trimmed, non-empty, and at most 1000 characters.',
    );
  }
  if (
    input.evidenceIds.length > 100 ||
    input.falsePositiveEvidenceIds.length > 100
  ) {
    throw new InvalidTrustDecisionError(
      'A decision may reference at most 100 evidence summaries.',
    );
  }
  if (
    unique([...input.evidenceIds, ...input.falsePositiveEvidenceIds]).length >
    100
  ) {
    throw new InvalidTrustDecisionError(
      'A decision may reference at most 100 distinct evidence summaries in total.',
    );
  }
  if (unique(input.evidenceIds).length !== input.evidenceIds.length) {
    throw new InvalidTrustDecisionError('Evidence identifiers must be unique.');
  }
  if (
    unique(input.falsePositiveEvidenceIds).length !==
    input.falsePositiveEvidenceIds.length
  ) {
    throw new InvalidTrustDecisionError(
      'False-positive evidence identifiers must be unique.',
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
    currentScore: row.current_score,
    currentBand: row.current_band,
    policyVersion: row.policy_version,
    signalTypes: row.signal_types ?? [],
    activeRestrictionScopes: row.active_restriction_scopes ?? [],
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEvidenceRow(row: EvidenceRow): TrustCaseEvidenceSummary {
  return {
    evidenceId: row.evidence_id,
    signalType: row.signal_type,
    severity: row.severity,
    basePoints: row.base_points,
    effectivePoints: row.effective_points,
    observedAt: row.observed_at.toISOString(),
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
): TrustSignalReviewSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
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
      kind: 'one_sided_outcome_pattern',
      evaluationWindowStart: summary.evaluationWindowStart,
      evaluationWindowEnd: summary.evaluationWindowEnd,
      qualifyingForfeitCount: summary.qualifyingForfeitCount,
      minimumQualifyingForfeitCount: 4,
    };
  }
  return null;
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
    action: row.decision_type,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    reasonCode: row.reason_code,
    reasonNote: row.reason_note,
    policyVersion: row.policy_version,
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
    case 'monitor':
      return 'monitoring_continued';
    case 'dismiss':
      return 'case_dismissed';
    case 'restrict':
      return 'restriction_applied';
    case 'resolve':
      return 'case_resolved';
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
