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
          <Link
            aria-label="Wits Quest home, a Wits World project"
            className="product-name"
            href="/"
          >
            <CampusSeal className="product-name__mark" decorative />
            <span className="product-name__wordmark">
              <span className="product-name__game">Wits Quest</span>
              <span className="product-name__project">
                A Wits World project
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
                <NavigationLink href="/about">About</NavigationLink>
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
          <strong>Wits Quest</strong> is the campus exploration game developed
          by the Wits World project.
        </p>
      </footer>
    </div>
  );
}
