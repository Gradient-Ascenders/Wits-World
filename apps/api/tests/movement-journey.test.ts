import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createMovementEvidenceService,
  type MovementJourneyOutcome,
} from '../src/events/movement-evidence.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const OTHER_EVENT_ID = '00000000-0000-4000-8000-000000000019';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000201';
const PRIOR_EVIDENCE_ID = '00000000-0000-4000-8000-000000000202';
const DECISION_ID = '00000000-0000-4000-8000-000000000301';
const RECEIVED_AT = new Date('2026-08-30T10:00:10.000Z');
const ACQUIRED_AT = new Date('2026-08-30T10:00:00.000Z');

describe('movement journey persistence', () => {
  it('creates the first reachable sample as an auditable baseline', async () => {
    const query = createJourneyQuery();
    const service = createService(query);

    await expect(
      service.evaluateJourney(validInput(), 'reachable'),
    ).resolves.toEqual({ outcome: 'baseline' });

    expect(findInsert(query, 'public.movement_evidence')?.[1]).toEqual([
      EVIDENCE_ID,
      PLAYER_ID,
      EVENT_ID,
      -26.19205,
      28.03038,
      10,
      ACQUIRED_AT,
      RECEIVED_AT,
      new Date('2026-08-31T10:00:10.000Z'),
    ]);
    expect(findDecisionValues(query)).toEqual([
      DECISION_ID,
      EVIDENCE_ID,
      null,
      'reachable',
      'baseline',
      null,
      null,
      null,
      null,
      10,
      RECEIVED_AT,
    ]);
  });

  it.each(['unreachable', 'retry'] as const)(
    'records %s evidence without making it a trusted anchor',
    async (reachability) => {
      const query = createJourneyQuery();
      const service = createService(query);

      await expect(
        service.evaluateJourney(validInput(), reachability),
      ).resolves.toEqual({ outcome: 'not_evaluated' });

      expect(findDecisionValues(query)?.slice(2, 9)).toEqual([
        null,
        reachability,
        'not_evaluated',
        null,
        null,
        null,
        null,
      ]);
      expect(executedSql(query)).not.toContain(
        'join public.movement_eligibility_decisions decision',
      );
    },
  );

  it('accepts a plausible different-event journey at the exact boundary', async () => {
    const query = createJourneyQuery({
      distanceMetres: 120,
      latestRows: [priorEvidence()],
      trustedAnchor: priorEvidence(),
    });
    const service = createService(query);

    await expect(
      service.evaluateJourney(validInput(), 'reachable'),
    ).resolves.toEqual({ outcome: 'plausible' });

    expect(findDecisionValues(query)?.slice(2, 10)).toEqual([
      PRIOR_EVIDENCE_ID,
      'reachable',
      'plausible',
      120,
      100,
      10_000,
      10,
      10,
    ]);
  });

  it('uses server receipt time so a forged acquisition time cannot make a journey plausible', async () => {
    const query = createJourneyQuery({
      distanceMetres: 120,
      latestRows: [
        priorEvidence({
          acquired_at: new Date('2026-08-30T09:58:00.000Z'),
          received_at: new Date('2026-08-30T10:00:09.000Z'),
        }),
      ],
      trustedAnchor: priorEvidence({
        acquired_at: new Date('2026-08-30T09:58:00.000Z'),
        received_at: new Date('2026-08-30T10:00:09.000Z'),
      }),
    });
    const service = createService(query);

    await expect(
      service.evaluateJourney(
        {
          ...validInput(),
          acquiredAt: new Date('2026-08-30T09:59:59.000Z'),
        },
        'reachable',
      ),
    ).resolves.toEqual({ outcome: 'too_fast' });

    expect(findDecisionValues(query)?.slice(7, 9)).toEqual([1_000, 100]);
  });

  it('does not perform event-to-event math for the same event', async () => {
    const anchor = priorEvidence({ event_id: EVENT_ID });
    const query = createJourneyQuery({
      latestRows: [anchor],
      trustedAnchor: anchor,
    });
    const service = createService(query);

    await expect(
      service.evaluateJourney(validInput(), 'reachable'),
    ).resolves.toEqual({ outcome: 'same_event' });
    expect(executedSql(query)).not.toContain('select st_distance');
  });

  it('returns an existing decision for an exact same-event retry', async () => {
    const query = createJourneyQuery({
      existingDecision: 'too_fast',
      latestRows: [
        priorEvidence({
          evidence_id: EVIDENCE_ID,
          event_id: EVENT_ID,
          acquired_at: ACQUIRED_AT,
          received_at: RECEIVED_AT,
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ],
    });
    const service = createService(query);

    await expect(
      service.evaluateJourney(validInput(), 'reachable'),
    ).resolves.toEqual({ outcome: 'too_fast' });
    expect(findInsert(query, 'public.movement_evidence')).toBeUndefined();
    expect(findInsert(query, 'public.movement_eligibility_decisions')).toBe(
      undefined,
    );
  });
});

interface JourneyQueryOptions {
  distanceMetres?: number;
  existingDecision?: MovementJourneyOutcome;
  latestRows?: Array<Record<string, unknown>>;
  trustedAnchor?: Record<string, unknown>;
}

function createJourneyQuery({
  distanceMetres = 0,
  existingDecision,
  latestRows = [],
  trustedAnchor,
}: JourneyQueryOptions = {}) {
  return vi.fn(async (statement: string) => {
    const sql = normalizeSql(statement);

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [] };
    }

    if (sql.includes('select player.id::text as player_id')) {
      return { rows: [{ player_id: PLAYER_ID }] };
    }

    if (
      sql.includes('from public.movement_evidence') &&
      sql.includes('select max(existing.acquired_at)')
    ) {
      return { rows: latestRows };
    }

    if (
      sql.includes('from public.movement_eligibility_decisions') &&
      sql.includes('where movement_evidence_id')
    ) {
      return {
        rows:
          existingDecision === undefined
            ? []
            : [{ journey_outcome: existingDecision }],
      };
    }

    if (sql.includes('join public.movement_eligibility_decisions decision')) {
      return { rows: trustedAnchor ? [trustedAnchor] : [] };
    }

    if (sql.includes('select st_distance')) {
      return { rows: [{ distance_metres: distanceMetres }] };
    }

    if (sql.startsWith('insert into')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in movement journey fixture: ${sql}`);
  });
}

function createService(query: ReturnType<typeof createJourneyQuery>) {
  const client = { query, release: vi.fn() } as unknown as pg.PoolClient;
  return createMovementEvidenceService(
    { connect: vi.fn().mockResolvedValue(client) } as unknown as Pick<
      pg.Pool,
      'connect'
    >,
    {
      createDecisionId: () => DECISION_ID,
      createId: () => EVIDENCE_ID,
      maxPlausibleJourneySpeedMetresPerSecond: 10,
    },
  );
}

function validInput() {
  return {
    playerId: PLAYER_ID,
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: ACQUIRED_AT,
    receivedAt: RECEIVED_AT,
  };
}

function priorEvidence(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evidence_id: PRIOR_EVIDENCE_ID,
    event_id: OTHER_EVENT_ID,
    latitude: -26.19205,
    longitude: 28.0292,
    accuracy_metres: 10,
    acquired_at: new Date('2026-08-30T09:59:50.000Z'),
    received_at: new Date('2026-08-30T10:00:00.000Z'),
    expires_at: new Date('2026-08-31T10:00:00.000Z'),
    ...overrides,
  };
}

function findInsert(query: ReturnType<typeof vi.fn>, table: string) {
  return query.mock.calls.find(([statement]) =>
    normalizeSql(String(statement)).startsWith(`insert into ${table}`),
  );
}

function findDecisionValues(query: ReturnType<typeof vi.fn>) {
  return findInsert(query, 'public.movement_eligibility_decisions')?.[1];
}

function executedSql(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls
    .map(([statement]) => normalizeSql(String(statement)))
    .join('\n');
}

function normalizeSql(statement: string) {
  return statement.replace(/\s+/g, ' ').trim().toLowerCase();
}
