import type { FastifyInstance, FastifyRequest } from 'fastify';

export const phaseTimingFields = [
  'rate_ms',
  'upstash_client_ms',
  'pool_acquire_ms',
  'begin_ms',
  'transaction_ms',
  'commit_ms',
  'rollback_ms',
  'invitation_lock_client_ms',
  'submission_lock_client_ms',
  'receipt_clock_ms',
  'trust_ms',
  'post_transaction_trust_ms',
  'trust_statement_count',
  'deck_ms',
  'snapshot_read_ms',
  'snapshot_write_ms',
  'match_construct_ms',
  'initial_match_write_ms',
  'match_insert_ms',
  'participants_insert_ms',
  'private_state_insert_ms',
  'invitation_update_ms',
  'invitation_view_ms',
  'match_response_view_ms',
  'receipt_write_ms',
  'get_locked_projection_ms',
  'get_clock_ms',
  'get_response_projection_ms',
  'get_card_presentation_ms',
  'project_match_ms',
  'sql_client_ms',
  'sql_statement_count',
  'serialize_hook_interval_ms',
  'request_residual_ms',
] as const;
export type PhaseTimingField = (typeof phaseTimingFields)[number];
export interface PhaseTimingSink {
  record(name: PhaseTimingField, value: number): void;
}
const allowedFields = new Set<string>(phaseTimingFields);

/** One collector per request; fixed numeric fields only, no SQL or identifiers. */
export function createPhaseTiming() {
  const values: Partial<Record<PhaseTimingField, number>> = {};
  return {
    record(name: PhaseTimingField, value: number) {
      if (!allowedFields.has(name) || !Number.isFinite(value) || value < 0)
        return;
      if (name.endsWith('_count') && !Number.isInteger(value)) return;
      const sum = (values[name] ?? 0) + value;
      if (Number.isFinite(sum)) values[name] = sum;
    },
    snapshot() {
      return { ...values };
    },
  };
}
function now(): number | undefined {
  try {
    return performance.now();
  } catch {
    return undefined;
  }
}
export function recordPhase(
  timing: PhaseTimingSink | undefined,
  name: PhaseTimingField,
  value: number,
) {
  try {
    timing?.record(name, value);
  } catch {
    /* Diagnostics never change the operation. */
  }
}
function finish(
  timing: PhaseTimingSink | undefined,
  name: PhaseTimingField,
  start: number | undefined,
) {
  const end = now();
  if (start !== undefined && end !== undefined)
    recordPhase(timing, name, end - start);
}
export function timePhase<T>(
  timing: PhaseTimingSink | undefined,
  name: PhaseTimingField,
  run: () => Promise<T>,
): Promise<T> {
  if (!timing) return run();
  const start = now();
  return (async () => {
    try {
      return await run();
    } finally {
      finish(timing, name, start);
    }
  })();
}
export function timePhaseSync<T>(
  timing: PhaseTimingSink | undefined,
  name: PhaseTimingField,
  run: () => T,
): T {
  if (!timing) return run();
  const start = now();
  try {
    return run();
  } finally {
    finish(timing, name, start);
  }
}
function isPhaseRoute(request: FastifyRequest) {
  const route = request.routeOptions.url?.replace(/^\/api\/v1/, '');
  return (
    (request.method === 'POST' &&
      route === '/matches/pvp/invitations/:invitationId/accept') ||
    (request.method === 'GET' && route === '/matches/pvp/:matchId')
  );
}

const timings = new WeakMap<
  FastifyRequest,
  {
    start: number;
    stages: Record<string, number>;
    phases?: ReturnType<typeof createPhaseTiming>;
    serializeStart?: number;
    emitted?: boolean;
  }
>();

export function getRequestPhaseTiming(
  request: FastifyRequest,
): PhaseTimingSink | undefined {
  return timings.get(request)?.phases;
}

/** Durations only: never record tokens, SQL, identifiers, or request bodies. */
export function registerRequestTiming(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const start = now();
    if (start !== undefined)
      timings.set(request, {
        start,
        stages: {},
        ...(isPhaseRoute(request) ? { phases: createPhaseTiming() } : {}),
      });
  });
  app.addHook('preSerialization', async (request, _reply, payload) => {
    const timing = timings.get(request);
    if (timing?.phases) timing.serializeStart = now();
    return payload;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    try {
      const timing = timings.get(request);
      const end = now();
      if (timing && end !== undefined && !timing.emitted) {
        timing.emitted = true;
        const stages = {
          ...timing.stages,
          total: end - timing.start,
        };
        if (timing.phases) {
          if (timing.serializeStart !== undefined)
            recordPhase(
              timing.phases,
              'serialize_hook_interval_ms',
              end - timing.serializeStart,
            );
          const phases = timing.phases.snapshot();
          // Disjoint top-level intervals only; child SQL/phase spans overlap.
          const allocated =
            (timing.stages.auth ?? 0) +
            (timing.stages.identity ?? 0) +
            (phases.rate_ms ?? 0) +
            (phases.pool_acquire_ms ?? 0) +
            (phases.transaction_ms ?? 0) +
            (phases.post_transaction_trust_ms ?? 0) +
            (phases.serialize_hook_interval_ms ?? 0);
          recordPhase(
            timing.phases,
            'request_residual_ms',
            Math.max(0, stages.total - allocated),
          );
        }
        reply.header(
          'Server-Timing',
          Object.entries(stages)
            .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
            .join(', '),
        );
        request.log.info(
          {
            timings: stages,
            route: request.routeOptions.url,
            ...(timing.phases
              ? {
                  phaseTimings: timing.phases.snapshot(),
                  statusCode: reply.statusCode,
                }
              : {}),
          },
          'API request timing',
        );
      }
    } catch {
      /* Diagnostic/header/logger failures must not fail the response. */
    }
    return payload;
  });
}

export async function timeRequestStage<T>(
  request: FastifyRequest,
  name: 'auth' | 'identity',
  run: () => Promise<T>,
): Promise<T> {
  const start = now();
  try {
    return await run();
  } finally {
    const timing = timings.get(request);
    const end = now();
    if (timing && start !== undefined && end !== undefined)
      timing.stages[name] = end - start;
  }
}
