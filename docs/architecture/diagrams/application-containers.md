---
title: 'Frontend, API and database diagram'
---

# Frontend, API and database diagram

This diagram shows the major deployable applications, external services, and
data store.

<div className="diagram-scroll" role="region" aria-label="Frontend, API and database diagram — diagram 1" tabIndex={0}>

```mermaid
flowchart TB
    accTitle: Frontend, API and database responsibilities
    accDescr: The browser sends authenticated requests to Fastify. Only the API accesses PostgreSQL and PostGIS. Authentication, maps and documentation are separate integrations.
    subgraph Device["Player or Author Device"]
        Browser["Web Browser"]
        Geo["Browser Geolocation API"]
        Web["apps/web<br/>React, Vite and TypeScript"]

        Browser --> Web
        Geo -->|"Untrusted location claim"| Web
    end

    subgraph Applications["Wits World Applications"]
        API["apps/api<br/>Fastify and TypeScript<br/>Hand-Written HTTP API"]
        Docs["apps/docs<br/>Public Documentation Application"]
    end

    DB[("PostgreSQL and PostGIS<br/>Authoritative Application Data")]
    Auth["Auth0<br/>Authentication Provider"]
    Map["Mapbox GL JS / Mapbox Standard<br/>Presentation Provider"]

    Web -->|"HTTPS JSON requests<br/>Bearer access token"| API
    API -->|"Safe JSON responses"| Web

    Web -->|"Login and token acquisition"| Auth
    API -->|"Token signature, issuer and audience validation"| Auth

    API -->|"Parameterised SQL and transactions"| DB
    DB -->|"Event records and distance results"| API

    Web -->|"Tiles, styles and attribution"| Map

    Browser -->|"Public access"| Docs
```

</div>

## Container responsibilities

### `apps/web`

The web application:

- renders the mobile-first player and author interface;
- obtains reported location through browser permission and the live watcher;
- submits untrusted location claims to the API;
- displays API decisions;
- integrates map presentation;
- handles authentication loading and failure states; and
- provides accessible loading, error, and fallback interfaces.

The web application is not authoritative for protected decisions.

### `apps/api`

The API:

- validates access tokens;
- derives authenticated identity;
- validates request data;
- enforces role and object-level authorisation;
- coordinates event and eligibility operations;
- accesses PostgreSQL/PostGIS;
- enforces protected game rules;
- returns structured safe errors; and
- publishes OpenAPI documentation.

### PostgreSQL/PostGIS

The database:

- stores authoritative event data;
- stores authoritative geospatial points;
- performs distance calculations;
- applies constraints and indexes;
- supports transactional integrity; and
- stores attempts, rewards, cards, decks, and matches.

### Auth0 authentication provider

The authentication provider:

- supports registration;
- supports sign-in;
- provides password-reset email for supported database accounts;
- issues tokens; and
- provides the Management API used by the account-deletion workflow.

Password reset and account deletion are implemented. The API coordinates local
account cleanup with external Auth0 deletion and retry handling. Live provider
configuration and delivery still need the evidence described in
[account lifecycle validation](../../testing/player-account-lifecycle-validation.md).

Auth0 is the selected provider under ADR-005. The API validates its access
tokens and derives the local player identity and role from validated claims.

### Map provider

The current implementation uses Mapbox GL JS and Mapbox Standard through the
provider-neutral map adapter. It is a confirmed team technology choice within
the project's implementation discretion, without claiming an explicit
client/lecturer approval by name. Licensing/terms, production token and privacy
controls, usage/cost ownership, and any licensed project-owned campus layer
remain operational evidence needs.

The map provider:

- supplies map tiles;
- supplies map styles;
- displays required attribution; and
- supports visual map presentation.

It does not decide whether an event is reachable.

### `apps/docs`

The documentation application:

- publishes version-controlled project documentation;
- explains setup, architecture, methodology, testing, and deployment; and
- contains no runtime authority over players or game operations.

---

The preceding document was planned and generated with the assistance of
ChatGPT-Web[GPT-5.6 Thinking], updated with Codex-CLI[GPT-5], and reviewed and
edited for Sprint 1 release validation with assistance from
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

Page title and diagram updated against the current repository with assistance
from Codex-CLI[GPT-6].
