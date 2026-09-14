---
title: 'Card frame examples'
---

# Card frame examples

User-supplied Common, Rare, Epic and Legendary images guide frame material,
layered depth, celestial engraving, corner medallions and the lower plate.
These are design references only, never runtime borders or artwork overlays.
Original images and accompanying download metadata are preserved unchanged.

The implementation lives in `apps/web/src/components/cards/CardFrame.tsx`,
`card-frame.css`, and the reusable ornaments under `src/assets/cards`.
Square roster artwork remains uncropped; compact frames simplify engraving.

Documentation assisted by Codex-CLI[GPT-6].

## Inspect the implementation

From the repository root, run:

```bash
npx playwright test --config apps/web/playwright/card-frames.config.ts --headed --debug
```

The test installs authenticated local fixtures at `http://127.0.0.1:5178`,
then exercises `/collection`, all rarity detail views, `/decks`, and a fixture
battle. Step through the Playwright inspector; no real sign-in or database is
needed. The fixtures intentionally assign rarities to exercise presentation,
not to assert live roster rules.

It checks 390, 768 and 1440px layouts and captures an equal-width comparison
ordered Common, Rare, Epic, Legendary. Look under `/tmp/wits-world-card-frames`
for `rarity-comparison.png`. Opening the app URL alone does not install fixtures.

Page title clarified with assistance from Codex-CLI[GPT-6].
