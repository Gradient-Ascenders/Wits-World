import type { FastifyPluginAsync } from 'fastify';
import type {
  PlayerProfileService,
  ProfileEdit,
} from '../players/player-profile.js';

const text = (maxLength: number) => ({ type: 'string', maxLength });

export const playerProfileRoutes: FastifyPluginAsync<{
  service: PlayerProfileService;
}> = async (app, { service }) => {
  const preHandler = [app.authenticate, app.requireActivePlayer];
  app.get('/profiles/me', { preHandler }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return {
      ...(await service.get(request.player!.id)),
      requestId: request.id,
    };
  });
  app.get<{ Params: { playerName: string } }>(
    '/profiles/players/:playerName',
    {
      preHandler,
      schema: {
        params: {
          type: 'object',
          required: ['playerName'],
          properties: {
            playerName: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return {
        ...(await service.get(request.player!.id, request.params.playerName)),
        requestId: request.id,
      };
    },
  );
  app.put<{ Body: ProfileEdit }>(
    '/profiles/me',
    {
      preHandler,
      bodyLimit: 250000,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: [
            'expectedVersion',
            'bio',
            'degree',
            'studyYear',
            'avatarDataUrl',
            'statusEmoji',
            'statusText',
            'statusExpiry',
            'isPublic',
            'activityVisible',
            'featuredOwnedCardIds',
          ],
          properties: {
            expectedVersion: {
              type: 'integer',
              minimum: 0,
              maximum: 2147483646,
            },
            bio: text(280),
            degree: text(100),
            studyYear: text(32),
            avatarDataUrl: { type: ['string', 'null'], maxLength: 200000 },
            statusEmoji: text(16),
            statusText: text(80),
            statusExpiry: {
              type: 'string',
              enum: ['keep', 'today', 'week', 'never'],
            },
            isPublic: { type: 'boolean' },
            activityVisible: { type: 'boolean' },
            featuredOwnedCardIds: {
              type: 'array',
              maxItems: 4,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return {
        ...(await service.save(request.player!.id, request.body)),
        requestId: request.id,
      };
    },
  );
};
