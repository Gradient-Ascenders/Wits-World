export type AnalyticsReport =
  'overview' | 'locations' | 'questions' | 'rewards';

export type AuthorWorkspaceRoute =
  | { mode: 'list'; section: 'events' }
  | { mode: 'new'; section: 'events' }
  | {
      eventId: string;
      mode: 'edit';
      section: 'events';
    }
  | {
      challengeId?: string;
      eventId: string;
      mode: 'challenge';
      section: 'events';
      tab?: 'details' | 'review' | 'history';
    }
  | {
      challengeId?: string;
      eventId: string;
      mode: 'questions';
      questionId?: string;
      questionMode: 'detail' | 'edit' | 'list' | 'new';
      section: 'events';
    }
  | { mode: 'list'; section: 'cards' }
  | { mode: 'new'; section: 'cards' }
  | {
      cardId: string;
      mode: 'detail' | 'edit';
      section: 'cards';
      tab?: 'details' | 'review';
    }
  | { mode: 'list'; section: 'review' }
  | { caseId?: string; mode: 'detail' | 'list'; section: 'playerReview' }
  | { mode: 'list'; section: 'analytics'; report?: AnalyticsReport }
  | { mode: 'list'; section: 'placement' }
  | { mode: 'list' | 'new'; section: 'campaigns' }
  | {
      campaignId: string;
      mode: 'detail' | 'edit';
      section: 'campaigns';
      tab?: 'details' | 'review' | 'history';
    };

const AUTHOR_ROOT = '/author';

export function parseAuthorWorkspaceRoute(
  pathname: string,
): AuthorWorkspaceRoute {
  const segments = pathname
    .replace(/^\/author\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] === 'review') {
    return { mode: 'list', section: 'review' };
  }

  if (segments[0] === 'player-review') {
    return segments[1]
      ? { caseId: segments[1], mode: 'detail', section: 'playerReview' }
      : { mode: 'list', section: 'playerReview' };
  }

  if (segments[0] === 'analytics') {
    const report = segments[1];
    return {
      mode: 'list',
      section: 'analytics',
      report:
        report === 'locations' || report === 'questions' || report === 'rewards'
          ? report
          : 'overview',
    };
  }

  if (segments[0] === 'placement') {
    return { mode: 'list', section: 'placement' };
  }

  if (segments[0] === 'campaigns') {
    if (segments[1] === 'new' && segments.length === 2) {
      return { mode: 'new', section: 'campaigns' };
    }
    if (segments[1] && segments.length <= 3) {
      return {
        campaignId: segments[1],
        mode: segments[2] === 'edit' ? 'edit' : 'detail',
        section: 'campaigns',
        ...(segments[2] === 'review' || segments[2] === 'history'
          ? { tab: segments[2] }
          : {}),
      };
    }
    return { mode: 'list', section: 'campaigns' };
  }

  if (segments[0] === 'cards') {
    if (segments[1] === 'new' && segments.length === 2) {
      return { mode: 'new', section: 'cards' };
    }
    if (segments[1] && segments.length <= 3) {
      return {
        cardId: segments[1],
        mode: segments[2] === 'edit' ? 'edit' : 'detail',
        section: 'cards',
        ...(segments[2] === 'review' ? { tab: 'review' as const } : {}),
      };
    }
    return { mode: 'list', section: 'cards' };
  }

  if (segments[0] !== 'events') {
    return { mode: 'list', section: 'events' };
  }
  if (segments[1] === 'new' && segments.length === 2) {
    return { mode: 'new', section: 'events' };
  }
  if (!segments[1]) {
    return { mode: 'list', section: 'events' };
  }

  const eventId = segments[1];
  if (
    segments[2] === 'details' ||
    segments[2] === 'review' ||
    segments[2] === 'history'
  ) {
    return { eventId, mode: 'challenge', section: 'events', tab: segments[2] };
  }
  if (segments[2] === 'edit') {
    return { eventId, mode: 'edit', section: 'events' };
  }
  if (segments[2] === 'challenge') {
    return { eventId, mode: 'challenge', section: 'events' };
  }
  if (segments[2] === 'questions') {
    return {
      eventId,
      mode: 'questions',
      questionMode: 'list',
      section: 'events',
    };
  }
  if (segments[2] === 'challenges' && segments[3]) {
    const challengeId = segments[3];
    if (segments[4] === 'review') {
      return {
        challengeId,
        eventId,
        mode: 'challenge',
        section: 'events',
        tab: 'review',
      };
    }
    if (segments[4] === 'questions') {
      if (segments[5] === 'new') {
        return {
          challengeId,
          eventId,
          mode: 'questions',
          questionMode: 'new',
          section: 'events',
        };
      }
      if (segments[5]) {
        return {
          challengeId,
          eventId,
          mode: 'questions',
          questionId: segments[5],
          questionMode: segments[6] === 'edit' ? 'edit' : 'detail',
          section: 'events',
        };
      }
      return {
        challengeId,
        eventId,
        mode: 'questions',
        questionMode: 'list',
        section: 'events',
      };
    }
    if (segments.length === 4) {
      return { challengeId, eventId, mode: 'challenge', section: 'events' };
    }
  }

  return { eventId, mode: 'challenge', section: 'events' };
}

export const authorPaths = {
  campaigns: `${AUTHOR_ROOT}/campaigns`,
  analytics: `${AUTHOR_ROOT}/analytics`,
  analyticsReport: (report: AnalyticsReport) =>
    report === 'overview'
      ? `${AUTHOR_ROOT}/analytics`
      : `${AUTHOR_ROOT}/analytics/${report}`,
  placement: `${AUTHOR_ROOT}/placement`,
  campaign: (campaignId: string) =>
    `${AUTHOR_ROOT}/campaigns/${encodeURIComponent(campaignId)}`,
  editCampaign: (campaignId: string) =>
    `${AUTHOR_ROOT}/campaigns/${encodeURIComponent(campaignId)}/edit`,
  campaignReview: (campaignId: string) =>
    `${AUTHOR_ROOT}/campaigns/${encodeURIComponent(campaignId)}/review`,
  campaignHistory: (campaignId: string) =>
    `${AUTHOR_ROOT}/campaigns/${encodeURIComponent(campaignId)}/history`,
  cards: `${AUTHOR_ROOT}/cards`,
  card: (cardId: string) =>
    `${AUTHOR_ROOT}/cards/${encodeURIComponent(cardId)}`,
  editCard: (cardId: string) =>
    `${AUTHOR_ROOT}/cards/${encodeURIComponent(cardId)}/edit`,
  events: `${AUTHOR_ROOT}/events`,
  event: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}`,
  eventDetails: (eventId: string) => `${authorPaths.event(eventId)}/details`,
  eventReview: (eventId: string) => `${authorPaths.event(eventId)}/review`,
  eventHistory: (eventId: string) => `${authorPaths.event(eventId)}/history`,
  editEvent: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/edit`,
  eventChallenge: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/challenge`,
  challenge: (eventId: string, challengeId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/challenges/${encodeURIComponent(challengeId)}`,
  challengeReview: (eventId: string, challengeId: string) =>
    `${authorPaths.challenge(eventId, challengeId)}/review`,
  eventQuestions: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/questions`,
  questions: (eventId: string, challengeId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/challenges/${encodeURIComponent(challengeId)}/questions`,
  question: (eventId: string, challengeId: string, questionId: string) =>
    `${authorPaths.questions(eventId, challengeId)}/${encodeURIComponent(questionId)}`,
  editQuestion: (eventId: string, challengeId: string, questionId: string) =>
    `${authorPaths.question(eventId, challengeId, questionId)}/edit`,
  newCard: `${AUTHOR_ROOT}/cards/new`,
  newCampaign: `${AUTHOR_ROOT}/campaigns/new`,
  newEvent: `${AUTHOR_ROOT}/events/new`,
  newQuestion: (eventId: string, challengeId: string) =>
    `${authorPaths.questions(eventId, challengeId)}/new`,
  review: `${AUTHOR_ROOT}/review`,
  playerReview: `${AUTHOR_ROOT}/player-review`,
  playerReviewCase: (caseId: string) =>
    `${AUTHOR_ROOT}/player-review/${encodeURIComponent(caseId)}`,
} as const;
