import manifestJson from '../../../../../artwork/cards/manifest.json?raw';

const manifest = JSON.parse(manifestJson) as {
  cards: Array<{ id: string; optimized: string; alt: string }>;
};
const artworkByDefinition = new Map(
  manifest.cards.map((card) => [
    card.id,
    { imageUrl: card.optimized, imageAlt: card.alt },
  ]),
);

// Deck summaries already identify the catalogue definition. Resolve only
// approved, packaged artwork without waiting for the full owned collection.
export function catalogueArtwork(cardDefinitionId: string) {
  return artworkByDefinition.get(cardDefinitionId);
}
