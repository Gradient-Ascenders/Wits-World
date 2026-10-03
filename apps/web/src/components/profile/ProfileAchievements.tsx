import { MedalIcon, SealCheckIcon, XIcon } from '@phosphor-icons/react';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerProfile } from '../../api/player-profile';
import type { ProgressionAchievement } from '../../api/progression';
import achievementArtwork from '../../assets/profile/achievements.webp';
import { useModalFocus } from '../useModalFocus';

const badgePositions: Record<string, string> = {
  first_quiz: '0% 0%',
  perfect_quiz: '50% 0%',
  five_quizzes: '100% 0%',
  first_cpu_win: '0% 100%',
  five_cpu_matches: '50% 100%',
  three_day_streak: '100% 100%',
};

function BadgeArtwork({ code }: { code: string }) {
  return badgePositions[code] ? (
    <span
      className="showcase-badge-art"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${achievementArtwork})`,
        backgroundPosition: badgePositions[code],
      }}
    />
  ) : (
    <MedalIcon className="showcase-badge-art" aria-hidden="true" />
  );
}

export function ProfileAchievements({ profile }: { profile: PlayerProfile }) {
  const [selected, setSelected] = useState<ProgressionAchievement | null>(null);
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
                onClick={() => setSelected(achievement)}
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
          playerName={profile.playerName}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}

function AchievementDialog({
  achievement,
  playerName,
  onClose,
}: {
  achievement: ProgressionAchievement;
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
          <BadgeArtwork code={achievement.code} />
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
