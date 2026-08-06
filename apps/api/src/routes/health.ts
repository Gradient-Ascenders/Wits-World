import type { FastifyPluginAsync } from 'fastify';

const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'service', 'requestId'],
  properties: {
    status: {
      type: 'string',
      const: 'ok',
    },
    service: {
      type: 'string',
      const: 'Wits World API',
    },
    requestId: {
      type: 'string',
    },
  },
} as const;

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        operationId: 'getHealth',
        summary: 'Check API health',
        description:
          'Confirms that the Wits World API process is running and accepting requests.',
        tags: ['System'],
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (request) => ({
      status: 'ok',
      service: 'Wits World API',
      requestId: request.id,
    }),
  );
};
