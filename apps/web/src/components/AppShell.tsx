import { useAuth0 } from '@auth0/auth0-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';

import { AccountControl } from './auth/AccountControl';
import { CampusSeal } from './branding/CampusSeal';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';

interface AppShellProps {
  children: ReactNode;
}

type NavigationIconName =
  'author' | 'battles' | 'collection' | 'decks' | 'explore';

interface NavigationItem {
  href: string;
  icon: NavigationIconName;
  isActive: (pathname: string) => boolean;
  label: string;
}

const PLAYER_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    href: '/explore',
    icon: 'explore',
    isActive: (pathname) =>
      pathname === '/explore' || pathname.startsWith('/challenge-attempts/'),
    label: 'Explore',
  },
  {
    href: '/collection',
    icon: 'collection',
    isActive: (pathname) => pathname === '/collection',
    label: 'Collection',
  },
  {
    href: '/decks',
    icon: 'decks',
    isActive: (pathname) => pathname === '/decks',
    label: 'Decks',
  },
  {
    href: '/matches',
    icon: 'battles',
    isActive: (pathname) =>
      pathname === '/matches' || pathname.startsWith('/matches/'),
    label: 'Battles',
  },
];

const AUTHOR_NAVIGATION_ITEM: NavigationItem = {
  href: '/author',
  icon: 'author',
  isActive: (pathname) => pathname === '/author',
  label: 'Author',
};

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const sharedProps = {
    'aria-hidden': true,
    className: 'primary-navigation__icon',
    fill: 'none',
    focusable: 'false' as const,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.7,
    viewBox: '0 0 24 24',
  };

  switch (name) {
    case 'explore':
      return (
        <svg {...sharedProps}>
          <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case 'collection':
      return (
        <svg {...sharedProps}>
          <rect height="13" rx="1.8" width="10" x="7" y="4" />
          <path d="m7 7-2 .5a2 2 0 0 0-1.4 2.4l2.3 8.7A2 2 0 0 0 8.3 20l6.8-1.8" />
        </svg>
      );
    case 'decks':
      return (
        <svg {...sharedProps}>
          <path d="m4 8 8-4 8 4-8 4-8-4Z" />
          <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
        </svg>
      );
    case 'battles':
      return (
        <svg {...sharedProps}>
          <path d="m5 4 6.5 6.5M3.5 2.5 5 7l2-2 6.5 6.5M19 4l-6.5 6.5M20.5 2.5 19 7l-2-2-6.5 6.5M7.5 13.5 4 17l3 3 3.5-3.5M16.5 13.5 20 17l-3 3-3.5-3.5" />
        </svg>
      );
    case 'author':
      return (
        <svg {...sharedProps}>
          <path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
          <path d="m14.5 6.7 2.8 2.8M4 20h6" />
        </svg>
      );
  }
}

function PlayerNavigation({
  isAuthor,
  pathname,
  placement,
}: {
  isAuthor: boolean;
  pathname: string;
  placement: 'desktop' | 'mobile';
}) {
  const navigationItems = isAuthor
    ? [...PLAYER_NAVIGATION_ITEMS, AUTHOR_NAVIGATION_ITEM]
    : PLAYER_NAVIGATION_ITEMS;

  return (
    <nav
      aria-label="Player"
      className={`primary-navigation primary-navigation--${placement}`}
    >
      <ul className="primary-navigation__list">
        {navigationItems.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.isActive(pathname) ? 'page' : undefined}
              className="primary-navigation__link"
              href={item.href}
            >
              <NavigationIcon name={item.icon} />
              <span className="primary-navigation__label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading } = useAuth0();
  const { state: currentPlayer } = useCurrentPlayer();
  const [pathname] = useLocation();
  const isExplore = pathname === '/explore';
  const showsSiteFooter = !isExplore && pathname !== '/collection';
  const isRestoring =
    isLoading || (isAuthenticated && currentPlayer.status === 'loading');
  const hasPlayerNavigation =
    isAuthenticated && currentPlayer.status === 'ready';
  const isAuthor =
    currentPlayer.status === 'ready' && currentPlayer.player.role === 'author';

  return (
    <div
      className={`site-frame site-frame--${
        hasPlayerNavigation ? 'product-navigation' : 'public'
      }${isExplore ? ' site-frame--explore' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header
        aria-busy={isRestoring ? 'true' : undefined}
        className={`site-header${isExplore ? ' site-header--explore' : ''}`}
      >
        <div className="site-header__inner">
          <Link aria-label="Wits World home" className="product-name" href="/">
            <CampusSeal className="product-name__mark" decorative />
            <span className="product-name__wordmark" aria-hidden="true">
              <span className="product-name__title">Wits World</span>
              <span className="product-name__tagline">
                Explore <span aria-hidden="true">·</span> Discover{' '}
                <span aria-hidden="true">·</span> Achieve
              </span>
            </span>
          </Link>

          {hasPlayerNavigation ? (
            <div className="site-header__navigation-cluster">
              <PlayerNavigation
                isAuthor={isAuthor}
                pathname={pathname}
                placement="desktop"
              />
            </div>
          ) : null}

          {isRestoring ? (
            <div
              aria-live="polite"
              className="session-restoration"
              role="status"
            >
              Restoring session…
            </div>
          ) : (
            <AccountControl />
          )}
        </div>
      </header>

      <main
        className={`main-content${isExplore ? ' main-content--explore' : ''}`}
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>

      {showsSiteFooter ? (
        <footer className="site-footer">
          <div className="site-footer__inner">
            <p>Wits World</p>
            <p>© 2026 Gradient Ascent</p>
          </div>
        </footer>
      ) : null}

      {hasPlayerNavigation ? (
        <PlayerNavigation
          isAuthor={isAuthor}
          pathname={pathname}
          placement="mobile"
        />
      ) : null}
    </div>
  );
}
