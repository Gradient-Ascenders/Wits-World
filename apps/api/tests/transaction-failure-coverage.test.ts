import { describe, expect, it, vi } from 'vitest';

import {
  createAuthorCampaignService,
  type AuthorCampaignDatabase,
} from '../src/campaigns/author-campaign-service.js';
import {
  createAuthorChallengeService,
  type AuthorChallengeDatabase,
} from '../src/challenges/author-challenge-service.js';
import {
  CardTradeError,
  createCardTradeService,
  type CardTradeDatabase,
} from '../src/trading/card-trade-service.js';
import {
  createTrustService,
  type TrustDatabase,
} from '../src/trust/trust-service.js';
import {
  createRankedService,
  type RankedService,
} from '../src/matches/ranked-service.js';
import type { RankedDatabase } from '../src/matches/ranked-database.js';

const PLAYER_ID = '18370000-0000-4000-8000-000000000001';
const OTHER_PLAYER_ID = '18370000-0000-4000-8000-000000000002';
const EVENT_ID = '18370000-0000-4000-8000-000000000003';
const CHALLENGE_ID = '18370000-0000-4000-8000-000000000004';
const QUESTION_ID = '18370000-0000-4000-8000-000000000005';
const SUBMISSION_ID = '18370000-0000-4000-8000-000000000006';

describe('transaction failure boundaries', () => {
  it('rolls back failed trust-signal persistence and releases its client', async () => {
    const failure = new Error('database temporarily unavailable');
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('insert into private.trust_signals')) {
        throw failure;
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const service = createTrustService({
      connect: async () => ({ query, release }),
    } as unknown as TrustDatabase);

    await expect(
      service.recordSignal({
        playerId: PLAYER_ID,
        signalType: 'impossible_movement',
        severity: 'moderate',
        basePoints: 15,
        observedAt: new Date('2026-09-01T00:00:00.000Z'),
        sourceType: 'movement_decision',
        sourceIdentifier: 'decision-1',
        deduplicationKey: 'decision-1',
      }),
    ).rejects.toBe(failure);

    expect(
      query.mock.calls.map(([statement]) => statement.toLowerCase()),
    ).toEqual(expect.arrayContaining(['begin', 'rollback']));
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('preserves a campaign write failure when rollback also fails', async () => {
    const failure = new Error('campaign persistence unavailable');
    const query = vi.fn(async (statement: string) => {
      if (statement.toLowerCase() === 'rollback') {
        throw new Error('rollback connection failure');
      }
      if (statement.includes('insert into public.campaigns')) throw failure;
      return { rows: [] };
    });
    const release = vi.fn();
    const service = createAuthorCampaignService({
      connect: async () => ({ query, release }),
    } as unknown as AuthorCampaignDatabase);

    await expect(
      service.createCampaign({
        actorPlayerId: PLAYER_ID,
        title: 'Campus open day',
        startsAt: '2026-09-05T08:00:00.000Z',
        endsAt: '2026-09-05T16:00:00.000Z',
        eventIds: [],
        trailIds: [],
      }),
    ).rejects.toBe(failure);

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not commit a question after choice persistence fails', async () => {
    const failure = new Error('choice persistence unavailable');
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('from public.event_challenges challenge')) {
        return {
          rows: [
            {
              challenge_id: CHALLENGE_ID,
              event_id: EVENT_ID,
              format: 'multiple_choice',
              status: 'draft',
              version: 0,
              submitted_by_player_id: null,
              submitted_at: null,
              reviewed_by_player_id: null,
              reviewed_at: null,
              publication_provenance: null,
              created_at: new Date('2026-09-01T00:00:00.000Z'),
              updated_at: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        };
      }
      if (statement.includes('insert into public.challenge_questions')) {
        return { rows: [{ question_id: QUESTION_ID }] };
      }
      if (statement.includes('insert into public.challenge_choices')) {
        throw failure;
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const service = createAuthorChallengeService({
      connect: async () => ({ query, release }),
    } as unknown as AuthorChallengeDatabase);

    await expect(
      service.createQuestion({
        actorPlayerId: PLAYER_ID,
        challengeId: CHALLENGE_ID,
        prompt: 'Which building is the Great Hall?',
        difficulty: 1,
        explanation: 'It is the central campus landmark.',
        choices: ['Great Hall', 'Library', 'Student Centre', 'Senate House'],
        acceptedChoicePosition: 1,
      }),
    ).rejects.toBe(failure);

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('classifies reused trade submission ids without exposing database details', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('from private.card_trade_submission_receipts')) {
        return {
          rows: [{ trade_id: QUESTION_ID, payload_hash: 'a-different-intent' }],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const service = createCardTradeService({
      connect: async () => ({ query, release }),
    } as unknown as CardTradeDatabase);

    const failure = await service
      .createTrade({
        senderPlayerId: PLAYER_ID,
        recipientPlayerId: OTHER_PLAYER_ID,
        submissionId: SUBMISSION_ID,
        offeredOwnedCardIds: [QUESTION_ID],
        requestedDefinitions: [{ cardDefinitionId: EVENT_ID, quantity: 1 }],
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CardTradeError);
    expect(failure).toMatchObject({ code: 'TRADE_IDEMPOTENCY_CONFLICT' });
    expect((failure as Error).message).not.toMatch(
      /select|token|payload_hash/i,
    );
    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('destroys a ranked client when both the operation and rollback fail', async () => {
    const failure = new Error('ranked queue unavailable');
    const query = vi.fn(async (statement: string) => {
      if (statement.toLowerCase() === 'rollback') {
        throw new Error('connection is broken');
      }
      if (statement.includes('select id::text from public.players')) {
        throw failure;
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const database = {
      query: vi.fn(async () => ({ rows: [] })),
      connect: async () => ({ query, release }),
    } as unknown as RankedDatabase;
    const restrictions = {
      activeRestriction: vi.fn(async () => null),
      assertAllowed: vi.fn(async () => {}),
    };
    const service: RankedService = createRankedService(database, restrictions);

    await expect(service.cancel(PLAYER_ID)).rejects.toBe(failure);

    expect(query).toHaveBeenCalledWith('rollback');
    expect(query).not.toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(true);
  });
});
