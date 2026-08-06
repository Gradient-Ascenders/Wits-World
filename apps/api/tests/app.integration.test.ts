import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('Fastify API application', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a successful health response with a server request ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'client-controlled-id',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      status: string;
      service: string;
      requestId: string;
    }>();

    expect(body).toMatchObject({
      status: 'ok',
      service: 'Wits World API',
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.requestId).not.toBe('client-controlled-id');
  });

  it('registers the versioned API route prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'Wits World API',
      version: 'v1',
      requestId: expect.any(String),
    });
  });

  it('returns the shared safe error model for an unknown route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      type: 'https://wits.world/problems/not-found',
      title: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'The requested resource was not found.',
      requestId: expect.any(String),
    });
  });

  it('does not expose internal errors or stack traces', async () => {
    app.get('/test/unhandled-error', async () => {
      throw new Error('private implementation detail');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unhandled-error',
    });

    expect(response.statusCode).toBe(500);

    const body = response.json<Record<string, unknown>>();

    expect(body).toEqual({
      type: 'https://wits.world/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The server could not complete the request.',
      requestId: expect.any(String),
    });

    expect(response.body).not.toContain('private implementation detail');
    expect(response.body.toLowerCase()).not.toContain('stack');
  });

  it('includes the health endpoint in the OpenAPI document', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<string, unknown>;
    }>();

    expect(document.paths).toHaveProperty('/health');
    expect(document.paths).toHaveProperty('/api/v1/');
  });
});
