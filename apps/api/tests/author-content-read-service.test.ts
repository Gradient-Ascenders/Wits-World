import { describe, expect, it, vi } from 'vitest';

import {
  createAuthorContentReadService,
  type AuthorContentReadDatabase,
} from '../src/authoring/content-read-service.js';

const entityId = 'c2000000-0000-4000-8000-000000000001';

describe('Author content paginated reads', () => {
  it('retains review-queue totals when the requested page is empty', async () => {
    const { database, release } = databaseFixture((statement) => {
      if (statement.includes('count(*)::int total_items from queue')) {
        return { rows: [{ total_items: 23 }] };
      }
      return { rows: [] };
    });

    const result = await createAuthorContentReadService(
      database,
    ).listReviewQueue({
      actorPlayerId: entityId,
      entityType: 'event',
      page: 3,
      pageSize: 10,
    });

    expect(result).toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      totalItems: 23,
      totalPages: 3,
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('retains history totals when the requested page is empty', async () => {
    const { database, release } = databaseFixture((statement) => {
      if (statement.startsWith('select id from public.events')) {
        return { rows: [{ id: entityId }] };
      }
      if (statement.includes('select count(*)::int total_items')) {
        return { rows: [{ total_items: 5 }] };
      }
      return { rows: [] };
    });

    const result = await createAuthorContentReadService(database).getHistory({
      entityId,
      entityType: 'event',
      page: 2,
      pageSize: 5,
    });

    expect(result).toEqual({
      items: [],
      page: 2,
      pageSize: 5,
      totalItems: 5,
      totalPages: 1,
    });
    expect(release).toHaveBeenCalledOnce();
  });
});

function databaseFixture(
  implementation: (statement: string) => { rows: object[] },
) {
  const release = vi.fn();
  const query = vi.fn(async (statement: string) => implementation(statement));
  const database = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as AuthorContentReadDatabase;
  return { database, release };
}
