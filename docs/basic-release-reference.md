---
sidebar_position: 2
title: Basic release reference
---

# Basic release reference

This is the public starting point for the Wits Quest Basic tier. It describes
what is implemented, where authority lives, and how the release claim is
verified. It does not turn an automated check into production or lecturer
acceptance evidence.

## Product and architecture

Players authenticate through Auth0, discover published campus events, submit a
one-shot browser location claim, complete five-question challenges, receive
server-selected rewards, manage owned cards and legal decks, and play
server-resolved CPU matches. Authors use the protected `/author` console to
create, publish, retire, and audit shared content.

The React/Vite browser is presentation and untrusted input. Fastify resolves the
verified Auth0 principal to a local player and role. PostgreSQL/PostGIS stores
authoritative events, attempts, rewards, ownership, decks, content, and matches.
The API decides eligibility, correctness, scoring, rewards, deck legality, legal
actions, and match outcomes. Mapbox supplies map presentation only; the semantic
event list remains usable without it. See the [architecture overview](architecture/overview.md),
[trust boundaries](architecture/trust-boundaries.md), and
[Basic rules](requirements/basic-game-rules.md).

## Local setup

Use Node.js 24.14.1 and npm 11.18.0, then run `npm ci`. Copy the API and web
`.env.example` files without committing secrets. Configure separate development
and disposable test PostgreSQL/PostGIS URLs, the Auth0 issuer/audience and SPA
client values, exact CORS origin, and the browser-visible URL-restricted Mapbox
`pk.` token. Run migrations and seeds before starting `npm run api` and
`npm run view`. The [Neon/PostGIS guide](database/neon-postgis-setup.md) and
[Azure deployment guide](deployment/azure-deployment-setup.md) define the full
configuration and guarded deployment boundaries.

The API publishes interactive OpenAPI at `/documentation/` and JSON at
`/documentation/json`. Route payloads are runtime validated and errors use a
safe versioned envelope. Database structure and spatial rules are covered by the
[event schema](database/event-schema.md), [eligibility design](database/event-eligibility.md),
and [challenge/reward persistence design](database/challenge-reward-persistence-design.md).

## Authoring and game rules

Basic has Player and Author roles only. Role changes are out-of-band. Authors
may manage all Basic content; the API records actor and time. Questions must be
complete before publication, challenges need at least five valid published
questions, events need a published challenge and viable Common reward pool, and
Creature publication requires exactly four ordered moves. Draft Creatures may
have zero through four moves. The unresolved legacy two-move catalogue data must
be reviewed by the Cards/Game owner; automation must not invent moves.

## Testing and release evidence

Run normal repository checks with `npm run format:check`, `npm run lint`,
`npm run type-check`, `npm test`, and `npm run build`. With `TEST_DATABASE_URL`
pointing to a disposable test database, `npm run test:e2e:basic` migrates the
test schema and runs the [deterministic 21-step Basic journey](testing/basic-tier-deterministic-e2e.md)
through a real browser, Fastify services, and PostgreSQL/PostGIS. Auth0 and
Mapbox are controlled at their documented external boundaries; the test is not
a live production smoke test. The canonical evidence and remaining gates are in
[Basic-tier release validation](testing/basic-tier-release-validation.md).

## Delivery methodology, AI use, and external services

The public [project and Git methodology](planning/project-and-git-methodology.md)
documents the Scrum-lite cadence, Kanban tracker, issue/branch/PR flow, review,
CI expectations, Definition of Done, stakeholder feedback loop, and the actual
square-bracket commit prefixes used by this repository. The public [AI-use
guide](planning/ai-use.md) defines generation, inline editing, review,
verification, declarations, and `Assisted-by` attribution. `CONTRIBUTING.md`
remains the contributor checklist.

Auth0, Mapbox, Neon/PostgreSQL, Azure App Service, and Cloudflare Pages are
externally operated dependencies. Their tenant, licensing, DNS, availability,
observability, backup, and acceptance evidence is operational work outside a
local test pass.

## AI declaration

This release reference was generated, edited, and reviewed with the assistance
of Codex[GPT-5] and ChatGPT-Web[GPT-5.6 Sol]. Evidence statements must still be
supported by executed checks or named operator confirmation.
