import type { ReactNode } from 'react';
import { Link, useRoute } from 'wouter';

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
          <div
            className="product-name"
            aria-label="Wits Quest, a Wits World project"
          >
            <span className="product-name__project">A Wits World project</span>
            <span className="product-name__game">Wits Quest</span>
          </div>

          <nav aria-label="Primary" className="primary-navigation">
            <ul className="primary-navigation__list">
              <li>
                <NavigationLink href="/">Home</NavigationLink>
              </li>
              <li>
                <NavigationLink href="/about">About</NavigationLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <p>Wits World is building the Wits Quest campus exploration game.</p>
      </footer>
    </div>
  );
}
