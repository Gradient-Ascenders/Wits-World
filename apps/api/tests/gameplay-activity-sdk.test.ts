import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUpstashGameplayActivityStore,
  GameplayActivityStoreError,
} from '../src/matches/gameplay-activity-store.js';
import {
  createGameplayCoordination,
  GAMEPLAY_COORDINATION_POLL_INTERVAL_MS,
} from '../src/matches/gameplay-coordination.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  let fields: unknown = ['fixture-epoch', '2', '0', '3', '0'];
  let failure: unknown;
  const commands: unknown[][] = [];
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (failure) throw failure;
    const body = JSON.parse(String(init?.body)) as unknown[];
    const pipelined = Array.isArray(body[0]);
    const batch = pipelined ? (body as unknown[][]) : [body];
    const responses = batch.map((command) => {
      commands.push(command);
      if (command[0] === 'hmget') return { result: fields };
      const script = String(command[1]);
      if (script.includes("return redis.call('HMGET'")) {
        fields = ['initialized-epoch', '0', '1', '0', '1'];
        return { result: fields };
      }
      return { result: script.includes('ZREMRANGEBYSCORE') ? 0 : 1 };
    });
    return new Response(JSON.stringify(pipelined ? responses : responses[0]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', transport);
  // Construct the real SDK exactly as production does; intercept only transport.
  const store = createUpstashGameplayActivityStore({
    url: 'https://fixture.invalid',
    token: 'synthetic-fixture',
    namespace: 'sdk_fixture',
    timeoutMs: 750,
  });
  return {
    store,
    commands,
    transport,
    setFields(value: unknown) {
      fields = value;
    },
    setFailure(value: unknown) {
      failure = value;
    },
  };
}

describe('gameplay activity real SDK wire responses', () => {
  it('maps the requested field order without deserialization', async () => {
    const { store, commands } = setup();
    await expect(store.read()).resolves.toEqual({
      epoch: 'fixture-epoch',
      live: { revision: 2, active: false },
      ranked: { revision: 3, active: false },
    });
    expect(commands).toEqual([
      [
        'hmget',
        'ww:gameplay:v1:sdk_fixture:state',
        'epoch',
        'live_revision',
        'live_active',
        'ranked_revision',
        'ranked_active',
      ],
    ]);
  });

  it('initializes an entirely missing hash with both workers active', async () => {
    const fixture = setup();
    fixture.setFields([null, null, null, null, null]);
    await expect(fixture.store.read()).resolves.toEqual({
      epoch: 'initialized-epoch',
      live: { revision: 0, active: true },
      ranked: { revision: 0, active: true },
    });
    expect(fixture.commands.map((command) => command[0])).toEqual([
      'hmget',
      'eval',
    ]);
  });

  it.each([
    [],
    ['e', '0', '0', '0'],
    ['e', '0', '0', '0', '0', 'extra'],
    [null, '2', '0', '3', '0'],
    ['e', null, '0', '0', '0'],
    ['e', '0', null, '0', '0'],
    ['', '0', '0', '0', '0'],
    ['e', '-1', '0', '0', '0'],
    ['e', '0', 'true', '0', '0'],
    ['e', '0', '0', '9007199254740992', '0'],
  ])('rejects malformed state %j without initialization', async (...values) => {
    const fixture = setup();
    fixture.setFields(values);
    await expect(fixture.store.read()).rejects.toMatchObject({
      category: 'invalid_response',
    });
    expect(fixture.commands).toHaveLength(1);
  });

  it.each([
    [new Error('private endpoint and token'), 'transport'],
    [new DOMException('private cancellation', 'AbortError'), 'transport'],
    [new DOMException('private timeout', 'TimeoutError'), 'timeout'],
  ])(
    'sanitizes transport errors and recovers on a later read',
    async (error, category) => {
      const fixture = setup();
      fixture.setFailure(error);
      const failed = await fixture.store.read().catch((error) => error);
      expect(failed).toBeInstanceOf(GameplayActivityStoreError);
      expect(failed.category).toBe(category);
      expect(failed.message).toBe('Gameplay activity store unavailable.');
      expect(failed.cause).toBeUndefined();
      fixture.setFailure(undefined);
      await expect(fixture.store.read()).resolves.toMatchObject({
        epoch: 'fixture-epoch',
      });
    },
  );

  it('recovers idle confirmation and monitoring using real SDK responses', async () => {
    vi.useFakeTimers();
    const fixture = setup();
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ acquired: true }] }),
      release: vi.fn(),
    };
    const database = { connect: vi.fn().mockResolvedValue(client) };
    const wakes = { live: { wake: vi.fn() }, ranked: { wake: vi.fn() } };
    const logger = { error: vi.fn() };
    const coordination = createGameplayCoordination(
      database,
      fixture.store,
      wakes,
      logger,
    );
    fixture.setFields(['broken']);
    await expect(
      coordination.confirmIdle('live', async () => false),
    ).resolves.toEqual({ idle: false, nextSweep: true });
    expect(logger.error).toHaveBeenLastCalledWith(
      {
        worker: 'live',
        coordination_stage: 'read_state',
        activity_error_category: 'invalid_response',
      },
      expect.any(String),
    );
    fixture.setFields(['recovered', '2', '0', '3', '0']);
    await expect(
      coordination.confirmIdle('live', async () => false),
    ).resolves.toEqual({ idle: true, nextSweep: false });
    expect(client.release).toHaveBeenCalledTimes(2);
    fixture.setFailure(new Error('private token'));
    coordination.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenLastCalledWith(
      {
        coordination_stage: 'read_state',
        activity_error_category: 'transport',
      },
      expect.any(String),
    );
    wakes.live.wake.mockClear();
    wakes.ranked.wake.mockClear();
    fixture.setFailure(undefined);
    await vi.advanceTimersByTimeAsync(GAMEPLAY_COORDINATION_POLL_INTERVAL_MS);
    expect(wakes.live.wake).toHaveBeenCalledOnce();
    expect(wakes.ranked.wake).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    await coordination.stop();
  });
});
