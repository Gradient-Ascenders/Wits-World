import { useEffect } from 'react';
import { readOfflineState } from './store';

export function ServiceWorkerUpdate() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    return registerAutomaticUpdates();
  }, []);
  return null;
}

export function registerAutomaticUpdates(
  reload = () => window.location.reload(),
) {
  let active = true;
  let checking = false;
  let activating = false;
  let replacingController = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  const observed = new Set<ServiceWorker>();
  const canReplaceDocument = () =>
    ['/', '/about'].includes(window.location.pathname) &&
    !document.activeElement?.matches(
      'input, textarea, [contenteditable="true"]',
    );

  const controllerChanged = () => {
    if (active && activating) {
      activating = false;
      if (replacingController && canReplaceDocument()) reload();
      replacingController = false;
    }
  };

  const inspect = () => {
    if (!active || checking || activating || !registration?.waiting) return;
    if (retry) clearTimeout(retry);
    checking = true;
    void readOfflineState()
      .then((state) => {
        if (
          !active ||
          !registration?.waiting ||
          // Only public Home is a safe automatic document replacement boundary.
          // Author drafts, online challenges and mutations may not be in IDB.
          !canReplaceDocument() ||
          state.attempts.some((attempt) => attempt.status === 'active')
        )
          return;
        replacingController = navigator.serviceWorker.controller !== null;
        activating = true;
        registration.waiting.postMessage('ACTIVATE_UPDATE');
      })
      .catch(() => {
        // Retry quietly if storage cannot confirm that a reload is safe.
        activating = false;
        replacingController = false;
      })
      .finally(() => {
        checking = false;
        if (active && !activating && registration?.waiting)
          retry = setTimeout(inspect, 10_000);
      });
  };

  const observe = () => {
    const installing = registration?.installing;
    if (installing && !observed.has(installing)) {
      observed.add(installing);
      installing.addEventListener('statechange', inspect);
    }
    inspect();
  };

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    controllerChanged,
  );
  void navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((result) => {
      if (!active) return;
      registration = result;
      registration.addEventListener('updatefound', observe);
      observe();
    })
    .catch(() => {
      // Online use remains available when service workers are unsupported or blocked.
    });

  return () => {
    active = false;
    if (retry) clearTimeout(retry);
    registration?.removeEventListener('updatefound', observe);
    for (const worker of observed)
      worker.removeEventListener('statechange', inspect);
    navigator.serviceWorker.removeEventListener(
      'controllerchange',
      controllerChanged,
    );
  };
}
