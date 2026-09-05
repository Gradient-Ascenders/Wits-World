# Authentication Provider Comparison

:::info[Decision input]

This comparison records the evaluation that led to Auth0. The current accepted
authentication decision and implementation boundaries are maintained in
[ADR-005](decisions/ADR-005-auth0-authentication.md).

The provider comparison and 7 August 2026 pricing are historical decision
inputs. Later sections record the implemented identity contract and explicitly
label the evaluation-time gaps that have since been resolved.

:::

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

## Cost and free-tier evaluation

Provider pricing and limits were reviewed on 7 August 2026. These values are
time-sensitive and must be rechecked before production deployment or if the
project's expected user count changes.

| Provider | Free-tier or software cost                                                | Important constraints                                                                                                                                                                                                                      | Cost impact on Wits World                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth0    | Free plan at $0 for up to 25,000 external monthly active users            | The Free plan includes one tenant, three administrators/contributors, one day of log retention, and lower API rate limits. Paid self-service plans provide higher limits and additional environment and security features.                 | Suitable for development and the currently identified project scope. Development and production resource separation must be designed within the applicable plan limits; this comparison does not require separate tenants. |
| Clerk    | Hobby plan at $0 for up to 50,000 monthly retained users                  | Clerk measures monthly retained users rather than Auth0-style monthly active users. Paid Pro currently starts at $25/month when billed monthly. Some production security and customisation features require a paid plan.                   | The free user allowance is larger than Auth0's, but this does not outweigh the architectural preference for Auth0's explicit issuer-and-audience API boundary and the team's selected integration approach.                |
| Keycloak | No software licence fee; Keycloak is open source under Apache License 2.0 | There is no hosted Keycloak free tier supplied by the project itself. The team would be responsible for compute, persistent storage, database infrastructure, TLS, email delivery, backups, monitoring, updates, and security maintenance. | The licence cost is zero, but infrastructure and operational effort would be transferred to the team. This creates substantially more work than a hosted provider for the current project.                                 |

### Auth0 account-deletion constraints

Account deletion requires use of the Auth0 Management API from trusted backend
code.

Auth0's user-deletion endpoint permanently deletes a user and requires an
appropriately scoped Management API access token. The backend should use only
the minimum required permission for this operation.

On the Auth0 Free subscription, the Management API currently has a burst and
sustained limit of two requests per second. Account deletion is expected to be a
low-frequency user action, so this limit does not prevent the planned Wits World
account-deletion journey. The eventual implementation must nevertheless handle
rate limiting and temporary provider failures safely instead of assuming that a
Management API request always succeeds.

Management API credentials and access tokens must remain server-side. They must
not be included in the React application or exposed through a `VITE_`
environment variable.

The account-deletion implementation must also account for the fact that deleting
the local Wits World account state and deleting the Auth0 identity cannot form
one atomic transaction.

### Why Auth0 remains suitable

Auth0 remains the selected provider despite Clerk's larger current free user
allowance and Keycloak's zero software licence cost.

The current project has no requirement approaching Auth0's 25,000-user Free-plan
limit. Auth0 provides the required registration, sign-in, password-reset and
account-management capabilities while fitting the separate React SPA and
Fastify API architecture.

Its issuer-and-audience token model also provides a clear security boundary for
the hand-written API. The team avoids operating an identity server while
retaining local control over application roles and authorisation.

The primary cost-related limitation is the Auth0 Free plan's single-tenant
allowance. Development and production resource separation must therefore be
designed within the applicable plan limits. If the intended resource separation
cannot be achieved on the selected plan, the team must evaluate the then-current
Auth0 plan or reconsider the provider decision rather than silently exceeding
the selected free-tier assumptions.

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
| SPA application       | `Wits World`                        |
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
- Player and Author permissions;
- object ownership;
- event eligibility;
- rewards;
- card ownership;
- decks;
- matches;
- publication actions.

## External identity contract

Wits World identifies an externally authenticated principal using the pair
`(iss, sub)`, not the `sub` claim alone.

For local development against the underlying Auth0 tenant domain, the canonical
issuer is:

`https://dev-5artxfvpdennq8qm.us.auth0.com/`

The issuer must be compared exactly, including the `https://` scheme and trailing
slash. The subject is meaningful only within that issuer's namespace.

The API must obtain both values from a successfully validated access token. It
must not accept either value from request-body, query-string, or other
browser-controlled identity fields.

The local player schema persists both the authentication issuer and subject and
enforces uniqueness over the pair:

`UNIQUE (auth_issuer, auth_subject)`

For database accounts, the Auth0 username is the Basic Tier Player Name. A
Post-Login Action publishes the validated connection strategy and, for database
accounts, the username. The API mirrors that trusted username only after
resolving `(iss, sub)`. Google accounts contain the `google-oauth2` strategy but
no username claim; Wits World provisions the local identity with a null name and
requires one-time Player Name setup before gameplay. The case-insensitively
unique `players.player_name` namespace spans both providers. Player Name never
replaces the local UUID or external identity pair.

Auth0 Universal Login owns database Username, Email, and Password signup,
username-or-email login, and `Continue with Google`. Wits World owns only the
first-login Google Player Name setup and offers no rename endpoint. A local name
claimed by either provider blocks the other; a conflict fails safely without
linking, renaming, or rebinding accounts.

A future Auth0 tenant change creates a different issuer namespace. Wits World
must therefore perform an explicit identity migration or account-linking process
when moving existing users between issuers. It must not assume that matching
`sub` values from two different issuers refer to the same person.
New local users receive the `player` role by default. The browser cannot submit
or select its own role. Basic has no Administrator role; Author assignment and
revocation are out-of-band database or deployment operations.

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
- The API must read the connection strategy and database Player Name only from
  configured namespaced claims after token validation. Google setup may accept a
  proposed name only for the already resolved current player. Neither path may
  fall back to email, `name`, or `nickname`.
- An ID token must not be accepted as an API access token.
- Application roles must not be trusted directly from request bodies, query
  parameters, or browser state.
- Complete access tokens must not be written to logs or documentation.
- Development and production callback URLs must be configured explicitly.
- Wildcard callback and logout URLs should not be used.

## Password reset

Database-connection users reset passwords through Auth0 Universal Login's
hosted recovery flow. The protected Wits World account page opens Universal
Login and tells the player to choose Auth0 recovery; Auth0 collects the account
identifier, sends the email, and hosts replacement-password entry. Auth0 does
not report recovery completion to the SPA, so the return state describes the
handoff without claiming a password was changed.

Wits World will not receive, store, compare, or log user passwords.

Google-authenticated users manage their credentials through Google. Future
social or enterprise providers would likewise manage credentials through their
provider rather than through the Wits World API.

## Account deletion

The evaluation identified that account deletion must coordinate:

1. user reauthentication where appropriate;
2. disabling further application activity;
3. the project's data-retention and deletion rules;
4. deletion or anonymisation of local Wits World data;
5. deletion of the Auth0 user through trusted backend code;
6. safe handling of partial failure between the local database and Auth0;
7. audit evidence that does not retain unnecessary personal information.

The browser must not receive an Auth0 Management API credential.

`BASIC-12` subsequently confirmed the deletion and retention policy. Issue
`#160` implements the transactional persistence and retention backend; issue
`#161` implements the player profile/account and deletion UI. See
[ADR-005](decisions/ADR-005-auth0-authentication.md#account-deletion) and the
[retention design](../database/account-deletion-retention.md).

## Evaluation-time unresolved decisions and current status

### Wits single sign-on

Whether Wits institutional single sign-on will be available or required remains
unconfirmed.

The Basic implementation therefore supports the Auth0 database connection and
Google, but not enterprise or Wits SSO. Wits SSO integration must not be assumed
until the relevant stakeholder confirms:

- whether integration is permitted;
- which protocol and identity provider are available;
- which user groups may authenticate;
- what approval and testing process is required;
- what user information may be consumed.

### Production domains

This evaluation-time blocker is resolved. The canonical Web origin is
`https://witsworld.co.za`, the deployed API uses its Azure App Service origin,
and the production Auth0 issuer is `https://auth.witsworld.co.za/`. Public OIDC
discovery, deployed Web configuration, and exact API CORS were reviewed on
22 August 2026. A real signed-in storage/console/log smoke check remains an
operator-run release gate.

### Account-retention rules

This evaluation-time blocker was resolved by `BASIC-12` in the
[Basic-tier decision register](../requirements/basic-tier-decision-register.md).
That confirmed policy must not be confused with proof that every later
player-owned data cleanup or production retention operation has been completed.

## Implementation status

The original comparison did not itself implement authentication. The repository
now contains React sign-in/sign-out and protected routes, access-token
acquisition, Fastify token validation, local-player provisioning, local
Player/Author authorisation, Google Player Name setup, the server-side
account-deletion lifecycle, the complete player-facing account lifecycle, and
production custom-domain configuration.

Production currently uses the Auth0 SPA/application named `Wits World` with
both localhost and production callback, logout, and web-origin entries. Allowed
Origins (CORS) is empty. ADR-005 treats this as a temporary deviation: separate
development and production Auth0 resources remain outstanding remediation,
without requiring separate tenants specifically.

Password recovery, account deletion, and their protected player account page
are implemented. Remaining work includes real Auth0 recovery and deletion smoke
evidence, remediation of the shared SPA resource, and Wits SSO if it is approved
and available.

---

## Sources

- https://auth0.com/pricing?utm_source=chatgpt.com
- https://dev.auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy/rate-limit-configurations/free-public
- https://auth0.com/docs/api/management/v2/users/delete-users-by-id?utm_source=chatgpt.com
- https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens?utm_source=chatgpt.com
- https://clerk.com/articles/clerk-pricing-explained?utm_source=chatgpt.com
- https://clerk.com/changelog/2026-02-05-new-plans-more-value?utm_source=chatgpt.com
- https://github.com/keycloak/keycloak?utm_source=chatgpt.com

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking] and Codex[GPT-5].

The decision-status notice was added with assistance from Codex-CLI[GPT-5] and
Codex-CLI[gpt-5.6-sol medium].
