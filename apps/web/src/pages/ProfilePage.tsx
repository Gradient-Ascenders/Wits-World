import { PlayerShowcase } from '../components/profile/PlayerShowcase';
import './profile.css';

interface ProfilePageProps {
  apiBaseUrl: string;
  playerName?: string;
}

export default function ProfilePage({
  apiBaseUrl,
  playerName,
}: ProfilePageProps) {
  return <PlayerShowcase apiBaseUrl={apiBaseUrl} playerName={playerName} />;
}
