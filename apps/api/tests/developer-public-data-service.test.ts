import { describe, expect, it, vi } from 'vitest';

import { createDeveloperPublicDataService } from '../src/developer/developer-public-data-service.js';
import type { EventDiscoveryService } from '../src/events/event-discovery.js';

const EVENT_ID = '19200000-0000-4000-8000-000000000001';
const CARD_ID = '20200000-0000-4000-8000-000000000001';

describe('developer public data service', () => {
  it('removes placement internals from discovered events and paginates deterministically', async () => {
    const eventDiscovery: EventDiscoveryService = {
      list: vi.fn().mockResolvedValue([
        {
          eventId: EVENT_ID,
          title: 'Great Hall challenge',
          description: 'Public event.',
          latitude: -26.191,
          longitude: 28.03,
          radiusMetres: 75,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
          availability: 'active',
          placementAssignmentId: 'internal-placement-id',
        },
      ]),
    };
    const service = createDeveloperPublicDataService(
      { query: vi.fn() },
      eventDiscovery,
    );

    const page = await service.listEvents({ page: 1, pageSize: 50 });

    expect(page).toEqual({
      events: [
        {
          eventId: EVENT_ID,
          title: 'Great Hall challenge',
          description: 'Public event.',
          latitude: -26.191,
          longitude: 28.03,
          radiusMetres: 75,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
          availability: 'active',
        },
      ],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });
    expect(JSON.stringify(page)).not.toContain('placementAssignmentId');
  });

  it('returns only the deliberately public card projection', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          card_definition_id: CARD_ID,
          name: 'Quillip',
          category: 'creature',
          affinity: 'wit',
          rarity: 'common',
          hp: 98,
          power: 11,
          description: 'A Wit scholar.',
          image_url: '/cards/quillip.webp',
          image_alt: 'A small owl-like creature.',
          evolves_from_definition_id: null,
          evolution_copies_required: null,
          moves: [
            {
              position: 1,
              name: 'Quick Study',
              moveType: 'basic',
              powerCost: 0,
              rulesText: 'Deal damage.',
            },
          ],
          effects: [],
        },
      ],
    });
    const service = createDeveloperPublicDataService(
      { query },
      { list: vi.fn().mockResolvedValue([]) },
    );

    const cards = await service.listCards();

    expect(cards).toEqual([
      {
        cardDefinitionId: CARD_ID,
        name: 'Quillip',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        hp: 98,
        power: 11,
        description: 'A Wit scholar.',
        imageUrl: '/cards/quillip.webp',
        imageAlt: 'A small owl-like creature.',
        deckPointCost: 1,
        evolvesFromCardDefinitionId: null,
        evolutionCopiesRequired: null,
        moves: [
          {
            position: 1,
            name: 'Quick Study',
            moveType: 'basic',
            powerCost: 0,
            rulesText: 'Deal damage.',
          },
        ],
        effects: [],
      },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain(
      "definition.catalogue_class = 'ordinary'",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "definition.authoring_status = 'published'",
    );
    expect(query.mock.calls[0]?.[0]).not.toContain('starter_eligible');
    expect(query.mock.calls[0]?.[0]).not.toContain('effect_config');
  });

  it('publishes only Player Name, points and rank for public standings', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ player_name: 'leader', total_points: 100, standing_rank: 1 }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const service = createDeveloperPublicDataService(
      { query },
      { list: vi.fn().mockResolvedValue([]) },
    );

    const standings = await service.listLeaderboard({
      period: 'monthly',
      month: '2026-09',
      page: 1,
      pageSize: 20,
    });

    expect(standings).toEqual({
      period: 'monthly',
      month: '2026-09',
      entries: [{ playerName: 'leader', points: 100, rank: 1 }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(JSON.stringify(standings)).not.toContain('playerId');
    expect(JSON.stringify(standings)).not.toContain('streak');
    expect(JSON.stringify(standings)).not.toContain('trust');
    expect(query.mock.calls[0]?.[0]).toContain('where player_name is not null');
  });
});
