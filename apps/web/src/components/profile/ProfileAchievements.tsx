import type { PlayerProfile } from '../../api/player-profile';
import achievementArtwork from '../../assets/profile/achievements.webp';
import { MedalIcon } from '@phosphor-icons/react';

const badgePositions: Record<string, string> = {
  first_quiz: '0% 0%',
  perfect_quiz: '50% 0%',
  five_quizzes: '100% 0%',
  first_cpu_win: '0% 100%',
  five_cpu_matches: '50% 100%',
  three_day_streak: '100% 100%',
};

export function ProfileAchievements({ profile }: { profile: PlayerProfile }) {
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
              <details
                className={`showcase-achievement${achievement.earned ? ' showcase-achievement--earned' : ''}`}
              >
                <summary>
                  {badgePositions[achievement.code] ? (
                    <span
                      className="showcase-badge-art"
                      aria-hidden="true"
                      style={{
                        backgroundImage: `url(${achievementArtwork})`,
                        backgroundPosition: badgePositions[achievement.code],
                      }}
                    />
                  ) : (
                    <MedalIcon
                      className="showcase-badge-art"
                      aria-hidden="true"
                    />
                  )}
                  <span className="showcase-badge-name">
                    {achievement.title}
                  </span>
                  <span className="showcase-badge-state">
                    {achievement.earned ? 'Earned' : 'In progress'}
                  </span>
                </summary>
                <div className="showcase-badge-details">
                  <p>{achievement.description}</p>
                  <progress
                    aria-label={`${achievement.title}: ${achievement.earned ? 'Earned' : 'In progress'}, ${achievement.earned ? `current progress ${achievement.progress}, target ${achievement.target}` : `${achievement.progress} of ${achievement.target}`}`}
                    max={achievement.target}
                    value={achievement.progress}
                  />
                  <p>
                    {achievement.earned
                      ? `Current ${achievement.progress} · target ${achievement.target}`
                      : `${achievement.progress} of ${achievement.target}`}
                  </p>
                </div>
              </details>
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
    </section>
  );
}
