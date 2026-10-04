import {
  getRequestPhaseTiming,
  timePhase,
  timeRequestStage,
} from '../request-timing.js';
import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  DeletedIdentityTokenError,
  PlayerNameConflictError,
  type PlayerIdentityService,
} from '../players/player-identity.js';
import {
  enforceRateProtection,
  type AuthenticatedRateProtection,
} from '../security/rate-protection.js';
import { isInteractivePlayerPrincipal } from './interactive-player-claims.js';

export function registerAuthorization(
  app: FastifyInstance,
  playerIdentityService: PlayerIdentityService,
  rateProtection?: AuthenticatedRateProtection,
): void {
  app.decorateRequest('player', null);

  const loadActivePlayer: FastifyInstance['loadActivePlayer'] = async (
    request,
    reply,
  ) => {
    const identity = request.auth;

    if (!identity) {
      throw new Error(
        'Authenticated request context was not set before player authorisation.',
      );
    }

    if (!isInteractivePlayerPrincipal(identity)) {
      throw new ApiError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        title: 'Authentication required',
        detail: 'An interactive player access token is required.',
      });
    }

    let player;

    try {
      player = await timeRequestStage(request, 'identity', () =>
        playerIdentityService.resolve(identity),
      );
    } catch (error) {
      if (error instanceof DeletedIdentityTokenError) {
        throw new ApiError({
          statusCode: 403,
          code: 'ACCOUNT_UNAVAILABLE',
          title: 'Account unavailable',
          detail: 'This account cannot perform application operations.',
        });
      }

      if (error instanceof PlayerNameConflictError) {
        throw new ApiError({
          statusCode: 409,
          code: 'PLAYER_NAME_CONFLICT',
          title: 'Player name conflict',
          detail:
            'This Auth0 player name is already linked to another Wits World account.',
        });
      }

      throw error;
    }

    if (player.lifecycleStatus !== 'active') {
      throw new ApiError({
        statusCode: 403,
        code: 'ACCOUNT_UNAVAILABLE',
        title: 'Account unavailable',
        detail: 'This account cannot perform application operations.',
      });
    }

    request.player = player;

    if (rateProtection) {
      await timePhase(getRequestPhaseTiming(request), 'rate_ms', () =>
        enforceRateProtection(
          request,
          reply,
          rateProtection,
          player.id,
          request.routeOptions.config.rateLimitPolicy ?? 'player-general',
          getRequestPhaseTiming(request),
        ),
      );
    }
  };

  app.decorate('loadActivePlayer', loadActivePlayer);

  app.decorate('requireActivePlayer', async (request, reply) => {
    await loadActivePlayer(request, reply);

    if (request.player?.playerName === null) {
      throw new ApiError({
        statusCode: 403,
        code: 'PLAYER_NAME_SETUP_REQUIRED',
        title: 'Player Name required',
        detail:
          'Choose a Player Name before using authenticated gameplay features.',
      });
    }
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
