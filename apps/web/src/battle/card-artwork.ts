import manifestJson from '../../../../artwork/cards/manifest.json?raw';

// Match IDs identify battle instances, not catalogue cards. Use only exact,
// revealed roster names from the approved artwork manifest; never guess a URL.
const manifest = JSON.parse(manifestJson) as {
  cards: Array<{ name: string; optimized: string }>;
};
const artworkByName = new Map(
  manifest.cards.map((card) => [card.name, card.optimized]),
);

export function battleArtwork(name: string): string | undefined {
  return artworkByName.get(name);
}
