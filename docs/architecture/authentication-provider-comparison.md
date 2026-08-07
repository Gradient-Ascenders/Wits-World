# Authentication Provider Comparison

## Document status

- **Status:** Accepted
- **Decision date:** 7 August 2026
- **Selected provider:** Auth0
- **Related decision:** [ADR-005: Use Auth0 for authentication](decisions/ADR-005-auth0-authentication.md)

## Context

Wits Quest requires users to register, sign in, reset their passwords, and delete
their accounts. The project must rely on an established authentication provider
or library rather than implementing password authentication itself.

The selected provider must support the Wits World architecture:

- a React and Vite single-page application;
- a separately deployed Fastify HTTP API;
- access-token validation by the API;
- development and production configuration;
- password reset;
- account deletion;
- safe handling of browser-visible configuration;
- future support for protected player and author operations.

Authentication and application authorisation are separate concerns. The provider
will establish a user's external identity. Wits World will retain authority over
application roles, ownership, event eligibility, rewards, decks, matches, and
authoring operations.

## Evaluation criteria

The providers were compared using the following criteria:

1. React single-page application support.
2. Fastify or standards-based API integration.
3. Registration and sign-in support.
4. Password-reset support.
5. Account-deletion support.
6. OAuth 2.0 and OpenID Connect compatibility.
7. Suitability for a public browser application.
8. Secret-management requirements.
9. Operational and hosting burden.
10. Risk of provider-specific coupling.
11. Suitability for a four-member semester project.

## Provider comparison

| Criterion                        | Auth0                                | Clerk                         | Keycloak                                               |
| -------------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| React support                    | Official React SDK                   | Official React SDK            | JavaScript OIDC adapter                                |
| Fastify support                  | Official Fastify API SDK             | Official Fastify SDK          | Standards-based JWT/OIDC integration required          |
| Hosted authentication            | Yes                                  | Yes                           | Normally self-hosted                                   |
| Universal or hosted login        | Yes                                  | Yes                           | Yes, through hosted Keycloak pages                     |
| Registration                     | Supported                            | Supported                     | Supported when enabled                                 |
| Password reset                   | Supported                            | Supported                     | Supported when email and realm settings are configured |
| Account deletion                 | Management API and dashboard support | Backend API support           | Account Console and Admin API support                  |
| SPA security flow                | Authorization Code with PKCE         | Provider-managed browser flow | Authorization Code with PKCE through the adapter       |
| Password storage managed by team | No                                   | No                            | No, but the team operates the identity server          |
| Operational burden               | Low                                  | Low                           | High                                                   |
| Provider coupling                | Moderate                             | Higher                        | Moderate                                               |
| Fit for current architecture     | Strong                               | Strong                        | Technically strong but operationally expensive         |

## Auth0

### Advantages

- Provides an official React SDK for single-page applications.
- Uses Universal Login and Authorization Code with PKCE.
- Provides an official Fastify API SDK for bearer-token validation.
- Separates the public SPA client from the protected API resource.
- Uses an API identifier as the access-token audience.
- Supports password-reset emails and hosted reset pages.
- Supports user deletion through the Auth0 Management API.
- Avoids storing or processing user passwords inside Wits World.
- Requires only public domain, client-ID, and audience values in the browser.
- Has a lower operational burden than running an identity server.

### Disadvantages and risks

- The application depends on an external provider for authentication.
- Some administration and account-management operations require the Auth0
  Management API.
- Management API credentials must be stored only in trusted server-side
  configuration.
- Auth0 service or configuration outages can prevent sign-in.
- Provider limits or pricing may change.
- Account deletion spans both Auth0 and the Wits World database and therefore
  cannot be treated as one ordinary database transaction.
- Incorrect callback, origin, issuer, or audience configuration can break
  authentication or weaken token validation.
- Auth0-specific SDK usage creates some migration cost.

## Clerk

### Advantages

- Provides official React and Fastify SDKs.
- Provides pre-built sign-in, registration, password-reset, and account
  management interfaces.
- Reduces the amount of authentication user-interface code required.
- Provides backend user-management operations.

### Disadvantages and risks

- Encourages greater dependence on Clerk-specific components and session
  abstractions.
- Uses a provider-specific backend integration rather than the project's
  preferred explicit issuer-and-audience API model.
- Migrating pre-built authentication interfaces later may require significant
  user-interface changes.
- The team would still need a separate local authorisation and application-user
  model.

## Keycloak

### Advantages

- Open-source and standards-based.
- Supports OAuth 2.0 and OpenID Connect.
- Provides hosted login, registration, password reset, and account-management
  capabilities.
- Gives the team greater control over identity configuration and data.
- Reduces dependence on a commercial hosted identity provider.

### Disadvantages and risks

- Requires deployment, database persistence, upgrades, backups, monitoring, and
  security maintenance.
- Requires email-server configuration for verification and password reset.
- Introduces additional infrastructure that is not part of the Wits Quest core
  product.
- Has no equivalent benefit for the current project that justifies the added
  operational burden.
- Identity-server maintenance would consume time needed for the complete Basic
  player journey.

## Decision

Wits World will use **Auth0** as its authentication provider.

The selected development configuration is:

| Setting               | Value                               |
| --------------------- | ----------------------------------- |
| Tenant domain         | `dev-5artxfvpdennq8qm.us.auth0.com` |
| SPA application       | `Wits World Web - Development`      |
| SPA application type  | Single Page Web Application         |
| API audience          | `https://api.wits-world.invalid`    |
| API signing algorithm | RS256                               |
| Local web origin      | `http://localhost:5173`             |

Auth0 was selected because it provides:

- a suitable standards-based SPA authentication flow;
- direct support for the React and Fastify architecture;
- hosted registration, sign-in, and password-reset capabilities;
- API access-token validation using issuer and audience;
- user deletion through a trusted management interface;
- lower operational risk than self-hosting Keycloak;
- less dependence on provider-specific UI components than the preferred Clerk
  approach.

## Authentication and authorisation boundary

Auth0 will be authoritative for:

- authentication;
- external identity;
- credential handling;
- login sessions;
- password reset;
- token issuance;
- Auth0 account deletion.

Wits World will be authoritative for:

- local user records;
- application roles;
- player, author, and administrator permissions;
- object ownership;
- event eligibility;
- rewards;
- card ownership;
- decks;
- matches;
- publication actions.

The validated Auth0 `sub` claim will identify the external account. The database
will contain at most one local user for each Auth0 subject.

New local users will receive the `player` role by default. The browser will not
be allowed to submit or select its own role. Author and administrator roles will
be granted through protected application processes.

Auth0 RBAC and custom role claims are not part of the initial implementation.
They may be reconsidered only when a later requirement demonstrates that local
application roles are insufficient.

## Security constraints

- No client secret will be included in the React application.
- No Management API secret or token will be committed to the repository.
- Browser-visible `VITE_` variables must contain public configuration only.
- The API must validate token signature, issuer, audience, expiry, and expected
  algorithm.
- The API must derive identity from the validated token rather than a
  browser-supplied user identifier.
- An ID token must not be accepted as an API access token.
- Application roles must not be trusted directly from request bodies, query
  parameters, or browser state.
- Complete access tokens must not be written to logs or documentation.
- Development and production callback URLs must be configured explicitly.
- Wildcard callback and logout URLs should not be used.

## Password reset

Database-connection users will reset passwords through Auth0 Universal Login or
the Auth0 password-reset flow.

Wits World will not receive, store, compare, or log user passwords.

Users authenticated through a future social or enterprise provider would reset
their credentials through that provider rather than through the Wits World API.

## Account deletion

A later account-deletion feature must coordinate:

1. user reauthentication where appropriate;
2. disabling further application activity;
3. the project's data-retention and deletion rules;
4. deletion or anonymisation of local Wits World data;
5. deletion of the Auth0 user through trusted backend code;
6. safe handling of partial failure between the local database and Auth0;
7. audit evidence that does not retain unnecessary personal information.

The browser must not receive an Auth0 Management API credential.

The exact deletion and retention workflow requires a separate design before the
account-deletion endpoint is implemented.

## Unresolved decisions

### Wits single sign-on

Whether Wits institutional single sign-on will be available or required remains
unconfirmed.

The Basic implementation will therefore use the Auth0 database connection.
Enterprise or Wits SSO integration must not be assumed until the relevant
stakeholder confirms:

- whether integration is permitted;
- which protocol and identity provider are available;
- which user groups may authenticate;
- what approval and testing process is required;
- what user information may be consumed.

### Production domains

Production callback, logout, web-origin, and API values cannot be configured
until the web and API deployment domains are confirmed.

### Account-retention rules

The team still needs confirmation about which gameplay, audit, and authoring
records must be deleted, anonymised, or retained when an account is deleted.

## Implementation boundaries

This decision does not yet implement:

- React login or logout components;
- route protection;
- access-token acquisition;
- Fastify access-token validation;
- local-user provisioning;
- application role middleware;
- password-reset user-interface integration;
- account deletion;
- production Auth0 configuration;
- Wits SSO.

Those changes belong to their corresponding implementation issues.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
