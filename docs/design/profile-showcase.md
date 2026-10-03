# Player profile showcase

Approved scope: `/profile` and player-facing `/players/:playerName`, including profile editing, custom status, four owned-card favourites, daily activity and illustrated achievements. Experience mode for visitors; Operate mode for editing. The owner controls profile publication and activity sharing. Existing player-name policy, progression rules, card identity and account lifecycle remain authoritative.

## Direction contract

THESIS: A personal player showcase led by four chosen cards, with identity above and activity and achievements below. Avoid turning the profile into a settings dashboard.

OWN-WORLD: Inherit Campus Quest Atlas navy, ivory, gold, serif headings and blue controls. Existing collectible frames carry the ornament. Achievement images read as campus enamel pins.

STORY: Recognise the player, see their taste, explore a favourite card, then understand earned progress. Owners can edit personal details and curate cards without changing game rules.

FIRST VIEWPORT: Avatar beside name and custom status, followed by optional degree/year and bio. Desktop keeps details alongside the avatar and Edit profile at the right; mobile places details below the identity and uses a full-width edit action. Four equally sized cards without nameplates lead directly after identity in one row, with compact frames on mobile. Card artwork and rarity match the details view; accessible names remain on each inspection button. Activity and illustrated achievements follow in two desktop columns and stack on mobile. Progression stats sit beneath the activity calendar.

FORM: User-approved identity and four-card showcase composition, code-led from the confirmed schematic; no concept roll required because the structure and existing visual system are pinned.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Behavior and boundaries

- User-written status can contain an emoji, text, or both, with optional server-timed expiry; no online presence. Clearing both fields removes the status. The empty owner status control shows a single plus icon with an accessible label.
- The status emoji dropdown searches names and keywords. Arrow keys browse matches, Enter selects, and Escape closes the dropdown and restores trigger focus. Selecting or clearing an emoji updates the draft; Save changes persists it through the normal profile flow.
- Degree and study year are optional self-reported fields. Names remain governed by the existing account policy.
- Public means visible to authenticated active players. Profile publication and daily activity sharing require owner choices.
- Publish only selected card presentation, earned achievements and aggregate daily activity; exclude provider identity, inventory, owned-copy identifiers and exact activity timestamps.
- Loading, retry, expired authentication, empty collection, unavailable profiles, ownership changes and save conflicts have visible recovery.
- Avatar uploads are cropped locally and decoded, resized and re-encoded by the API. Keyboard editing, focus restoration, touch targets, reduced motion and keyboard-accessible activity dates and counts are required.
- Picture controls use a wrapping action row with space between Choose picture and Remove picture. After upload, a large circular crop window dims the image outside the saved area. Mouse and touch dragging or arrow keys reposition the image; one zoom slider, zoom buttons and Reset replace the position sliders. Crop bounds prevent empty edges. The editor header and save footer remain reachable while the form scrolls.
- The GitHub-inspired activity calendar uses Sunday-first weeks, month and weekday labels, blue count intensity, and hover/focus/touch tooltips. Squares stay at 18px on larger screens and 12px with 2px gaps on mobile for both periods; horizontal scrolling reveals older dates, and the calendar initially shows the latest dates. Inline date captions are omitted. The calendar is the sole activity view; each date exposes its count to screen readers and supports arrow-key navigation. Scroll padding keeps edge cells and their focus outlines inside the graph.
- Achievement badges open a focused dialog with enlarged artwork and the supplied requirement; unearned badges show actual progress. Earned badges show the player who earned them, without invented tiers, dates or history. Escape, outside click and the close button dismiss the dialog and restore focus.
- The bio is edited in Edit profile; no separate bio prompt or owner preview link appears in the header.

The profile picture editor behavior was documented with assistance from Codex[GPT-6].
