import { expect, type Locator } from '@playwright/test';

export async function expectSquareArtwork(container: Locator) {
  const artwork = container.locator('.collectible-card__artwork');
  expect(await artwork.count()).toBeGreaterThan(0);
  const dimensions = await artwork.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  );
  for (const { width, height } of dimensions) {
    expect(width).toBeGreaterThan(0);
    expect(Math.abs(width - height)).toBeLessThanOrEqual(1);
  }
}
