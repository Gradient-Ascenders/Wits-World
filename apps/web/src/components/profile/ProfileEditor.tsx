import { XIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  PlayerProfileError,
  requestPlayerProfile,
  type PlayerProfile,
  type ProfileEdit,
} from '../../api/player-profile';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { useModalFocus } from '../useModalFocus';
import { ProfileCardPicker } from './ProfileCardPicker';
import { ProfileAvatar } from './PlayerShowcase';
import { StatusEmojiPicker } from './StatusEmojiPicker';
import { AvatarCrop } from './AvatarCrop';

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
                  <div className="profile-photo-details">
                    <div className="profile-photo-actions">
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
                              ![
                                'image/jpeg',
                                'image/png',
                                'image/webp',
                              ].includes(file.type) ||
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
                    </div>
                    <p>JPEG, PNG or WebP · up to 8 MB</p>
                  </div>
                </div>
                {photo ? (
                  <AvatarCrop
                    file={photo}
                    disabled={busy}
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
                disabled={busy}
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
