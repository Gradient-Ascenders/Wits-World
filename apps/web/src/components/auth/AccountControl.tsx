import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRoute } from 'wouter';

import { useCurrentPlayer } from '../../auth/CurrentPlayerProvider';
import {
  CurrentPlayerError,
  DisplayNameUpdateError,
} from '../../api/authentication';
import {
  clearAuthenticatedPlayerBinding,
  hasAuthenticatedPlayerBinding,
} from '../../auth/player-session-binding';

export function AccountControl() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout } =
    useAuth0();
  const [actionFailed, setActionFailed] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [editorMessage, setEditorMessage] = useState<
    { kind: 'error' | 'success'; text: string } | undefined
  >();
  const [editorPlayerId, setEditorPlayerId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { state: currentPlayer, updateDisplayName } = useCurrentPlayer();
  const [isProtectedExploreRoute] = useRoute('/explore');
  const [isProtectedCollectionRoute] = useRoute('/collection');
  const [isProtectedAuthorRoute] = useRoute('/author');
  const currentPlayerId =
    currentPlayer.status === 'ready' ? currentPlayer.player.id : null;
  const isEditorVisible =
    isEditorOpen &&
    currentPlayer.status === 'ready' &&
    editorPlayerId === currentPlayer.player.id;

  useEffect(
    () => () => {
      saveControllerRef.current?.abort();
    },
    [currentPlayerId, isAuthenticated],
  );

  useEffect(() => {
    if (isEditorVisible) {
      inputRef.current?.focus();
    }
  }, [isEditorVisible]);

  useEffect(() => {
    if (!isEditorVisible) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        saveControllerRef.current?.abort();
        setIsEditorOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isEditorVisible]);

  if (isLoading) {
    return null;
  }

  async function signIn() {
    setActionFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/explore' } });
    } catch {
      setActionFailed(true);
    }
  }

  async function signOut() {
    setActionFailed(false);
    saveControllerRef.current?.abort();
    clearAuthenticatedPlayerBinding();

    try {
      await logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    } catch {
      setActionFailed(true);
    }
  }

  async function switchAccount() {
    setActionFailed(false);
    saveControllerRef.current?.abort();
    clearAuthenticatedPlayerBinding();

    try {
      await loginWithRedirect({
        appState: { returnTo: '/explore' },
        authorizationParams: { prompt: 'login' },
      });
    } catch {
      setActionFailed(true);
    }
  }

  function openDisplayNameEditor() {
    if (currentPlayer.status !== 'ready') {
      return;
    }

    setDisplayNameDraft(currentPlayer.player.displayName ?? '');
    setEditorPlayerId(currentPlayer.player.id);
    setEditorMessage(undefined);
    setIsEditorOpen(true);
  }

  function closeDisplayNameEditor() {
    saveControllerRef.current?.abort();
    setIsEditorOpen(false);
    triggerRef.current?.focus();
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditorMessage(undefined);
    setIsSaving(true);
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;

    try {
      const player = await updateDisplayName(
        displayNameDraft,
        controller.signal,
      );

      if (controller.signal.aborted) {
        return;
      }

      setDisplayNameDraft(player.displayName ?? '');
      setEditorMessage({ kind: 'success', text: 'Display name saved.' });
    } catch (saveError) {
      if (
        controller.signal.aborted ||
        (saveError instanceof CurrentPlayerError &&
          saveError.failure === 'authorization')
      ) {
        return;
      }

      setEditorMessage({
        kind: 'error',
        text:
          saveError instanceof DisplayNameUpdateError
            ? saveError.message
            : 'Your display name could not be saved. Try again.',
      });
    } finally {
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
        setIsSaving(false);
      }
    }
  }

  if (error) {
    if (
      isProtectedExploreRoute ||
      isProtectedCollectionRoute ||
      isProtectedAuthorRoute
    ) {
      return null;
    }

    return (
      <div className="account-control account-control--error">
        <span className="account-control__error" role="alert">
          {actionFailed
            ? 'The account action could not start. Try again later.'
            : 'Sign-in is unavailable right now.'}
        </span>
        <button className="button button--quiet" onClick={signIn} type="button">
          Try sign-in again
        </button>
      </div>
    );
  }

  return (
    <div className="account-control">
      {isAuthenticated ? (
        <>
          {currentPlayer.status === 'ready' ? (
            <button
              aria-controls="display-name-editor"
              aria-expanded={isEditorVisible}
              className="account-control__identity"
              onClick={openDisplayNameEditor}
              ref={triggerRef}
              type="button"
            >
              {currentPlayer.player.displayName ? (
                <>
                  Signed in as{' '}
                  <strong>{currentPlayer.player.displayName}</strong>
                </>
              ) : (
                'Signed in'
              )}
            </button>
          ) : null}
          <button
            className="button button--quiet"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
          {isEditorVisible && currentPlayer.status === 'ready' ? (
            <section
              aria-labelledby="display-name-editor-title"
              className="account-control__editor"
              id="display-name-editor"
            >
              <div className="account-control__editor-heading">
                <div>
                  <p className="eyebrow">Your account</p>
                  <h2 id="display-name-editor-title">Player name</h2>
                </div>
                <button
                  aria-label="Close player-name editor"
                  className="button button--quiet account-control__close"
                  onClick={closeDisplayNameEditor}
                  type="button"
                >
                  Close
                </button>
              </div>
              <form onSubmit={saveDisplayName}>
                <label htmlFor="account-display-name">Display name</label>
                <input
                  aria-describedby={
                    editorMessage?.kind === 'error'
                      ? 'display-name-rules display-name-error'
                      : 'display-name-rules'
                  }
                  aria-invalid={editorMessage?.kind === 'error'}
                  autoComplete="nickname"
                  id="account-display-name"
                  onChange={(event) => {
                    setDisplayNameDraft(event.target.value);
                    setEditorMessage(undefined);
                  }}
                  ref={inputRef}
                  type="text"
                  value={displayNameDraft}
                />
                <p className="account-control__rules" id="display-name-rules">
                  Use 2–32 characters. Spaces around the name are removed.
                </p>
                {editorMessage ? (
                  <p
                    className={`account-control__save-message account-control__save-message--${editorMessage.kind}`}
                    id={
                      editorMessage.kind === 'error'
                        ? 'display-name-error'
                        : undefined
                    }
                    role={editorMessage.kind === 'error' ? 'alert' : 'status'}
                  >
                    {editorMessage.text}
                  </p>
                ) : null}
                <button
                  className="button button--primary"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? 'Saving…' : 'Save player name'}
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <button
            className="button button--quiet"
            onClick={signIn}
            type="button"
          >
            Sign in
          </button>
          {hasAuthenticatedPlayerBinding() ? (
            <button
              className="button button--quiet"
              onClick={switchAccount}
              type="button"
            >
              Use a different account
            </button>
          ) : null}
        </>
      )}
      {actionFailed ? (
        <span className="account-control__error" role="alert">
          The account action could not start. Try again.
        </span>
      ) : null}
    </div>
  );
}
