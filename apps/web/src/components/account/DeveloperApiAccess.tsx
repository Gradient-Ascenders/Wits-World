import { LoadingState, UpdatingIndicator } from '../LoadingState';
import { createAppDateTimeFormatter } from '../../date-time';
import { CaretDown } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createDeveloperApiKey,
  DeveloperApiError,
  listDeveloperApiKeys,
  revokeDeveloperApiKey,
  type DeveloperApiKeyList,
} from '../../api/developer';
import { READ_TIMEOUT_MS } from '../loading-policy';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';

interface DeveloperApiAccessProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: DeveloperApiKeyList }
  | { status: 'error'; error: DeveloperApiError };

export function DeveloperApiAccess({
  apiBaseUrl,
  getAccessToken,
}: DeveloperApiAccessProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<DeveloperApiError | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<DeveloperApiError | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);
  const readRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const secretHeading = useRef<HTMLHeadingElement>(null);
  const disclosureTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);

  const refresh = useCallback(async () => {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setRefreshing(true);
    setRefreshError(null);
    const failed = (error: unknown) => {
      const failure =
        error instanceof DeveloperApiError
          ? error
          : new DeveloperApiError('unavailable');
      if (failure.failure === 'authorization') {
        setState({ status: 'error', error: failure });
        setCreatedSecret(null);
      } else {
        setState((current) =>
          current.status === 'ready'
            ? current
            : { status: 'error', error: failure },
        );
      }
      setRefreshError(failure);
    };
    const timeout = window.setTimeout(() => {
      controller.abort();
      failed(new DeveloperApiError('unavailable'));
      setRefreshing(false);
    }, READ_TIMEOUT_MS);
    controller.signal.addEventListener(
      'abort',
      () => window.clearTimeout(timeout),
      { once: true },
    );
    let rejectAborted: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAborted = () =>
        reject(new DOMException('Read cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', rejectAborted, {
        once: true,
      });
    });
    try {
      const data = await Promise.race([
        listDeveloperApiKeys({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        }),
        aborted,
      ]);
      if (!controller.signal.aborted) setState({ status: 'ready', data });
    } catch (error) {
      if (!controller.signal.aborted) failed(error);
    } finally {
      window.clearTimeout(timeout);
      controller.signal.removeEventListener('abort', rejectAborted);
      if (readRequest.current === controller) {
        readRequest.current = null;
        setRefreshing(false);
      }
    }
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    setState({ status: 'loading' });
    setCreatedSecret(null);
    void refresh();
    return () => {
      readRequest.current?.abort();
      mutationRequest.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (createdSecret) secretHeading.current?.focus();
  }, [createdSecret]);

  async function createKey() {
    const trimmedName = name.trim();
    if (
      !trimmedName ||
      mutationRequest.current ||
      state.status !== 'ready' ||
      refreshing ||
      refreshError
    )
      return;
    setCreating(true);
    setMutationError(null);
    setCreatedSecret(null);
    setCopyState('idle');
    const controller = new AbortController();
    mutationRequest.current = controller;
    try {
      const created = await createDeveloperApiKey({
        apiBaseUrl,
        getAccessToken,
        name: trimmedName,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setName('');
      setCreatedSecret(created.apiKey);
      await refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure =
        error instanceof DeveloperApiError
          ? error
          : new DeveloperApiError('unavailable');
      if (failure.failure === 'authorization') {
        setState({ status: 'error', error: failure });
        setCreatedSecret(null);
      }
      setMutationError(failure);
    } finally {
      if (mutationRequest.current === controller)
        mutationRequest.current = null;
      if (!controller.signal.aborted) setCreating(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (
      mutationRequest.current ||
      refreshing ||
      refreshError ||
      state.status !== 'ready'
    )
      return;
    setRevoking(true);
    setMutationError(null);
    const controller = new AbortController();
    mutationRequest.current = controller;
    try {
      await revokeDeveloperApiKey({
        apiBaseUrl,
        getAccessToken,
        keyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRevokingId(null);
      await refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure =
        error instanceof DeveloperApiError
          ? error
          : new DeveloperApiError('unavailable');
      if (failure.failure === 'authorization') {
        setState({ status: 'error', error: failure });
        setCreatedSecret(null);
      }
      setMutationError(failure);
    } finally {
      if (mutationRequest.current === controller)
        mutationRequest.current = null;
      if (!controller.signal.aborted) setRevoking(false);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  const controlsUnavailable =
    state.status !== 'ready' || refreshing || refreshError !== null || revoking;
  const activeCount =
    state.status === 'ready'
      ? state.data.keys.filter((key) => key.status === 'active').length
      : 0;
  const atLimit =
    state.status === 'ready' && activeCount >= state.data.activeKeyLimit;
  const hasUnacknowledgedSecret = createdSecret !== null;
  const disclosureLocked = creating || hasUnacknowledgedSecret;
  const showsControls = expanded || disclosureLocked;

  return (
    <section
      aria-labelledby="developer-api-access-title"
      className="account-page__section developer-api-access"
    >
      <div className="account-section-heading">
        <h2 id="developer-api-access-title">
          <button
            aria-controls="developer-api-controls"
            aria-describedby="developer-api-description developer-api-count"
            aria-disabled={disclosureLocked || undefined}
            aria-expanded={showsControls}
            className="developer-api-disclosure"
            onClick={() => {
              if (!disclosureLocked) setExpanded(!expanded);
            }}
            ref={disclosureTrigger}
            type="button"
          >
            <span>Developer API access</span>
            <span
              aria-hidden="true"
              className="developer-api-disclosure__count"
              id="developer-api-count"
            >
              {state.status === 'ready'
                ? `${activeCount} of ${state.data.activeKeyLimit} active`
                : state.status === 'loading'
                  ? 'Loading API keys…'
                  : 'Keys unavailable'}
            </span>
            <CaretDown aria-hidden="true" size={18} />
          </button>
        </h2>
        <p id="developer-api-description">
          Read-only access to public events, cards, and standings.
        </p>
      </div>

      {state.status === 'ready' ? (
        <UpdatingIndicator
          active={refreshing}
          label="Updating API keys"
          error={refreshError ? 'Could not update your API keys.' : undefined}
          onRetry={() => void refresh()}
        />
      ) : null}

      {mutationError ? (
        <DeveloperApiErrorMessage error={mutationError} />
      ) : null}

      {state.status === 'error' ? (
        <div className="developer-api-error">
          <DeveloperApiErrorMessage error={state.error} />
          <button
            className="button button--quiet"
            onClick={() => void refresh()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div
        className="developer-api-card"
        hidden={!showsControls}
        id="developer-api-controls"
      >
        {createdSecret ? (
          <div className="developer-api-secret" role="region">
            <h3 ref={secretHeading} tabIndex={-1}>
              Save this API key now
            </h3>
            <p>
              This key is shown only once. Keep it out of source control, URLs,
              and browser code.
            </p>
            <input
              aria-label="Generated API key"
              autoComplete="off"
              className="developer-api-secret__value"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              spellCheck={false}
              type="text"
              value={createdSecret}
            />
            <div className="developer-api-secret__actions">
              <button
                className="button"
                onClick={() => void copySecret()}
                type="button"
              >
                Copy API key
              </button>
              <button
                className="button button--quiet"
                onClick={() => {
                  setCreatedSecret(null);
                  setCopyState('idle');
                  queueMicrotask(() => {
                    (nameInput.current?.disabled
                      ? disclosureTrigger.current
                      : nameInput.current
                    )?.focus();
                  });
                }}
                type="button"
              >
                I have saved it
              </button>
            </div>
            {copyState === 'copied' ? (
              <p
                aria-live="polite"
                className="account-inline-status"
                role="status"
              >
                API key copied.
              </p>
            ) : null}
            {copyState === 'failed' ? (
              <p className="account-inline-error" role="alert">
                Could not copy. Select and copy the key manually before closing.
              </p>
            ) : null}
          </div>
        ) : null}

        <form
          className="developer-api-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createKey();
          }}
        >
          <label htmlFor="developer-api-key-name">Key name</label>
          <div className="developer-api-form__controls">
            <input
              autoComplete="off"
              disabled={
                controlsUnavailable ||
                creating ||
                atLimit ||
                hasUnacknowledgedSecret
              }
              id="developer-api-key-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Discord bot"
              ref={nameInput}
              required
              type="text"
              value={name}
            />
            <button
              className="button"
              disabled={
                controlsUnavailable ||
                creating ||
                atLimit ||
                hasUnacknowledgedSecret ||
                !name.trim()
              }
              type="submit"
            >
              {creating ? 'Generating API key…' : 'Generate API key'}
            </button>
          </div>
          {atLimit ? (
            <p className="account-inline-status">
              Key limit reached. Revoke a key before generating another.
            </p>
          ) : null}
        </form>

        {state.status === 'loading' ? (
          <LoadingState label="Loading API keys…" />
        ) : null}

        {state.status === 'ready' ? (
          <div className="developer-api-keys">
            <h3>Your API keys</h3>
            {state.data.keys.length === 0 ? (
              <p className="developer-api-empty">No API keys yet.</p>
            ) : (
              <ul>
                {state.data.keys.map((key) => (
                  <li key={key.id}>
                    <div className="developer-api-key-row__summary">
                      <strong>{key.name}</strong>
                      <code>{key.keyPrefix}</code>
                      <span>
                        Created {formatDate(key.createdAt)} · Last used{' '}
                        {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}
                      </span>
                      <span
                        className={`developer-api-key-status developer-api-key-status--${key.status}`}
                      >
                        {key.status === 'active' ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                    {key.status === 'active' ? (
                      <>
                        <button
                          disabled={controlsUnavailable || creating}
                          aria-controls={`developer-api-revoke-${key.id}`}
                          aria-expanded={revokingId === key.id}
                          className="button button--quiet"
                          onClick={(event) => {
                            revokeTrigger.current = event.currentTarget;
                            setRevokingId(key.id);
                          }}
                          type="button"
                        >
                          Revoke
                        </button>
                        {revokingId === key.id ? (
                          <div
                            className="developer-api-revoke-confirmation"
                            id={`developer-api-revoke-${key.id}`}
                          >
                            <p>
                              Revoke this key? Apps using it will lose access
                              immediately.
                            </p>
                            <div>
                              <button
                                disabled={controlsUnavailable || creating}
                                className="button button--danger"
                                onClick={() => void revokeKey(key.id)}
                                type="button"
                              >
                                Revoke key
                              </button>
                              <button
                                className="button button--quiet"
                                onClick={() => {
                                  setRevokingId(null);
                                  revokeTrigger.current?.focus();
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DeveloperApiErrorMessage({ error }: { error: DeveloperApiError }) {
  const message =
    error.failure === 'authorization'
      ? 'Sign in again to manage API keys.'
      : error.failure === 'key-limit'
        ? 'Key limit reached. Revoke a key and try again.'
        : error.failure === 'not-found'
          ? 'Key no longer available. Refresh the list and try again.'
          : 'API keys are unavailable. Try again.';
  return (
    <p className="account-inline-error" role="alert">
      {message}
      {error.requestId ? ` Support reference: ${error.requestId}` : ''}
    </p>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : createAppDateTimeFormatter(undefined, { dateStyle: 'medium' }).format(
        date,
      );
}
