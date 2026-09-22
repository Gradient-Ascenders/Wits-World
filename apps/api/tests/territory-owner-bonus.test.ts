import { describe, expect, it, vi } from 'vitest';

import { createTerritoryOwnerBonusService } from '../src/territory/territory-owner-bonus.js';
import type { TerritoryQueryable } from '../src/territory/territory-grants.js';

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';
const PLAYER_ID = '20000000-0000-4000-8000-000000000001';
const COMPLETION_ID = '30000000-0000-4000-8000-000000000001';
const CARD_ID = '40000000-0000-4000-8000-000000000001';
const DECISION_ID = '50000000-0000-4000-8000-000000000001';
const COMPLETED_AT = new Date('2026-09-22T10:00:00.000Z');

function createQueryable(query: ReturnType<typeof vi.fn>): TerritoryQueryable {
  return { query } as unknown as TerritoryQueryable;
}

const snapshot = {
  territory_policy_version: 'territory-v1',
  zone_id: '60000000-0000-4000-8000-000000000001',
  eligibility_outcome: 'eligible',
  bonus_date: '2026-09-22',
};

describe('territory-v1 owner bonus', () => {
  it('awards one persisted Common card only after an eligible three-correct completion', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [snapshot] })
      .mockResolvedValueOnce({
        rows: [{ owner_bonus_minimum_correct_answers: 3 }],
      })
      .mockResolvedValueOnce({ rows: [{ card_definition_id: CARD_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: DECISION_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = createTerritoryOwnerBonusService(() => 0);

    await service.finalizeAttempt(createQueryable(query), {
      attemptId: ATTEMPT_ID,
      playerId: PLAYER_ID,
      completionId: COMPLETION_ID,
      scoreCorrect: 3,
      completedAt: COMPLETED_AT,
    });

    expect(String(query.mock.calls[3]?.[0])).toContain("rarity = 'common'");
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'evolves_from_definition_id is null',
    );
    expect(String(query.mock.calls[4]?.[0])).toContain(
      'private.territory_owner_bonus_decisions',
    );
    expect(String(query.mock.calls[5]?.[0])).toContain('public.player_cards');
    expect(query.mock.calls[5]?.[1]).toEqual([
      PLAYER_ID,
      CARD_ID,
      COMPLETION_ID,
      DECISION_ID,
      COMPLETED_AT,
    ]);
  });

  it('keeps the ordinary completion intact when the score is below the bonus threshold', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [snapshot] })
      .mockResolvedValueOnce({
        rows: [{ owner_bonus_minimum_correct_answers: 3 }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = createTerritoryOwnerBonusService(() => 0);

    await service.finalizeAttempt(createQueryable(query), {
      attemptId: ATTEMPT_ID,
      playerId: PLAYER_ID,
      completionId: COMPLETION_ID,
      scoreCorrect: 2,
      completedAt: COMPLETED_AT,
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3]?.[1]).toContain('score_too_low');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('insert into public.player_cards'),
      ),
    ).toBe(false);
  });

  it('reuses an existing attempt decision instead of rerolling a reward', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: DECISION_ID }] });
    const randomInt = vi.fn(() => 0);
    const service = createTerritoryOwnerBonusService(randomInt);

    await service.finalizeAttempt(createQueryable(query), {
      attemptId: ATTEMPT_ID,
      playerId: PLAYER_ID,
      completionId: COMPLETION_ID,
      scoreCorrect: 5,
      completedAt: COMPLETED_AT,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(randomInt).not.toHaveBeenCalled();
  });
});
