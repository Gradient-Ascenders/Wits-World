# High-Level Data Flow

## Scope

This document describes the Sprint 1 authentication, event-discovery, and
location-eligibility flow, together with the Sprint 2 authenticated card
collection extension.

Challenge answering, reward finalization, deck management, and battles are
documented separately or remain later work.

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

1. The player selects an action to check whether an event is reachable.
2. The browser requests geolocation permission.
3. The device returns:
   - latitude;
   - longitude;
   - reported accuracy; and
   - acquisition timestamp.
4. The browser submits those values together with the event identifier.
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

The browser does not calculate the authoritative distance or final eligibility.

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
may therefore have the same `card_definition_id`. Those rows represent legitimate
duplicate copies and must remain distinguishable in collection and later deck
operations.

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

The browser displays a retry action without continuously polling the player's
location.

## Data-retention boundary

The final location-retention policy remains open.

For the Sprint 1 architecture, processing a location claim does not automatically
mean the system must permanently store the submitted coordinates.

Any later decision to store location claims must document:

- the reason for storage;
- the required precision;
- retention duration;
- access restrictions;
- deletion behaviour; and
- privacy implications.

## Later Basic data flow

The same authority model also applies to later Basic operations:

1. create or resume a challenge session;
2. submit and mark answers on the server;
3. finalize a challenge and issue rewards atomically;
4. validate card and deck ownership;
5. enforce CPU battle actions; and
6. store completed match rounds and results.

These operations remain server-authoritative.

The proposed start, resume, answer, timeout, and player-safe response boundaries
for the first MCQ format are defined in the
[challenge and attempt API contract](challenge-attempt-api-contract.md).

Challenge, reward, starter-card, and owned-copy persistence semantics are defined
in the
[challenge, reward, and card persistence design](../database/challenge-reward-persistence-design.md).

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
