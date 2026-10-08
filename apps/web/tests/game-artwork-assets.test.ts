import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd(), '../..');
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

interface ArtworkAsset {
  source: string;
  sourceSha256: string;
  width: number;
  height: number;
  variants: Array<{
    file: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  }>;
}

describe('responsive game artwork release', () => {
  it('retains source provenance, aspect ratios, atlas cells and lossless alpha', async () => {
    const { assets } = JSON.parse(
      await readFile(
        path.join(root, 'artwork/game-artwork-manifest.json'),
        'utf8',
      ),
    ) as { assets: ArtworkAsset[] };
    expect(assets).toHaveLength(2);
    for (const asset of assets) {
      const source = await readFile(path.join(root, asset.source));
      expect(hash(source)).toBe(asset.sourceSha256);
      expect(asset.variants).toHaveLength(4);
      for (const variant of asset.variants) {
        const bytes = await readFile(path.join(root, variant.file));
        expect(hash(bytes)).toBe(variant.sha256);
        expect(bytes.length).toBe(variant.bytes);
        expect(bytes.length).toBeLessThan(360_000);
        const metadata = await sharp(bytes).metadata();
        expect(metadata).toMatchObject({
          format: 'webp',
          hasAlpha: true,
          width: variant.width,
          height: variant.height,
        });
        expect(variant.width).toBeLessThanOrEqual(asset.width);
        expect(variant.width / variant.height).toBe(asset.width / asset.height);
        if (asset.source.includes('achievements')) {
          expect(variant.width % 3).toBe(0);
          expect(variant.height % 2).toBe(0);
          expect(variant.width / 3).toBe(variant.height / 2);
        }
        const expectedAlpha = await sharp(source)
          .resize({ width: variant.width, kernel: 'lanczos3' })
          .extractChannel('alpha')
          .raw()
          .toBuffer();
        const actualAlpha = await sharp(bytes)
          .extractChannel('alpha')
          .raw()
          .toBuffer();
        expect(hash(actualAlpha)).toBe(hash(expectedAlpha));
      }
    }
  });
});
