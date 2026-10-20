import { ArrowsDownUp, CheckCircle, Clock } from '@phosphor-icons/react';

import type {
  TradeOfferedCopy,
  TradeRequestedDefinition,
  TradingCatalogueCard,
} from '../../api/trades';
import { TradeCardThumbnail } from './TradeCardThumbnail';

interface TradeComparisonProps {
  catalogue?: readonly TradingCatalogueCard[];
  counterpartyLabel: string;
  counterpartyOffered: readonly (TradeOfferedCopy | TradeRequestedDefinition)[];
  counterpartyPoints?: number;
  selfLabel?: string;
  selfOffered: readonly (TradeOfferedCopy | TradeRequestedDefinition)[];
  selfPoints?: number;
}

export function TradeComparison({
  catalogue,
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
        catalogue={catalogue}
        cards={selfOffered}
        empty="No cards selected."
        label={selfLabel}
        points={selfPoints}
      />
      <span aria-hidden="true" className="trade-comparison__exchange">
        <ArrowsDownUp size={22} />
      </span>
      <TradeSide
        catalogue={catalogue}
        cards={counterpartyOffered}
        empty="Waiting for their cards."
        label={`${counterpartyLabel} gives`}
        points={counterpartyPoints}
      />
    </div>
  );
}

export function RequestedCardList({
  catalogue,
  definitions,
  label,
}: {
  catalogue?: readonly TradingCatalogueCard[];
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
              <TradeCardThumbnail
                card={{
                  ...catalogue?.find(
                    (card) =>
                      card.cardDefinitionId === definition.cardDefinitionId,
                  ),
                  ...definition,
                }}
                fullFrame
              />
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
        <p>No cards requested.</p>
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
      {label}: {accepted ? 'accepted' : 'waiting'}
    </span>
  );
}

function TradeSide({
  catalogue,
  cards,
  empty,
  label,
  points,
}: {
  catalogue?: readonly TradingCatalogueCard[];
  cards: readonly (TradeOfferedCopy | TradeRequestedDefinition)[];
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
            <li
              key={
                'ownedCardId' in card ? card.ownedCardId : card.cardDefinitionId
              }
            >
              <TradeCardThumbnail
                card={{
                  ...catalogue?.find(
                    (definition) =>
                      definition.cardDefinitionId === card.cardDefinitionId,
                  ),
                  ...card,
                }}
                fullFrame
              />
              <div>
                <strong>{card.name}</strong>
                <span>
                  {'quantity' in card
                    ? `${card.quantity} ${card.quantity === 1 ? 'copy' : 'copies'} · `
                    : ''}
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
