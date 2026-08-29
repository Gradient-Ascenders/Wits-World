import { describe, expect, it, vi } from 'vitest';

import {
  createAuthorCampaignService,
  InvalidAuthorCampaignError,
  type AuthorCampaignDatabase,
} from '../src/campaigns/author-campaign-service.js';

const AUTHOR_ID = '18370000-0000-4000-8000-000000000001';
const EVENT_ID = '18370000-0000-4000-8000-000000000002';

describe('author campaign service validation', () => {
  it('rejects a blank title before opening a transaction', async () => {
    const connect = vi.fn();
    await expect(
      createAuthorCampaignService({
        connect,
      } as AuthorCampaignDatabase).createCampaign({
        ...validInput(),
        title: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidAuthorCampaignError);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects an invalid or empty time period', async () => {
    const connect = vi.fn();
    const service = createAuthorCampaignService({
      connect,
    } as AuthorCampaignDatabase);
    await expect(
      service.createCampaign({ ...validInput(), startsAt: 'not-a-date' }),
    ).rejects.toThrow('Campaign start time is invalid.');
    await expect(
      service.createCampaign({
        ...validInput(),
        endsAt: validInput().startsAt,
      }),
    ).rejects.toThrow('Campaign end time must be after its start time.');
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['startsAt', '2026-02-30T08:00:00.000Z', 'start'],
    ['startsAt', '2026-09-05T24:01:00.000Z', 'start'],
    ['endsAt', '2026-09-31T16:00:00.000Z', 'end'],
    ['endsAt', '2026-09-05T16:60:00.000Z', 'end'],
  ] as const)(
    'rejects an impossible %s value before opening a transaction',
    async (field, value, label) => {
      const connect = vi.fn();
      await expect(
        createAuthorCampaignService({
          connect,
        } as AuthorCampaignDatabase).createCampaign({
          ...validInput(),
          [field]: value,
        }),
      ).rejects.toThrow(`Campaign ${label} time is invalid.`);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate event or trail membership', async () => {
    const connect = vi.fn();
    const service = createAuthorCampaignService({
      connect,
    } as AuthorCampaignDatabase);
    await expect(
      service.createCampaign({
        ...validInput(),
        eventIds: [EVENT_ID, EVENT_ID.toUpperCase()],
      }),
    ).rejects.toThrow('An event can appear only once within a campaign.');
    await expect(
      service.createCampaign({
        ...validInput(),
        trailIds: [EVENT_ID, EVENT_ID],
      }),
    ).rejects.toThrow('A trail can appear only once within a campaign.');
    expect(connect).not.toHaveBeenCalled();
  });

  it('allows an empty draft membership set', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ campaign_id: '18370000-0000-4000-8000-000000000003' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            campaign_id: '18370000-0000-4000-8000-000000000003',
            title: 'Open Day',
            description: null,
            status: 'draft',
            starts_at: new Date(validInput().startsAt),
            ends_at: new Date(validInput().endsAt),
            version: 0,
            submitted_by_player_id: null,
            submitted_at: null,
            reviewed_by_player_id: null,
            reviewed_at: null,
            publication_provenance: null,
            published_at: null,
            retired_at: null,
            created_at: new Date('2026-08-29T12:00:00Z'),
            updated_at: new Date('2026-08-29T12:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const database: AuthorCampaignDatabase = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    };

    await expect(
      createAuthorCampaignService(database).createCampaign({
        ...validInput(),
        eventIds: [],
      }),
    ).resolves.toMatchObject({ status: 'draft', events: [], trails: [] });
  });
});

function validInput() {
  return {
    actorPlayerId: AUTHOR_ID,
    title: 'Open Day',
    startsAt: '2026-09-05T08:00:00.000Z',
    endsAt: '2026-09-05T16:00:00.000Z',
    eventIds: [EVENT_ID],
    trailIds: [] as string[],
  };
}
