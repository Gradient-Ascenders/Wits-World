# Initial Architecture Overview

## Document status

- **Issue:** #5 — Document the initial architecture and delivery plan
- **Status:** Initial Sprint 1 architecture
- **Owner:** Member 2 — API and Security Lead
- **Reviewer:** Member 3 — Data and Infrastructure Lead

## Project identity

The repository, workspace, and technical project are named **Wits World**.

The location-based campus game delivered by the project is named **Wits Quest**.

## Product overview

Wits Quest is a mobile-friendly, location-based campus exploration web game.

The complete Basic product is intended to allow an authenticated player to:

1. view published events on a campus map;
2. travel to an event location;
3. submit a browser-reported location claim;
4. have the server determine whether the event is reachable;
5. complete a university-related challenge;
6. earn the event's card once after a successful answer;
7. manage collected cards and a valid deck;
8. play a server-controlled turn-based match against the computer; and
9. view the stored match result.

Sprint 1 delivers the first vertical slice of this journey:

1. an authenticated player accesses the application;
2. the player views a published demonstration event;
3. the player requests browser geolocation;
4. the browser submits the resulting location claim to the API;
5. the API obtains the authoritative event location from PostgreSQL/PostGIS;
6. the server determines whether the event is reachable; and
7. the browser displays the server's result.

## Course architecture requirements

The system must:

- use Git-compliant version control;
- provide responsive and accessible web interfaces;
- use CI/CD for collaboration and deployment;
- keep the front-end and back-end applications separate;
- expose a hand-written HTTP API;
- use an established authentication provider or library;
- integrate with a relevant external service; and
- publish a publicly accessible documentation website.

## Current architecture decisions

The repository uses a monorepo containing independently buildable applications:

- `apps/web` — React, Vite, and TypeScript web application;
- `apps/api` — Fastify and TypeScript hand-written HTTP API;
- `apps/docs` — public documentation application; and
- `packages/game-rules` — dependency-free pure Basic battle rules shared by the
  API and later match integrations.

The web application and API communicate through versioned HTTP endpoints.

PostgreSQL with PostGIS stores authoritative event and geospatial data.

The API is responsible for protected decisions, including:

- authenticated player identity;
- event publication and availability checks;
- request validation;
- event eligibility;
- protected game rules;
- authorisation; and
- safe API responses.

The map integration is used for presentation. It does not determine whether an
event is reachable.

The browser is not an authoritative environment. Browser-supplied data must be
validated by the API.

## Application responsibilities

| Application or service  | Primary responsibility                                    | Authority                                                             |
| ----------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web`              | Mobile-first player and author interface                  | Not authoritative for identity, eligibility, rewards, or game results |
| `apps/api`              | Hand-written HTTP API and protected application rules     | Authoritative for authenticated operations and eligibility decisions  |
| `packages/game-rules`   | Pure battle state transitions and legal-action validation | Authoritative rules consumed by the API; no browser authority         |
| PostgreSQL/PostGIS      | Persistent application and geospatial data                | Authoritative store for event coordinates and distance calculations   |
| Authentication provider | Registration, sign-in, password reset, and token issuance | Authoritative for external identity authentication                    |
| Map provider            | Map tiles, styles, and visual presentation                | Presentation only                                                     |
| `apps/docs`             | Public project documentation                              | Documentation only                                                    |
| CI/CD platform          | Automated checks, builds, and deployments                 | Delivery automation only                                              |

## Authority model

The browser may submit:

- an event identifier;
- latitude;
- longitude;
- reported location accuracy;
- device acquisition time; and
- a request or idempotency identifier where required.

The API independently determines:

- whether the request is authenticated;
- which player made the request;
- whether the event exists;
- whether the event is published;
- whether the event is currently available;
- whether the location claim is structurally valid;
- whether the claim is sufficiently recent and accurate;
- the distance between the submitted claim and the stored event point; and
- whether the event is reachable.

The browser must not submit authoritative values such as:

- `eligible: true`;
- `isAuthor: true`;
- `answerCorrect: true`;
- a client-selected reward card;
- a battle winner; or
- a completed match result.

## Data ownership

PostgreSQL/PostGIS stores the authoritative:

- event identifier;
- event location;
- event radius;
- publication state;
- availability period; and
- later persistent game data.

A browser-reported position is treated as a location claim. It does not replace
the stored event position and does not prove physical presence.

The map provider may visually display markers, routes, or distances, but the API
and PostGIS-backed service determine final eligibility.

## Security and privacy principles

The architecture must:

- validate access tokens before trusting identity;
- derive identity from the validated token;
- validate all request data at runtime;
- enforce role and object-level authorisation where required;
- use parameterised database queries;
- avoid exposing internal stack traces;
- keep private credentials outside browser-visible configuration;
- avoid logging access tokens, passwords, private keys, or unnecessary precise
  location data;
- request location only for a legitimate player action; and
- avoid continuous background tracking during the Basic scope.

## Independent deployment

The following applications must be independently buildable and deployable:

- the web application;
- the API;
- the documentation site.

The API and database must not be bundled into or exposed through the browser
application.

Deployment secrets must be stored outside the Git repository.

## Open decisions

The following choices still require completion or team review:

- authentication provider;
- production web host;
- production API host;
- production PostgreSQL/PostGIS host;
- documentation host;
- map tile and style provider;
- deployed domain names;
- production CORS origins;
- event radius for the Sprint 1 demonstration;
- acceptable reported location accuracy;
- location-claim freshness threshold; and
- precise location-retention policy.

These decisions should be recorded in architecture decision records when they
are resolved.

## Sprint 1 exclusions

The following features are outside the Sprint 1 vertical slice:

- challenge sessions;
- server-side answer marking;
- card reward transactions;
- player collections;
- deck management;
- CPU battles;
- complete authoring workflows;
- offline attempts;
- player-versus-player matches;
- live multiplayer;
- statistical trust scoring;
- trading;
- territory control; and
- advanced analytics.

Their future requirements must not be confused with the functionality currently
implemented during Sprint 1.

## Related documents

- [Trust boundaries](./trust-boundaries.md)
- [High-level data flow](./data-flow.md)
- [System context diagram](./diagrams/system-context.md)
- [Application container diagram](./diagrams/application-containers.md)
- [Deployment diagram](./diagrams/deployment.md)
- [Technology stack](./technology-stack.md)
- [Architecture decisions](./decisions/README.md)
- [Delivery roadmap](../planning/delivery-roadmap.md)
- [Risk register](../planning/risk-register.md)

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking] and Codex-CLI[gpt-5.6-sol medium].
