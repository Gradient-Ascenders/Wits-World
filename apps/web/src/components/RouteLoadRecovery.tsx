import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import './challenge/challenge.css';
import './route-load-recovery.css';

export function RouteLoadRecovery({
  pathname,
  onReload,
}: {
  pathname?: string;
  onReload: () => void;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <section
      className="challenge-page challenge-panel route-load-recovery"
      aria-labelledby="page-load-title"
    >
      <header className="challenge-header">
        <h1 className="status-title" id="page-load-title">
          This page needs to reload
        </h1>
      </header>
      <p>
        The files for this page could not be loaded. Your saved events and
        answers remain on this device.
      </p>
      <p role="status" className="route-load-recovery__connection">
        {online
          ? 'Reload when your connection is available, or continue with Saved play.'
          : 'You are offline. Open Saved play now, or reconnect before reloading.'}
      </p>
      <div className="state-message__actions">
        {pathname !== '/offline' && (
          <Link className="button" href="/offline">
            Saved play
          </Link>
        )}
        <button
          className={
            pathname === '/offline' ? 'button' : 'button button--quiet'
          }
          disabled={!online}
          onClick={onReload}
          type="button"
        >
          Reload this page
        </button>
      </div>
    </section>
  );
}
