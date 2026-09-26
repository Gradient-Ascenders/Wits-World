import { Cards, ArrowsLeftRight, Sparkle } from '@phosphor-icons/react';
import { Link, useLocation } from 'wouter';
import './collection-navigation.css';

const sections = [
  { href: '/collection', icon: Cards, label: 'Cards' },
  { href: '/collection/evolutions', icon: Sparkle, label: 'Evolutions' },
  { href: '/collection/trades', icon: ArrowsLeftRight, label: 'Trades' },
] as const;

export function CollectionSectionNavigation() {
  const [pathname] = useLocation();

  return (
    <nav aria-label="Collection sections" className="collection-navigation">
      <ul>
        {sections.map(({ href, icon: Icon, label }) => {
          const current =
            href === '/collection'
              ? pathname === '/collection'
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                aria-current={current ? 'page' : undefined}
                className="collection-navigation__link"
                href={href}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
