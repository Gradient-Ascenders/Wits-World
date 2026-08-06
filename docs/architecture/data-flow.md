# High-Level Data Flow

## Scope

This document describes the Sprint 1 authentication, event-discovery, and
location-eligibility flow.

Challenge answering, card rewards, deck management, and battles are outside the
Sprint 1 data flow.

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

After Sprint 1, the same authority model will be extended to:

1. create a challenge session;
2. submit an answer;
3. mark the answer on the server;
4. issue a one-time card reward in a transaction;
5. validate card and deck ownership;
6. enforce CPU battle actions; and
7. store completed match rounds and results.

These later operations remain server-authoritative.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
