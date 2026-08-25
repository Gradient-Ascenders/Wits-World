# Trust Boundaries

## Purpose

This document identifies the system's security boundaries, the data that crosses
them, and the component responsible for validating that data.

## Core rule

The browser is not authoritative.

A browser-reported location is a claim supplied by a device that may be
inaccurate, outdated, manipulated, or operating under poor location conditions.

All browser-supplied values require server-side validation before they affect a
protected operation.

## Trust zones

### Player device and browser

The player device is an untrusted input environment.

The browser may:

- render the player interface;
- display events and map information;
- request geolocation after a clear user action;
- obtain coordinates, reported accuracy, and acquisition time;
- obtain an access token through the approved authentication flow;
- submit requests to the API; and
- display the API's response.

The browser may not determine:

- authenticated player identity;
- application role;
- event eligibility;
- answer correctness;
- reward eligibility;
- card ownership;
- deck validity;
- legal battle actions; or
- battle outcomes.

For CPU matches the browser may submit only a match identifier, expected
state version, submission identifier, and intended action identifier. It may
not submit card statistics, effects, CPU actions, random values, round results,
the winner, or completion status. The API locks the match row, applies the
shared rules transition, resolves CPU actions, and persists the result
transactionally. Unplayed CPU cards remain hidden in player-facing responses.

### Authentication provider

The authentication provider authenticates users and issues tokens.

Before trusting a token, the API must validate:

- its signature;
- its issuer;
- its audience;
- its expiry; and
- any claims required by the application.

The API must derive player identity from the validated token.

An identity value supplied separately in a request body or query parameter must
not be treated as authoritative.

Auth0 is the approved authentication provider under ADR-005. The API validates
Auth0 access tokens and resolves the local player and role from the validated
issuer and subject. The browser does not supply an authoritative role.

After that resolution, the API applies a fixed-window request limit keyed by
the server-resolved local player ID. `RATE_LIMIT_MAX_REQUESTS` and
`RATE_LIMIT_WINDOW_MS` default to 120 active-player requests per 60 seconds. A
request that passes authenticated active-player resolution consumes quota even
when a later authorisation hook, validation rule, or business operation returns
`403`, `400`, or another response. The browser cannot select the rate-limit key
through a query, request body, or forwarded address header.

This application limiter is per API process and deliberately excludes health,
documentation, and requests that fail before identity resolution. Multi-instance
aggregation and failed-authentication/edge protection therefore require a
separately evidenced Azure gateway, WAF, or equivalent control; they are not
claimed by the repository implementation.

### Wits Quest API

The Fastify API is the protected application authority.

It is responsible for:

- extracting bearer tokens;
- validating authentication tokens;
- deriving authenticated identity;
- validating request parameters and bodies;
- enforcing role-based authorisation;
- enforcing object-level authorisation;
- checking event publication and availability;
- evaluating location claims;
- calling parameterised database operations;
- enforcing protected game rules; and
- returning safe responses.

The API must reject or ignore attempts to submit authoritative result fields
such as:

- `eligible`;
- `isAuthor`;
- `answerCorrect`;
- `rewardCardId`;
- `playerId` as an ownership claim;
- `deckTotalPoints`;
- `cardRarity` or `cardCategory` as deck-validation input;
- `winner`; or
- `matchResult`.

### PostgreSQL/PostGIS

PostgreSQL/PostGIS is the authoritative application data store.

During Sprint 1, it stores:

- authoritative event coordinates;
- event radii;
- event availability periods;
- publication state; and
- supporting timestamps and identifiers.

Sprint 2 extends this authority boundary with protected gameplay state,
including:

- owned card-copy identities;
- card definitions and gameplay metadata;
- saved decks;
- exact saved-deck membership by owned-copy ID; and
- the player's active deck selection.

Database relationships prevent a saved deck from referencing another player's
owned copy or being selected by another player. Application validation enforces
the complete five-card composition and rarity-point rules before deck mutations
commit.

PostGIS performs the authoritative distance calculation between:

- the submitted browser location claim; and
- the stored event point.

Database constraints, indexes, and transactions must reinforce important
application rules.

### Map provider

The map provider is an external presentation service.

It may supply:

- map tiles;
- map styles;
- attribution information; and
- related visual presentation data.

It must not:

- decide whether an event is reachable;
- authenticate users;
- issue rewards;
- determine event availability; or
- replace the PostGIS distance calculation.

A map failure must not remove the text-based event fallback.

### CI/CD and deployment platforms

CI/CD and hosting platforms are privileged delivery infrastructure.

They may access:

- deployment credentials;
- environment variables;
- build artefacts; and
- deployment configuration.

Required protections include:

- storing secrets outside Git;
- limiting access to deployment credentials;
- redacting sensitive logs and screenshots;
- independently building the web, API, and documentation applications; and
- preventing unreviewed changes from being deployed.

## Boundary crossings

| From                    | To                      | Data crossing the boundary                   | Required validation                                       |
| ----------------------- | ----------------------- | -------------------------------------------- | --------------------------------------------------------- |
| Browser                 | Authentication provider | Login and consent requests                   | Provider-managed authentication flow                      |
| Authentication provider | Browser                 | Access or identity token                     | Safe browser handling and no token logging                |
| Browser                 | API                     | Bearer token and request data                | Token validation and runtime request validation           |
| Browser geolocation     | API                     | Latitude, longitude, accuracy, and timestamp | Coordinate, accuracy, freshness, and plausibility checks  |
| API                     | PostgreSQL/PostGIS      | SQL parameters and transaction operations    | Parameterised queries, constraints, and authorisation     |
| PostgreSQL/PostGIS      | API                     | Event records and geospatial results         | Typed result handling and safe failure handling           |
| Map provider            | Browser                 | Tiles, styles, and attribution               | Licensing, configuration validation, and failure handling |
| CI/CD                   | Deployment platforms    | Builds, credentials, and configuration       | Secret management and restricted permissions              |

## Browser-visible configuration

Values placed in the web application's `VITE_` environment variables are
browser-visible.

Public configuration may include:

- API base URL;
- authentication domain or issuer;
- public SPA client identifier; and
- API audience identifier.

Browser-visible configuration must not include:

- authentication client secrets;
- management API secrets;
- database connection strings;
- passwords;
- private signing keys; or
- other private credentials.

## Sensitive information

The following information must not appear in normal logs, commits, public
documentation examples, screenshots, error responses, or browser bundles:

- private authentication secrets;
- database credentials;
- private keys;
- complete access tokens;
- passwords;
- accepted challenge answers;
- unnecessary precise player locations; and
- internal security configuration.

## Location privacy

While `/explore` is visible, the Basic implementation may run one browser
geolocation watcher to render the latest reported location and drive bounded,
movement-based eligibility refreshes. The watcher pauses when the document is
hidden and is cleared on unmount. It must not become background movement
tracking or a persisted location history.

Location is requested and processed only when it supports a legitimate
operation, such as:

- showing the player's current position;
- checking event eligibility; or
- submitting an event attempt.

The final location-retention policy remains an open decision.

Until that decision is resolved, processing a location claim must not be assumed
to require permanent storage of the exact submitted coordinates.

## Open security decisions

The following decisions or operational evidence still require review:

- further campus evidence for the provisional `75 m` event radius, two-minute
  location-claim freshness threshold, and accuracy-envelope handling;
- location-data retention;
- operational logging and monitoring providers.

The Basic application-role representation is resolved: Auth0 authenticates the
principal, while PostgreSQL stores the local `player` or `author` role and the
API enforces it. Role changes are out-of-band.

Production hosting is established on Azure App Service for the Web and API and
Cloudflare Pages for documentation. The API accepts browser CORS requests only
from its configured exact Web origin. These deployment choices do not change
the rule that CORS is not authentication and bearer tokens must still be
validated.

---

This document was originally planned and generated with assistance from
ChatGPT-Web[GPT-5.6 Thinking], and was reviewed and edited for Sprint 1 release
validation with assistance from ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].
