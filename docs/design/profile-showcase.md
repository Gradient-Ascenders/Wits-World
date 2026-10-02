# Player profile showcase

Approved scope: `/profile` and player-facing `/players/:playerName`, including profile editing, custom status, four owned-card favourites, daily activity and illustrated achievements. Experience mode for visitors; Operate mode for editing. The owner controls profile publication and activity sharing. Existing player-name policy, progression rules, card identity and account lifecycle remain authoritative.

## Direction contract

THESIS: A personal player showcase led by four chosen cards, with identity above and activity and achievements below. Avoid turning the profile into a settings dashboard.

OWN-WORLD: Inherit Campus Quest Atlas navy, ivory, gold, serif headings and blue controls. Existing collectible frames carry the ornament. Achievement images read as campus enamel pins.

STORY: Recognise the player, see their taste, explore a favourite card, then understand earned progress. Owners can edit personal details and curate cards without changing game rules.

FIRST VIEWPORT: Generous avatar beside name, custom status, optional degree/year and bio. Edit profile at the right. Compact progression strip follows. Four equally sized, large cards span desktop; mobile uses two columns. Activity and illustrated achievements follow in two desktop columns and stack on mobile.

FORM: User-approved identity and four-card showcase composition, code-led from the confirmed schematic; no concept roll required because the structure and existing visual system are pinned.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Behavior and boundaries

- User-written status has optional server-timed expiry; no online presence.
- Degree and study year are optional self-reported fields. Names remain governed by the existing account policy.
- Public means visible to authenticated active players. Profile publication and daily activity sharing require owner choices.
- Publish only selected card presentation, earned achievements and aggregate daily activity; exclude provider identity, inventory, owned-copy identifiers and exact activity timestamps.
- Loading, retry, expired authentication, empty collection, unavailable profiles, ownership changes and save conflicts have visible recovery.
- Avatar uploads are cropped locally and decoded, resized and re-encoded by the API. Keyboard editing, focus restoration, touch targets, reduced motion and an accessible activity list are required.
