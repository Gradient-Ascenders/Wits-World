---
title: 'Security and server authority'
---

# Security and server authority

The API treats browser input as a requested action, including reported
location. It determines identity, permissions, and outcomes using validated
credentials, application rules, and stored state.

## Identity and permissions

Auth0 authenticates users. The API validates access-token signatures, issuer,
audience, expiry, and required identity claims using Auth0's signing keys.

The validated issuer and subject resolve to a local account. PostgreSQL stores
its lifecycle state and `player` or `author` role. Gameplay requires an active
account with a Player Name; Author operations require the Author role.
A role or player identifier supplied by the browser cannot grant access.

Services also check ownership and participation. A player can access their own
collection and decks, and only the relevant participants can access private
battle records. Author review includes separation between submission and
independent review. Sensitive operations such as account deletion require
fresh reauthentication.

Developer API keys use a separate authentication boundary for read-only public
resources. They do not grant player or Author permissions.
See [Developer API](developer-api.md) and
[Author access](../design/author-guide.md).

## Protecting state changes

Request schemas validate incoming values. Services then enforce object state
and domain rules before applying mutations.

| Boundary             | Protection                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| Browser → API        | Validate credentials and input; derive the actor on the server.                         |
| Service → database   | Parameterised SQL, transactions, constraints, and locks.                                |
| Concurrent mutations | Expected versions and submission receipts where the operation's contract requires them. |
| API → browser        | Explicit response schemas and views appropriate to the caller.                          |

Answer keys, reward selection, card ownership, legal actions, deadlines, and
match outcomes remain server-controlled. Hiding a button or showing a countdown
does not enforce a rule.

Live battle connections use short-lived, single-use tickets bound to the
caller and viewing role. Participant and spectator views differ; spectators
cannot submit actions. Reconnection restores saved state.
See [Live PvP](live-pvp-api-contract.md) for the transport contract.

## Credentials and request boundaries

Browser `VITE_*` values are public. They include the API URL, Auth0 SPA
identifiers, and public Mapbox token. Database URLs, Management API credentials,
Redis credentials, and private signing keys stay on the server.

Production Auth0 token caching uses memory. Browser-origin access is restricted
to the configured Web origin; this CORS policy is separate from authentication.
Authenticated request limits use server-resolved identities and operation-specific
policies, documented in [Rate limits](rate-limiting.md).

API logging redacts sensitive credentials and location fields. Responses use
safe error messages rather than exposing stack traces or private records.

## Location and privacy

A device reading is reported location, not proof of physical presence.
The API checks claim structure, freshness, accuracy, availability, and distance.
Movement checks use server timing and retained evidence; an unusable reading
produces a neutral retry outcome.

Online Explore watches location while the page is active, pauses when hidden,
and clears the watcher on exit. Its location indicator is transient. Eligible
active-use operations may store precise movement evidence with an explicit
expiry; the configured default is 24 hours. Cleanup removes expired evidence.

Offline attempts have a separate local IndexedDB record, including start and
finish location claims used during reconciliation. They follow the
[offline storage contract](offline-challenge-play.md).

Map rendering requests expose the viewed area to the map provider. The
application's location indicator does not upload a separate player-location
source. Provider exchanges are described in [Integrations](external-integrations.md).

Analytics use limited aggregates and defined reporting projections. Trust
review uses derived signals and safe summaries; a score prioritises human
review rather than automatically restricting gameplay.

See [Movement evidence](../database/movement-evidence.md),
[analytics privacy](../database/advanced-analytics.md), and
[moderation](../requirements/longitudinal-trust-policy.md) for those data boundaries.

## Account deletion

Deletion first makes the account unavailable for ordinary application
operations, then coordinates local cleanup with Auth0 identity removal.

Active personal data is removed according to the deletion contract. Some
match, transaction, or governance history may remain against a profile-free
historical actor. Deletion therefore does not mean erasing every historical
record.

The [account-deletion reference](../database/account-deletion-retention.md)
defines what is removed, retained, and retried.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5],
Codex[gpt-5.6-sol], Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], and
Codex[GPT-6].
