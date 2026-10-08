import { MedalIcon, SealCheckIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccessibilityPreferences } from '../../accessibility/preferences';
import type { PlayerProfile } from '../../api/player-profile';
import type { ProgressionAchievement } from '../../api/progression';
import achievement384 from '../../assets/profile/achievements-384.webp';
import achievement768 from '../../assets/profile/achievements-768.webp';
import achievement1152 from '../../assets/profile/achievements-1152.webp';
import achievement1536 from '../../assets/profile/achievements-1536.webp';
import { useModalFocus } from '../useModalFocus';

const badgePositions: Record<string, readonly [string, string]> = {
  first_quiz: ['0%', '0%'],
  perfect_quiz: ['-100%', '0%'],
  five_quizzes: ['-200%', '0%'],
  first_cpu_win: ['0%', '-100%'],
  five_cpu_matches: ['-100%', '-100%'],
  three_day_streak: ['-200%', '-100%'],
};

const achievementSrcSet = `${achievement384} 384w, ${achievement768} 768w, ${achievement1152} 1152w, ${achievement1536} 1536w`;

function BadgeArtwork({
  code,
  enlarged = false,
  fallbackImage,
}: {
  code: string;
  enlarged?: boolean;
  fallbackImage?: HTMLImageElement;
}) {
  const { scale } = useAccessibilityPreferences();
  const [ready, setReady] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !fallbackImage) return;
      canvas.getContext('2d')?.drawImage(fallbackImage, 0, 0, 1536, 1024);
      return () => {
        // Release the backing buffer on successful replacement or dialog close.
        canvas.width = 0;
        canvas.height = 0;
      };
    },
    [fallbackImage],
  );
  // Source-size rem units use the initial font size, so include the UI scale.
  const sourceWidth = `${((enlarged ? 36 : 21) * Number(scale)) / 100}rem`;
  return badgePositions[code] ? (
    <span className="showcase-badge-art" aria-hidden="true">
      {enlarged && !ready && fallbackImage ? (
        <canvas
          width="1536"
          height="1024"
          style={{
            left: badgePositions[code][0],
            top: badgePositions[code][1],
          }}
          ref={previewRef}
        />
      ) : null}
      {enlarged && !ready && !fallbackImage ? (
        <MedalIcon className="showcase-badge-placeholder" aria-hidden="true" />
      ) : null}
      <img
        ref={imageRef}
        alt=""
        decoding="async"
        height="1024"
        loading={enlarged ? 'eager' : 'lazy'}
        // The image spans all three atlas columns; the wrapper clips one cell.
        sizes={enlarged ? sourceWidth : `auto, ${sourceWidth}`}
        src={achievement1536}
        srcSet={achievementSrcSet}
        onLoad={
          enlarged
            ? (event) => {
                const image = event.currentTarget;
                const source = image.currentSrc;
                void image
                  .decode()
                  .then(() => {
                    if (
                      imageRef.current === image &&
                      image.currentSrc === source &&
                      image.naturalWidth > 0
                    )
                      setReady(true);
                  })
                  .catch(() => {
                    // Keep the preview/placeholder if loading or decoding fails.
                  });
              }
            : undefined
        }
        onError={enlarged ? () => setReady(false) : undefined}
        style={{
          left: badgePositions[code][0],
          top: badgePositions[code][1],
          visibility: enlarged && !ready ? 'hidden' : undefined,
        }}
        width="1536"
      />
    </span>
  ) : (
    <MedalIcon className="showcase-badge-art" aria-hidden="true" />
  );
}

export function ProfileAchievements({ profile }: { profile: PlayerProfile }) {
  const [selected, setSelected] = useState<ProgressionAchievement | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<HTMLImageElement>();
  const earned = profile.achievements.filter(
    (achievement) => achievement.earned,
  );
  return (
    <section
      className="showcase-achievements"
      aria-labelledby="profile-achievements-heading"
    >
      <div className="showcase-section-heading">
        <h2 id="profile-achievements-heading">Achievements</h2>
        <span>{earned.length} earned</span>
      </div>
      {profile.achievements.length ? (
        <ul className="showcase-badges" aria-label="Achievement progress">
          {profile.achievements.map((achievement) => (
            <li key={achievement.code}>
              <button
                type="button"
                aria-label={`${achievement.title}: ${achievement.earned ? 'Earned' : 'In progress'}`}
                aria-haspopup="dialog"
                className={`showcase-achievement${achievement.earned ? ' showcase-achievement--earned' : ''}`}
                onClick={(event) => {
                  const image = event.currentTarget.querySelector('img');
                  setSelectedArtwork(
                    image?.complete && image.naturalWidth > 0
                      ? image
                      : undefined,
                  );
                  setSelected(achievement);
                }}
              >
                <BadgeArtwork code={achievement.code} />
                <span className="showcase-badge-name">{achievement.title}</span>
                <span className="showcase-badge-state">
                  {achievement.earned ? 'Earned' : 'In progress'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="showcase-empty">
          {profile.isOwner
            ? 'No achievements are available yet.'
            : 'No achievements earned yet.'}
        </p>
      )}
      {selected ? (
        <AchievementDialog
          achievement={selected}
          fallbackImage={selectedArtwork}
          playerName={profile.playerName}
          onClose={() => {
            setSelected(null);
            setSelectedArtwork(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

function AchievementDialog({
  achievement,
  fallbackImage,
  playerName,
  onClose,
}: {
  achievement: ProgressionAchievement;
  fallbackImage?: HTMLImageElement;
  playerName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = `${titleId}-description`;
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const trapFocus = useModalFocus({
    busy: false,
    dialogRef,
    initialFocusRef: closeRef,
  });
  return createPortal(
    <div
      className="profile-editor-backdrop achievement-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        tabIndex={-1}
        className={`achievement-dialog${achievement.earned ? ' achievement-dialog--earned' : ''}`}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else trapFocus(event);
        }}
      >
        <div className="achievement-dialog-art">
          <BadgeArtwork
            code={achievement.code}
            enlarged
            fallbackImage={fallbackImage}
          />
          <button
            type="button"
            ref={closeRef}
            className="achievement-dialog-close"
            aria-label={`Close ${achievement.title} details`}
            onClick={onClose}
          >
            <XIcon size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="achievement-dialog-content">
          <div className="achievement-dialog-title">
            <h2 id={titleId}>{achievement.title}</h2>
            <span className="achievement-dialog-state">
              {achievement.earned ? 'Earned' : 'In progress'}
            </span>
          </div>
          <p id={descriptionId}>{achievement.description}</p>
          {achievement.earned ? (
            <p className="achievement-dialog-earned">
              <SealCheckIcon size={24} aria-hidden="true" />
              <span>
                Earned by <strong>{playerName}</strong>
              </span>
            </p>
          ) : (
            <div className="achievement-dialog-progress">
              <div>
                <span>Progress</span>
                <strong>
                  {achievement.progress} of {achievement.target}
                </strong>
              </div>
              <progress
                aria-label={`${achievement.title}: In progress, ${achievement.progress} of ${achievement.target}`}
                max={achievement.target}
                value={achievement.progress}
              />
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
