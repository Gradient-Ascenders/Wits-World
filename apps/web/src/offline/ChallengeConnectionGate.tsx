import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useOffline } from './OfflineProvider';
import '../components/challenge/challenge.css';

/** Connectivity recovery precedes authentication for a saved result link. */
export function ChallengeConnectionGate({ children }: { children: ReactNode }) {
  const { online, connectionFailed, retryConnection } = useOffline();
  if (online && !connectionFailed) return children;
  return (
    <section className="challenge-page challenge-panel">
      <h1 className="status-title">Reconnect to open this result</h1>
      <p>
        {online
          ? 'Wits World could not be reached. Retry the connection to open your result.'
          : 'You are offline. Reconnect to open the confirmed result and reward details.'}
      </p>
      <div className="offline-play__result-actions">
        <button
          className="button"
          disabled={!online}
          onClick={retryConnection}
          type="button"
        >
          Retry connection
        </button>
        <Link className="button button--quiet" href="/offline">
          Saved play
        </Link>
      </div>
    </section>
  );
}
