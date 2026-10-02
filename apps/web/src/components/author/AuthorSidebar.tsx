import {
  useReviewEntry,
  useReviewQueueNavigation,
} from './AuthorReviewNavigation';
import {
  CalendarBlankIcon,
  CardsIcon,
  ChartBarIcon,
  ClipboardTextIcon,
  ListIcon,
  MapTrifoldIcon,
  ShieldWarningIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';

const sections = [
  { section: 'events', label: 'Events', icon: CalendarBlankIcon },
  { section: 'cards', label: 'Cards', icon: CardsIcon },
  { section: 'campaigns', label: 'Campaigns', icon: StackIcon },
  { section: 'review', label: 'Content review', icon: ClipboardTextIcon },
  {
    section: 'playerReview',
    label: 'Player review',
    icon: ShieldWarningIcon,
  },
  { section: 'analytics', label: 'Analytics', icon: ChartBarIcon },
  { section: 'placement', label: 'Placement', icon: MapTrifoldIcon },
] as const;

export function AuthorSidebar({
  route,
  pathname,
}: {
  route: AuthorWorkspaceRoute;
  pathname: string;
}) {
  const reviewEntry = useReviewEntry();
  const reviewNavigation = useReviewQueueNavigation();
  const activeSection = reviewEntry ? 'review' : route.section;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [pathname]);

  return (
    <aside className="author-sidebar">
      <button
        className="button button--quiet author-sidebar__toggle"
        aria-expanded={expanded}
        aria-controls="author-section-navigation"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <ListIcon size={20} aria-hidden="true" />
        {sections.find((item) => item.section === activeSection)?.label} ·
        Navigation
      </button>
      <nav
        id="author-section-navigation"
        aria-label="Author sections"
        className={`author-sidebar__navigation${expanded ? ' is-expanded' : ''}`}
      >
        <p className="author-sidebar__label">Content management</p>
        {sections.map(({ section, label, icon: Icon }) => (
          <Link
            key={section}
            href={authorPaths[section]}
            onClick={() => {
              if (section !== 'review') reviewNavigation?.clear();
            }}
            className="author-sections__link"
            aria-current={activeSection === section ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
