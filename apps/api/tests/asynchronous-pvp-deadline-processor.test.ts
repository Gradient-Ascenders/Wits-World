import { describe, expect, it, vi } from 'vitest';

import type { AsyncPvpDatabase } from '../src/matches/asynchronous-pvp-service.js';
import { createAsyncPvpDeadlineProcessor } from '../src/matches/asynchronous-pvp-deadline-processor.js';

function makeClient(rows: { id: string }[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
}

function makeDatabase(clients: ReturnType<typeof makeClient>[]) {
  const remainingClients = [...clients];
  const connect = vi.fn(async () => {
    const client = remainingClients.shift();
    if (!client) throw new Error('Unexpected database connection');
    return client;
  });

  return {
    database: { connect } as unknown as AsyncPvpDatabase,
    connect,
  };
}

const noDeadlineLogger = () => ({ error: vi.fn() });

describe('asynchronous PvP deadline processor', () => {
  it('releases both sweep clients and does no item work when there are no due IDs', async () => {
    const invitationScan = makeClient();
    const matchScan = makeClient();
    const { database, connect } = makeDatabase([invitationScan, matchScan]);
    const expireInvitation = vi.fn();
    const forfeitOverdueMatch = vi.fn();

    const processor = createAsyncPvpDeadlineProcessor(
      database,
      { expireInvitation, forfeitOverdueMatch },
      noDeadlineLogger(),
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 0,
      matchesForfeited: 0,
      failures: 0,
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(invitationScan.release).toHaveBeenCalledOnce();
    expect(matchScan.release).toHaveBeenCalledOnce();
    expect(expireInvitation).not.toHaveBeenCalled();
    expect(forfeitOverdueMatch).not.toHaveBeenCalled();
  });

  it('counts each finalized item in a full batch and passes the batch bound to both scans', async () => {
    const invitationIds = Array.from(
      { length: 25 },
      (_, index) => `invitation-${index}`,
    );
    const matchIds = Array.from({ length: 25 }, (_, index) => `match-${index}`);
    const invitationScan = makeClient(invitationIds.map((id) => ({ id })));
    const matchScan = makeClient(matchIds.map((id) => ({ id })));
    const itemClients = Array.from({ length: 50 }, () => makeClient());
    const { database, connect } = makeDatabase([
      invitationScan,
      matchScan,
      ...itemClients,
    ]);
    const expireInvitation = vi.fn().mockResolvedValue(true);
    const forfeitOverdueMatch = vi.fn().mockResolvedValue(true);
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      { expireInvitation, forfeitOverdueMatch },
      noDeadlineLogger(),
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 25,
      matchesForfeited: 25,
      failures: 0,
    });
    expect(connect).toHaveBeenCalledTimes(52);
    expect(invitationScan.query).toHaveBeenCalledWith(expect.any(String), [25]);
    expect(matchScan.query).toHaveBeenCalledWith(expect.any(String), [25]);
    expect(expireInvitation).toHaveBeenCalledTimes(25);
    expect(forfeitOverdueMatch).toHaveBeenCalledTimes(25);
    expect(
      itemClients.every((client) => client.release.mock.calls.length === 1),
    ).toBe(true);
    expect(
      itemClients.every(
        (client) =>
          client.query.mock.calls[0]?.[0] === 'begin' &&
          client.query.mock.calls[1]?.[0] === 'commit',
      ),
    ).toBe(true);
  });

  it('commits and rolls back per item, continues after a failure, and logs no error details', async () => {
    const invitationScan = makeClient([
      { id: 'secret-invitation-id' },
      { id: 'next' },
    ]);
    const matchScan = makeClient([{ id: 'secret-match-id' }]);
    const failedInvitation = makeClient();
    const successfulInvitation = makeClient();
    const successfulMatch = makeClient();
    const { database } = makeDatabase([
      invitationScan,
      matchScan,
      failedInvitation,
      successfulInvitation,
      successfulMatch,
    ]);
    const sensitiveError = new Error(
      'token=secret-token player=secret-player invitation=secret-invitation-id',
    );
    const expireInvitation = vi
      .fn()
      .mockRejectedValueOnce(sensitiveError)
      .mockResolvedValueOnce(true);
    const forfeitOverdueMatch = vi.fn().mockResolvedValue(true);
    const logger = noDeadlineLogger();
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      { expireInvitation, forfeitOverdueMatch },
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 1,
      matchesForfeited: 1,
      failures: 1,
    });

    expect(
      failedInvitation.query.mock.calls.map(([statement]) => statement),
    ).toEqual(['begin', 'rollback']);
    expect(
      successfulInvitation.query.mock.calls.map(([statement]) => statement),
    ).toEqual(['begin', 'commit']);
    expect(
      successfulMatch.query.mock.calls.map(([statement]) => statement),
    ).toEqual(['begin', 'commit']);
    expect(failedInvitation.release).toHaveBeenCalledOnce();
    expect(successfulInvitation.release).toHaveBeenCalledOnce();
    expect(successfulMatch.release).toHaveBeenCalledOnce();
    expect(expireInvitation).toHaveBeenCalledTimes(2);
    expect(forfeitOverdueMatch).toHaveBeenCalledWith(
      successfulMatch,
      'secret-match-id',
    );
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      {},
      'Asynchronous PvP invitation deadline finalization failed.',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret-');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'secret-token',
    );
  });

  it('treats a false transition as a no-op race rather than a failure', async () => {
    const invitationScan = makeClient([{ id: 'already-expired' }]);
    const matchScan = makeClient([{ id: 'already-completed' }]);
    const invitationItem = makeClient();
    const matchItem = makeClient();
    const { database } = makeDatabase([
      invitationScan,
      matchScan,
      invitationItem,
      matchItem,
    ]);
    const logger = noDeadlineLogger();
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      {
        expireInvitation: vi.fn().mockResolvedValue(false),
        forfeitOverdueMatch: vi.fn().mockResolvedValue(false),
      },
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 0,
      matchesForfeited: 0,
      failures: 0,
    });
    expect(
      invitationItem.query.mock.calls.map(([statement]) => statement),
    ).toEqual(['begin', 'commit']);
    expect(matchItem.query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin',
      'commit',
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('releases the acquired scan client when a due-ID query fails', async () => {
    const queryError = new Error('scan failed');
    const invitationScan = makeClient();
    const failedScan = makeClient();
    failedScan.query.mockRejectedValueOnce(queryError);
    const { database } = makeDatabase([invitationScan, failedScan]);
    const logger = noDeadlineLogger();
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      {
        expireInvitation: vi.fn(),
        forfeitOverdueMatch: vi.fn(),
      },
      logger,
    );

    await expect(processor.runOnce()).rejects.toBe(queryError);
    expect(invitationScan.release).toHaveBeenCalledOnce();
    expect(failedScan.release).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('counts a per-item acquisition failure and continues with later due items', async () => {
    const invitationScan = makeClient([{ id: 'first' }, { id: 'second' }]);
    const matchScan = makeClient();
    const successfulItem = makeClient();
    let transactionConnections = 0;
    const connect = vi.fn(async () => {
      if (transactionConnections++ === 0) throw new Error('pool secret');
      return successfulItem;
    });
    const database = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(invitationScan)
        .mockResolvedValueOnce(matchScan)
        .mockImplementation(connect),
    } as unknown as AsyncPvpDatabase;
    const expireInvitation = vi.fn().mockResolvedValue(true);
    const logger = noDeadlineLogger();
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      { expireInvitation, forfeitOverdueMatch: vi.fn() },
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 1,
      matchesForfeited: 0,
      failures: 1,
    });
    expect(expireInvitation).toHaveBeenCalledOnce();
    expect(expireInvitation).toHaveBeenCalledWith(successfulItem, 'second');
    expect(successfulItem.release).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      {},
      'Asynchronous PvP invitation deadline finalization failed.',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'pool secret',
    );
  });

  it('rolls back and releases an item client when commit fails', async () => {
    const invitationScan = makeClient([{ id: 'invitation' }]);
    const matchScan = makeClient();
    const failedCommitItem = makeClient();
    failedCommitItem.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('commit failed'))
      .mockResolvedValueOnce({ rows: [] });
    const { database } = makeDatabase([
      invitationScan,
      matchScan,
      failedCommitItem,
    ]);
    const logger = noDeadlineLogger();
    const processor = createAsyncPvpDeadlineProcessor(
      database,
      {
        expireInvitation: vi.fn().mockResolvedValue(true),
        forfeitOverdueMatch: vi.fn(),
      },
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      invitationsExpired: 0,
      matchesForfeited: 0,
      failures: 1,
    });
    expect(
      failedCommitItem.query.mock.calls.map(([statement]) => statement),
    ).toEqual(['begin', 'commit', 'rollback']);
    expect(failedCommitItem.release).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      {},
      'Asynchronous PvP invitation deadline finalization failed.',
    );
  });
});
