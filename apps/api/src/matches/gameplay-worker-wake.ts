import type { FastifyInstance } from 'fastify';

export interface GameplayWorkerWakes {
  live: { wake(): void };
  ranked: { wake(): void };
}

export function registerGameplayWorkerWake(
  app: FastifyInstance,
  workers: GameplayWorkerWakes,
): void {
  app.addHook('onResponse', async (request, reply) => {
    if (!request.player || reply.statusCode < 200 || reply.statusCode >= 300)
      return;
    const path = request.routeOptions.url;
    if (
      (request.method === 'POST' &&
        (path === '/api/v1/ranked/queue' ||
          path === '/api/v1/ranked/queue/heartbeat' ||
          path === '/api/v1/ranked/proposals/:proposalId/accept' ||
          path === '/api/v1/ranked/proposals/:proposalId/decline')) ||
      (request.method === 'DELETE' && path === '/api/v1/ranked/queue')
    ) {
      workers.ranked.wake();
      if (path === '/api/v1/ranked/proposals/:proposalId/accept') {
        workers.live.wake();
      }
    } else if (
      request.method === 'POST' &&
      path === '/api/v1/matches/live/:matchId/connection-tickets'
    ) {
      workers.live.wake();
    }
  });
}
