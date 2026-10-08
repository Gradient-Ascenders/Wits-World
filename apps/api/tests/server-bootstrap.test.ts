import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import type { BuildAppOptions } from '../src/app.js';
import type { AccountDeletionLifecycleOptions } from '../src/players/account-deletion-lifecycle.js';
import type { createLivePvpRuntimeScheduler } from '../src/matches/live-pvp-runtime-scheduler.js';
import type { createRankedScheduler } from '../src/matches/ranked-scheduler.js';

interface GatewayCallbacks {
  onActivity: () => void;
  prepareConnection: () => Promise<void>;
}

const mocks = vi.hoisted(() => {
  const state: {
    listenError?: Error;
    appOptions?: BuildAppOptions;
    closeHook?: () => Promise<void>;
    deletionOptions?: AccountDeletionLifecycleOptions;
    gatewayOptions?: GatewayCallbacks;
    liveSchedulerOptions?: Parameters<typeof createLivePvpRuntimeScheduler>[3];
    rankedSchedulerOptions?: Parameters<typeof createRankedScheduler>[5];
  } = {};

  const database = {
    connect: vi.fn(async () => ({ query: vi.fn(), release: vi.fn() })),
    query: vi.fn(async (): Promise<{ rows: Record<string, unknown>[] }> => ({
      rows: [],
    })),
    end: vi.fn(async () => undefined),
  };
  const listenerDatabase = { end: vi.fn(async () => undefined) };
  const lifecycle = {};
  const asyncPvpService = { finalizeAccountDeletion: vi.fn(async () => {}) };
  const livePvpService = { finalizeAccountDeletion: vi.fn(async () => {}) };
  const scheduler = () => ({
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
    wake: vi.fn(),
  });
  const schedulers = {
    accountDeletionRetry: scheduler(),
    movementEvidenceCleanup: scheduler(),
    trustEvaluation: scheduler(),
    placement: scheduler(),
    asyncPvpDeadline: scheduler(),
    livePvpRuntime: scheduler(),
    ranked: scheduler(),
    cardTradeMaintenance: scheduler(),
  };
  const listener = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  const gateway = {
    closeAll: vi.fn(async () => undefined),
    connectionCount: vi.fn(() => 0),
    refreshConnections: vi.fn(async () => undefined),
  };

  return {
    state,
    database,
    listenerDatabase,
    lifecycle,
    asyncPvpService,
    livePvpService,
    schedulers,
    listener,
    gateway,
    createApp: vi.fn(),
    localRateProtection: vi.fn(() => ({ backend: 'local' })),
    upstashRateProtection: vi.fn(() => ({ backend: 'upstash' })),
    upstashActivityStore: vi.fn(() => ({ activityStore: true })),
    createCoordination: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
      observeActive: vi.fn(async () => undefined),
      confirmIdle: vi.fn(
        async (): Promise<{ idle: boolean; nextSweep?: number | boolean }> => ({
          idle: true,
        }),
      ),
    })),
    createGateway: vi.fn(
      (_service: unknown, _unused: unknown, options: GatewayCallbacks) => {
        state.gatewayOptions = options;
        return gateway;
      },
    ),
    createListener: vi.fn(() => listener),
    createLifecycle: vi.fn(
      (_database: unknown, options: AccountDeletionLifecycleOptions) => {
        state.deletionOptions = options;
        return lifecycle;
      },
    ),
    createAsyncPvp: vi.fn(() => asyncPvpService),
    createLivePvp: vi.fn(() => livePvpService),
    config: {
      host: '127.0.0.1',
      port: 4321,
      rateLimitBackend: 'local' as 'local' | 'upstash',
      gameplaySchedulerBackend: 'polling' as 'polling' | 'upstash',
      rateLimitPolicies: {},
      rateLimitTimeoutMs: 25,
      upstashRedisRestUrl: 'https://redis.example.test',
      upstashRedisRestToken: 'test-token',
      gameplaySchedulerNamespace: 'test-scheduler',
      asyncPvpCursorSigningKey: 'test-signing-key-at-least-thirty-two-bytes',
      maxPlausibleJourneySpeedMetresPerSecond: 20,
      movementEvidenceRetentionMs: 1000,
      accountDeletionRetryIntervalMs: 1000,
      movementEvidenceCleanupIntervalMs: 1000,
      trustEvaluationIntervalMs: 1000,
      asyncPvpDeadlineSweepIntervalMs: 1000,
      livePvpDeadlineSweepIntervalMs: 1000,
      livePvpTransientCleanupIntervalMs: 1000,
      rankedSweepIntervalMs: 1000,
      cardTradeMaintenanceIntervalMs: 1000,
      livePvpWebSocketUrl: 'ws://127.0.0.1:4321/api/v1/realtime/live',
    },
  };
});

vi.mock('../src/app.js', () => ({
  buildApp: mocks.createApp,
}));

vi.mock('../src/config/api.js', () => ({
  buildApiConfig: () => ({ ...mocks.config }),
}));

vi.mock('../src/config/auth.js', () => ({
  buildAuthConfig: () => ({
    domain: 'auth.example.test',
    issuer: 'https://auth.example.test/',
    audience: 'https://api.example.test',
    spaClientId: 'test-client',
    jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
  }),
}));
vi.mock('../src/config/auth-management.js', () => ({
  buildAuthManagementConfig: () => ({}),
}));
vi.mock('../src/config/cors.js', () => ({ buildCorsConfig: () => ({}) }));
vi.mock('../src/config/database.js', () => ({
  loadApiEnvironment: vi.fn(),
  buildDatabaseConfig: () => ({ connectionString: 'postgres://test/db' }),
  buildListenerDatabaseConfig: () => ({
    connectionString: 'postgres://test/listener',
  }),
}));

vi.mock('../src/database/connection.js', () => ({
  createDatabasePool: () => mocks.database,
  createListenerDatabasePool: () => mocks.listenerDatabase,
}));
vi.mock('../src/security/rate-protection.js', () => ({
  createLocalRateProtection: mocks.localRateProtection,
  createUpstashRateProtection: mocks.upstashRateProtection,
}));
vi.mock('../src/auth/auth0-management-client.js', () => ({
  createAuth0ManagementClient: () => ({}),
}));
vi.mock('../src/players/account-deletion-lifecycle.js', () => ({
  createAccountDeletionLifecycle: mocks.createLifecycle,
}));
vi.mock('../src/matches/asynchronous-pvp-service.js', () => ({
  createAsyncPvpService: mocks.createAsyncPvp,
}));
vi.mock('../src/matches/live-pvp-service.js', () => ({
  createLivePvpService: mocks.createLivePvp,
}));
vi.mock('../src/matches/gameplay-activity-store.js', () => ({
  createUpstashGameplayActivityStore: mocks.upstashActivityStore,
}));
vi.mock('../src/matches/gameplay-coordination.js', () => ({
  createGameplayCoordination: mocks.createCoordination,
  createGameplayExistingWorkGuard: () => vi.fn(),
  createGameplayMutationGuard: () => vi.fn(),
  gameplayCoordinationNamespace: () => 'derived-namespace',
}));
vi.mock('../src/matches/live-pvp-gateway.js', () => ({
  createLivePvpGateway: mocks.createGateway,
}));
vi.mock('../src/matches/live-pvp-notifications.js', () => ({
  createLivePvpNotificationListener: mocks.createListener,
}));

vi.mock('../src/players/account-deletion-retry-scheduler.js', () => ({
  createAccountDeletionRetryScheduler: () =>
    mocks.schedulers.accountDeletionRetry,
}));
vi.mock('../src/events/movement-evidence-cleanup-scheduler.js', () => ({
  createMovementEvidenceCleanupScheduler: () =>
    mocks.schedulers.movementEvidenceCleanup,
}));
vi.mock('../src/trust/trust-evaluation-scheduler.js', () => ({
  createTrustEvaluationScheduler: () => mocks.schedulers.trustEvaluation,
}));
vi.mock('../src/placement/placement-scheduler.js', () => ({
  createPlacementScheduler: () => mocks.schedulers.placement,
}));
vi.mock('../src/matches/asynchronous-pvp-deadline-scheduler.js', () => ({
  createAsyncPvpDeadlineScheduler: () => mocks.schedulers.asyncPvpDeadline,
}));
vi.mock('../src/matches/live-pvp-runtime-scheduler.js', () => ({
  createLivePvpRuntimeScheduler: (
    _processor: unknown,
    _service: unknown,
    _logger: unknown,
    options: Parameters<typeof createLivePvpRuntimeScheduler>[3],
  ) => {
    mocks.state.liveSchedulerOptions = options;
    return mocks.schedulers.livePvpRuntime;
  },
}));
vi.mock('../src/matches/ranked-scheduler.js', () => ({
  createRankedScheduler: (
    _database: unknown,
    _service: unknown,
    _reads: unknown,
    _logger: unknown,
    _interval: unknown,
    options: Parameters<typeof createRankedScheduler>[5],
  ) => {
    mocks.state.rankedSchedulerOptions = options;
    return mocks.schedulers.ranked;
  },
}));
vi.mock('../src/trading/card-trade-maintenance-scheduler.js', () => ({
  createCardTradeMaintenanceScheduler: () =>
    mocks.schedulers.cardTradeMaintenance,
}));

describe('API server bootstrap', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.state.listenError = undefined;
    mocks.state.appOptions = undefined;
    mocks.state.closeHook = undefined;
    mocks.state.deletionOptions = undefined;
    mocks.state.gatewayOptions = undefined;
    mocks.state.liveSchedulerOptions = undefined;
    mocks.state.rankedSchedulerOptions = undefined;
    mocks.database.query.mockReset();
    mocks.database.query.mockResolvedValue({ rows: [] });
    mocks.gateway.connectionCount.mockReset();
    mocks.gateway.connectionCount.mockReturnValue(0);
    mocks.config.rateLimitBackend = 'local';
    mocks.config.gameplaySchedulerBackend = 'polling';
    process.exitCode = originalExitCode;
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.stubEnv('OFFLINE_PACK_SIGNING_KEY', '');

    mocks.createApp.mockImplementation(async (options: BuildAppOptions) => {
      mocks.state.appOptions = options;
      const app = {
        log: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
        addHook: (_name: string, hook: () => Promise<void>) => {
          mocks.state.closeHook = hook;
        },
        listen: vi.fn(async () => {
          if (mocks.state.listenError) throw mocks.state.listenError;
          return 'http://127.0.0.1:4321';
        }),
        close: vi.fn(async () => {
          await mocks.state.closeHook?.();
        }),
      };
      return app;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  async function importServer() {
    await import('../src/server.js');
    return mocks.state.appOptions!;
  }

  it('uses local rate protection without creating shared coordination in polling mode', async () => {
    await importServer();

    expect(mocks.localRateProtection).toHaveBeenCalledWith(
      mocks.config.rateLimitPolicies,
    );
    expect(mocks.upstashRateProtection).not.toHaveBeenCalled();
    expect(mocks.upstashActivityStore).not.toHaveBeenCalled();
    expect(mocks.createCoordination).not.toHaveBeenCalled();
    expect(mocks.state.appOptions?.gameplayWorkers).toEqual({
      live: { wake: expect.any(Function) },
      ranked: { wake: expect.any(Function) },
    });
  });

  it('selects Upstash rate protection, activity storage, and coordinated gameplay scheduling', async () => {
    mocks.config.rateLimitBackend = 'upstash';
    mocks.config.gameplaySchedulerBackend = 'upstash';
    await importServer();

    expect(mocks.upstashRateProtection).toHaveBeenCalledWith({
      url: mocks.config.upstashRedisRestUrl,
      token: mocks.config.upstashRedisRestToken,
      timeoutMs: mocks.config.rateLimitTimeoutMs,
      policies: mocks.config.rateLimitPolicies,
    });
    expect(mocks.upstashActivityStore).toHaveBeenCalledWith(
      expect.objectContaining({
        url: mocks.config.upstashRedisRestUrl,
        token: mocks.config.upstashRedisRestToken,
        namespace: mocks.config.gameplaySchedulerNamespace,
      }),
    );
    expect(mocks.createCoordination).toHaveBeenCalledOnce();
    expect(mocks.schedulers.livePvpRuntime.start).toHaveBeenCalledOnce();
    expect(mocks.schedulers.ranked.start).toHaveBeenCalledOnce();
  });

  it('starts maintenance schedulers and closes coordinated workers, listener, gateway, and both pools', async () => {
    mocks.config.gameplaySchedulerBackend = 'upstash';
    await importServer();

    for (const scheduler of Object.values(mocks.schedulers)) {
      expect(scheduler.start).toHaveBeenCalledOnce();
    }
    const coordination = mocks.createCoordination.mock.results[0]?.value;
    const app = await mocks.createApp.mock.results[0]?.value;
    await app.close();

    expect(coordination.stop).toHaveBeenCalledOnce();
    for (const scheduler of Object.values(mocks.schedulers)) {
      expect(scheduler.stop).toHaveBeenCalledOnce();
    }
    expect(mocks.listener.stop).toHaveBeenCalledOnce();
    expect(mocks.listenerDatabase.end).toHaveBeenCalledOnce();
    expect(mocks.gateway.closeAll).toHaveBeenCalledOnce();
    expect(mocks.database.end).toHaveBeenCalledOnce();
  });

  it('wires gameplay wakes, notification connection preparation, and dependent-gameplay deletion finalization', async () => {
    await importServer();

    const workers = mocks.state.appOptions?.gameplayWorkers;
    workers!.live.wake();
    workers!.ranked.wake();
    expect(mocks.schedulers.livePvpRuntime.wake).toHaveBeenCalledOnce();
    expect(mocks.schedulers.ranked.wake).toHaveBeenCalledOnce();

    const gatewayOptions = mocks.state.gatewayOptions!;
    gatewayOptions.onActivity();
    await gatewayOptions.prepareConnection();
    expect(mocks.schedulers.livePvpRuntime.wake).toHaveBeenCalledTimes(2);
    expect(mocks.listener.start).toHaveBeenCalledWith(true);

    const client = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as pg.PoolClient;
    const requestedAt = new Date('2026-10-01T10:00:00.000Z');
    await mocks.state.deletionOptions!.finalizeDependentGameplay!(
      client,
      'player-123',
      requestedAt,
    );
    expect(mocks.asyncPvpService.finalizeAccountDeletion).toHaveBeenCalledWith(
      client,
      'player-123',
      requestedAt,
    );
    expect(mocks.livePvpService.finalizeAccountDeletion).toHaveBeenCalledWith(
      client,
      'player-123',
      requestedAt,
    );
  });

  it('reports listen failure and closes all startup resources without exiting the process', async () => {
    const startupError = new Error('port unavailable');
    mocks.state.listenError = startupError;
    await importServer();

    const app = await mocks.createApp.mock.results[0]?.value;
    expect(app.log.fatal).toHaveBeenCalledWith(
      { err: startupError },
      'Wits World API failed to start',
    );
    expect(app.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(process.exit).not.toHaveBeenCalled();
    expect(mocks.database.end).toHaveBeenCalledOnce();
    expect(mocks.listenerDatabase.end).toHaveBeenCalledOnce();
    expect(mocks.schedulers.accountDeletionRetry.stop).toHaveBeenCalledOnce();
  });

  it('keeps live work active while sockets remain and stops notifications only after the last socket closes', async () => {
    await importServer();
    const options = mocks.state.liveSchedulerOptions!;
    mocks.database.query.mockResolvedValue({ rows: [{ pending: false }] });
    mocks.gateway.connectionCount.mockReturnValue(1);

    await expect(options.hasActiveWork!()).resolves.toBe(true);
    expect(mocks.gateway.refreshConnections).toHaveBeenCalledOnce();
    await options.onWorkState!(false);
    expect(mocks.listener.start).toHaveBeenCalledOnce();
    expect(mocks.listener.stop).not.toHaveBeenCalled();

    mocks.gateway.connectionCount.mockReturnValue(0);
    await expect(options.hasActiveWork!()).resolves.toBe(false);
    await options.onWorkState!(false);
    expect(mocks.listener.stop).toHaveBeenCalledOnce();
    await options.onWorkState!(true);
    expect(mocks.listener.start).toHaveBeenCalledTimes(2);
  });

  it('uses shared idle confirmation before parking live work and advertises pending work to other instances', async () => {
    mocks.config.gameplaySchedulerBackend = 'upstash';
    await importServer();
    const options = mocks.state.liveSchedulerOptions!;
    const coordination = mocks.createCoordination.mock.results[0]!.value;
    mocks.database.query.mockResolvedValue({ rows: [{ pending: false }] });

    await expect(options.hasActiveWork!()).resolves.toBe(false);
    expect(coordination.confirmIdle).toHaveBeenCalledWith(
      'live',
      expect.any(Function),
    );
    coordination.confirmIdle.mockResolvedValueOnce({ idle: false });
    await expect(options.hasActiveWork!()).resolves.toBe(true);

    mocks.database.query.mockResolvedValue({ rows: [{ pending: true }] });
    await expect(options.hasActiveWork!()).resolves.toBe(true);
    expect(coordination.observeActive).toHaveBeenCalledWith('live', true);
    expect(mocks.gateway.refreshConnections).not.toHaveBeenCalled();
  });

  it('honours ranked boundary delays and wakes live scheduling after matchmaking creates a match', async () => {
    await importServer();
    const options = mocks.state.rankedSchedulerOptions!;
    mocks.database.query.mockResolvedValue({
      rows: [{ pending: false, delay_ms: 4500 }],
    });
    await expect(options.nextSweep!()).resolves.toBe(4500);
    options.onMatchesCreated!();
    expect(mocks.schedulers.livePvpRuntime.wake).toHaveBeenCalledOnce();
  });

  it('coordinates ranked pending work and authoritative idle boundary delays', async () => {
    mocks.config.gameplaySchedulerBackend = 'upstash';
    await importServer();
    const options = mocks.state.rankedSchedulerOptions!;
    const coordination = mocks.createCoordination.mock.results[0]!.value;
    mocks.database.query.mockResolvedValue({
      rows: [{ pending: true, delay_ms: 4500 }],
    });

    await expect(options.nextSweep!()).resolves.toBe(true);
    expect(coordination.observeActive).toHaveBeenCalledWith('ranked', true);
    expect(coordination.confirmIdle).not.toHaveBeenCalled();

    mocks.database.query.mockResolvedValue({
      rows: [{ pending: false, delay_ms: 4500 }],
    });
    coordination.confirmIdle.mockResolvedValueOnce({
      idle: true,
      nextSweep: 4500,
    });
    await expect(options.nextSweep!()).resolves.toBe(4500);
    expect(coordination.confirmIdle).toHaveBeenCalledWith(
      'ranked',
      expect.any(Function),
    );
    coordination.confirmIdle.mockResolvedValueOnce({ idle: false });
    await expect(options.nextSweep!()).resolves.toBe(true);
  });
});
