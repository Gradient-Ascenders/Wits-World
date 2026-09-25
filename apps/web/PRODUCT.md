# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is anyone exploring Wits campus who wants to discover and play through campus events. Players use the experience on mobile browsers while moving around campus. Authenticated Authors use a separate console to create, review, publish, and manage game content. In the Advanced tier, the same Author role reviews privacy-limited trust cases and appeals; restricted players need a safe notice and a way to appeal without being exposed to private scoring or detector details.

## Product Purpose

Wits Quest turns campus exploration into a location-based card game. Players discover events, complete challenges, earn cards, build decks, and battle. A successful player journey connects a real campus discovery to a recorded challenge result and continued play with their collection. Advanced-tier trust review supports fair play through explainable, privacy-limited signals and proportionate human decisions without treating automated indicators as proof of cheating.

## Positioning

The game connects Wits campus event discovery and server-checked location eligibility to challenges, collectible cards, deck building, and battles in one player journey. Its Advanced-tier trust mechanism turns weak server-derived indicators into human review priority rather than automatic punishment, with bounded restrictions, safe player notice, and independent appeal review.

## Operating Context

Players sign in through Auth0, browse published events on a map or in a text list, and choose when to enable foreground browser location. The API checks event eligibility from the reported location. Players then complete timed challenges, review persisted results and rewards, manage cards and decks, and play server-resolved CPU or asynchronous PvP matches. A separate protected Author workspace supports content creation and review.

For Advanced-tier trust review, the API derives privacy-limited signals from authoritative operations, calculates a private review-priority score, and opens or updates a case when policy bands require attention. Authors review safe evidence summaries and may dismiss, monitor, mark false positives, or apply a short capability-specific restriction. A restricted player receives a neutral notice and may submit one appeal; a different Author resolves it.

## Capabilities and Constraints

- The browser presents state and submits player intent. The API and its server-consumed rules decide identity, event eligibility, challenge scoring, rewards, deck legality, legal battle actions, and outcomes.
- The map is a presentation aid. Event discovery and status must remain usable through a semantic text list when the map is unavailable.
- Location is requested for a player action and handled as an ephemeral browser-reported claim. It does not prove physical presence and must not be stored as player history in the browser.
- Protected journeys require authentication. Authoring has a separate role and route; authors cannot review their own latest submission.
- The home page includes static product previews. The authenticated `/explore` route is the live event experience.
- Offline states and recovery are part of the web experience; server-owned actions must reconcile with authoritative results.
- The browser cannot create or change a trust signal, score, band, case, restriction, reviewer decision, or enforcement result. The API and PostgreSQL own those decisions and their audit history.
- A trust score is a private review-priority value, not a probability of guilt, public reputation, or player ranking. Signals and scores never restrict gameplay automatically, suspend an account, or permanently ban a player.
- Human restrictions are capability-specific, last no longer than seven days, and require a reasoned Author decision. They may require online verification, pause new reward-bearing location challenges, or pause entry into new competitive PvP activity; they do not block sign-in, browsing, collection or deck management, CPU play, account deletion, notice, or appeal access, and they do not cancel activity that already started.
- The Author role is also the Advanced-tier trust-review role. Authors cannot review their own player account, and the Author who made a challenged decision cannot resolve its appeal.
- Trust review exposes only safe evidence summaries and aggregate context. It excludes Auth0 identity, email, precise location, exact movement measurements, submitted answers, tokens, hidden cards, another player's private history, and raw logs.
- Trust records follow bounded retention and account-deletion rules. Derived signals expire after 90 days; closed governance records may remain anonymously for up to 12 months after final resolution; active trust state is removed when account deletion begins.

## Brand Commitments

**Wits World** names the project, public brand, and technical workspace. **Wits Quest** names the campus exploration game. The approved Campus Seal, Quest Marker variants, and W/star favicon are committed under `src/assets/branding/` and are used by the web app and external sign-in surfaces.

## Evidence on Hand

- `README.md`, `docs/basic-release-reference.md`, and `docs/architecture/overview.md` describe the product journey, implemented Basic scope, and authority boundaries.
- `src/App.tsx` and `src/pages/` contain the current player and Author routes. `src/assets/branding/` contains the supplied branding assets.
- The Basic release overview distinguishes implemented core behavior from full product or production acceptance. Future product claims should keep that distinction.
- `docs/requirements/longitudinal-trust-policy.md`, `docs/database/trust-persistence.md`, and `docs/architecture/trust-boundaries.md` define the Advanced-tier trust-review policy, privacy boundary, and persistence model.
- Trust persistence, deterministic `trust-v1` scoring, signal ingestion, decay evaluation, enforcement of reviewed restrictions, and the Author reviewer console are implemented foundations. Player-facing restriction notice and appeal experiences, appeal resolution, and `trust-v2` card-trade review remain later work and must not be presented as currently available until their APIs and interfaces exist.

## Product Principles

1. Make the campus discovery, challenge, collection, and battle journey clear and connected.
2. Keep mobile use practical while the player is moving around campus.
3. Show server-owned outcomes and recovery honestly; never invent eligibility, rewards, or legal actions in the browser.
4. Keep event discovery usable without a map or location permission until the player chooses a location-dependent action.
5. Protect player identity and location data throughout the journey.
6. Treat trust signals as prompts for fair human review, not accusations; keep decisions proportionate, explainable, appealable, and private.

## Accessibility & Inclusion

The web experience must be responsive and accessible. Key journeys must work with keyboard and screen reader input, visible focus, and textual status that does not rely on color alone. A map-independent event list supports players who cannot use the map. Trust-case review, restriction notices, and appeals must communicate priority, state, affected capability, timing, and available action without relying on color or accusatory language.

The preceding document was edited with the assistance of Codex[GPT-5].
