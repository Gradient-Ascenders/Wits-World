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
| POST   | `/trades/:tradeId/accept`                    | Approve the current version with recent authentication.        |
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

Revision replaces your side's selection. It creates a new version and resets
both players' approvals and rarity acknowledgements. It does not extend the
original `expiresAt` deadline.

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

## Approval and recent authentication

Acknowledgement requires `{ submissionId, expectedVersion }`. Acceptance adds
`reauthenticationToken`: an Auth0 ID token from a recent sign-in, separate from
the bearer access token. Its `auth_time` must be no more than 5 minutes old,
and its issuer and subject must match the bearer identity. The API also checks
the configured issuer and client audience.

Invalid or stale proof returns `401 RECENT_AUTHENTICATION_REQUIRED`. Obtain
fresh proof before retrying acceptance; proof is checked on retries too.
Decline and cancellation require `{ submissionId }` without an offer version.

An acceptance can record your approval while the offer remains open. Settlement
requires both approvals for the same complete version, plus both rarity
acknowledgements when required. The server rechecks the deadline, eligibility,
ownership, and protections before exchanging all selected cards together.
Closed offers cannot be reopened.

## Conflicts and retries

Reuse the same `submissionId` and command fields when retrying an uncertain
create, revision, acknowledgement, acceptance, decline, or cancellation. An
identical retry returns the offer's current state without repeating the action;
it may be newer than the original response. A fresh authentication token may
be supplied on an acceptance retry.

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
