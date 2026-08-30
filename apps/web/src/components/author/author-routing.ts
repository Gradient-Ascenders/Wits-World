export type AuthorWorkspaceRoute =
  | { mode: 'list'; section: 'events' }
  | { mode: 'new'; section: 'events' }
  | {
      eventId: string;
      mode: 'challenge' | 'edit' | 'overview';
      section: 'events';
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
  | { cardId: string; mode: 'detail' | 'edit'; section: 'cards' };

const AUTHOR_ROOT = '/author';

export function parseAuthorWorkspaceRoute(
  pathname: string,
): AuthorWorkspaceRoute {
  const segments = pathname
    .replace(/^\/author\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] === 'cards') {
    if (segments[1] === 'new' && segments.length === 2) {
      return { mode: 'new', section: 'cards' };
    }
    if (segments[1] && segments.length <= 3) {
      return {
        cardId: segments[1],
        mode: segments[2] === 'edit' ? 'edit' : 'detail',
        section: 'cards',
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
  }

  return { eventId, mode: 'overview', section: 'events' };
}

export const authorPaths = {
  cards: `${AUTHOR_ROOT}/cards`,
  card: (cardId: string) =>
    `${AUTHOR_ROOT}/cards/${encodeURIComponent(cardId)}`,
  editCard: (cardId: string) =>
    `${AUTHOR_ROOT}/cards/${encodeURIComponent(cardId)}/edit`,
  events: `${AUTHOR_ROOT}/events`,
  event: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}`,
  editEvent: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/edit`,
  eventChallenge: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/challenge`,
  eventQuestions: (eventId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/questions`,
  questions: (eventId: string, challengeId: string) =>
    `${AUTHOR_ROOT}/events/${encodeURIComponent(eventId)}/challenges/${encodeURIComponent(challengeId)}/questions`,
  question: (eventId: string, challengeId: string, questionId: string) =>
    `${authorPaths.questions(eventId, challengeId)}/${encodeURIComponent(questionId)}`,
  editQuestion: (eventId: string, challengeId: string, questionId: string) =>
    `${authorPaths.question(eventId, challengeId, questionId)}/edit`,
  newCard: `${AUTHOR_ROOT}/cards/new`,
  newEvent: `${AUTHOR_ROOT}/events/new`,
  newQuestion: (eventId: string, challengeId: string) =>
    `${authorPaths.questions(eventId, challengeId)}/new`,
} as const;
