import { describe, expect, it, vi } from 'vitest';

import {
  createAuthorTrailService,
  InvalidAuthorTrailError,
  type AuthorTrailDatabase,
} from '../src/trails/author-trail-service.js';

const AUTHOR_ID = '176a0000-0000-4000-8000-000000000001';
const EVENT_ID = '176b0000-0000-4000-8000-000000000001';

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
});
