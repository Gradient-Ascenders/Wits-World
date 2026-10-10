import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import type pg from 'pg';

import type { AsyncPvpDatabase } from '../../src/matches/asynchronous-pvp-service.js';

// Frozen pre-change SQL. Keep this independent of the combined production query.
const HEADER_SQL = `
  insert into private.async_pvp_deck_snapshots (
    id, invitation_id, player_id, participant_role, source_deck_id,
    initial_creature_card_id, created_at
  ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7)
`;
const CARDS_SQL = `
  insert into private.async_pvp_deck_snapshot_cards (
    id, snapshot_id, position, battle_card_id, source_owned_card_id,
    source_card_definition_id, category, affinity, rarity, card_snapshot
  )
  select card.id, $1::uuid, card.position, card.battle_card_id,
    card.battle_card_id, card.source_card_definition_id,
    card.category, card.affinity, card.rarity, card.card_snapshot
  from jsonb_to_recordset($2::jsonb) as card (
    id uuid, position smallint, battle_card_id uuid,
    source_card_definition_id uuid, category text, affinity text,
    rarity text, card_snapshot jsonb
  )
`;

export interface SnapshotMeasurement {
  statements: number;
  snapshotStatements: number;
  acquisitions: number;
  checkoutMs: number;
  holdMs: number;
  sqlClientMs: number;
}

export function observeSnapshotWrites(
  pool: pg.Pool,
  options: {
    legacy?: boolean;
    delayMs?: number;
    failRole?: 'challenger' | 'recipient';
  } = {},
) {
  const metrics: SnapshotMeasurement = {
    statements: 0,
    snapshotStatements: 0,
    acquisitions: 0,
    checkoutMs: 0,
    holdMs: 0,
    sqlClientMs: 0,
  };
  const snapshots: unknown[][] = [];
  const database: AsyncPvpDatabase = {
    async connect() {
      const checkoutStart = performance.now();
      const client = await pool.connect();
      metrics.acquisitions += 1;
      metrics.checkoutMs += performance.now() - checkoutStart;
      const holdStart = performance.now();
      async function execute<T extends pg.QueryResultRow>(
        statement: string,
        values?: unknown[],
      ) {
        metrics.statements += 1;
        const started = performance.now();
        try {
          const result = await client.query<T>(statement, values);
          // Explicit simulated transport, applied equally to every real SQL trip.
          if (options.delayMs) await setTimeout(options.delayMs);
          return result;
        } finally {
          metrics.sqlClientMs += performance.now() - started;
        }
      }
      return {
        async query<T extends pg.QueryResultRow>(
          statement: string,
          values?: unknown[],
        ) {
          if (!statement.includes('with inserted_snapshot as'))
            return execute<T>(statement, values);
          const parameters = [...values!];
          snapshots.push(parameters);
          if (parameters[3] === options.failRole) {
            const cards = JSON.parse(parameters[7] as string) as Array<{
              position: number;
            }>;
            cards[1]!.position = cards[0]!.position;
            parameters[7] = JSON.stringify(cards);
          }
          if (options.legacy) {
            metrics.snapshotStatements += 2;
            await execute(HEADER_SQL, parameters.slice(0, 7));
            return execute<T>(CARDS_SQL, [parameters[0], parameters[7]]);
          }
          metrics.snapshotStatements += 1;
          return execute<T>(statement, parameters);
        },
        release(error?: Error | boolean) {
          metrics.holdMs += performance.now() - holdStart;
          client.release(error);
        },
      };
    },
  };
  return { database, metrics, snapshots };
}
