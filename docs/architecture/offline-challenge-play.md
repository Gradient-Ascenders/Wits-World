---
title: Offline play API
description: Prepare signed challenge packs, submit saved answers, and recover safely after reconnecting.
---

# Offline play API

Offline challenges let a player prepare events while connected, answer saved
questions without a connection, and submit the attempt after reconnecting.
Both multiple-choice and ordering challenges are supported. Scores, progression,
and card rewards are confirmed only after the API accepts the submission.

The application must have been opened and prepared online first. Other gameplay,
such as battles and trading, still requires a connection. The
[challenge API](challenge-attempt-api-contract.md) defines completed results;
[Playing a challenge](../requirements/player-challenge-journey.md) explains the
question controls and answer review.

## Access and routes

Both routes require bearer authentication, an active player account, and:

```http
X-Wits-Offline-Contract-Version: 1
```

A missing or unsupported version returns `409 OFFLINE_CLIENT_UPGRADE_REQUIRED`.
Update the client before preparing or submitting attempts. Both routes use the
[gameplay request quota](rate-limiting.md) and return `Cache-Control: no-store`.
See the [API reference](../api-reference.md) for shared authentication and errors.

| Method | Route                                | Result                                         |
| ------ | ------------------------------------ | ---------------------------------------------- |
| POST   | `/api/v1/offline-challenge-packs`    | Prepare signed packs for selected events.      |
| POST   | `/api/v1/offline-challenge-attempts` | Validate and complete a saved offline attempt. |

## Prepare packs

Send `{ "eventIds": [...] }` with 1–10 distinct event UUIDs. The `200` response
contains `{ packs, requestId }`; each entry in `packs` is `{ pack, packToken }`.
The API may return fewer packs than requested when an event cannot be prepared.

The pack provides the event's location and radius, content versions,
`format`, `timeLimitSeconds`, and 5 selected questions with shuffled options.
Each question has `id`, `version`, `prompt`, `difficulty`, and 4 `options`
containing `{ id, text }`. It also includes `packId`, the player binding,
`issuedAt`, `validFrom`, and `validUntil`.

Store the pack and its returned `packToken` together. Treat the token as opaque
and send it unchanged during synchronisation. Packs contain no correct answers,
explanations, marking results, or rewards. Downloading does not create a server
attempt or reserve card rewards.

## Timing and availability

Start at or after `validFrom` and before `validUntil`. Pack validity ends at the
earlier of the event's effective end, 24 hours after issue, or the next placement
rotation boundary when applicable. Use the returned validity timestamps rather
than assuming every pack lasts 24 hours.

The timer starts at the claimed `startedAt` and lasts `timeLimitSeconds`
(90, 120, or 150 seconds). Only answers timestamped before that deadline can
count. A full set of timely answers completes at its final answer time; otherwise
the attempt completes as a timeout at the deadline. A partial attempt cannot
finish early, and unanswered questions receive no credit.

Synchronisation must arrive within 12 hours after that derived completion time.
Delivery can occur after the event has ended. The API checks that the downloaded
content and placement were valid when the attempt started, including relevant
publication and campaign availability.

## Submit a saved attempt

Send all fields below; extra fields are rejected.

| Field                             | Required value                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `clientAttemptId`                 | A UUID created once for this local attempt and reused on retries.                       |
| `packToken`                       | The unchanged token returned with the prepared pack.                                    |
| `startedAt`, `finishedAt`         | Claimed start and finish date-time strings.                                             |
| `answers`                         | Up to 5 entries, each containing `questionId`, `answeredAt`, and `optionIds`.           |
| `startLocation`, `finishLocation` | Location claims containing `latitude`, `longitude`, `accuracyMetres`, and `acquiredAt`. |

Submit answers in the pack's question order, with non-decreasing answer times.
Multiple choice uses 1 option ID; ordering uses all 4 distinct option IDs in
the chosen order. These are the pack's IDs, rather than the snapshot IDs used
by online answer submission.

The start reading must be within the event radius. Both readings must satisfy
the [reported accuracy policy](../database/event-eligibility.md#reported-accuracy-policy)
and be fresh relative to the corresponding claimed start or finish. The finish
reading supports movement checks and need not remain within the event radius.

The server validates player binding, pack integrity, content availability,
timing, locations, and answers before marking and saving the result. Current
server reward rules apply at synchronisation. A signed pack authenticates the
downloaded content; device times and locations remain claims, and cached
questions can be inspected on the device.

## Results and retries

Successful synchronisation returns `{ attempt, requestId }`:

- `201` means the submission was accepted for the first time.
- `200` returns the existing completed attempt for an identical retry.

`attempt` uses the [completed challenge representation](challenge-attempt-api-contract.md#completed-response),
including score, rewards, and answer review. The server saves completion,
progression, and card awards together; a retry cannot issue another reward.

Keep the same attempt ID, pack, answers, and times when retrying an uncertain
submission. Changing the saved answers or times under the same attempt ID can
return `409 OFFLINE_ATTEMPT_CONFLICT`. A different attempt for an event already
attempted also conflicts. Preserve pending work through authentication,
rate-limit, connection, and server failures.

| Response                              | Meaning and recovery                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `409 OFFLINE_CLIENT_UPGRADE_REQUIRED` | Update the client and retain the saved attempt for retry.                                                        |
| `409 OFFLINE_ATTEMPT_CONFLICT`        | The submission conflicts with an existing attempt; stop resubmitting it and retrieve any known canonical result. |
| `422 OFFLINE_SYNC_EXPIRED`            | The synchronisation grace period has ended.                                                                      |
| `422 OFFLINE_CONTENT_UNAVAILABLE`     | Content or placement could not be validated for the claimed start.                                               |
| Other `422 OFFLINE_*` responses       | The pack, times, answers, location, or movement failed validation. Treat the submitted attempt as rejected.      |

The web application synchronises pending attempts sequentially on reopening,
reconnection, foregrounding, and manual retry. Keep local work until its outcome
and receipt have been saved; a network timeout alone does not establish failure.

## Local storage and privacy

The application keeps prepared packs, answers, start/finish location claims,
and receipts in account-separated browser storage. This local binding does not
grant API access; synchronisation still requires authentication as the pack's
player. Preparing new packs does not replace pending attempts.

Successful or terminally rejected synchronisation removes the local attempt,
answers, and precise location claims, retaining a receipt. Receipts are pruned
after 7 days during preparation. The API retains accepted start-location evidence
under the [movement retention policy](../database/movement-evidence.md#retention-and-access).

Sign-out and account deletion attempt to clear local data and warn about
pending work. If cleanup fails, the application warns before allowing the
player to continue; it does not claim the data was removed. Clear the site's
browser data before leaving a shared device. Browser eviction or manual storage
clearing can lose unsynchronised attempts.

The service worker caches the application shell, rather than API responses,
authentication traffic, or commercial map tiles. An offline event list and
relative-position view remain available. Application updates wait while a local
challenge is active; saved pending attempts survive an ordinary update.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using offline routes, validation,
local storage, and synchronisation handling. Earlier edits also used
Codex-CLI[GPT-6].
