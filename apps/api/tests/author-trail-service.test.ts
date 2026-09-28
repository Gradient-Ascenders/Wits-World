import { describe, expect, it, vi } from 'vitest';

import {
  AuthorTrailNotFoundError,
  AuthorTrailNotReadyError,
  AuthorTrailStateConflictError,
  createAuthorTrailService,
  InvalidAuthorTrailError,
  type AuthorTrailDatabase,
  type AuthorTrailTransactionClient,
} from '../src/trails/author-trail-service.js';

const AUTHOR_ID = '176a0000-0000-4000-8000-000000000001';
const EVENT_ID = '176b0000-0000-4000-8000-000000000001';
const SECOND_EVENT_ID = '176b0000-0000-4000-8000-000000000002';
const TRAIL_ID = '176c0000-0000-4000-8000-000000000001';

describe('author trail service validation', () => {
  it('rejects UUID-equivalent duplicate event membership before connecting', async () => {
    const connect = vi.fn<AuthorTrailDatabase['connect']>();
    const service = createAuthorTrailService({ connect });

    await expect(
      service.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Duplicate membership',
        eventIds: [EVENT_ID, EVENT_ID.toUpperCase()],
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorTrailError);

    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects blank metadata and more than 50 steps before connecting', async () => {
    const connect = vi.fn<AuthorTrailDatabase['connect']>();
    const service = createAuthorTrailService({ connect });

    await expect(
      service.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: '   ',
        eventIds: [],
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorTrailError);

    await expect(
      service.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Too long',
        eventIds: Array.from(
          { length: 51 },
          (_, index) =>
            `176b0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        ),
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorTrailError);

    expect(connect).not.toHaveBeenCalled();
  });

  it('persists, publishes, lists, updates and retires a trail atomically', async () => {
    let status: 'draft' | 'published' | 'retired' = 'draft';
    let title = 'Campus highlights';
    let description: string | null = 'A short walk.';
    const { database, query, release } = trailDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('select count(*)::int as event_count')) {
        return { rows: [{ event_count: 2 }] };
      }
      if (sql.includes('insert into public.trails')) {
        return { rows: [{ trail_id: TRAIL_ID }] };
      }
      if (sql.includes('select status') && sql.includes('for update')) {
        return { rows: [{ status }] };
      }
      if (sql.includes('as step_count')) {
        return {
          rows: [{ step_count: 2, unavailable_event_count: 0 }],
        };
      }
      if (sql.includes("set status = 'published'")) status = 'published';
      if (sql.includes("set status = 'retired'")) status = 'retired';
      if (sql.includes('set title = $2')) {
        title = 'Updated highlights';
        description = null;
      }
      if (sql.includes('from public.trails trail')) {
        return {
          rows: trailRows({ description, status, title }),
        };
      }
      return { rows: [] };
    });
    const service = createAuthorTrailService(database);

    await expect(
      service.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: '  Campus highlights  ',
        description: '  A short walk.  ',
        eventIds: [EVENT_ID, SECOND_EVENT_ID],
      }),
    ).resolves.toMatchObject({
      trailId: TRAIL_ID,
      title: 'Campus highlights',
      status: 'draft',
      steps: [
        { eventStatus: 'published', position: 1 },
        { eventStatus: 'draft', position: 2 },
      ],
    });

    await expect(
      service.updateTrail({
        actorPlayerId: AUTHOR_ID,
        trailId: TRAIL_ID,
        title: 'Updated highlights',
        description: null,
        eventIds: [SECOND_EVENT_ID, EVENT_ID],
      }),
    ).resolves.toMatchObject({ title: 'Updated highlights' });
    await expect(
      service.publishTrail(AUTHOR_ID, TRAIL_ID),
    ).resolves.toMatchObject({ status: 'published' });
    await expect(service.listTrails()).resolves.toHaveLength(1);
    await expect(
      service.retireTrail(AUTHOR_ID, TRAIL_ID),
    ).resolves.toMatchObject({ status: 'retired' });

    expect(query).toHaveBeenCalledWith('begin');
    expect(query).toHaveBeenCalledWith('commit');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('insert into public.author_content_audit'),
      ),
    ).toBe(true);
    expect(release).toHaveBeenCalledTimes(5);
  });

  it('rolls back missing, unavailable and conflicting trail transitions', async () => {
    const scenarios = [
      {
        response: { rows: [] },
        error: AuthorTrailNotFoundError,
      },
      {
        response: { rows: [{ status: 'published' }] },
        error: AuthorTrailStateConflictError,
      },
    ];

    for (const scenario of scenarios) {
      const { database, query } = trailDatabase(async (statement) => {
        if (normalizedSql(statement).includes('select status')) {
          return scenario.response;
        }
        return { rows: [] };
      });
      await expect(
        createAuthorTrailService(database).updateTrail({
          actorPlayerId: AUTHOR_ID,
          trailId: TRAIL_ID,
          title: 'Still valid',
          eventIds: [],
        }),
      ).rejects.toBeInstanceOf(scenario.error);
      expect(query).toHaveBeenCalledWith('rollback');
    }

    const { database, query } = trailDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('select status')) return { rows: [{ status: 'draft' }] };
      if (sql.includes('as step_count')) {
        return { rows: [{ step_count: 1, unavailable_event_count: 0 }] };
      }
      return { rows: [] };
    });
    await expect(
      createAuthorTrailService(database).publishTrail(AUTHOR_ID, TRAIL_ID),
    ).rejects.toBeInstanceOf(AuthorTrailNotReadyError);
    expect(query).toHaveBeenCalledWith('rollback');
  });
});

function trailDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = { query, release } as unknown as AuthorTrailTransactionClient;
  const database: AuthorTrailDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function trailRows({
  description,
  status,
  title,
}: {
  description: string | null;
  status: 'draft' | 'published' | 'retired';
  title: string;
}) {
  const timestamps = {
    created_at: new Date('2026-09-01T08:00:00.000Z'),
    updated_at: new Date('2026-09-01T09:00:00.000Z'),
  };
  return [
    {
      trail_id: TRAIL_ID,
      title,
      description,
      status,
      published_at:
        status === 'published' ? new Date('2026-09-01T09:00:00.000Z') : null,
      retired_at:
        status === 'retired' ? new Date('2026-09-01T10:00:00.000Z') : null,
      ...timestamps,
      position: 1,
      event_id: EVENT_ID,
      event_title: 'Great Hall',
      event_is_published: true,
      event_retired_at: null,
    },
    {
      trail_id: TRAIL_ID,
      title,
      description,
      status,
      published_at: null,
      retired_at: null,
      ...timestamps,
      position: 2,
      event_id: SECOND_EVENT_ID,
      event_title: 'Library',
      event_is_published: false,
      event_retired_at: null,
    },
  ];
}
