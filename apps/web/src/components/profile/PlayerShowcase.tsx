import { useAuth0 } from '@auth0/auth0-react';
import {
  CardsIcon,
  PencilSimpleIcon,
  PlusIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  PlayerProfileError,
  requestPlayerProfile,
  type PlayerProfile,
} from '../../api/player-profile';
import type { CardPresentation } from '../../api/cards';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { PageLoadingState } from '../LoadingState';
import { CardThumbnail } from '../cards/CollectibleCard';
import { CardPresentationDialog } from '../cards/CardPresentationDialog';
import { ProfileEditor } from './ProfileEditor';
import { ProfileActivity } from './ProfileActivity';
import { ProfileAchievements } from './ProfileAchievements';
import '../cards/cards.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: PlayerProfileError }
  | { status: 'ready'; profile: PlayerProfile };

export function ProfileAvatar({
  profile,
}: {
  profile: Pick<PlayerProfile, 'avatarDataUrl' | 'playerName'>;
}) {
  return (
    <span className="showcase-avatar" aria-hidden="true">
      {profile.avatarDataUrl ? (
        <img src={profile.avatarDataUrl} alt="" width={112} height={112} />
      ) : (
        <span>
          {profile.playerName
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => Array.from(part)[0])
            .join('')
            .toLocaleUpperCase() || <UserIcon size={40} />}
        </span>
      )}
    </span>
  );
}

export function PlayerShowcase({
  apiBaseUrl,
  playerName,
}: {
  apiBaseUrl: string;
  playerName?: string;
}) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<'identity' | 'status' | 'cards' | null>(
    null,
  );
  const [inspected, setInspected] = useState<CardPresentation | null>(null);
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recoverFocus = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setEditor(null);
    setInspected(null);
    setNotice('');
    void requestPlayerProfile({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
      ...(playerName === undefined ? {} : { playerName }),
    })
      .then((profile) => {
        if (!controller.signal.aborted) setState({ status: 'ready', profile });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            error:
              error instanceof PlayerProfileError
                ? error
                : new PlayerProfileError(
                    'unavailable',
                    'Check your connection and try again.',
                  ),
          });
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, playerName, revision]);
  useEffect(() => {
    if (recoverFocus.current && state.status !== 'loading') {
      recoverFocus.current = false;
      headingRef.current?.focus();
    }
  }, [state.status]);
  useEffect(() => {
    const expiry =
      state.status === 'ready' ? state.profile.status?.expiresAt : null;
    if (!expiry) return;
    const refresh = () => setClock(Date.now());
    const timer = window.setInterval(refresh, 30000);
    const deadline = window.setTimeout(
      refresh,
      Math.min(Math.max(Date.parse(expiry) - Date.now(), 0), 2147483647),
    );
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(deadline);
    };
  }, [state]);

  if (state.status === 'loading')
    return (
      <PageLoadingState
        title="Loading player profile"
        description="Getting your cards, activity and achievements…"
      />
    );
  if (state.status === 'error')
    return (
      <div className="player-profile profile-error">
        <h1 ref={headingRef} tabIndex={-1}>
          Player profile
        </h1>
        <div className="state-message state-message--error" role="alert">
          <h2>
            {state.error.failure === 'not_found' ||
            state.error.failure === 'account_unavailable'
              ? 'Profile unavailable'
              : 'Your profile could not be loaded'}
          </h2>
          <p>{state.error.message}</p>
          {state.error.failure === 'authorization' ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                void loginWithRedirect({
                  appState: {
                    returnTo: playerName
                      ? `/players/${encodeURIComponent(playerName)}`
                      : '/profile',
                  },
                }).catch(() =>
                  setNotice('Sign-in could not start. Try again.'),
                );
              }}
            >
              Sign in again
            </button>
          ) : state.error.failure === 'account_unavailable' ? (
            <Link className="button button--quiet" href="/account">
              Account settings
            </Link>
          ) : state.error.failure !== 'not_found' ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                recoverFocus.current = true;
                setRevision((value) => value + 1);
              }}
            >
              Try again
            </button>
          ) : (
            <Link className="button button--quiet" href="/leaderboard">
              Find players
            </Link>
          )}
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      </div>
    );

  const profile = state.profile;
  const status =
    profile.status &&
    (!profile.status.expiresAt || Date.parse(profile.status.expiresAt) > clock)
      ? profile.status
      : null;
  const emptySlots = profile.isOwner ? 4 - profile.featuredCards.length : 0;
  return (
    <div className="player-profile">
      <header className="showcase-identity">
        <ProfileAvatar profile={profile} />
        <div className="showcase-identity__text">
          <h1 ref={headingRef} tabIndex={-1}>
            {profile.playerName}
          </h1>
          {profile.isOwner ? (
            <button
              className={`showcase-status${status ? ' showcase-status--set' : ' showcase-status--empty'}`}
              type="button"
              aria-label={
                !status
                  ? 'Set a status'
                  : !status.text
                    ? `Edit status: ${status.emoji}`
                    : undefined
              }
              onClick={() => setEditor('status')}
            >
              <span className="showcase-status__icon" aria-hidden="true">
                {status?.emoji || <PlusIcon size={16} />}
              </span>
              {status?.text ? (
                <>
                  <span className="showcase-status__label">{status.text}</span>
                  <PencilSimpleIcon aria-hidden="true" size={14} />
                </>
              ) : null}
            </button>
          ) : status ? (
            <p className="showcase-status showcase-status--set">
              <span
                className="showcase-status__icon"
                aria-hidden={!!status.text}
              >
                {status.emoji}
              </span>
              <span className="showcase-status__label">{status.text}</span>
            </p>
          ) : null}
        </div>
        {profile.degree || profile.studyYear || profile.bio ? (
          <div className="showcase-identity__details">
            {profile.degree || profile.studyYear ? (
              <p className="showcase-academic">
                {[profile.degree, profile.studyYear]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            {profile.bio ? <p className="showcase-bio">{profile.bio}</p> : null}
          </div>
        ) : null}
        {profile.isOwner ? (
          <div className="showcase-owner-actions">
            <button
              className="button button--quiet showcase-edit-action"
              type="button"
              onClick={() => setEditor('identity')}
            >
              <PencilSimpleIcon size={18} aria-hidden="true" />
              Edit profile
            </button>
            {!profile.isPublic ? (
              <span className="showcase-privacy">Visible only to you</span>
            ) : null}
            <p className="showcase-save-status" role="status">
              {notice}
            </p>
          </div>
        ) : null}
      </header>
      <section
        className="showcase-cards"
        aria-labelledby="favourite-cards-heading"
      >
        <div className="showcase-section-heading">
          <h2 id="favourite-cards-heading">Favourite cards</h2>
          {profile.isOwner ? (
            <button
              type="button"
              className="button button--quiet showcase-edit-action"
              onClick={() => setEditor('cards')}
            >
              <CardsIcon size={18} aria-hidden="true" />
              Edit showcase
            </button>
          ) : null}
        </div>
        {profile.featuredCards.length || profile.isOwner ? (
          <div className="showcase-card-grid">
            {profile.featuredCards.map((card, index) => (
              <CardThumbnail
                key={`${card.cardDefinitionId}-${index}`}
                card={card}
                accessibleLabel={`Inspect ${card.name}`}
                loading="eager"
                nameplate={null}
                onClick={() => setInspected(card)}
              />
            ))}
            {Array.from({ length: emptySlots }, (_, index) => (
              <button
                key={index}
                className="showcase-card-empty"
                type="button"
                onClick={() => setEditor('cards')}
              >
                <PlusIcon size={28} aria-hidden="true" />
                <span>Choose a card</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="showcase-empty">No favourite cards selected yet.</p>
        )}
      </section>
      <div className="showcase-progress">
        <ProfileActivity profile={profile} />
        <ProfileAchievements profile={profile} />
      </div>
      {editor ? (
        <ProfileEditor
          apiBaseUrl={apiBaseUrl}
          profile={profile}
          section={editor}
          onClose={() => setEditor(null)}
          onReload={() => {
            setEditor(null);
            recoverFocus.current = true;
            setRevision((value) => value + 1);
          }}
          onSaved={(next) => {
            setState({ status: 'ready', profile: next });
            setClock(Date.now());
            setEditor(null);
            setNotice('Profile saved.');
          }}
        />
      ) : null}
      {inspected ? (
        <CardPresentationDialog
          card={inspected}
          onClose={() => setInspected(null)}
        />
      ) : null}
    </div>
  );
}
