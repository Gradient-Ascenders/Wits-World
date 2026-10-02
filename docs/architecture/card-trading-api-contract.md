---
title: 'Card trading API contract'
---

# Card trading API contract

## Scope and authority

Issue `#272` exposes the private, bilateral card-trading aggregate persisted by
migration `0055_persist_versioned_card_trades.sql`. The browser proposes trade
intent; it never controls player identity, ownership, eligibility, offer
version, rarity totals, acceptance state, or settlement. The approved
[card-trading policy](../requirements/card-trading-policy.md) and
[persistence design](../database/card-trading-persistence.md) remain the
server-side source of truth.

The API does not provide a marketplace or another player's collection. A new
trade targets one exact normalized Player Name. Missing, self, deleted,
deleting, or otherwise unavailable targets share the same safe unavailable
response.

The entry form checks one exact name on submission through an authenticated,
rate-limited recipient lookup. The response includes only the normalized Player
Name and request ID. It does not reserve cards or promise trading eligibility;
creating the offer rechecks the recipient and all trading rules. The lookup
uses the existing partial unique `lower(player_name)` index.

## Authenticated operations

All routes are beneath `/api/v1`, require bearer authentication, resolve the
active local player on the server, and use the ordinary authenticated-player
rate limit.

| Method | Route                                        | Purpose                                                          |
| ------ | -------------------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/cards/trading-catalogue`                   | List active requestable definitions without ownership            |
| `GET`  | `/trades/recipient?playerName=…`             | Check one exact active recipient name without exposing inventory |
| `POST` | `/trades`                                    | Create a directed offer using a Player Name                      |
| `GET`  | `/trades`                                    | List only trades involving the current player                    |
| `POST` | `/trades/selection-preview`                  | Preview the current player's exact-copy eligibility              |
| `GET`  | `/trades/:tradeId`                           | Read one participant-only trade                                  |
| `PUT`  | `/trades/:tradeId`                           | Create the next immutable offer version                          |
| `POST` | `/trades/:tradeId/imbalance-acknowledgement` | Acknowledge the current version's rarity warning                 |
| `POST` | `/trades/:tradeId/accept`                    | Accept one exact version after recent authentication             |
| `POST` | `/trades/:tradeId/decline`                   | Recipient-only terminal decline                                  |
| `POST` | `/trades/:tradeId/cancel`                    | Sender-only terminal cancellation                                |

Create and revision bodies contain only the current player's exact owned-copy
identifiers plus requested card definitions and quantities. Acceptance and
imbalance acknowledgement include `expectedVersion`; a stale version receives a
conflict instead of silently applying consent to a newer offer.

The list operation is bounded to at most 50 rows per page, newest first, with
optional sent/received and status filters. It cannot query unrelated players.

The trading catalogue returns only active, published, player-safe definition
metadata: identity, category, affinity, rarity, stats, description, artwork,
moves, and effects. It never includes ownership or another player's collection.
The selection preview returns the current player's owned copies with a
server-owned availability reason, validates requested definitions and
collection minimums, and calculates rarity totals and the imbalance warning. It
does not reserve copies; an edit preview can also materialise an authoritative
deadline expiry. Create and revision commands repeat the authoritative checks
while persisting the next trade version.

## Durable idempotency

Every mutation accepts a caller-generated UUID `submissionId`. Migration
`0056_add_card_trade_submission_receipts.sql` stores a private receipt keyed by
actor, operation, and submission ID together with a SHA-256 digest of the
canonical command intent and the affected trade.

The service takes a transaction-scoped advisory lock for that idempotency key.
An identical retry returns the current canonical trade without repeating the
transition. Reusing the same submission ID with different intent returns
`TRADE_IDEMPOTENCY_CONFLICT`. The recent-authentication token is never included
in the digest or stored in a receipt.

Temporary command receipts are deleted when a purged non-completed trade is
removed. Receipts for completed trades remain with the retained trade
provenance.

## Acceptance and recent authentication

Every acceptance requires the same Auth0 ID-token recent-authentication proof
used by permanent account deletion. The proof must be valid for the configured
Auth0 issuer/client, have an `auth_time` no more than five minutes old, and have
exactly the same issuer and subject as the bearer access-token identity.

The proof is checked before the trading service is invoked, including on an
acceptance retry. Invalid, expired, old, or identity-mismatched proof returns
`401 RECENT_AUTHENTICATION_REQUIRED`. The token and its raw claims are never
stored and are redacted by API logging.

## Player-safe response boundary

Detailed trade reads are relative to the authenticated participant. They expose
sender/recipient role, current counterparty Player Name, current immutable
version, lifecycle timestamps, selected exact cards, requested definitions,
server-computed rarity points, acceptance and acknowledgement state, and a
minimal completion timestamp when settled.

Responses deliberately omit internal player UUIDs, raw terminal/invalidation
reasons, trust evidence, settlement movement identifiers, source provenance,
Auth0 data, and the counterparty's wider collection. Selected cards include
only player-safe catalogue metadata needed by the downstream trading UI. If an
account has been deleted, history displays `Deleted player` rather than an
old Player Name snapshot.

A caller who is not a participant receives the same neutral not-found response
as a missing trade. Copy/protection failures are also mapped to safe language so
one participant cannot infer another player's saved-deck, match, trust, or
account state.

## Settlement and concurrency

HTTP handlers never move cards themselves. They call the trading service from
issue `#275`, which locks the aggregate and ownership rows, revalidates both
participants and every selected copy, and settles only after two approvals for
the same complete version. An invalid item aborts the entire transaction.
Concurrent final acceptance, cancellation, expiry, deletion, or other ownership
work therefore converges through the existing database transaction and
constraint boundary.

## Expiry and retention runtime

Reads and mutations enforce the exact original offer deadline transactionally.
In addition, the API runtime starts a non-overlapping maintenance scheduler that
runs expiry and 30-day non-completed retention cleanup immediately and then at
`CARD_TRADE_MAINTENANCE_INTERVAL_MS` (30 minutes by default). Logs contain only
aggregate counts, not players or selected cards.

The scheduler cadence does not extend a trade's 24-hour lifetime: individual
operations still close an already-expired offer before acting on it.

## Downstream UI boundary

Issue `#274` implements the player experience as a nested Collection journey:
`/collection/trades` for open offers and history, `/collection/trades/new` for
the focused setup workflow, `/collection/trades/:tradeId` for participant-only
detail, and `/collection/trades/:tradeId/edit` for revision. The browser
displays the server preview, exact selected copies, version consent, expiry,
rarity warnings, terminal outcomes, and a post-settlement collection refresh.
It submits intent only and never calculates eligibility, completion,
settlement, or warning authority locally. Acceptance redirects through Auth0
for fresh authentication, then rechecks the returned offer version before
showing the final confirmation.

## AI declaration

This document was generated and reviewed with the assistance of:
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

This account-deletion update was edited with assistance from Codex[GPT-6].
