import type { ReactNode } from 'react';
import type { CardPresentation } from '../../api/cards';
import './card-frame.css';

/** Rarity is supplied by the card contract; omitted for battle-only identities. */
export function CardFrame({
  children,
  rarity,
  badge,
  nameplate,
  className = '',
}: {
  children: ReactNode;
  rarity?: CardPresentation['rarity'];
  badge?: string;
  nameplate?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`card-frame card-frame--${rarity ?? 'neutral'} ${className}`}
    >
      <span className="card-frame__engraving" aria-hidden="true">
        <span className="card-frame__corner card-frame__corner--left" />
        <span className="card-frame__corner card-frame__corner--right" />
        <span className="card-frame__crest" />
        <span className="card-frame__spine card-frame__spine--left" />
        <span className="card-frame__spine card-frame__spine--right" />
      </span>
      <span className="card-frame__window">{children}</span>
      <span className="card-frame__rail">
        {nameplate ? (
          <span className="card-frame__name">{nameplate}</span>
        ) : null}
        {rarity ? (
          <span className="card-frame__rarity">
            <span className="card-frame__insignia" aria-hidden="true" />
            {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
          </span>
        ) : (
          <span className="card-frame__insignia" aria-hidden="true" />
        )}
        {badge ? <span className="card-frame__quantity">{badge}</span> : null}
      </span>
    </span>
  );
}
