import { useAuth0 } from '@auth0/auth0-react';
import { ArrowSquareOut, Key, Trash } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import {
  AccountApiError,
  deleteCurrentAccount,
  type AccountDeletionResult,
} from '../api/account';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import { clearAuthenticatedPlayerBinding } from '../auth/player-session-binding';
import { confirmOfflineSignOut } from '../offline/store';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { AccountDeletionDialog } from '../components/account/AccountDeletionDialog';
import { AccessibilitySettings } from '../accessibility/AccessibilitySettings';
import { DeveloperApiAccess } from '../components/account/DeveloperApiAccess';
import './account.css';

const accountRoute = '/account';
const deletionReturnRoute = `${accountRoute}?action=confirm-deletion`;
const recoveryReturnRoute = `${accountRoute}?action=password-recovery`;

type RecoveryState = 'idle' | 'redirecting' | 'returned' | 'unavailable';
type AccountReturnAction = 'confirm-deletion' | 'password-recovery';

type DeletionState =
  | { status: 'idle' }
  | { status: 'prepare' }
  | { status: 'reauthenticating' }
  | { reauthenticationToken: string; status: 'confirm' }
  | { status: 'submitting' }
  | { result: AccountDeletionResult; status: 'completed' | 'retry_pending' }
  | {
      error: AccountApiError;
      reauthenticationToken?: string;
      status: 'error';
    };

export default function AccountPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { getIdTokenClaims, loginWithRedirect, logout } = useAuth0();
  const { state: currentPlayer } = useCurrentPlayer();
  const getAccessToken = useApiAccessToken();
  const [recovery, setRecovery] = useState<RecoveryState>('idle');
  const [deletion, setDeletion] = useState<DeletionState>({ status: 'idle' });
  const [signOutFailed, setSignOutFailed] = useState(false);
  const returnAction = useRef<AccountReturnAction | null>(
    readAccountReturnAction(),
  );
  const returnUrlCleared = useRef(false);
  const deletionTrigger = useRef<HTMLButtonElement>(null);
  const deletionRequest = useRef<AbortController | null>(null);
  const statusHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => deletionRequest.current?.abort(), []);

  useEffect(() => {
    const action = returnAction.current;

    if (!action) {
      return;
    }

    if (!returnUrlCleared.current) {
      returnUrlCleared.current = true;
      window.history.replaceState({}, '', accountRoute);
    }

    if (action === 'password-recovery') {
      returnAction.current = null;
      setRecovery('returned');
      return;
    }

    setDeletion({ status: 'reauthenticating' });
    let active = true;

    void getIdTokenClaims()
      .then((claims) => {
        if (!active) {
          return;
        }

        returnAction.current = null;
        if (!claims?.__raw) {
          setDeletion({
            error: new AccountApiError('recent-authentication'),
            status: 'error',
          });
          return;
        }

        setDeletion({
          reauthenticationToken: claims.__raw,
          status: 'confirm',
        });
      })
      .catch(() => {
        if (active) {
          returnAction.current = null;
          setDeletion({
            error: new AccountApiError('recent-authentication'),
            status: 'error',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [getIdTokenClaims]);

  useEffect(() => {
    if (
      deletion.status === 'completed' ||
      deletion.status === 'retry_pending' ||
      deletion.status === 'error'
    ) {
      // The confirmation dialog removes the page's inert state in its effect
      // cleanup. Wait until that cleanup completes before moving focus to the
      // authoritative result or recovery message.
      queueMicrotask(() => statusHeading.current?.focus());
    }
  }, [deletion.status]);

  if (currentPlayer.status !== 'ready') {
    return null;
  }

  const player = currentPlayer.player;
  const provider = player.connectionStrategy;

  async function startPasswordRecovery() {
    setRecovery('redirecting');

    try {
      await loginWithRedirect({
        appState: { returnTo: recoveryReturnRoute },
        authorizationParams: { prompt: 'login' },
      });
    } catch {
      setRecovery('unavailable');
    }
  }

  async function startReauthentication() {
    setDeletion({ status: 'reauthenticating' });

    try {
      await loginWithRedirect({
        appState: { returnTo: deletionReturnRoute },
        authorizationParams: {
          max_age: 0,
          prompt: 'login',
        },
      });
    } catch {
      setDeletion({
        error: new AccountApiError('recent-authentication'),
        status: 'error',
      });
    }
  }

  async function submitDeletion(reauthenticationToken: string) {
    setDeletion({ status: 'submitting' });
    if ((await confirmOfflineSignOut('delete your account')) === 'cancelled') {
      setDeletion(deletion);
      return;
    }
    const controller = new AbortController();
    deletionRequest.current?.abort();
    deletionRequest.current = controller;

    try {
      const result = await deleteCurrentAccount({
        apiBaseUrl,
        getAccessToken,
        reauthenticationToken,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        clearAuthenticatedPlayerBinding();
        setDeletion({ result, status: result.status });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDeletion({
          error:
            error instanceof AccountApiError
              ? error
              : new AccountApiError('unavailable'),
          reauthenticationToken,
          status: 'error',
        });
      }
    } finally {
      if (deletionRequest.current === controller) {
        deletionRequest.current = null;
      }
    }
  }

  async function finishDeletion() {
    if ((await confirmOfflineSignOut()) === 'cancelled') return;
    setSignOutFailed(false);
    clearAuthenticatedPlayerBinding();

    try {
      await logout({
        logoutParams: { returnTo: window.location.origin },
      });
    } catch {
      setSignOutFailed(true);
    }
  }

  const showsDeletionResult =
    deletion.status === 'completed' || deletion.status === 'retry_pending';

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Account settings</h1>
      </header>

      {showsDeletionResult ? (
        <DeletionResult
          onFinish={finishDeletion}
          result={deletion.result}
          signOutFailed={signOutFailed}
          status={deletion.status}
          statusHeading={statusHeading}
        />
      ) : (
        <>
          <section
            aria-labelledby="account-profile-title"
            className="account-page__section account-summary"
          >
            <div className="account-section-heading">
              <h2 id="account-profile-title">Account details</h2>
            </div>
            <dl className="account-details">
              <div className="account-details__name">
                <dt>Player name</dt>
                <dd>{player.playerName ?? 'Not chosen yet'}</dd>
              </div>
              <div>
                <dt>Sign-in method</dt>
                <dd>{providerName(provider)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{player.role === 'author' ? 'Author' : 'Player'}</dd>
              </div>
            </dl>
          </section>

          <AccessibilitySettings />

          <section
            aria-labelledby="account-security-title"
            className="account-page__section account-security"
          >
            <h2 id="account-security-title">Security</h2>

            <div className="account-action-card">
              <AccountActionIcon name="recovery" />
              {provider === 'google-oauth2' ? (
                <FederatedRecovery />
              ) : (
                <DatabaseRecovery
                  onStart={startPasswordRecovery}
                  state={recovery}
                />
              )}
            </div>
          </section>

          <DeveloperApiAccess
            apiBaseUrl={apiBaseUrl}
            getAccessToken={getAccessToken}
          />

          <section
            aria-labelledby="account-deletion-title"
            className="account-page__section account-deletion"
          >
            <h2 id="account-deletion-title">Account deletion</h2>

            <div className="account-action-card account-action-card--danger">
              <AccountActionIcon name="danger" />
              <div className="account-action-card__content">
                <p>
                  Permanently delete your account and game data. Required
                  anonymous history remains.
                </p>
              </div>

              {deletion.status === 'reauthenticating' ? (
                <p
                  aria-live="polite"
                  className="account-action-card__message account-inline-status"
                  role="status"
                >
                  Opening sign-in…
                </p>
              ) : null}

              {deletion.status === 'error' ? (
                <DeletionErrorState
                  deletion={deletion}
                  onFinish={finishDeletion}
                  onRetry={() => {
                    if (
                      deletion.error.failure === 'unavailable' &&
                      deletion.reauthenticationToken
                    ) {
                      void submitDeletion(deletion.reauthenticationToken);
                    } else {
                      void startReauthentication();
                    }
                  }}
                  signOutFailed={signOutFailed}
                  statusHeading={statusHeading}
                />
              ) : (
                <button
                  className="button button--danger account-delete-trigger"
                  disabled={deletion.status === 'reauthenticating'}
                  onClick={() => setDeletion({ status: 'prepare' })}
                  ref={deletionTrigger}
                  type="button"
                >
                  Delete account
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {deletion.status === 'prepare' ? (
        <AccountDeletionDialog
          busy={false}
          onCancel={() => setDeletion({ status: 'idle' })}
          onConfirm={() => void startReauthentication()}
          phase="prepare"
          returnFocusRef={deletionTrigger}
          statusFocusRef={statusHeading}
        />
      ) : null}

      {deletion.status === 'confirm' || deletion.status === 'submitting' ? (
        <AccountDeletionDialog
          busy={deletion.status === 'submitting'}
          onCancel={() => setDeletion({ status: 'idle' })}
          onConfirm={() => {
            if (deletion.status === 'confirm') {
              void submitDeletion(deletion.reauthenticationToken);
            }
          }}
          phase="confirm"
          returnFocusRef={deletionTrigger}
          statusFocusRef={statusHeading}
        />
      ) : null}
    </div>
  );
}

function readAccountReturnAction(): AccountReturnAction | null {
  const action = new URLSearchParams(window.location.search).get('action');
  return action === 'confirm-deletion' || action === 'password-recovery'
    ? action
    : null;
}

function AccountActionIcon({ name }: { name: 'danger' | 'recovery' }) {
  return (
    <span
      aria-hidden="true"
      className={`account-action-card__icon account-action-card__icon--${name}`}
    >
      {name === 'recovery' ? <Key size={20} /> : <Trash size={20} />}
    </span>
  );
}

function DatabaseRecovery({
  onStart,
  state,
}: {
  onStart: () => Promise<void>;
  state: RecoveryState;
}) {
  return (
    <>
      <div className="account-action-card__content">
        <h3>Password recovery</h3>
        <p>Choose “Forgot password?” on the Auth0 sign-in page.</p>
      </div>
      <button
        className="button"
        disabled={state === 'redirecting'}
        onClick={() => void onStart()}
        type="button"
      >
        {state === 'redirecting' ? 'Opening sign-in…' : 'Reset password'}
      </button>
      {state === 'returned' ? (
        <p
          className="account-action-card__message account-inline-status"
          role="status"
        >
          If you requested a reset, use the latest email link. Wits World cannot
          confirm whether your password changed.
        </p>
      ) : null}
      {state === 'unavailable' ? (
        <p
          className="account-action-card__message account-inline-error state-message state-message--error"
          role="alert"
        >
          Could not open password recovery. Check your connection and try again.
        </p>
      ) : null}
    </>
  );
}

function FederatedRecovery() {
  return (
    <>
      <div className="account-action-card__content">
        <h3>Password recovery</h3>
        <p>
          Google manages your password. Recover it through your Google account.
        </p>
      </div>
      <a
        className="button button--quiet button--link"
        href="https://support.google.com/accounts/answer/7682439"
        rel="noreferrer"
        target="_blank"
      >
        Open Google recovery
        <ArrowSquareOut aria-hidden="true" size={20} />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </>
  );
}

function DeletionResult({
  onFinish,
  result,
  signOutFailed,
  status,
  statusHeading,
}: {
  onFinish: () => Promise<void>;
  result: AccountDeletionResult;
  signOutFailed: boolean;
  status: 'completed' | 'retry_pending';
  statusHeading: React.RefObject<HTMLHeadingElement | null>;
}) {
  const completed = status === 'completed';

  return (
    <section
      aria-labelledby="account-deletion-result-title"
      className={`account-result account-result--${completed ? 'completed' : 'pending'}`}
    >
      <h2 id="account-deletion-result-title" ref={statusHeading} tabIndex={-1}>
        {completed
          ? 'Your Wits World account is deleted'
          : 'Account locked. Deletion pending.'}
      </h2>
      <p>
        {completed
          ? 'Your account, Auth0 sign-in for this app, and game data are deleted. Signing up again creates a new player.'
          : 'Your deletion request is saved. Cleanup will retry automatically. You cannot access the game while deletion is pending.'}
      </p>
      <p className="account-support-reference">
        Deletion reference: {result.deletionId}
      </p>
      <button className="button" onClick={() => void onFinish()} type="button">
        Return home
      </button>
      {signOutFailed ? (
        <p className="account-inline-error" role="alert">
          Could not sign out. Your account remains locked. Try again.
        </p>
      ) : null}
    </section>
  );
}

function DeletionErrorState({
  deletion,
  onFinish,
  onRetry,
  signOutFailed,
  statusHeading,
}: {
  deletion: Extract<DeletionState, { status: 'error' }>;
  onFinish: () => Promise<void>;
  onRetry: () => void;
  signOutFailed: boolean;
  statusHeading: React.RefObject<HTMLHeadingElement | null>;
}) {
  const unavailableAccount = deletion.error.failure === 'account-unavailable';
  const recentAuthentication =
    deletion.error.failure === 'recent-authentication' ||
    deletion.error.failure === 'authorization';

  return (
    <div
      aria-labelledby="account-deletion-error-title"
      className="account-deletion-error"
      role="region"
    >
      <h3 id="account-deletion-error-title" ref={statusHeading} tabIndex={-1}>
        {unavailableAccount
          ? 'Account already locked'
          : recentAuthentication
            ? 'Sign in again to continue'
            : 'Could not confirm deletion'}
      </h3>
      <p>
        {unavailableAccount
          ? 'Deletion may already be underway. Game access is blocked. Sign out to finish.'
          : recentAuthentication
            ? 'Sign in with Auth0 before confirming deletion again.'
            : 'Your request may have completed. Try again to check and safely finish the same request.'}
      </p>
      {deletion.error.options.requestId ? (
        <p className="account-support-reference">
          Support reference: {deletion.error.options.requestId}
        </p>
      ) : null}
      <div className="account-deletion-error__actions">
        {unavailableAccount ? (
          <button
            className="button"
            onClick={() => void onFinish()}
            type="button"
          >
            Sign out
          </button>
        ) : (
          <button className="button" onClick={onRetry} type="button">
            {recentAuthentication ? 'Sign in again' : 'Try deletion again'}
          </button>
        )}
      </div>
      {signOutFailed ? (
        <p className="account-inline-error" role="alert">
          Could not sign out. Your account remains locked. Try again.
        </p>
      ) : null}
    </div>
  );
}

function providerName(provider: 'auth0' | 'google-oauth2'): string {
  switch (provider) {
    case 'auth0':
      return 'Auth0';
    case 'google-oauth2':
      return 'Google';
  }
}
