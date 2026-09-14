---
title: 'How data moves through the system'
---

# How data moves through the system

## Scope

This document describes the implemented authentication, event-discovery,
location-eligibility, ordered-trail, card-collection, saved-deck, and high-level
CPU-match flows. Detailed challenge answering, reward finalization,
persistence, and battle behavior is documented in the linked architecture and
database contracts.

## Application startup

1. The browser loads the React application.
2. The application validates its public environment configuration.
3. The browser receives only public configuration, such as:
   - the API base URL;
   - public authentication-provider identifiers; and
   - public map configuration where required.
4. Private API, database, and authentication credentials remain on trusted
   services.
5. Invalid or missing public configuration produces a clear setup error instead
   of allowing the application to start incorrectly.

## Authentication flow

1. The player begins sign-in from the web application.
2. The browser redirects to or interacts with the approved authentication
   provider.
3. The provider authenticates the player.
4. The browser obtains an access token intended for the Wits Quest API.
5. The browser includes the token in the request's `Authorization` header.

   ```http
   Authorization: Bearer <access-token>
   ```

6. The API validates:
   - token signature;
   - issuer;
   - audience;
   - expiry; and
   - required claims.
7. The API derives the player's provider identity from the validated token.
8. The protected route continues only after successful validation.

The browser must not submit a separate authoritative player identifier.

## Event-discovery flow

1. The authenticated browser requests published event information from the API.
2. The API validates the access token.
3. The API queries PostgreSQL/PostGIS for player-visible events.
4. PostgreSQL/PostGIS returns stored event data.
5. The API excludes private or author-only information.
6. The API returns a safe event representation.
7. The browser displays the event:
   - on the map; and
   - in a text-based event list.

The map provider supplies visual tiles and styles. It does not supply the
authoritative event record.

## Location-eligibility flow

1. `/explore` checks the browser permission state without prompting.
2. If permission is already granted, one live watcher starts. If permission is
   prompt or unknown, the player activates **Enable live location** first.
3. The device reports:
   - latitude;
   - longitude;
   - reported accuracy; and
   - acquisition timestamp.
4. The browser updates its ephemeral reported-location marker. The visual marker
   uses a short rolling sample window to resist briefly degraded readings and a
   Mapbox marker anchor so it remains attached to the coordinate during camera
   movement. This presentation-only selection does not decide eligibility.
   When the player selects an active event, the browser submits the current raw
   device claim with the event identifier.
5. The API validates the access token.
6. The API validates:
   - the event identifier;
   - latitude range;
   - longitude range;
   - reported accuracy;
   - acquisition timestamp; and
   - request structure.
7. The API loads the authoritative event from PostgreSQL/PostGIS.
8. The API confirms that the event:
   - exists;
   - is published; and
   - is within its availability period.
9. The API invokes the PostGIS distance calculation.
10. PostGIS calculates the distance between:
    - the submitted location claim; and
    - the stored event point.
11. The API compares the calculated distance with the stored event radius.
12. The API returns a safe eligibility result.
13. The browser displays the result using accessible text and status messaging.
14. Meaningful watcher updates may drive a coalesced refresh, with no more than
    one eligibility request every 15 seconds. An accuracy improvement can count
    as meaningful even when movement is small. This is only a frontend network
    limit; there is no timer-only polling loop.
15. Challenge start reuses a sufficiently fresh watched reported-location claim
    or requests a newer one-shot claim, then sends it through the
    challenge-start endpoint for its authoritative recheck. If the API requires
    a fresher location, the same rejected acquisition is not resubmitted.

The browser does not calculate the authoritative distance or final eligibility.
The selected event interaction area is a visual geodesic polygon only. Reported
accuracy is shown as text; Basic Tier does not display a GPS accuracy circle.

## Eligibility outcomes

The API should support clear outcomes such as:

- reachable;
- unreachable;
- unavailable;
- event not found;
- stale location claim;
- inaccurate or ambiguous location claim;
- invalid request;
- authentication failure; and
- temporary service failure.

An ambiguous or inaccurate result should normally explain the problem and allow
the player to retry.

It should not automatically accuse the player of cheating.

## Ordered-trail flow

1. The authenticated browser requests the trail list or one trail detail.
2. The API derives the local player from the validated token.
3. PostgreSQL returns published trail membership and only that player's
   matching event completions.
4. The API derives the longest contiguous completed prefix.
5. The API labels prefix steps completed, the first missing active step current,
   unavailable first steps with a reason, and later steps locked.
6. A later event completed out of order remains locked until preceding gaps are
   complete; no browser progress cursor is stored.
7. A retired trail remains visible only to a player with historical progress.

For nearby guidance, the browser submits a fresh latitude, longitude, reported
accuracy, acquisition timestamp, bounded distance, and bounded limit. The API
validates the claim and asks PostGIS for active unvisited standalone events plus
the player's current published-trail steps. Locked steps are excluded. The
coordinates are not inserted into a player or trail history table.

Nearby guidance is not event eligibility. Challenge access still performs the
independent server-authoritative location and availability check.

## Card-collection flow

The protected collection endpoint returns the complete owned-card collection for
the authenticated active player.

```text
Validated bearer token
        |
        v
Authenticated local player
        |
        v
request.player.id
        |
        v
public.player_cards
        |
        v
public.card_definitions
     /             \
    v               v
card_moves      card_effects
     \             /
      v           v
       OwnedCard[]
           |
           v
GET /api/v1/cards/collection
```

1. The browser requests `GET /api/v1/cards/collection` with a bearer access
   token.
2. The API validates the token and resolves the active local player.
3. Player identity comes only from the authenticated server-side player
   context. The endpoint accepts no player identifier in its path, query string,
   or request body.
4. The API queries `player_cards` using the authenticated player's local ID.
5. Each matching ownership row is joined to its shared `card_definitions`
   record.
6. Creature definitions load their ordered `card_moves`; Power definitions load
   their ordered `card_effects`.
7. The API returns each owned copy separately using the shared `OwnedCard`
   representation.
8. Results are ordered by acquisition time newest first, with the owned-card ID
   providing a deterministic tie-breaker.

A `player_cards.id` identifies one individual owned copy. Multiple ownership rows
may therefore have the same `card_definition_id`. Those rows represent
legitimate duplicate copies and must remain distinguishable in collection and
later deck operations.

Catalogue activity and ownership are separate concepts. An inactive card
definition is not eligible for new reward or starter selection, but an already
owned inactive card remains part of the player's collection.

The browser-visible collection includes safe acquisition metadata such as
`acquisitionKind` and `acquiredAt`. It does not expose internal provenance or
challenge data such as:

- `player_id`;
- `source_completion_id`;
- `source_starter_grant_id`;
- challenge attempt identifiers;
- accepted answers;
- reward-policy internals; or
- server-side reward randomness.

An empty owned collection is returned successfully as an empty `cards` array.
Missing authentication or an inactive local-player lifecycle is rejected before
the collection query runs.

## Curated Author content flow

For events, challenges, questions, and cards, the browser submits an intended
edit or lifecycle action with the last observed version. The API resolves the
active local Author, locks the content row, compares the version, enforces the
five-state transition and different-reviewer rule, and locks readiness
dependencies in deterministic order. It then updates the row and inserts one
safe audit record in the same transaction. Approval and publication both check
readiness; only the final `published` state crosses into Player queries.

Review queue and history responses return safe summaries, local actor IDs, and
current Player Names. Auth0 subjects, email, private answers, locations, and full
content bodies do not cross that boundary. The complete flow is in the
[Author curation API contract](./author-curation-api-contract.md).

## Saved-deck flow

The protected deck endpoints operate only on the authenticated active player's
saved decks and owned card copies.

```text
Validated bearer token
        |
        v
Authenticated local player
        |
        v
name + ownedCardIds
        |
        v
public.player_cards
  scoped by player_id
        |
        v
public.card_definitions
 category + rarity
        |
        v
server deck rules
        |
        v
public.player_decks
        |
        +----> public.player_deck_cards
        |
        +----> public.player_deck_selections
```

1. The browser authenticates with a bearer access token.
2. The API derives the active player's local ID from the authenticated context.
3. Create and update requests contain a deck name and exactly five
   `ownedCardIds`.
4. The API resolves every submitted copy through `player_cards` scoped to the
   authenticated player.
5. The API loads category and rarity from the authoritative card definition.
6. The API validates:
   - five cards exactly;
   - no repeated owned copy;
   - three Creature cards;
   - two Power cards; and
   - a maximum of ten rarity points.
7. A valid mutation is committed transactionally.
8. Active selection stores at most one selected saved deck for the player.
9. List responses expose only decks belonging to the authenticated player.

The client does not submit authoritative player identity, ownership, category,
rarity, point totals, or deck validity.

One owned copy may be referenced by more than one saved deck. Two copies of one
card definition in the same deck are valid only when their `ownedCardId` values
are different.

Saved decks remain mutable. Match creation must copy the selected deck and
required authoritative card state into match-owned snapshots before battle
begins. Later deck or catalogue changes must not alter that snapshot.

The schema, API operations, concurrency behavior, and match-snapshot boundary
are defined in the
[saved deck persistence and API design](../database/saved-deck-persistence-design.md).

## Failure handling

### Authentication failure

The API returns a safe `401` response.

The response must not reveal:

- token contents;
- signature details;
- private keys;
- complete verification configuration; or
- internal stack traces.

### Authorisation failure

When an authenticated player lacks permission for an operation, the API returns
a safe `403` response.

### Invalid request data

The API returns a structured validation response containing safe information
about the invalid fields.

### Database failure

The API returns a safe service error and request identifier.

Database connection details, SQL statements, and internal stack traces are not
returned to the browser.

### Map failure

The web application displays a map error while retaining the text-based event
list.

### Geolocation permission denied

The browser explains why location is needed and allows the player to retry or
continue using features that do not require location.

### Geolocation timeout

The browser explains the failure and offers a retry or live-location action.
The active `/explore` watcher may resume after that action; there is no
timer-only polling loop or background movement tracking. Active eligibility and
challenge-start operations can create the short-lived internal evidence and
journey audit described below; the browser receives no location history.

## Data-retention boundary

The final production location-retention policy remains open. Issues `#168` and
`#169` implement a provisional bounded active-use design: eligible operations
store precise evidence with an explicit expiry, then store one immutable journey
decision that cascades when its current evidence expires or account deletion
starts. No public movement-history API or permanent location record is created.

The maintained [movement-evidence design](../database/movement-evidence.md)
documents:

- the reason for storage;
- the required precision;
- retention duration;
- access restrictions;
- deletion behaviour; and
- privacy implications; and
- trusted-anchor and neutral-retry rules.

## Later Basic data flow

The same authority model also applies to the implemented CPU match flow:

1. load the authenticated player's selected deck and active catalogue data;
2. snapshot the player and server-selected CPU cards;
3. accept only intended player actions;
4. apply player and CPU transitions through the shared rules package; and
5. store completed match rounds, actions, and results.

These operations remain server-authoritative.

The implemented start, resume, answer, timeout, and player-safe response boundaries
for the first MCQ format are defined in the
[challenge and attempt API contract](challenge-attempt-api-contract.md).

Challenge, reward, starter-card, and owned-copy persistence semantics are defined
in the
[challenge, reward, and card persistence design](../database/challenge-reward-persistence-design.md).

Saved-deck persistence, validation, selection, and the match-snapshot handoff are
defined in the
[saved deck persistence and API design](../database/saved-deck-persistence-design.md).

CPU match state, snapshots, transactional actions, concurrency, and private
history are defined in the
[CPU match persistence design](../database/cpu-match-persistence-design.md).

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking] and ChatGPT-Web[GPT-5.6 Sol], and reviewed and
edited with assistance from Codex[GPT-5] and Codex[gpt-5.6-sol].

Page title clarified with assistance from Codex-CLI[GPT-6].
