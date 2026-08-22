# Deployed authentication, CORS, and location privacy review

This report records the focused release-boundary review required by
[Gitea issue #45](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45).
It is not a penetration test.

## Review context

| Item                       | Reviewed value                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Review time                | 22 August 2026, 21:06 SAST                                                                    |
| Repository baseline        | `719cd4b`                                                                                     |
| Canonical Web origin       | `https://witsworld.co.za`                                                                     |
| Azure Web infrastructure   | `https://witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net`                |
| API origin                 | `https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net`                |
| Auth0 production issuer    | `https://auth.witsworld.co.za/`                                                               |
| Auth0 API audience         | `https://api.wits-world.invalid`                                                              |
| Evidence safety conditions | No real access token, account identifier, secret, accepted answer, or real location was used. |

The public deployment does not expose its exact Git commit. The repository
baseline identifies the code reviewed locally, not a fabricated deployment-SHA
claim.

## Outcome

No release-blocking defect was found in the public authentication, API CORS, or
safe-response boundary.

The canonical Web origin receives the exact API CORS header. The Azure Web
hostname is an infrastructure address rather than a second approved browser
origin, so the API correctly withholds `Access-Control-Allow-Origin` from it.
An unrelated origin is denied in the same way. The public Web host serves static
assets with a wildcard response header; that does not grant access to the
separate protected API and is outside the API CORS policy reviewed here.

Two production checks remain operator-run before #45 can be treated as fully
closed:

- inspect storage and console output during a real signed-in production session;
- inspect Azure API logs using the request identifiers from a controlled session.

This review did not request or expose credentials to manufacture that evidence.

## Sanitised deployed evidence

The observed response bodies contained generated request identifiers. They are
not reproduced here because the status and safe response shape are sufficient
evidence.

| Check                               | Observed result                                                                                                                 | Result |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Canonical Web root                  | `GET https://witsworld.co.za/` returned `200`.                                                                                  | Pass   |
| API health                          | `GET /health` returned `200` with the public service name and a generated request identifier.                                   | Pass   |
| Missing bearer token                | `GET /api/v1/events` returned `401`, `WWW-Authenticate: Bearer`, and the shared safe problem response.                          | Pass   |
| Synthetic invalid bearer token      | `GET /api/v1/events` returned the same safe `401`; the submitted synthetic value was not echoed.                                | Pass   |
| Private author data                 | `GET /api/v1/author/events` without authentication returned `401` and no author content.                                        | Pass   |
| Authentication before request body  | An unauthenticated eligibility request containing synthetic authority fields returned `401` before processing the body.         | Pass   |
| Allowed-origin preflight            | Canonical-origin `OPTIONS /api/v1/events` returned `204` and `Access-Control-Allow-Origin: https://witsworld.co.za`.            | Pass   |
| Allowed methods and headers         | The preflight allowed `GET`, `POST`, `PUT`, `DELETE`, `Authorization`, and `Content-Type`.                                      | Pass   |
| Azure infrastructure-origin request | The Azure Web hostname received no `Access-Control-Allow-Origin` header.                                                        | Pass   |
| Unapproved-origin request           | `https://unapproved.example.test` received no `Access-Control-Allow-Origin` header.                                             | Pass   |
| Wildcard API CORS                   | No tested API response used `Access-Control-Allow-Origin: *`.                                                                   | Pass   |
| Safe unknown-route response         | A synthetic missing route returned the shared `404` problem response without stack, host configuration, or implementation data. | Pass   |
| Production Auth0 discovery          | Public OIDC discovery returned issuer `https://auth.witsworld.co.za/` and a JWKS host on that same domain.                      | Pass   |
| Deployed public Web configuration   | The built application references the expected API host, custom Auth0 domain, and unchanged API audience.                        | Pass   |

## Repository boundary evidence

### Authentication and identity

- `apps/api/src/auth/authentication.ts` accepts only a bearer token and stores
  identity produced by the configured verifier.
- `apps/api/src/auth/access-token-verifier.ts` validates signature, issuer,
  audience, expiry, and required identity claims.
- `apps/api/src/players/player-identity.ts` resolves or provisions the local
  player using only the validated `(issuer, subject)` pair.
- `apps/api/tests/authentication.integration.test.ts` covers missing, malformed,
  expired, incorrectly signed, wrong-issuer, and wrong-audience tokens. It also
  proves browser body identity cannot replace the verified token identity.
- `GET /api/v1/auth/me` returns the local player ID, role, and lifecycle state;
  it does not return the Auth0 subject or token.

### CORS

- `apps/api/src/config/cors.ts` requires one exact HTTP or HTTPS origin and
  rejects wildcards, credentials, paths, queries, and fragments.
- `apps/api/src/app.ts` registers that exact origin, disables cookie
  credentials, and permits only the methods and headers required by the current
  browser client.
- `apps/api/tests/cors.integration.test.ts` covers the exact allowed origin,
  complete omission of the allow-origin header for an unapproved origin,
  wildcard absence, bearer preflight, and authentication on the actual request.

### Server authority and private response data

- Eligibility schemas reject unknown browser fields. The focused regression
  checks `eligible`, `insideRadius`, `playerId`, and `rewardEligible` rather than
  trusting a browser-owned outcome.
- The event route passes only the validated location claim to server-owned time,
  event, distance, radius, publication, and availability rules.
- Event integration tests prove accepted answers and private author notes are
  absent from player event responses.
- Challenge integration tests prove active attempts withhold accepted choices,
  explanations, correctness, score, and reward outcomes until server completion.
- Response schemas and error handlers return generated request identifiers and
  safe problem details without stack traces or configuration values.

### Tokens, logs, browser storage, and location

- Production Auth0 configuration uses the SDK's in-memory cache. Development
  and deterministic E2E modes deliberately use local storage and are not the
  production policy.
- The only application-owned production browser-storage value is the non-secret
  local player UUID used to detect account substitution. Access and refresh
  tokens are not application-managed storage values.
- A location claim is obtained only after a player action. Its precise
  coordinate is kept in an ephemeral React ref for map display, submitted for
  the requested server operation, and cleared on unmount.
- The focused Web regression test proves latitude, longitude, accuracy, and
  acquisition time are absent from local storage, session storage, and console
  output during eligibility checking.
- Fastify redacts authorization and reauthentication headers/body values. Normal
  authentication-failure logging records a generated request identifier rather
  than the submitted token.
- A tracked-file scan found no committed `.env`, key, certificate, JWT, or real
  database credential. The one database-URL pattern match was the explicit
  replacement placeholder in `apps/api/.env.example`.
- Exact location claims are not inserted by the event eligibility or challenge
  start services. Only authoritative results and normal game records are
  persisted.

## Reproduction commands

These commands contain no real token or location. Keep future evidence equally
sanitised.

```bash
curl -i https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/api/v1/events
```

```bash
curl -i -X OPTIONS \
  https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/api/v1/events \
  -H "Origin: https://witsworld.co.za" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization"
```

Repeat the preflight with a deliberately invalid origin and confirm the response
contains no `Access-Control-Allow-Origin` header. Do not place a real bearer
token in terminal history or attached evidence.

## Manual completion handoff

The reviewer or deployment operator should use a safe production test account
and record only pass/fail outcomes:

1. Sign in through `https://auth.witsworld.co.za/` from the canonical Web origin.
2. Confirm event discovery succeeds and `/api/v1/auth/me` returns the expected
   stable local player without exposing Auth0 identity fields.
3. In browser storage, confirm no access token, refresh token, latitude,
   longitude, accuracy, or acquisition timestamp is present. A single
   `wits-world.authenticated-player-id` UUID is expected.
4. Confirm the browser console contains no token, precise location, accepted
   answer, reward decision, or private author content.
5. Use a generated request identifier to inspect Azure API logs. Confirm the
   authorization value is redacted and no precise claim is logged.
6. Attach only sanitised outcomes to #45 and have `kevin-ebrahim` review the
   player-facing implications.

## Retention decision

The final location-retention policy remains unresolved. The current
implementation processes one-shot claims without creating location history.
This review records that behavior and does not silently convert it into a
permanent policy decision.

## AI declaration

This review was performed and documented with assistance from
Codex-CLI[GPT-5.6 Sol].
