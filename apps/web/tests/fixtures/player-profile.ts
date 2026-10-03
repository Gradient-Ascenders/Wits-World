import type { PlayerProfile } from '../../src/api/player-profile';
import { buildProgressionProfile } from './progression';

export function buildPlayerProfile(
  overrides: Partial<PlayerProfile> = {},
): PlayerProfile {
  return {
    ...buildProgressionProfile(),
    isOwner: true,
    version: 0,
    bio: '',
    degree: '',
    studyYear: '',
    avatarDataUrl: null,
    status: null,
    isPublic: false,
    activityVisible: false,
    featuredCards: [],
    featuredOwnedCardIds: [],
    activity: [],
    activityThrough: '2026-10-02',
    ...overrides,
  };
}

export const profileExtension = {
  isOwner: true,
  version: 0,
  bio: '',
  degree: '',
  studyYear: '',
  avatarDataUrl: null,
  status: null,
  isPublic: false,
  activityVisible: false,
  featuredCards: [],
  featuredOwnedCardIds: [],
  activity: [],
  activityThrough: '2026-10-02',
};
