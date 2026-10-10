import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';

export type GameplayWorkerKind = 'live' | 'ranked';

export interface GameplayActivitySnapshot {
  epoch: string;
  live: { revision: number; active: boolean };
  ranked: { revision: number; active: boolean };
}

export interface GameplayActivityStore {
  read(): Promise<GameplayActivitySnapshot>;
  markActive(worker: GameplayWorkerKind): Promise<void>;
  begin(workers: readonly GameplayWorkerKind[], token: string): Promise<void>;
  contains(
    workers: readonly GameplayWorkerKind[],
    token: string,
  ): Promise<boolean>;
  finish(workers: readonly GameplayWorkerKind[], token: string): Promise<void>;
  tryIdle(
    worker: GameplayWorkerKind,
    snapshot: GameplayActivitySnapshot,
  ): Promise<boolean>;
  // The caller must hold this worker's exclusive PG advisory transaction lock.
  removeAbandoned(worker: GameplayWorkerKind): Promise<number>;
}

export interface UpstashGameplayActivityStoreOptions {
  url: string;
  token: string;
  namespace: string;
  timeoutMs: number;
  orphanAfterMs?: number;
  redis?: Pick<Redis, 'eval' | 'hmget'>;
}

type GameplayActivityHashFields = {
  epoch: unknown;
  live_revision: unknown;
  live_active: unknown;
  ranked_revision: unknown;
  ranked_active: unknown;
};

const hashFields = [
  'epoch',
  'live_revision',
  'live_active',
  'ranked_revision',
  'ranked_active',
] as const;

export class GameplayActivityStoreError extends Error {
  constructor(readonly category: 'transport' | 'timeout' | 'invalid_response') {
    super(
      category === 'invalid_response'
        ? 'Invalid gameplay activity store response.'
        : 'Gameplay activity store unavailable.',
    );
    this.name = 'GameplayActivityStoreError';
  }
}

export function gameplayActivityErrorCategory(error: unknown): string {
  return error instanceof GameplayActivityStoreError
    ? error.category
    : 'unknown';
}

function transportFailure(error: unknown): GameplayActivityStoreError {
  return new GameplayActivityStoreError(
    error instanceof Error && error.name === 'TimeoutError'
      ? 'timeout'
      : 'transport',
  );
}

function normalizeHashFields(
  value: unknown,
): GameplayActivityHashFields | null {
  if (value === null) return null;
  if (Array.isArray(value)) {
    if (value.length !== hashFields.length) {
      throw new GameplayActivityStoreError('invalid_response');
    }
    if (hashFields.every((_, index) => value[index] === null)) return null;
    return Object.fromEntries(
      hashFields.map((field, index) => [field, value[index]]),
    ) as GameplayActivityHashFields;
  }
  // Support deserialized SDK/injected clients without accepting partial state.
  if (typeof value === 'object' && value !== null && 'epoch' in value) {
    const fields = value as GameplayActivityHashFields;
    if (
      fields.epoch === null &&
      hashFields.slice(1).every((field) => fields[field] == null)
    ) {
      return null;
    }
    return fields;
  }
  throw new GameplayActivityStoreError('invalid_response');
}

const ensureState = `
if redis.call('HGET', KEYS[1], 'epoch') == false then
  redis.call('HSET', KEYS[1], 'epoch', ARGV[1], 'live_revision', '0',
    'live_active', '1', 'ranked_revision', '0', 'ranked_active', '1')
end
`;

const initializeReadScript = `${ensureState}
return redis.call('HMGET', KEYS[1], 'epoch', 'live_revision',
  'live_active', 'ranked_revision', 'ranked_active')
`;

const markActiveScript = `${ensureState}
local kind = ARGV[2]
if redis.call('HGET', KEYS[1], kind .. '_active') == '1' then return 0 end
redis.call('HINCRBY', KEYS[1], kind .. '_revision', 1)
redis.call('HSET', KEYS[1], kind .. '_active', '1')
return 1
`;

const beginScript = `${ensureState}
local time = redis.call('TIME')
local score = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for i = 3, #ARGV do
  local kind = ARGV[i]
  local index = kind == 'live' and 2 or 3
  if redis.call('ZADD', KEYS[index], 'NX', score, ARGV[2]) == 1 then
    redis.call('HINCRBY', KEYS[1], kind .. '_revision', 1)
    redis.call('HSET', KEYS[1], kind .. '_active', '1')
  end
end
return 1
`;

const containsScript = `${ensureState}
for i = 3, #ARGV do
  local index = ARGV[i] == 'live' and 2 or 3
  if redis.call('ZSCORE', KEYS[index], ARGV[2]) == false then return 0 end
end
return 1
`;

const finishScript = `${ensureState}
for i = 3, #ARGV do
  local kind = ARGV[i]
  local index = kind == 'live' and 2 or 3
  if redis.call('ZREM', KEYS[index], ARGV[2]) == 1 then
    redis.call('HINCRBY', KEYS[1], kind .. '_revision', 1)
    redis.call('HSET', KEYS[1], kind .. '_active', '1')
  end
end
return 1
`;

const idleScript = `${ensureState}
local kind = ARGV[2]
local index = kind == 'live' and 2 or 3
if redis.call('HGET', KEYS[1], 'epoch') ~= ARGV[3] or
  redis.call('HGET', KEYS[1], kind .. '_revision') ~= ARGV[4] or
  redis.call('ZCARD', KEYS[index]) ~= 0 then return 0 end
redis.call('HSET', KEYS[1], kind .. '_active', '0')
return 1
`;

const removeAbandonedScript = `${ensureState}
local time = redis.call('TIME')
local cutoff = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000) - tonumber(ARGV[3])
local kind = ARGV[2]
local index = kind == 'live' and 2 or 3
local removed = redis.call('ZREMRANGEBYSCORE', KEYS[index], '-inf', cutoff)
if removed > 0 then
  redis.call('HINCRBY', KEYS[1], kind .. '_revision', 1)
  redis.call('HSET', KEYS[1], kind .. '_active', '1')
end
return removed
`;

const workerOrder: readonly GameplayWorkerKind[] = ['live', 'ranked'];

export function createUpstashGameplayActivityStore({
  url,
  token,
  namespace,
  timeoutMs,
  orphanAfterMs = 120_000,
  redis: injectedRedis,
}: UpstashGameplayActivityStoreOptions): GameplayActivityStore {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(namespace)) {
    throw new Error('Invalid gameplay activity namespace.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid gameplay activity timeout.');
  }
  if (!Number.isSafeInteger(orphanAfterMs) || orphanAfterMs <= 0) {
    throw new Error('Invalid gameplay activity orphan interval.');
  }

  const redis =
    injectedRedis ??
    new Redis({
      url,
      token,
      signal: () => AbortSignal.timeout(timeoutMs),
      retry: { retries: 0 },
      enableTelemetry: false,
      automaticDeserialization: false,
    });
  const prefix = `ww:gameplay:v1:${namespace}`;
  const keys: [string, string, string] = [
    `${prefix}:state`,
    `${prefix}:live`,
    `${prefix}:ranked`,
  ];

  async function evaluate<T>(script: string, args: string[]): Promise<T> {
    try {
      return (await redis.eval(script, keys, args)) as T;
    } catch (error) {
      throw transportFailure(error);
    }
  }

  return {
    async read() {
      let response: unknown;
      try {
        response = await redis.hmget(keys[0], ...hashFields);
      } catch (error) {
        throw transportFailure(error);
      }

      // With automaticDeserialization:false, HMGET returns its ordered wire array.
      let fields = normalizeHashFields(response);
      if (fields === null) {
        const initialized = await evaluate<unknown>(initializeReadScript, [
          randomUUID(),
        ]);
        if (!Array.isArray(initialized) || initialized.length !== 5) {
          throw new GameplayActivityStoreError('invalid_response');
        }
        fields = {
          epoch: initialized[0],
          live_revision: initialized[1],
          live_active: initialized[2],
          ranked_revision: initialized[3],
          ranked_active: initialized[4],
        };
      }

      if (typeof fields.epoch !== 'string' || fields.epoch.length === 0) {
        throw new GameplayActivityStoreError('invalid_response');
      }
      return {
        epoch: fields.epoch,
        live: {
          revision: parseRevision(fields.live_revision),
          active: parseActive(fields.live_active),
        },
        ranked: {
          revision: parseRevision(fields.ranked_revision),
          active: parseActive(fields.ranked_active),
        },
      };
    },

    async markActive(worker) {
      validateWorker(worker);
      parseBooleanResult(
        await evaluate(markActiveScript, [randomUUID(), worker]),
      );
    },

    async begin(workers, activityToken) {
      const canonicalWorkers = validateWorkers(workers);
      validateToken(activityToken);
      await evaluate(beginScript, [
        randomUUID(),
        activityToken,
        ...canonicalWorkers,
      ]);
    },

    async contains(workers, activityToken) {
      const canonicalWorkers = validateWorkers(workers);
      validateToken(activityToken);
      return parseBooleanResult(
        await evaluate(containsScript, [
          randomUUID(),
          activityToken,
          ...canonicalWorkers,
        ]),
      );
    },

    async finish(workers, activityToken) {
      const canonicalWorkers = validateWorkers(workers);
      validateToken(activityToken);
      await evaluate(finishScript, [
        randomUUID(),
        activityToken,
        ...canonicalWorkers,
      ]);
    },

    async tryIdle(worker, snapshot) {
      validateWorker(worker);
      validateSnapshot(snapshot);
      return parseBooleanResult(
        await evaluate(idleScript, [
          randomUUID(),
          worker,
          snapshot.epoch,
          String(snapshot[worker].revision),
        ]),
      );
    },

    async removeAbandoned(worker) {
      validateWorker(worker);
      const result = await evaluate<unknown>(removeAbandonedScript, [
        randomUUID(),
        worker,
        String(orphanAfterMs),
      ]);
      return parseRevision(result);
    },
  };
}

function validateWorkers(
  workers: readonly GameplayWorkerKind[],
): GameplayWorkerKind[] {
  if (!Array.isArray(workers) || workers.length === 0) {
    throw new Error('Gameplay activity workers must be non-empty.');
  }
  const unique = new Set<GameplayWorkerKind>();
  for (const worker of workers) {
    validateWorker(worker);
    if (unique.has(worker)) {
      throw new Error('Gameplay activity workers must be unique.');
    }
    unique.add(worker);
  }
  return workerOrder.filter((worker) => unique.has(worker));
}

function validateWorker(worker: GameplayWorkerKind): void {
  if (worker !== 'live' && worker !== 'ranked') {
    throw new Error('Invalid gameplay activity worker.');
  }
}

function validateToken(token: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) {
    throw new Error('Invalid gameplay activity token.');
  }
}

function validateSnapshot(snapshot: GameplayActivitySnapshot): void {
  if (
    snapshot === null ||
    typeof snapshot !== 'object' ||
    typeof snapshot.epoch !== 'string' ||
    snapshot.epoch.length === 0
  ) {
    throw new Error('Invalid gameplay activity snapshot.');
  }
  for (const worker of workerOrder) {
    const state = snapshot[worker];
    if (
      state === null ||
      typeof state !== 'object' ||
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      typeof state.active !== 'boolean'
    ) {
      throw new Error('Invalid gameplay activity snapshot.');
    }
  }
}

function parseRevision(value: unknown): number {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^\d+$/.test(value))
  ) {
    throw new GameplayActivityStoreError('invalid_response');
  }
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new GameplayActivityStoreError('invalid_response');
  }
  return revision;
}

function parseActive(value: unknown): boolean {
  if (value === '0' || value === 0) return false;
  if (value === '1' || value === 1) return true;
  throw new GameplayActivityStoreError('invalid_response');
}

function parseBooleanResult(value: unknown): boolean {
  if (value === 0 || value === '0') return false;
  if (value === 1 || value === '1') return true;
  throw new GameplayActivityStoreError('invalid_response');
}
