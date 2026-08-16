import type { ReactNode } from 'react';
import { Link, useRoute } from 'wouter';

import { AccountControl } from './auth/AccountControl';
import { CampusSeal } from './branding/CampusSeal';

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
  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header">
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

          <nav aria-label="Primary" className="primary-navigation">
            <ul className="primary-navigation__list">
              <li>
                <NavigationLink href="/">Home</NavigationLink>
              </li>
              <li>
                <NavigationLink href="/explore">Explore</NavigationLink>
              </li>
              <li>
                <NavigationLink href="/collection">Collection</NavigationLink>
              </li>
              <li>
                <NavigationLink href="/decks">Decks</NavigationLink>
              </li>
              <li>
                <NavigationLink href="/matches">Battles</NavigationLink>
              </li>
            </ul>
          </nav>
          <AccountControl />
        </div>
      </header>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <p>
          <strong>Wits World</strong> is the project behind Wits Quest, our
          campus exploration game.
        </p>
      </footer>
    </div>
  );
}
