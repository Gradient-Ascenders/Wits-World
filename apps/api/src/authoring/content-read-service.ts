import type pg from 'pg';

import type {
  AuthorContentAction,
  AuthorContentEntityType,
  AuthorContentStatus,
} from './content-workflow.js';
import { AuthorContentWorkflowNotFoundError } from './content-workflow.js';

export interface AuthorContentReadDatabase {
  connect(): Promise<{
    query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }>;
    release(): void;
  }>;
}

export interface AuthorReviewQueueItem {
  entityType: AuthorContentEntityType;
  entityId: string;
  eventId: string | null;
  challengeId: string | null;
  label: string;
  status: 'in_review';
  version: number;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  canReview: boolean;
}

export interface AuthorContentHistoryItem {
  auditId: string;
  action: AuthorContentAction;
  fromStatus: AuthorContentStatus | null;
  toStatus: AuthorContentStatus;
  resultingVersion: number;
  note: string | null;
  actorPlayerId: string;
  actorPlayerName: string;
  occurredAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AuthorContentReadService {
  listReviewQueue(input: {
    actorPlayerId: string;
    entityType?: AuthorContentEntityType;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResult<AuthorReviewQueueItem>>;
  getHistory(input: {
    entityType: AuthorContentEntityType;
    entityId: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResult<AuthorContentHistoryItem>>;
}

interface QueueRow extends pg.QueryResultRow {
  entity_type: AuthorContentEntityType;
  entity_id: string;
  event_id: string | null;
  challenge_id: string | null;
  label: string;
  version: number;
  submitted_by: string;
  submitted_by_name: string;
  submitted_at: Date;
}

interface HistoryRow extends pg.QueryResultRow {
  audit_id: string;
  action: AuthorContentAction;
  from_status: AuthorContentStatus | null;
  to_status: AuthorContentStatus;
  resulting_version: number;
  note: string | null;
  actor_player_id: string;
  actor_player_name: string;
  occurred_at: Date;
}

interface CountRow extends pg.QueryResultRow {
  total_items: number;
}

const entityTables: Record<AuthorContentEntityType, string> = {
  event: 'public.events',
  challenge: 'public.event_challenges',
  question: 'public.challenge_questions',
  card: 'public.card_definitions',
  campaign: 'public.campaigns',
};

const reviewQueueCte = `with queue as (
  select 'event'::text entity_type, id::text entity_id,
         null::uuid event_id, null::uuid challenge_id, title label,
         version, submitted_by_player_id submitted_by, submitted_at
  from public.events where authoring_status = 'in_review'
  union all
  select 'challenge', challenge.id::text, challenge.event_id, null::uuid,
         challenge.format || ' challenge',
         challenge.version, challenge.submitted_by_player_id, challenge.submitted_at
  from public.event_challenges challenge
  join public.events event on event.id = challenge.event_id
  where challenge.status = 'in_review'
    and event.authoring_status <> 'in_review'
  union all
  select 'question', question.id::text, challenge.event_id, question.challenge_id,
         challenge.format || ' question',
         question.version, question.submitted_by_player_id, question.submitted_at
  from public.challenge_questions question
  join public.event_challenges challenge on challenge.id = question.challenge_id
  join public.events event on event.id = challenge.event_id
  where question.status = 'in_review'
    and event.authoring_status <> 'in_review'
  union all
  select 'card', id::text, null::uuid, null::uuid, name,
         version, submitted_by_player_id, submitted_at
  from public.card_definitions where authoring_status = 'in_review'
  union all
  select 'campaign', id::text, null::uuid, null::uuid, title, version,
         submitted_by_player_id, submitted_at
  from public.campaigns where status = 'in_review'
)`;

export function createAuthorContentReadService(
  database: AuthorContentReadDatabase,
): AuthorContentReadService {
  return {
    async listReviewQueue(input) {
      validatePagination(input.page, input.pageSize);
      const client = await database.connect();
      try {
        const offset = (input.page - 1) * input.pageSize;
        const count = await client.query<CountRow>(
          `${reviewQueueCte}
           select count(*)::int total_items from queue
           where $1::text is null or queue.entity_type = $1`,
          [input.entityType ?? null],
        );
        const result = await client.query<QueueRow>(
          `${reviewQueueCte}
           select queue.entity_type, queue.entity_id,
                  queue.event_id::text, queue.challenge_id::text,
                  queue.label, queue.version,
                  queue.submitted_by::text,
                  case
                    when player.lifecycle_status = 'deleted' then 'Deleted author'
                    else coalesce(player.player_name, 'Unnamed author')
                  end submitted_by_name,
                  queue.submitted_at
           from queue
           join public.players player on player.id = queue.submitted_by
           where $1::text is null or queue.entity_type = $1
           order by queue.submitted_at, queue.entity_type, queue.entity_id
           limit $2 offset $3`,
          [input.entityType ?? null, input.pageSize, offset],
        );
        const totalItems = count.rows[0]?.total_items ?? 0;
        return {
          items: result.rows.map((row) => ({
            entityType: row.entity_type,
            entityId: row.entity_id,
            eventId: row.event_id,
            challengeId: row.challenge_id,
            label: row.label,
            status: 'in_review',
            version: row.version,
            submittedBy: row.submitted_by,
            submittedByName: row.submitted_by_name,
            submittedAt: row.submitted_at.toISOString(),
            canReview: row.submitted_by !== input.actorPlayerId,
          })),
          page: input.page,
          pageSize: input.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / input.pageSize),
        };
      } finally {
        client.release();
      }
    },

    async getHistory(input) {
      validatePagination(input.page, input.pageSize);
      const client = await database.connect();
      try {
        const exists = await client.query(
          `select id from ${entityTables[input.entityType]} where id = $1::uuid`,
          [input.entityId],
        );
        if (exists.rows.length === 0) {
          throw new AuthorContentWorkflowNotFoundError(input.entityType);
        }
        const offset = (input.page - 1) * input.pageSize;
        const count = await client.query<CountRow>(
          `select count(*)::int total_items
           from public.author_content_audit
           where entity_type = $1 and entity_id = $2::uuid
             and resulting_version is not null`,
          [input.entityType, input.entityId],
        );
        const result = await client.query<HistoryRow>(
          `select audit.id::text audit_id, audit.action, audit.from_status,
                  audit.to_status, audit.resulting_version, audit.note,
                  audit.actor_player_id::text,
                  case
                    when player.lifecycle_status = 'deleted' then 'Deleted author'
                    else coalesce(player.player_name, 'Unnamed author')
                  end actor_player_name,
                  audit.occurred_at
           from public.author_content_audit audit
           join public.players player on player.id = audit.actor_player_id
           where audit.entity_type = $1 and audit.entity_id = $2::uuid
             and audit.resulting_version is not null
           order by audit.resulting_version, audit.occurred_at, audit.id
           limit $3 offset $4`,
          [input.entityType, input.entityId, input.pageSize, offset],
        );
        const totalItems = count.rows[0]?.total_items ?? 0;
        return {
          items: result.rows.map((row) => ({
            auditId: row.audit_id,
            action: row.action,
            fromStatus: row.from_status,
            toStatus: row.to_status,
            resultingVersion: row.resulting_version,
            note: row.note,
            actorPlayerId: row.actor_player_id,
            actorPlayerName: row.actor_player_name,
            occurredAt: row.occurred_at.toISOString(),
          })),
          page: input.page,
          pageSize: input.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / input.pageSize),
        };
      } finally {
        client.release();
      }
    },
  };
}

function validatePagination(page: number, pageSize: number) {
  if (!Number.isInteger(page) || page < 1)
    throw new Error('page must be a positive integer.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be between 1 and 100.');
  }
}
