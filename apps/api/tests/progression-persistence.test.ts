import { describe, expect, it, vi } from 'vitest';

import { createProgressionPersistence } from '../src/progression/progression-persistence.js';

describe('progression persistence', () => {
  it('records a challenge completion through the transaction client', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          award_id: '10000000-0000-4000-8000-000000000001',
          player_id: '20000000-0000-4000-8000-000000000001',
          points_awarded: 40,
          rule_code: 'challenge_score_4',
          rule_version: 1,
          was_created: true,
        },
      ],
    });
    const persistence = createProgressionPersistence();

    await expect(
      persistence.recordChallengeCompletion(
        { query },
        '30000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({
      awardId: '10000000-0000-4000-8000-000000000001',
      playerId: '20000000-0000-4000-8000-000000000001',
      pointsAwarded: 40,
      ruleCode: 'challenge_score_4',
      ruleVersion: 1,
      sourceKind: 'challenge_completion',
      wasCreated: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'private.record_challenge_completion_progression($1::uuid)',
      ),
      ['30000000-0000-4000-8000-000000000001'],
    );
  });

  it('returns the persisted CPU-match award on replay', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          award_id: '10000000-0000-4000-8000-000000000002',
          player_id: '20000000-0000-4000-8000-000000000002',
          points_awarded: 0,
          rule_code: 'cpu_match_loss',
          rule_version: 1,
          was_created: false,
        },
      ],
    });
    const persistence = createProgressionPersistence();

    await expect(
      persistence.recordCpuMatch(
        { query },
        '40000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toMatchObject({
      pointsAwarded: 0,
      ruleCode: 'cpu_match_loss',
      sourceKind: 'cpu_match',
      wasCreated: false,
    });
  });

  it('fails closed when the database function returns no award', async () => {
    const persistence = createProgressionPersistence();

    await expect(
      persistence.recordCpuMatch(
        { query: vi.fn().mockResolvedValue({ rows: [] }) },
        '40000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toThrow('Progression persistence returned no cpu_match award.');
  });
});
