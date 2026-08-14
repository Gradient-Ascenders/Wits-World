import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  AccountDeletionCoordinatorError,
  type AccountDeletionCoordinator,
} from '../players/account-deletion-coordinator.js';

interface AccountDeletionRouteOptions {
  coordinator: AccountDeletionCoordinator;
}

interface AccountDeletionBody {
  reauthenticationToken: string;
  confirmation: string;
}

export const accountDeletionRoutes: FastifyPluginAsync<
  AccountDeletionRouteOptions
> = async (app, { coordinator }) => {
  app.post<{ Body: AccountDeletionBody }>(
    '/auth/account-deletion',
    {
      preHandler: [app.authenticate, app.requireActivePlayer],
      schema: {
        operationId: 'deleteCurrentPlayerAccount',
        summary: 'Permanently delete the current player account',
        description:
          'Requires a valid API access token, recent Auth0 reauthentication proof, and explicit permanent-deletion confirmation.',
        tags: ['Authentication'],
        security: [
          {
            bearerAuth: [],
          },
        ],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reauthenticationToken', 'confirmation'],
          properties: {
            reauthenticationToken: {
              type: 'string',
              minLength: 1,
              maxLength: 16384,
              description:
                'Fresh Auth0 ID token used only as recent-authentication proof.',
            },
            confirmation: {
              type: 'string',
              minLength: 1,
              description: 'Must exactly equal DELETE_MY_ACCOUNT.',
            },
          },
        },
        response: {
          200: deletionResponseSchema('completed'),
          202: deletionResponseSchema('retry_pending'),
        },
      },
    },
    async (request, reply) => {
      const identity = request.auth;

      if (!identity) {
        throw new Error(
          'Authenticated identity was not set by the authentication pre-handler.',
        );
      }

      try {
        const outcome = await coordinator.deleteAccount({
          identity,
          reauthenticationToken: request.body.reauthenticationToken,
          confirmation: request.body.confirmation,
        });

        const response = {
          deletionId: outcome.deletionId,
          status: outcome.status,
          requestId: request.id,
        };

        if (outcome.status === 'retry_pending') {
          return reply.status(202).send(response);
        }

        return reply.status(200).send(response);
      } catch (error) {
        if (error instanceof AccountDeletionCoordinatorError) {
          throw mapCoordinatorError(error);
        }

        throw error;
      }
    },
  );
};

function deletionResponseSchema(status: 'completed' | 'retry_pending') {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['deletionId', 'status', 'requestId'],
    properties: {
      deletionId: {
        type: 'string',
        format: 'uuid',
      },
      status: {
        type: 'string',
        const: status,
      },
      requestId: {
        type: 'string',
      },
    },
  };
}

function mapCoordinatorError(error: AccountDeletionCoordinatorError): ApiError {
  switch (error.code) {
    case 'recent_authentication_required':
      return new ApiError({
        statusCode: 401,
        code: 'RECENT_AUTHENTICATION_REQUIRED',
        title: 'Recent authentication required',
        detail:
          'Recent authentication is required for permanent account deletion.',
      });

    case 'permanent_deletion_confirmation_required':
      return new ApiError({
        statusCode: 400,
        code: 'PERMANENT_DELETION_CONFIRMATION_REQUIRED',
        title: 'Permanent deletion confirmation required',
        detail: 'Explicit permanent account deletion confirmation is required.',
      });
  }
}
