# Challenge and Attempt API Contract

## Status and scope

This document defines the Sprint 2 HTTP contract for accepting an event quiz,
resuming it, locking answers, and receiving a server-generated completion and
reward result. It originated as the design contract for issue #46.

The server-authoritative start/resume operation,
`POST /api/v1/events/{eventId}/challenge-attempts`, is implemented by issue #65.

Issue #66 implements the answer-submission contract,
`POST /api/v1/challenge-attempts/{attemptId}/answers`, including authenticated
attempt/question/choice binding, immutable answer locking, server-receipt
deadline enforcement, private server-side marking, final-score calculation, and
the transaction coordinator used by fifth-answer and timeout finalisation.

Issue #67 implements the concrete atomic completion/reward finaliser and its
production server wiring.

The authenticated attempt-fetch operation,
`GET /api/v1/challenge-attempts/{attemptId}`, now implements resume/status
retrieval and defensive request-time expiry finalisation through that same
atomic completion boundary. Background expiry processing remains separate
follow-up work.

Basic remains a timed multiple-choice quiz. Issue #162 extends the same
server-authoritative attempt contract with the Intermediate `ordering` format.
An event challenge has one format, and all five questions and answers in an
attempt use that format. Existing multiple-choice requests remain compatible;
the author and answer APIs accept their historical bodies without an explicit
format and normalize them to `multiple_choice`.

Reward persistence and issuance are implemented through migrations `0007` and
`0008` and the atomic completion finalizer from closed issue #67. The linked
[persistence foundation issue](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49)
records the original design input. The browser never chooses correctness,
score, progression points, rarity, card definitions, or reward outcomes.

## Approved product decisions

The quiz format, thresholds, expiry, retry, feedback, and reward-contract rules
below were confirmed by the team in the
[issue #46 product decision record](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46#issuecomment-2732)
and subsequent Sprint 2 decisions. This contract translates those approved
decisions into HTTP behavior; it does not independently choose the game rules.

- Basic supports `multiple_choice`; Intermediate adds `ordering` through issue
  #162 without changing Basic behavior.
- Each event challenge has one format-specific question pool.
- Starting an attempt selects exactly five distinct questions from the pool.
- Each question has difficulty `1`, `2`, or `3`. Multiple-choice questions have
  four choices and one private accepted choice. Ordering questions have four
  items and a private correct position for every item.
- Choice or item order is shuffled once per attempt and persisted.
- A player may complete an event quiz only once.
- An answer is locked when accepted by the API and cannot be changed.
- Marking is server-authoritative. Answer feedback is withheld while the timed
  attempt is active and revealed only after authoritative completion.
- A completed result includes the final score, persisted reward outcome, and
  exactly five ordered review entries containing the persisted selected answer
  (or `null` after timeout), the authoritative correct answer, and
  server-derived correctness. Multiple-choice review has no explanation;
  ordering review reveals the persisted explanation only after completion.
- Completion and its reward result are retry-safe. Repeated requests return the
  persisted completion and reward without rerolling or issuing duplicate
  rewards.
- Every challenge-attempt request must send
  `X-Wits-Challenge-Contract-Version: 2`. Missing or different values receive a
  `409 CHALLENGE_CLIENT_UPGRADE_REQUIRED` response before start/resume, answer,
  fetch, timeout-finalisation, or completion services run. This prevents a stale
  tab from completing server-side and then failing to parse the newer response;
  the player must hard-refresh onto the matching Web build.
- The score-based reward system supersedes the earlier simplified
  one-card-per-event planning rule. A player still receives only one completed
  attempt and one persisted reward result per event. That result contains zero,
  one, or two awarded cards according to the server-side reward policy.
  Challenge points are recorded by the separate authoritative progression
  ledger.
- An event remains available to other players after one player completes it.

The selected questions determine the deadline:

| Average difficulty    | Time limit  |
| --------------------- | ----------- |
| `>= 1.0` and `<= 1.5` | 90 seconds  |
| `> 1.5` and `<= 2.5`  | 120 seconds |
| `> 2.5` and `<= 3.0`  | 150 seconds |

An attempt started while the event is active may use its full quiz deadline even
if the event closes during that period. Refreshing, reconnecting, or repeating
the start request returns the same active attempt with the original questions,
choice order, locked answers, and deadline. If the attempt has already
completed, repeated start or fetch requests return the same persisted completion
and reward result.

## Authority and privacy

All routes require the existing bearer authentication scheme. The API derives
the player from the validated token's `(issuer, subject)` pair. A player
identifier in a body, parameter, or header is not accepted.

The start operation performs a fresh server-side location evaluation in the same
request that creates the attempt. The browser may submit a location claim, but it
may not submit `reachable`, `answerCorrect`, `score`, `coins`, `rewardCardId`, or
similar authoritative fields.

Question prompts and shuffled choices or items are player-visible while an
attempt is in progress. Accepted choices, correct item positions, explanations,
marking queries, reward rolls, internal reward-policy inputs, and other players'
attempts are never returned. Exact submitted location values are evaluated for
the start request and stored only as short-lived internal movement evidence
under the documented retention boundary. The matching immutable journey
decision cascades when that current evidence expires or account deletion starts;
neither record is returned by this contract.

## Shared representations

Identifiers use UUID strings. Timestamps use RFC 3339 date-time strings in UTC.
Every response includes the existing server-generated `requestId`.

### Player-safe question

```json
{
  "attemptQuestionId": "32000000-0000-4000-8000-000000000001",
  "position": 1,
  "prompt": "Which library is located on East Campus?",
  "choices": [
    {
      "choiceId": "33000000-0000-4000-8000-000000000001",
      "text": "Wartenweiler Library"
    },
    {
      "choiceId": "33000000-0000-4000-8000-000000000002",
      "text": "Commerce Library"
    },
    {
      "choiceId": "33000000-0000-4000-8000-000000000003",
      "text": "Law Library"
    },
    {
      "choiceId": "33000000-0000-4000-8000-000000000004",
      "text": "Architecture Library"
    }
  ],
  "selectedChoiceId": null,
  "answeredAt": null
}
```

The source question identifier, difficulty, answer key, correct choice, and
per-question correctness are absent. On resume while the attempt is still in
progress, `selectedChoiceId` and `answeredAt` contain the player's already
locked answer where one exists. The completed representation uses the separate
review shape below and does not return answer timestamps.

For an in-progress ordering question, `items` contains four shuffled
`{ "itemId", "text" }` objects. `selectedItemIds` is `null` until answered and
then contains the four locked item IDs in submitted order. `answeredAt` follows
the same resume behavior as multiple choice. The correct order and explanation
are absent.

### In-progress attempt

```json
{
  "attemptId": "31000000-0000-4000-8000-000000000001",
  "eventId": "00000000-0000-4000-8000-000000000018",
  "format": "multiple_choice",
  "status": "in_progress",
  "startedAt": "2026-09-01T10:00:00.000Z",
  "deadline": "2026-09-01T10:02:00.000Z",
  "totalQuestions": 5,
  "answeredCount": 0,
  "questions": [],
  "requestId": "server-generated-request-id"
}
```

`questions` always contains exactly five player-safe question objects; it is
abbreviated above only to keep the example readable. Each question contains
exactly four choices for `multiple_choice` or four items for `ordering`.

### Completed attempt

```json
{
  "attemptId": "31000000-0000-4000-8000-000000000001",
  "eventId": "00000000-0000-4000-8000-000000000018",
  "format": "multiple_choice",
  "status": "completed",
  "completedAt": "2026-09-01T10:01:25.000Z",
  "completionReason": "answered",
  "totalQuestions": 5,
  "scoreCorrect": 3,
  "reward": {
    "cards": [
      {
        "ownedCardId": "51000000-0000-4000-8000-000000000001",
        "cardDefinitionId": "50000000-0000-4000-8000-000000000009",
        "name": "Campus Spark",
        "category": "creature",
        "affinity": "spark",
        "rarity": "common"
      }
    ]
  },
  "review": [
    {
      "attemptQuestionId": "32000000-0000-4000-8000-000000000001",
      "position": 1,
      "prompt": "Which library is located on East Campus?",
      "selectedChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000001",
        "text": "Wartenweiler Library"
      },
      "correctChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000001",
        "text": "Wartenweiler Library"
      },
      "isCorrect": true
    },
    {
      "attemptQuestionId": "32000000-0000-4000-8000-000000000002",
      "position": 2,
      "prompt": "Question 2",
      "selectedChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000005",
        "text": "Choice 2.1"
      },
      "correctChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000005",
        "text": "Choice 2.1"
      },
      "isCorrect": true
    },
    {
      "attemptQuestionId": "32000000-0000-4000-8000-000000000003",
      "position": 3,
      "prompt": "Question 3",
      "selectedChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000009",
        "text": "Choice 3.1"
      },
      "correctChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000009",
        "text": "Choice 3.1"
      },
      "isCorrect": true
    },
    {
      "attemptQuestionId": "32000000-0000-4000-8000-000000000004",
      "position": 4,
      "prompt": "Question 4",
      "selectedChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000013",
        "text": "Choice 4.1"
      },
      "correctChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000014",
        "text": "Choice 4.2"
      },
      "isCorrect": false
    },
    {
      "attemptQuestionId": "32000000-0000-4000-8000-000000000005",
      "position": 5,
      "prompt": "Question 5",
      "selectedChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000017",
        "text": "Choice 5.1"
      },
      "correctChoice": {
        "choiceId": "33000000-0000-4000-8000-000000000018",
        "text": "Choice 5.2"
      },
      "isCorrect": false
    }
  ],
  "requestId": "server-generated-request-id"
}
```

`scoreCorrect` is an integer from `0` through `5`. `reward.cards` contains zero,
one, or two persisted card awards according to the server-side reward policy.
The completed-attempt contract has no coin or wallet field.

The completed representation retains non-sensitive resource metadata so clients
can correlate the result with the attempt and event and distinguish the
completed state. `completionReason` is `answered` when all five answers were
accepted before expiry and `timeout` when expiry finalized the attempt.

`review` always contains exactly five entries ordered by `position`.
`selectedChoice` comes from the immutable locked answer and is `null` only for
questions left unanswered when timeout completes the attempt. `correctChoice`
comes from the attempt's immutable choice snapshot selected by the private
server-side answer key. `isCorrect` is derived by the server; unanswered entries
are false, and its true count agrees with `scoreCorrect`. An `answered`
completion has five non-null selected choices. Source question/choice IDs,
answer timestamps, the private answer-key identifier, and explanations are not
returned. `requestId` remains present because it is part of the existing
API-wide response envelope.

The reward result is reconstructed from persisted completion and ownership data.
Repeated requests return the same completed representation and never reroll or
issue another reward.

For `format: "ordering"`, each review entry contains `selectedItems` (four
snapshot items in the submitted order, or `null` after timeout), `correctItems`
(the same four snapshot items in authoritative order), `isCorrect`, and the
persisted `explanation`. A question is correct only when all four submitted
positions exactly match; partial credit is not awarded.

## Start or resume an attempt

```http
POST /api/v1/events/{eventId}/challenge-attempts
Authorization: Bearer <access-token>
Content-Type: application/json
```

Request body:

```json
{
  "latitude": -26.19,
  "longitude": 28.03,
  "accuracyMetres": 10,
  "acquiredAt": "2026-09-01T09:59:50.000Z"
}
```

The location fields use the existing eligibility validation rules. Unknown body
fields are rejected.

- `201 Created` returns a newly created in-progress attempt.
- `200 OK` returns the player's existing in-progress attempt without changing
  its timer or content.
- `200 OK` returns the player's persisted completion, reward, and review result
  when the event was already completed.
- Concurrent start requests converge on the same persisted attempt.
- A completed event never creates another attempt or rerolls its reward.

Before creating an attempt, the API confirms that the event exists, is
published, is active at start time, is clearly reachable from the submitted
claim, passes the same server-authoritative journey check as event eligibility,
and has at least five valid published questions. Journey evaluation and attempt
creation share one transaction, so direct challenge start cannot bypass an
impossible-journey retry. A rejected `too_fast` decision and its short-lived
evidence commit for audit, while no attempt or content snapshot is created. An
event that closes after creation does not shorten the attempt deadline.

## Fetch an attempt

```http
GET /api/v1/challenge-attempts/{attemptId}
Authorization: Bearer <access-token>
```

The route returns `200 OK` with the current in-progress representation or the
persisted completed score, reward, and review result. It is the resume and
status-polling operation.

Only the player derived from the token may retrieve the attempt. A missing or
different player's attempt returns the same `404 ATTEMPT_NOT_FOUND` response so
ownership is not disclosed.

If the deadline has passed but asynchronous finalization has not completed, the
request finalizes the attempt defensively before returning the persisted
completed result.

## Lock an answer

```http
POST /api/v1/challenge-attempts/{attemptId}/answers
Authorization: Bearer <access-token>
Content-Type: application/json
```

Request body:

```json
{
  "attemptQuestionId": "32000000-0000-4000-8000-000000000001",
  "choiceId": "33000000-0000-4000-8000-000000000001"
}
```

Ordering answers use the same endpoint with a discriminated body:

```json
{
  "format": "ordering",
  "attemptQuestionId": "32000000-0000-4000-8000-000000000001",
  "itemIds": [
    "34000000-0000-4000-8000-000000000003",
    "34000000-0000-4000-8000-000000000001",
    "34000000-0000-4000-8000-000000000004",
    "34000000-0000-4000-8000-000000000002"
  ]
}
```

The question must belong to the authenticated player's attempt. A submitted
choice must belong to that selected multiple-choice question. Ordering requires
exactly four unique item UUIDs, all from that ordering question. The submitted
format must match the persisted challenge format.

- `200 OK` returns the updated in-progress attempt after an accepted answer.
- Repeating the same already-accepted question and choice is idempotent and
  returns the current persisted attempt state.
- If that accepted answer already caused completion, an exact retry returns the
  same persisted completion, reward, and review result.
- Submitting a different choice for an answered question returns
  `409 ANSWER_LOCKED`.
- The fifth accepted answer finalizes the attempt and returns the persisted
  completion, reward, and review result.
- An answer received at or after the deadline is not accepted. The API finalizes
  the timed-out attempt, counts unanswered questions as incorrect, and returns
  the persisted completion, reward, and review result.
- A new answer submitted to an attempt that had already completed before the
  request returns `409 ATTEMPT_COMPLETED`.

The server receipt time decides whether the answer met the deadline. A browser
timestamp is not accepted as proof of an on-time answer.

### Answer-submission implementation boundary

Issue #66 implements answer validation, locking, timing, marking, and transaction
coordination. Correctness is derived only from persisted answer snapshots and the
private server-side answer-key relation. The browser never submits correctness,
score, accepted answers, or finalisation timestamps.

An accepted answer is immutable. Repeating the same question and choice is
idempotent; submitting a different choice for that question is rejected. The
attempt row is locked while answer state is inspected and changed so concurrent
submissions serialize against the same attempt.

When the fifth answer is accepted, or when server receipt time is at or beyond
the deadline, the submission coordinator calculates the authoritative final
score and invokes the atomic completion finaliser inside the same transaction.
If finalisation fails, the transaction rolls back and the API uses the existing
safe `500 INTERNAL_ERROR` response with a request identifier.

The concrete completion/reward finaliser is supplied by issue #67. No placeholder
completion, zero-reward completion, asynchronous `202` state, or partially
committed fifth-answer state is introduced by issue #66.

## Expiry finalization

A background finalizer will claim expired in-progress attempts in bounded
batches. It marks unanswered questions incorrect and completes the attempt. It
must be safe to retry and safe to run concurrently with the fifth answer.

Request handlers also check expiry before accepting answers or returning stale
state. Database row locking and the persistence constraints implemented from
issue #49's design are responsible for ensuring that completion happens once. The fifth-answer
path, timeout finalizer, and defensive request finalization must converge on the
same persisted completion, reward, and review result.

The worker's scheduling interval is an operational setting, not part of the HTTP
contract. The authoritative deadline remains the stored attempt deadline.

## OpenAPI-compatible schema summary

| Field                               | Schema rule                                          |
| ----------------------------------- | ---------------------------------------------------- |
| `eventId`, `attemptId`              | string, UUID                                         |
| `attemptQuestionId`                 | string, UUID                                         |
| `choiceId`, `itemId`                | string, UUID                                         |
| `latitude`                          | finite number, `-90` through `90`                    |
| `longitude`                         | finite number, `-180` through `180`                  |
| `accuracyMetres`                    | finite number, minimum `0`                           |
| `acquiredAt`                        | string, date-time                                    |
| `format`                            | enum: `multiple_choice`, `ordering`                  |
| `status`                            | enum: `in_progress`, `completed`                     |
| `position`                          | integer, `1` through `5`                             |
| `totalQuestions`                    | integer, constant `5`                                |
| `answeredCount`                     | integer, `0` through `5`; in-progress responses only |
| `questions`                         | array, exactly `5` items; in-progress responses only |
| question `choices`                  | array, exactly `4` items                             |
| question `items`                    | array, exactly `4` unique items; ordering only       |
| `itemIds`                           | array, exactly `4` unique UUIDs; ordering answer     |
| `scoreCorrect`                      | integer, `0` through `5`; completed results only     |
| `reward.cards`                      | array, `0` through `2` items                         |
| `X-Wits-Challenge-Contract-Version` | request header, exact value `2`                      |
| `review`                            | array, exactly `5` items; completed results only     |
| `selectedChoice`                    | choice object or `null`; completed review only       |
| `correctChoice`                     | choice object; completed review only                 |
| `selectedItems`                     | four item objects or `null`; ordering review only    |
| `correctItems`                      | four item objects; ordering review only              |
| `explanation`                       | nonblank string; completed ordering review only      |
| `isCorrect`                         | boolean; completed review only                       |
| card `category`                     | enum: `creature`, `power`                            |
| card `affinity`                     | enum: `wit`, `grit`, `spark`, `spirit`, `mystic`     |
| card `rarity`                       | enum: `common`, `rare`, `epic`, `legendary`          |
| request object schemas              | `additionalProperties: false`                        |
| `completionReason`                  | enum: `answered`, `timeout`; completed attempts only |
| `completedAt`                       | string, date-time; completed attempts only           |

The implementation uses four OpenAPI-compatible response schemas: active and
completed representations for each format. Review, correctness, correct
answers, explanations, score, and rewards exist only in completed schemas and
cannot leak into an active payload.

## Error contract

Errors use the existing problem response with `type`, `title`, `status`, `code`,
`detail`, `requestId`, and optional `validation` fields.

| HTTP | Code                       | Meaning                                                                                               |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 400  | `INVALID_LOCATION_CLAIM`   | Coordinates, accuracy, or acquisition time are malformed.                                             |
| 400  | `INVALID_CHALLENGE_ANSWER` | The question or submitted choice/item relationship is invalid.                                        |
| 401  | `UNAUTHORIZED`             | No valid access token established identity.                                                           |
| 403  | `EVENT_NOT_REACHABLE`      | The claim is clearly outside the event radius.                                                        |
| 404  | `EVENT_NOT_FOUND`          | Event is missing or unpublished.                                                                      |
| 404  | `ATTEMPT_NOT_FOUND`        | Attempt is missing or belongs to another player.                                                      |
| 409  | `EVENT_NOT_ACTIVE`         | Event has not started or has ended before acceptance.                                                 |
| 409  | `CHALLENGE_UNAVAILABLE`    | Fewer than five usable questions are configured.                                                      |
| 409  | `ANSWER_LOCKED`            | A different choice was already locked for the question.                                               |
| 409  | `ATTEMPT_COMPLETED`        | A new answer was submitted to an already completed attempt.                                           |
| 422  | `LOCATION_RETRY_REQUIRED`  | The claim is stale, future-dated, accuracy-ambiguous, or requires a neutral impossible-journey retry. |

Unexpected database or worker failures use the existing safe `500` response and
request identifier. Error and active-attempt responses never expose SQL, answer
keys, correct answers, per-question correctness, reward rolls, tokens, or
location details. Completed success responses reveal only the review fields
defined above.

## Compatibility and follow-up work

The existing `GET /api/v1/events` and
`POST /api/v1/events/{eventId}/eligibility` contracts remain unchanged.
Challenge start performs its own fresh location evaluation; a previous
eligibility response is not authorization to start later.

Issue #65 implements the authenticated challenge start/resume route,
database-backed five-question selection, persisted choice shuffling, authoritative
event/location checks, deadline calculation, and concurrency-safe attempt
creation.

Issue #66 implements:

- the authenticated answer-submission HTTP contract;
- player/attempt/question/choice ownership and binding checks;
- immutable and idempotent answer locking;
- concurrent submission serialization;
- server-receipt deadline enforcement;
- private server-side multiple-choice marking;
- unanswered-question-as-incorrect score calculation;
- fifth-answer and timeout finalisation detection;
- the transaction coordinator and atomic-finaliser interface;
- player-safe active-response withholding and completed-review handling; and
- unit, integration, concurrency, security-exposure, and OpenAPI coverage for
  those behaviours.

Issue #67 implements:

- the concrete idempotent atomic completion/reward finaliser;
- production server wiring of that finaliser into answer submission; and
- atomic reward persistence with retry and concurrency protection.

The attempt-fetch follow-up implements:

- the authenticated `GET /api/v1/challenge-attempts/{attemptId}` operation;
- ownership-safe resume and status retrieval using the player derived from the
  validated token;
- defensive request-time timeout finalisation through the same atomic finaliser;
- persisted completed-result retries without rerolling rewards; and
- database-backed timeout and concurrent-fetch verification.

The timed multiple-choice player UI is implemented by closed issue #68.
Ordering persistence and API behavior are implemented by issue #162; its player
UI is tracked separately. Remaining shared contract work is the optional
background expiry processor; answer submission and attempt fetch already
finalize expired attempts defensively through the atomic boundary.

The storage relations, reward calculation, and atomic finalization
boundary are specified in the
[challenge, reward, and card persistence design](../database/challenge-reward-persistence-design.md).

This contract was planned, generated, edited, and reviewed with the assistance
of Codex[GPT-5.6 Sol], Codex[GPT-5], and ChatGPT-Web[GPT-5.6 Sol].
