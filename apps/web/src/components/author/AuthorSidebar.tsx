import {
  CalendarBlankIcon,
  CardsIcon,
  ChartBarIcon,
  ClipboardTextIcon,
  ListIcon,
  StackIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';

const sections = [
  { section: 'events', label: 'Events', icon: CalendarBlankIcon },
  { section: 'cards', label: 'Cards', icon: CardsIcon },
  { section: 'campaigns', label: 'Campaigns', icon: StackIcon },
  { section: 'review', label: 'Review', icon: ClipboardTextIcon },
  { section: 'analytics', label: 'Analytics', icon: ChartBarIcon },
] as const;

export function AuthorSidebar({
  route,
  pathname,
}: {
  route: AuthorWorkspaceRoute;
  pathname: string;
}) {
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
        {sections.find((item) => item.section === route.section)?.label} ·
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
            className="author-sections__link"
            aria-current={route.section === section ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
