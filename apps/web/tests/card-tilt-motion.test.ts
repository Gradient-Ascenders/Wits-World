import { describe, expect, it } from 'vitest';

import { advanceSmoothTilt } from '../src/components/cards/useCardTilt';

describe('smooth card tilt', () => {
  it('reaches the same position and velocity at different refresh rates', () => {
    const samples = [30, 60, 144].map((fps) => {
      let state = { current: 0, velocity: 0 };
      for (let frame = 0; frame < fps / 2; frame += 1) {
        state = advanceSmoothTilt(state.current, state.velocity, 10, 1 / fps);
      }
      return state;
    });
    for (const sample of samples) {
      expect(sample.current).toBeCloseTo(samples[0]!.current, 10);
      expect(sample.velocity).toBeCloseTo(samples[0]!.velocity, 10);
    }
  });

  it('settles without bouncing and preserves motion on a direction change', () => {
    let state = { current: 0, velocity: 0 };
    for (let frame = 0; frame < 60; frame += 1) {
      const next = advanceSmoothTilt(state.current, state.velocity, 10, 1 / 60);
      expect(next.current).toBeGreaterThanOrEqual(state.current);
      expect(next.current).toBeLessThanOrEqual(10);
      state = next;
    }
    expect(state.current).toBeCloseTo(10, 6);

    const moving = advanceSmoothTilt(0, 0, 10, 1 / 60);
    const redirected = advanceSmoothTilt(
      moving.current,
      moving.velocity,
      -10,
      0,
    );
    expect(redirected.current).toBeCloseTo(moving.current, 10);
    expect(redirected.velocity).toBeCloseTo(moving.velocity, 10);
    const next = advanceSmoothTilt(
      moving.current,
      moving.velocity,
      -10,
      1 / 144,
    );
    expect(next.current).toBeGreaterThan(moving.current);
    expect(next.velocity).toBeLessThan(moving.velocity);
  });
});
