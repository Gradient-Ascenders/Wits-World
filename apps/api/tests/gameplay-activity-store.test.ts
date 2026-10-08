import { describe, expect, it, vi } from 'vitest';

import {
  createUpstashGameplayActivityStore,
  type GameplayActivitySnapshot,
  type UpstashGameplayActivityStoreOptions,
} from '../src/matches/gameplay-activity-store.js';

const options = {
  url: 'https://redis.example.test',
  token: 'private-token',
  namespace: 'test_namespace-1',
  timeoutMs: 750,
};

function setup({
  hmget = vi.fn().mockResolvedValue({
    epoch: 'epoch-1',
    live_revision: '2',
    live_active: '1',
    ranked_revision: 3,
    ranked_active: 0,
  }),
  evalResult = 1,
}: {
  hmget?: ReturnType<typeof vi.fn>;
  evalResult?: unknown;
} = {}) {
  const evalScript = vi.fn().mockResolvedValue(evalResult);
  const redis = { eval: evalScript, hmget } as unknown as NonNullable<
    UpstashGameplayActivityStoreOptions['redis']
  >;
  const store = createUpstashGameplayActivityStore({ ...options, redis });
  return { store, hmget, evalScript };
}

const snapshot: GameplayActivitySnapshot = {
  epoch: 'epoch-1',
  live: { revision: 2, active: true },
  ranked: { revision: 3, active: false },
};

describe('Upstash gameplay activity store', () => {
  it('validates namespace and positive safe timeout intervals', () => {
    for (const namespace of ['', 'has space', 'x'.repeat(81), 'bad/path']) {
      expect(() =>
        createUpstashGameplayActivityStore({ ...options, namespace }),
      ).toThrow('Invalid gameplay activity namespace.');
    }

    for (const timeoutMs of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createUpstashGameplayActivityStore({ ...options, timeoutMs }),
      ).toThrow('Invalid gameplay activity timeout.');
    }
    for (const orphanAfterMs of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createUpstashGameplayActivityStore({ ...options, orphanAfterMs }),
      ).toThrow('Invalid gameplay activity orphan interval.');
    }
  });

  it('reads and decodes existing Redis hash fields without initializing state', async () => {
    const { store, hmget, evalScript } = setup();

    await expect(store.read()).resolves.toEqual(snapshot);
    expect(hmget).toHaveBeenCalledWith(
      'ww:gameplay:v1:test_namespace-1:state',
      'epoch',
      'live_revision',
      'live_active',
      'ranked_revision',
      'ranked_active',
    );
    expect(evalScript).not.toHaveBeenCalled();
  });

  it('initializes a missing hash through eval and decodes its ordered response', async () => {
    const hmget = vi.fn().mockResolvedValue({ epoch: null });
    const { store, evalScript } = setup({
      hmget,
      evalResult: ['epoch-new', '0', 0, '0', 1],
    });

    await expect(store.read()).resolves.toEqual({
      epoch: 'epoch-new',
      live: { revision: 0, active: false },
      ranked: { revision: 0, active: true },
    });
    expect(evalScript).toHaveBeenCalledOnce();
    const [script, keys, args] = evalScript.mock.calls[0]!;
    expect(script).toContain("redis.call('HMGET'");
    expect(keys).toEqual([
      'ww:gameplay:v1:test_namespace-1:state',
      'ww:gameplay:v1:test_namespace-1:live',
      'ww:gameplay:v1:test_namespace-1:ranked',
    ]);
    expect(args).toHaveLength(1);
    expect(args[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('rejects malformed hash fields and initialization provider responses', async () => {
    for (const malformed of [
      {
        epoch: '',
        live_revision: '0',
        live_active: '0',
        ranked_revision: '0',
        ranked_active: '0',
      },
      {
        epoch: 'e',
        live_revision: '-1',
        live_active: '0',
        ranked_revision: '0',
        ranked_active: '0',
      },
      {
        epoch: 'e',
        live_revision: '1.5',
        live_active: '0',
        ranked_revision: '0',
        ranked_active: '0',
      },
      {
        epoch: 'e',
        live_revision: '0',
        live_active: 'true',
        ranked_revision: '0',
        ranked_active: '0',
      },
      {
        epoch: 'e',
        live_revision: '0',
        live_active: '0',
        ranked_revision: '9007199254740992',
        ranked_active: '0',
      },
      {
        epoch: 'e',
        live_revision: '0',
        live_active: '0',
        ranked_revision: '0',
        ranked_active: null,
      },
    ]) {
      await expect(
        setup({ hmget: vi.fn().mockResolvedValue(malformed) }).store.read(),
      ).rejects.toThrow('Invalid gameplay activity store response.');
    }

    for (const evalResult of [
      null,
      [],
      ['e', '0', '0', '0'],
      ['e', '0', '0', '0', '0', 'extra'],
      [null, '0', '0', '0', '0'],
    ]) {
      await expect(
        setup({
          hmget: vi.fn().mockResolvedValue(null),
          evalResult,
        }).store.read(),
      ).rejects.toThrow('Invalid gameplay activity store response.');
    }
  });

  it('converts rejected reads, timeouts, and eval failures to a credential-free error', async () => {
    const readFailure = setup({
      hmget: vi
        .fn()
        .mockRejectedValue(new Error('private-token at redis.example.test')),
    });
    await expect(readFailure.store.read()).rejects.toThrow(
      'Gameplay activity store unavailable.',
    );
    await expect(readFailure.store.read()).rejects.not.toThrow('private-token');

    const timeout = new DOMException('private timeout details', 'TimeoutError');
    const evalFailure = setup({
      hmget: vi.fn().mockResolvedValue(null),
      evalResult: undefined,
    });
    evalFailure.evalScript.mockRejectedValue(timeout);
    await expect(evalFailure.store.read()).rejects.toThrow(
      'Gameplay activity store unavailable.',
    );

    const operationFailure = setup();
    operationFailure.evalScript.mockRejectedValue(new Error('provider detail'));
    await expect(operationFailure.store.markActive('live')).rejects.toThrow(
      'Gameplay activity store unavailable.',
    );
  });

  it('validates workers, non-empty unique worker lists, tokens, and idle snapshots before Redis calls', async () => {
    const { store, evalScript } = setup();

    await expect(store.markActive('unknown' as 'live')).rejects.toThrow(
      'Invalid gameplay activity worker.',
    );
    await expect(store.removeAbandoned('unknown' as 'ranked')).rejects.toThrow(
      'Invalid gameplay activity worker.',
    );
    await expect(
      store.tryIdle('live', null as unknown as GameplayActivitySnapshot),
    ).rejects.toThrow('Invalid gameplay activity snapshot.');
    await expect(
      store.tryIdle('ranked', {
        ...snapshot,
        live: { revision: -1, active: false },
      }),
    ).rejects.toThrow('Invalid gameplay activity snapshot.');

    for (const workers of [[], ['live', 'live'], ['other']]) {
      await expect(store.begin(workers as never, 'token')).rejects.toThrow(
        workers.length === 0
          ? 'Gameplay activity workers must be non-empty.'
          : workers[0] === 'live' && workers.length === 2
            ? 'Gameplay activity workers must be unique.'
            : 'Invalid gameplay activity worker.',
      );
    }
    for (const token of ['', 'has space', 'x'.repeat(129), 'slash/token']) {
      await expect(store.contains(['live'], token)).rejects.toThrow(
        'Invalid gameplay activity token.',
      );
    }
    expect(evalScript).not.toHaveBeenCalled();
  });

  it('maps both Redis boolean encodings for contains and idle compare-and-set results', async () => {
    const { store, evalScript } = setup({ evalResult: '1' });
    await expect(store.contains(['live'], 'intent-1')).resolves.toBe(true);
    evalScript.mockResolvedValueOnce(0);
    await expect(store.contains(['live'], 'intent-2')).resolves.toBe(false);
    evalScript.mockResolvedValueOnce(1);
    await expect(store.tryIdle('ranked', snapshot)).resolves.toBe(true);
    evalScript.mockResolvedValueOnce('0');
    await expect(store.tryIdle('live', snapshot)).resolves.toBe(false);

    for (const invalidResult of [true, 2, 'true', null]) {
      evalScript.mockResolvedValueOnce(invalidResult);
      await expect(store.contains(['ranked'], 'intent-3')).rejects.toThrow(
        'Invalid gameplay activity store response.',
      );
    }
  });

  it('returns validated abandonment counts and rejects malformed provider counts', async () => {
    const { store, evalScript } = setup({ evalResult: '4' });
    await expect(store.removeAbandoned('ranked')).resolves.toBe(4);
    evalScript.mockResolvedValueOnce(0);
    await expect(store.removeAbandoned('live')).resolves.toBe(0);

    for (const invalidCount of [
      -1,
      1.5,
      '1.5',
      'nope',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      evalScript.mockResolvedValueOnce(invalidCount);
      await expect(store.removeAbandoned('live')).rejects.toThrow(
        'Invalid gameplay activity store response.',
      );
    }
  });

  it('sends canonical worker order and confines lifecycle operations to their Redis keys and arguments', async () => {
    const { store, evalScript } = setup();

    await store.markActive('ranked');
    const [markScript, markKeys, markArgs] = evalScript.mock.calls[0]!;
    expect(markScript).toContain("kind .. '_active'");
    expect(markKeys).toEqual([
      'ww:gameplay:v1:test_namespace-1:state',
      'ww:gameplay:v1:test_namespace-1:live',
      'ww:gameplay:v1:test_namespace-1:ranked',
    ]);
    expect(markArgs).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
      'ranked',
    ]);

    await store.begin(['ranked', 'live'], 'write_1');
    await store.contains(['ranked', 'live'], 'write_1');
    await store.finish(['ranked', 'live'], 'write_1');
    for (const callIndex of [1, 2, 3]) {
      const [script, keys, args] = evalScript.mock.calls[callIndex]!;
      expect(keys).toEqual(markKeys);
      expect(args.slice(1)).toEqual(['write_1', 'live', 'ranked']);
      expect(script).toContain("redis.call('HGET'");
    }
    expect(evalScript.mock.calls[1]![0]).toContain("redis.call('ZADD'");
    expect(evalScript.mock.calls[2]![0]).toContain("redis.call('ZSCORE'");
    expect(evalScript.mock.calls[3]![0]).toContain("redis.call('ZREM'");

    await store.tryIdle('live', snapshot);
    const [idleScript, idleKeys, idleArgs] = evalScript.mock.calls[4]!;
    expect(idleScript).toContain("redis.call('ZCARD'");
    expect(idleKeys).toEqual(markKeys);
    expect(idleArgs.slice(1)).toEqual(['live', 'epoch-1', '2']);

    await store.removeAbandoned('ranked');
    const [abandonScript, abandonKeys, abandonArgs] = evalScript.mock.calls[5]!;
    expect(abandonScript).toContain("redis.call('ZREMRANGEBYSCORE'");
    expect(abandonKeys).toEqual(markKeys);
    expect(abandonArgs.slice(1)).toEqual(['ranked', '120000']);
    expect(evalScript).toHaveBeenCalledTimes(6);
  });
});
