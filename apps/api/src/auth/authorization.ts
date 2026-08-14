import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import type { PlayerIdentityService } from '../players/player-identity.js';

export function registerAuthorization(
  app: FastifyInstance,
  playerIdentityService: PlayerIdentityService,
): void {
  app.decorateRequest('player', null);

  app.decorate('requireActivePlayer', async (request) => {
    const identity = request.auth;

    if (!identity) {
      throw new Error(
        'Authenticated request context was not set before player authorisation.',
      );
    }

    const player = await playerIdentityService.resolve(identity);

    if (player.lifecycleStatus !== 'active') {
      throw new ApiError({
        statusCode: 403,
        code: 'ACCOUNT_UNAVAILABLE',
        title: 'Account unavailable',
        detail: 'This account cannot perform application operations.',
      });
    }

    request.player = player;
  });

  app.decorate('requireAuthor', async (request) => {
    const player = request.player;

    if (!player) {
      throw new Error(
        'Active player context was not set before authorisation.',
      );
    }

    if (player.role !== 'author') {
      throw new ApiError({
        statusCode: 403,
        code: 'AUTHOR_REQUIRED',
        title: 'Author access required',
        detail: 'This operation requires the Author role.',
      });
    }
  });
}
