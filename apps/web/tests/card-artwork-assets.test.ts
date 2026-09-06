import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ArtworkManifest {
  attribution: string;
  cards: Array<{
    alt: string;
    id: string;
    name: string;
    optimized: string;
    original: string;
  }>;
  export: { format: string; height: number; maxBytes: number; width: number };
  schemaVersion: number;
}

const artworkDirectory = path.resolve(process.cwd(), '../../artwork/cards');
const publicCardDirectory = path.resolve(process.cwd(), 'public/cards');
const catalogueMigrationPath = path.resolve(
  process.cwd(),
  '../../database/migrations/0041_complete_card_catalogue.sql',
);

describe('production card artwork release', () => {
  it('ships one distinct optimized and accessible artwork asset for every catalogue card', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(artworkDirectory, 'manifest.json'), 'utf8'),
    ) as ArtworkManifest;
    const catalogueMigration = await readFile(catalogueMigrationPath, 'utf8');

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      export: {
        format: 'webp',
        height: 1024,
        maxBytes: 307_200,
        width: 1024,
      },
    });
    expect(manifest.attribution).toContain('ChatGPT-Web[GPT-5.6 Sol]');
    expect(manifest.cards).toHaveLength(30);
    expect(new Set(manifest.cards.map(({ id }) => id)).size).toBe(30);
    expect(new Set(manifest.cards.map(({ name }) => name)).size).toBe(30);
    expect(manifest.cards.every(({ alt }) => alt.trim().length >= 20)).toBe(
      true,
    );

    const originalHashes = new Set<string>();
    const optimizedHashes = new Set<string>();
    for (const card of manifest.cards) {
      const original = await readFile(
        path.join(artworkDirectory, card.original),
      );
      const optimizedName = card.optimized.replace('/cards/', '');
      const optimizedPath = path.join(publicCardDirectory, optimizedName);
      const optimized = await readFile(optimizedPath);

      expect(original.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(optimized.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(optimized.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect((await stat(optimizedPath)).size).toBeLessThanOrEqual(
        manifest.export.maxBytes,
      );
      const originalDimensions = readPngDimensions(original);
      expect(originalDimensions.width).toBe(originalDimensions.height);
      expect(originalDimensions.width).toBeGreaterThanOrEqual(
        manifest.export.width,
      );
      expect(readWebpDimensions(optimized)).toEqual({
        height: manifest.export.height,
        width: manifest.export.width,
      });
      expect(catalogueMigration).toContain(card.id);
      expect(catalogueMigration).toContain(card.optimized);
      expect(catalogueMigration).toContain(card.alt.replaceAll("'", "''"));
      originalHashes.add(createHash('sha256').update(original).digest('hex'));
      optimizedHashes.add(createHash('sha256').update(optimized).digest('hex'));
    }

    expect(originalHashes.size).toBe(30);
    expect(optimizedHashes.size).toBe(30);
    expect(
      (await readdir(publicCardDirectory)).filter((name) =>
        name.endsWith('.webp'),
      ),
    ).toHaveLength(30);
  });
});

function readPngDimensions(image: Buffer): {
  height: number;
  width: number;
} {
  return {
    height: image.readUInt32BE(20),
    width: image.readUInt32BE(16),
  };
}

function readWebpDimensions(image: Buffer): {
  height: number;
  width: number;
} {
  const chunkType = image.subarray(12, 16).toString('ascii');

  if (chunkType === 'VP8 ') {
    return {
      height: image.readUInt16LE(28) & 0x3fff,
      width: image.readUInt16LE(26) & 0x3fff,
    };
  }
  if (chunkType === 'VP8L') {
    const packedDimensions = image.readUInt32LE(21);
    return {
      height: ((packedDimensions >>> 14) & 0x3fff) + 1,
      width: (packedDimensions & 0x3fff) + 1,
    };
  }
  if (chunkType === 'VP8X') {
    return {
      height: readUint24LE(image, 27) + 1,
      width: readUint24LE(image, 24) + 1,
    };
  }

  throw new Error(`Unsupported WebP chunk type: ${chunkType}`);
}

function readUint24LE(value: Buffer, offset: number): number {
  return (
    value[offset]! | (value[offset + 1]! << 8) | (value[offset + 2]! << 16)
  );
}
