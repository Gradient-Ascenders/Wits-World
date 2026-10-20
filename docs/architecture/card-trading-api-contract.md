---
title: Trading API
description: Create private card offers, revise selections, and approve a versioned exchange safely.
---

# Trading API

The Trading API supports private offers between 2 players. Each participant
selects exact copies from their own collection and requests card definitions
and quantities from the other player. The server checks eligibility and
completes the exchange after both players approve the same version.

The [trading guide](../requirements/card-trading-policy.md) explains game limits,
copy protections, rarity warnings, and retention. This page covers requests,
responses, and retries. All routes require bearer authentication and an active
player account; see the [API reference](../api-reference.md) for shared access
and error rules.

## Routes

Routes below begin with `/api/v1`.

| Method | Route                                        | Purpose                                                        |
| ------ | -------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/cards/trading-catalogue`                   | List published, active card definitions that can be requested. |
| GET    | `/trades/recipient?playerName=…`             | Look up an exact recipient Player Name.                        |
| POST   | `/trades`                                    | Create an offer.                                               |
| GET    | `/trades`                                    | List your sent and received offers.                            |
| POST   | `/trades/selection-preview`                  | Check a proposed selection without reserving copies.           |
| GET    | `/trades/:tradeId`                           | Read an offer in which you participate.                        |
| PUT    | `/trades/:tradeId`                           | Revise your selection and create the next offer version.       |
| POST   | `/trades/:tradeId/imbalance-acknowledgement` | Acknowledge the current version's rarity warning.              |
| POST   | `/trades/:tradeId/accept`                    | Confirm the current offer using the signed-in session.         |
| POST   | `/trades/:tradeId/decline`                   | Decline an offer as its recipient.                             |
| POST   | `/trades/:tradeId/cancel`                    | Cancel an offer as its sender.                                 |

Creation returns `201`; other successful operations return `200`. Recipient
lookup returns `{ playerName, requestId }`. It confirms a name without exposing
inventory, reserving cards, or guaranteeing that an offer will be allowed.
The catalogue describes requestable definitions and does not reveal ownership.

Recipient lookup, creation, selection preview, and acceptance use the gameplay
request quota. Other trading routes use the general quota. Follow the
[rate limits guide](rate-limiting.md) when a request returns `429`.

## Selections and request bodies

Creation requires `submissionId`, `recipientPlayerName`, `offeredOwnedCardIds`,
and `requestedDefinitions`. Revision requires `submissionId`, `expectedVersion`,
`offeredOwnedCardIds`, and `requestedDefinitions`.

- `offeredOwnedCardIds` contains 1–5 distinct owned-copy UUIDs belonging to the
  caller.
- `requestedDefinitions` contains `{ cardDefinitionId, quantity }` entries.
  Each quantity is an integer from 1 to 5; the total requested copies must
  satisfy the trading limits.
- `expectedVersion` identifies the offer version the caller has reviewed.
- `submissionId` is a caller-generated UUID for one offer command.

The web sends `confirmOffer: true` on create, revision, and acceptance. Confirmed
creation records the proposer's consent. Confirmed revision publishes a new
proposal using the caller's exact copies and requests, removes the other side's
old selections/reservations, and records only the countering player's consent.
Neither operation extends the original `expiresAt` deadline.

When `confirmOffer` is omitted, legacy per-side creation/revision and versioned
approval remain supported. Legacy revision resets both approvals. Normal bearer
authentication is required in both flows.

A preview requires `offeredOwnedCardIds` and `requestedDefinitions`, and accepts
empty arrays while drafting. Include `tradeId` and `expectedVersion` when
previewing an existing offer. Preview does not require a `submissionId`.

The preview returns `valid`, `issues`, your `ownedCopies` with an `availability`
value, requested definitions, rarity totals, `imbalanceWarningRequired`,
`limits`, and `requestId`. An invalid draft can return `200` with `valid: false`;
inspect the result before creating or revising an offer. Availability can reflect
a saved deck, a battle commitment, another trade, an inactive definition, or a
collection minimum. A valid preview does not reserve copies or guarantee a
later command will succeed.

New-draft previews read policy, owned-copy availability, and requested definitions
in one database statement and snapshot, without a read-only transaction round
trip. Existing-offer previews retain participant, lock, version, and deadline
checks inside their transaction. The editor starts a new draft’s initial preview
alongside its catalogue load and keeps Review offer disabled until the current
server preview succeeds. The editing action is labelled Counter. Incoming counter
drafts seed requests from the other player's offered definitions and select
matching own copies from the server preview. Protected or missing copies are
shown as unavailable; a valid current preview is still required to submit.
Rarity warnings appear above the action and apply to the whole exchange.

## Reading offers

Detail reads and successful offer commands return `{ trade, requestId }`.
The view is relative to the authenticated participant:

| Fields                                      | Meaning                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tradeId`, `role`, `counterpartyPlayerName` | Offer identity, your sender/recipient role, and the other player's current name.                                         |
| `status`, `version`                         | Current lifecycle state and offer version.                                                                               |
| `createdAt`, `expiresAt`, `terminalAt`      | Creation, original deadline, and closure timestamps; `terminalAt` is null while open.                                    |
| `self`, `counterparty`                      | Each side's offered copies, requested definitions, rarity points, acceptance, and warning acknowledgement.               |
| `complete`                                  | Both sides' selected copies match the requested definitions and quantities. This does not mean the exchange has settled. |
| `imbalanceWarningRequired`                  | Whether the current complete selection requires acknowledgement from both players.                                       |
| `settlement`                                | Null before settlement; `{ completedAt }` after completion.                                                              |

Responses expose selected cards, rather than the counterparty's wider collection.
They omit internal account identifiers and private account or trust information.
Deleted counterparties appear as `Deleted player`. A missing offer and an offer
the caller cannot access both return `404 TRADE_NOT_FOUND`.

The list returns `{ items, page, pageSize, hasMore, requestId }`, with summaries
ordered newest first. Use `page` starting at 1 and `pageSize` up to 50 (default
20). Optional `direction` filters are `sent` and `received`; `status` accepts
`open`, `completed`, `declined`, `cancelled`, `expired`, or `invalidated`.

## Confirmation and settlement

Acceptance requires `{ submissionId, expectedVersion, confirmOffer: true }` and
the existing bearer-authenticated active player. It does not request a new
password, Auth0 redirect, ID token, or recent-authentication proof.
`reauthenticationToken` is an optional deprecated compatibility field and is not
used to authorize acceptance.

Only the other participant can accept the latest proposal. The server binds
matching available own copies to the proposer's requested definitions. It locks
all chosen copies in deterministic order, rechecks protections and acquisition
snapshots, and appends a complete immutable settlement version containing both
sides' exact copies and reciprocal requests. Both confirmations and displayed
rarity-warning acknowledgements are recorded for that version. The original
proposal and previous versions remain unchanged.

Settlement still rechecks the deadline, eligibility, holds, ownership, card
protections, copy limits, daily caps, and collection minimums before exchanging
all cards atomically. Unavailable requested copies fail safely rather than being
substituted with another card definition. Acceptance cannot confirm a changed
proposal silently; a stale version requires a fresh review and confirmation.
Closed offers cannot be reopened.

The legacy acknowledgement endpoint accepts `{ submissionId, expectedVersion }`.
Decline and cancellation continue to require `{ submissionId }`.

## Conflicts and retries

Reuse the same `submissionId` and command fields when retrying an uncertain
create, revision, acknowledgement, acceptance, decline, or cancellation. An
identical retry returns the offer's current state without repeating the action;
it may be newer than the original response. The confirmation flag is part of
the command digest; changed intent must use a new submission ID.

| Response                           | Caller action                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `409 TRADE_VERSION_STALE`          | Fetch the offer and review its current version before giving new consent.           |
| `409 TRADE_IDEMPOTENCY_CONFLICT`   | Do not reuse a submission ID for changed intent; create a new ID for a new command. |
| `409 TRADE_COPY_CONFLICT`          | Refresh the offer and preview; choose available copies.                             |
| `409 TRADE_INCOMPLETE`             | Complete both sides' matching selections before acceptance.                         |
| `409 TRADE_IMBALANCE_ACK_REQUIRED` | Obtain the required acknowledgements for this version.                              |
| `409 TRADE_NOT_OPEN`               | Refresh and show the closed outcome.                                                |

Other conflicts can indicate account limits or collection minimums. Use the
returned code and safe explanation, and refresh current state before proposing
a changed command. A timeout alone does not establish whether an exchange
completed.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using trading routes and response
schemas. Earlier versions used ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].
