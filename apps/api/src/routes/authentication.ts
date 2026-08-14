import type { FastifyPluginAsync } from 'fastify';

export const authenticationRoutes: FastifyPluginAsync = async (app) => {
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
            type: 'object',
            additionalProperties: false,
            required: ['id', 'role', 'lifecycleStatus', 'requestId'],
            properties: {
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
            },
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
        role: player.role,
        lifecycleStatus: player.lifecycleStatus,
        requestId: request.id,
      };
    },
  );
};
