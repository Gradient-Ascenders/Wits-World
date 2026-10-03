import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { listOwnedCards, type OwnedCard } from '../../api/cards';
import {
  PlayerProfileError,
  requestPlayerProfile,
  type PlayerProfile,
  type ProfileEdit,
} from '../../api/player-profile';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { useModalFocus } from '../useModalFocus';
import { CardThumbnail } from '../cards/CollectibleCard';
import { CardPresentationDialog } from '../cards/CardPresentationDialog';
import { ProfileAvatar } from './PlayerShowcase';
import { StatusEmojiPicker } from './StatusEmojiPicker';

function editFromProfile(profile: PlayerProfile): ProfileEdit {
  return {
    expectedVersion: profile.version ?? 0,
    bio: profile.bio,
    degree: profile.degree,
    studyYear: profile.studyYear,
    avatarDataUrl: profile.avatarDataUrl,
    statusEmoji: profile.status?.emoji ?? '',
    statusText: profile.status?.text ?? '',
    statusExpiry: profile.status ? 'keep' : 'never',
    isPublic: profile.isPublic,
    activityVisible: profile.activityVisible,
    featuredOwnedCardIds: profile.featuredOwnedCardIds,
  };
}

export function ProfileEditor({
  apiBaseUrl,
  profile,
  section,
  onClose,
  onSaved,
  onReload,
}: {
  apiBaseUrl: string;
  profile: PlayerProfile;
  section: 'identity' | 'status' | 'cards';
  onClose: () => void;
  onSaved: (profile: PlayerProfile) => void;
  onReload: () => void;
}) {
  const getAccessToken = useApiAccessToken();
  const [edit, setEdit] = useState(() => editFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<PlayerProfileError | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const controller = useRef(new AbortController());
  const pending = useRef(false);
  const busy = saving || photoBusy;
  const trapFocus = useModalFocus({
    busy,
    dialogRef,
    initialFocusRef: closeRef,
  });
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  const title =
    section === 'cards'
      ? 'Edit favourite cards'
      : section === 'status'
        ? 'Set your status'
        : 'Edit profile';
  function change<K extends keyof ProfileEdit>(key: K, value: ProfileEdit[K]) {
    setEdit((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current || photoBusy) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await requestPlayerProfile({
          apiBaseUrl,
          getAccessToken,
          signal: controller.current.signal,
          edit,
        }),
      );
    } catch (failure) {
      if (!controller.current.signal.aborted)
        setError(
          failure instanceof PlayerProfileError
            ? failure
            : new PlayerProfileError(
                'unavailable',
                'Your profile could not be saved. Try again.',
              ),
        );
    } finally {
      pending.current = false;
      if (!controller.current.signal.aborted) setSaving(false);
    }
  }
  return createPortal(
    <div className="profile-editor-backdrop">
      <section
        className={`profile-editor${section === 'cards' ? ' profile-editor--cards' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-editor-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) onClose();
          }
          trapFocus(event);
        }}
      >
        <header className="profile-editor-heading">
          <h2 id="profile-editor-title">{title}</h2>
          <button
            className="button button--quiet"
            aria-label="Close profile editor"
            type="button"
            ref={closeRef}
            disabled={busy}
            onClick={onClose}
          >
            <XIcon size={22} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy} className="profile-editor-fields">
            {section === 'identity' ? (
              <>
                <div className="profile-photo-field">
                  <ProfileAvatar
                    profile={{
                      playerName: profile.playerName,
                      avatarDataUrl: edit.avatarDataUrl,
                    }}
                  />
                  <div>
                    <label className="button button--quiet profile-photo-upload">
                      Choose picture
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          event.target.value = '';
                          if (
                            !['image/jpeg', 'image/png', 'image/webp'].includes(
                              file.type,
                            ) ||
                            file.size > 8 * 1024 * 1024
                          ) {
                            setPhotoError(
                              'Choose a JPEG, PNG or WebP image under 8 MB.',
                            );
                            return;
                          }
                          setPhotoError('');
                          setPhotoBusy(true);
                          setPhoto(file);
                        }}
                      />
                    </label>
                    {edit.avatarDataUrl ? (
                      <button
                        type="button"
                        className="showcase-text-action"
                        onClick={() => {
                          setPhoto(null);
                          change('avatarDataUrl', null);
                        }}
                      >
                        Remove picture
                      </button>
                    ) : null}
                    <p>JPEG, PNG or WebP · up to 8 MB</p>
                  </div>
                </div>
                {photo ? (
                  <AvatarCrop
                    file={photo}
                    onReady={(data) => {
                      change('avatarDataUrl', data);
                      setPhotoBusy(false);
                    }}
                    onError={() => {
                      setPhotoError(
                        'This image could not be read. Choose another picture.',
                      );
                      setPhoto(null);
                      setPhotoBusy(false);
                    }}
                  />
                ) : null}
                {photoError ? (
                  <p role="alert" className="profile-editor-error">
                    {photoError}
                  </p>
                ) : null}
                <label>
                  Bio
                  <textarea
                    aria-label="Bio"
                    maxLength={280}
                    rows={3}
                    value={edit.bio}
                    placeholder="A little about you, your cards, or your campus adventures"
                    onChange={(event) => change('bio', event.target.value)}
                  />
                  <span className="profile-field-hint">
                    {edit.bio.length}/280
                  </span>
                </label>
                <div className="profile-field-pair">
                  <label>
                    Degree{' '}
                    <span className="profile-field-optional">(optional)</span>
                    <input
                      maxLength={100}
                      value={edit.degree}
                      placeholder="BSc Computer Science"
                      onChange={(event) => change('degree', event.target.value)}
                    />
                  </label>
                  <label>
                    Year of study{' '}
                    <span className="profile-field-optional">(optional)</span>
                    <input
                      maxLength={32}
                      value={edit.studyYear}
                      placeholder="Year 2"
                      onChange={(event) =>
                        change('studyYear', event.target.value)
                      }
                    />
                  </label>
                </div>
                <p className="profile-field-hint">
                  Add academic details only if you want to share them.
                </p>
                <div className="profile-sharing">
                  <label>
                    <input
                      type="checkbox"
                      checked={edit.isPublic}
                      onChange={(event) =>
                        change('isPublic', event.target.checked)
                      }
                    />
                    <span>
                      Make my profile visible to other players
                      <small>
                        Your picture, bio, status, favourite cards and earned
                        achievements.
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={edit.activityVisible}
                      onChange={(event) =>
                        change('activityVisible', event.target.checked)
                      }
                    />
                    <span>
                      Share my daily activity
                      <small>
                        Daily counts of completed challenges and matches.
                      </small>
                    </span>
                  </label>
                </div>
              </>
            ) : section === 'status' ? (
              <>
                <div className="profile-status-fields">
                  <StatusEmojiPicker
                    value={edit.statusEmoji}
                    disabled={busy}
                    onChange={(emoji) => change('statusEmoji', emoji)}
                  />
                  <label>
                    Status
                    <input
                      maxLength={80}
                      value={edit.statusText}
                      placeholder="In exam mode"
                      onChange={(event) =>
                        change('statusText', event.target.value)
                      }
                    />
                  </label>
                </div>
                <label>
                  Clear status
                  <select
                    value={edit.statusExpiry}
                    onChange={(event) =>
                      change(
                        'statusExpiry',
                        event.target.value as ProfileEdit['statusExpiry'],
                      )
                    }
                  >
                    {profile.status ? (
                      <option value="keep">Keep current expiry</option>
                    ) : null}
                    <option value="today">At the end of today</option>
                    <option value="week">In one week</option>
                    <option value="never">Never</option>
                  </select>
                </label>
                <p className="profile-field-hint">
                  Expiry follows Johannesburg time.
                </p>
                <button
                  className="showcase-text-action"
                  type="button"
                  onClick={() => {
                    change('statusText', '');
                    change('statusEmoji', '');
                    change('statusExpiry', 'never');
                  }}
                >
                  Clear status now
                </button>
              </>
            ) : (
              <ProfileCardPicker
                apiBaseUrl={apiBaseUrl}
                selected={edit.featuredOwnedCardIds}
                featured={profile}
                onChange={(ids) => change('featuredOwnedCardIds', ids)}
              />
            )}
          </fieldset>
          {error ? (
            <div className="profile-editor-error" role="alert">
              <p>{error.message}</p>
              {error.failure === 'conflict' ? (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={onReload}
                >
                  Reload profile
                </button>
              ) : error.failure === 'authorization' ? (
                <p>Close the editor and sign in again to continue.</p>
              ) : null}
            </div>
          ) : null}
          <footer className="profile-editor-footer">
            <button
              className="button button--quiet"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button"
              type="submit"
              disabled={busy || error?.failure === 'conflict'}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function AvatarCrop({
  file,
  onReady,
  onError,
}: {
  file: File;
  onReady: (data: string) => void;
  onError: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    let active = true;
    setImage(null);
    setZoom(1);
    setHorizontal(50);
    setVertical(50);
    const source = URL.createObjectURL(file);
    const photo = new Image();
    photo.onload = () => {
      if (active) setImage(photo);
    };
    photo.onerror = () => {
      if (active) errorRef.current();
    };
    photo.src = source;
    return () => {
      active = false;
      URL.revokeObjectURL(source);
    };
  }, [file]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) {
      errorRef.current();
      return;
    }
    const size = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    context.fillStyle = '#0d1b31';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      ((image.naturalWidth - size) * horizontal) / 100,
      ((image.naturalHeight - size) * vertical) / 100,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    readyRef.current(canvas.current.toDataURL('image/jpeg', 0.82));
  }, [image, zoom, horizontal, vertical]);
  return (
    <div className="avatar-crop">
      <canvas
        ref={canvas}
        width={256}
        height={256}
        aria-label="Profile picture crop preview"
      />
      <div>
        <label>
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <label>
          Horizontal position
          <input
            type="range"
            min={0}
            max={100}
            value={horizontal}
            onChange={(event) => setHorizontal(Number(event.target.value))}
          />
        </label>
        <label>
          Vertical position
          <input
            type="range"
            min={0}
            max={100}
            value={vertical}
            onChange={(event) => setVertical(Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

function ProfileCardPicker({
  apiBaseUrl,
  selected,
  featured,
  onChange,
}: {
  apiBaseUrl: string;
  selected: string[];
  featured: PlayerProfile;
  onChange: (ids: string[]) => void;
}) {
  const getAccessToken = useApiAccessToken();
  const [collection, setCollection] = useState<OwnedCard[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [inspected, setInspected] = useState<OwnedCard | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void listOwnedCards({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((cards) => {
        if (!controller.signal.aborted) setCollection(cards);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Your collection could not be loaded. Try again.');
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, revision]);
  function move(index: number, delta: number) {
    const ids = selected.slice();
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    onChange(ids);
    setNotice(`Card moved to position ${index + delta + 1}.`);
  }
  const visible = collection?.filter((card) =>
    card.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="profile-card-picker">
      <p>
        Choose up to four cards from your collection, in your favourite order.
      </p>
      <ol
        className="profile-selected-cards"
        aria-label="Selected favourite cards"
      >
        {selected.map((id, index) => {
          const card =
            collection?.find((entry) => entry.ownedCardId === id) ??
            featured.featuredCards[featured.featuredOwnedCardIds.indexOf(id)];
          return (
            <li key={id}>
              <span className="profile-selected-number">{index + 1}</span>
              <span>{card?.name ?? 'Card no longer available'}</span>
              <div>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move ${card?.name ?? 'card'} left`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeftIcon size={18} aria-hidden="true" />
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={index === selected.length - 1}
                  aria-label={`Move ${card?.name ?? 'card'} right`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRightIcon size={18} aria-hidden="true" />
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  aria-label={`Remove ${card?.name ?? 'card'}`}
                  onClick={() =>
                    onChange(selected.filter((entry) => entry !== id))
                  }
                >
                  <TrashIcon size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p role="status" className="profile-picker-notice">
        {notice || `${selected.length} of 4 selected`}
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !collection ? (
        <p role="status">Loading your cards…</p>
      ) : !collection.length ? (
        <p>
          No cards yet. Complete a challenge or choose your starter cards in
          your collection.
        </p>
      ) : (
        <>
          <label>
            Search your cards
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="profile-picker-grid">
            {visible?.map((card) => {
              const picked = selected.includes(card.ownedCardId);
              return (
                <div
                  key={card.ownedCardId}
                  className={
                    picked
                      ? 'profile-picker-card profile-picker-card--selected'
                      : 'profile-picker-card'
                  }
                >
                  <CardThumbnail
                    card={card}
                    accessibleLabel={`Inspect ${card.name}, copy ${collection.filter((entry) => entry.cardDefinitionId === card.cardDefinitionId).findIndex((entry) => entry.ownedCardId === card.ownedCardId) + 1}`}
                    onClick={() => setInspected(card)}
                  />
                  <button
                    className="button button--quiet profile-picker-membership"
                    type="button"
                    aria-label={`${picked ? 'Remove' : 'Select'} ${card.name}, copy ${collection.filter((entry) => entry.cardDefinitionId === card.cardDefinitionId).findIndex((entry) => entry.ownedCardId === card.ownedCardId) + 1}`}
                    onClick={() => {
                      if (picked)
                        onChange(
                          selected.filter((id) => id !== card.ownedCardId),
                        );
                      else if (selected.length < 4)
                        onChange([...selected, card.ownedCardId]);
                      else
                        setNotice(
                          'Four cards selected. Remove one to choose another.',
                        );
                    }}
                  >
                    {picked ? (
                      <TrashIcon size={16} aria-hidden="true" />
                    ) : (
                      <CheckIcon size={16} aria-hidden="true" />
                    )}
                    {picked
                      ? `Remove · ${selected.indexOf(card.ownedCardId) + 1}`
                      : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
          {!visible?.length ? <p>No cards match this search.</p> : null}
          {inspected ? (
            <CardPresentationDialog
              card={inspected}
              onClose={() => setInspected(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
