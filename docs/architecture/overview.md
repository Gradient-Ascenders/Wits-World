# Initial Architecture Overview

:::note[Evolving architecture document]

This page began as the Sprint 1 architecture baseline and later sections contain
subsequent updates. For current delivered scope, use the
[Basic release overview](../basic-release-reference.md); for accepted decisions,
use the [ADRs](decisions/README.md); and for current system and deployment views,
use the [system context](diagrams/system-context.md),
[application containers](diagrams/application-containers.md), and
[deployment](diagrams/deployment.md) diagrams.

:::

## Document status

- **Issue:** #5 — Document the initial architecture and delivery plan
- **Status:** Mixed current/historical — initial Sprint 1 architecture with
  maintained current-state sections
- **Current-state review:** 25 August 2026
- **Owner:** Member 2 — API and Security Lead
- **Reviewer:** Member 3 — Data and Infrastructure Lead

## Project identity

The repository, workspace, and technical project are named **Wits World**.

The location-based campus game delivered by the project is named **Wits Quest**.

## Product overview

Wits Quest is a mobile-friendly, location-based campus exploration web game.

The implemented core Basic gameplay allows an authenticated player to:

1. view published events on a campus map;
2. travel to an event location;
3. submit a browser-reported location claim;
4. have the server determine whether the event is reachable;
5. complete one timed five-question challenge per event;
6. receive the persisted score-based zero-to-two-card reward result while the
   server records permanent progression points;
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
- `packages/game-rules` — dependency-free pure Basic battle rules consumed by
  the API's CPU match service.

The web application and API communicate through versioned HTTP endpoints.

PostgreSQL with PostGIS stores authoritative event and geospatial data.

The API is responsible for protected decisions, including:

- authenticated player identity;
- event publication and availability checks;
- request validation;
- event eligibility;
- protected game rules;
- authorisation; and
- safe API responses; and
- CPU match state, legal actions, random CPU decisions, and match results.

The map integration is used for presentation. It does not determine whether an
event is reachable.

The browser is not an authoritative environment. Browser-supplied data must be
validated by the API.

## Application responsibilities

| Application or service  | Primary responsibility                                      | Authority                                                                 |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web`              | Mobile-first player and author interface                    | Not authoritative for identity, eligibility, rewards, or game results     |
| `apps/api`              | Hand-written HTTP API and protected application rules       | Authoritative for authenticated operations and eligibility decisions      |
| `packages/game-rules`   | Pure battle state transitions and legal-action validation   | Authoritative rules consumed by the API; no browser authority             |
| PostgreSQL/PostGIS      | Persistent application and geospatial data                  | Authoritative store for event coordinates and distance calculations       |
| Auth0                   | Registration, sign-in, reset capability, and token issuance | Authoritative for external identity authentication; Wits reset UI pending |
| Mapbox GL JS / Standard | Map tiles, styles, and visual presentation                  | Presentation only                                                         |
| `apps/docs`             | Public project documentation                                | Documentation only                                                        |
| CI/CD platform          | Automated checks, builds, and deployments                   | Delivery automation only                                                  |

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
- availability period;
- attempts, answers, completions, rewards, and owned cards;
- saved decks and active selection; and
- CPU match state, rounds, actions, and results.

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

## Current service and deployment selections

The current implementation uses Auth0 under ADR-005, Mapbox GL JS with Mapbox
Standard through the provider-neutral presentation boundary, Neon-hosted
PostgreSQL/PostGIS, Azure App Service for the independently deployed Web and
API, and Cloudflare Pages for documentation. Production CORS uses the API's
configured exact Web origin, and the current public hostnames are maintained in
the deployment guide.

Mapbox is the implemented and confirmed team-selected provider under the broad
implementation-technology discretion given to the project. This does not claim
that Calvin or the lecturer explicitly approved Mapbox by name, and no separate
named approval is treated as a blocking decision. Licensing/terms, production
token/CSP/privacy, cost ownership, usage monitoring, and project-owned
campus-data evidence remain operational requirements. Hosting and provider
operations are documented, although they do not yet have dedicated ADRs for
every selected service.

## Remaining review and operational gates

The Basic role model, challenge/reward rules, card vocabulary, deck rules, CPU
battle rules, and account-retention policy are confirmed team decisions in the
[Basic-tier decision register](../requirements/basic-tier-decision-register.md).
The current repository implements the core Basic gameplay rather than the
complete Basic product. It still records these narrower gates:

- the seeded `75 m` event radius, two-minute claim freshness threshold, and
  accuracy-envelope and maximum-journey-speed thresholds remain provisional
  pending further campus field evidence;
- the final location-data retention policy remains open; the current
  implementation stores active-use eligibility and challenge-start evidence
  under a provisional 24-hour expiry and deletes its journey audit with it;
- account-deletion persistence and retention are implemented; the player
  profile/account page, password reset, and deletion UI remain mandatory issue
  `#161` work;
- Mapbox licensing/terms, production token/CSP/privacy, cost ownership, usage,
  and campus-data evidence remains outstanding; and
- production observability, backup, and recovery evidence remains
  operator-owned.

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

The preceding document was planned and generated with the assistance of
ChatGPT-Web[GPT-5.6 Thinking] and Codex-CLI[gpt-5.6-sol medium], and reviewed
and edited for Sprint 1 release validation with assistance from
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

The architecture-status notice was added with assistance from Codex-CLI[GPT-5]
and Codex-CLI[gpt-5.6-sol medium].
