# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is anyone exploring Wits campus who wants to discover and play through campus events. Players use the experience on mobile browsers while moving around campus, then continue through collection, progression, social, and competitive play. Authenticated content Authors use a separate console to create, review, publish, operate, and evaluate game content. Active players may also participate in or watch live battles. External developers use a deliberately limited, read-only API for public events, cards, and progression standings.

## Product Purpose

Wits Quest turns campus exploration into a location-based collectible card game. Players discover events, complete challenges, earn and evolve cards, build decks, progress, and battle. The Advanced tier extends that journey into live and ranked competition, contested campus zones, bilateral card trading, automatically rotated event placements, and richer Author operations. Success connects a real campus discovery to an authoritative challenge result and gives the player meaningful reasons to return through their collection, progression, and competition.

## Positioning

The game connects Wits campus places and server-checked location eligibility to challenges, a collectible card economy, progression, and multiple forms of competition in one persistent player journey. Advanced systems reuse the same server authority: live and ranked battles, territory influence, event placement, trading, trust review, and analytics do not become separate browser-owned games.

## Operating Context

Players sign in through Auth0, browse published events on a map or in a text list, and choose when to enable foreground browser location. The API checks event eligibility from the reported location. Players then complete timed challenges, review persisted results and rewards, manage cards and decks, follow progression, and play server-resolved CPU or asynchronous PvP matches. Advanced competition adds one-minute live battles with reconnect and spectator projections, ranked matchmaking and seasonal standings, and location-qualified influence over fictional campus territories. Card trading is private and bilateral rather than a public marketplace.

A separate protected Author workspace supports content creation, review, campaigns, question curation, and privacy-limited operational analytics. Advanced placement services rotate explicitly portable events among reviewed campus sites while preserving fixed authored locations and Author control. Account settings also support lifecycle management and developer API keys for approved public read-only integrations.

## Capabilities and Constraints

- The browser presents state and submits player intent. The API and its server-consumed rules decide identity, event eligibility, challenge scoring, rewards, deck legality, legal battle actions, and outcomes.
- The map is a presentation aid. Event discovery and status must remain usable through a semantic text list when the map is unavailable.
- Location is requested for a player action and handled as an ephemeral browser-reported claim. It does not prove physical presence and must not be stored as player history in the browser.
- Protected journeys require authentication. Authoring has a separate role and route; authors cannot review their own latest submission.
- The home page includes static product previews. The authenticated `/explore` route is the live event experience.
- Offline states and recovery are part of the web experience; server-owned actions must reconcile with authoritative results.
- Live PvP uses persisted state, 60-second server deadlines, short-lived connection tickets, role-safe participant or spectator projections, and snapshot recovery after reconnect or version gaps. A socket, countdown, or locally simulated action is never authoritative.
- Ranked competition has a separate seasonal rating from permanent progression points. The server owns queue eligibility, opponent selection, proposal acceptance, results, rating settlement, standings, and season lifecycle.
- Contested-campus territory is a fictional game system built from reviewed PostGIS zones and completed ranked results. It conveys no real-world ownership or access rights. Precise location is evaluated for a short-lived grant and is not retained as territory history.
- Automatic placement applies only to explicitly portable content and reviewed sites. It does not generate questions, infer safe locations from player movement, or alter fixed authored event coordinates.
- Longitudinal trust signals are server-derived review indicators, not proof of cheating, public reputation, or an automatic ban. Scores and detector thresholds remain private, and punitive restrictions require human review.
- Card trading is private, bilateral, card-for-card, versioned, and atomically settled. There is no gifting, currency, marketplace, real-money payment, public inventory lookup, or browser-owned valuation.
- Advanced operational analytics use Author-only aggregate projections with minimum-sample suppression. They must not create player-level analytics, reveal precise location, or delay authoritative gameplay responses.
- Developer API keys provide rate-limited, read-only access to public events, the public card catalogue, and progression standings. They are not player sessions and cannot read or mutate private gameplay state.
- Advanced delivery is staged. The current Web app exposes advanced Author analytics, developer-key management, territory exploration and standings, automatic-placement control, trust review, and the live ranked journey with seasonal rating, standings, optional territory contesting, settlement, and private spectating. Trading and other documented Advanced interfaces must not be presented as shipped Web journeys until implemented and verified.

## Brand Commitments

**Wits World** names the project, public brand, and technical workspace. **Wits Quest** names the campus exploration game. The approved Campus Seal, Quest Marker variants, and W/star favicon are committed under `src/assets/branding/` and are used by the web app and external sign-in surfaces.

## Evidence on Hand

- `README.md`, `docs/basic-release-reference.md`, `docs/sprint-2-overview.md`, and `docs/architecture/overview.md` describe the product journey, implemented scope, and authority boundaries.
- `src/App.tsx` and `src/pages/` contain the current player and Author routes. `src/assets/branding/` contains the supplied branding assets.
- `docs/architecture/live-pvp-api-contract.md`, `docs/architecture/ranked-matchmaking-api-contract.md`, `docs/architecture/contested-campus-territory-api-contract.md`, `docs/architecture/automatic-event-placement-service.md`, and `docs/architecture/card-trading-api-contract.md` define the Advanced server-owned gameplay and operations boundaries.
- `docs/requirements/longitudinal-trust-policy.md`, `docs/architecture/advanced-analytics-api-contract.md`, and `docs/architecture/developer-api.md` define the trust, privacy, analytics, and external-access boundaries.
- The release and feature references distinguish policy, persistence, service implementation, Web presentation, automated verification, deployment, and human acceptance. Future product claims must preserve those distinctions.

## Product Principles

1. Make campus discovery, challenges, collection, progression, and competition feel like one connected journey.
2. Keep mobile use practical while the player is moving around campus.
3. Show server-owned outcomes and recovery honestly; never invent eligibility, rewards, opponents, ratings, ownership, settlements, or legal actions in the browser.
4. Keep event discovery usable without a map or location permission until the player chooses a location-dependent action.
5. Protect player identity, location, private competition state, and trust information throughout the journey.

## Accessibility & Inclusion

The web experience must be responsive and accessible. Key journeys must work with keyboard and screen reader input, visible focus, and textual status that does not rely on color alone. A map-independent event list supports players who cannot use the map.
