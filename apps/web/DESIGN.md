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
rounded:
  sm: '0.375rem'
  md: '0.625rem'
  lg: '1rem'
  xl: '1.5rem'
  pill: '999px'
  frame: '15px'
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
---

# Design System: Wits World

## Overview

**Creative North Star: "The Campus Quest Atlas"**

The interface feels adventurous and scholarly. Deep Night Sky surfaces establish a quiet field for campus discovery, while Trail Blue guides interaction and Beacon Gold marks identity, progress, and selected destinations. The home illustration makes the quest tangible; the working screens give the player's next action and current state priority.

The system uses clear controls and crafted rewards. Common panels, forms, and navigation share restrained geometry and readable spacing. Collectible card frames carry the dense celestial academic metalwork, with material and engraving changes for rarity. The approved Campus Seal and W/star marks anchor the identity. This record describes the existing React interface in `src/styles/`, page styles, and assets; it does not prescribe a new visual direction.

**Key Characteristics:**

- Dark navy layers with warm ivory text and selective gold and blue accents.
- Serif display headings paired with compact sans-serif controls and comfortable body copy.
- Mobile navigation and task panels built around touch, safe areas, and visible state.
- Ambient panel depth; ornate finish reserved for collectible rewards.

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

## Layout

The app starts with a fluid mobile layout. General content is capped at `76rem`, readable prose at `44rem`, and header content at `90rem`. Spacing follows the eight-step scale in the frontmatter, from a quarter rem to four rem. Controls use at least a `2.75rem` target height.

Authenticated player routes use a fixed bottom navigation bar on smaller screens, with safe-area clearance in page content. At `75rem` and above it moves into the header. The Explore route uses a viewport-height map and a movable sheet; its task information remains available through a list. Author pages use a compact expandable navigation below `64rem` and a sidebar at larger widths. Home uses an image-led hero and changes from stacked sections to multiple columns at `48rem` and `64rem`.

**The Mobile Task Rule.** Reserve space for the bottom navigation and safe area before sizing sheets, sticky actions, or full-height views.

## Elevation & Depth

Depth is layered and ambient. Dark tonal steps, translucent borders, and restrained gradients separate ordinary panels. Panel and floating shadows lift dialogs and map states; blue and gold glows call attention to selected or important elements. The home illustration uses a strong dark gradient so foreground copy remains readable.

### Shadow Vocabulary

- **Panel:** `0 0.75rem 2rem rgb(0 0 0 / 28%)` for content panels and larger state cards.
- **Floating:** `0 1.125rem 3rem rgb(0 0 0 / 38%)` for overlays and map states.
- **Blue glow / gold glow:** Soft color glows defined in `src/styles/tokens.css`, used sparingly for emphasis.

**The Ambient Depth Rule.** Use tonal separation for routine grouping; reserve stronger shadows for surfaces that float over other content.

## Shapes

General controls use the small and medium radii; panels use large corners; badges and handles use pill or circular silhouettes. Borders remain thin and translucent. Collectible cards are the deliberate exception: they use a recessed square artwork window, metallic rims, corner engraving, and rarity-specific material colors while sharing one frame geometry.

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

## Do's and Don'ts

### Do:

- **Do** draw ordinary surfaces, controls, and text from the shared navy, ivory, blue, and gold tokens.
- **Do** retain the Campus Seal and the current icon-and-label navigation language.
- **Do** pair state colors with words or icons and maintain the bright visible focus treatment.
- **Do** use the shared spacing and radius steps before adding local values.
- **Do** give interactive highlights gentle corners and breathing room using the Gentle Highlight Rule.

### Don't:

- **Don't** spread collectible rarity metalwork across ordinary panels, forms, or navigation.
- **Don't** make gold compete with Trail Blue as the default control fill.
- **Don't** hide task status inside map styling or color alone.

Shared collectible-card interaction, gentle-highlight, filter-control, and selection-control guidance was edited with assistance from Codex[GPT-6].
