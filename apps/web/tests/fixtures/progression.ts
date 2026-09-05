import type {
  CurrentProgressionProfile,
  ProgressionAchievement,
  ProgressionStandings,
  StandingsEntry,
} from '../../src/api/progression';

export const earnedAchievement: ProgressionAchievement = {
  code: 'first_quiz',
  description: 'Complete your first event quiz.',
  earned: true,
  progress: 3,
  target: 1,
  title: 'First Quiz',
};

export const pendingAchievement: ProgressionAchievement = {
  code: 'five_quizzes',
  description: 'Complete five event quizzes.',
  earned: false,
  progress: 3,
  target: 5,
  title: 'Campus Explorer',
};

export function buildProgressionProfile(
  overrides: Partial<CurrentProgressionProfile> = {},
): CurrentProgressionProfile {
  return {
    achievements: [earnedAchievement, pendingAchievement],
    currentStreak: 3,
    longestStreak: 7,
    playerName: 'naledi-star',
    points: 1240,
    rank: 4,
    ...overrides,
  };
}

export function buildStandingEntry(
  overrides: Partial<StandingsEntry> = {},
): StandingsEntry {
  return {
    currentStreak: 2,
    isCurrentPlayer: false,
    longestStreak: 5,
    playerName: 'campus-explorer',
    points: 1500,
    rank: 2,
    ...overrides,
  };
}

export function buildStandings(
  overrides: Partial<ProgressionStandings> = {},
): ProgressionStandings {
  const currentPlayer = buildStandingEntry({
    currentStreak: 3,
    isCurrentPlayer: true,
    longestStreak: 7,
    playerName: 'naledi-star',
    points: 1240,
    rank: 4,
  });

  return {
    currentPlayer,
    entries: [
      buildStandingEntry({
        playerName: 'wits-legend',
        points: 1900,
        rank: 1,
      }),
      currentPlayer,
    ],
    month: null,
    pagination: {
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalPlayers: 4,
    },
    period: 'all_time',
    ...overrides,
  };
}

export function profileResponse(
  overrides: Partial<CurrentProgressionProfile> = {},
  status = 200,
) {
  return jsonResponse(
    {
      ...buildProgressionProfile(overrides),
      requestId: 'profile-request',
    },
    status,
  );
}

export function standingsResponse(
  overrides: Partial<ProgressionStandings> = {},
  status = 200,
) {
  return jsonResponse(
    {
      ...buildStandings(overrides),
      requestId: 'standings-request',
    },
    status,
  );
}

export function progressionProblemResponse(
  code: string,
  status: number,
  requestId = 'progression-error-request',
) {
  return jsonResponse(
    {
      code,
      detail: 'Safe progression problem detail.',
      requestId,
      status,
      title: 'Progression request failed',
      type: 'about:blank',
    },
    status,
  );
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
