import type pg from 'pg';

import {
  type AuthorContentLifecycle,
  type AuthorContentStatus,
  assertDraftVersion,
  insertAuthorContentAudit,
  transitionAuthorContent,
} from '../authoring/content-workflow.js';

export type AuthorCampaignStatus = AuthorContentStatus;

export interface AuthorCampaignEvent {
  eventId: string;
  title: string;
  authoringStatus: AuthorContentStatus;
  startsAt: string;
  endsAt: string;
}

export interface AuthorCampaignTrail {
  trailId: string;
  title: string;
  status: 'draft' | 'published' | 'retired';
}

export interface AuthorCampaign {
  campaignId: string;
  title: string;
  description: string | null;
  status: AuthorCampaignStatus;
  startsAt: string;
  endsAt: string;
  version: number;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publicationProvenance: AuthorContentLifecycle['publicationProvenance'];
  publishedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: AuthorCampaignEvent[];
  trails: AuthorCampaignTrail[];
}

export interface AuthorCampaignInput {
  actorPlayerId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  eventIds: readonly string[];
  trailIds: readonly string[];
}

export interface UpdateAuthorCampaignInput extends AuthorCampaignInput {
  campaignId: string;
  expectedVersion: number;
}

export interface AuthorCampaignTransitionInput {
  actorPlayerId: string;
  campaignId: string;
  expectedVersion: number;
  note?: string;
}

export interface AuthorCampaignService {
  listCampaigns(): Promise<AuthorCampaign[]>;
  createCampaign(input: AuthorCampaignInput): Promise<AuthorCampaign>;
  updateCampaign(input: UpdateAuthorCampaignInput): Promise<AuthorCampaign>;
  submitCampaign(input: AuthorCampaignTransitionInput): Promise<AuthorCampaign>;
  approveCampaign(
    input: AuthorCampaignTransitionInput,
  ): Promise<AuthorCampaign>;
  returnCampaign(input: AuthorCampaignTransitionInput): Promise<AuthorCampaign>;
  publishCampaign(
    input: AuthorCampaignTransitionInput,
  ): Promise<AuthorCampaign>;
  retireCampaign(input: AuthorCampaignTransitionInput): Promise<AuthorCampaign>;
}

export interface AuthorCampaignDatabase {
  connect(): Promise<AuthorCampaignTransactionClient>;
}

export interface AuthorCampaignTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

interface CampaignRow extends pg.QueryResultRow {
  campaign_id: string;
  title: string;
  description: string | null;
  status: AuthorCampaignStatus;
  starts_at: Date;
  ends_at: Date;
  version: number;
  submitted_by_player_id: string | null;
  submitted_at: Date | null;
  reviewed_by_player_id: string | null;
  reviewed_at: Date | null;
  publication_provenance: AuthorContentLifecycle['publicationProvenance'];
  published_at: Date | null;
  retired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CampaignEventRow extends pg.QueryResultRow {
  campaign_id: string;
  event_id: string;
  title: string;
  authoring_status: AuthorContentStatus;
  starts_at: Date;
  ends_at: Date;
}

interface CampaignTrailRow extends pg.QueryResultRow {
  campaign_id: string;
  trail_id: string;
  title: string;
  status: AuthorCampaignTrail['status'];
}

interface CampaignLockRow extends pg.QueryResultRow {
  status: AuthorCampaignStatus;
  version: number;
}

interface ReferenceCountRow extends pg.QueryResultRow {
  reference_count: number;
}

export class AuthorCampaignNotFoundError extends Error {
  constructor() {
    super('The requested campaign was not found.');
    this.name = 'AuthorCampaignNotFoundError';
  }
}

export class InvalidAuthorCampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorCampaignError';
  }
}

export function createAuthorCampaignService(
  database: AuthorCampaignDatabase,
): AuthorCampaignService {
  return {
    async listCampaigns() {
      const client = await database.connect();
      try {
        return await loadCampaigns(client);
      } finally {
        client.release();
      }
    },

    async createCampaign(input) {
      const validated = validateCampaignInput(input);
      return withTransaction(database, async (client) => {
        await assertReferencesExist(
          client,
          validated.eventIds,
          validated.trailIds,
        );
        const result = await client.query<{ campaign_id: string }>(
          `insert into public.campaigns (
             title, description, starts_at, ends_at
           ) values ($1, $2, $3::timestamptz, $4::timestamptz)
           returning id::text as campaign_id`,
          [
            validated.title,
            validated.description,
            validated.startsAt,
            validated.endsAt,
          ],
        );
        const campaignId = result.rows[0]?.campaign_id;
        if (!campaignId) {
          throw new Error(
            'Campaign creation did not return the created campaign.',
          );
        }

        await replaceMemberships(
          client,
          campaignId,
          validated.eventIds,
          validated.trailIds,
        );
        await insertAuthorContentAudit(client, {
          actorPlayerId: validated.actorPlayerId,
          entityType: 'campaign',
          entityId: campaignId,
          action: 'create',
          fromStatus: null,
          toStatus: 'draft',
          resultingVersion: 0,
        });
        return loadCampaign(client, campaignId);
      });
    },

    async updateCampaign(input) {
      const validated = validateCampaignInput(input);
      return withTransaction(database, async (client) => {
        const locked = await lockCampaign(client, validated.campaignId);
        assertDraftVersion(locked, validated.expectedVersion);
        await assertReferencesExist(
          client,
          validated.eventIds,
          validated.trailIds,
        );
        const result = await client.query(
          `update public.campaigns
           set title = $2,
               description = $3,
               starts_at = $4::timestamptz,
               ends_at = $5::timestamptz,
               version = version + 1,
               updated_at = now()
           where id = $1::uuid and version = $6`,
          [
            validated.campaignId,
            validated.title,
            validated.description,
            validated.startsAt,
            validated.endsAt,
            validated.expectedVersion,
          ],
        );
        if (result.rowCount !== 1) throw new AuthorCampaignNotFoundError();

        await replaceMemberships(
          client,
          validated.campaignId,
          validated.eventIds,
          validated.trailIds,
        );
        await insertAuthorContentAudit(client, {
          actorPlayerId: validated.actorPlayerId,
          entityType: 'campaign',
          entityId: validated.campaignId,
          action: 'edit',
          fromStatus: 'draft',
          toStatus: 'draft',
          resultingVersion: validated.expectedVersion + 1,
        });
        return loadCampaign(client, validated.campaignId);
      });
    },

    submitCampaign: (input) => transitionCampaign(database, input, 'submit'),
    approveCampaign: (input) => transitionCampaign(database, input, 'approve'),
    returnCampaign: (input) => transitionCampaign(database, input, 'return'),
    publishCampaign: (input) => transitionCampaign(database, input, 'publish'),
    retireCampaign: (input) => transitionCampaign(database, input, 'retire'),
  };
}

async function transitionCampaign(
  database: AuthorCampaignDatabase,
  input: AuthorCampaignTransitionInput,
  action: 'submit' | 'approve' | 'return' | 'publish' | 'retire',
): Promise<AuthorCampaign> {
  return withTransaction(database, async (client) => {
    await transitionAuthorContent(client, {
      entityType: 'campaign',
      entityId: input.campaignId,
      actorPlayerId: input.actorPlayerId,
      expectedVersion: input.expectedVersion,
      action,
      note: input.note,
    });
    return loadCampaign(client, input.campaignId);
  });
}

async function assertReferencesExist(
  client: AuthorCampaignTransactionClient,
  eventIds: readonly string[],
  trailIds: readonly string[],
): Promise<void> {
  if (eventIds.length > 0) {
    const events = await client.query<ReferenceCountRow>(
      `select count(*)::int as reference_count
       from public.events where id = any($1::uuid[])`,
      [eventIds],
    );
    if (events.rows[0]?.reference_count !== eventIds.length) {
      throw new InvalidAuthorCampaignError(
        'Every eventId must reference an existing event.',
      );
    }
  }

  if (trailIds.length > 0) {
    const trails = await client.query<ReferenceCountRow>(
      `select count(*)::int as reference_count
       from public.trails where id = any($1::uuid[])`,
      [trailIds],
    );
    if (trails.rows[0]?.reference_count !== trailIds.length) {
      throw new InvalidAuthorCampaignError(
        'Every trailId must reference an existing trail.',
      );
    }
  }
}

async function replaceMemberships(
  client: AuthorCampaignTransactionClient,
  campaignId: string,
  eventIds: readonly string[],
  trailIds: readonly string[],
): Promise<void> {
  await client.query(
    `delete from public.campaign_events where campaign_id = $1::uuid`,
    [campaignId],
  );
  await client.query(
    `delete from public.campaign_trails where campaign_id = $1::uuid`,
    [campaignId],
  );

  if (eventIds.length > 0) {
    await client.query(
      `insert into public.campaign_events (campaign_id, event_id)
       select $1::uuid, event_id
       from unnest($2::uuid[]) as input(event_id)`,
      [campaignId, eventIds],
    );
  }
  if (trailIds.length > 0) {
    await client.query(
      `insert into public.campaign_trails (campaign_id, trail_id)
       select $1::uuid, trail_id
       from unnest($2::uuid[]) as input(trail_id)`,
      [campaignId, trailIds],
    );
  }
}

async function lockCampaign(
  client: AuthorCampaignTransactionClient,
  campaignId: string,
): Promise<CampaignLockRow> {
  const result = await client.query<CampaignLockRow>(
    `select status, version
     from public.campaigns where id = $1::uuid for update`,
    [campaignId],
  );
  const row = result.rows[0];
  if (!row) throw new AuthorCampaignNotFoundError();
  return row;
}

async function loadCampaign(
  client: AuthorCampaignTransactionClient,
  campaignId: string,
): Promise<AuthorCampaign> {
  const campaigns = await loadCampaigns(client, campaignId);
  const campaign = campaigns[0];
  if (!campaign) throw new AuthorCampaignNotFoundError();
  return campaign;
}

async function loadCampaigns(
  client: AuthorCampaignTransactionClient,
  campaignId?: string,
): Promise<AuthorCampaign[]> {
  const campaigns = await client.query<CampaignRow>(
    `select id::text as campaign_id, title, description, status,
            starts_at, ends_at, version,
            submitted_by_player_id::text, submitted_at,
            reviewed_by_player_id::text, reviewed_at,
            publication_provenance, published_at, retired_at,
            created_at, updated_at
     from public.campaigns
     where $1::uuid is null or id = $1::uuid
     order by created_at desc, id`,
    [campaignId ?? null],
  );
  if (campaigns.rows.length === 0) return [];

  const campaignIds = campaigns.rows.map((row) => row.campaign_id);
  const events = await client.query<CampaignEventRow>(
    `select membership.campaign_id::text, event.id::text as event_id,
              event.title, event.authoring_status,
              event.starts_at, event.ends_at
       from public.campaign_events membership
       join public.events event on event.id = membership.event_id
       where membership.campaign_id = any($1::uuid[])
       order by membership.campaign_id, event.starts_at, event.id`,
    [campaignIds],
  );
  const trails = await client.query<CampaignTrailRow>(
    `select membership.campaign_id::text, trail.id::text as trail_id,
              trail.title, trail.status
       from public.campaign_trails membership
       join public.trails trail on trail.id = membership.trail_id
       where membership.campaign_id = any($1::uuid[])
       order by membership.campaign_id, trail.title, trail.id`,
    [campaignIds],
  );

  const eventsByCampaign = new Map<string, AuthorCampaignEvent[]>();
  for (const row of events.rows) {
    const members = eventsByCampaign.get(row.campaign_id) ?? [];
    members.push({
      eventId: row.event_id,
      title: row.title,
      authoringStatus: row.authoring_status,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
    });
    eventsByCampaign.set(row.campaign_id, members);
  }

  const trailsByCampaign = new Map<string, AuthorCampaignTrail[]>();
  for (const row of trails.rows) {
    const members = trailsByCampaign.get(row.campaign_id) ?? [];
    members.push({
      trailId: row.trail_id,
      title: row.title,
      status: row.status,
    });
    trailsByCampaign.set(row.campaign_id, members);
  }

  return campaigns.rows.map((row) => ({
    campaignId: row.campaign_id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    version: row.version,
    submittedBy: row.submitted_by_player_id,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by_player_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    publicationProvenance: row.publication_provenance,
    publishedAt: row.published_at?.toISOString() ?? null,
    retiredAt: row.retired_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    events: eventsByCampaign.get(row.campaign_id) ?? [],
    trails: trailsByCampaign.get(row.campaign_id) ?? [],
  }));
}

function validateCampaignInput<T extends AuthorCampaignInput>(
  input: T,
): T & {
  title: string;
  description: string | null;
  eventIds: string[];
  trailIds: string[];
} {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new InvalidAuthorCampaignError('Campaign title must not be blank.');
  }

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    description = input.description.trim();
    if (description.length === 0) {
      throw new InvalidAuthorCampaignError(
        'Campaign description must not be blank when provided.',
      );
    }
  }

  const startsAt = parseCampaignTimestamp(input.startsAt, 'start');
  const endsAt = parseCampaignTimestamp(input.endsAt, 'end');
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidAuthorCampaignError(
      'Campaign end time must be after its start time.',
    );
  }

  const eventIds = normalizeIds(input.eventIds, 'event');
  const trailIds = normalizeIds(input.trailIds, 'trail');
  return {
    ...input,
    title,
    description,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    eventIds,
    trailIds,
  };
}

function parseCampaignTimestamp(value: string, field: 'start' | 'end'): Date {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  const invalid = () =>
    new InvalidAuthorCampaignError(`Campaign ${field} time is invalid.`);
  if (!match) throw invalid();

  const year = Number(match.groups?.year);
  const month = Number(match.groups?.month);
  const day = Number(match.groups?.day);
  const hour = Number(match.groups?.hour);
  const minute = Number(match.groups?.minute);
  const second = Number(match.groups?.second);
  const offsetHour = Number(match.groups?.offsetHour ?? 0);
  const offsetMinute = Number(match.groups?.offsetMinute ?? 0);
  const daysInMonth =
    month === 2
      ? isLeapYear(year)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw invalid();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw invalid();
  return parsed;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function normalizeIds(
  ids: readonly string[],
  kind: 'event' | 'trail',
): string[] {
  const normalized = ids.map((id) => id.toLowerCase());
  if (normalized.some((id) => !UUID_PATTERN.test(id))) {
    throw new InvalidAuthorCampaignError(
      `Every ${kind}Id must be a valid UUID.`,
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    const article = kind === 'event' ? 'An' : 'A';
    throw new InvalidAuthorCampaignError(
      `${article} ${kind} can appear only once within a campaign.`,
    );
  }
  return normalized;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RFC3339_TIMESTAMP_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/;

async function withTransaction<T>(
  database: AuthorCampaignDatabase,
  operation: (client: AuthorCampaignTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original operation failure.
    }
    throw error;
  } finally {
    client.release();
  }
}
