export type PlayerRole = 'player' | 'author';

export type PlayerLifecycleStatus = 'active' | 'deletion_pending' | 'deleted';

export interface LocalPlayer {
  id: string;
  role: PlayerRole;
  lifecycleStatus: PlayerLifecycleStatus;
}
