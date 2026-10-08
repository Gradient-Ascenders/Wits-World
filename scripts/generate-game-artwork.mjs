import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  quality: 90,
  alphaQuality: 100,
  effort: 6,
  smartSubsample: true,
};
const sources = [
  {
    source: 'apps/web/src/assets/home/campus-transparent.png',
    widths: [480, 768, 1152, 1448],
    output: (width) =>
      `apps/web/src/assets/home/campus-transparent-${width}.webp`,
  },
  {
    source: 'apps/web/src/assets/profile/achievements.png',
    // Three square columns: 128/256/384/512px cells retain the original atlas.
    widths: [384, 768, 1152, 1536],
    output: (width) => `apps/web/src/assets/profile/achievements-${width}.webp`,
  },
];
const hash = (data) => createHash('sha256').update(data).digest('hex');
const assets = [];

for (const entry of sources) {
  const input = await readFile(path.join(root, entry.source));
  const original = await sharp(input).metadata();
  const variants = [];
  for (const width of entry.widths) {
    const file = entry.output(width);
    const encoded = await sharp(input)
      .resize({ width, withoutEnlargement: true, kernel: 'lanczos3' })
      .webp(options)
      .toBuffer();
    await writeFile(path.join(root, file), encoded);
    const metadata = await sharp(encoded).metadata();
    variants.push({
      file,
      width: metadata.width,
      height: metadata.height,
      bytes: encoded.length,
      sha256: hash(encoded),
    });
  }
  assets.push({
    source: entry.source,
    sourceSha256: hash(input),
    sourceBytes: input.length,
    width: original.width,
    height: original.height,
    variants,
  });
}

const manifestPath = path.join(root, 'artwork/game-artwork-manifest.json');
await writeFile(
  manifestPath,
  await prettier.format(
    JSON.stringify({
      schemaVersion: 1,
      generator: 'node scripts/generate-game-artwork.mjs',
      encoder: `Sharp ${sharp.versions.sharp}; WebP ${sharp.versions.webp}`,
      options,
      resizeKernel: 'lanczos3',
      provenance:
        'Resized and encoded from the existing campus PNG and achievement PNG. No artwork generated or redesigned. Original files and achievement provenance retained. Alpha is encoded losslessly; RGB uses quality 90 WebP.',
      attribution:
        'Codex[GPT-6] assisted with the generation script, responsive delivery, verification and documentation. The existing artwork retains its original provenance.',
      assets,
    }),
    { ...(await prettier.resolveConfig(manifestPath)), filepath: manifestPath },
  ),
);
process.stdout.write(
  'Generated eight responsive campus/achievement WebP assets.\n',
);
