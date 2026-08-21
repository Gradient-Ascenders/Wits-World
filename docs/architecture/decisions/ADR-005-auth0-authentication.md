# ADR-005: Use Auth0 for authentication

- **Status:** Accepted
- **Date:** 7 August 2026
- **Decision owners:** Wits World team
- **Related document:** [Authentication Provider Comparison](../authentication-provider-comparison.md)

## Context

Wits Quest requires registration, sign-in, password reset, and account deletion.

The Wits World architecture separates the React browser application from the
Fastify HTTP API. The browser must authenticate a user and obtain an access
token, while the API must independently validate that token before performing
protected operations.

The team must not implement its own password-authentication system. It also does
not want to operate a dedicated identity server during the Basic delivery
period.

Authentication must remain separate from application authorisation.
Successfully authenticating a user must not automatically grant author,
ownership, reward, or gameplay permissions.

## Decision

Wits World will use **Auth0** as its external authentication provider.

The React application will use Auth0 as a Single Page Web Application. The
Fastify API will be represented as a separate Auth0 API resource.

The intended browser flow is Authorization Code with Proof Key for Code Exchange
through Auth0 Universal Login.

The API will accept bearer access tokens intended for the Wits World API and
will validate them before deriving the authenticated identity.

## Session persistence

Production uses an Auth0 custom domain under the same product/root domain as
the deployed Wits World application, the SDK's in-memory cache, rotating refresh
tokens during the page lifetime, and the SDK's session fallback after a reload.
Production access and refresh tokens are not persisted in browser storage. The
same-site custom domain lets fallback restoration use the Auth0 session without
depending on third-party tenant-domain cookies.

Local development and Playwright E2E use rotating refresh tokens with
`cacheLocation="localstorage"` and `useRefreshTokens=true`. This is a bounded
development fallback because localhost cannot share a product root domain with
Auth0. Its greater exposure to browser-script compromise is not accepted for
production. The real-Auth0 E2E suite therefore verifies the local-storage
policy, not production's memory-cache/custom-domain restoration; that mechanism
requires a post-cutover production-mode browser smoke test.

Refreshing or directly revisiting a protected route must restore the same local
Wits World player or fail safely without protected player data. The browser
therefore waits for `GET /api/v1/auth/me` and compares its stable local player
ID with the non-secret player binding from the preceding browser session before
mounting a protected route. Silent restoration preserves that binding and fails
closed on a mismatch. Only an explicit user account-switch action clears it and
starts a fresh interactive Auth0 login.

Tokens issued through a custom domain have that domain in `iss`. Before the API
switches to the custom domain, the bounded issuer-remap operation must update
existing `players.auth_issuer` values while preserving each player ID and the
exact `auth_subject`. The API continues to validate one exact configured issuer
and the existing audience; it does not accept the old and new issuers together.

## Development configuration

### Tenant

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Domain           | `dev-5artxfvpdennq8qm.us.auth0.com`          |
| Canonical issuer | `https://dev-5artxfvpdennq8qm.us.auth0.com/` |
| Purpose          | Wits World development authentication        |

The domain is configuration rather than a secret. Tenant administration
credentials, passwords, tokens, and Management API credentials remain private.

### Single-page application

| Setting              | Value                          |
| -------------------- | ------------------------------ |
| Name                 | `Wits World Web - Development` |
| Application type     | Single Page Web Application    |
| Allowed callback URL | `http://localhost:5173`        |
| Allowed logout URL   | `http://localhost:5173`        |
| Allowed web origin   | `http://localhost:5173`        |

The SPA Client ID is public application configuration. The application must not
use or expose a client secret.

### API resource

| Setting                 | Value                            |
| ----------------------- | -------------------------------- |
| Name                    | `Wits Quest API - Development`   |
| Identifier and audience | `https://api.wits-world.invalid` |
| Signing algorithm       | RS256                            |

The API identifier is a logical audience value. It is not an instruction to
send HTTP requests to that address.

## Token contract

The canonical development issuer is:

`https://dev-5artxfvpdennq8qm.us.auth0.com/`

Issuer validation is an exact comparison. The scheme and trailing slash are
part of the issuer identifier and must not be removed or normalised away.

The API will accept only access tokens that satisfy all required checks,
including:

- a valid signature from the configured Auth0 tenant;
- an `iss` claim exactly equal to
  `https://dev-5artxfvpdennq8qm.us.auth0.com/`;
- the audience `https://api.wits-world.invalid`;
- a supported signing algorithm;
- an unexpired validity period;
- valid not-before timing where present;
- the required token structure and claims.

The API must not:

- accept an ID token as an API access token;
- trust a token without verifying its signature;
- disable issuer or audience validation;
- derive identity from a request-body user ID;
- log complete access tokens;
- expose token-validation internals through error responses.

The precise Fastify validation implementation will be recorded in the
API-token-validation issue.

## Identity mapping

Auth0 user metadata will not be treated as the authoritative source for gameplay
or application data.

## External identity contract

Wits World identifies an externally authenticated principal using the pair
`(iss, sub)`, not the `sub` claim alone.

For the current development tenant, the canonical issuer is:

`https://dev-5artxfvpdennq8qm.us.auth0.com/`

The issuer must be compared exactly, including the `https://` scheme and trailing
slash. The subject is meaningful only within that issuer's namespace.

The API must obtain both values from a successfully validated access token. It
must not accept either value from request-body, query-string, or other
browser-controlled identity fields.

The local `players` table persists both the authentication issuer and subject
and enforces uniqueness over the pair:

`UNIQUE (auth_issuer, auth_subject)`

New authenticated identities are provisioned as local Player records by the
Fastify API. Browser-controlled identity fields are never used for this mapping.

A future Auth0 tenant change creates a different issuer namespace. Wits World
must therefore perform an explicit identity migration or account-linking process
when moving existing users between issuers. It must not assume that matching
`sub` values from two different issuers refer to the same person.

## Role strategy

Auth0 authenticates the user, while Wits World authorises application actions.

The Basic tier has exactly two local application roles:

- `player`;
- `author`.

A newly provisioned local user receives the `player` role.

Application roles are stored in PostgreSQL and checked by the Fastify API.
The browser cannot grant, change, or assert its own role.

Author assignment and revocation are out-of-band operational actions through
the database or deployment process. Basic does not expose a browser or API
operation for changing roles.

There is no separate Administrator role in the Basic tier. Administrator
permissions and in-application role management are deferred beyond Basic.

Auth0 RBAC, Auth0 roles, and custom namespaced role claims remain deferred.

## Registration and sign-in

The initial development authentication method will use the Auth0 database
connection.

Self-registration must remain enabled for the Wits World SPA.

The React application will redirect users to Auth0 Universal Login rather than
collecting passwords inside Wits World.

Social login, enterprise identity providers, and Wits single sign-on are not
included in the initial implementation.

## Email verification

Auth0 authentication is required for normal gameplay and protected Wits World
application features. Email verification is not an additional access gate.

An authenticated principal whose email is unverified must not be treated as
unauthenticated. Wits World does not use the Auth0 `email_verified` claim as an
application-authorisation prerequisite. Access continues to depend on a valid
Wits World API access token, the exact `(iss, sub)` identity, an active local
player lifecycle, and any required local role or object permission.

Email verification does not prove that a person has a Wits institutional
identity, and Wits World must not present it that way. A future Wits single
sign-on or institutional eligibility policy would require its own approved
identity contract.

Auth0 may continue to expose and maintain email-verification state and send
verification email. This application policy neither requires disabling those
provider features nor authorises an Auth0 tenant-configuration change.

## Password reset

Password reset will use Auth0's hosted reset flow for database-connection users.

The Wits World web application and API will not receive or process the user's
current or replacement password.

Email delivery and password-reset configuration must be tested before the
feature is considered complete.

## Account deletion

`BASIC-12` defines the Basic-tier deletion and retention policy.

Permanent deletion requires:

- an authenticated API access token;
- recent Auth0 authentication no older than five minutes;
- a separately validated Auth0 ID token carrying the reauthentication
  `auth_time`;
- an exact `(iss, sub)` match between the API identity and reauthentication
  proof; and
- explicit permanent-deletion confirmation.

The ID token is used only as secondary reauthentication evidence. It is never
accepted as the API bearer access token.

Once a deletion request is accepted, the local player is immediately moved to
`deletion_pending`, which prevents further authenticated application access.

A trusted server-side Auth0 Management API Machine-to-Machine application,
granted only the `delete:users` permission, deletes the external Auth0 account.
Management API credentials are server-only secrets.

Successful local cleanup anonymises the local player into a deleted tombstone
by removing the Auth0 issuer, subject, and application role. The deletion
request is then unlinked from that tombstone.

Because Auth0 deletion and PostgreSQL cleanup cannot form one atomic
transaction, incomplete deletions are persisted as `pending` or
`retry_pending`. A database-backed retry processor runs on API startup and at a
configured interval. Failures produce operational alerts containing only the
random deletion identifier and a safe failure category.

The retained deletion audit contains only:

- a random deletion ID;
- request timestamp;
- completion timestamp;
- status; and
- an applicable safe failure reason.

Completed deletion audits are retained for twelve months and then removed.

As later Basic data models for cards, decks, balances, starter selections,
challenge answers, authored content, and gameplay history are introduced, their
deletion or retention handling must follow `BASIC-12` before the complete Basic
release is declared compliant.

The player-facing registration, password-reset, and permanent-deletion journey
remains separate Product and Player Experience frontend work and must be linked
back to the account-lifecycle issue before that user-facing acceptance work is
considered complete.

## Environment configuration

The browser application will use:

```text
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
```

Every `VITE_` value is included in the browser bundle and must therefore contain
public configuration only.

The API will use:

```text
AUTH0_DOMAIN
AUTH0_AUDIENCE
AUTH0_TENANT_DOMAIN
AUTH0_SPA_CLIENT_ID
AUTH0_MANAGEMENT_CLIENT_ID
AUTH0_MANAGEMENT_CLIENT_SECRET
```

`AUTH0_SPA_CLIENT_ID` is public application identity configuration and is used
by the API to validate the audience of reauthentication ID tokens.

`AUTH0_TENANT_DOMAIN` retains the default `*.auth0.com` hostname when
`AUTH0_DOMAIN` is a custom domain. Auth0 token and Management API requests use
the custom domain, while the Management API audience remains the default tenant
domain identifier.

`AUTH0_MANAGEMENT_CLIENT_ID` and `AUTH0_MANAGEMENT_CLIENT_SECRET` belong only to
the trusted API environment. The Management application is granted only the
`delete:users` permission.

The account-deletion retry scheduler additionally uses:

```text
ACCOUNT_DELETION_RETRY_INTERVAL_MS
```

The committed development default is one minute. This is an operational retry
cadence, not the recent-authentication security threshold.

Management credentials must never use a `VITE_` prefix.

Local real values belong in ignored `.env` files. Committed `.env.example` files
contain safe configuration or placeholders.

## Consequences

### Positive

- Wits World does not store or verify passwords.
- The browser can use a recognised SPA authentication flow.
- The API has an explicit issuer-and-audience trust boundary.
- React and Fastify have supported Auth0 integration paths.
- Registration and password reset can use hosted Auth0 interfaces.
- Authenticated players are not incorrectly denied application access because
  their email is unverified.
- The team avoids operating an identity server.
- Authentication remains separate from local application authorisation.
- Local Player and Author permissions remain under server-side application
  control.
- Permanent deletion uses explicit reauthentication and trusted server-side
  Auth0 administration.
- Partial deletion failures can recover automatically from durable database
  state.
- A later production tenant can use the same architectural contract with
  different configuration.

### Negative

- Authentication availability depends on Auth0.
- The system acquires some Auth0-specific integration code.
- Account deletion requires secure Management API integration.
- Development and production configuration must be managed carefully.
- Auth0 configuration changes can break authentication without repository code
  changing.
- Local and external user deletion cannot be performed as one atomic
  transaction.
- Permanent deletion requires additional lifecycle, retry, and audit
  infrastructure.
- Provider pricing and service limits must be reviewed before production
  release.

## Alternatives considered

### Clerk

Clerk provides good React and Fastify support and strong pre-built account
interfaces. It was not selected because the team prefers an explicit
OIDC-style issuer-and-audience API boundary and less dependence on
provider-specific user-interface components.

### Keycloak

Keycloak provides strong standards support and greater infrastructure control.
It was not selected because self-hosting, persistence, upgrades, email
configuration, monitoring, and security maintenance would create excessive
operational work for the current team and delivery timeline.

### Custom authentication

Custom password authentication was rejected because it conflicts with the
project requirement to use established authentication practices and would
introduce unacceptable credential, recovery, session, and account-security
risk.

## Security rules resulting from this decision

1. Never commit Auth0 client secrets, Management API secrets, or complete
   tokens.
2. Never place a private credential in a `VITE_` variable.
3. Validate API tokens on the server.
4. Validate signature, issuer, audience, algorithm, and time-based claims.
5. Use the validated `(iss, sub)` pair as the canonical external identity.
6. Perform local role and object-level authorisation after authentication.
7. Do not trust roles or user IDs supplied by the browser.
8. Do not expose detailed token-validation failures to the client.
9. Do not log bearer tokens or reauthentication tokens.
10. Use explicit callback, logout, and web-origin allowlists.
11. Keep development and production Auth0 resources separate.
12. Use Auth0 ID tokens only as separately validated reauthentication evidence,
    never as API bearer access tokens.
13. Keep Auth0 Management API credentials in trusted server-side configuration
    and grant only the permissions required by the application.
14. Keep deletion failures retryable while the affected account remains locked.
15. Treat Wits SSO as unresolved until confirmed by the appropriate
    stakeholder.

## Follow-up work

The following existing Gitea issues implement this decision:

- [Gitea #8 — Integrate player sign-in and protected front-end routes](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/8)
  Implements the React Auth0 integration, sign-in, sign-out, protected routes,
  authentication states, and safe API access-token retrieval.

- [Gitea #13 — Validate authentication tokens on protected API routes](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/13)
  Implements Fastify bearer-token validation, exact issuer validation, audience
  validation, signature and expiry validation, authenticated request context,
  safe authentication errors, and the OpenAPI security scheme.

Gitea #63 implements the local identity, Basic role, account lifecycle, recent
reauthentication, trusted Auth0 deletion, anonymisation, and automatic retry
backend foundations.

Additional work still covers:

- player-facing registration, password-reset, and deletion controls;
- extending deletion cleanup as later Basic player-owned data models are added;
- production Auth0 configuration;
- Wits institutional SSO if approved and available.

## Confirmation required

The Basic-tier items below are tracked with named owners and evidence in the
[Basic-tier decision register](../../requirements/basic-tier-decision-register.md).
The team must still confirm:

- whether Wits SSO is available or required;
- production web and API domains;
- whether any institutional restrictions apply to Auth0.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-5].
