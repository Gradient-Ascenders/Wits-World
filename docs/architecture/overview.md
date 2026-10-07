---
title: 'System architecture'
description: The main Wits Quest components, trust boundaries, data flow, and deployment model.
---

# System architecture

Wits Quest is a mobile-first web game with separate Web, API, database, and
documentation applications. The browser displays state and sends player
actions. The API and database make protected decisions.

Use the [system context](diagrams/system-context.md),
[application container](diagrams/application-containers.md), and
[deployment](diagrams/deployment.md) diagrams for a visual walkthrough. The
[Advanced systems diagram](diagrams/advanced-systems.md) shows later gameplay
and operational services.

## Main components

| Component                 | Technology                      | Responsibility                                                              |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                | React, Vite, TypeScript         | Player and Author interfaces                                                |
| `apps/api`                | Fastify, TypeScript             | HTTP and realtime boundaries, validation, permissions, and game services    |
| PostgreSQL/PostGIS        | Relational and spatial database | Persistent game state, constraints, transactions, and distance calculations |
| `packages/game-rules`     | TypeScript library              | Pure battle rules used by the API                                           |
| `packages/account-policy` | TypeScript library              | Shared player-name rules                                                    |
| Auth0                     | External identity provider      | Sign-up, sign-in, tokens, password recovery, and identity management        |
| Mapbox                    | External map provider           | Map tiles, styles, and visual presentation only                             |
| `apps/docs`               | Docusaurus                      | Public technical and project documentation                                  |

The repository is a monorepo, but the Web application, API, and documentation
site build and deploy separately.

## Authority model

The system is server-authoritative. This means the browser can request an
action, but it cannot decide the result.

For example, the browser may send an event ID and a location claim. The API
then:

1. validates the access token and finds the local player;
2. validates the request;
3. loads the published event from PostgreSQL;
4. checks time, accuracy, and distance rules; and
5. returns the decision to the browser.

The same pattern applies to challenge marking, rewards, card ownership, deck
rules, battle actions, match results, rankings, trades, and Author decisions.
The browser never supplies trusted fields such as `eligible: true`, a correct
answer, a reward card, or a battle winner.

## Data flow

```text
Player or Author
      │
      ▼
React Web application
      │  HTTPS / WebSocket
      ▼
Fastify API
      ├── Auth0: token and identity checks
      ├── PostgreSQL/PostGIS: state, transactions, and spatial rules
      ├── shared rule packages: deterministic policies
      └── external services: maps and rate limiting
```

HTTP routes use the versioned `/api/v1` boundary. Live play uses a separate
WebSocket contract with short-lived connection tickets. OpenAPI documents HTTP
operations; it does not list WebSocket messages.

See [High-level data flow](data-flow.md) for feature flows and
[Trust boundaries](trust-boundaries.md) for security details.

## Security and privacy

The architecture follows these rules:

- validate every access token and derive the user from it;
- check role, ownership, object state, and account state on the server;
- validate request and response data at runtime;
- use parameterised SQL and database constraints;
- keep secrets out of browser-visible `VITE_*` configuration;
- return safe errors without stack traces or private state;
- avoid logging tokens, credentials, hidden cards, or precise location data;
- collect location only for a clear player action; and
- keep analytics aggregated where individual data is not required.

## Deployment

The Web application and API run as separate Azure App Services. They share an
App Service Plan but remain independently deployable. PostgreSQL/PostGIS runs
on Neon. The documentation site runs on Cloudflare Pages.

Gitea Actions performs repository checks and application deployment. Production
database migration is a separate guarded operation. This prevents an
application deployment from changing production data without an explicit
database release decision.

See [Azure deployment](../deployment/azure-deployment-setup.md),
[database release](../database/database-release-procedure.md), and
[continuous integration](../testing/continuous-integration.md).

## Course requirements

This structure supports the project brief's main technical requirements:

- separate front-end and back-end applications;
- a hand-written API;
- established authentication;
- external service integration;
- responsive and accessible interfaces;
- CI/CD; and
- a public documentation website.

Meeting a structural requirement does not by itself prove deployment,
performance, accessibility, or user acceptance. Those results belong in dated
evidence pages.

## Known evidence gaps

Current documents describe the architecture and its automated checks. Release
evidence must still identify the tested revision and environment. Production
backup, restore, observability, provider configuration, and full multi-instance
recovery need separate operator records where required.

## Related documents

- [Technology stack](technology-stack.md)
- [API overview](api-overview.md)
- [Database overview](../database/overview.md)
- [Architecture decisions](decisions/README.md)
- [External integrations](external-integrations.md)
- [Testing strategy](../testing/testing-strategy.md)

## AI declaration

This page was planned, generated, and edited with assistance from
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-5]. It was rewritten in simpler language with
assistance from Codex[GPT-5].
