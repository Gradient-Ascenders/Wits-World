import type { FastifyPluginAsync } from 'fastify';

export const authenticationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        operationId: 'getAuthenticatedIdentity',
        summary: 'Get the authenticated external identity',
        description:
          'Returns the validated external identity for the bearer access token.',
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
            required: ['issuer', 'subject', 'requestId'],
            properties: {
              issuer: {
                type: 'string',
              },
              subject: {
                type: 'string',
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
      const identity = request.auth;

      if (!identity) {
        throw new Error(
          'Authenticated request context was not set by the authentication pre-handler.',
        );
      }

      return {
        issuer: identity.issuer,
        subject: identity.subject,
        requestId: request.id,
      };
    },
  );
};
