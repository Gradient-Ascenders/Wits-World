import type pg from 'pg';

import { starterPackageDefinitions } from '../cards/starter-packages.js';

export const AUTHOR_CONTENT_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'retired',
] as const;

export type AuthorContentStatus = (typeof AUTHOR_CONTENT_STATUSES)[number];
export type AuthorContentEntityType =
  'event' | 'challenge' | 'question' | 'card' | 'campaign';
export type PublicationProvenance = 'legacy' | 'controlled_seed' | 'reviewed';
export type AuthorContentAction =
  'create' | 'edit' | 'submit' | 'approve' | 'return' | 'publish' | 'retire';

export interface AuthorContentLifecycle {
  status: AuthorContentStatus;
  version: number;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publicationProvenance: PublicationProvenance | null;
}

export interface AuthorContentClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface TransitionAuthorContentInput {
  entityType: AuthorContentEntityType;
  entityId: string;
  actorPlayerId: string;
  action: Exclude<AuthorContentAction, 'create' | 'edit'>;
  expectedVersion: number;
  note?: string;
}

interface LifecycleRow extends pg.QueryResultRow {
  status: AuthorContentStatus;
  version: number;
  submitted_by_player_id: string | null;
  submitted_at: Date | null;
  reviewed_by_player_id: string | null;
  reviewed_at: Date | null;
  publication_provenance: PublicationProvenance | null;
}

const entitySql: Record<
  AuthorContentEntityType,
  { table: string; statusColumn: string; compatibilityUpdate: string }
> = {
  event: {
    table: 'public.events',
    statusColumn: 'authoring_status',
    compatibilityUpdate: `,
      is_published = case when $3 = 'published' then true else false end,
      retired_at = case when $3 = 'retired' then now() else null end`,
  },
  challenge: {
    table: 'public.event_challenges',
    statusColumn: 'status',
    compatibilityUpdate: '',
  },
  question: {
    table: 'public.challenge_questions',
    statusColumn: 'status',
    compatibilityUpdate: '',
  },
  card: {
    table: 'public.card_definitions',
    statusColumn: 'authoring_status',
    compatibilityUpdate: `,
      is_active = case when $3 = 'published' then true else false end`,
  },
  campaign: {
    table: 'public.campaigns',
    statusColumn: 'status',
    compatibilityUpdate: `,
      published_at = case
        when $3 = 'published' then now()
        else published_at
      end,
      retired_at = case
        when $3 = 'retired' then now()
        else null
      end`,
  },
};

const transitionTargets: Record<
  TransitionAuthorContentInput['action'],
  { from: AuthorContentStatus[]; to: AuthorContentStatus }
> = {
  submit: { from: ['draft'], to: 'in_review' },
  approve: { from: ['in_review'], to: 'approved' },
  return: { from: ['in_review', 'approved'], to: 'draft' },
  publish: { from: ['approved'], to: 'published' },
  retire: { from: ['published'], to: 'retired' },
};

const protectedStarterDefinitionIds = new Set<string>(
  Object.values(starterPackageDefinitions).flatMap((definition) => [
    ...definition.creatureDefinitionIds,
    ...definition.powerCardDefinitionIds,
  ]),
);

export class AuthorContentWorkflowNotFoundError extends Error {
  constructor(readonly entityType: AuthorContentEntityType) {
    super(`The requested ${entityType} was not found.`);
    this.name = 'AuthorContentWorkflowNotFoundError';
  }
}

export class AuthorContentStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorContentStateConflictError';
  }
}

export class StaleAuthorContentVersionError extends Error {
  constructor() {
    super(
      'The content changed after this representation was loaded. Refresh and try again.',
    );
    this.name = 'StaleAuthorContentVersionError';
  }
}

export class SelfReviewForbiddenError extends Error {
  constructor() {
    super('A different active Author must review the latest submission.');
    this.name = 'SelfReviewForbiddenError';
  }
}

export class AuthorContentNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorContentNotReadyError';
  }
}

export class InvalidAuthorContentNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorContentNoteError';
  }
}

export function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new InvalidAuthorContentNoteError(
      'expectedVersion must be a non-negative integer.',
    );
  }
}

export function normalizeAuthorContentNote(
  note: string | undefined,
  required: boolean,
): string | null {
  if (note === undefined) {
    if (required) {
      throw new InvalidAuthorContentNoteError('A return reason is required.');
    }
    return null;
  }

  const normalized = note.trim();
  if (normalized.length === 0) {
    throw new InvalidAuthorContentNoteError(
      required ? 'A return reason is required.' : 'A note must not be blank.',
    );
  }
  if (normalized.length > 1000) {
    throw new InvalidAuthorContentNoteError(
      required
        ? 'The return reason must not exceed 1,000 characters.'
        : 'The note must not exceed 1,000 characters.',
    );
  }
  return normalized;
}

export function assertDraftVersion(
  row: { status: AuthorContentStatus; version: number },
  expectedVersion: number,
): void {
  validateExpectedVersion(expectedVersion);
  if (row.version !== expectedVersion)
    throw new StaleAuthorContentVersionError();
  if (row.status !== 'draft') {
    throw new AuthorContentStateConflictError(
      'Only draft content can be edited.',
    );
  }
}

export async function transitionAuthorContent(
  client: AuthorContentClient,
  input: TransitionAuthorContentInput,
): Promise<AuthorContentLifecycle> {
  validateExpectedVersion(input.expectedVersion);
  const note = normalizeAuthorContentNote(
    input.note,
    input.action === 'return',
  );
  const spec = entitySql[input.entityType];
  const target = transitionTargets[input.action];
  await lockAuthorContentAncestors(client, input);
  const locked = await client.query<LifecycleRow>(
    `select
       ${spec.statusColumn} as status,
       version,
       submitted_by_player_id::text,
       submitted_at,
       reviewed_by_player_id::text,
       reviewed_at,
       publication_provenance
     from ${spec.table}
     where id = $1::uuid
     for update`,
    [input.entityId],
  );
  const current = locked.rows[0];
  if (!current) throw new AuthorContentWorkflowNotFoundError(input.entityType);
  if (current.version !== input.expectedVersion) {
    throw new StaleAuthorContentVersionError();
  }
  if (!target.from.includes(current.status)) {
    throw new AuthorContentStateConflictError(
      `Cannot ${input.action} ${input.entityType} content while it is ${current.status}.`,
    );
  }
  if (
    (input.action === 'approve' || input.action === 'return') &&
    current.submitted_by_player_id === input.actorPlayerId
  ) {
    throw new SelfReviewForbiddenError();
  }

  await assertContainerState(client, input);

  if (input.action === 'approve' || input.action === 'publish') {
    await assertContentReady(client, input.entityType, input.entityId);
  }

  const metadata = metadataForTransition(current, input, target.to);
  const updated = await client.query<LifecycleRow>(
    `update ${spec.table}
     set ${spec.statusColumn} = $3,
         version = version + 1,
         submitted_by_player_id = $4::uuid,
         submitted_at = $5::timestamptz,
         reviewed_by_player_id = $6::uuid,
         reviewed_at = $7::timestamptz,
         publication_provenance = $8,
         updated_at = now()
         ${spec.compatibilityUpdate}
     where id = $1::uuid and version = $2
     returning
       ${spec.statusColumn} as status,
       version,
       submitted_by_player_id::text,
       submitted_at,
       reviewed_by_player_id::text,
       reviewed_at,
       publication_provenance`,
    [
      input.entityId,
      input.expectedVersion,
      target.to,
      metadata.submittedBy,
      metadata.submittedAt,
      metadata.reviewedBy,
      metadata.reviewedAt,
      metadata.publicationProvenance,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new StaleAuthorContentVersionError();

  await insertAuthorContentAudit(client, {
    actorPlayerId: input.actorPlayerId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    fromStatus: current.status,
    toStatus: row.status,
    note,
    resultingVersion: row.version,
  });
  return mapLifecycle(row);
}

async function lockAuthorContentAncestors(
  client: AuthorContentClient,
  input: TransitionAuthorContentInput,
) {
  if (
    input.entityType === 'campaign' &&
    (input.action === 'approve' || input.action === 'publish')
  ) {
    await client.query(
      `select event.id
       from public.events event
       join public.campaign_events membership on membership.event_id = event.id
       where membership.campaign_id = $1::uuid
       order by event.id
       for update of event`,
      [input.entityId],
    );
    await client.query(
      `select trail.id
       from public.trails trail
       join public.campaign_trails membership on membership.trail_id = trail.id
       where membership.campaign_id = $1::uuid
       order by trail.id
       for update of trail`,
      [input.entityId],
    );
    return;
  }
  if (input.entityType === 'card' && input.action === 'retire') {
    const target = await client.query<pg.QueryResultRow & { rarity: string }>(
      `select rarity from public.card_definitions where id = $1::uuid`,
      [input.entityId],
    );
    if (target.rows[0]?.rarity === 'common') {
      await client.query(
        `select id from public.events
         where authoring_status = 'published'
         order by id for share`,
      );
      await client.query(
        `select id from public.card_definitions
         where rarity = 'common' and authoring_status = 'published' and is_active
         order by id for update`,
      );
    }
    return;
  }
  if (input.entityType === 'challenge') {
    await client.query(
      input.action === 'publish'
        ? `select event.id
           from public.events event
           join public.event_challenges challenge on challenge.event_id = event.id
           where challenge.id = $1::uuid
           for update of event`
        : `select event.id
           from public.events event
           join public.event_challenges challenge on challenge.event_id = event.id
           where challenge.id = $1::uuid
           for share of event`,
      [input.entityId],
    );
    return;
  }
  if (input.entityType === 'question') {
    await client.query(
      `select event.id
       from public.events event
       join public.event_challenges challenge on challenge.event_id = event.id
       join public.challenge_questions question on question.challenge_id = challenge.id
       where question.id = $1::uuid
       for share of event`,
      [input.entityId],
    );
    await client.query(
      `select challenge.id
       from public.event_challenges challenge
       join public.challenge_questions question on question.challenge_id = challenge.id
       where question.id = $1::uuid
       for share of challenge`,
      [input.entityId],
    );
    if (input.action === 'retire') {
      await client.query(
        `select sibling.id
         from public.challenge_questions sibling
         where sibling.challenge_id = (
           select question.challenge_id
           from public.challenge_questions question
           where question.id = $1::uuid
         )
           and sibling.status = 'published'
         order by sibling.id
         for update`,
        [input.entityId],
      );
    }
  }
}

export async function insertAuthorContentAudit(
  client: AuthorContentClient,
  input: {
    actorPlayerId: string;
    entityType: AuthorContentEntityType;
    entityId: string;
    action: AuthorContentAction;
    fromStatus: AuthorContentStatus | null;
    toStatus: AuthorContentStatus;
    note?: string | null;
    resultingVersion: number;
  },
): Promise<void> {
  await client.query(
    `insert into public.author_content_audit (
       actor_player_id, entity_type, entity_id, action,
       from_status, to_status, note, resulting_version
     ) values ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8)`,
    [
      input.actorPlayerId,
      input.entityType,
      input.entityId,
      input.action,
      input.fromStatus,
      input.toStatus,
      input.note ?? null,
      input.resultingVersion,
    ],
  );
}

function metadataForTransition(
  current: LifecycleRow,
  input: TransitionAuthorContentInput,
  targetStatus: AuthorContentStatus,
) {
  const now = new Date().toISOString();
  if (input.action === 'submit') {
    return {
      submittedBy: input.actorPlayerId,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      publicationProvenance: null,
    };
  }
  if (input.action === 'approve') {
    return {
      submittedBy: current.submitted_by_player_id,
      submittedAt: current.submitted_at?.toISOString() ?? null,
      reviewedBy: input.actorPlayerId,
      reviewedAt: now,
      publicationProvenance: null,
    };
  }
  if (input.action === 'return') {
    return {
      submittedBy: null,
      submittedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      publicationProvenance: null,
    };
  }
  return {
    submittedBy: current.submitted_by_player_id,
    submittedAt: current.submitted_at?.toISOString() ?? null,
    reviewedBy: current.reviewed_by_player_id,
    reviewedAt: current.reviewed_at?.toISOString() ?? null,
    publicationProvenance:
      targetStatus === 'published'
        ? ('reviewed' as const)
        : current.publication_provenance,
  };
}

async function assertContentReady(
  client: AuthorContentClient,
  entityType: AuthorContentEntityType,
  entityId: string,
): Promise<void> {
  if (entityType === 'campaign') return assertCampaignReady(client, entityId);
  if (entityType === 'question') return assertQuestionReady(client, entityId);
  if (entityType === 'challenge') return assertChallengeReady(client, entityId);
  if (entityType === 'card') return assertCardReady(client, entityId);
  return assertEventReady(client, entityId);
}

async function assertQuestionReady(client: AuthorContentClient, id: string) {
  await client.query(
    `select id from public.challenge_choices where question_id = $1::uuid order by id for share`,
    [id],
  );
  await client.query(
    `select question_id from private.challenge_answer_keys where question_id = $1::uuid for share`,
    [id],
  );
  await client.query(
    `select id from public.challenge_ordering_items where question_id = $1::uuid order by id for share`,
    [id],
  );
  await client.query(
    `select question_id from private.challenge_ordering_answer_keys where question_id = $1::uuid order by item_id for share`,
    [id],
  );
  const result = await client.query<
    pg.QueryResultRow & {
      format: string;
      explanation: string | null;
      choice_count: number;
      answer_count: number;
      ordering_item_count: number;
      ordering_answer_count: number;
    }
  >(
    `select challenge.format, question.explanation,
       (select count(*)::int from public.challenge_choices where question_id = question.id) as choice_count,
       (select count(*)::int from private.challenge_answer_keys where question_id = question.id) as answer_count,
       (select count(*)::int from public.challenge_ordering_items where question_id = question.id) as ordering_item_count,
       (select count(*)::int from private.challenge_ordering_answer_keys where question_id = question.id) as ordering_answer_count
     from public.challenge_questions question
     join public.event_challenges challenge on challenge.id = question.challenge_id
     where question.id = $1::uuid
     for share of challenge`,
    [id],
  );
  const row = result.rows[0];
  const complete =
    row &&
    row.explanation !== null &&
    row.explanation.trim() !== '' &&
    ((row.format === 'multiple_choice' &&
      row.choice_count === 4 &&
      row.answer_count === 1 &&
      row.ordering_item_count === 0 &&
      row.ordering_answer_count === 0) ||
      (row.format === 'ordering' &&
        row.choice_count === 0 &&
        row.answer_count === 0 &&
        row.ordering_item_count === 4 &&
        row.ordering_answer_count === 4));
  if (!complete) {
    throw new AuthorContentNotReadyError(
      'The question requires format-appropriate items, a complete private answer, and an explanation.',
    );
  }
}

async function assertChallengeReady(client: AuthorContentClient, id: string) {
  const result = await client.query<
    pg.QueryResultRow & {
      question_count: number;
      other_published_count: number;
    }
  >(
    `select
       count(question.id)::int as question_count,
       (select count(*)::int from public.event_challenges sibling
        where sibling.event_id = challenge.event_id and sibling.status = 'published' and sibling.id <> challenge.id) as other_published_count
     from public.event_challenges challenge
     left join public.challenge_questions question
       on question.challenge_id = challenge.id and question.status = 'published'
     where challenge.id = $1::uuid
     group by challenge.id`,
    [id],
  );
  const row = result.rows[0];
  if (!row || row.question_count < 5) {
    throw new AuthorContentNotReadyError(
      'A challenge requires at least five complete published questions.',
    );
  }
  if (row.other_published_count > 0) {
    throw new AuthorContentNotReadyError(
      'The event already has a published challenge.',
    );
  }
  const questions = await client.query<pg.QueryResultRow & { id: string }>(
    `select id::text from public.challenge_questions
     where challenge_id = $1::uuid and status = 'published'
     order by id for share`,
    [id],
  );
  for (const question of questions.rows)
    await assertQuestionReady(client, question.id);
}

async function assertCardReady(client: AuthorContentClient, id: string) {
  await client.query(
    `select id from public.card_moves where card_definition_id = $1::uuid order by id for share`,
    [id],
  );
  await client.query(
    `select id from public.card_effects where card_definition_id = $1::uuid order by id for share`,
    [id],
  );
  const result = await client.query<
    pg.QueryResultRow & {
      category: string;
      invalid_count: number;
      item_count: number;
    }
  >(
    `select card.category,
       case when card.category = 'creature'
         then (select count(*)::int from public.card_moves move where move.card_definition_id = card.id)
         else (select count(*)::int from public.card_effects effect where effect.card_definition_id = card.id)
       end as item_count,
       case when card.category = 'creature'
         then (select count(*)::int from public.card_moves move where move.card_definition_id = card.id and move.effect_value is null)
         else (select count(*)::int from public.card_effects effect where effect.card_definition_id = card.id and effect.effect_value is null)
       end as invalid_count
     from public.card_definitions card where card.id = $1::uuid`,
    [id],
  );
  const row = result.rows[0];
  if (!row || row.item_count < 1 || row.invalid_count > 0) {
    throw new AuthorContentNotReadyError(
      'The card requires at least one complete executable move or effect.',
    );
  }
  if (row.category === 'creature' && row.item_count !== 4) {
    throw new AuthorContentNotReadyError(
      'A Creature card requires exactly four complete executable moves.',
    );
  }
}

async function assertContainerState(
  client: AuthorContentClient,
  input: TransitionAuthorContentInput,
) {
  if (input.entityType === 'event' && input.action === 'retire') {
    const campaign = await client.query(
      `select campaign.id
       from public.campaigns campaign
       join public.campaign_events membership
         on membership.campaign_id = campaign.id
       where membership.event_id = $1::uuid
         and campaign.status = 'published'
       limit 1`,
      [input.entityId],
    );
    if (campaign.rows.length > 0) {
      throw new AuthorContentStateConflictError(
        'Retire the published campaign before retiring this event.',
      );
    }
  }
  if (input.entityType === 'card' && input.action === 'retire') {
    if (protectedStarterDefinitionIds.has(input.entityId.toLowerCase())) {
      throw new AuthorContentNotReadyError(
        'A configured starter definition cannot be retired until an authoritative replacement is configured.',
      );
    }
    const target = await client.query<pg.QueryResultRow & { rarity: string }>(
      `select rarity from public.card_definitions where id = $1::uuid`,
      [input.entityId],
    );
    if (target.rows[0]?.rarity === 'common') {
      const alternatives = await client.query(
        `select id from public.card_definitions
         where rarity = 'common'
           and authoring_status = 'published'
           and is_active
           and id <> $1::uuid`,
        [input.entityId],
      );
      const publishedEvents = await client.query(
        `select id from public.events where authoring_status = 'published'`,
      );
      if (alternatives.rows.length === 0 && publishedEvents.rows.length > 0) {
        throw new AuthorContentNotReadyError(
          'A published event requires at least one active published Common reward card.',
        );
      }
    }
  }
  if (input.entityType === 'question') {
    const parent = await client.query<
      pg.QueryResultRow & { status: AuthorContentStatus }
    >(
      `select challenge.status from public.event_challenges challenge
       join public.challenge_questions question on question.challenge_id = challenge.id
       where question.id = $1::uuid for share of challenge`,
      [input.entityId],
    );
    const status = parent.rows[0]?.status;
    if (input.action !== 'retire' && status === 'retired') {
      throw new AuthorContentStateConflictError(
        'Content in a retired challenge cannot advance through review.',
      );
    }
    if (input.action === 'retire' && status === 'published') {
      const remaining = await client.query<
        pg.QueryResultRow & { published_count: number }
      >(
        `select count(*)::int published_count from public.challenge_questions
         where challenge_id = (
           select challenge_id from public.challenge_questions where id = $1::uuid
         ) and status = 'published' and id <> $1::uuid`,
        [input.entityId],
      );
      if ((remaining.rows[0]?.published_count ?? 0) < 5) {
        throw new AuthorContentNotReadyError(
          'Retiring this question would leave the published challenge with fewer than five published questions.',
        );
      }
    }
  }
  if (input.entityType === 'challenge') {
    const parent = await client.query<
      pg.QueryResultRow & { status: AuthorContentStatus }
    >(
      `select event.authoring_status status from public.events event
       join public.event_challenges challenge on challenge.event_id = event.id
       where challenge.id = $1::uuid for share of event`,
      [input.entityId],
    );
    const status = parent.rows[0]?.status;
    if (input.action !== 'retire' && status === 'retired') {
      throw new AuthorContentStateConflictError(
        'Content in a retired event cannot advance through review.',
      );
    }
    if (input.action === 'retire' && status === 'published') {
      throw new AuthorContentStateConflictError(
        'Retire the event before retiring its published challenge.',
      );
    }
  }
}

async function assertCampaignReady(
  client: AuthorContentClient,
  id: string,
): Promise<void> {
  try {
    await client.query(`select public.validate_campaign_schedule($1::uuid)`, [
      id,
    ]);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === '23503' ||
        error.code === '23514' ||
        error.code === '23P01')
    ) {
      const detail =
        'message' in error && typeof error.message === 'string'
          ? error.message
          : 'The campaign schedule or membership is not ready.';
      throw new AuthorContentNotReadyError(detail);
    }
    throw error;
  }
}

async function assertEventReady(client: AuthorContentClient, id: string) {
  const challengeRows = await client.query<pg.QueryResultRow & { id: string }>(
    `select id::text from public.event_challenges
     where event_id = $1::uuid and status = 'published'
     order by id for share`,
    [id],
  );
  if (challengeRows.rows.length !== 1) {
    throw new AuthorContentNotReadyError(
      'An event requires exactly one published challenge.',
    );
  }
  await assertChallengePublishedQuestionsReady(
    client,
    challengeRows.rows[0]!.id,
  );
  const cards = await client.query<pg.QueryResultRow & { id: string }>(
    `select id::text from public.card_definitions
     where rarity = 'common' and authoring_status = 'published' and is_active
     order by id for share`,
  );
  if (cards.rows.length < 1) {
    throw new AuthorContentNotReadyError(
      'At least one active published Common reward card is required.',
    );
  }
}

async function assertChallengePublishedQuestionsReady(
  client: AuthorContentClient,
  id: string,
) {
  const questions = await client.query<pg.QueryResultRow & { id: string }>(
    `select id::text from public.challenge_questions
     where challenge_id = $1::uuid and status = 'published'
     order by id for share`,
    [id],
  );
  if (questions.rows.length < 5) {
    throw new AuthorContentNotReadyError(
      'The published challenge requires at least five complete published questions.',
    );
  }
  for (const question of questions.rows)
    await assertQuestionReady(client, question.id);
}

export function mapLifecycle(row: LifecycleRow): AuthorContentLifecycle {
  return {
    status: row.status,
    version: row.version,
    submittedBy: row.submitted_by_player_id,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by_player_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    publicationProvenance: row.publication_provenance,
  };
}
