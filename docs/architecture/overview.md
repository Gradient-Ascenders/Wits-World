---
title: 'System architecture'
description: The applications, responsibilities, and hosting model behind Wits Quest.
---

# System architecture

Wits Quest has a React Web application, a Fastify API, and a PostgreSQL/PostGIS
database. The Web presents the game; the API processes actions and applies
rules; the database stores durable state. Wits World is the repository that
contains these applications and the documentation site.

## Application boundaries

| Component                 | Responsibility                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web`                | Player and Author interfaces, navigation, maps, and browser interaction.                |
| `apps/api`                | HTTP routes, live battle connections, game services, and background maintenance.        |
| PostgreSQL/PostGIS        | Accounts, content, card ownership, attempts, matches, progression, and spatial queries. |
| `packages/game-rules`     | Battle transitions used by the API.                                                     |
| `packages/account-policy` | Player Name rules shared by the Web and API.                                            |
| `apps/docs`               | The public documentation site.                                                          |

The applications share a repository and npm workspace setup, but build and
deploy separately. Feature services run within the API application and use the
same database; background workers handle work such as deadlines and cleanup.

## Communication

The Web calls versioned HTTP routes under `/api/v1`. Live battles also use
WebSockets. The API accesses the database through parameterised SQL and
transactions. PostgreSQL notifications help API processes deliver committed
live battle updates.

Auth0 provides authentication, Mapbox supplies map resources, and Upstash Redis
supports shared request limits and gameplay coordination. Their data exchanges
are documented in [Integrations](external-integrations.md).

See the [system context](diagrams/system-context.md) and
[application diagram](diagrams/application-containers.md) for visual views.

## Hosting

The Web and API run in separate Azure App Services. Neon hosts
PostgreSQL/PostGIS, and Cloudflare Pages hosts the documentation.

Gitea Actions validates pull requests and builds release artifacts on `main`.
Eligible API deployments run a guarded database release before deploying the
API. Content seeding remains an explicit operation. Documentation has its own
deployment workflow.

The [deployment diagram](diagrams/deployment.md) shows this sequence.
Configuration and operating procedures belong in
[Azure deployment](../deployment/azure-deployment-setup.md),
[database releases](../database/database-release-procedure.md), and
[continuous integration](../testing/continuous-integration.md).

## Read next

- [Stack](technology-stack.md): technologies, shared packages, and selection rationale.
- [Data flow](data-flow.md): how requests become saved results.
- [Security](trust-boundaries.md): identity, permissions, and protected data.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[GPT-5],
Codex-CLI[GPT-6], Codex[GPT-5], and Codex[GPT-6].
