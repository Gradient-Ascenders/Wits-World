import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsLeftRight,
  Clock,
  Plus,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import { listTrades, TradeApiError, type TradeSummary } from '../api/trades';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import './trades.css';

type InboxState =
  | { status: 'loading' }
  | {
      historyHasMore: boolean;
      historyItems: TradeSummary[];
      historyPage: number;
      openHasMore: boolean;
      openItems: TradeSummary[];
      openPage: number;
      status: 'ready';
    }
  | { error: TradeApiError; status: 'error' };

export default function TradeInboxPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const [state, setState] = useState<InboxState>({ status: 'loading' });
  const [view, setView] = useState<'open' | 'history'>('open');
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef<AbortController | null>(null);

  const loadInitial = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
    try {
      const [openResult, recentResult] = await Promise.all([
        listTrades({
          apiBaseUrl,
          getAccessToken,
          page: 1,
          pageSize: 50,
          signal: controller.signal,
          status: 'open',
        }),
        listTrades({
          apiBaseUrl,
          getAccessToken,
          page: 1,
          pageSize: 50,
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;
      setState({
        historyHasMore: recentResult.hasMore,
        historyItems: recentResult.items.filter(
          (trade) => trade.status !== 'open',
        ),
        historyPage: 1,
        openHasMore: openResult.hasMore,
        openItems: openResult.items.filter((trade) => trade.status === 'open'),
        openPage: 1,
        status: 'ready',
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          error:
            error instanceof TradeApiError
              ? error
              : new TradeApiError('unavailable'),
          status: 'error',
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [apiBaseUrl, getAccessToken]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready') return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoadingMore(true);
    const loadingOpen = view === 'open';
    const page = loadingOpen ? state.openPage + 1 : state.historyPage + 1;
    try {
      const result = await listTrades({
        apiBaseUrl,
        getAccessToken,
        page,
        pageSize: 50,
        signal: controller.signal,
        status: loadingOpen ? 'open' : undefined,
      });
      if (controller.signal.aborted) return;
      setState((current) => {
        if (current.status !== 'ready') return current;
        if (loadingOpen) {
          return {
            ...current,
            openHasMore: result.hasMore,
            openItems: [
              ...current.openItems,
              ...result.items.filter((trade) => trade.status === 'open'),
            ],
            openPage: page,
          };
        }
        return {
          ...current,
          historyHasMore: result.hasMore,
          historyItems: [
            ...current.historyItems,
            ...result.items.filter((trade) => trade.status !== 'open'),
          ],
          historyPage: page,
        };
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          error:
            error instanceof TradeApiError
              ? error
              : new TradeApiError('unavailable'),
          status: 'error',
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [apiBaseUrl, getAccessToken, state, view]);

  useEffect(() => {
    void loadInitial();
    return () => request.current?.abort();
  }, [loadInitial]);

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        description="Checking your open offers and recent trade history."
        title="Loading card trades"
      />
    );
  }

  const open = state.status === 'ready' ? state.openItems : [];
  const incoming = open.filter((trade) => trade.direction === 'received');
  const outgoing = open.filter((trade) => trade.direction === 'sent');
  const history = state.status === 'ready' ? state.historyItems : [];

  return (
    <div className="trades-page">
      <CollectionSectionNavigation />
      <header className="trades-page__header">
        <div>
          <h1>Card trades</h1>
          <p>
            Build private card-for-card offers, review every change, and keep
            ownership decisions with the server.
          </p>
        </div>
        <Link
          className="button trade-create-link"
          href="/collection/trades/new"
        >
          <Plus aria-hidden="true" size={20} />
          Start a trade
        </Link>
      </header>

      <div aria-label="Trade view" className="trade-view-switch" role="group">
        <button
          aria-pressed={view === 'open'}
          className="button button--quiet"
          onClick={() => setView('open')}
          type="button"
        >
          Open{' '}
          <span>
            {open.length}
            {state.status === 'ready' && state.openHasMore ? '+' : ''}
          </span>
        </button>
        <button
          aria-pressed={view === 'history'}
          className="button button--quiet"
          onClick={() => setView('history')}
          type="button"
        >
          History{' '}
          {state.status === 'ready' ? (
            <span>
              {history.length}
              {state.historyHasMore ? ' loaded' : ''}
            </span>
          ) : null}
        </button>
      </div>

      {state.status === 'error' ? (
        <section className="state-message state-message--error trade-state">
          <StateIcon tone="error" />
          <h2>Card trades could not be loaded</h2>
          <p>{tradeErrorCopy(state.error)}</p>
          <button
            className="button"
            onClick={() => void loadInitial()}
            type="button"
          >
            Try again
          </button>
        </section>
      ) : view === 'open' ? (
        <OpenTradeLists incoming={incoming} outgoing={outgoing} />
      ) : (
        <TradeHistoryList
          exhaustive={state.status === 'ready' && !state.historyHasMore}
          trades={history}
        />
      )}

      {state.status === 'ready' &&
      (view === 'open' ? state.openHasMore : state.historyHasMore) ? (
        <button
          className="button button--quiet trade-load-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? 'Loading more…' : 'Load more trades'}
        </button>
      ) : null}
    </div>
  );
}

function OpenTradeLists({
  incoming,
  outgoing,
}: {
  incoming: TradeSummary[];
  outgoing: TradeSummary[];
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <section className="state-message state-message--empty trade-state">
        <ArrowsLeftRight aria-hidden="true" className="state-icon" size={28} />
        <h2>No open trades</h2>
        <p>
          Start a private offer using an exact Player Name. New incoming offers
          will appear here for review.
        </p>
        <Link className="button" href="/collection/trades/new">
          Start a trade
        </Link>
      </section>
    );
  }

  return (
    <div className="trade-inbox-sections">
      <TradeList
        empty="No incoming offers need your attention."
        title="Incoming"
        trades={incoming}
      />
      <TradeList
        empty="You have no outgoing offers waiting for another player."
        title="Outgoing"
        trades={outgoing}
      />
    </div>
  );
}

function TradeHistoryList({
  exhaustive,
  trades,
}: {
  exhaustive: boolean;
  trades: TradeSummary[];
}) {
  if (trades.length === 0) {
    return (
      <section className="state-message state-message--empty trade-state">
        <Clock aria-hidden="true" className="state-icon" size={28} />
        <h2>
          {exhaustive ? 'No trade history yet' : 'No closed trades loaded yet'}
        </h2>
        <p>
          {exhaustive
            ? 'Completed, expired, declined, cancelled, and invalidated offers appear here.'
            : 'Load more trades to continue checking older results.'}
        </p>
      </section>
    );
  }
  const groups = [
    ['Completed', trades.filter((trade) => trade.status === 'completed')],
    ['Expired', trades.filter((trade) => trade.status === 'expired')],
    [
      'Other closed trades',
      trades.filter(
        (trade) => trade.status !== 'completed' && trade.status !== 'expired',
      ),
    ],
  ] as const;
  return (
    <div className="trade-inbox-sections">
      {groups.map(([title, items]) =>
        items.length > 0 ? (
          <TradeList empty="" key={title} title={title} trades={items} />
        ) : null,
      )}
    </div>
  );
}

function TradeList({
  empty,
  title,
  trades,
}: {
  empty: string;
  title: string;
  trades: TradeSummary[];
}) {
  return (
    <section className="trade-list-section">
      <div className="trade-list-section__heading">
        <h2>{title}</h2>
        <span>{trades.length}</span>
      </div>
      {trades.length > 0 ? (
        <ul className="trade-list">
          {trades.map((trade) => (
            <li key={trade.tradeId}>
              <Link
                aria-label={`${trade.direction === 'received' ? 'Incoming trade from' : 'Outgoing trade to'} ${trade.counterpartyPlayerName}, ${statusLabel(trade.status)}`}
                className="trade-summary"
                href={`/collection/trades/${trade.tradeId}`}
              >
                <span className="trade-summary__direction">
                  {trade.direction === 'received' ? (
                    <ArrowDownLeft aria-hidden="true" size={22} />
                  ) : (
                    <ArrowUpRight aria-hidden="true" size={22} />
                  )}
                </span>
                <span className="trade-summary__main">
                  <strong>{trade.counterpartyPlayerName}</strong>
                  <span>
                    Version {trade.version} · {summaryTime(trade)}
                  </span>
                </span>
                <span className={`trade-status trade-status--${trade.status}`}>
                  {statusLabel(trade.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="trade-list-section__empty">{empty}</p>
      )}
    </section>
  );
}

function summaryTime(trade: TradeSummary) {
  const value = trade.status === 'open' ? trade.expiresAt : trade.terminalAt;
  if (!value) return formatDate(trade.createdAt);
  if (trade.status !== 'open') return formatDate(value);
  const hours = Math.max(
    0,
    Math.ceil((Date.parse(value) - Date.now()) / 3_600_000),
  );
  return hours <= 1
    ? 'expires within an hour'
    : `expires in about ${hours} hours`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: TradeSummary['status']) {
  return status === 'open'
    ? 'Open'
    : status === 'completed'
      ? 'Completed'
      : status === 'declined'
        ? 'Declined'
        : status === 'cancelled'
          ? 'Cancelled'
          : status === 'expired'
            ? 'Expired'
            : 'Unavailable';
}

function tradeErrorCopy(error: TradeApiError) {
  if (error.failure === 'authorization') {
    return 'Your session needs to be refreshed before trades can be shown.';
  }
  if (error.failure === 'rate-limit') {
    return 'Trade requests are temporarily limited. Wait a moment and try again.';
  }
  return 'Check your connection and try loading your trades again.';
}
