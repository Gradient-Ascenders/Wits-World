import {
  CompassIcon,
  CardsIcon,
  StackIcon,
  SwordIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  href: '/author/events',
  icon: 'author',
  isActive: (pathname) =>
    pathname === '/author' || pathname.startsWith('/author/'),
  label: 'Author',
};

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const Icon = {
    explore: CompassIcon,
    collection: CardsIcon,
    decks: StackIcon,
    battles: SwordIcon,
    author: PencilSimpleIcon,
  }[name];
  return (
    <Icon aria-hidden="true" className="primary-navigation__icon" size={24} />
  );
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
  const isExplore = pathname === '/explore' && currentPlayer.status !== 'error';
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [headerDragOffset, setHeaderDragOffset] = useState<number | null>(null);
  const headerDrawerRef = useRef<HTMLDivElement>(null);
  const headerDrag = useRef<{
    pointerId: number;
    startY: number;
    startOffset: number;
    offset: number;
    height: number;
    startedAt: number;
  } | null>(null);
  const suppressHeaderClick = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setHeaderCollapsed(false);
    headerDrag.current = null;
    setHeaderDragOffset(null);
    if (!isExplore) return;
    const mobile = window.matchMedia('(max-width: 47.999rem)');
    const restoreHeader = () => {
      setHeaderCollapsed(false);
      headerDrag.current = null;
      setHeaderDragOffset(null);
    };
    const observer = new MutationObserver((records) => {
      if (
        mobile.matches &&
        records.some(
          ({ target }) =>
            target instanceof HTMLElement &&
            target.dataset.sheetSnap === 'expanded',
        )
      ) {
        setHeaderCollapsed(true);
      }
    });
    if (mainRef.current) {
      observer.observe(mainRef.current, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-sheet-snap'],
      });
    }
    mobile.addEventListener('change', restoreHeader);
    return () => {
      observer.disconnect();
      mobile.removeEventListener('change', restoreHeader);
    };
  }, [isExplore]);
  const isAuthorRoute =
    pathname === '/author' || pathname.startsWith('/author/');
  const isBattleDetail =
    pathname.startsWith('/matches/') &&
    pathname !== '/matches/history' &&
    pathname !== '/matches/pvp';
  const isFooterlessProductRoute =
    isExplore ||
    pathname === '/collection' ||
    pathname === '/decks' ||
    pathname === '/matches' ||
    pathname.startsWith('/matches/') ||
    pathname === '/profile' ||
    pathname === '/account' ||
    isAuthorRoute;
  const showsSiteFooter = !isFooterlessProductRoute;
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
      }${isExplore ? ' site-frame--explore' : ''}${isBattleDetail ? ' site-frame--battle-focus' : ''}${isAuthorRoute ? ' site-frame--author' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div
        ref={headerDrawerRef}
        className={isExplore ? 'explore-header-drawer' : 'site-header-wrapper'}
        data-collapsed={isExplore && headerCollapsed}
        data-dragging={headerDragOffset !== null}
        style={
          headerDragOffset === null
            ? undefined
            : { transform: `translateY(${headerDragOffset}px)` }
        }
      >
        <header
          id="site-header"
          inert={isExplore && headerCollapsed}
          aria-hidden={isExplore && headerCollapsed ? true : undefined}
          aria-busy={isRestoring ? 'true' : undefined}
          className={`site-header${isExplore ? ' site-header--explore' : ''}`}
        >
          <div className="site-header__inner">
            <Link
              aria-label="Wits World home"
              className="product-name"
              href="/"
            >
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

        {isExplore ? (
          <button
            className="explore-header-toggle"
            aria-label={
              headerCollapsed
                ? 'Show header and account menu'
                : 'Hide header for more map space'
            }
            aria-controls="site-header"
            aria-expanded={!headerCollapsed}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              const drawer = headerDrawerRef.current;
              const header = drawer?.querySelector('header');
              if (!drawer || !header) return;
              const height = header.getBoundingClientRect().height;
              const transform = getComputedStyle(drawer).transform;
              const startOffset =
                transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
              suppressHeaderClick.current = false;
              headerDrag.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startOffset,
                offset: startOffset,
                height,
                startedAt: event.timeStamp,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              setHeaderDragOffset(startOffset);
            }}
            onPointerMove={(event) => {
              const drag = headerDrag.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              const delta = event.clientY - drag.startY;
              if (Math.abs(delta) > 5) suppressHeaderClick.current = true;
              drag.offset = Math.max(
                -drag.height,
                Math.min(0, drag.startOffset + delta),
              );
              setHeaderDragOffset(drag.offset);
            }}
            onPointerUp={(event) => {
              const drag = headerDrag.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              if (suppressHeaderClick.current) {
                const velocity =
                  (event.clientY - drag.startY) /
                  Math.max(1, event.timeStamp - drag.startedAt);
                setHeaderCollapsed(
                  Math.abs(velocity) > 0.4
                    ? velocity < 0
                    : drag.offset < -drag.height / 2,
                );
              }
              headerDrag.current = null;
              setHeaderDragOffset(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              headerDrag.current = null;
              suppressHeaderClick.current = true;
              setHeaderDragOffset(null);
            }}
            onLostPointerCapture={() => {
              headerDrag.current = null;
              setHeaderDragOffset(null);
            }}
            onClick={(event) => {
              if (event.detail === 0 || !suppressHeaderClick.current) {
                setHeaderCollapsed((collapsed) => !collapsed);
              }
              suppressHeaderClick.current = false;
            }}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <main
        ref={mainRef}
        onPointerUpCapture={(event) => {
          if (
            isExplore &&
            window.matchMedia('(max-width: 47.999rem)').matches &&
            event.target instanceof Element &&
            event.target.closest('.mapboxgl-canvas, .event-marker')
          ) {
            setHeaderCollapsed(true);
          }
        }}
        className={`main-content${isExplore ? ' main-content--explore' : ''}${isBattleDetail ? ' main-content--battle-focus' : ''}${isAuthorRoute ? ' main-content--author' : ''}`}
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

      {hasPlayerNavigation && !isBattleDetail ? (
        <PlayerNavigation
          isAuthor={isAuthor}
          pathname={pathname}
          placement="mobile"
        />
      ) : null}
    </div>
  );
}
