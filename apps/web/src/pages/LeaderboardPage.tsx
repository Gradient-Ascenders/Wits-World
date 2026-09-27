import { TrophyIcon } from '@phosphor-icons/react';

import { CampusStandings } from './ProfilePage';
import './profile.css';

export default function LeaderboardPage({
  apiBaseUrl,
}: {
  apiBaseUrl: string;
}) {
  return (
    <div className="profile-page leaderboard-page">
      <header className="profile-page__header">
        <span className="profile-avatar" aria-hidden="true">
          <TrophyIcon size={24} />
        </span>
        <div>
          <p className="eyebrow">Campus competition</p>
          <h1>Leaderboard</h1>
        </div>
      </header>
      <CampusStandings apiBaseUrl={apiBaseUrl} />
    </div>
  );
}
