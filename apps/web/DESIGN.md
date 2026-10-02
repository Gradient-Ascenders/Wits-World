---
name: Wits World
description: The Campus Quest Atlas visual system for Wits Quest
colors:
  night-sky: '#050b16'
  night-sky-deep: '#081426'
  night-sky-panel: '#0d1b31'
  night-sky-raised: '#112440'
  ivory: '#f7f3e7'
  slate-secondary: '#b3bdcc'
  slate-muted: '#7f8b9d'
  beacon-gold: '#d4af37'
  beacon-gold-light: '#e0c46c'
  trail-blue: '#2a6bff'
  trail-blue-light: '#54a8ff'
  success-green: '#39b879'
  warning-amber: '#e1a93a'
  danger-red: '#dc5b65'
typography:
  display:
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: '3rem'
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: '-0.035em'
  headline:
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: '2.25rem'
    fontWeight: 700
    lineHeight: 1.18
  title:
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: '1.75rem'
    fontWeight: 700
    lineHeight: 1.18
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '0.75rem'
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: '0.14em'
  live-ranked-label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: '0'
  live-ranked-deck-title:
    fontFamily: "'Old Standard TT', 'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(1.65rem, 4.5vw, 2.5rem)'
    fontWeight: 700
    lineHeight: 1.15
  live-ranked-rating:
    fontFamily: "'Old Standard TT', 'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(2rem, 5.5vw, 3.25rem)'
    fontWeight: 700
    lineHeight: 1
rounded:
  sm: '0.375rem'
  md: '0.625rem'
  lg: '1rem'
  xl: '1.5rem'
  pill: '999px'
  frame: '15px'
  live-ranked-stage-tall: '1.75rem'
spacing:
  '1': '0.25rem'
  '2': '0.5rem'
  '3': '0.75rem'
  '4': '1rem'
  '5': '1.5rem'
  '6': '2rem'
  '7': '3rem'
  '8': '4rem'
components:
  button-primary:
    backgroundColor: '{colors.trail-blue}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '0.75rem 1.2rem'
    height: '2.75rem'
  button-quiet:
    backgroundColor: 'transparent'
    textColor: '{colors.ivory}'
    rounded: '{rounded.md}'
    padding: '0.75rem 1.2rem'
    height: '2.75rem'
  field:
    backgroundColor: '{colors.night-sky}'
    textColor: '{colors.ivory}'
    rounded: '{rounded.sm}'
    padding: '0.75rem 1rem'
    height: '2.75rem'
  panel:
    backgroundColor: '{colors.night-sky-panel}'
    textColor: '{colors.ivory}'
    rounded: '{rounded.lg}'
    padding: '1.5rem'
  navigation-current:
    backgroundColor: 'rgb(212 175 55 / 8%)'
    textColor: '{colors.beacon-gold-light}'
    rounded: '{rounded.md}'
  status-active:
    backgroundColor: 'rgb(57 184 121 / 8%)'
    textColor: '{colors.success-green}'
    rounded: '{rounded.pill}'
    padding: '0.25rem 0.75rem'
  collectible-frame:
    textColor: '#292d34'
    rounded: '{rounded.frame}'
    padding: '1rem 0.75rem 0.75rem'
  live-ranked-stage:
    backgroundColor: '{colors.night-sky}'
    textColor: '{colors.ivory}'
    rounded: '{rounded.lg}'
    padding: 'clamp(1rem, 3vw, 2rem)'
  live-ranked-stage-tall:
    backgroundColor: '{colors.night-sky}'
    textColor: '{colors.ivory}'
    rounded: '{rounded.live-ranked-stage-tall}'
    padding: 'clamp(2rem, 5.5vw, 3rem)'
  live-ranked-search:
    backgroundColor: '{colors.trail-blue}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '0.75rem 3rem'
    height: '3.5rem'
    width: '100%'
  live-ranked-search-tall:
    backgroundColor: '{colors.trail-blue}'
    textColor: '#ffffff'
    rounded: '{rounded.xl}'
    padding: '0.75rem 4rem'
    height: '7rem'
    width: '100%'
---

# Design System: Wits World

## Overview

**Creative North Star: "The Campus Quest Atlas"**

The interface feels adventurous and scholarly. Deep Night Sky surfaces establish a quiet field for campus discovery, while Trail Blue guides interaction and Beacon Gold marks identity, progress, and selected destinations. The home illustration makes the quest tangible; the working screens give the player's next action and current state priority.

The system uses clear controls and crafted rewards. Common panels, forms, and navigation share restrained geometry and readable spacing. Collectible card frames carry the dense celestial academic metalwork, with material and engraving changes for rarity. The approved Campus Seal and W/star marks anchor the identity. This record describes the existing React interface in `src/styles/`, page styles, and assets; it does not prescribe a new visual direction.

Live Ranked is an approved scoped extension of this identity. Its competitive entry uses a compact Live Ranked label beside the tabs, a plain Night Sky stage with a thin gold border, and the active deck’s actual card faces. This treatment belongs to `/matches/live`; the shared campus chrome and other surfaces retain their established rules. The surface contract and approved `duel-table-v3.png` carry the page composition; final pixel-fidelity review remains pending.

**Key Characteristics:**

- Dark navy layers with warm ivory text and selective gold and blue accents.
- Serif display headings paired with compact sans-serif controls and comfortable body copy.
- Mobile navigation and task panels built around touch, safe areas, and visible state.
- Ambient panel depth; ornate finish reserved for collectible rewards.
- A plain competitive stage, compact mode label, and interactive active-deck preview scoped to Live Ranked.

## Colors

The palette combines Night Sky neutrals, Beacon Gold identity cues, and Trail Blue interaction cues. The frontmatter values are normative and map to the corresponding primitives in `src/styles/tokens.css`.

### Primary

- **Trail Blue** (`trail-blue`) fills primary controls and active interaction surfaces; **Trail Blue Light** (`trail-blue-light`) marks links and visible focus.

### Secondary

- **Beacon Gold** (`beacon-gold`) marks identity and selected navigation; **Beacon Gold Light** (`beacon-gold-light`) carries small highlights, labels, and current location cues.

### Tertiary

- **Success Green**, **Warning Amber**, and **Danger Red** communicate semantic states. Pair them with text and icons; their colors do not carry the message alone.

### Neutral

- **Night Sky** (`night-sky`) is the page ground. Its deeper, panel, and raised companions separate content without introducing a light canvas.
- **Ivory** (`ivory`) is primary text. **Slate Secondary** and **Slate Muted** reduce emphasis for descriptions and metadata.
- **Live Ranked background** inherits the shared app background; the bordered stage uses `--colour-background-app` (Night Sky). Its border, mode label, and real season rating use Beacon Gold Light; the search action uses Trail Blue. Card faces retain the shared collection rarity materials.

**The Two Accent Rule.** Blue identifies an action or focus target; gold identifies the world, progress, or a current destination. Preserve that distinction in working screens.

## Typography

**Display Font:** The declared stack begins with Playfair Display and falls back to Georgia and Times New Roman. **Body Font:** The declared stack begins with Inter and falls back to system sans-serif faces. The repository does not bundle or import Playfair Display or Inter, so the named faces are only available when installed in the runtime environment.

Serif headings give the world its academic voice. Sans-serif body copy, labels, controls, and dense authoring interfaces keep tasks scannable. The frontmatter records existing size steps; page headings also use fluid `clamp()` sizing.

### Hierarchy

- **Display:** Bold serif, tight tracking and line height, used for large page and hero headings; the global `h1` is fluid and balances lines.
- **Headline / title:** Serif section hierarchy, with narrower sizes in task-heavy views.
- **Body:** Regular sans-serif with generous line height for descriptions and status copy; readable content is capped at `44rem`.
- **Label:** Small, heavy sans-serif with tracking for eyebrows and compact controls. Uppercase is used for eyebrows, not all interface text.

**The Reading and Doing Rule.** Use serif type to introduce places, sections, or rewards; use sans-serif type for actions, values, and forms.

### Live Ranked extension

The route self-hosts **Old Standard TT Bold** (weight 700, `font-display: swap`) from `src/assets/fonts/old-standard-tt/OldStandard-Bold.ttf`; its source README and SIL Open Font License 1.1 are adjacent. It leads the selected deck title and season rating stacks; the mode label uses the shared body face at 1rem. The season name retains the shared sans-serif stack. The normative scoped roles above record compact sizing; the tall portrait layout raises the deck title to `3.25rem` and rating to `3.75rem`. The compact mode label, controls, and state copy remain sans-serif.

## Layout

The app starts with a fluid mobile layout. General content is capped at `76rem`, readable prose at `44rem`, and header content at `90rem`. Spacing follows the eight-step scale in the frontmatter, from a quarter rem to four rem. Controls use at least a `2.75rem` target height.

Authenticated player routes use a fixed bottom navigation bar on smaller screens, with safe-area clearance in page content. At `75rem` and above it moves into the header. The Explore route uses a viewport-height map and a movable sheet; its task information remains available through a list. Author pages use a compact expandable navigation below `64rem` and a sidebar at larger widths. Home uses an image-led hero and changes from stacked sections to multiple columns at `48rem` and `64rem`.

**The Mobile Task Rule.** Reserve space for the bottom navigation and safe area before sizing sheets, sticky actions, or full-height views.

### Live Ranked extension

The lobby is capped at `56rem`. Its stage is a single grid with a `1.5rem` gap and fluid padding. The compact interactive fan is capped at `30rem`, uses aspect ratio `2.25`, and gives each card `25%` of fan width; tablets from `48rem` through `74.99rem` cap the fan at `26rem`. The search control spans the usable stage width with centered text and a right-positioned arrow; its `3.5rem` minimum height is 56px at the default root size.

Tall portrait viewports from `48rem` through `74.99rem` wide and at least `75rem` high use the scoped tall variants: `5.5rem` top clearance, a `4rem` stage gap, fan cap `45rem`, fan aspect ratio `2.04`, and card width `28%`. The fan's horizontal translations tighten from `-150%, -75%, 0%, 75%, 150%` to `-130%, -60%, 0%, 60%, 130%`. The search control grows to a `7rem` minimum height (112px at the default root size), with `2.5rem` type and centered text. These media rules express the approved tall composition without imposing that density on shorter tablets or desktop screens. Component `height` tokens describe minimum control heights, following the existing button convention.

The tall portrait entry controls also use the existing spacing scale: `space-6` (`2rem`, 32px at the default root size) separates the start controls and pads the territory option at the top; `space-7` (`3rem`, 48px) pads Ranked rules at the top; and `space-8` (`4rem`, 64px) sets the rules summary's minimum height. This lower-stage spacing keeps the search action, optional territory choice, and rules disclosure distinct while leaving shorter layouts compact.

## Elevation & Depth

Depth is layered and ambient. Dark tonal steps, translucent borders, and restrained gradients separate ordinary panels. Panel and floating shadows lift dialogs and map states; blue and gold glows call attention to selected or important elements. The home illustration uses a strong dark gradient so foreground copy remains readable.

### Shadow Vocabulary

- **Panel:** `0 0.75rem 2rem rgb(0 0 0 / 28%)` for content panels and larger state cards.
- **Floating:** `0 1.125rem 3rem rgb(0 0 0 / 38%)` for overlays and map states.
- **Blue glow / gold glow:** Soft color glows defined in `src/styles/tokens.css`, used sparingly for emphasis.

**The Ambient Depth Rule.** Use tonal separation for routine grouping; reserve stronger shadows for surfaces that float over other content.

Live Ranked inherits the standard app background. Its bordered stage uses the shared Night Sky app background token, with no stage shadow or glow. Depth comes from card overlap and the shared card-frame shadows; the fan avoids a filtering layer around moving cards. Shared collection card frames supply the printed material; CSS supplies card rotation and shadow.

## Shapes

General controls use the small and medium radii; panels use large corners; badges and handles use pill or circular silhouettes. Borders remain thin and translucent. Collectible cards are the deliberate exception: they use a recessed square artwork window, metallic rims, corner engraving, and rarity-specific material colors while sharing one frame geometry.

Live Ranked uses a `1px` Beacon Gold Light stage border, the shared `1rem` panel radius, and a scoped `1.75rem` radius in tall portrait layouts. The Change deck control keeps pill corners.

## Components

### Buttons

Primary buttons are filled Trail Blue, bold, and at least touch-target height. Quiet buttons have an outline and transparent rest state, gaining a raised navy fill on hover. Pressed controls move down slightly. Disabled controls lower opacity; keyboard focus keeps the bright blue outline and offset. The standard transition is `140ms` with the shared easing curve.

### Cards / Containers

Ordinary state and content panels combine a thin border, large corner, navy gradient, and panel shadow. Selected options use a blue border and subtle inset emphasis. The collectible frame is a separate signature component with common, rare, epic, and legendary material variants; its frame palette must not become the default panel palette.

### Inputs / Fields

Fields sit on the darkest navy with ivory text, a thin border, small radius, and touch-target height. Focus uses the global blue outline. Invalid fields use the danger color in the border and an accompanying text error.

### Navigation

Player navigation uses icon and text labels. The current item receives gold text, a faint gold fill, and a short underline, with `aria-current="page"` providing semantic state. Mobile navigation sits at the bottom; the same destinations appear horizontally in the header at wide widths. Explore may collapse its mobile header to make room for the map and sheet.

### Status Badges

Small pill badges use colored text and faint matching fill for active, upcoming, ended, and informational states. They remain readable as text without depending on color.

### Live Ranked stage and deck fan

The stage groups the current season, real season record and rating, selected deck, and ranked search action. Play, Standings, and Watch remain semantic tabs. The card fan resolves the selected deck’s exact owned-card IDs through the owned-card collection, ordered by deck position. It uses shared `CardThumbnail` artwork, names, and rarity frames. Hover lifts and tilts a card; keyboard focus raises it above overlapping neighbors. Click, tap, or Enter opens the shared `CardPresentationDialog` with authoritative stats and rules, Escape closes it, and focus returns to the card. Collection loading and failure do not block matchmaking; named fallback frames remain visible and failed details can be retried.

The fan has a non-looping `550ms` entry settle using the shared easing curve. Searching and proposed queue states fold it to `min(100%, 24rem)`, reduce horizontal translation and rotation to 65%, and cancel the settle animation. The hover lift is 0.5rem over 260ms with exponential easing. The fan scales the shared pointer spring to 30% rotation and 45% enlargement, with flat transform composition. An outgoing card retains z-index 8 while its spring settles; the active hover or keyboard card uses 10, above the resting fan. The fan isolates these layers from the page. Reduced-motion preference removes the card animation, lift, and tilt. The visual fold reflects server queue state and supplies no matchmaking authority.

Only a current, matching, loaded server profile supplies season wins, losses, rating, and provisional text. Loading, retry, season mismatch, unavailable season, missing or invalid deck, restriction, queue recovery, proposal acceptance, and private watching keep their real controls and textual states. Do not fill absent records with a sample score, tier, rank, streak, or match history. Queue eligibility, deadlines, legal actions, and settlement remain server-owned. Documentation records implemented styling; it does not certify the pending full-pixel review.

## Do's and Don'ts

### Do:

- **Do** draw ordinary surfaces, controls, and text from the shared navy, ivory, blue, and gold tokens.
- **Do** retain the Campus Seal and the current icon-and-label navigation language.
- **Do** pair state colors with words or icons and maintain the bright visible focus treatment.
- **Do** use the shared spacing and radius steps before adding local values.
- **Do** keep the Live Ranked display face, plain stage, and responsive tall variants scoped to that surface.
- **Do** preserve authoritative records, recovery controls, and reduced-motion behavior in ranked presentation.

### Don't:

- **Don't** spread collectible rarity metalwork across ordinary panels, forms, or navigation.
- **Don't** make gold compete with Trail Blue as the default control fill.
- **Don't** hide task status inside map styling or color alone.
- **Don't** invent ranked tiers, ratings, ranks, streaks, history, or eligibility to complete a visual composition.
