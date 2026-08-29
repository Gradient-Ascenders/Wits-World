import type pg from 'pg';

export type AuthorTrailStatus = 'draft' | 'published' | 'retired';
export type AuthorTrailEventStatus = 'draft' | 'published' | 'retired';

export interface AuthorTrailStep {
  position: number;
  eventId: string;
  title: string;
  eventStatus: AuthorTrailEventStatus;
}

export interface AuthorTrail {
  trailId: string;
  title: string;
  description: string | null;
  status: AuthorTrailStatus;
  publishedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AuthorTrailStep[];
}

export interface AuthorTrailInput {
  actorPlayerId: string;
  title: string;
  description?: string | null;
  eventIds: readonly string[];
}

export interface UpdateAuthorTrailInput extends AuthorTrailInput {
  trailId: string;
}

export interface AuthorTrailService {
  listTrails(): Promise<AuthorTrail[]>;
  createTrail(input: AuthorTrailInput): Promise<AuthorTrail>;
  updateTrail(input: UpdateAuthorTrailInput): Promise<AuthorTrail>;
  publishTrail(actorPlayerId: string, trailId: string): Promise<AuthorTrail>;
  retireTrail(actorPlayerId: string, trailId: string): Promise<AuthorTrail>;
}

export interface AuthorTrailDatabase {
  connect(): Promise<AuthorTrailTransactionClient>;
}

export interface AuthorTrailTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
    rowCount?: number | null;
  }>;
  release(): void;
}

interface AuthorTrailRow extends pg.QueryResultRow {
  trail_id: string;
  title: string;
  description: string | null;
  status: AuthorTrailStatus;
  published_at: Date | null;
  retired_at: Date | null;
  created_at: Date;
  updated_at: Date;
  position: number | null;
  event_id: string | null;
  event_title: string | null;
  event_is_published: boolean | null;
  event_retired_at: Date | null;
}

interface AuthorTrailLockRow extends pg.QueryResultRow {
  status: AuthorTrailStatus;
}

interface EventReferenceCountRow extends pg.QueryResultRow {
  event_count: number;
}

interface TrailPublicationReadinessRow extends pg.QueryResultRow {
  step_count: number;
  unavailable_event_count: number;
}

export class AuthorTrailNotFoundError extends Error {
  constructor() {
    super('The requested trail was not found.');
    this.name = 'AuthorTrailNotFoundError';
  }
}

export class InvalidAuthorTrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorTrailError';
  }
}

export class AuthorTrailStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorTrailStateConflictError';
  }
}

export class AuthorTrailNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorTrailNotReadyError';
  }
}

export function createAuthorTrailService(
  database: AuthorTrailDatabase,
): AuthorTrailService {
  return {
    async listTrails() {
      const client = await database.connect();

      try {
        return await loadTrails(client);
      } finally {
        client.release();
      }
    },

    async createTrail(input) {
      const validated = validateAuthorTrailInput(input);

      return withTransaction(database, async (client) => {
        await assertEventsExist(client, validated.eventIds);

        const result = await client.query<{ trail_id: string }>(
          `
            insert into public.trails (
              title,
              description
            )
            values ($1, $2)
            returning id::text as trail_id
          `,
          [validated.title, validated.description],
        );
        const trailId = result.rows[0]?.trail_id;

        if (!trailId) {
          throw new Error('Trail creation did not return the created trail.');
        }

        await replaceTrailEvents(client, trailId, validated.eventIds);
        await insertAudit(client, validated.actorPlayerId, trailId, 'create');

        return loadTrail(client, trailId);
      });
    },

    async updateTrail(input) {
      const validated = validateAuthorTrailInput(input);

      return withTransaction(database, async (client) => {
        const locked = await lockTrail(client, validated.trailId);

        if (locked.status !== 'draft') {
          throw new AuthorTrailStateConflictError(
            'Published or retired trails cannot be edited.',
          );
        }

        await assertEventsExist(client, validated.eventIds);
        await client.query(
          `
            update public.trails
            set
              title = $2,
              description = $3,
              updated_at = now()
            where id = $1::uuid
          `,
          [validated.trailId, validated.title, validated.description],
        );
        await replaceTrailEvents(client, validated.trailId, validated.eventIds);
        await insertAudit(
          client,
          validated.actorPlayerId,
          validated.trailId,
          'edit',
        );

        return loadTrail(client, validated.trailId);
      });
    },

    async publishTrail(actorPlayerId, trailId) {
      return withTransaction(database, async (client) => {
        const locked = await lockTrail(client, trailId);

        if (locked.status === 'published') {
          throw new AuthorTrailStateConflictError(
            'The trail is already published.',
          );
        }

        if (locked.status === 'retired') {
          throw new AuthorTrailStateConflictError(
            'Retired trails cannot be republished.',
          );
        }

        const readiness = await client.query<TrailPublicationReadinessRow>(
          `
            select
              count(*)::int as step_count,
              count(*) filter (
                where event.is_published = false
                   or event.retired_at is not null
              )::int as unavailable_event_count
            from public.trail_events step
            join public.events event
              on event.id = step.event_id
            where step.trail_id = $1::uuid
          `,
          [trailId],
        );
        const state = readiness.rows[0];

        if (!state || state.step_count < 2) {
          throw new AuthorTrailNotReadyError(
            'A trail requires at least two events before publication.',
          );
        }

        if (state.unavailable_event_count > 0) {
          throw new AuthorTrailNotReadyError(
            'Every trail event must be published and not retired before publication.',
          );
        }

        await client.query(
          `
            update public.trails
            set
              status = 'published',
              published_at = now(),
              updated_at = now()
            where id = $1::uuid
          `,
          [trailId],
        );
        await insertAudit(client, actorPlayerId, trailId, 'publish');

        return loadTrail(client, trailId);
      });
    },

    async retireTrail(actorPlayerId, trailId) {
      return withTransaction(database, async (client) => {
        const locked = await lockTrail(client, trailId);

        if (locked.status === 'retired') {
          throw new AuthorTrailStateConflictError(
            'The trail is already retired.',
          );
        }

        try {
          await client.query(
            `
              update public.trails
              set
                status = 'retired',
                retired_at = now(),
                updated_at = now()
              where id = $1::uuid
            `,
            [trailId],
          );
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '55006' &&
            'message' in error &&
            typeof error.message === 'string' &&
            error.message.includes('published campaign')
          ) {
            throw new AuthorTrailStateConflictError(
              'Retire the published campaign before retiring this trail.',
            );
          }
          throw error;
        }
        await insertAudit(client, actorPlayerId, trailId, 'retire');

        return loadTrail(client, trailId);
      });
    },
  };
}

async function assertEventsExist(
  client: AuthorTrailTransactionClient,
  eventIds: readonly string[],
): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const result = await client.query<EventReferenceCountRow>(
    `
      select count(*)::int as event_count
      from public.events
      where id = any($1::uuid[])
    `,
    [eventIds],
  );

  if (result.rows[0]?.event_count !== eventIds.length) {
    throw new InvalidAuthorTrailError(
      'Every eventId must reference an existing event.',
    );
  }
}

async function replaceTrailEvents(
  client: AuthorTrailTransactionClient,
  trailId: string,
  eventIds: readonly string[],
): Promise<void> {
  await client.query(
    `
      delete from public.trail_events
      where trail_id = $1::uuid
    `,
    [trailId],
  );

  if (eventIds.length === 0) {
    return;
  }

  await client.query(
    `
      insert into public.trail_events (
        trail_id,
        event_id,
        position
      )
      select
        $1::uuid,
        input.event_id,
        input.position::smallint
      from unnest($2::uuid[]) with ordinality
        as input(event_id, position)
    `,
    [trailId, eventIds],
  );
}

async function lockTrail(
  client: AuthorTrailTransactionClient,
  trailId: string,
): Promise<AuthorTrailLockRow> {
  const result = await client.query<AuthorTrailLockRow>(
    `
      select status
      from public.trails
      where id = $1::uuid
      for update
    `,
    [trailId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new AuthorTrailNotFoundError();
  }

  return row;
}

async function loadTrail(
  client: AuthorTrailTransactionClient,
  trailId: string,
): Promise<AuthorTrail> {
  const trails = await loadTrails(client, trailId);
  const trail = trails[0];

  if (!trail) {
    throw new AuthorTrailNotFoundError();
  }

  return trail;
}

async function loadTrails(
  client: AuthorTrailTransactionClient,
  trailId?: string,
): Promise<AuthorTrail[]> {
  const result = await client.query<AuthorTrailRow>(
    `
      select
        trail.id::text as trail_id,
        trail.title,
        trail.description,
        trail.status,
        trail.published_at,
        trail.retired_at,
        trail.created_at,
        trail.updated_at,
        step.position,
        event.id::text as event_id,
        event.title as event_title,
        event.is_published as event_is_published,
        event.retired_at as event_retired_at
      from public.trails trail
      left join public.trail_events step
        on step.trail_id = trail.id
      left join public.events event
        on event.id = step.event_id
      where ($1::uuid is null or trail.id = $1::uuid)
      order by trail.created_at desc, trail.id, step.position
    `,
    [trailId ?? null],
  );

  return mapAuthorTrails(result.rows);
}

function mapAuthorTrails(rows: AuthorTrailRow[]): AuthorTrail[] {
  const trails = new Map<string, AuthorTrail>();

  for (const row of rows) {
    let trail = trails.get(row.trail_id);

    if (!trail) {
      trail = {
        trailId: row.trail_id,
        title: row.title,
        description: row.description,
        status: row.status,
        publishedAt: row.published_at?.toISOString() ?? null,
        retiredAt: row.retired_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        steps: [],
      };
      trails.set(row.trail_id, trail);
    }

    if (
      row.position !== null &&
      row.event_id !== null &&
      row.event_title !== null &&
      row.event_is_published !== null
    ) {
      trail.steps.push({
        position: row.position,
        eventId: row.event_id,
        title: row.event_title,
        eventStatus:
          row.event_retired_at !== null
            ? 'retired'
            : row.event_is_published
              ? 'published'
              : 'draft',
      });
    }
  }

  return [...trails.values()];
}

async function insertAudit(
  client: AuthorTrailTransactionClient,
  actorPlayerId: string,
  trailId: string,
  action: 'create' | 'edit' | 'publish' | 'retire',
): Promise<void> {
  await client.query(
    `
      insert into public.author_content_audit (
        actor_player_id,
        entity_type,
        entity_id,
        action
      )
      values ($1::uuid, 'trail', $2::uuid, $3)
    `,
    [actorPlayerId, trailId, action],
  );
}

function validateAuthorTrailInput<T extends AuthorTrailInput>(
  input: T,
): T & { title: string; description: string | null; eventIds: string[] } {
  const title = input.title.trim();

  if (title.length === 0) {
    throw new InvalidAuthorTrailError('Trail title must not be blank.');
  }

  let description: string | null = null;

  if (input.description !== undefined && input.description !== null) {
    description = input.description.trim();

    if (description.length === 0) {
      throw new InvalidAuthorTrailError(
        'Trail description must not be blank when provided.',
      );
    }
  }

  if (input.eventIds.length > 50) {
    throw new InvalidAuthorTrailError(
      'A trail cannot contain more than 50 events.',
    );
  }

  const eventIds = input.eventIds.map((eventId) => eventId.toLowerCase());

  if (new Set(eventIds).size !== eventIds.length) {
    throw new InvalidAuthorTrailError(
      'An event can appear only once within a trail.',
    );
  }

  return {
    ...input,
    title,
    description,
    eventIds,
  };
}

async function withTransaction<T>(
  database: AuthorTrailDatabase,
  operation: (client: AuthorTrailTransactionClient) => Promise<T>,
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
