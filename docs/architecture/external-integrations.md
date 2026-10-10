---
title: 'External services and data sharing'
---

# External services and data sharing

This page identifies the data exchanged with external services.
[Security](trust-boundaries.md) covers validation and privacy controls;
[Stack](technology-stack.md) explains technology choices.

## Runtime exchanges

| Service                         | Connection          | Data exchanged                                                                                                        |
| ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Auth0                           | Browser/API ↔ Auth0 | Authentication, token issuance, public signing keys, and account-management requests.                                 |
| Mapbox                          | Browser → Mapbox    | Public token, style/tile/font requests, and the requested map area. Application event overlays are assembled locally. |
| [Neon](#neon)                   | API → PostgreSQL    | SQL and stored application data over a TLS database connection. The browser has no direct database connection.        |
| [Upstash Redis](#upstash-redis) | API → Upstash       | Request-limit keys, counters, and gameplay coordination records.                                                      |

The browser's Geolocation API supplies device readings through its permission
flow. Location-dependent requests go to the Wits World API.

## Auth0

Auth0 provides hosted registration, sign-in, password recovery, and token
issuance. The integration has 3 distinct parts:

| Part                    | Purpose                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web application client  | The Auth0 React SDK starts hosted authentication, returns the user to the Web application, and obtains or renews access tokens. Its client ID is public browser configuration.      |
| Wits World API resource | Defines the audience requested by the Web and accepted by the API. An access token identifies which API it is intended for; an ID token describes the signed-in user to the client. |
| Management API client   | A separate server-side application obtains a machine-to-machine token for identity-management operations. The current backend uses it for account deletion.                         |

The Web client and API must agree on the authentication domain and API
audience. Auth0's allowed callback, logout, and Web origins must also match the
configured application origins. Local values are described in
[Getting started](../development/getting-started.md#configure-the-game).

The API retrieves Auth0's public signing keys and validates access tokens
locally. It then resolves the corresponding Wits World account; game data and
application permissions remain in the local database. See
[Identity and permissions](trust-boundaries.md#identity-and-permissions) for
validation and access rules.

Management requests use separate credentials and an Auth0 Management API
audience. These credentials remain on the server. Account deletion coordinates
local cleanup with external identity removal and records pending work for retry;
the [deletion contract](../database/account-deletion-retention.md) defines that
lifecycle.

### Auth0 email policy

Wits World does not require email verification for account access. The tenant
configuration should disable automatic signup verification and verification
emails while retaining password-recovery delivery. The repository does not
manage these tenant settings; an authorised administrator configures them and
checks signup, sign-in, and password recovery with a test account.

## Mapbox

Explore and Author maps use a shared rendering adapter. Desktop Explore,
Author maps, and mobile Explore with **Detailed 3D map** enabled use Mapbox
Standard. Default mobile Explore uses Streets v12 with a flat camera.

The adapter overlays API-supplied events, trail steps, event radii, territories,
and Author placement previews. It also renders the reported-location indicator
as a local DOM marker. PostGIS supplies the authoritative distance and
eligibility results.

Desktop layer controls change visibility without changing game state. Standard
lighting follows fixed dawn, day, dusk, and night periods in Johannesburg time.
The renderer respects reduced-motion preferences, keeps attribution visible,
and disables optional performance-metrics collection. The text event list
remains available alongside the map.

Buildings come from the basemap; a project-owned campus dataset is not currently
configured. See [location privacy](trust-boundaries.md#location-and-privacy) for
device readings and retention.

### Mapbox configuration

The Web build reads `VITE_MAPBOX_ACCESS_TOKEN`. Use a dedicated public `pk.`
token with `styles:read` and `fonts:read`, restricted to the intended Web
origins. Use separate development and production tokens; a default public
token cannot have URL restrictions. Never embed a secret token in the browser.
See [Mapbox token guidance](https://docs.mapbox.com/accounts/guides/tokens/)
for scopes, restrictions, and rotation.

Check the deployed browser's Content Security Policy against the selected
style, tile and font requests, and GL JS worker requirements. Confirm that maps
load from each intended origin and that the event list remains usable when
rendering fails. Token changes require a new Web build.

The adapter updates event overlays without recreating the map. Monitor
map-load usage in the provider account and review current service
terms before changing usage or enabling additional Mapbox APIs.

## Neon

Neon hosts the deployed PostgreSQL database. The API sends parameterised SQL
and receives query results over a TLS connection. Stored data includes player
accounts, card ownership, challenge attempts, battle results, and authored
content. Browser requests reach this data through the API, which checks
permissions and game rules.

`DATABASE_URL` is server-only configuration and can use a pooled Neon endpoint
for ordinary queries. PostgreSQL notification listeners use
`LISTENER_DATABASE_URL`, a direct, non-pooled connection to the same database.
Both connections retain `sslmode=require`; database credentials stay out of
browser builds.

Development and test environments use separate databases or Neon branches.
[Neon and PostGIS setup](../database/neon-postgis-setup.md) covers connection
configuration and initialisation; the
[database release procedure](../database/database-release-procedure.md) covers
production migrations.

## Upstash Redis

The API connects to Upstash Redis over HTTPS using the server-only
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. API instances sharing
the service can enforce a common request quota and observe gameplay activity
across processes.

Rate-limit records contain policy keys, counters, and server-resolved player or
developer-key identifiers. Raw access tokens, developer API keys, and IP
addresses are not used as Redis keys. Gameplay coordination uses a separate
keyspace for activity snapshots and persistent records that announce work
before a database write. PostgreSQL remains the authoritative game-state store.

The gameplay scheduler defaults to polling PostgreSQL. Its optional Upstash
mode uses shared activity records to wake workers and reduce database probes
while idle. [Rate limits](rate-limiting.md) defines quotas and availability
policies; [Gameplay workers](../deployment/ranked-operations.md) covers
scheduler configuration and recovery.

## Hosting and delivery

Gitea Actions sends Web and API build artifacts to Azure and static
documentation to Cloudflare Pages. Browser artifacts contain public
configuration; game secrets are supplied through server configuration.
The [deployment diagram](diagrams/deployment.md) and
[CI guide](../testing/continuous-integration.md) describe these transfers.

Documentation search does not send queries to an external search service.

## External applications using Wits World

Server-side clients can use the [Developer API](developer-api.md) with a
revocable API key. Its published-event, card-catalogue, and progression
leaderboard responses are deliberately public projections.

These clients cannot use that key to access private player state or perform
gameplay mutations. Reusable developer credentials belong in the integrating
application's server configuration.

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5],
ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].
