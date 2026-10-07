import type { FastifyInstance } from 'fastify';

export interface GameplayWorkerWakes {
  live: { wake(): void };
  ranked: { wake(): void };
}

export function registerGameplayWorkerWake(
  app: FastifyInstance,
  workers: GameplayWorkerWakes,
): void {
  app.addHook('onResponse', async (request) => {
    if (!request.player) return;
    const path = request.routeOptions.url ?? request.url.split('?')[0]!;
    if (path.startsWith('/api/v1/ranked/')) {
      workers.ranked.wake();
      // Accepting a ranked proposal may create a live match on this instance.
      workers.live.wake();
    } else if (path.startsWith('/api/v1/matches/live/')) {
      workers.live.wake();
    } else if (path.startsWith('/api/v1/territory/')) {
      workers.ranked.wake();
    }
  });
}
