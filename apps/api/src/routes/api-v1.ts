import type { FastifyPluginAsync } from 'fastify';

export const apiV1Routes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    {
      schema: {
        operationId: 'getApiVersion',
        summary: 'Get API version information',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'version', 'requestId'],
            properties: {
              name: {
                type: 'string',
                const: 'Wits World API',
              },
              version: {
                type: 'string',
                const: 'v1',
              },
              requestId: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    async (request) => ({
      name: 'Wits World API',
      version: 'v1',
      requestId: request.id,
    }),
  );
};
