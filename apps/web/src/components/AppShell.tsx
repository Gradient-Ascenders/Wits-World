import type { ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link, useRoute } from 'wouter';

import { AccountControl } from './auth/AccountControl';
import { CampusSeal } from './branding/CampusSeal';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';

interface AppShellProps {
  children: ReactNode;
}

interface NavigationLinkProps {
  href: string;
  children: ReactNode;
}

function NavigationLink({ href, children }: NavigationLinkProps) {
  const [isActive] = useRoute(href);

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className="primary-navigation__link"
      href={href}
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading } = useAuth0();
  const { state: currentPlayer } = useCurrentPlayer();
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
      }`}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header
        aria-busy={isRestoring ? 'true' : undefined}
        className="site-header"
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
              <nav aria-label="Player" className="primary-navigation">
                <ul className="primary-navigation__list">
                  <li>
                    <NavigationLink href="/explore">Explore</NavigationLink>
                  </li>
                  <li>
                    <NavigationLink href="/collection">
                      Collection
                    </NavigationLink>
                  </li>
                  <li>
                    <NavigationLink href="/decks">Decks</NavigationLink>
                  </li>
                  <li>
                    <NavigationLink href="/matches">Battles</NavigationLink>
                  </li>
                  {isAuthor ? (
                    <li>
                      <NavigationLink href="/author">Author</NavigationLink>
                    </li>
                  ) : null}
                </ul>
              </nav>
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

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <p>Wits World</p>
          <p>© 2026 Gradient Ascent</p>
        </div>
      </footer>
    </div>
  );
}
