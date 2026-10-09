import { useAuth0 } from '@auth0/auth0-react';
import {
  ArrowLeft,
  ArrowSquareOut,
  EnvelopeSimple,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';

import {
  PasswordRecoveryError,
  requestPasswordReset,
} from '../api/password-recovery';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import type { AuthConfig } from '../config/environment';
import './password-reset.css';

type ResetState =
  | { status: 'idle' | 'sending' | 'sent' }
  | { failure: 'rate-limited' | 'unavailable'; status: 'error' };

export default function PasswordResetPage({
  authConfig,
}: {
  authConfig?: AuthConfig;
}) {
  const { user } = useAuth0();
  const { state: currentPlayer } = useCurrentPlayer();
  const [email, setEmail] = useState(user?.email ?? '');
  const [state, setState] = useState<ResetState>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (state.status === 'sent') confirmation.current?.focus();
  }, [state.status]);

  if (currentPlayer.status !== 'ready') return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || !authConfig) return;

    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'sending' });
    try {
      await requestPasswordReset({
        authConfig,
        email,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setState({ status: 'sent' });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          failure:
            error instanceof PasswordRecoveryError
              ? error.failure
              : 'unavailable',
          status: 'error',
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  const googleAccount =
    currentPlayer.player.connectionStrategy === 'google-oauth2';
  return (
    <div className="password-reset-page">
      <Link className="password-reset-back" href="/account">
        <ArrowLeft aria-hidden="true" size={18} />
        Account settings
      </Link>
      <header className="password-reset-header">
        <h1>Reset password</h1>
      </header>

      {googleAccount ? (
        <section className="password-reset-content">
          <p>
            Google manages your password. Reset it through your Google account.
          </p>
          <a
            className="button"
            href="https://support.google.com/accounts/answer/7682439"
            rel="noopener noreferrer"
            target="_blank"
          >
            Open Google recovery
            <ArrowSquareOut aria-hidden="true" size={18} />
          </a>
        </section>
      ) : state.status === 'sent' ? (
        <section
          className="password-reset-content"
          aria-labelledby="reset-confirmation"
        >
          <h2 id="reset-confirmation" ref={confirmation} tabIndex={-1}>
            Check your inbox
          </h2>
          <p>
            If an account uses this email, you will receive a password-reset
            link.
          </p>
          <p className="password-reset-hint">
            Check your spam folder too. Your password stays the same until you
            follow the link.
          </p>
          <Link className="button" href="/account">
            Back to account settings
          </Link>
          <button
            className="password-reset-text-button"
            onClick={() => setState({ status: 'idle' })}
            type="button"
          >
            Use a different email
          </button>
        </section>
      ) : (
        <form
          className="password-reset-content"
          onSubmit={(event) => void submit(event)}
        >
          <p>We will email you a link to choose a new password.</p>
          <div className="password-reset-field">
            <label htmlFor="reset-email">Account email</label>
            <input
              autoComplete="email"
              disabled={state.status === 'sending'}
              id="reset-email"
              inputMode="email"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (state.status === 'error') setState({ status: 'idle' });
              }}
              required
              type="email"
              value={email}
            />
          </div>
          {!authConfig || state.status === 'error' ? (
            <p className="password-reset-error" role="alert">
              {state.status === 'error' && state.failure === 'rate-limited'
                ? 'Too many requests. Wait a minute before trying again.'
                : 'Could not request a reset link. Please try again later.'}
            </p>
          ) : null}
          <button
            className="button"
            disabled={!authConfig || state.status === 'sending'}
            type="submit"
          >
            <EnvelopeSimple aria-hidden="true" size={18} />
            {state.status === 'sending' ? 'Sending...' : 'Send reset link'}
          </button>
          <span className="sr-only" role="status">
            {state.status === 'sending'
              ? 'Requesting your password-reset link.'
              : ''}
          </span>
        </form>
      )}
    </div>
  );
}
