---
title: Challenges and answers API
description: Start and resume timed challenges, lock answers, and retrieve completed results.
---

# Challenges and answers API

The challenge API creates a timed attempt, saves each accepted answer, and
returns the final review and rewards. It supports `multiple_choice` and
`ordering`; an attempt uses the same format for all 5 questions.

See [Playing a challenge](../requirements/player-challenge-journey.md) for the
player experience and [game rules](../requirements/basic-game-rules.md#event-challenge)
for timing and reward policy. Prepared offline attempts use the separate
[Offline play API](offline-challenge-play.md).

## Access and routes

All requests require bearer authentication, an active player account, and this
header, including GET requests:

```http
X-Wits-Challenge-Contract-Version: 2
```

A missing or unsupported version returns
`409 CHALLENGE_CLIENT_UPGRADE_REQUIRED` before attempt processing. Update the
client before continuing. See the [API reference](../api-reference.md) for
shared authentication and error handling.

| Method | Route                                           | Result                                                          |
| ------ | ----------------------------------------------- | --------------------------------------------------------------- |
| POST   | `/api/v1/events/:eventId/challenge-attempts`    | Start an attempt or return your existing attempt for the event. |
| GET    | `/api/v1/challenge-attempts/:attemptId`         | Retrieve your current attempt or completed result.              |
| POST   | `/api/v1/challenge-attempts/:attemptId/answers` | Lock an answer and return the updated attempt.                  |

Starting returns `201` for a new attempt and `200` for an existing attempt.
Fetch and answer submission return `200`. Responses contain the attempt fields
directly, with a `requestId`. Identifiers are UUIDs and timestamps are UTC
date-time strings.

Start and answer requests use the gameplay quota; fetch uses the general quota.
Follow [rate limits](rate-limiting.md) when retrying a `429` response. A missing
attempt and another player's attempt both return `404 ATTEMPT_NOT_FOUND`.

## Start and resume

The start body requires a location claim:

```json
{
  "latitude": -26.19,
  "longitude": 28.03,
  "accuracyMetres": 10,
  "acquiredAt": "2026-10-09T10:00:00.000Z"
}
```

Latitude must be within −90 to 90, longitude within −180 to 180, and accuracy
must be non-negative. Use a fresh acquisition timestamp when making a request;
see [event eligibility](../database/event-eligibility.md#reported-accuracy-policy)
for freshness, radius, accuracy, and movement checks.

Before creating an attempt, the API checks current event availability, location,
account permissions, and usable questions. An earlier eligibility check does
not reserve access. Device coordinates remain claims rather than proof of
physical presence.

Each player has 1 attempt per event. Repeating start returns the existing
questions, shuffled options, locked answers, and original deadline. It cannot
restart the timer or create another reward opportunity. An attempt started
while the event is available retains its deadline if the event later closes.

## Active response

An active response has `status: "in_progress"` and includes:

| Fields                            | Meaning                                         |
| --------------------------------- | ----------------------------------------------- |
| `attemptId`, `eventId`, `format`  | Attempt identity and answer format.             |
| `startedAt`, `deadline`           | Server timestamps defining the attempt's timer. |
| `totalQuestions`, `answeredCount` | 5 questions and the number of locked answers.   |
| `questions`                       | 5 questions ordered by `position`.              |

Every question has `attemptQuestionId`, `position`, `prompt`, and `answeredAt`.
For multiple choice, `choices` contains 4 `{ choiceId, text }` entries and
`selectedChoiceId` is null until answered. For ordering, `items` contains
4 `{ itemId, text }` entries and `selectedItemIds` is null until answered,
then contains the locked order.

Correct answers, correctness, explanations, scores, and reward outcomes stay
hidden while the attempt is active. Resume returns saved selections, while
unsaved client selections have no effect on the API state.

## Submit an answer

A multiple-choice answer uses the question and choice IDs from the active
response:

```json
{
  "attemptQuestionId": "32000000-0000-4000-8000-000000000001",
  "choiceId": "33000000-0000-4000-8000-000000000001"
}
```

`format: "multiple_choice"` is optional for this body. Ordering requires
`format: "ordering"`, `attemptQuestionId`, and `itemIds`: all 4 distinct item
IDs in the chosen order. Extra request fields are rejected. Questions and
options must belong to the caller's attempt and match its format.

The API locks accepted answers. Repeating the same answer is safe; changing a
locked answer returns `409 ANSWER_LOCKED`. Arrival at the API determines whether
an answer is on time: it must arrive before `deadline`. A device timestamp does
not extend the online timer.

The final accepted answer completes the attempt. An answer request reaching an
expired attempt resolves the timeout without accepting a late answer. Fetch
also resolves an expired attempt before returning its completed result.

## Completed response

A completed response has `status: "completed"`. It retains `attemptId`,
`eventId`, `format`, and `totalQuestions`, and adds:

| Fields                            | Meaning                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `completedAt`, `completionReason` | Completion timestamp and `answered` or `timeout`.                                                                                     |
| `scoreCorrect`                    | Number of correct answers, from 0 to 5. Missing answers receive no credit.                                                            |
| `reward.cards`                    | 0–2 normal card awards, with owned-copy and definition IDs and card presentation metadata.                                            |
| `review`                          | 5 entries in question order, containing the saved response and correct answer.                                                        |
| `ownerBonus`                      | Optional separate territory bonus result; see [owner card bonuses](../requirements/contested-campus-zone-policy.md#owner-card-bonus). |

Multiple-choice review entries contain `attemptQuestionId`, `position`,
`prompt`, `selectedChoice`, `correctChoice`, and `isCorrect`. An unanswered
question has `selectedChoice: null`. Multiple-choice review omits explanations.
Ordering review uses `selectedItems`, `correctItems`, and `explanation` instead;
`selectedItems` is null when unanswered. Ordering requires the entire sequence
to match and awards no partial credit.

Completion saves the result, progression, and card awards together. Reopening
or retrying returns the saved result without rerolling or awarding cards again.

## Errors and recovery

| Response                                          | Caller action                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `400 INVALID_CHALLENGE_ANSWER`                    | Check the attempt's format and the question/option IDs from its response.   |
| `403 EVENT_NOT_REACHABLE`                         | Return to event discovery and obtain a location reading within range.       |
| `409 EVENT_NOT_ACTIVE` or `CHALLENGE_UNAVAILABLE` | Refresh event availability before proposing a new start.                    |
| `422 LOCATION_RETRY_REQUIRED`                     | Obtain a fresh, sufficiently accurate reading and retry the location check. |
| `409 ANSWER_LOCKED`                               | Fetch the attempt and display the saved answer.                             |
| `409 ATTEMPT_COMPLETED`                           | Fetch and display the completed result.                                     |

If an answer response is lost, fetch current state or repeat the identical
answer. An identical saved-answer retry can return the completed result;
a new or changed answer after completion is rejected. Do not interpret a
connection failure as proof that an answer was unsaved.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using challenge routes and response
schemas. Earlier versions used Codex[GPT-5.6 Sol], Codex[GPT-5], and
ChatGPT-Web[GPT-5.6 Sol].
