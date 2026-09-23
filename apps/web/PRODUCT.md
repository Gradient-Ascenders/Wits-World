# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is anyone exploring Wits campus who wants to discover and play through campus events. Players use the experience on mobile browsers while moving around campus. Authenticated content Authors use a separate console to create, review, publish, and manage game content.

## Product Purpose

Wits Quest turns campus exploration into a location-based card game. Players discover events, complete challenges, earn cards, build decks, and battle. A successful player journey connects a real campus discovery to a recorded challenge result and continued play with their collection.

## Positioning

The game connects Wits campus event discovery and server-checked location eligibility to challenges, collectible cards, deck building, and battles in one player journey.

## Operating Context

Players sign in through Auth0, browse published events on a map or in a text list, and choose when to enable foreground browser location. The API checks event eligibility from the reported location. Players then complete timed challenges, review persisted results and rewards, manage cards and decks, and play server-resolved CPU or asynchronous PvP matches. A separate protected Author workspace supports content creation and review.

## Capabilities and Constraints

- The browser presents state and submits player intent. The API and its server-consumed rules decide identity, event eligibility, challenge scoring, rewards, deck legality, legal battle actions, and outcomes.
- The map is a presentation aid. Event discovery and status must remain usable through a semantic text list when the map is unavailable.
- Location is requested for a player action and handled as an ephemeral browser-reported claim. It does not prove physical presence and must not be stored as player history in the browser.
- Protected journeys require authentication. Authoring has a separate role and route; authors cannot review their own latest submission.
- The home page includes static product previews. The authenticated `/explore` route is the live event experience.
- Offline states and recovery are part of the web experience; server-owned actions must reconcile with authoritative results.

## Brand Commitments

**Wits World** names the project, public brand, and technical workspace. **Wits Quest** names the campus exploration game. The approved Campus Seal, Quest Marker variants, and W/star favicon are committed under `src/assets/branding/` and are used by the web app and external sign-in surfaces.

## Evidence on Hand

- `README.md`, `docs/basic-release-reference.md`, and `docs/architecture/overview.md` describe the product journey, implemented Basic scope, and authority boundaries.
- `src/App.tsx` and `src/pages/` contain the current player and Author routes. `src/assets/branding/` contains the supplied branding assets.
- The Basic release overview distinguishes implemented core behavior from full product or production acceptance. Future product claims should keep that distinction.

## Product Principles

1. Make the campus discovery, challenge, collection, and battle journey clear and connected.
2. Keep mobile use practical while the player is moving around campus.
3. Show server-owned outcomes and recovery honestly; never invent eligibility, rewards, or legal actions in the browser.
4. Keep event discovery usable without a map or location permission until the player chooses a location-dependent action.
5. Protect player identity and location data throughout the journey.

## Accessibility & Inclusion

The web experience must be responsive and accessible. Key journeys must work with keyboard and screen reader input, visible focus, and textual status that does not rely on color alone. A map-independent event list supports players who cannot use the map.
