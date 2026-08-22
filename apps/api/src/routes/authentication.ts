import type { FastifyPluginAsync } from 'fastify';
import {
  PLAYER_NAME_ALLOWED_CHARACTERS,
  PLAYER_NAME_DISALLOWED_FORMATS,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
} from '@wits-world/account-policy';

import { ApiError } from '../errors/api-error.js';
import { GOOGLE_CONNECTION_STRATEGY } from '../auth/interactive-player-claims.js';
import {
  InvalidPlayerNameError,
  PlayerNameAlreadyAssignedError,
  PlayerNameConflictError,
  type PlayerNameSetupService,
} from '../players/player-identity.js';

const currentPlayerProperties = {
  id: {
    type: 'string',
    format: 'uuid',
  },
  role: {
    type: 'string',
    enum: ['player', 'author'],
  },
  lifecycleStatus: {
    type: 'string',
    enum: ['active', 'deletion_pending', 'deleted'],
  },
  playerName: {
    type: ['string', 'null'],
    minLength: PLAYER_NAME_MIN_LENGTH,
    maxLength: PLAYER_NAME_MAX_LENGTH,
  },
  playerNameSetupRequired: {
    type: 'boolean',
  },
  requestId: {
    type: 'string',
  },
} as const;

const currentPlayerResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'playerName',
    'playerNameSetupRequired',
    'role',
    'lifecycleStatus',
    'requestId',
  ],
  properties: currentPlayerProperties,
} as const;

interface AuthenticationRouteOptions {
  playerNameSetupService?: PlayerNameSetupService;
}

export const authenticationRoutes: FastifyPluginAsync<
  AuthenticationRouteOptions
> = async (app, { playerNameSetupService }) => {
  app.get(
    '/auth/me',
    {
      preHandler: [app.authenticate, app.loadActivePlayer],
      schema: {
        operationId: 'getCurrentPlayer',
        summary: 'Get the current player',
        description:
          'Resolves the authenticated Auth0 identity to the current local Wits World player.',
        tags: ['Authentication'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        response: {
          200: {
            ...currentPlayerResponse,
          },
          401: {
            type: 'object',
            additionalProperties: false,
            required: [
              'type',
              'title',
              'status',
              'code',
              'detail',
              'requestId',
            ],
            properties: {
              type: {
                type: 'string',
              },
              title: {
                type: 'string',
              },
              status: {
                type: 'integer',
                const: 401,
              },
              code: {
                type: 'string',
                const: 'UNAUTHORIZED',
              },
              detail: {
                type: 'string',
              },
              requestId: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    async (request) => {
      const player = request.player;

      if (!player) {
        throw new Error(
          'Active player context was not set by the authorisation pre-handler.',
        );
      }

      return {
        id: player.id,
        playerName: player.playerName,
        playerNameSetupRequired: player.playerName === null,
        role: player.role,
        lifecycleStatus: player.lifecycleStatus,
        requestId: request.id,
      };
    },
  );

  if (playerNameSetupService) {
    app.put(
      '/auth/me/player-name',
      {
        preHandler: [app.authenticate, app.loadActivePlayer],
        schema: {
          operationId: 'assignCurrentPlayerName',
          summary: 'Choose the current Google player Player Name',
          description:
            'Assigns the authenticated Google player their one-time, immutable Basic Tier Player Name.',
          tags: ['Authentication'],
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['playerName'],
            properties: {
              playerName: {
                type: 'string',
                description: `Between ${PLAYER_NAME_MIN_LENGTH} and ${PLAYER_NAME_MAX_LENGTH} characters using ${PLAYER_NAME_ALLOWED_CHARACTERS}; ${PLAYER_NAME_DISALLOWED_FORMATS}.`,
              },
            },
          },
          response: {
            200: currentPlayerResponse,
          },
        },
      },
      async (request) => {
        const identity = request.auth;
        const player = request.player;

        if (!identity || !player) {
          throw new Error(
            'Authenticated player context was not set by the pre-handlers.',
          );
        }

        if (identity.connectionStrategy !== GOOGLE_CONNECTION_STRATEGY) {
          throw new ApiError({
            statusCode: 403,
            code: 'PLAYER_NAME_SETUP_NOT_AVAILABLE',
            title: 'Player Name setup unavailable',
            detail:
              'This endpoint is only available for supported social accounts awaiting initial Player Name setup.',
          });
        }

        const body = request.body as { playerName: string };
        let updatedPlayer;

        try {
          updatedPlayer = await playerNameSetupService.assignInitialPlayerName(
            player.id,
            body.playerName,
          );
        } catch (error) {
          if (error instanceof InvalidPlayerNameError) {
            throw new ApiError({
              statusCode: 400,
              code: 'INVALID_PLAYER_NAME',
              title: 'Invalid Player Name',
              detail: error.message,
            });
          }

          if (error instanceof PlayerNameConflictError) {
            throw new ApiError({
              statusCode: 409,
              code: 'PLAYER_NAME_CONFLICT',
              title: 'Player Name unavailable',
              detail: 'That Player Name is already in use. Choose another.',
            });
          }

          if (error instanceof PlayerNameAlreadyAssignedError) {
            throw new ApiError({
              statusCode: 409,
              code: 'PLAYER_NAME_ALREADY_ASSIGNED',
              title: 'Player Name already assigned',
              detail:
                'Player Name cannot be changed after initial assignment in Basic Tier.',
            });
          }

          throw error;
        }

        return {
          id: updatedPlayer.id,
          playerName: updatedPlayer.playerName,
          playerNameSetupRequired: false,
          role: updatedPlayer.role,
          lifecycleStatus: updatedPlayer.lifecycleStatus,
          requestId: request.id,
        };
      },
    );
  }
};
