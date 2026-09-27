import { ArrowsDownUp, CheckCircle, Clock } from '@phosphor-icons/react';

import type {
  TradeOfferedCopy,
  TradeRequestedDefinition,
} from '../../api/trades';
import { CardArtwork } from '../cards/CollectibleCard';

interface TradeComparisonProps {
  counterpartyLabel: string;
  counterpartyOffered: readonly TradeOfferedCopy[];
  counterpartyPoints?: number;
  selfLabel?: string;
  selfOffered: readonly TradeOfferedCopy[];
  selfPoints?: number;
}

export function TradeComparison({
  counterpartyLabel,
  counterpartyOffered,
  counterpartyPoints,
  selfLabel = 'You give',
  selfOffered,
  selfPoints,
}: TradeComparisonProps) {
  return (
    <div className="trade-comparison">
      <TradeSide
        cards={selfOffered}
        empty="No exact copies selected yet."
        label={selfLabel}
        points={selfPoints}
      />
      <span aria-hidden="true" className="trade-comparison__exchange">
        <ArrowsDownUp size={22} />
      </span>
      <TradeSide
        cards={counterpartyOffered}
        empty="Waiting for the other player to select exact copies."
        label={`${counterpartyLabel} gives`}
        points={counterpartyPoints}
      />
    </div>
  );
}

export function RequestedCardList({
  definitions,
  label,
}: {
  definitions: readonly TradeRequestedDefinition[];
  label: string;
}) {
  return (
    <section className="trade-request-list">
      <h3>{label}</h3>
      {definitions.length > 0 ? (
        <ul>
          {definitions.map((definition) => (
            <li key={definition.cardDefinitionId}>
              <CardArtwork card={definition} showRarity />
              <div>
                <strong>{definition.name}</strong>
                <span>
                  {definition.quantity}{' '}
                  {definition.quantity === 1 ? 'copy' : 'copies'} ·{' '}
                  {titleCase(definition.rarity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No card definitions requested yet.</p>
      )}
    </section>
  );
}

export function ConsentState({
  accepted,
  label,
}: {
  accepted: boolean;
  label: string;
}) {
  return (
    <span className={`trade-consent trade-consent--${accepted ? 'yes' : 'no'}`}>
      {accepted ? (
        <CheckCircle aria-hidden="true" size={18} weight="fill" />
      ) : (
        <Clock aria-hidden="true" size={18} />
      )}
      {label}: {accepted ? 'accepted this version' : 'not accepted'}
    </span>
  );
}

function TradeSide({
  cards,
  empty,
  label,
  points,
}: {
  cards: readonly TradeOfferedCopy[];
  empty: string;
  label: string;
  points?: number;
}) {
  return (
    <section className="trade-side">
      <div className="trade-side__heading">
        <h2>{label}</h2>
        {points !== undefined ? <span>{points} rarity points</span> : null}
      </div>
      {cards.length > 0 ? (
        <ul className="trade-side__cards">
          {cards.map((card) => (
            <li key={card.ownedCardId}>
              <CardArtwork card={card} showRarity />
              <div>
                <strong>{card.name}</strong>
                <span>
                  {titleCase(card.category)} · {titleCase(card.rarity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="trade-side__empty">{empty}</p>
      )}
    </section>
  );
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
