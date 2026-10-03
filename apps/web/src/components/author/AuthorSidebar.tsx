import {
  useReviewEntry,
  useReviewQueueNavigation,
} from './AuthorReviewNavigation';
import {
  CalendarBlankIcon,
  CardsIcon,
  ChartBarIcon,
  ClipboardTextIcon,
  MapTrifoldIcon,
  ShieldWarningIcon,
  SidebarSimpleIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
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
  const [expanded, setExpanded] = useState(
    () => window.matchMedia?.('(min-width: 64rem)').matches ?? false,
  );
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 64rem)');
    if (!desktop) return;
    const updateLayout = () => setExpanded(desktop.matches);
    desktop.addEventListener('change', updateLayout);
    return () => desktop.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (!window.matchMedia?.('(min-width: 64rem)').matches) {
      setExpanded(false);
    }
  }, [pathname]);

  const toggleLabel = expanded
    ? 'Collapse Author navigation'
    : 'Expand Author navigation';

  return (
    <aside
      className="author-sidebar"
      data-expanded={expanded}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          setExpanded(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="author-sidebar__header">
        <p className="author-sidebar__label">
          <span className="author-sidebar__desktop-label">
            Content management
          </span>
          <span className="author-sidebar__mobile-label">
            {sections.find((item) => item.section === activeSection)?.label}
          </span>
        </p>
        <button
          className="author-sidebar__toggle"
          aria-label={toggleLabel}
          aria-expanded={expanded}
          aria-controls="author-section-navigation"
          onClick={() => setExpanded((current) => !current)}
          ref={toggleRef}
          title={toggleLabel}
          type="button"
        >
          <SidebarSimpleIcon size={20} aria-hidden="true" />
        </button>
      </div>
      <nav
        id="author-section-navigation"
        aria-label="Author sections"
        className={`author-sidebar__navigation${expanded ? ' is-expanded' : ''}`}
      >
        {sections.map(({ section, label, icon: Icon }) => (
          <Link
            key={section}
            href={authorPaths[section]}
            onClick={() => {
              if (section !== 'review') reviewNavigation?.clear();
              if (
                pathname === authorPaths[section] &&
                !window.matchMedia?.('(min-width: 64rem)').matches
              ) {
                setExpanded(false);
                toggleRef.current?.focus();
              }
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
