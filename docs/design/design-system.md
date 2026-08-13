# Wits World Design System

**Status:** Draft design recommendation  
**Applies to:** `apps/web`  
**Last updated:** 2026-08-13

This document is the visual and interaction source of truth for the Wits World
player application and author console for the Wits Quest game/topic.

It describes the intended design philosophy, tokens, reusable components,
responsive behaviour, accessibility requirements and screen-specific patterns.

The visual reference images communicate art direction rather than exact layouts.

## Reference images

Store the approved reference images in:

```text
docs/design/references/
├── desktop-dashboard.png
├── player-journey.png
└── author-console.png
```

Before implementing significant frontend work, inspect the relevant reference
images together with this document.

---

## 1. Requirement labels

The following labels are used throughout this document:

- **Brief requirement** — explicitly required by the project brief, rubric or
  confirmed stakeholder instruction.
- **Recommendation** — the current proposed design direction.
- **Confirm** — an unresolved choice that requires team, client or lecturer
  approval.
- **Deferred** — deliberately excluded from the current Basic delivery scope.

---

## 2. Product context

Wits World is the project, application and primary public brand. Wits Quest is
the location-based campus exploration game/topic being built by Wits World. UI
chrome, browser metadata and general application states should therefore lead
with Wits World; use Wits Quest when copy specifically discusses the game.

**Brief requirement:** Wits Quest is a mobile-friendly, location-based campus
exploration game.

The main player journey is:

1. Sign in.
2. Explore the campus map.
3. Find a nearby event.
4. Submit a location claim.
5. Open an eligible challenge.
6. Answer a university-related question.
7. Receive answer feedback.
8. Earn the event's card once when successful.
9. View the card collection.
10. Create or select a deck.
11. Complete a turn-based match against the CPU.
12. Review the stored result.

The author experience must support management of:

- events;
- event locations and radii;
- event availability periods;
- challenges and questions;
- accepted answers;
- cards;
- card categories, rarity and attributes;
- event rewards;
- publication status.

The frontend must therefore not become only a map, card gallery or generic
dashboard. It must support the complete journey.

---

## 3. Design philosophy

### 3.1 Core identity

**Recommendation:** The Wits World experience for Wits Quest should feel like a
premium futuristic academic product combining:

- university heritage;
- scientific precision;
- campus exploration;
- collectible-card discovery;
- restrained science-fiction aesthetics;
- high-performance computing interfaces.

The interface should feel:

- prestigious;
- authoritative;
- intelligent;
- exploratory;
- cinematic;
- refined;
- technologically advanced.

### 3.2 Visual balance

Traditional academic identity should be expressed through:

- elegant serif headings;
- editorial spacing;
- restrained metallic-gold details;
- thin dividers;
- formal alignment;
- landmark photography;
- considered use of university-inspired symbolism.

The futuristic identity should be expressed through:

- deep navy surfaces;
- restrained electric-blue signals;
- fine network lines;
- map paths;
- technical diagrams;
- subtle particles;
- controlled gradients;
- polished data visualisation;
- limited glass-like panels.

### 3.3 Anti-goals

The product must not resemble:

- a generic SaaS dashboard;
- a cyberpunk nightclub;
- a children's mobile game;
- an overloaded gaming HUD;
- a screen covered in neon;
- a collection of unrelated floating cards;
- a desktop dashboard compressed onto a phone.

---

## 4. Anti-clutter rules

These rules apply to every screen:

1. Each screen must have one obvious primary purpose.
2. Each panel should normally have only one primary action.
3. Secondary actions must be visually quieter.
4. Do not place every piece of information above the fold.
5. Use spacing and dividers before adding another container.
6. Avoid cards nested inside multiple other cards.
7. Use no more than three visible elevation levels.
8. Use no more than two strong accent colours in one view.
9. Do not place gold borders around every component.
10. Do not place glow effects behind normal body text.
11. Decorative particles must never reduce readability.
12. Avoid displaying the same information in multiple panels.
13. Use progressive disclosure for secondary controls.
14. Mobile screens must use focused flows rather than dense dashboards.
15. Empty space is intentional and must not be filled without purpose.

---

## 5. Colour system

### 5.1 Core tokens

**Recommendation:** Begin with the following colour tokens.

```css
:root {
  /* Backgrounds */
  --colour-bg-primary: #050b16;
  --colour-bg-secondary: #081426;
  --colour-bg-tertiary: #0b1930;

  /* Surfaces */
  --colour-surface-primary: #0d1b31;
  --colour-surface-elevated: #112440;
  --colour-surface-glass: rgba(12, 27, 50, 0.82);

  /* Text */
  --colour-text-primary: #f7f3e7;
  --colour-text-secondary: #b3bdcc;
  --colour-text-muted: #7f8b9d;
  --colour-text-inverse: #08101d;

  /* Gold */
  --colour-gold-primary: #d4af37;
  --colour-gold-soft: #e0c46c;
  --colour-gold-muted: #9d8130;

  /* Blue */
  --colour-blue-primary: #2a6bff;
  --colour-blue-bright: #54a8ff;
  --colour-blue-muted: #174a99;

  /* Borders */
  --colour-border-subtle: rgba(212, 175, 55, 0.2);
  --colour-border-default: rgba(212, 175, 55, 0.42);
  --colour-border-strong: rgba(224, 196, 108, 0.72);

  /* Semantic */
  --colour-success: #39b879;
  --colour-warning: #e1a93a;
  --colour-danger: #dc5b65;
  --colour-info: #54a8ff;

  /* Overlay */
  --colour-overlay: rgba(2, 7, 15, 0.72);
}
```

These values may be adjusted during implementation to meet contrast
requirements.

### 5.2 Colour responsibilities

Gold communicates:

- prestige;
- rare rewards;
- important selected states;
- primary calls to action;
- significant achievements.

Gold must not be used on every heading, border or icon.

Electric blue communicates:

- current position;
- active navigation;
- technical data;
- progress;
- interactive map paths;
- focus or energy states.

Green, amber and red are reserved for semantic feedback.

### 5.3 Rarity colours

**Recommendation:**

| Rarity    | Main treatment          |
| --------- | ----------------------- |
| Common    | Neutral silver or ivory |
| Uncommon  | Muted green             |
| Rare      | Electric blue           |
| Epic      | Restrained violet       |
| Legendary | Metallic gold           |

Rarity must also be communicated through text, icons, border patterns or
ornamentation. Do not rely on colour alone.

---

## 6. Typography

### 6.1 Font families

**Recommendation:**

```css
:root {
  --font-heading: 'Playfair Display', 'Georgia', serif;
  --font-body:
    'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;
}
```

Use the serif family for:

- page titles;
- landmark names;
- reward reveals;
- battle conclusions;
- important editorial headings.

Use the sans-serif family for:

- body text;
- navigation;
- forms;
- buttons;
- labels;
- tables;
- metadata;
- statistics.

### 6.2 Type scale

```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;
  --text-4xl: 3rem;
}
```

### 6.3 Typography rules

- Use sentence case for most headings and labels.
- Reserve uppercase for small eyebrow labels and metadata.
- Uppercase labels should have increased letter spacing.
- Body text should normally remain between 16 and 18 pixels.
- Avoid excessively thin font weights.
- Avoid long centred paragraphs.
- Keep normal text lines at a readable maximum width.
- Typography should establish hierarchy before decoration is added.

---

## 7. Spacing, shape and elevation

### 7.1 Spacing tokens

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

### 7.2 Radius tokens

```css
:root {
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;
  --radius-pill: 999px;
}
```

Use moderate rounding. The product should feel engineered and refined rather
than soft and toy-like.

### 7.3 Shadows and glows

```css
:root {
  --shadow-panel: 0 12px 32px rgba(0, 0, 0, 0.28);
  --shadow-floating: 0 18px 48px rgba(0, 0, 0, 0.38);
  --glow-blue: 0 0 24px rgba(42, 107, 255, 0.22);
  --glow-gold: 0 0 20px rgba(212, 175, 55, 0.16);
}
```

Glows should be used for meaningful moments, not for all components.

---

## 8. Layout principles

### 8.1 Player application

The player application is mobile-first.

Use:

- one-column focused screens;
- a persistent bottom navigation where appropriate;
- bottom sheets for map event details;
- full-width primary actions;
- large touch targets;
- concise information;
- minimal typing;
- short, readable challenge flows.

The map should dominate the exploration screen, but it must not be the only way
to find events.

Provide an accessible event list or sheet containing the same essential event
information.

### 8.2 Author console

The author console may use greater information density.

Use:

- a stable desktop sidebar;
- clear breadcrumbs and page titles;
- tables for repeated structured data;
- filters and search;
- split editor-and-preview layouts;
- explicit publication status;
- clear save, review, publish, retire and destructive actions.

The author console should feel like a professional university content-management
system, not a gaming HUD.

### 8.3 Content width

- Use maximum content widths for readable pages.
- Do not stretch text across wide monitors.
- Use wide layouts only for maps, tables, editors and meaningful comparisons.
- Preserve generous outer margins on desktop.

---

## 9. Navigation

### Player navigation

Recommended primary destinations:

- Map;
- Collection;
- Deck;
- Battle;
- Profile or account.

Do not add a primary navigation item unless it represents a frequent player
task.

### Author navigation

Recommended sections:

- Overview;
- Events;
- Challenges;
- Cards;
- Map placement;
- Publication;
- Users and roles, subject to authorisation scope;
- Settings.

Stretch features such as analytics should not dominate the Basic console.

---

## 10. Core components

Frontend styling should be constructed from reusable components rather than
screen-specific CSS.

Recommended foundations:

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
- `StatBlock`
- `ProgressIndicator`
- `EventMarker`
- `EventSummary`
- `CollectibleCard`
- `CardThumbnail`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `PermissionState`
- `Modal`
- `Drawer`
- `BottomSheet`
- `FormField`
- `DataTable`
- `FilterBar`

Each interactive component must account for:

- default;
- hover;
- pressed;
- selected;
- focus-visible;
- disabled;
- loading;
- error;
- success.

---

## 11. Event status language

The interface must communicate event states through text, icons and colour.

| State               | Meaning                             | Suggested presentation                 |
| ------------------- | ----------------------------------- | -------------------------------------- |
| In range            | Player may request access           | Green status with location icon        |
| Too far             | Outside the accepted area           | Muted status with distance             |
| Location uncertain  | Accuracy is insufficient            | Amber warning and retry action         |
| Permission required | Browser location unavailable        | Explanation and enable-location action |
| Upcoming            | Event is not active yet             | Date or countdown                      |
| Expired             | Availability period has ended       | Muted expired label                    |
| Completed           | Reward already earned               | Check icon and completed text          |
| Unavailable         | Event cannot currently be attempted | Explanation where safe                 |
| Loading             | Status is still being checked       | Skeleton or progress indicator         |

Do not accuse a player of cheating when their location is merely inaccurate or
ambiguous.

---

## 12. Screen-specific guidance

### 12.1 Campus map

The map is the dominant visual region.

Display:

- current player position;
- event markers;
- selected event;
- clear event status;
- recenter control;
- accessible event-list alternative;
- loading and permission states.

Do not display excessive statistics over the map.

### 12.2 Event details

Prioritise:

- event name;
- landmark image where available;
- distance;
- availability;
- eligibility status;
- challenge type;
- possible reward;
- one primary action.

### 12.3 Challenge

Prioritise:

- progress;
- question;
- answer controls;
- submit action;
- clear selected state;
- answer feedback;
- correct-answer explanation.

Accepted answers must never be revealed before submission.

### 12.4 Reward reveal

Reward reveals may use stronger visual effects than routine screens.

Use:

- one prominent card;
- rarity;
- card name;
- short description;
- concise success message;
- one clear next action.

Avoid lengthy animations that delay the user.

### 12.5 Collection

Use a clean card grid with:

- filtering;
- sorting;
- rarity indication;
- category indication;
- locked or missing state where relevant;
- progressive card detail.

Do not display every attribute on small thumbnails.

### 12.6 Deck builder

Clearly show:

- selected deck;
- current card count;
- constraints;
- invalid conditions;
- remove and add actions;
- save state.

Deck rules must come from server-authoritative data rather than being invented by
the frontend.

### 12.7 CPU battle

The battle interface must make the following immediately clear:

- whose turn it is;
- which cards are active;
- legal attribute choices;
- the chosen attribute;
- round result;
- current match progress;
- the next required action.

Normal decision-making should remain visually calm. Stronger effects may be used
for card reveals, round outcomes and match completion.

### 12.8 Author console

Forms must favour clarity over decoration.

Always show:

- save state;
- validation messages;
- publication state;
- destructive-action confirmation;
- preview where useful;
- who may perform the action.

Do not place accepted answers, private location evidence or other sensitive data
in unnecessary UI logs.

---

## 13. Responsive behaviour

Suggested layout targets:

```text
Narrow mobile:  320px–374px
Mobile:         375px–767px
Tablet:         768px–1023px
Desktop:        1024px–1439px
Wide desktop:   1440px and above
```

These are implementation guidelines rather than strict device categories.

At mobile widths:

- sidebars become drawers or bottom navigation;
- multi-column views become focused single-column flows;
- map details use bottom sheets;
- important actions remain reachable;
- tables become cards or controlled horizontal regions only when necessary;
- dialogs remain within the viewport;
- text does not shrink to fit dense layouts.

At desktop widths:

- use additional width for context and comparison;
- retain maximum text widths;
- use split views only where they improve the task;
- avoid filling every available area with panels.

---

## 14. Accessibility

**Brief requirement:** The product must be responsive and accessible.

Every relevant interface must provide:

- semantic HTML;
- logical heading order;
- keyboard navigation;
- visible focus indicators;
- accessible labels for icon-only buttons;
- adequate text and UI contrast;
- suitable touch-target sizes;
- labelled forms;
- useful validation messages;
- screen-reader status updates;
- alternatives to colour-only information;
- reduced-motion support;
- text alternatives for informative imagery;
- map-independent event discovery;
- usable loading, empty and error states.

Do not use placeholder text as the only form label.

Decorative network lines, particles and orbital graphics should be hidden from
assistive technologies.

---

## 15. Motion

Motion should reinforce state change rather than provide constant decoration.

Recommended uses:

- panel transitions;
- selected marker emphasis;
- card reveal;
- progress changes;
- successful answer feedback;
- battle outcome;
- modal and bottom-sheet movement.

Avoid:

- continuously moving backgrounds;
- decorative motion behind text;
- long blocking animations;
- excessive parallax;
- animation required to understand information.

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 16. Imagery and decoration

Use imagery that supports:

- Wits landmarks;
- history;
- alumni;
- science;
- technology;
- campus exploration;
- collectible cards.

Use restrained decorative motifs such as:

- orbital curves;
- scientific diagrams;
- network lines;
- topographic patterns;
- map paths;
- star-like particles;
- geometric grids.

Do not allow decorative elements to compete with interface controls.

The supplied Wits World Campus Seal is approved project branding for the public
application as recorded below. This approval does not extend to the official
Wits University crest, logos, photography or other university branding, whose
rights and approval must still be confirmed before use.

Generated mockups are references only and must not be treated as approved
university branding.

### 16.1 Wits World Campus Seal

**Approved project asset:** The Wits World Campus Seal supplied on 12 August
2026 is the selected project logo. Treat both canonical SVG variants as final
artwork:

- `apps/web/src/assets/branding/wits-world-campus-seal-transparent.svg` is for
  headers and other dark application surfaces;
- `apps/web/src/assets/branding/wits-world-campus-seal.svg` includes its own
  dark backing and is for contexts where the surrounding background cannot be
  controlled;
- `apps/web/src/assets/branding/wits-world-favicon.svg` is the selected
  simplified, code-native W/star mark used in browser tabs.

Preserve the SVG vector data, gradients, colours, geometry, embedded provenance
metadata and `321:347` aspect ratio. Render the asset through an ordinary image
element rather than copying its paths into JSX. Use a width with `height: auto`
and do not crop, stretch, recolour, animate or add strong effects.

For normal application surfaces, keep the seal at least `2.75rem` wide. The
application header uses it at `5.5rem` to `6.5rem` beside a Wits World wordmark
and the short “Explore · Discover · Achieve” line. At favicon size, use the
simplified W/star mark rather than shrinking the detailed seal. Supply meaningful
alternative text when the seal is the only branding label. Use empty alternative
text and `aria-hidden="true"` when it duplicates an already labelled brand
link.

The canonical files retain embedded C2PA provenance metadata identifying
Recraft AI as the asset-generation source. Do not strip or rewrite that metadata
without a demonstrated technical reason and explicit approval.

### 16.2 Wits World Quest Marker

The supplied Quest Marker variants are external branding artwork for this
release. Preserve their SVG vector data, geometry,
colours and `242:326` aspect ratio. The source files remain in
`docs/design/references/`; the web deployment exposes byte-identical copies at
`/branding/wits-world-quest-marker.svg` and
`/branding/wits-world-quest-marker-transparent.svg`.

---

## 17. Content style

Interface copy should be:

- concise;
- confident;
- helpful;
- educational;
- non-accusatory;
- suitable for students and campus visitors.

Prefer:

> Your location could not be confirmed. Move to an open area and try again.

Avoid:

> Suspicious location detected.

Prefer:

> This event ended at 16:00.

Avoid:

> Access denied.

Use short labels for routine actions:

- View event
- Start challenge
- Submit answer
- View collection
- Add to deck
- Save deck
- Continue battle

---

## 18. Implementation conventions

- Centralise visual tokens.
- Do not duplicate large styling blocks between screens.
- Prefer semantic component variants over arbitrary one-off styling.
- Use CSS variables for theme values.
- Keep decorative layers separate from content.
- Avoid unnecessary UI dependencies.
- Use icons consistently from one approved icon library.
- Do not use emoji as permanent interface icons.
- Do not invent backend states or game rules in frontend code.
- Do not trust client-calculated eligibility, rewards or battle outcomes.
- Include loading, empty, error and unavailable states from the beginning.
- Add component tests for important interactions.
- Inspect work at mobile and desktop viewport sizes.

---

## 19. Visual review checklist

Before completing significant frontend work, verify:

### Hierarchy

- Is the screen's purpose immediately clear?
- Is there one dominant region?
- Is the primary action obvious?
- Are secondary actions quieter?

### Density

- Can any panel be removed?
- Is information duplicated?
- Could secondary detail be disclosed later?
- Does the mobile version feel focused?

### Consistency

- Are tokens being used?
- Are component states consistent?
- Are spacing and alignment systematic?
- Are gold and blue being used for the intended purposes?

### Accessibility

- Can the feature be completed using a keyboard?
- Is focus visible?
- Is status understandable without colour?
- Is text readable against its background?
- Is a non-map alternative available?
- Is reduced motion respected?

### Responsiveness

- Does it work at narrow mobile width?
- Is there accidental horizontal scrolling?
- Are touch targets large enough?
- Are dialogs and sheets usable within the viewport?
- Does desktop use space meaningfully without becoming cluttered?

---

## 20. Items requiring confirmation

The following decisions are not final:

- official permission to use Wits branding and the crest;
- final heading and body fonts;
- final production colour values;
- approved photography and artwork sources;
- final card categories;
- final card attributes;
- rarity names and rarity distribution;
- deck size and duplicate rules;
- CPU battle rules and tie behaviour;
- author and administrator role boundaries;
- whether profiles, achievements and leaderboards are included;
- whether a formal review-and-publish workflow is included.

Until confirmed, implementations should remain easy to adjust.

---

## 21. Current implementation priority

The first visual implementation should be the smallest complete player slice:

1. Application shell.
2. Mobile navigation.
3. Campus map container.
4. Current-location control.
5. Event marker states.
6. Selected-event bottom sheet.
7. Accessible event-list alternative.
8. Loading, permission-denied and map-error states.

Challenge, reward, collection and battle screens should reuse the same tokens
and component foundations rather than creating separate visual systems.

---

## AI declaration

The preceding document was generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking], and reviewed and edited with the assistance of:
Codex-CLI[GPT-5].

Update this declaration when other AI tools materially review, edit or generate
parts of this document.
