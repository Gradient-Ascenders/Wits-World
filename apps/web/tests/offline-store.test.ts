import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthenticatedPlayerBinding } from '../src/auth/player-session-binding';
import {
  clearOfflineData,
  confirmOfflineSignOut,
  createLocalAttempt,
  finishLocalAttempt,
  readOfflineState,
  recordOfflineReceipt,
  replacePacks,
  saveLocalAnswer,
  saveOfflineSession,
  type CachedPack,
} from '../src/offline/store';

const cached: CachedPack = {
  packToken: 'signed-token',
  pack: {
    version: 1,
    packId: 'pack',
    playerId: 'player',
    issuedAt: new Date().toISOString(),
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    event: {
      eventId: 'event',
      version: 1,
      title: 'Event',
      description: null,
      latitude: 0,
      longitude: 0,
      radiusMetres: 75,
    },
    challengeId: 'challenge',
    challengeVersion: 1,
    format: 'multiple_choice',
    timeLimitSeconds: 90,
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `q${index}`,
      version: 1,
      prompt: 'Question',
      difficulty: 1,
      options: Array.from({ length: 4 }, (_, option) => ({
        id: `q${index}o${option}`,
        text: 'Option',
      })),
    })),
  },
};
const location = {
  latitude: 0,
  longitude: 0,
  accuracyMetres: 10,
  acquiredAt: new Date().toISOString(),
};
beforeEach(async () => {
  await clearOfflineData();
  localStorage.setItem('wits-world.authenticated-player-id', 'player');
  await saveOfflineSession('player', 'Player');
});
afterEach(() => vi.restoreAllMocks());
describe('durable offline state', () => {
  it('does not discard data when only the generic binding is cleared', async () => {
    await createLocalAttempt(cached, location);
    clearAuthenticatedPlayerBinding();
    localStorage.setItem('wits-world.authenticated-player-id', 'player');
    expect((await readOfflineState()).attempts).toHaveLength(1);
  });
  it('keeps unsynced work when discard is cancelled, and awaits confirmed removal', async () => {
    await createLocalAttempt(cached, location);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(await confirmOfflineSignOut()).toBe('cancelled');
    expect((await readOfflineState()).attempts).toHaveLength(1);
    confirm.mockReturnValue(true);
    expect(await confirmOfflineSignOut()).toBe('cleared');
    expect(await readOfflineState()).toEqual({
      session: undefined,
      packs: [],
      attempts: [],
      receipts: [],
    });
  });
  it.each(['read', 'delete'])(
    'allows continuing after an IndexedDB %s failure without claiming cleanup succeeded',
    async (operation) => {
      await createLocalAttempt(cached, location);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const failure = vi
        .spyOn(
          IDBObjectStore.prototype,
          operation === 'read' ? 'getAll' : 'clear',
        )
        .mockImplementation(() => {
          throw new DOMException('Storage unavailable', 'InvalidStateError');
        });
      expect(await confirmOfflineSignOut()).toBe('cleanup_failed');
      expect(confirm).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'Saved answers and precise location data may remain',
        ),
      );
      confirm.mockReturnValue(false);
      expect(await confirmOfflineSignOut()).toBe('cancelled');
      expect(localStorage.getItem('wits-world.authenticated-player-id')).toBe(
        'player',
      );
      failure.mockRestore();
      expect((await readOfflineState()).attempts).toHaveLength(1);
    },
  );
  it('rejects stale account work and clears only the departing partition', async () => {
    await replacePacks('player', [cached]);
    localStorage.setItem('wits-world.authenticated-player-id', 'other');
    await saveOfflineSession('other', 'Other');
    await expect(createLocalAttempt(cached, location)).rejects.toThrow(
      'original account',
    );
    await clearOfflineData('player');
    expect((await readOfflineState()).session?.playerId).toBe('other');
  });
  it('restores a saved answer and serializes competing tabs without overwriting the next question', async () => {
    const attempt = await createLocalAttempt(cached, location);
    const results = await Promise.allSettled([
      saveLocalAnswer(attempt.clientAttemptId, 'q0', ['q0o0']),
      saveLocalAnswer(attempt.clientAttemptId, 'q0', ['q0o1']),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await readOfflineState()).attempts[0]!.answers).toHaveLength(1);
    expect((await createLocalAttempt(cached, location)).clientAttemptId).toBe(
      attempt.clientAttemptId,
    );
  });
  it('keeps pending attempts through pack replacement and removes evidence after a receipt', async () => {
    await replacePacks('player', [cached]);
    const attempt = await createLocalAttempt(cached, location);
    const pending = await finishLocalAttempt(attempt.clientAttemptId, location);
    await replacePacks('player', []);
    expect((await readOfflineState()).attempts).toHaveLength(1);
    await recordOfflineReceipt(pending, 'accepted', 'server-attempt');
    const result = await readOfflineState();
    expect(result.attempts).toEqual([]);
    expect(result.receipts[0]).not.toHaveProperty('startLocation');
    expect(result.receipts[0]!.attemptId).toBe('server-attempt');
  });
  it('does not expose another player’s cached data', async () => {
    await createLocalAttempt(cached, location);
    localStorage.setItem('wits-world.authenticated-player-id', 'other');
    expect((await readOfflineState()).attempts).toEqual([]);
    expect((await readOfflineState()).session).toBeUndefined();
  });
});
