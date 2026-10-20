import Fastify from 'fastify';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlayerProfileService,
  normalizeProfileAvatar,
} from '../src/players/player-profile.js';
import { playerProfileRoutes } from '../src/routes/player-profiles.js';

describe('profile avatar normalization', () => {
  it('decodes and normalizes pictures to a bounded JPEG', async () => {
    const source = await sharp({
      create: { width: 500, height: 300, channels: 3, background: '#2a6bff' },
    })
      .png()
      .toBuffer();
    const value = await normalizeProfileAvatar(
      `data:image/png;base64,${source.toString('base64')}`,
    );
    expect(value).toMatch(/^data:image\/jpeg;base64,/);
    const metadata = await sharp(
      Buffer.from(value!.split(',')[1]!, 'base64'),
    ).metadata();
    expect(metadata).toMatchObject({ width: 256, height: 256, format: 'jpeg' });
    expect(metadata.exif).toBeUndefined();
  });
  it('rejects SVG, corrupt and oversized payloads and supports removal', async () => {
    for (const value of [
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/jpeg;base64,YmFk',
      `data:image/png;base64,${'A'.repeat(200001)}`,
    ])
      await expect(normalizeProfileAvatar(value)).rejects.toMatchObject({
        code: 'INVALID_PROFILE_AVATAR',
      });
    expect(await normalizeProfileAvatar(null)).toBeNull();
  });
});

describe('profile status projections', () => {
  it.each([
    {
      emoji: '📚',
      text: '',
      active: true,
      expected: { emoji: '📚', text: '', expiresAt: null },
    },
    {
      emoji: '',
      text: 'Studying',
      active: true,
      expected: { emoji: '', text: 'Studying', expiresAt: null },
    },
    {
      emoji: '📚',
      text: 'Studying',
      active: true,
      expected: { emoji: '📚', text: 'Studying', expiresAt: null },
    },
    { emoji: '📚', text: '', active: false, expected: null },
    { emoji: '', text: '', active: true, expected: null },
  ])(
    'projects active status for owners and visitors: $emoji $text (active: $active)',
    async ({ emoji, text, active, expected }) => {
      const ownerId = '17400000-0000-4000-8000-000000000001';
      for (const viewerId of [
        ownerId,
        '17400000-0000-4000-8000-000000000002',
      ]) {
        const query = vi
          .fn()
          .mockResolvedValue({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: ownerId,
                status_active: active,
                status_emoji: emoji,
                status_text: text,
                status_expires_at: null,
                today: '2026-10-03',
                is_public: true,
                featured_ids: [],
                activity: null,
                progression: {
                  player_name: 'owner',
                  total_points: 0,
                  standing_rank: 1,
                  current_streak: 0,
                  longest_streak: 0,
                  achievements: [],
                },
              },
            ],
          });
        const service = createPlayerProfileService({
          connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
        });
        expect((await service.get(viewerId, 'owner')).status).toEqual(expected);
      }
    },
  );
});

describe('profile mutation boundaries', () => {
  it('takes owner identity from authentication and validates selections before invoking storage', async () => {
    const app = Fastify();
    const service = {
      get: vi.fn().mockResolvedValue({ playerName: 'owner' }),
      save: vi.fn().mockResolvedValue({ playerName: 'owner' }),
    };
    app.decorate('authenticate', async () => undefined);
    app.decorate(
      'requireActivePlayer',
      async (request: { player?: unknown }) => {
        request.player = { id: '17400000-0000-4000-8000-000000000001' };
      },
    );
    await app.register(playerProfileRoutes, { service });
    const edit = {
      expectedVersion: 0,
      bio: '',
      degree: '',
      studyYear: '',
      avatarDataUrl: null,
      statusEmoji: '',
      statusText: '',
      statusExpiry: 'never',
      isPublic: true,
      activityVisible: false,
      featuredOwnedCardIds: [],
    };
    const response = await app.inject({
      method: 'PUT',
      url: '/profiles/me',
      payload: edit,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.save).toHaveBeenCalledWith(
      '17400000-0000-4000-8000-000000000001',
      edit,
    );
    for (const patch of [
      { bio: 'x'.repeat(281) },
      { statusExpiry: 'tomorrow' },
      { featuredOwnedCardIds: ['invalid'] },
      {
        featuredOwnedCardIds: Array(5).fill(
          '17400000-0000-4000-8000-000000000001',
        ),
      },
    ]) {
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/profiles/me',
            payload: { ...edit, ...patch },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(service.save).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
