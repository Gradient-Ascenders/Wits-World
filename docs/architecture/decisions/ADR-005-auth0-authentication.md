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

Authentication must remain separate from application authorisation. Successfully
authenticating a user must not automatically grant author, administrator,
ownership, reward, or gameplay permissions.

## Decision

Wits World will use **Auth0** as its external authentication provider.

The React application will use Auth0 as a Single Page Web Application. The
Fastify API will be represented as a separate Auth0 API resource.

The intended browser flow is Authorization Code with Proof Key for Code Exchange
through Auth0 Universal Login.

The API will accept bearer access tokens intended for the Wits World API and
will validate them before deriving the authenticated identity.

## Development configuration

### Tenant

| Setting | Value                                 |
| ------- | ------------------------------------- |
| Domain  | `dev-5artxfvpdennq8qm.us.auth0.com`   |
| Purpose | Wits World development authentication |

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

The API will accept only access tokens that satisfy all required checks,
including:

- a valid signature from the configured Auth0 tenant;
- the expected issuer derived from
  `dev-5artxfvpdennq8qm.us.auth0.com`;
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

The validated Auth0 `sub` claim will be the stable external-identity key used to
find or create the corresponding Wits World user.

The database must enforce that one Auth0 subject maps to at most one local user.

Auth0 user metadata will not be treated as the authoritative source for gameplay
or application data.

## Role strategy

Auth0 will authenticate the user, while Wits World will authorise application
actions.

Initial Wits World roles are:

- `player`;
- `author`;
- `administrator`.

A newly provisioned local user receives the `player` role.

Application roles will be stored in PostgreSQL and checked by the Fastify API.
The browser cannot grant, change, or assert its own role.

Author and administrator access requires a protected role-assignment process.
Possession of a valid Auth0 token alone does not grant either role.

Auth0 RBAC, Auth0 roles, and custom namespaced role claims are deferred. This
decision may be revisited when local application roles no longer meet an
identified requirement.

## Registration and sign-in

The initial development authentication method will use the Auth0 database
connection.

Self-registration must remain enabled for the Wits World SPA.

The React application will redirect users to Auth0 Universal Login rather than
collecting passwords inside Wits World.

Social login, enterprise identity providers, and Wits single sign-on are not
included in the initial implementation.

## Password reset

Password reset will use Auth0's hosted reset flow for database-connection users.

The Wits World web application and API will not receive or process the user's
current or replacement password.

Email delivery and password-reset configuration must be tested before the
feature is considered complete.

## Account deletion

The Basic product must provide an account-deletion journey.

Deletion will require trusted backend coordination between:

- the local Wits World user and related data;
- the Auth0 user account;
- the project's retention and audit requirements.

Any Auth0 Management API credential required for deletion must be stored only in
trusted server-side secret configuration.

Because local database changes and Auth0 user deletion cannot form one atomic
database transaction, the implementation must support partial-failure recovery
or an explicit deletion state.

The exact sequencing, reauthentication requirement, retention rules, and audit
behaviour will be designed in the account-deletion issue.

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
```

Additional private server configuration must be introduced only when a later
feature requires it. Management credentials must never use a `VITE_` prefix.

Local real values belong in ignored `.env` files. Committed `.env.example` files
contain safe configuration or placeholders.

## Consequences

### Positive

- Wits World does not store or verify passwords.
- The browser can use a recognised SPA authentication flow.
- The API has an explicit issuer-and-audience trust boundary.
- React and Fastify have supported Auth0 integration paths.
- Registration and password reset can use hosted Auth0 interfaces.
- The team avoids operating an identity server.
- Authentication remains separate from local application authorisation.
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
5. Use the validated `sub` claim as the external identity.
6. Perform local role and object-level authorisation after authentication.
7. Do not trust roles or user IDs supplied by the browser.
8. Do not expose detailed token-validation failures to the client.
9. Do not log bearer tokens.
10. Use explicit callback, logout, and web-origin allowlists.
11. Keep development and production Auth0 resources separate.
12. Treat Wits SSO as unresolved until confirmed by the appropriate
    stakeholder.

## Follow-up work

This ADR enables, but does not implement:

- React Auth0 SDK integration;
- sign-in and registration journeys;
- sign-out;
- protected React routes;
- access-token acquisition;
- Fastify access-token validation;
- local-user provisioning;
- role and object-level authorisation;
- password-reset integration;
- account deletion;
- production Auth0 resources;
- deployment callback and origin configuration.

## Confirmation required

The team must still confirm:

- whether Wits SSO is available or required;
- production web and API domains;
- account-deletion retention requirements;
- whether email verification is required before gameplay;
- whether any institutional restrictions apply to Auth0;
- how author and administrator roles are initially assigned.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
