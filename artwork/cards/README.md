# Card artwork workspace

Working assets for issue #164: the complete 30-card catalogue and production
artwork. This folder setup does not change the approved catalogue or mark any
artwork as complete.

## Folders

- `originals/`: editable, full-resolution PNG originals, with transparency when
  needed. Keep these outside the web application's public directory.
- `references/`: team-owned or permitted visual references and style studies.
  Record their source and usage permission; do not commit unlicensed reference
  images or private material.
- `../../apps/web/public/cards/`: approved, optimized WebP exports served by the
  application at `/cards/<filename>.webp`.

Use matching, stable filenames for each original and its export. Maintain the
mapping to the existing card ID when the asset manifest is implemented. Artwork
filenames must not require changing existing card IDs.

Keep names, statistics, moves, and other changing card information out of the
illustration; the application's card component renders that information.
Store asset URLs and accessible metadata in the catalogue, not image binaries.

Artwork uses a **1:1 square aspect ratio** for both Creatures and Power cards.
Prepare PNG originals at **1024 x 1024 pixels or larger**, with the subject
centred and roughly 10-15% breathing room around important details. The shared
artwork window stays square in collection thumbnails, details, compact cards,
and deck pickers. Images use `object-fit: contain` so older non-square images
are displayed in full rather than cropped. The surrounding card remains a
portrait layout with its information outside the illustration.

Before producing the full set, agree on the visual style, final WebP export
dimensions, and file-size budget. Test one Creature and one Power illustration
in the UI first. The later asset manifest must record card IDs,
artwork paths, accessible descriptions, fallback behavior, and attribution,
including AI assistance where applicable. No manifest or final art is supplied
by this folder scaffold.

## AI declaration

This setup guide was written with assistance from Codex[GPT-5].
