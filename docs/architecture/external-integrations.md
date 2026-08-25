---
title: External integration boundaries
---

# External integration boundaries

## Purpose

Wits Quest depends on external identity, map, database, hosting, and delivery
services, but it keeps protected game authority inside the API and database.
This page shows where each integration crosses the system boundary, what data
crosses it, and what a local automated test does or does not prove.

For the selection and motivation of the software and services themselves, see
[Third-party software and services](./third-party-software-and-services.md).

## Runtime integrations

| Integration                      | Direction and data                                                                                                                                                                                                                                          | Authority and privacy boundary                                                                                                                                                                                                                                                                                                           | Failure behaviour and evidence                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth0 authentication             | The browser uses the Auth0 React SDK for hosted authentication and token acquisition. The API uses the configured issuer and JWKS to validate bearer tokens. Account-lifecycle backend code also has a separately configured Auth0 Management API boundary. | Auth0 authenticates the external identity and issues tokens. Wits World derives the local player and role only after token validation. Passwords, management credentials, and complete tokens are not stored in the repository or normal evidence.                                                                                       | The Web handles authentication loading and failure states; the API returns safe `401` responses. Tests use local keys and controlled SDK boundaries. Real tenant, DNS, callback, refresh, and Management API behaviour requires deployed operator evidence.                      |
| Mapbox GL JS and Mapbox Standard | The browser loads the public style, tiles, glyphs, and attribution with a URL-restricted public `pk.` token.                                                                                                                                                | Mapbox is a confirmed team-selected presentation integration. It does not authenticate players or decide event publication, distance, eligibility, challenges, or rewards. Reported player coordinates are not placed in a Mapbox source, marker, URL, or provider request; the map's player indicator is a transient local DOM overlay. | The semantic event list and coordinate form remain available if map loading fails. Controlled tests substitute the renderer boundary. Token restrictions, CSP/privacy, licensing/terms, cost/usage monitoring, attribution, and campus-data checks remain deployed/manual gates. |
| Browser Geolocation API          | While Explore is active, the browser may provide latitude, longitude, reported accuracy, and acquisition time after the documented permission and player-action rules. Claims go to the Wits World API.                                                     | A device reading is an untrusted **reported location**, not verified presence. The API validates structure, freshness, accuracy, event state, and PostGIS distance. The current eligibility and challenge-start paths do not persist exact claims as a location history.                                                                 | Permission denial, timeout, unavailable, stale, and poor-accuracy states are represented in tests. Real campus conditions require the field-test protocol and reviewed device evidence.                                                                                          |
| Neon PostgreSQL/PostGIS          | Only the API and operator tooling connect through `pg` using environment-supplied TLS connection strings. PostGIS stores event points and performs metre-based distance calculations.                                                                       | The browser has no database credentials or direct database access. PostgreSQL stores authoritative gameplay state; constraints, locks, transactions, and private answer-key storage reinforce the service boundary.                                                                                                                      | Readiness checks verify PostGIS. Database suites use a disposable database beneath a separate test target. Production migration, backup, recovery, plan limits, and restore evidence remain operator-owned.                                                                      |

## Delivery and hosting integrations

| Integration                | Current use                                                                                                                                                   | Boundary                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure App Service          | Independently hosts the compiled Web and API applications. Gitea Actions deploys verified SHA-named artifacts through an Azure runner using managed identity. | API runtime secrets remain in App Service settings. Browser `VITE_*` values are public build-time configuration. Main deployment performs health checks but does not migrate the production database. |
| Cloudflare Pages           | Hosts the static Docusaurus documentation site. A path-filtered Gitea workflow builds and deploys documentation after relevant pushes to `main`.              | Cloudflare deployment credentials are Gitea secrets scoped to the deployment step. Documentation is public and has no game authority.                                                                 |
| Wits SDP Gitea and Actions | Hosts Git, issues, pull requests, reviews, artifacts, and the CI/CD workflows.                                                                                | Validation containers and the host-only Azure runner have different responsibilities. Repository or platform-managed secrets must not enter source, artifacts, screenshots, or routine logs.          |

Azure, Cloudflare, and Gitea are delivery integrations rather than participants
in gameplay decisions. Their current topology is shown in the
[deployment diagram](./diagrams/deployment.md), and their exact workflow is
documented under [Continuous integration](../testing/continuous-integration.md).

## Boundary rules

- The Web calls the Wits World API for protected state; it does not call the
  database directly.
- Auth0 tokens establish an external principal only after API validation; they
  do not let the browser select a local role or player ID.
- Mapbox output is visual evidence only. PostGIS remains the distance authority.
- Browser geolocation is never described as proof of physical presence.
- Third-party outages must produce safe errors or a documented fallback rather
  than shifting authority to the browser.
- External credentials and database URLs stay outside Git and browser-visible
  configuration.
- A mocked or controlled integration test proves Wits World's side of the
  boundary, not the external provider's live configuration or acceptance.

## Evidence status

Current repository evidence includes:

- provider selection ADRs and evaluations for Auth0, PostgreSQL/PostGIS, and the
  map boundary;
- implementation and automated tests for token validation, exact-origin CORS,
  provider-safe failures, database isolation, and map-independent access;
- a dated deployed Auth0/CORS/privacy boundary review;
- Azure, Cloudflare, Neon, and Mapbox operational documentation; and
- the deterministic Basic E2E with Auth0 and Mapbox deliberately controlled.

The team confirms Mapbox as an allowed implementation choice under the
project's broad technology discretion; no separate explicit approval by Calvin
or the lecturer is claimed. The repository does not yet contain a completed
campus field-test record, application-wide live-provider E2E evidence for a
named release, final Mapbox licensing/token/privacy/usage evidence, or final
operator evidence for database backup/recovery and production observability.
Those remain evidence needs, not implicit passes.

## Related documentation

- [System context](./diagrams/system-context.md)
- [Trust boundaries](./trust-boundaries.md)
- [Auth0 ADR](./decisions/ADR-005-auth0-authentication.md)
- [Mapbox integration boundary](./mapbox-standard-migration.md)
- [Mapbox operations](../deployment/mapbox-operations.md)
- [Neon/PostGIS setup](../database/neon-postgis-setup.md)
- [Deployed authentication, CORS, and privacy review](../testing/deployed-auth-cors-privacy-review.md)

## AI declaration

This integration overview was generated, edited, and reviewed with the
assistance of Codex[GPT-5]. It distinguishes repository-controlled evidence
from provider, operator, and stakeholder evidence that has not been recorded.
