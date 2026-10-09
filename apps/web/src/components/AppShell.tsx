import {
  CompassIcon,
  CardsIcon,
  SwordIcon,
  TrophyIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'wouter';

import { AccountControl } from './auth/AccountControl';
import { CampusSeal } from './branding/CampusSeal';
import { useCurrentPlayer } from '../auth/CurrentPlayerProvider';
import { ReadPageControl } from '../accessibility/ReadPageControl';
import { useAccessibilityPreferences } from '../accessibility/preferences';

interface AppShellProps {
  children: ReactNode;
}

type NavigationIconName =
  'author' | 'battles' | 'collection' | 'explore' | 'leaderboard';

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
    isActive: (pathname) =>
      pathname === '/collection' || pathname.startsWith('/collection/'),
    label: 'Collection',
  },
  {
    href: '/matches',
    icon: 'battles',
    isActive: (pathname) =>
      pathname === '/matches' || pathname.startsWith('/matches/'),
    label: 'Battles',
  },
  {
    href: '/leaderboard',
    icon: 'leaderboard',
    isActive: (pathname) => pathname === '/leaderboard',
    label: 'Leaderboard',
  },
];

const AUTHOR_NAVIGATION_ITEM: NavigationItem = {
  href: '/author/events',
  icon: 'author',
  isActive: (pathname) =>
    pathname === '/author' || pathname.startsWith('/author/'),
  label: 'Author',
};

function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Wits World';
  if (pathname === '/explore') return 'Explore · Wits World';
  if (pathname === '/offline') return 'Saved events · Wits World';
  if (pathname.startsWith('/offline-attempts/'))
    return 'Saved attempt · Wits World';
  if (pathname.startsWith('/challenge-attempts/'))
    return 'Campus challenge · Wits World';
  if (pathname === '/collection/trades/new')
    return 'Start a trade · Wits World';
  if (pathname.endsWith('/edit') && pathname.startsWith('/collection/trades/'))
    return 'Edit card trade · Wits World';
  if (pathname.startsWith('/collection/trades/'))
    return 'Card trade · Wits World';
  if (pathname === '/collection/trades') return 'Card trades · Wits World';
  if (pathname === '/collection/evolutions')
    return 'Card evolutions · Wits World';
  if (pathname === '/collection/decks') return 'Decks · Wits World';
  if (pathname === '/collection') return 'Collection · Wits World';
  if (pathname === '/leaderboard') return 'Leaderboard · Wits World';
  if (pathname === '/matches/history') return 'Battle history · Wits World';
  if (pathname.startsWith('/matches/live/'))
    return 'Live Ranked battle · Wits World';
  if (pathname === '/matches/live') return 'Live Ranked · Wits World';
  if (pathname.startsWith('/matches/pvp/')) return 'Player battle · Wits World';
  if (pathname === '/matches/pvp') return 'Player battles · Wits World';
  if (pathname.startsWith('/matches/')) return 'CPU battle · Wits World';
  if (pathname === '/matches') return 'Battles · Wits World';
  if (pathname === '/profile') return 'Player profile · Wits World';
  if (pathname === '/account/reset-password')
    return 'Reset password · Wits World';
  if (pathname === '/account') return 'Account settings · Wits World';
  if (pathname.startsWith('/author')) return 'Author console · Wits World';
  if (pathname === '/about') return 'About · Wits World';
  return 'Page not found · Wits World';
}

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const Icon = {
    explore: CompassIcon,
    collection: CardsIcon,
    battles: SwordIcon,
    leaderboard: TrophyIcon,
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
  const { speech } = useAccessibilityPreferences();
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
  const [exploreReadTarget, setExploreReadTarget] =
    useState<HTMLElement | null>(null);
  const previousPathname = useRef(pathname);
  const focusBeforeRouteChange = useRef<Element | null>(null);

  useLayoutEffect(() => {
    return () => {
      focusBeforeRouteChange.current = document.activeElement;
    };
  }, [pathname]);

  useEffect(() => {
    document.title = pageTitle(pathname);
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    const main = mainRef.current;
    const activeElement = document.activeElement;
    const routeManagedFocus =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      ((main?.contains(activeElement) &&
        activeElement !== focusBeforeRouteChange.current) ||
        // A portalled author menu restores focus to its trigger after navigation.
        activeElement.closest('[data-route-focus="preserve"]') !== null);
    if (main && !routeManagedFocus) {
      main.focus();
    }
  }, [pathname]);

  useEffect(() => {
    if (!isExplore) return;
    const main = mainRef.current;
    if (!main) return;
    const updateTarget = () => {
      setExploreReadTarget(document.getElementById('explore-read-control'));
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isExplore]);

  useEffect(() => {
    if (!isExplore) return;
    const header = headerDrawerRef.current?.querySelector('header');
    const main = mainRef.current;
    if (!header || !main) return;
    const updateHeight = () => {
      main.style.setProperty(
        '--explore-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return () => main.style.removeProperty('--explore-header-height');
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      main.style.removeProperty('--explore-header-height');
    };
  }, [isExplore]);

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
    pathname !== '/matches/pvp' &&
    pathname !== '/matches/live';
  const isTradeBuilder = pathname === '/collection/trades/new';
  const isFooterlessProductRoute =
    isExplore ||
    pathname === '/collection' ||
    pathname.startsWith('/collection/') ||
    pathname === '/leaderboard' ||
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
  const readControl = speech ? (
    <ReadPageControl key={pathname} main={mainRef} pathname={pathname} />
  ) : null;

  return (
    <div
      className={`site-frame site-frame--${
        hasPlayerNavigation ? 'product-navigation' : 'public'
      }${pathname === '/' ? ' site-frame--home' : ''}${isExplore ? ' site-frame--explore' : ''}${isBattleDetail ? ' site-frame--battle-focus' : ''}${isAuthorRoute ? ' site-frame--author' : ''}`}
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
        style={
          headerDragOffset === null
            ? undefined
            : ({
                '--explore-header-drag-offset': `${headerDragOffset}px`,
              } as CSSProperties)
        }
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
        className={`main-content${isExplore ? ' main-content--explore' : ''}${isBattleDetail ? ' main-content--battle-focus' : ''}${isAuthorRoute ? ' main-content--author' : ''}${isTradeBuilder ? ' main-content--trade-builder' : ''}`}
        id="main-content"
        tabIndex={-1}
      >
        {!isExplore ? readControl : null}
        {children}
      </main>

      {isExplore && readControl
        ? exploreReadTarget
          ? createPortal(readControl, exploreReadTarget)
          : readControl
        : null}

      {showsSiteFooter ? (
        <footer className="site-footer">
          <div className="site-footer__inner">
            <Link className="site-footer__brand" href="/">
              <CampusSeal className="site-footer__mark" decorative />
              <span>
                <strong>Wits World</strong>
                <small>
                  Explore <span aria-hidden="true">·</span> Discover{' '}
                  <span aria-hidden="true">·</span> Achieve
                </small>
              </span>
            </Link>
            <div className="site-footer__meta">
              <span>Wits Quest</span>
              <p>© 2026 Gradient Ascent</p>
            </div>
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
