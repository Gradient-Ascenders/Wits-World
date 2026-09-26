import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorEventNotReadyError,
  AuthorEventNotFoundError,
  createAuthorEventService,
  InvalidAuthorEventError,
  type AuthorEventDatabase,
  type AuthorEventTransactionClient,
} from '../src/events/author-event-service.js';

const AUTHOR_ID = 'b1000000-0000-4000-8000-000000000001';
const EVENT_ID = 'b2000000-0000-4000-8000-000000000001';

describe('author event service', () => {
  it('rejects an event package without one challenge and rolls back', async () => {
    const fixture = createFixture();
    const queryEvent = successfulImplementation();
    fixture.query.mockImplementation(async (statement: string) => {
      if (statement.includes('from public.event_challenges'))
        return { rows: [] };
      return queryEvent(statement);
    });

    await expect(
      createAuthorEventService(fixture.database).transitionReviewPackage({
        action: 'submit',
        actorPlayerId: AUTHOR_ID,
        eventId: EVENT_ID,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(AuthorEventNotReadyError);
    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
    expect(executedSql(fixture.query)).not.toContain('update public.events');
  });

  it('rolls back the whole package when a question transition fails', async () => {
    const fixture = createFixture();
    const queryEvent = successfulImplementation();
    let questionsLoaded = false;
    fixture.query.mockImplementation(async (statement: string) => {
      if (questionsLoaded) throw new Error('child workflow failed');
      if (statement.includes('from public.event_challenges'))
        return {
          rows: [
            {
              id: 'b3000000-0000-4000-8000-000000000001',
              status: 'draft',
              version: 0,
            },
          ],
        };
      if (statement.includes('from public.challenge_questions')) {
        questionsLoaded = true;
        return {
          rows: Array.from({ length: 5 }, (_, index) => ({
            id: `b4000000-0000-4000-8000-00000000000${index + 1}`,
            status: 'draft',
            version: 0,
          })),
        };
      }
      return queryEvent(statement);
    });

    await expect(
      createAuthorEventService(fixture.database).transitionReviewPackage({
        action: 'submit',
        actorPlayerId: AUTHOR_ID,
        eventId: EVENT_ID,
        expectedVersion: 0,
      }),
    ).rejects.toThrow('child workflow failed');
    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });
  it('creates an unpublished event and audits the acting Author atomically', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const service = createAuthorEventService(fixture.database);

    const event = await service.createEvent({
      actorPlayerId: AUTHOR_ID,
      automaticPlacement: false,
      title: '  Great Hall Challenge  ',
      description: '  Explore East Campus.  ',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      startsAt: '2026-09-01T08:00:00.000Z',
      endsAt: '2026-09-01T12:00:00.000Z',
    });

    expect(event).toMatchObject({
      eventId: EVENT_ID,
      title: 'Great Hall Challenge',
      description: 'Explore East Campus.',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      isPublished: false,
      authoringStatus: 'draft',
      retiredAt: null,
    });

    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);

    expect(executedSql(fixture.query)).toContain(
      'insert into public.author_content_audit',
    );

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.author_content_audit'),
      [AUTHOR_ID, 'event', EVENT_ID, 'create', null, 'draft', null, 0],
    );
  });

  it('enables automatic placement as part of event creation', async () => {
    const fixture = createFixture();
    const baseImplementation = successfulImplementation();
    fixture.query.mockImplementation(async (statement: string) => {
      const sql = statement.toLowerCase();
      if (
        sql.includes('from public.event_placement_state') &&
        sql.includes('for update')
      ) {
        return {
          rows: [
            {
              current_plan_id: null,
              observed_at: new Date('2026-08-15T20:00:00.000Z'),
              policy_version_id: 'placement-v1',
              version: '4',
            },
          ],
        };
      }
      return baseImplementation(statement);
    });

    const service = createAuthorEventService(fixture.database);
    const event = await service.createEvent({
      ...validInput(),
      automaticPlacement: true,
    });

    expect(event.automaticPlacement).toBe(true);
    expect(executedSql(fixture.query)).toContain(
      'insert into public.event_placement_portability',
    );
    expect(executedSql(fixture.query)).toContain(
      'update public.event_placement_state',
    );
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.event_placement_audit'),
      expect.arrayContaining(['enable_automatic_placement']),
    );
    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('updates an event and audits the edit in the same transaction', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const service = createAuthorEventService(fixture.database);

    const event = await service.updateEvent({
      expectedVersion: 0,
      actorPlayerId: AUTHOR_ID,
      automaticPlacement: false,
      eventId: EVENT_ID,
      title: 'Updated event',
      description: null,
      latitude: -26.19,
      longitude: 28.03,
      radiusMetres: 100,
      startsAt: '2026-09-02T08:00:00.000Z',
      endsAt: '2026-09-02T10:00:00.000Z',
    });

    expect(event.eventId).toBe(EVENT_ID);

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.author_content_audit'),
      [AUTHOR_ID, 'event', EVENT_ID, 'edit', 'draft', 'draft', null, 1],
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('rolls back the content change when audit persistence fails', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(async (statement: string) => {
      const sql = statement.toLowerCase().trim();

      if (sql === 'begin' || sql === 'rollback') {
        return { rows: [] };
      }

      if (sql.includes('insert into public.events')) {
        return {
          rows: [authorEventRow()],
        };
      }

      if (sql.includes('insert into public.author_content_audit')) {
        throw new Error('audit unavailable');
      }

      return { rows: [] };
    });

    const service = createAuthorEventService(fixture.database);

    await expect(service.createEvent(validInput())).rejects.toThrow(
      'audit unavailable',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it('returns not found when editing an unavailable event', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(async (statement: string) => {
      const sql = statement.toLowerCase().trim();

      if (sql === 'begin' || sql === 'rollback') {
        return { rows: [] };
      }

      if (sql.includes('update public.events')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const service = createAuthorEventService(fixture.database);

    await expect(
      service.updateEvent({
        expectedVersion: 0,
        ...validInput(),
        eventId: EVENT_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorEventNotFoundError);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.author_content_audit',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it.each([
    {
      change: { title: '   ' },
      message: 'Event title must not be blank.',
    },
    {
      change: { latitude: 91 },
      message: 'Latitude must be between -90 and 90 degrees.',
    },
    {
      change: { longitude: 181 },
      message: 'Longitude must be between -180 and 180 degrees.',
    },
    {
      change: { radiusMetres: 0 },
      message: 'Event radius must be a positive integer.',
    },
    {
      change: {
        startsAt: '2026-09-01T12:00:00.000Z',
        endsAt: '2026-09-01T08:00:00.000Z',
      },
      message: 'Event end time must be after its start time.',
    },
  ])('rejects invalid event input: $message', async ({ change, message }) => {
    const fixture = createFixture();

    const service = createAuthorEventService(fixture.database);

    await expect(
      service.createEvent({
        ...validInput(),
        ...change,
      }),
    ).rejects.toMatchObject({
      message,
    } satisfies Partial<InvalidAuthorEventError>);

    expect(fixture.database.connect).not.toHaveBeenCalled();
  });

  it('lists both draft and published events without a player-facing publication filter', async () => {
    const fixture = createFixture();

    fixture.query.mockResolvedValue({
      rows: [
        authorEventRow(),
        {
          ...authorEventRow(),
          event_id: 'b2000000-0000-4000-8000-000000000002',
          is_published: true,
          authoring_status: 'published',
          publication_provenance: 'legacy',
        },
      ],
    });

    const service = createAuthorEventService(fixture.database);

    const events = await service.listEvents();

    expect(events).toHaveLength(2);

    expect(executedSql(fixture.query)).not.toContain(
      'where event.is_published = true',
    );
  });
});

function validInput() {
  return {
    actorPlayerId: AUTHOR_ID,
    automaticPlacement: false,
    title: 'Great Hall Challenge',
    description: 'Explore East Campus.',
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T12:00:00.000Z',
  };
}

function createFixture() {
  const query = vi.fn();

  const client: AuthorEventTransactionClient = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ) {
      const result = await query(statement, values ?? []);

      return result as {
        rows: T[];
        rowCount?: number | null;
      };
    },

    release: vi.fn(),
  };

  const database: AuthorEventDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };

  return {
    database,
    client,
    query,
  };
}

function successfulImplementation() {
  return async (statement: string) => {
    const sql = statement.toLowerCase().trim();

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [] };
    }

    if (
      sql.includes('select') &&
      sql.includes('authoring_status as status') &&
      sql.includes('version') &&
      sql.includes('from public.events') &&
      sql.includes('for update')
    ) {
      return {
        rows: [
          {
            status: 'draft',
            version: 0,
            automatic_placement: false,
          },
        ],
      };
    }

    if (sql.includes('insert into public.events')) {
      return {
        rows: [authorEventRow()],
      };
    }

    if (sql.includes('update public.events')) {
      return { rows: [{ ...authorEventRow(), version: 1 }] };
    }

    if (sql.includes('insert into public.author_content_audit')) {
      return { rows: [] };
    }

    if (sql.includes('from public.events event')) {
      return {
        rows: [authorEventRow()],
      };
    }

    return { rows: [] };
  };
}

function authorEventRow() {
  return {
    event_id: EVENT_ID,
    title: 'Great Hall Challenge',
    description: 'Explore East Campus.',
    latitude: -26.19205,
    longitude: 28.03038,
    radius_metres: 75,
    starts_at: new Date('2026-09-01T08:00:00.000Z'),
    ends_at: new Date('2026-09-01T12:00:00.000Z'),
    is_published: false,
    created_at: new Date('2026-08-15T20:00:00.000Z'),
    updated_at: new Date('2026-08-15T20:00:00.000Z'),
    retired_at: null,
    authoring_status: 'draft',
    automatic_placement: false,
    version: 0,
    submitted_by_player_id: null,
    submitted_at: null,
    reviewed_by_player_id: null,
    reviewed_at: null,
    publication_provenance: null,
  };
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls
    .map(([statement]) => String(statement).toLowerCase())
    .join('\n');
}

function executedCommands(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls
    .map(([statement]) => String(statement).trim().toLowerCase())
    .filter((statement) => ['begin', 'commit', 'rollback'].includes(statement));
}
