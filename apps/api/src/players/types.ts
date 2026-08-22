export type PlayerRole = 'player' | 'author';

export type PlayerLifecycleStatus = 'active' | 'deletion_pending' | 'deleted';

export interface LocalPlayer {
  id: string;
  playerName: string | null;
  role: PlayerRole;
  lifecycleStatus: PlayerLifecycleStatus;
}

export type AccountDeletionStatus = 'pending' | 'retry_pending' | 'completed';

export interface AccountDeletionRequest {
  id: string;
  requestedAt: Date;
  completedAt: Date | null;
  status: AccountDeletionStatus;
  failureReason: string | null;
}

export type AccountDeletionFailureReason =
  'auth0_deletion_failed' | 'local_cleanup_failed';
