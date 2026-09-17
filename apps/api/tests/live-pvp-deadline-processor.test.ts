import { describe, expect, it, vi } from 'vitest';

import { createLivePvpDeadlineProcessor } from '../src/matches/live-pvp-deadline-processor.js';

describe('live PvP deadline processor', () => {
  it('processes due matches and converges successive due transitions', async () => {
    const processOverdueMatch = vi
      .fn()
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: false });
    const processor = createLivePvpDeadlineProcessor(
      {
        listDueMatchIds: vi.fn().mockResolvedValue(['match-one']),
        processOverdueMatch,
      },
      { error: vi.fn() },
    );

    await expect(processor.runOnce()).resolves.toEqual({
      matchesScanned: 1,
      transitionsCommitted: 2,
      failures: 0,
    });
    expect(processOverdueMatch).toHaveBeenCalledTimes(3);
  });

  it('catches up enough persisted overdue decisions to reach a terminal forfeit', async () => {
    const processOverdueMatch = vi
      .fn()
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: true, completed: false })
      .mockResolvedValueOnce({ transitioned: true, completed: true });
    const processor = createLivePvpDeadlineProcessor(
      {
        listDueMatchIds: vi.fn().mockResolvedValue(['stale-match']),
        processOverdueMatch,
      },
      { error: vi.fn() },
    );

    await expect(processor.runOnce()).resolves.toEqual({
      matchesScanned: 1,
      transitionsCommitted: 5,
      failures: 0,
    });
    expect(processOverdueMatch).toHaveBeenCalledTimes(5);
  });

  it('isolates one failed match so another due match still processes', async () => {
    const logger = { error: vi.fn() };
    const processOverdueMatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('database race'))
      .mockResolvedValueOnce({ transitioned: true, completed: true });
    const processor = createLivePvpDeadlineProcessor(
      {
        listDueMatchIds: vi.fn().mockResolvedValue(['one', 'two']),
        processOverdueMatch,
      },
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      matchesScanned: 2,
      transitionsCommitted: 1,
      failures: 1,
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
