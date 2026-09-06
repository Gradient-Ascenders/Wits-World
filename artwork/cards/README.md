# Card artwork

Issue #164 supplies original artwork and optimized application assets for all
30 ordinary cards in the complete catalogue.

## Asset layout

- `originals/`: 30 full-resolution square PNG source images.
- `../../apps/web/public/cards/`: 30 optimized 1024 x 1024 WebP exports used
  by the web application.
- `manifest.json`: the stable card ID, source path, optimized path,
  descriptive alternative text, and attribution for every card.
- `references/`: optional team-owned or permitted style references. Do not
  commit unlicensed or private source material.

The illustration contains no card name, statistics, moves, or rules text. The
application renders changing gameplay information separately. It displays the
square artwork with `object-fit: contain`, uses the catalogue's descriptive
alternative text, and retains a fallback when an image cannot load.

## Export requirements

- Use a 1:1 square composition with the subject centered and enough breathing
  room to remain legible in collection and deck thumbnails.
- Keep original PNGs at 1024 x 1024 pixels or larger.
- Export application WebPs at 1024 x 1024 pixels.
- Keep each optimized WebP at or below 300 KiB.
- Preserve matching stable filenames between an original and its export.
- Add or update the manifest entry whenever artwork changes.

The automated asset test verifies the 30-entry manifest, unique IDs, unique
source and export content, PNG/WebP signatures, export dimensions and size
budget, descriptive alt text, and attribution.

## Attribution

The original artwork was generated with ChatGPT-Web[GPT-5.6 Sol] and curated by
the Wits World team. Catalogue and manifest integration was implemented with
assistance from Codex-CLI[GPT-5.6 Sol].
