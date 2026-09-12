import type { FastifyInstance, FastifyRequest } from 'fastify';

const timings = new WeakMap<
  FastifyRequest,
  { start: number; stages: Record<string, number> }
>();

/** Durations only: never record tokens, SQL, identifiers, or request bodies. */
export function registerRequestTiming(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    timings.set(request, { start: performance.now(), stages: {} });
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const timing = timings.get(request);
    if (timing) {
      const stages = {
        ...timing.stages,
        total: performance.now() - timing.start,
      };
      reply.header(
        'Server-Timing',
        Object.entries(stages)
          .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
          .join(', '),
      );
      request.log.info(
        { timings: stages, route: request.routeOptions.url },
        'API request timing',
      );
    }
    return payload;
  });
}

export async function timeRequestStage<T>(
  request: FastifyRequest,
  name: 'auth' | 'identity',
  run: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    const timing = timings.get(request);
    if (timing) timing.stages[name] = performance.now() - start;
  }
}
