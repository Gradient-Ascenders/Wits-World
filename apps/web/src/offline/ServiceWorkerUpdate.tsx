import { useEffect, useState } from 'react';
import { readOfflineState } from './store';

export function ServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const inspect = () => {
          if (active && registration.waiting) setWaiting(registration.waiting);
        };
        inspect();
        const observe = () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            inspect();
            if (active && installing.state === 'redundant')
              setMessage(
                'Offline application download failed. Reconnect and reload to try again.',
              );
          });
        };
        observe();
        registration.addEventListener('updatefound', observe);
      })
      .catch(() => {
        if (active)
          setMessage('Offline reopening is unavailable in this browser.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function update() {
    const state = await readOfflineState().catch(() => null);
    if (state?.attempts.some((attempt) => attempt.status === 'active')) {
      setMessage('Finish the active challenge before updating.');
      return;
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
    waiting?.postMessage('ACTIVATE_UPDATE');
  }
  return waiting || message ? (
    <aside className="offline-status" role="status">
      {message || 'An update is ready. Saved attempts will be retained.'}
      {waiting && (
        <button type="button" onClick={() => void update()}>
          Update Wits World
        </button>
      )}
    </aside>
  ) : null;
}
