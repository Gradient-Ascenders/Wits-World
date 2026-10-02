import { createAppDateTimeFormatter } from '../date-time';
import { useAuth0 } from '@auth0/auth0-react';
import {
  ArrowLeft,
  CheckCircle,
  PencilSimple,
  ShieldCheck,
  Warning,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';

import { listOwnedCards } from '../api/cards';
import {
  acceptTrade,
  acknowledgeTradeImbalance,
  cancelTrade,
  declineTrade,
  getTrade,
  listTradingCatalogue,
  type TradingCatalogueCard,
  TradeApiError,
  type CardTrade,
} from '../api/trades';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CollectionSectionNavigation } from '../components/cards/CollectionSectionNavigation';
import { PageLoadingState } from '../components/LoadingState';
import { StateIcon } from '../components/StatusMessage';
import {
  ConsentState,
  RequestedCardList,
  TradeComparison,
} from '../components/trades/TradeComparison';
import { TradeConfirmationDialog } from '../components/trades/TradeConfirmationDialog';
import { confirmAction } from '../components/AppToaster';
import './trades.css';

type DetailState =
  | { status: 'loading' }
  | { error: TradeApiError; status: 'error' }
  | { trade: CardTrade; status: 'ready' };

type Confirmation = 'accept' | 'cancel' | 'decline' | null;

export default function TradeDetailPage({
  apiBaseUrl,
}: {
  apiBaseUrl: string;
}) {
  const { tradeId = '' } = useParams<{ tradeId: string }>();
  const getAccessToken = useApiAccessToken();
  const { getIdTokenClaims, loginWithRedirect } = useAuth0();
  const [catalogue, setCatalogue] = useState<TradingCatalogueCard[]>([]);
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<TradeApiError | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reauthenticationToken, setReauthenticationToken] = useState<
    string | null
  >(null);
  const [returnedVersion, setReturnedVersion] = useState<number | null>(null);
  const [collectionRefresh, setCollectionRefresh] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const request = useRef<AbortController | null>(null);
  const collectionRequest = useRef<AbortController | null>(null);
  const acceptanceTrigger = useRef<HTMLButtonElement>(null);
  const terminalTrigger = useRef<HTMLButtonElement>(null);
  const errorHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
    setActionError(null);
    try {
      const trade = await getTrade({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        tradeId,
      });
      if (!controller.signal.aborted) setState({ status: 'ready', trade });
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
  }, [apiBaseUrl, getAccessToken, tradeId]);

  const refreshCollection = useCallback(async () => {
    collectionRequest.current?.abort();
    const controller = new AbortController();
    collectionRequest.current = controller;
    setCollectionRefresh('loading');
    try {
      await listOwnedCards({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setCollectionRefresh('ready');
    } catch {
      if (!controller.signal.aborted) setCollectionRefresh('error');
    } finally {
      if (collectionRequest.current === controller) {
        collectionRequest.current = null;
      }
    }
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    const controller = new AbortController();
    void listTradingCatalogue({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((cards) => {
        if (!controller.signal.aborted) setCatalogue(cards);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogue([]);
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      collectionRequest.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'confirm-accept') return;
    const version = Number(params.get('version'));
    window.history.replaceState({}, '', `/collection/trades/${tradeId}`);
    if (!Number.isInteger(version) || version < 1) return;
    setPendingAction('reauthenticating');
    void getIdTokenClaims()
      .then((claims) => {
        if (!claims?.__raw) throw new Error('Missing ID token');
        setReturnedVersion(version);
        setReauthenticationToken(claims.__raw);
      })
      .catch(() => {
        setActionError(new TradeApiError('recent-authentication'));
      })
      .finally(() => setPendingAction(null));
  }, [getIdTokenClaims, tradeId]);

  useEffect(() => {
    if (
      state.status !== 'ready' ||
      returnedVersion === null ||
      reauthenticationToken === null
    ) {
      return;
    }
    if (
      state.trade.version !== returnedVersion ||
      state.trade.status !== 'open'
    ) {
      setActionError(
        new TradeApiError('stale', {
          detail:
            'The offer changed while you verified your identity. Review the current version before accepting.',
        }),
      );
      setReauthenticationToken(null);
      setReturnedVersion(null);
      return;
    }
    setConfirmation('accept');
  }, [reauthenticationToken, returnedVersion, state]);

  useEffect(() => {
    if (actionError) errorHeading.current?.focus();
  }, [actionError]);

  useEffect(() => {
    if (
      state.status === 'ready' &&
      state.trade.status === 'completed' &&
      collectionRefresh === 'idle'
    ) {
      void refreshCollection();
    }
  }, [collectionRefresh, refreshCollection, state]);

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        description="Loading the latest offer."
        title="Loading card trade"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div className="trades-page">
        <CollectionSectionNavigation />
        <section className="state-message state-message--error trade-state">
          <StateIcon tone="error" />
          <h1>
            {state.error.failure === 'not-found'
              ? 'Trade unavailable'
              : 'Trade could not be loaded'}
          </h1>
          <p>
            {state.error.failure === 'not-found'
              ? 'This trade does not exist or is not available to your account.'
              : 'Check your connection and try loading the trade again.'}
          </p>
          <div className="trade-state__actions">
            <Link className="button button--quiet" href="/collection/trades">
              Back to trades
            </Link>
            {state.error.failure !== 'not-found' ? (
              <button
                className="button"
                onClick={() => void load()}
                type="button"
              >
                Try again
              </button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  const trade = state.trade;
  const open = trade.status === 'open';
  const canAccept =
    open &&
    trade.complete &&
    (!trade.imbalanceWarningRequired || trade.self.imbalanceAcknowledged) &&
    !trade.self.accepted;

  async function applyMutation(
    action: 'accept' | 'acknowledge' | 'cancel' | 'decline',
  ) {
    if (state.status !== 'ready') return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setPendingAction(action);
    setActionError(null);
    let reconciliationError: TradeApiError | null = null;
    try {
      const base = {
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        submissionId: crypto.randomUUID(),
        tradeId,
      };
      const updated =
        action === 'accept'
          ? await acceptTrade({
              ...base,
              expectedVersion: trade.version,
              reauthenticationToken: reauthenticationToken!,
            })
          : action === 'acknowledge'
            ? await acknowledgeTradeImbalance({
                ...base,
                expectedVersion: trade.version,
              })
            : action === 'cancel'
              ? await cancelTrade(base)
              : await declineTrade(base);
      if (controller.signal.aborted) return;
      setState({ status: 'ready', trade: updated });
      setAcknowledged(false);
      setConfirmation(null);
      setReauthenticationToken(null);
      setReturnedVersion(null);
      confirmAction(actionSuccessCopy(action, updated));
    } catch (error) {
      if (!controller.signal.aborted) {
        const tradeError =
          error instanceof TradeApiError
            ? error
            : new TradeApiError('unavailable');
        setConfirmation(null);
        if (
          tradeError.failure === 'stale' ||
          tradeError.failure === 'not-open' ||
          tradeError.failure === 'copy-conflict'
        ) {
          reconciliationError = tradeError;
        } else {
          setActionError(tradeError);
        }
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPendingAction(null);
    }
    if (reconciliationError && !controller.signal.aborted) {
      await load();
      setActionError(reconciliationError);
    }
  }

  async function startAcceptance() {
    setPendingAction('reauthenticating');
    setActionError(null);
    try {
      await loginWithRedirect({
        appState: {
          returnTo: `/collection/trades/${trade.tradeId}?action=confirm-accept&version=${trade.version}`,
        },
        authorizationParams: { max_age: 0, prompt: 'login' },
      });
    } catch {
      setActionError(new TradeApiError('recent-authentication'));
      setPendingAction(null);
    }
  }

  return (
    <div className="trades-page trade-detail-page">
      <CollectionSectionNavigation />
      <Link className="trade-back-link" href="/collection/trades">
        <ArrowLeft aria-hidden="true" size={18} />
        All trades
      </Link>

      <header className="trade-detail-header">
        <div>
          <h1>Trade with {trade.counterpartyPlayerName}</h1>
        </div>
        <span className={`trade-status trade-status--${trade.status}`}>
          {statusLabel(trade.status)}
        </span>
      </header>

      <section
        aria-label={`Trade version ${trade.version}`}
        className={`trade-version-strip${actionError?.failure === 'stale' ? ' trade-version-strip--changed' : ''}`}
      >
        <div>
          <strong>Version {trade.version}</strong>
          <span>
            {open
              ? `Expires ${formatDate(trade.expiresAt)}`
              : terminalCopy(trade)}
          </span>
        </div>
        <div className="trade-consent-row">
          <ConsentState accepted={trade.self.accepted} label="You" />
          <ConsentState
            accepted={trade.counterparty.accepted}
            label={trade.counterpartyPlayerName}
          />
        </div>
      </section>

      {actionError ? (
        <section
          className="state-message state-message--error trade-action-error"
          role="alert"
        >
          <h2 ref={errorHeading} tabIndex={-1}>
            {actionErrorTitle(actionError)}
          </h2>
          <p>{actionErrorCopy(actionError)}</p>
          {actionError.options.requestId ? (
            <small>Support reference: {actionError.options.requestId}</small>
          ) : null}
        </section>
      ) : null}

      {trade.status === 'completed' ? (
        <section
          className="trade-completed"
          aria-labelledby="trade-completed-title"
        >
          <CheckCircle aria-hidden="true" size={30} weight="fill" />
          <div>
            <h2 id="trade-completed-title">Trade completed</h2>
            <p>
              Completed{' '}
              {formatDate(trade.settlement?.completedAt ?? trade.terminalAt!)}.
            </p>
            {collectionRefresh === 'loading' ? (
              <p role="status">Refreshing your collection…</p>
            ) : null}
            {collectionRefresh === 'ready' ? (
              <p role="status">Your collection is up to date.</p>
            ) : null}
            {collectionRefresh === 'error' ? (
              <p role="alert">
                The trade completed, but your collection could not be refreshed.
                <button
                  className="button button--quiet"
                  onClick={() => void refreshCollection()}
                  type="button"
                >
                  Refresh collection
                </button>
              </p>
            ) : null}
            <Link className="button" href="/collection">
              View collection
            </Link>
          </div>
        </section>
      ) : null}

      <TradeComparison
        catalogue={catalogue}
        counterpartyLabel={trade.counterpartyPlayerName}
        counterpartyOffered={trade.counterparty.offeredCopies}
        counterpartyPoints={trade.counterparty.rarityPoints}
        selfOffered={trade.self.offeredCopies}
        selfPoints={trade.self.rarityPoints}
      />

      <div className="trade-request-grid">
        <RequestedCardList
          catalogue={catalogue}
          definitions={trade.self.requestedDefinitions}
          label="You requested"
        />
        <RequestedCardList
          catalogue={catalogue}
          definitions={trade.counterparty.requestedDefinitions}
          label={`${trade.counterpartyPlayerName} requested`}
        />
      </div>

      {trade.imbalanceWarningRequired ? (
        <section
          className="trade-imbalance"
          aria-labelledby="trade-imbalance-title"
        >
          <Warning aria-hidden="true" size={24} />
          <div>
            <h2 id="trade-imbalance-title">Rarity warning</h2>
            <p>
              Rarity points differ. They aren’t prices. Both players must
              confirm they’ve reviewed this warning.
            </p>
            {!trade.self.imbalanceAcknowledged && open ? (
              <label>
                <input
                  checked={acknowledged}
                  disabled={pendingAction !== null}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>I’ve reviewed the rarity difference.</span>
              </label>
            ) : trade.self.imbalanceAcknowledged ? (
              <p className="trade-acknowledged">
                <ShieldCheck aria-hidden="true" size={18} />
                Warning reviewed.
              </p>
            ) : null}
            {!trade.self.imbalanceAcknowledged && open ? (
              <button
                className="button button--quiet"
                disabled={!acknowledged || pendingAction !== null}
                onClick={() => void applyMutation('acknowledge')}
                type="button"
              >
                {pendingAction === 'acknowledge'
                  ? 'Saving…'
                  : 'Confirm warning'}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {open ? (
        <section className="trade-actions" aria-label="Trade actions">
          <div className="trade-actions__buttons">
            <Link
              className="button button--quiet"
              href={`/collection/trades/${trade.tradeId}/edit`}
            >
              <PencilSimple aria-hidden="true" size={19} />
              Edit your side
            </Link>
            <button
              className="button"
              disabled={!canAccept || pendingAction !== null}
              onClick={() => void startAcceptance()}
              ref={acceptanceTrigger}
              type="button"
            >
              {pendingAction === 'reauthenticating'
                ? 'Verifying…'
                : trade.self.accepted
                  ? 'Accepted'
                  : 'Accept offer'}
            </button>
            <button
              className="button button--danger"
              disabled={pendingAction !== null}
              onClick={() =>
                setConfirmation(trade.role === 'sender' ? 'cancel' : 'decline')
              }
              ref={terminalTrigger}
              type="button"
            >
              {trade.role === 'sender' ? 'Cancel offer' : 'Decline offer'}
            </button>
          </div>
          {!trade.complete ? (
            <p className="trade-actions__explanation">
              Both players need to choose the requested cards before accepting.
            </p>
          ) : null}
        </section>
      ) : null}

      {confirmation ? (
        <TradeConfirmationDialog
          busy={pendingAction !== null}
          confirmLabel={confirmationLabel(confirmation)}
          description={confirmationDescription(confirmation, trade)}
          destructive={confirmation !== 'accept'}
          onCancel={() => {
            setConfirmation(null);
            if (confirmation === 'accept') {
              setReauthenticationToken(null);
              setReturnedVersion(null);
            }
          }}
          onConfirm={() => void applyMutation(confirmation)}
          returnFocusRef={
            confirmation === 'accept' ? acceptanceTrigger : terminalTrigger
          }
          title={confirmationTitle(confirmation)}
        />
      ) : null}
    </div>
  );
}

function confirmationTitle(confirmation: Exclude<Confirmation, null>) {
  return confirmation === 'accept'
    ? 'Accept this offer?'
    : confirmation === 'cancel'
      ? 'Cancel this offer?'
      : 'Decline this offer?';
}

function confirmationLabel(confirmation: Exclude<Confirmation, null>) {
  return confirmation === 'accept'
    ? 'Accept offer'
    : confirmation === 'cancel'
      ? 'Cancel offer'
      : 'Decline offer';
}

function confirmationDescription(
  confirmation: Exclude<Confirmation, null>,
  trade: CardTrade,
) {
  if (confirmation === 'accept') {
    return `Accept version ${trade.version} with ${trade.counterpartyPlayerName}? If they’ve already accepted it, your cards will be exchanged now.`;
  }
  return confirmation === 'cancel'
    ? 'Cancel this offer and release its cards? This cannot be undone.'
    : 'Decline this offer and release its cards? This cannot be undone.';
}

function actionSuccessCopy(action: string, trade: CardTrade) {
  if (trade.status === 'completed')
    return 'Trade completed and collection refresh started.';
  if (action === 'accept') return `Version ${trade.version} accepted.`;
  if (action === 'acknowledge')
    return `Version ${trade.version} warning acknowledged.`;
  return action === 'cancel' ? 'Trade cancelled.' : 'Trade declined.';
}

function statusLabel(status: CardTrade['status']) {
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

function terminalCopy(trade: CardTrade) {
  if (!trade.terminalAt) return statusLabel(trade.status);
  return `${statusLabel(trade.status)} ${formatDate(trade.terminalAt)}`;
}

function formatDate(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function actionErrorTitle(error: TradeApiError) {
  if (error.failure === 'stale') return 'The offer changed';
  if (error.failure === 'recent-authentication')
    return 'Identity check required';
  if (error.failure === 'copy-conflict') return 'Selected cards changed';
  if (error.failure === 'not-open') return 'This trade is closed';
  return 'The trade action did not finish';
}

function actionErrorCopy(error: TradeApiError) {
  if (error.options.detail) return error.options.detail;
  if (error.failure === 'recent-authentication') {
    return 'Sign in again to confirm your identity, then review the offer.';
  }
  return 'Couldn’t confirm the trade. Reload the offer and try again.';
}
