import { ArrowLeftIcon } from '@phosphor-icons/react';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'wouter';

import type {
  AuthorContentEntityType,
  AuthorReviewQueueItem,
} from '../../api/author';
import { createAppDateTimeFormatter } from '../../date-time';
import { authorPaths } from './author-routing';

export type ReviewQueueFilter = 'all' | AuthorContentEntityType;

interface ReviewNavigation {
  filter: ReviewQueueFilter;
  page: number;
  scrollY: number;
  item: AuthorReviewQueueItem | null;
  scope: string;
  setFilter: (filter: ReviewQueueFilter) => void;
  setPage: (page: number) => void;
  open: (item: AuthorReviewQueueItem, scope: string) => void;
  clear: () => void;
}

const ReviewNavigationContext = createContext<ReviewNavigation | null>(null);

export function AuthorReviewNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<ReviewQueueFilter>('all');
  const [page, setPage] = useState(1);
  const [entry, setEntry] = useState({
    item: null as AuthorReviewQueueItem | null,
    scope: '',
    scrollY: 0,
  });

  const [pathname] = useLocation();
  useEffect(() => {
    if (
      entry.scope &&
      (!pathname.startsWith('/author/') ||
        /^\/author\/(events|cards|campaigns|player-review|analytics|placement)\/?$/.test(
          pathname,
        ))
    ) {
      setEntry({ item: null, scope: '', scrollY: 0 });
    }
  }, [entry.scope, pathname]);

  return (
    <ReviewNavigationContext.Provider
      value={{
        ...entry,
        filter,
        page,
        setFilter,
        setPage,
        clear: () => setEntry({ item: null, scope: '', scrollY: 0 }),
        open: (item, scope) =>
          setEntry({ item, scope, scrollY: window.scrollY }),
      }}
    >
      {children}
    </ReviewNavigationContext.Provider>
  );
}

export function useReviewQueueNavigation() {
  return useContext(ReviewNavigationContext);
}

export function useReviewEntry() {
  const navigation = useReviewQueueNavigation();
  const [pathname] = useLocation();
  return navigation?.scope &&
    (pathname === navigation.scope ||
      pathname.startsWith(`${navigation.scope}/`))
    ? navigation.item
    : null;
}

export function AuthorRecordBackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const entry = useReviewEntry();
  return (
    <Link className="author-back-link" href={entry ? authorPaths.review : href}>
      <ArrowLeftIcon size={16} aria-hidden="true" />
      {entry ? 'Back to queue' : children}
    </Link>
  );
}

export function ReviewSubmissionMeta({
  entityId,
  submittedAt,
  submittedBy,
}: {
  entityId: string;
  submittedAt: string | null;
  submittedBy: string | null;
}) {
  const entry = useReviewEntry();
  const [pathname] = useLocation();
  if (
    !submittedAt ||
    (entry?.entityId !== entityId && !pathname.endsWith('/review'))
  )
    return null;
  const sameSubmission =
    entry?.entityId === entityId &&
    entry.submittedAt === submittedAt &&
    entry.submittedBy === submittedBy;
  return (
    <p className="review-submission-meta">
      {sameSubmission ? `${entry.submittedByName} · ` : 'Submitted · '}
      <time dateTime={submittedAt}>
        {createAppDateTimeFormatter(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(submittedAt))}
      </time>
    </p>
  );
}
