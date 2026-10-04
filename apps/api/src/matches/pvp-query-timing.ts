import {
  recordPhase,
  timePhase,
  type PhaseTimingSink,
} from '../request-timing.js';
import type { AsyncPvpClient } from './asynchronous-pvp-service.js';

/** Only wraps a client acquired for this request; SQL/parameters pass through. */
export function timePvpClient(
  client: AsyncPvpClient,
  timing?: PhaseTimingSink,
): AsyncPvpClient {
  if (!timing) return client;
  return {
    query(statement, values) {
      recordPhase(timing, 'sql_statement_count', 1);
      return timePhase(timing, 'sql_client_ms', () =>
        client.query(statement, values),
      );
    },
    release() {
      client.release();
    },
  };
}
export function countTrustStatements(
  client: AsyncPvpClient,
  timing?: PhaseTimingSink,
): AsyncPvpClient {
  if (!timing) return client;
  return {
    query(statement, values) {
      recordPhase(timing, 'trust_statement_count', 1);
      return client.query(statement, values);
    },
    release() {
      client.release();
    },
  };
}
