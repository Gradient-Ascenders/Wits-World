---
title: 'Design and accessibility standards'
---

# Design and accessibility standards

**Status:** Maintained design reference  
**Applies to:** `apps/web`  
**Last updated:** 2026-09-07

This document is the visual and interaction source of truth for Wits World.

It defines the design language, tokens, responsive behaviour, component rules,
iconography, motion, accessibility, and approved frontend UI toolkit.

Product rules, game mechanics, permissions, server-authoritative behaviour, and
feature-specific business logic belong in the relevant requirements and
technical documentation.

Reference images communicate art direction, not exact layouts.

---

## 1. Design principles

### Calm by default

Wits World should feel like a modern university product: refined, exploratory,
technologically confident, and premium without becoming theatrical.

Routine screens should be clear and composed.

Reserve stronger visual effects for meaningful moments such as:

- location discovery;
- challenge completion;
- reward reveals;
- battle outcomes;
- important state changes.

### One clear purpose

Every screen should have:

- one obvious primary task;
- one dominant content region;
- one visually dominant primary action;
- quieter secondary actions.

Use progressive disclosure for secondary detail.

### Mobile first, not mobile only

The player application is mobile-first.

Design narrow layouts first, then use additional desktop width for useful
context, comparison, and efficiency.

Mobile must not feel like a desktop dashboard compressed onto a phone.

Desktop must not feel like a mobile layout stretched across a monitor.

### Structure before decoration

Establish hierarchy using:

1. layout;
2. spacing;
3. typography;
4. grouping;
5. colour;
6. decoration.

Do not add extra cards, borders, gradients, or glows to solve problems that
spacing or hierarchy can solve.

### Distinctive, not noisy

Wits World may use:

- deep navy surfaces;
- restrained blue interaction signals;
- selective metallic-gold prestige details;
- serif display typography;
- campus imagery;
- subtle scientific, map, network, and geometric motifs.

It must not resemble:

- a generic SaaS dashboard;
- a cyberpunk nightclub;
- a children's mobile game;
- an overloaded gaming HUD;
- a wall of unrelated floating cards.

### Consistency over novelty

Prefer shared tokens, components, and interaction patterns over one-off styling.

---

## 2. Anti-clutter rules

1. Each screen has one primary purpose.
2. Each panel normally has at most one primary action.
3. Secondary actions must be visually quieter.
4. Use spacing and dividers before adding another container.
5. Avoid cards nested inside cards.
6. Use no more than three visible elevation levels in one view.
7. Do not use gold borders on routine components.
8. Do not place glow effects behind normal text.
9. Do not duplicate information without a clear UX reason.
10. Use progressive disclosure for secondary controls.
11. Empty space is allowed.
12. Mobile should favour focused flows over dense dashboards.
13. Desktop should use extra width for useful context, not more decoration.

---

## 3. Colour

### Semantic roles

**Blue = interaction**

Use blue for primary actions, links, active navigation, selection, focus,
progress, map interaction, and technical information.

**Gold = prestige**

Use gold for legendary rarity, important rewards, significant achievements,
rare celebratory details, and selective brand ornament.

Gold is **not** the normal primary-button colour and **not** the normal border
colour.

**Green, amber, and red = semantic feedback**

Reserve them for success, warning, and danger.

Never rely on colour alone to communicate meaning.

### Tokens

```css
:root {
  --colour-bg-primary: #050b16;
  --colour-bg-secondary: #081426;
  --colour-bg-tertiary: #0b1930;

  --colour-surface-primary: #0d1b31;
  --colour-surface-elevated: #112440;
  --colour-surface-strong: #173052;
  --colour-surface-glass: rgba(12, 27, 50, 0.82);

  --colour-text-primary: #f7f3e7;
  --colour-text-secondary: #b9c3d2;
  --colour-text-muted: #8795a8;
  --colour-text-inverse: #08101d;

  --colour-border-subtle: rgba(247, 243, 231, 0.1);
  --colour-border-default: rgba(247, 243, 231, 0.16);
  --colour-border-strong: rgba(247, 243, 231, 0.28);

  --colour-interactive: #2a6bff;
  --colour-interactive-hover: #4a83ff;
  --colour-interactive-strong: #174a99;
  --colour-focus: #54a8ff;

  --colour-prestige: #d4af37;
  --colour-prestige-soft: #e0c46c;
  --colour-prestige-muted: #9d8130;

  --colour-success: #39b879;
  --colour-warning: #e1a93a;
  --colour-danger: #dc5b65;
  --colour-info: #54a8ff;

  --colour-overlay: rgba(2, 7, 15, 0.72);
}
```

### Rarity

| Rarity    | Treatment              |
| --------- | ---------------------- |
| Common    | Neutral silver / ivory |
| Rare      | Blue                   |
| Epic      | Restrained violet      |
| Legendary | Gold                   |

Also communicate rarity using text, iconography, pattern, or ornament.

---

## 4. Typography

```css
:root {
  --font-heading: 'Playfair Display', 'Georgia', serif;
  --font-body:
    'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;
  --text-4xl: 3rem;

  --leading-tight: 1.15;
  --leading-heading: 1.25;
  --leading-body: 1.55;
}
```

Use the serif family selectively for page titles, landmark names, reward
reveals, battle conclusions, and important editorial headings.

Use the sans-serif family for normal application UI.

Rules:

- sentence case for most headings and labels;
- uppercase only for short metadata or eyebrow text;
- body copy should normally remain at least `1rem`;
- do not shrink text to force dense layouts to fit;
- avoid long centred paragraphs;
- establish hierarchy through typography before decoration.

---

## 5. Spacing, sizing, and shape

### Spacing

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4rem;
}
```

Prefer tokens over arbitrary values.

### Controls

```css
:root {
  --control-height-sm: 2.25rem;
  --control-height-md: 2.75rem;
  --control-height-lg: 3rem;

  --touch-target-min: 2.75rem;

  --icon-sm: 1rem;
  --icon-md: 1.25rem;
  --icon-lg: 1.5rem;
}
```

Player-facing mobile controls should normally provide at least a `44 × 44px`
usable touch target.

### Radius

```css
:root {
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;
  --radius-pill: 999px;
}
```

Default guidance:

- buttons and fields: `--radius-md`;
- panels: `--radius-lg`;
- prominent media and bottom sheets: up to `--radius-xl`;
- badges: `--radius-pill`.

Avoid overly soft, bubbly component styling.

### Elevation

```css
:root {
  --shadow-panel: 0 12px 32px rgba(0, 0, 0, 0.28);
  --shadow-floating: 0 18px 48px rgba(0, 0, 0, 0.38);

  --glow-blue: 0 0 24px rgba(42, 107, 255, 0.2);
  --glow-gold: 0 0 20px rgba(212, 175, 55, 0.14);
}
```

Routine panels should not glow.

---

## 6. Responsive layout

### Reference ranges

```text
Narrow mobile:  320px–374px
Mobile:         375px–767px
Tablet:         768px–1023px
Desktop:        1024px–1439px
Wide desktop:   1440px+
```

Routine visual QA should normally use:

```text
390px   mobile
768px   tablet
1440px  desktop
```

Use extra widths only when a specific breakpoint needs investigation.

### Page gutters

```css
:root {
  --page-gutter-mobile: 1rem;
  --page-gutter-tablet: 1.5rem;
  --page-gutter-desktop: 2rem;

  --content-reading: 45rem;
  --content-standard: 70rem;
  --content-wide: 90rem;
}
```

Use wide layouts only for maps, large grids, tables, editors, and useful
comparisons.

Do not stretch normal text across wide monitors.

### Player application

On mobile, prefer focused single-column flows, bottom navigation where
appropriate, bottom sheets for contextual map detail, full-width or near
full-width primary actions, concise information, and minimal typing.

On desktop, preserve the same task hierarchy, add useful context where space
allows, allow grids to gain columns naturally, and use split views only when
both regions remain useful.

### Author console

Desktop may use stable sidebar navigation, tables, filters/search, split
editor/preview layouts, and higher information density.

On narrow screens, sidebars become drawers or compact navigation, forms remain
vertically readable, and tables become cards or controlled horizontal regions
where appropriate.

Author routes use their own section navigation focused on content management.
Retain the shared desktop top navigation so authors can move between the player
application and author console.
On smaller screens, retain the shared bottom navigation with sufficient page
padding for the device safe area. Author save state and actions follow the final
form section in normal document flow, without pinning or scroll-based collapsing.
Keep desktop catalogue rows compact and aligned to the top. On mobile and tablet,
use an expandable navigation region and focused list/detail routes.
Editors share a persistent save bar showing unchanged, unsaved, saving, and
failed-save feedback; successful saves retain the existing record confirmation.
Save controls remain separate from publication and retirement. Use neutral
section labels and blue interaction states; reserve gold for the brand and
collectible previews. Preserve server lifecycle names and transition rules.

---

## 7. Core component rules

Build recurring UI from shared components and semantic variants.

Recommended foundations include:

- `AppShell`
- `PlayerBottomNavigation`
- `AuthorSidebar`
- `PageHeader`
- `SectionHeader`
- `PrimaryButton`
- `SecondaryButton`
- `GhostButton`
- `IconButton`
- `StatusBadge`
- `RarityBadge`
- `Panel`
- `ProgressIndicator`
- `EventSummary`
- `CollectibleCard`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `Modal`
- `Drawer`
- `BottomSheet`
- `FormField`
- `DataTable`
- `FilterBar`

### Buttons

**Primary**

- blue background;
- high-contrast text;
- normal dominant action;
- usually `--control-height-md`;
- clear hover, pressed, focus, loading, and disabled states.

**Secondary**

- quieter surface or transparent treatment;
- neutral border;
- must not compete with Primary.

**Ghost**

- low-emphasis action;
- transparent by default;
- visible hover and focus treatment.

**Destructive**

- danger semantics;
- explicit wording;
- confirmation where appropriate.

### Panels

Use a panel only when content genuinely belongs together.

Default:

- one surface;
- subtle neutral border when needed;
- no glow;
- no gold border;
- `--radius-lg`;
- `--space-4` to `--space-5` padding.

Avoid panel-inside-panel layouts.

### Forms

Use persistent labels, useful validation/help text, neutral borders, blue focus
treatment, and comfortable vertical spacing.

Do not use placeholder text as the only label.

### Modals, drawers, and sheets

Use:

- **Modal** for short blocking decisions;
- **Drawer** for navigation or secondary controls;
- **BottomSheet** for contextual mobile detail, especially map flows.

They must remain within the viewport, manage focus correctly, expose obvious
close/cancel behaviour, and support scrolling when required.

### Tables

Use tables only when column comparison is useful.

On mobile, convert to structured cards when that improves comprehension;
otherwise use controlled horizontal scrolling.

Never shrink text merely to make a table fit.

### Application states

Substantial features should deliberately support loading, empty, error,
unavailable, and permission-required states where relevant.

Preserve layout during state changes where practical.

### Feedback and recovery

Use the shared `LoadingState`, `Skeleton`, `StatusMessage`, and `StateIcon`
primitives in `apps/web/src/components`, with `styles/states.css` owning their
visual treatment. Existing route-specific recovery regions may use the same
`state-message` semantic classes while retaining their headings, focus targets,
and actions.

- Use static row, card, or battle skeletons for substantial initial loading;
  use compact labelled loading for local actions. Skeletons are decorative and
  hidden from assistive technology. Only the compact spinner rotates, with a
  reduced-motion alternative.
- Keep empty and filtered-out results neutral. Distinguish permission requirements
  from failures using text and a small semantic icon. Keep unavailable actions'
  useful explanations visible.
- Use a restrained danger edge for errors, readable bounded copy, and the existing
  real retry action. Keep useful confirmed content visible during local failures.
- Keep validation and unsuccessful saves beside the affected form. Preserve typed
  domain guidance; hide infrastructure diagnostics from normal users.
- Use the shared Sonner `AppToaster` for brief routine confirmations. Replace the
  previous confirmation rather than stacking; never duplicate inline feedback or
  move decisions and recovery information into disappearing notifications.
- On phones, use compact padding and keep toast dismissal touch-sized and above
  bottom navigation. On desktop, anchor feedback to its content region and bound
  prose width. Preserve focus and reduced-motion behaviour.

### Collectible card frames

`CardFrame` and `card-frame.css` own a layered collectible bezel, recessed
square artwork window, and integrated lower plate. The reference images under
`docs/design/references/card-frames` guide material and ornament; they are never
loaded by the application. Preserve the supplied artwork with `object-fit: contain`.

Use one shared geometry with progressively richer material and celestial engraving:

- Common: ivory/silver, restrained compass corners and an open diamond.
- Rare: deep blue enamel, warm metallic engraving and a star crest.
- Epic: deep violet, double-line details and an orbital medallion.
- Legendary: layered gold, a dark inset plate and a raised luminous crest.

The shared SVG masks under `src/assets/cards` supply compass corners, an orbital
plate engraving and a crest. Keep them decorative and separate from artwork.
At compact sizes, omit side engravings and reduce background detail; larger
frames reveal finer linework. No looping shimmer, glow or tilt.

Collection and deck-picker names sit inside the frame's lower plate. Detail
headings and gameplay metadata retain their existing surrounding structure.
Quantity is neutral; selection and keyboard focus belong to the external control,
independent of rarity. Retired cards keep readable artwork and a text label.

Collection, deck picking, details, evolution and author previews share this
frame. Revealed battle artwork uses the full shared bezel, engraving and lower
plate in a neutral metal finish because battle identities do not supply rarity.
The neutral plate has decoration but no rarity label. Do not infer rarity from
names or artwork. Preserve
existing page layouts and server-authoritative state. Hover elevation respects
reduced motion.

### Deck editing

Keep the viewed deck distinct from the deck active for matches. On mobile and
tablet, use a compact deck switcher and focused deck/collection views while
editing. On desktop, show the draft beside its collection. Keep card count,
readiness, unsaved state, and saving together. On mobile, keep the action area
fixed above player navigation; on desktop, place it below the cards in normal
page flow. Explain blocked saves and full-copy selections in text.
Search and filters must preserve selected copies. Use blue for selection and
label add/remove actions; keep collectible artwork and frames independent of
editor controls.

The mobile save area may minimise after deliberate downward scrolling and expand
on upward scrolling or at the top. Keep it minimised at the bottom and stable while scrolling pauses
or jitters. Its compact form must retain status, a touch-sized Save action, and a
keyboard-accessible way to expand. Keep focused controls and pending decisions
stable; expand for saving or save errors, and respect reduced motion.

### Battles

CPU and player battles share combatant, action-selection, and owned-bench
presentation. Keep current turn and required action above the battlefield. On
phones, stack opponent and player with readable HP, Power, and active effects;
keep action categories and their touch-sized controls directly below. Allow
page scrolling for long names, effects, errors, and expanded context rather
than clipping the battle to a fixed viewport. On phones, show moves in a
two-column grid with names, effects and costs visible together. Let the action
region grow with its content; do not put move selection inside a scrolling tray.
Keep Power cards full-width for their longer descriptions.

On desktop, show both combatants together and put history and secondary details
beside the battlefield. Expanded desktop sidebar content must scroll within
the height established by the battlefield and actions; it must not stretch
those regions. Disclose the owned bench and opponent reserve separately;
never infer unplayed opponent identities. Use blue for the acting side and
selection, with explicit turn labels. Forced replacement presents only
replacement actions. Explain unavailable actions from supplied state while
keeping the legal-action list authoritative. Keep forfeit behind a secondary
“Leave this battle” disclosure and a confirmation dialog. Results should offer
a clear route back to play. Preserve collectible artwork and frames independently
of battle controls. Use approved roster artwork for revealed active Creatures and owned bench
thumbnails. Match exact revealed names against the artwork manifest; unknown
names and failed images retain a neutral fallback. Never request art for an
unrevealed opponent Creature. CPU history and asynchronous PvP activity may differ when
their supplied records differ.

### Map discovery

Keep mobile discovery collapsed until requested. Opening the event list should
show usable results, not only its search and navigation controls. Selecting an
event returns to a partial sheet with its name, availability, and primary action
first; descriptions and schedule details can be disclosed separately. Keep the
sheet handle and its keyboard alternative at least 44px high.

Use a bounded sheet on tablet and a stable side region beside the map on desktop.
Account for sheets, notices, navigation, and safe areas when sizing the map and
framing its camera. A selected marker must remain in the unobstructed map region.
Retain map-independent event discovery through permission and map failures.

Use neutral event markers with blue selection, restrained status indicators, and
no routine glow. Location controls should distinguish following from recentering
and identify accuracy as reported. Preserve the map provider's marker positioning
classes while exposing interactive markers as buttons.

---

## 8. Iconography

The approved general-purpose UI icon library is:

```text
@phosphor-icons/react
```

Use Phosphor for generic application concepts such as navigation, search,
filtering, location, account, settings, edit, delete, status, date/time, and
common card actions.

### Selection

Choose icons by the concept they communicate in context.

Prefer familiar symbols for familiar actions.

Do not preserve an existing icon merely because it already exists. Replace weak,
ambiguous, inconsistent, or visually mismatched symbols during UI/UX work.

### Size

```text
16px  compact metadata
20px  normal controls
24px  primary navigation / prominent controls
```

The visible icon size is separate from its interactive target.

### Weight

Prefer:

- **Regular** for normal UI;
- **Bold** selectively for stronger or active states;
- **Fill** only where it improves selected-state recognition;
- **Duotone** only for deliberate illustrative treatments.

Do not mix weights arbitrarily within the same control group.

### Colour

- neutral icons inherit text colour;
- active/interactive icons use blue;
- semantic icons use semantic colours;
- gold is reserved for genuine prestige or legendary/reward meaning.

### Icon buttons

Every icon-only control must:

- provide an accessible name;
- have visible focus;
- provide hover/pressed states where applicable;
- maintain at least a 44px mobile touch target;
- use the shared `IconButton` where practical.

Important or ambiguous actions should include a text label.

### Custom Wits World symbols

Use custom SVGs only for concepts specific to Wits World, such as game
mechanics, bespoke affinities/categories, custom rarity emblems, branding, and
Quest markers.

Custom symbols should share consistent geometry, stroke behaviour, optical
weight, view boxes, and alignment.

Default rule:

> Generic application concept → Phosphor  
> Wits World-specific concept → approved custom symbol

### Do not

- use emoji as permanent UI icons;
- substitute Unicode symbols such as `★`, `→`, `✓`, `⚙`, or `✕` for proper icons;
- draw arbitrary inline SVGs for generic UI;
- mix multiple general-purpose icon libraries;
- use different icons for the same action without a semantic reason;
- add decorative icons merely to fill space.

---

## 9. Interaction states

Every interactive component should support the states relevant to it:

- default;
- hover;
- pressed;
- selected;
- focus-visible;
- disabled;
- loading;
- error;
- success.

Keyboard focus must always remain clearly visible.

Disabled controls should remain legible and should not replace useful
explanations when the reason for unavailability matters.

Loading states should prevent duplicate actions without unnecessarily blocking
the rest of the screen.

---

## 10. Motion

Motion should communicate state change, causality, or spatial movement.

Good uses:

- modal/sheet transitions;
- selected navigation indicators;
- layout changes;
- card selection;
- progress changes;
- map marker emphasis;
- answer confirmation;
- reward reveals;
- battle outcomes.

Avoid:

- continuously moving backgrounds;
- decorative motion behind text;
- excessive hover movement;
- long blocking animations;
- motion required to understand information.

Respect `prefers-reduced-motion`.

---

## 11. Frontend UI toolkit

The following libraries are approved for experimentation.

They support the Wits World design system; they do **not** define its visual
identity.

They are available, not mandatory.

### Phosphor Icons

```text
@phosphor-icons/react
```

Use for generic application iconography.

Do not introduce another general-purpose icon set.

### Motion for React

```text
motion
```

Use for meaningful transitions, layout animation, selection feedback, sheets and
dialogs, card interaction, and reward/battle moments.

Do not add motion simply because the library is available.

### Radix UI Primitives

Approved starting packages:

```text
@radix-ui/react-dialog
@radix-ui/react-tooltip
@radix-ui/react-dropdown-menu
```

Additional Radix primitives may be introduced when genuinely required.

Use Radix for accessible interaction behaviour, then style it entirely through
Wits World tokens and components.

Radix must not introduce a second visual language.

### Sonner

```text
sonner
```

Use for brief, non-blocking feedback such as save confirmation, successful
actions, and recoverable errors.

Do not use a toast for information that must remain visible, requires a
decision, or belongs naturally inside the affected component.

### Embla Carousel

```text
embla-carousel-react
```

Use only where horizontal browsing genuinely improves the experience, such as a
deliberate card or reward presentation.

Do not convert normal grids, lists, or navigation into carousels merely because
Embla is installed.

### Prefer the platform first

Prefer modern browser and CSS capabilities where they solve the problem cleanly:

- CSS Grid;
- Flexbox;
- container queries;
- CSS custom properties;
- responsive media queries;
- native scrolling;
- semantic HTML.

A dependency is justified when it materially improves accessibility,
interaction quality, consistency, maintainability, or implementation
reliability.

Remove experimental dependencies that do not provide meaningful value.

---

## 12. Accessibility

Accessibility is part of every component contract.

Relevant interfaces must provide:

- semantic HTML;
- logical heading order;
- keyboard navigation;
- visible focus;
- accessible names for icon-only controls;
- adequate text and UI contrast;
- suitable touch targets;
- labelled forms;
- useful validation;
- screen-reader status updates;
- alternatives to colour-only information;
- reduced-motion support;
- text alternatives for informative images;
- map-independent event discovery;
- usable loading, empty, error, and unavailable states.

Decorative imagery and technical motifs should be hidden from assistive
technology when they add no meaning.

---

## 13. Imagery and decoration

Imagery may support Wits landmarks, history, science, technology, campus
exploration, and collectible cards.

Restrained motifs may include orbital curves, scientific diagrams, network
lines, topographic patterns, map paths, and geometric grids.

Decoration must never compete with controls, content, or readability.

Do not add decorative elements merely to fill empty regions.

---

## 14. Branding

The approved Wits World Campus Seal and Quest Marker assets should be treated as
final artwork.

Preserve their SVG vector data, geometry, colours, aspect ratio, and embedded
provenance metadata where present.

Render branding through image assets rather than copying SVG paths into JSX.

Do not crop, stretch, recolour, animate, or apply strong visual effects to
approved branding.

Official Wits University marks are not automatically approved by the existence
of Wits World project branding.

---

## 15. Content style

Interface copy should be concise, confident, helpful, non-accusatory, and
understandable to students and campus visitors.

Prefer:

> Your location could not be confirmed. Move to an open area and try again.

Avoid:

> Suspicious location detected.

Prefer short, concrete action labels such as:

- View event
- Start challenge
- Submit answer
- View collection
- Add to deck
- Save deck
- Continue battle

---

## 16. Implementation rules

- Centralise visual tokens.
- Prefer shared components over repeated screen-specific styling.
- Prefer semantic variants over arbitrary one-off classes.
- Use CSS variables for theme values.
- Keep decorative layers separate from content.
- Use the approved icon system consistently.
- Do not invent backend states, permissions, rewards, eligibility, or game rules.
- Include loading, empty, error, and unavailable states from the beginning.
- Prefer fixing a shared primitive over patching multiple screens independently.
- Use container queries where component-local responsiveness is more appropriate
  than viewport breakpoints.
- Do not introduce a new dependency merely for visual novelty.
- When a recurring pattern changes materially, update this design system.

---

## 17. Visual review checklist

Before completing significant frontend work, inspect the rendered application.

### Hierarchy

- Is the screen's purpose immediately clear?
- Is there one dominant region?
- Is the primary action obvious?
- Are secondary actions quieter?

### Density

- Can any panel be removed?
- Is information duplicated?
- Could secondary detail be disclosed later?
- Does mobile feel focused?
- Does desktop avoid unnecessary dashboard density?

### Visual system

- Are shared tokens being used?
- Are spacing and alignment systematic?
- Are routine borders neutral?
- Is blue used for normal interaction?
- Is gold reserved for prestige?
- Are icons coherent and appropriate?
- Is decoration subordinate to content?

### Interaction

- Are touch targets large enough?
- Are focus, hover, pressed, loading, and disabled states clear?
- Is motion useful rather than decorative?
- Are important actions labelled clearly?

### Accessibility

- Can the flow be completed with a keyboard?
- Is focus visible?
- Is status understandable without colour?
- Are icon-only controls labelled?
- Is text readable?
- Is reduced motion respected?

### Responsiveness

Check approximately:

```text
390px
768px
1440px
```

Verify:

- no accidental horizontal scrolling;
- dialogs and sheets remain usable;
- text does not shrink to fit;
- mobile remains focused;
- desktop uses extra space meaningfully.

Final test:

> If the decorative styling were removed, would the interface still be easy to
> understand and use?

If not, fix the structure first.

---

## 18. AI-assisted UI/UX work

Treat this design system as the default design contract.

An implementation agent may refine a local treatment where a clear UX problem
requires it, but should:

1. preserve confirmed product and branding requirements;
2. preserve semantic colour roles;
3. preserve accessibility requirements;
4. prefer shared component improvements over one-off patches;
5. inspect the running application visually;
6. validate mobile, tablet, and desktop layouts;
7. review iconography and interaction states;
8. use approved libraries only where they materially improve the result;
9. avoid redesigning for novelty.

Expected workflow:

```text
inspect
→ identify the highest-impact problems
→ implement
→ render
→ visually review
→ iterate
```

For routine responsive UI/UX passes, use approximately:

```text
390px mobile
768px tablet
1440px desktop
```

The goal is one coherent Wits World experience across mobile and desktop.

---

## AI declaration

This revision was materially rewritten with the assistance of
ChatGPT[GPT-5.6 Sol].

The map-discovery guidance was added with assistance from Codex.

The deck-editing guidance was added with assistance from Codex.

Update this declaration when other AI tools materially review, edit, or generate
parts of this document.

The battle guidance was added with assistance from Codex-CLI[GPT-6].

The shared feedback guidance was added with assistance from Codex-CLI[GPT-6].

The collectible-frame guidance was added with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].
