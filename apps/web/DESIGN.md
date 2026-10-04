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
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(2.75rem, 1.6rem + 5vw, 4.75rem)'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.02em'
  page-title:
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(2rem, 1.5rem + 2.5vw, 3rem)'
    fontWeight: 700
    lineHeight: 1.2
  entity:
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: '1.75rem'
    fontWeight: 700
    lineHeight: 1.2
  reward:
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: 'clamp(2.5rem, 1.5rem + 4vw, 4rem)'
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.6
  operational:
    fontFamily: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.35
  label:
    fontFamily: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: '0.06em'
  metric:
    fontFamily: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.375rem'
    fontWeight: 700
    lineHeight: 1.15
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
  interactive-highlight:
    rounded: '{rounded.sm}'
  filter-control:
    backgroundColor: '{colors.night-sky-panel}'
    textColor: '{colors.ivory}'
    rounded: '{rounded.sm}'
    height: '2.75rem'
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

Live Ranked is an approved scoped extension of this identity. Its competitive entry uses a compact Live Ranked label beside the tabs, a plain Night Sky stage with a thin gold border, and the active deck’s actual card faces. Both battle lobbies use Collection-style icon-and-label tabs with ivory selected text and a short gold underline. `/matches/pvp` has its own open inbox composition: a full serif page title, challenge action, separate tab row, and divided battle lists. The shared campus chrome and other surfaces retain their established rules. The Live Ranked surface contract and approved `duel-table-v3.png` carry that page's composition; final pixel-fidelity review remains pending.

**Key Characteristics:**

- Dark navy layers with warm ivory text and selective gold and blue accents.
- Serif display headings paired with compact sans-serif controls and comfortable body copy.
- Mobile navigation and task panels built around touch, safe areas, and visible state.
- Ambient panel depth; ornate finish reserved for collectible rewards.
- Collection-style tabs connect the battle lobbies; Live Ranked's competitive stage and deck preview remain distinct from the open Player Battles inbox.

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

The whole HTML interface uses two locally hosted variable families: **Source Serif 4** for the world and its entities, and **Source Sans 3** for reading and operating the app. Family selection follows meaning, not heading level. CSS family, weight, size, leading, and tracking tokens live in `src/styles/tokens.css`; `src/styles/fonts.css` supplies the WOFF2 faces. Source Serif uses automatic optical sizing. Font synthesis is disabled.

| Meaning                                            | Family / role tokens                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Display and marketing introductions                | Source Serif 4 / `--font-display`                                                     |
| Player page titles                                 | Source Serif 4 / `--font-page-title`                                                  |
| Card, deck, place, event, trail, and entity names  | Source Serif 4 / `--font-entity`                                                      |
| Reward and completion announcements                | Source Serif 4 / `--font-reward`                                                      |
| Descriptions and reading                           | Source Sans 3 / `--font-body`                                                         |
| Navigation, buttons, inputs, statuses              | Source Sans 3 / `--font-navigation`, `--font-control`, `--font-form`, `--font-status` |
| Scores, quantities, ratings, and charts            | Source Sans 3 / `--font-metric`; tabular numerals where columns benefit               |
| Task, dialog, question, and section headings       | Source Sans 3 / `--font-operational`                                                  |
| Author interface, including catalogue entity names | Source Sans 3 / `--font-author`                                                       |
| Code, keyboard notation, and API secrets           | System monospace / `--font-code`                                                      |

Rendered collectible artifacts inside Author previews retain their player-facing entity roles. The Live Ranked deck name uses the entity role; its rating, season information, mode label, actions, and states use sans-serif roles. Error, authentication, and recovery headings are operational. Color emoji retain the system emoji stack for glyph presentation.

### Weight, size, and reading system

Use four named weights: regular **400** for body copy, medium **500** for secondary emphasis, semibold **600** for controls and structured labels, and bold **700** for strong hierarchy. Do not introduce intermediate or heavier local weights. The variable assets support the full font range, but the interface uses this four-weight contract.

The size ramp is `--text-xs` 0.75rem, `--text-sm` 0.875rem, `--text-md` 1rem, `--text-lg` 1.125rem, `--text-xl` 1.375rem, `--text-2xl` 1.75rem, `--text-3xl` 2.25rem, and `--text-4xl` 3rem. Ordinary body text starts at **1rem / 16px** with a default 16px root. Compact support text has an absolute design floor of **0.75rem / 12px**; prefer 0.875rem / 14px for labels that need sustained reading. These are rem values so user scaling increases them. Zero-sized hidden map-marker glyphs are not text. Display, page, and reward scales use `--type-display-size`, `--type-page-size`, and `--type-reward-size`; entity titles use the appropriate shared ramp step rather than a new local scale.

Default body leading is 1.6, heading leading 1.2, compact/control leading 1.35, and metric leading 1.15. Use shared leading and tracking tokens rather than hard-coded component values. Readable prose uses the existing 44rem measure, approximately within 45–75 characters for ordinary copy; comfortable reading changes the readable measure to 65ch.

### Accessibility preferences

Preferences are applied on `html`. Plain font remaps every serif role to Source Sans 3 at the root, including card nameplates and React portals; code and semantic emoji remain unchanged. Comfortable reading changes the global leading, tracking, word-spacing, and reading-measure tokens. The body consumes those tokens, and component typography inherits or selects an appropriate role token. Avoid `.main-content` descendant preference overrides.

Interface sizes 100%, 125%, and 150% scale the root font. Preserve text size and let components reflow: mobile navigation labels wrap, card inspection switches from artwork/copy columns to one column when the available container is too narrow in rem, and analytics charts grow their geometry and allow keyboard-accessible horizontal scrolling. Keep dialog content and actions reachable by scrolling. Browser zoom and user root-font settings remain available.

### Delivery, licensing, and exceptions

The three local WOFF2 files cover Source Serif 4 Roman and Source Sans 3 upright/italic, with `font-display: swap` and no runtime font-provider request. The italic face is selected only when used; the existing service-worker WOFF2 rule precaches all three files. Both families are distributed under the **SIL Open Font License 1.1**; original copyright and license files, source commits, and SHA-256 hashes are retained under `src/assets/fonts/`. See the [font inventory and provenance](src/assets/fonts/README.md).

Mapbox-rendered map labels are a cartographic exception: they use the map provider's glyph service and style-defined font stacks, which CSS role tokens and accessibility preferences cannot reach. Supplying Source glyphs requires a separate map-glyph hosting change. All surrounding HTML map information follows the shared typography system. Artwork is preserved, including lettering baked into images.

## Layout

The app starts with a fluid mobile layout. General content is capped at `76rem`, readable prose at `44rem`, and header content at `90rem`. Spacing follows the eight-step scale in the frontmatter, from a quarter rem to four rem. Controls use at least a `2.75rem` target height.

Authenticated player routes use a fixed bottom navigation bar on smaller screens, with safe-area clearance in page content. At `75rem` and above it moves into the header. The Explore route uses a viewport-height map and a movable sheet; its task information remains available through a list. Author pages use a compact expandable navigation below `64rem` and a sidebar at larger widths. Home uses an image-led hero and changes from stacked sections to multiple columns at `48rem` and `64rem`.

**The Mobile Task Rule.** Reserve space for the bottom navigation and safe area before sizing sheets, sticky actions, or full-height views.

### Live Ranked extension

The lobby is capped at `56rem`. Its stage is a single grid with a `1.5rem` gap and fluid padding. Below `48rem`, the stage border extends `space-3` (12px) into each page gutter with matching additional inner padding; the content width, card size, and fan geometry stay unchanged. The compact interactive fan is capped at `30rem`, uses aspect ratio `2.25`, and gives each card `25%` of fan width; tablets from `48rem` through `74.99rem` cap the fan at `26rem`. The search control spans the usable stage width with centered text and a right-positioned arrow; its `3.5rem` minimum height is 56px at the default root size.

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

Live Ranked uses a `1px` Beacon Gold Light stage border, the shared `1rem` panel radius, and a scoped `1.75rem` radius in tall portrait layouts. The Change deck control uses the shared button radius of `0.625rem`.

**The Gentle Highlight Rule.** Interactive background highlights use the small radius (`--radius-sm`, mapped to `rounded.sm`) and enough horizontal padding to keep text clear of their edges. Apply this treatment consistently to tabs, section navigation, and clickable list or table rows in hover, focus, and selected states wherever those states have a background fill. Preserve each component's existing accent colors, selection underline, and visible keyboard focus.

For table rows, round only the outer corners of the first and last cells so the highlight reads as one continuous surface. Keep table rules and column alignment intact; use separate borders with zero spacing when collapsed borders prevent rounding. Avoid clipping focus outlines to achieve rounded highlights. Existing buttons, panels, and primary navigation retain their own radius tokens.

## Components

### Buttons

Primary buttons are filled Trail Blue, bold, and at least touch-target height. Quiet buttons have an outline and transparent rest state, gaining a raised navy fill on hover. Pressed controls move down slightly. Disabled controls lower opacity; keyboard focus keeps the bright blue outline and offset. The standard transition is `140ms` with the shared easing curve.

### Cards / Containers

Ordinary state and content panels combine a thin border, large corner, navy gradient, and panel shadow. Selected options use a blue border and subtle inset emphasis. The collectible frame is a separate signature component with common, rare, epic, and legendary material variants; its frame palette must not become the default panel palette.

### Collectible Card Interaction

**The Shared Card Interaction Rule.** Reuse the collectible thumbnail's pointer tilt and detail inspection when cards are viewed, built into a deck, or edited; keep membership controls separate from inspection.

The shared `CardThumbnail` pairs the existing material frame with `useCardTilt`. Non-touch pointer movement lifts and tilts the card through a spring, returning it to rest on leave or cancellation. The current hover target scales to `1.055` and lifts by `1.35rem`; gallery parents provide `55rem` perspective. Compact draft artwork uses the same hook. Leave room for the transformed card rather than clipping its frame or replacing its transform with a separate hover lift.

Clickable deck roster cards, collection-picker cards, and draft artwork open the shared `CardPresentationDialog`. Inspection presents the supplied card data without changing draft membership or order; unavailable detailed rules receive an explicit message. Keep keyboard activation, visible focus, modal focus containment, Escape dismissal, and focus restoration. Add and Remove remain separate controls outside the frame.

The favourite-card editor shows the selected cards as artwork in order. Drag the
artwork or its grip to reorder; arrow keys on the grip provide the keyboard
alternative. Inspection and removal remain separate actions. The picker requests
one currently owned copy per definition and renders 12 cards at a time, retaining
saved copy IDs for existing favourites.

Resolve motion through the application's shared preference: `reduce` disables card transforms regardless of the OS preference, `full` enables the shared pointer effect even when the OS requests reduction, and `system` follows the OS. Touch inspection remains available without tilt. This interaction is a collectible-card staple; ordinary panels retain their existing depth behavior.

### Inputs / Fields

Fields sit on the darkest navy with ivory text, a thin border, small radius, and touch-target height. Focus uses the global blue outline. Invalid fields use the danger color in the border and an accompanying text error.

**The Shared Selection Control Rule.** Native radios and checkboxes use `src/styles/selection-controls.css`: 20px controls, a slate outline, a blue radio dot or filled checkbox with a dark checkmark, and a quiet blue selected-row highlight. Keep native input semantics, label activation, radio-group arrow keys, checkbox Space activation, and disabled states. Wrapped controls show focus around their whole label; standalone controls retain the global focus outline. Existing card and grid layouts keep their geometry, and the starter-card picker retains its hidden radios and card-level selection/focus treatment. Forced-color mode restores native control rendering. Page styles should define alignment rather than duplicate the shared control appearance.

**The Shared Filter Control Rule.** Search and filter controls across Author, Explore, and Collection use the shared search and select components. Author creation and editing forms use the same select component, including nested move, effect, challenge, and question fields. Text inputs, textareas, and date controls share its surface, border, corner radius, and focus treatment. Their slightly raised navy surface, small corners, quiet border, and consistent target height make browsing controls recognizable across pages. Searches include a leading search icon and a clear action that returns focus to the input. Custom select menus use the same navy surface, gently rounded options, and a checkmark beside the selected value. Keep visible labels or equivalent accessible names, keyboard navigation, Escape dismissal, focus restoration, disabled states, and viewport-bounded scrolling. Preserve the page's existing filtering and submission behavior.

### Navigation

Player navigation uses icon and text labels. The current item receives gold text, a faint gold fill, and a short underline, with `aria-current="page"` providing semantic state. Mobile navigation sits at the bottom; the same destinations appear horizontally in the header at wide widths. Explore may collapse its mobile header to make room for the map and sheet.

### Status Badges

Small pill badges use colored text and faint matching fill for active, upcoming, ended, and informational states. They remain readable as text without depending on color.

### Player Battles lobby

`/matches/pvp` uses an open `64rem` inbox with a full serif page title, a compact turn-window hint, and the challenge action in its header. Active, Invitations, and History sit on a separate tab row beneath that header. Their icons, label weight, ivory active text, and inset gold underline match Collection; zero counts remain accessible without visual clutter. Section headings, controls, player names, and status use the shared body face. Battle and invitation records use divided rows with textual status, without an enclosing stage or decorative side borders. Received and sent invitations form two columns on wide screens and stack on mobile. Confirmed challenge setup places lookup beside deck and starting-creature selection on wide screens, keeping the original linear order on mobile.

When there are no active battles or pending invitations in either direction, challenge setup opens on arrival. Otherwise the existing priority remains: your turn, received challenges, then waiting battles. Exact Player Name lookup precedes deck and starting-creature selection, ending in a full-width Send challenge control. A confirmed send closes setup and selects Invitations. Tab selection closes setup without clearing draft choices. Polling does not override the player's chosen view. Server validation, exact owned-card identity, safe retry IDs, pagination, cancellation confirmation, and recovery remain authoritative.

Tab headings remain available to screen readers without repeating the selected tab visually. Challenge setup uses short labels and one exact-name privacy hint. Invitation rows omit repeated direction labels and creation times, keeping the expiry or latest update. Errors state the problem and recovery action once; safe retries and irreversible cancellation remain explicit.

### Live Ranked stage and deck fan

The stage groups the current season, real season record and rating, selected deck, and ranked search action. Play, Standings, and Watch remain semantic tabs. The card fan resolves the selected deck’s exact owned-card IDs through the owned-card collection, ordered by deck position. It uses shared `CardThumbnail` artwork and rarity frames without visible nameplates. Card names remain in accessible button labels and the details dialog. Hover lifts and tilts a card; keyboard focus raises it above overlapping neighbors. Click, tap, or Enter opens the shared `CardPresentationDialog` with authoritative stats and rules, Escape closes it, and focus returns to the card. Collection loading and failure do not block matchmaking or packaged artwork: the deck summary’s exact card definition IDs resolve approved manifest images immediately, using eager, high-priority responsive sources sized for the fan. Unknown definitions retain named fallback frames. Collection responses supply the authoritative image URLs and full details when ready, and failed details can be retried.

Lobby copy keeps the next action clear: Find battle, Accept, Cancel search, and Select deck. The deck preview omits turn-time copy; searching omits the rating-range diagnostic. Territory location guidance appears only when contesting is selected, and territory failures use one actionable queue alert. Ranked penalties stay in the collapsed rules and proposal guidance. Watch uses one link-or-ID field label and a short privacy hint. Standings show rank, player, rating, and win/loss record without a repeated match count.

The fan has a non-looping `550ms` entry settle using the shared easing curve. Searching and proposed queue states fold it to `min(100%, 24rem)`, reduce horizontal translation and rotation to 65%, and cancel the settle animation. The hover lift is 0.5rem over 260ms with exponential easing. The fan retains 30% rotation and 45% enlargement with flat transform composition. Its shared thumbnail opts into a critically damped cursor response that preserves velocity when direction changes and follows elapsed frame time. Pointer coordinates use the bounds captured at hover entry and clamp to the card’s original range, preventing the moving card from feeding motion back into its own target. Other card surfaces retain their existing spring. The active hover or keyboard card uses z-index 10. On pointer exit, the outgoing card immediately returns to its normal fan layer while its transform eases to rest. Settling no longer controls stacking or toggles compositor hints, preventing a delayed overlap change after fast swipes. The fan isolates these layers from the page. Reduced-motion preference removes the card animation, lift, and tilt. The visual fold reflects server queue state and supplies no matchmaking authority.

Only a current, matching, loaded server profile supplies season wins, losses, rating, and provisional text. Loading, retry, season mismatch, unavailable season, missing or invalid deck, restriction, queue recovery, proposal acceptance, and private watching keep their real controls and textual states. Do not fill absent records with a sample score, tier, rank, streak, or match history. Queue eligibility, deadlines, legal actions, and settlement remain server-owned. Documentation records implemented styling; it does not certify the pending full-pixel review.

## Do's and Don'ts

### Do:

- **Do** draw ordinary surfaces, controls, and text from the shared navy, ivory, blue, and gold tokens.
- **Do** retain the Campus Seal and the current icon-and-label navigation language.
- **Do** pair state colors with words or icons and maintain the bright visible focus treatment.
- **Do** use the shared spacing and radius steps before adding local values.
- **Do** share the Collection-style icon tabs across the battle lobbies while keeping their compositions distinct; keep Live Ranked's stage, deck fan, and responsive tall variants scoped to that surface.
- **Do** preserve authoritative records, recovery controls, and reduced-motion behavior in ranked presentation.
- **Do** give interactive highlights gentle corners and breathing room using the Gentle Highlight Rule.

### Don't:

- **Don't** spread collectible rarity metalwork across ordinary panels, forms, or navigation.
- **Don't** make gold compete with Trail Blue as the default control fill.
- **Don't** hide task status inside map styling or color alone.
- **Don't** invent ranked tiers, ratings, ranks, streaks, history, or eligibility to complete a visual composition.

Shared collectible-card interaction, gentle-highlight, filter-control, and selection-control guidance was edited with assistance from Codex[GPT-6].
