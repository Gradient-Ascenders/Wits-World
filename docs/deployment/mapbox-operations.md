# Mapbox operations and deployment notes

This note applies to the `/explore` Mapbox GL JS integration in issue [#92](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/92). Mapbox is a confirmed team-selected technology within the project's implementation discretion; this does not claim a named client/lecturer approval. The note records the current public-browser configuration and operational work still required for production readiness.

## Browser token

Set this build-time variable in local ignored configuration and in the web
build's Gitea Variables:

```text
VITE_MAPBOX_ACCESS_TOKEN=pk.<public-token>
```

The token is intentionally public because Vite embeds `VITE_*` variables in the
browser bundle. Use a separate token per environment and restrict each token by
URL to the exact approved origins, including the local development origin
(`http://localhost:5173`) and the deployed HTTPS origin. Do not add broad
wildcards without Security Lead approval.

The browser token must be a `pk.` token with only the public read permissions
required by the map (`styles:read` and `fonts:read` for this integration). Never
use a secret token or a token with uploads, `styles:write`, account, or other
server-side scopes in the browser. Do not commit `.env`, a real token, or token
values in screenshots, logs, or test fixtures.

Mapbox's [token guidance](https://docs.mapbox.com/accounts/guides/tokens/)
documents public scopes and URL restrictions. Security Lead review is required
for the final token scopes and every deployed origin. Review the
[Mapbox privacy policy](https://www.mapbox.com/legal/privacy) with the project's
privacy boundary before production use.

## Content Security Policy

The deployment CSP must be tested against the actual Mapbox Standard style and
Mapbox GL JS worker. The minimum Mapbox-specific guidance to incorporate into
the site's existing policy is:

```text
script-src 'self' 'wasm-unsafe-eval';
worker-src blob:;
img-src 'self' data: blob:;
connect-src 'self' https://api.mapbox.com https://events.mapbox.com;
```

`api.mapbox.com` covers the style, tile, glyph, and related rendering requests
used by the public style. `events.mapbox.com` is retained for an explicitly
enabled Mapbox telemetry configuration; the current constructor sets
`performanceMetricsCollection: false`. The app does not add a geolocation,
search, directions, or geocoding request.

These directives are deployment guidance, not proof that a particular Azure
header is currently installed. Validate them in the deployed browser while
checking that no player coordinate, access token, or private API response is
included in a request or log. See [Mapbox security and testing guidance](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

## Map-load cost control

Pricing was checked against the [Mapbox pricing page](https://www.mapbox.com/pricing)
on 2026-08-13. Mapbox GL JS charges by map load: one map load occurs when a
`Map` is initialized, with unlimited vector/raster tile requests included for
that load. The current Web maps tiers are:

|   Monthly map loads | Current listed price |
| ------------------: | -------------------: |
|            0–50,000 |                 Free |
|      50,001–100,000 |         $5 per 1,000 |
|     100,001–200,000 |         $4 per 1,000 |
|   200,001–1,000,000 |         $3 per 1,000 |
| 1,000,001–5,000,000 |      $2.50 per 1,000 |

Illustrative map-load scenarios, assuming one lazy map initialization per
authenticated session:

| Active players | Sessions per month | Map loads |                              Listed map-load charge |
| -------------: | -----------------: | --------: | --------------------------------------------------: |
|            100 |                  4 |       400 |                             $0 within the free tier |
|            500 |                  8 |     4,000 |                             $0 within the free tier |
|          1,000 |                 10 |    10,000 |                             $0 within the free tier |
|          1,500 |                 40 |    60,000 | Approximately $50 for the 10,000 loads above 50,000 |

These are planning estimates, not usage evidence. The app preserves lazy
initialization, creates one map per `/explore` mount, and updates event markers
without creating another map. Do not add separately billed Mapbox APIs.

Mapbox provides account and token usage monitoring through its [Statistics](https://docs.mapbox.com/accounts/guides/statistics/)
tools. Mapbox does not provide a configurable hard monthly spending cap; use
usage monitoring, alerts/process controls, and token rotation instead. No
purchase or billing change is part of issue #92. Recheck pricing and account
terms before production launch.

## Privacy boundary

Mapbox receives only requests needed to render the public viewport and any
future licensed public campus layer. The browser's reported player coordinates
are sent only in the protected Wits Quest eligibility request. They must never
be put in a Mapbox source, marker, URL, request, log, storage entry, or
analytics event. Event publication, distance, eligibility, and database
authority remain in the Wits Quest API/PostgreSQL/PostGIS boundary.

## Operational readiness checklist

Before production use, obtain and record:

- API/Security Lead review of token scopes, URL restrictions, CSP, and privacy;
- deployment evidence from every approved web origin;
- sanitized map-load monitoring evidence and an operating owner for spend review;
- a recorded licensing/terms review, cost/usage owner, and decision that the
  configured Mapbox service is suitable for the intended release;
- a licensed, verified Wits campus dataset or a documented decision to run the
  basemap-only integration; and
- manual checks at 360px, 390px, 768px, and desktop for lighting, 3D depth,
  labels, paths, event markers, controls, focus, reset, reduced motion, and
  map/list failure parity.

This document was planned and edited with assistance from:

```text
Codex-CLI[GPT-5]
Codex[GPT-5]
```
