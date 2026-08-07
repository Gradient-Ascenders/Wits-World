import type { FastifyError, FastifyInstance } from 'fastify';

import { ApiError, type ApiErrorResponse } from './api-error.js';

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const response: ApiErrorResponse = {
      type: 'https://wits.world/problems/not-found',
      title: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'The requested resource was not found.',
      requestId: request.id,
    };

    return reply.status(404).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      const response: ApiErrorResponse = {
        type: error.type,
        title: error.title,
        status: error.statusCode,
        code: error.code,
        detail: error.message,
        requestId: request.id,
      };

      return reply.status(error.statusCode).send(response);
    }

    if (isValidationError(error)) {
      const response: ApiErrorResponse = {
        type: 'https://wits.world/problems/validation-error',
        title: 'Request validation failed',
        status: 400,
        code: 'VALIDATION_ERROR',
        detail: 'One or more request values are invalid.',
        requestId: request.id,
        validation: error.validation.map((failure) => ({
          field: failure.instancePath || failure.schemaPath || 'request',
          message: failure.message ?? 'Invalid value.',
        })),
      };

      return reply.status(400).send(response);
    }

    request.log.error(
      {
        err: error,
        requestId: request.id,
      },
      'Unhandled API error',
    );

    const response: ApiErrorResponse = {
      type: 'https://wits.world/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The server could not complete the request.',
      requestId: request.id,
    };

    return reply.status(500).send(response);
  });
}

type ValidationError = Error & {
  validation: NonNullable<FastifyError['validation']>;
};

function isValidationError(error: unknown): error is ValidationError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('validation' in error)) {
    return false;
  }

  return Array.isArray((error as { validation?: unknown }).validation);
}
