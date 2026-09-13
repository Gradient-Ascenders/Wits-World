import Fastify from 'fastify';
import { expect, it } from 'vitest';
import {
  registerRequestTiming,
  timeRequestStage,
} from '../src/request-timing.js';

it('reports isolated stage timings for successful and failed requests without secrets', async () => {
  const app = Fastify();
  registerRequestTiming(app);
  app.get('/timed', async (request) => {
    await timeRequestStage(
      request,
      'auth',
      async () => new Promise((resolve) => setTimeout(resolve, 5)),
    );
    return { ok: true };
  });
  app.get('/failed', async (request) =>
    timeRequestStage(request, 'identity', async () => {
      throw new Error('failure');
    }),
  );
  try {
    const [success, failure] = await Promise.all([
      app.inject('/timed'),
      app.inject('/failed'),
    ]);
    expect(success.statusCode).toBe(200);
    expect(success.headers['server-timing']).toMatch(
      /^auth;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
    expect(failure.statusCode).toBe(500);
    expect(failure.headers['server-timing']).toMatch(
      /^identity;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
  } finally {
    await app.close();
  }
});
