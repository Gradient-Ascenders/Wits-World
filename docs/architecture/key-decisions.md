---
title: Architecture decisions
description: The accepted boundaries, technology choices, consequences, and unresolved proposals that shape Wits World.
---

# Architecture decisions

Wits World records significant technical choices separately from feature
details. This page gives the current decision set used by the implementation.
It distinguishes accepted architecture from proposals that still need approval.

The [system architecture](overview.md) explains the resulting applications and
hosting model. The [technology stack](technology-stack.md) describes the tools
inside those boundaries.

## Current decisions

| Decision                          | Status   | Current choice                                                                                  |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Repository structure              | Accepted | Keep the Web, API, docs, database, and shared packages in one npm-workspace monorepo.           |
| Web and API separation            | Accepted | Keep the React Web application and Fastify API separately buildable and hosted.                 |
| Database and spatial calculations | Accepted | Use PostgreSQL for relational authority and PostGIS for server-side location calculations.      |
| Map-provider boundary             | Accepted | Use Mapbox for presentation; keep event data and eligibility decisions in the API and database. |
| Authentication                    | Accepted | Use Auth0 for authentication while keeping application authorisation in Wits World.             |
| Alternative proof for poor GPS    | Proposed | Consider a physical QR marker with an accessible short-code equivalent; do not implement yet.   |

## One repository, independent applications

The repository is a monorepo so one change can update application code,
database migrations, shared rules, tests, and documentation coherently. The
principal workspaces are `apps/web`, `apps/api`, and `apps/docs`; focused shared
logic belongs in `packages/game-rules` or `packages/account-policy`.

This does not make the system one deployable application. Each workspace keeps
its own configuration, checks, build, and deployment boundary. Shared packages
should contain behaviour genuinely required by more than one application,
rather than becoming a general dumping ground.

## Separate Web and API authority

The browser sends player intent and renders returned state. It does not connect
to PostgreSQL or decide identity, permissions, location eligibility, marking,
rewards, ownership, deck legality, or battle outcomes.

The API validates bearer tokens, request schemas, permissions, resource state,
and protected rules before reading or changing the database. This separation
supports independent deployment and testing, but requires explicit HTTP
contracts, controlled CORS, compatible releases, and useful recovery states for
network failures. The current release workflow publishes the API before the
Web application and verifies same-commit publication and compatible Battles
contracts. See [CI workflows](../testing/continuous-integration.md#api-first-battles-contract-gate)
and [Security and server authority](trust-boundaries.md).

## PostgreSQL and PostGIS

PostgreSQL provides relationships, constraints, transactions, locks, indexes,
and durable history for the game. PostGIS stores campus geometry and performs
distance and containment calculations in the trusted server boundary.

The consequence is that schema changes require ordered migrations and database
integration tests. Browser map positions and client-calculated distances remain
untrusted claims. See the [database overview](../database/overview.md) and
[event eligibility](../database/event-eligibility.md).

## Map presentation boundary

Mapbox GL JS renders campus context, markers, routes, and reviewed geometry. It
does not own event publication, effective placement, interaction radii, or the
decision that a player may start a challenge. The text event list remains a
usable alternative when map resources fail or cannot be used.

Keeping this boundary limits provider lock-in and prevents presentation data
from becoming gameplay authority. Token restrictions, licensing, attribution,
cost, and browser privacy still need operational review. See
[Mapbox integration](external-integrations.md#mapbox).

## Auth0 authentication

Auth0 supplies registration, sign-in, recovery, and identity-provider sessions.
The browser obtains an access token; the API validates its issuer, audience,
signature, and claims before resolving the local player.

Authentication proves the external identity only. Wits World still owns roles,
account lifecycle, resource ownership, Author permissions, and gameplay
authorisation. Provider credentials remain server-only, while public SPA
configuration is deliberately visible in the browser. See
[Auth0 integration](external-integrations.md#auth0).

## Poor-GPS fallback remains proposed

No alternative presence proof is currently implemented. When browser location
is too inaccurate, the supported behaviour is to request a clearer reading or
report that eligibility cannot be established.

A location-specific physical QR marker with a keyboard-readable short code is
the current engineering proposal. It remains subject to product, Wits placement,
accessibility, privacy, replay-control, retention, and operational approval.
Until those decisions are recorded, a QR code, photo, campus-network claim,
beacon, or staff code must not grant challenge eligibility.

## Established choices without dedicated decisions

Azure App Service, Neon PostgreSQL/PostGIS, Upstash Redis, and Cloudflare Pages
are current implementation and operating choices. Their configuration and
failure boundaries are documented in [Integrations](external-integrations.md)
and [Azure deployment](../deployment/azure-deployment-setup.md), but they do not
currently have separate accepted architecture-decision records.

Create or supersede a decision record when a material change alters application
boundaries, server authority, protected data, a major provider, or an enduring
operational responsibility. Preserve the historical record rather than
rewriting an earlier decision to make it appear current.

## AI declaration

Prepared with assistance from Codex[GPT-6], using the current implementation,
architecture references, and repository decision records.
