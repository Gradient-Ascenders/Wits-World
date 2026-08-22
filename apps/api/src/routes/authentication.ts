import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import { InvalidDisplayNameError } from '../players/display-name.js';
import type { PlayerDisplayNameService } from '../players/player-identity.js';

interface AuthenticationRoutesOptions {
  playerDisplayNameService?: PlayerDisplayNameService;
}

const currentPlayerProperties = {
  displayName: {
    anyOf: [{ type: 'string', minLength: 2, maxLength: 32 }, { type: 'null' }],
  },
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
  requestId: {
    type: 'string',
  },
} as const;

const currentPlayerResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'id', 'role', 'lifecycleStatus', 'requestId'],
  properties: currentPlayerProperties,
} as const;

export const authenticationRoutes: FastifyPluginAsync<
  AuthenticationRoutesOptions
> = async (app, { playerDisplayNameService }) => {
  app.get(
    '/auth/me',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
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
        displayName: player.displayName,
        id: player.id,
        role: player.role,
        lifecycleStatus: player.lifecycleStatus,
        requestId: request.id,
      };
    },
  );

  if (!playerDisplayNameService) {
    return;
  }

  app.put<{ Body: { displayName: string } }>(
    '/auth/me/display-name',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'updateCurrentPlayerDisplayName',
        summary: 'Update the current player display name',
        description:
          'Updates presentation metadata for the authenticated local Wits World player.',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['displayName'],
          properties: {
            displayName: { type: 'string' },
          },
        },
        response: {
          200: currentPlayerResponse,
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

      try {
        const updatedPlayer = await playerDisplayNameService.updateDisplayName(
          player.id,
          request.body.displayName,
        );

        return {
          displayName: updatedPlayer.displayName,
          id: updatedPlayer.id,
          role: updatedPlayer.role,
          lifecycleStatus: updatedPlayer.lifecycleStatus,
          requestId: request.id,
        };
      } catch (error) {
        if (error instanceof InvalidDisplayNameError) {
          throw new ApiError({
            statusCode: 400,
            code: 'INVALID_DISPLAY_NAME',
            title: 'Invalid display name',
            detail: error.message,
          });
        }

        throw error;
      }
    },
  );
};
