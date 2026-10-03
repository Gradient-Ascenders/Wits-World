import { describe, expect, it } from 'vitest';
import { parsePlayerProfile } from '../src/api/player-profile';
import { buildPlayerProfile } from './fixtures/player-profile';

describe('player profile response boundary', () => {
  it('rejects unexpected private data and unsafe visitor projections', () => {
    const owner = { ...buildPlayerProfile(), requestId: 'profile' };
    expect(parsePlayerProfile(owner).isOwner).toBe(true);
    for (const patch of [
      { email: 'private@example.test' },
      { isOwner: false },
      { isOwner: false, version: null, activityVisible: false, activity: [] },
      { featuredOwnedCardIds: ['bad-id'] },
      { avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { activity: [{ date: '2026-10-03', count: 1 }] },
      { activity: [{ date: '2026-10-02', count: -1 }] },
    ])
      expect(() => parsePlayerProfile({ ...owner, ...patch })).toThrow();
  });
  it('accepts an explicit visitor projection with shared aggregate activity', () => {
    const profile = {
      ...buildPlayerProfile({
        isOwner: false,
        version: null,
        isPublic: true,
        achievements: [],
        activityVisible: true,
        activity: [{ date: '2026-10-02', count: 2 }],
      }),
      requestId: 'visitor',
    };
    expect(parsePlayerProfile(profile)).toMatchObject({
      isOwner: false,
      activity: [{ date: '2026-10-02', count: 2 }],
      featuredOwnedCardIds: [],
    });
  });
});
