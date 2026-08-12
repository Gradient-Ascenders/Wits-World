# Challenge and Attempt API Contract

## Status and scope

This document defines the proposed Sprint 2 HTTP contract for accepting an event
quiz, resuming it, locking answers, and receiving server-generated score
feedback. It resolves issue #46 as a design contract only. The endpoints and
schemas described here are not implemented yet.

The first supported challenge format is a timed multiple-choice quiz. Reward
issuance is deliberately deferred to the linked
[persistence foundation issue](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49),
which will extend the completed-attempt transaction without allowing the browser
to choose a reward.

## Approved product decisions

The quiz format, thresholds, expiry, retry, and feedback rules below were
confirmed by the team in the
[issue #46 product decision record](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46#issuecomment-2732).
This contract translates those approved decisions into HTTP behavior; it does
not independently choose the game rules.

- Each event has one pool of multiple-choice questions.
- Starting an attempt selects exactly five distinct questions from the pool.
- Each question has difficulty `1`, `2`, or `3`, four preset choices, and one
  accepted choice.
- Choice order is shuffled once per attempt and persisted.
- A player may complete an event quiz only once.
- An answer is locked when accepted by the API and cannot be changed.
- The API reports only the final number correct. It does not reveal correctness
  per question or accepted choices.
- An event remains available to other players after one player completes it.

The selected questions determine the deadline:

| Average difficulty   | Time limit  |
| -------------------- | ----------- |
| `<= 1.5`             | 90 seconds  |
| `> 1.5` and `<= 2.5` | 120 seconds |
| `> 2.5`              | 150 seconds |

An attempt started while the event is active may use its full quiz deadline even
if the event closes during that period. Refreshing, reconnecting, or repeating
the start request returns the same active attempt with the original questions,
choice order, locked answers, and deadline.

## Authority and privacy

All routes require the existing bearer authentication scheme. The API derives
the player from the validated token's `(issuer, subject)` pair. A player
identifier in a body, parameter, or header is not accepted.

The start operation performs a fresh server-side location evaluation in the same
request that creates the attempt. The browser may submit a location claim, but it
may not submit `reachable`, `answerCorrect`, `score`, `coins`, `rewardCardId`, or
similar authoritative fields.

Question prompts and choices are player-visible. Accepted-choice records,
marking queries, reward rolls, and other players' attempts are never returned.
Exact submitted location values are evaluated for the start request but are not
persisted by this contract.

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

The source question identifier, difficulty, accepted choice, and per-question
correctness are absent. On resume, `selectedChoiceId` and `answeredAt` contain
the player's already locked answer where one exists.

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

`questions` always contains five player-safe question objects; it is abbreviated
above only to keep the example readable.

### Completed attempt

```json
{
  "attemptId": "31000000-0000-4000-8000-000000000001",
  "eventId": "00000000-0000-4000-8000-000000000018",
  "format": "multiple_choice",
  "status": "completed",
  "startedAt": "2026-09-01T10:00:00.000Z",
  "deadline": "2026-09-01T10:02:00.000Z",
  "completedAt": "2026-09-01T10:01:25.000Z",
  "completionReason": "answered",
  "totalQuestions": 5,
  "answeredCount": 5,
  "scoreCorrect": 3,
  "questions": [],
  "requestId": "server-generated-request-id"
}
```

`completionReason` is `answered` when all five choices were locked before the
deadline and `timeout` when expiry finalized the attempt. Unanswered questions
count as incorrect. The response does not identify which answers were correct.
The completed response gains a server-generated `reward` object when the
[challenge, reward, and card persistence design](../database/challenge-reward-persistence-design.md)
is implemented.

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
- Concurrent start requests converge on the same attempt.
- A completed event returns `409 EVENT_ALREADY_COMPLETED`.

Before creating an attempt, the API confirms that the event exists, is
published, is active at start time, is clearly reachable from the submitted
claim, and has at least five valid published questions. An event that closes
after creation does not shorten the attempt deadline.

## Fetch an attempt

```http
GET /api/v1/challenge-attempts/{attemptId}
Authorization: Bearer <access-token>
```

The route returns `200 OK` with the current in-progress or completed
representation. It is the resume and status-polling operation.

Only the player derived from the token may retrieve the attempt. A missing or
different player's attempt returns the same `404 ATTEMPT_NOT_FOUND` response so
ownership is not disclosed.

If the deadline has passed but asynchronous finalization has not completed, the
request may finalize the attempt defensively before returning it.

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

The question must belong to the authenticated player's attempt and the choice
must belong to that selected question.

- `200 OK` returns the updated attempt.
- Repeating the same question and choice is idempotent and returns the current
  attempt.
- Submitting a different choice for an answered question returns
  `409 ANSWER_LOCKED`.
- The fifth accepted answer finalizes and returns the completed attempt.
- An answer at or after the deadline is not accepted. The API ensures timeout
  finalization and returns `409 ATTEMPT_COMPLETED`; the browser then fetches the
  completed representation.

The server receipt time decides whether the answer met the deadline. A browser
timestamp is not accepted as proof of an on-time answer.

## Expiry finalization

A background finalizer will claim expired in-progress attempts in bounded
batches. It marks unanswered questions incorrect and completes the attempt. It
must be safe to retry and safe to run concurrently with the fifth answer.

Request handlers also check expiry before accepting answers or returning stale
state. Database row locking and the persistence constraints proposed by issue
#49 are responsible for ensuring that completion happens once.

The worker's scheduling interval is an operational setting, not part of the HTTP
contract. The authoritative deadline remains the stored attempt deadline.

## OpenAPI-compatible schema summary

| Field                  | Schema rule                                       |
| ---------------------- | ------------------------------------------------- |
| `eventId`, `attemptId` | string, UUID                                      |
| `attemptQuestionId`    | string, UUID                                      |
| `choiceId`             | string, UUID                                      |
| `latitude`             | finite number, `-90` through `90`                 |
| `longitude`            | finite number, `-180` through `180`               |
| `accuracyMetres`       | finite number, minimum `0`                        |
| `acquiredAt`           | string, date-time                                 |
| `format`               | enum: `multiple_choice`                           |
| `status`               | enum: `in_progress`, `completed`                  |
| `completionReason`     | enum: `answered`, `timeout`                       |
| `position`             | integer, `1` through `5`                          |
| `totalQuestions`       | integer, constant `5`                             |
| `answeredCount`        | integer, `0` through `5`                          |
| `scoreCorrect`         | integer, `0` through `5`; completed attempts only |
| request object schemas | `additionalProperties: false`                     |

The implementation should use a discriminated response schema so completed-only
fields cannot appear on an in-progress response.

## Error contract

Errors use the existing problem response with `type`, `title`, `status`, `code`,
`detail`, `requestId`, and optional `validation` fields.

| HTTP | Code                       | Meaning                                                   |
| ---- | -------------------------- | --------------------------------------------------------- |
| 400  | `INVALID_LOCATION_CLAIM`   | Coordinates, accuracy, or acquisition time are malformed. |
| 400  | `INVALID_CHALLENGE_ANSWER` | The question or choice relationship is invalid.           |
| 401  | `AUTHENTICATION_REQUIRED`  | No valid access token established identity.               |
| 403  | `EVENT_NOT_REACHABLE`      | The claim is clearly outside the event radius.            |
| 404  | `EVENT_NOT_FOUND`          | Event is missing or unpublished.                          |
| 404  | `ATTEMPT_NOT_FOUND`        | Attempt is missing or belongs to another player.          |
| 409  | `EVENT_NOT_ACTIVE`         | Event has not started or has ended before acceptance.     |
| 409  | `CHALLENGE_UNAVAILABLE`    | Fewer than five usable questions are configured.          |
| 409  | `EVENT_ALREADY_COMPLETED`  | This player already completed the event quiz.             |
| 409  | `ANSWER_LOCKED`            | A different choice was already locked for the question.   |
| 409  | `ATTEMPT_COMPLETED`        | The attempt was already completed or timed out.           |
| 422  | `LOCATION_RETRY_REQUIRED`  | The claim is stale, future-dated, or accuracy-ambiguous.  |

Unexpected database or worker failures use the existing safe `500` response and
request identifier. Responses never expose SQL, accepted answers, reward rolls,
tokens, or location details.

## Compatibility and follow-up work

The existing `GET /api/v1/events` and
`POST /api/v1/events/{eventId}/eligibility` contracts remain unchanged.
Challenge start performs its own fresh location evaluation; a previous
eligibility response is not authorization to start later.

Future implementation work must add:

- Fastify schemas and handlers for these three operations;
- database-backed question selection, attempt persistence, and expiry work;
- the transactional completion and reward model from issue #49;
- player UI for timed questions, reconnecting, and completion; and
- unit, integration, concurrency, security-exposure, and OpenAPI tests.

The proposed storage relations, reward calculation, and atomic finalization
boundary are specified in the
[challenge, reward, and card persistence design](../database/challenge-reward-persistence-design.md).

This contract was planned, generated, edited, and reviewed with the assistance
of Codex[GPT-5.6 Sol].
