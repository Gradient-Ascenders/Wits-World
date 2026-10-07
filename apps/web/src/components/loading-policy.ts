import { useEffect, useState } from 'react';

// Visibility gates, never minimum operation durations. See docs/loading-policy.md.
export const LOADING_DELAY_MS = 150;
export const LONG_WAIT_MS = 8_000;
export const READ_TIMEOUT_MS = 20_000;

export function useLoadingPhase(active = true, resetKey?: unknown) {
  const [state, setState] = useState<{
    key: unknown;
    phase: 'hidden' | 'loading' | 'slow';
  }>({ key: resetKey, phase: 'hidden' });

  useEffect(() => {
    setState({ key: resetKey, phase: 'hidden' });
    if (!active) return;
    const visible = window.setTimeout(
      () => setState({ key: resetKey, phase: 'loading' }),
      LOADING_DELAY_MS,
    );
    const slow = window.setTimeout(
      () => setState({ key: resetKey, phase: 'slow' }),
      LONG_WAIT_MS,
    );
    return () => {
      window.clearTimeout(visible);
      window.clearTimeout(slow);
    };
  }, [active, resetKey]);

  return active && Object.is(state.key, resetKey) ? state.phase : 'hidden';
}
