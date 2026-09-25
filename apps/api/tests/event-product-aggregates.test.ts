import { describe, expect, it, vi } from 'vitest';

import { createEventProductAnalyticsRecorder } from '../src/analytics/event-product-aggregates.js';

const EVENT_ONE = '10000000-0000-4000-8000-000000000001';
const EVENT_TWO = '10000000-0000-4000-8000-000000000002';
const ASSIGNMENT = '20000000-0000-4000-8000-000000000001';
const OBSERVED_AT = new Date('2026-09-23T10:47:12.345Z');

describe('event product aggregate recorder', () => {
  it('records one coarse discovery impression per returned active event', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ event_id: EVENT_ONE }, { event_id: EVENT_TWO }],
    });
    const recorder = createEventProductAnalyticsRecorder({ query });

    await recorder.recordViews(
      [
        { eventId: EVENT_ONE },
        { eventId: EVENT_TWO, placementAssignmentId: ASSIGNMENT },
        { eventId: EVENT_ONE },
      ],
      OBSERVED_AT,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('event_product_event_aggregates'),
      [[EVENT_ONE, EVENT_TWO], [null, ASSIGNMENT], OBSERVED_AT],
    );
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("date_trunc('hour'");
    expect(sql).toContain('view_count + 1');
    expect(sql).not.toMatch(/player|latitude|longitude/i);
  });

  it('records successful eligibility without player or coordinate data', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ event_id: EVENT_TWO }] });
    const recorder = createEventProductAnalyticsRecorder({ query });

    await recorder.recordEligibility(
      { eventId: EVENT_TWO, placementAssignmentId: ASSIGNMENT },
      OBSERVED_AT,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('eligible_count'),
      [EVENT_TWO, ASSIGNMENT, OBSERVED_AT],
    );
    expect(String(query.mock.calls[0]?.[0])).not.toMatch(
      /player_id|latitude|longitude|accuracy/i,
    );
  });

  it('fails closed inside the recorder when a supplied location cannot be resolved', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const recorder = createEventProductAnalyticsRecorder({ query });

    await expect(
      recorder.recordEligibility({ eventId: EVENT_ONE }, OBSERVED_AT),
    ).rejects.toThrow('could not resolve the event location');
  });
});
