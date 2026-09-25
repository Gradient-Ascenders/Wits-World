import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';
import type { RankedReadService } from '../src/matches/ranked-read-service.js';
import type { RankedService } from '../src/matches/ranked-service.js';

const maintenance = vi.hoisted(() => ({
  maintainRankedSeasons: vi.fn(),
}));

vi.mock('../src/matches/ranked-season-service.js', () => ({
  maintainRankedSeasons: maintenance.maintainRankedSeasons,
}));

import { createRankedScheduler } from '../src/matches/ranked-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ranked scheduler', () => {
  it('reports one privacy-safe error when interval ticks share a failed run', async () => {
    vi.useFakeTimers();
    let rejectMaintenance!: (error: Error) => void;
    maintenance.maintainRankedSeasons.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectMaintenance = reject;
      }),
    );
    const error = vi.fn();
    const scheduler = createRankedScheduler(
      {} as RankedDatabase,
      {} as RankedService,
      {} as RankedReadService,
      { info: vi.fn(), error },
      250,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(maintenance.maintainRankedSeasons).toHaveBeenCalledOnce();

    rejectMaintenance(
      Object.assign(new Error('query contained private context'), {
        code: '42601',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      { databaseErrorCode: '42601' },
      'Ranked maintenance sweep failed.',
    );
  });
});
