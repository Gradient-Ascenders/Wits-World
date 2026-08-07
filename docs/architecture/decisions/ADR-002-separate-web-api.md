# ADR-002: Keep the Web Application and API Separate

## Status

Accepted

## Date

2026-08-06

## Owners and reviewers

- **Owner:** Member 2 — API and Security Lead
- **Reviewer:** Member 3 — Data and Infrastructure Lead

## Context

The course requires a non-monolithic front end and back end and a hand-written
HTTP API.

Wits Quest also needs a clear trust boundary between:

- the browser;
- authenticated API operations;
- protected game rules; and
- persistent data.

The browser cannot be trusted to determine identity, location eligibility,
rewards, card ownership, or battle results.

## Decision

Implement the browser application and API as separate applications:

- `apps/web` contains the React and Vite browser application;
- `apps/api` contains the Fastify hand-written HTTP API.

The applications communicate using HTTPS and JSON through versioned routes
under `/api/v1`.

The web application may submit user actions and untrusted claims.

The API validates those requests and makes all protected decisions.

The API connects to the database. The web application does not connect directly
to PostgreSQL/PostGIS.

## Reasons

This separation:

- satisfies the non-monolithic architecture requirement;
- ensures the team designs and implements the API;
- creates a clear security boundary;
- prevents database credentials from reaching the browser;
- allows the API to validate authentication tokens;
- keeps protected game rules on the server;
- allows independent web and API testing;
- permits independent deployment; and
- allows other approved clients to use the API later.

## Consequences

### Benefits

- Browser input is treated as untrusted.
- Protected rules have one authoritative implementation.
- API contracts can be documented with OpenAPI.
- The applications can scale or deploy independently.
- Authentication and authorisation can be tested at the API boundary.
- Database access remains inside a trusted server environment.

### Costs and risks

- Local development requires both applications to run.
- Cross-origin requests require controlled CORS configuration.
- API contracts must be maintained carefully.
- Authentication configuration must align across the browser, provider, and API.
- Network and deployment failures require explicit user-facing error handling.
- Shared TypeScript types cannot replace runtime request validation.

## Alternatives considered

### Direct browser access to a backend-as-a-service database

This would reduce handwritten backend work but would not satisfy the required
hand-written API approach and would weaken the intended trust boundary.

### Combined full-stack framework deployment

This could reduce deployment complexity but risks coupling the web and API into
one application and obscuring their independent boundaries.

### Client-side game and eligibility rules

This would be simpler to demonstrate initially but would allow protected values
to be manipulated by the browser.

## Related work

- Document the initial architecture and delivery plan
- Scaffold the mobile-first React application
- Scaffold the Fastify API with health and OpenAPI support
- Integrate player sign-in and protected front-end routes
- Validate authentication tokens on protected API routes
- Expose event discovery and eligibility API endpoints

## Browser-to-API boundary

For the Sprint 1 vertical slice, independently served web and API applications
will communicate using a controlled API-owned CORS policy.

The API receives one exact allowed browser origin from the environment:

```text
CORS_ALLOWED_ORIGIN
```

For local development the approved value is:

```text
http://localhost:5173
```

The CORS policy permits the browser methods and headers currently required by
the hand-written API, including bearer `Authorization` requests.

Wildcard production access is prohibited.

A same-origin gateway remains a possible future deployment architecture, but it
is not required for the Sprint 1 vertical slice. Introducing one would add
deployment and routing infrastructure without removing the need for explicit
trust-boundary configuration.

CORS does not replace authentication or authorisation. Protected API routes
continue to validate Auth0 bearer access tokens independently.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
