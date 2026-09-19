import { describe, expect, it, vi } from 'vitest';

import {
  createTrustRestrictionService,
  TrustActivityRestrictedError,
} from '../src/trust/trust-restrictions.js';

function databaseWithRows(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const release = vi.fn();
  return {
    database: {
      connect: vi.fn().mockResolvedValue({ query, release }),
    },
    query,
    release,
  };
}

describe('trust restriction enforcement', () => {
  it('allows an operation when no active restriction exists', async () => {
    const { database, query, release } = databaseWithRows([]);
    const service = createTrustRestrictionService(database as never);

    await expect(
      service.assertAllowed(
        '00000000-0000-4000-8000-000000000001',
        'new_competitive_match_hold',
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns only safe capability and timing information for an active restriction', async () => {
    const startsAt = new Date('2026-09-18T12:00:00.000Z');
    const expiresAt = new Date('2026-09-20T12:00:00.000Z');
    const { database } = databaseWithRows([
      {
        scope: 'location_reward_challenge_hold',
        starts_at: startsAt,
        effective_expires_at: expiresAt,
      },
    ]);
    const service = createTrustRestrictionService(database as never);

    await expect(
      service.activeRestriction(
        '00000000-0000-4000-8000-000000000001',
        'location_reward_challenge_hold',
      ),
    ).resolves.toEqual({
      scope: 'location_reward_challenge_hold',
      startsAt,
      expiresAt,
    });
  });

  it('blocks with a neutral non-accusatory error', async () => {
    const { database } = databaseWithRows([
      {
        scope: 'online_verification_required',
        starts_at: new Date('2026-09-18T12:00:00.000Z'),
        effective_expires_at: new Date('2026-09-20T12:00:00.000Z'),
      },
    ]);
    const service = createTrustRestrictionService(database as never);

    const error = await service
      .assertAllowed(
        '00000000-0000-4000-8000-000000000001',
        'online_verification_required',
      )
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(TrustActivityRestrictedError);
    expect(error).toMatchObject({
      code: 'ACTIVITY_REVIEW_RESTRICTION',
      statusCode: 403,
    });
    expect((error as Error).message.toLowerCase()).not.toMatch(
      /score|cheat|fraud|signal|threshold/u,
    );
  });
});
