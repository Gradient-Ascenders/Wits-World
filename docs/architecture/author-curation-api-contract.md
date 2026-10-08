---
title: 'Author events and questions'
description: Create an event, write its challenge questions, and prepare the package for review.
---

# Author events and questions

An event combines a campus location or automatic placement, an availability
window, and a challenge. The Author workspace keeps these together so you can
prepare and review the whole event before publication.

## Create an event

1. Open **Events** at `/author/events` and choose **New event**.
2. Enter the title and optional description.
3. Choose a fixed location on the map or enter its coordinates. Alternatively,
   enable **Automatic placement** for content that can work at different campus sites.
4. Set the interaction **Radius (metres)** and **Starts at** / **Ends at** times.
   The date picker uses Johannesburg time; the end must be after the start.
5. Choose **Create draft event** to save it.

A fixed event needs valid latitude and longitude. An automatically placed event
has no authored point; the placement system supplies its effective location.
Both require a positive integer radius. Disabling automatic placement requires
choosing a fixed point rather than recovering an old hidden location.

Use fixed placement for landmark-specific content. Automatic placement enters
its pool when the event is published and ready; it has no additional approval
step. See [Placement rules](../requirements/automatic-event-placement-policy.md#portable-event-boundary)
for eligibility and [Event placement](automatic-event-placement-service.md)
for previewing assignments.

## Write the challenge

Open the event's **Questions** view. Choose **Multiple choice** or **Ordering**
and **Create challenge** if the event does not have one. Questions must match
that challenge's format.

Choose **New question**, enter the prompt, set **Difficulty** from 1 to 3, and
add the answer data and **Author explanation**. Choose **Create draft question** for a
new question or **Save question** after editing an existing draft.

| Format          | Required answer data                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| Multiple choice | Exactly 4 nonblank choices, with 1 marked as the accepted answer.                          |
| Ordering        | Exactly 4 nonblank items entered in their correct order. Players receive a shuffled order. |

The explanation must be nonblank. Authors can inspect accepted answers and
correct orders; player payloads keep answer keys private until the challenge's
review stage. Saving a question is not publication.

The event view offers **Questions**, **Details**, **Review**, and **History**.
Details shows the schedule and placement; Review shows the event and question
content together. History records event actions, and question detail has its own history.

## Publication readiness

Prepare **at least 5 complete questions** and **exactly 1 non-retired challenge**
for the event package. Then choose **Submit event and questions**. A different
Author reviews it, and an approved package can be published through
[Review and publish](diagrams/content-review.md).

The server requires:

- complete format-specific answers and explanations;
- at least 5 published questions for a published challenge;
- exactly 1 published challenge for a published event;
- at least 1 active, published Common card eligible for challenge rewards.

Package approval permits newly approved children; package publication publishes
those children before the event. The shared guide explains independent review,
version checks, and atomic package transitions without separate manual
publication of each question.

Edits are draft-only. To repair submitted or approved content, another Author
must return it to draft. Published content is fixed; prepare replacement content
when its wording or answers need to change. Retirement preserves existing
attempts and results, and can be blocked by a published campaign or required dependency.

## Sources and question reports

Event and question detail can show saved HTTPS source references. These are
review evidence, not player-visible answers. Source links are currently
read-only in the console; normal create/edit forms do not add them.

Question performance reports are implemented. Use
[Question reports](../database/question-performance-analytics.md) and
[Author analytics](../design/author-analytics.md) to inspect saved aggregate
results. Analytics does not rewrite a question or bypass its review lifecycle.

## API reference

All routes use `/api/v1` and require a validated token, active local account,
and Author role. The server resolves identity and ignores browser claims about
reviewer, publication state, or readiness.

| Operation                | Route                                                    |
| ------------------------ | -------------------------------------------------------- |
| List / create events     | `GET` / `POST /author/events`                            |
| Edit an event            | `PUT /author/events/:eventId`                            |
| List / create challenges | `GET` / `POST /author/events/:eventId/challenges`        |
| List / create questions  | `GET` / `POST /author/challenges/:challengeId/questions` |
| Edit a question          | `PUT /author/questions/:questionId`                      |

Updates include `expectedVersion`. Review/package routes, transition errors,
and audit behavior are defined in
[Review and publish](diagrams/content-review.md#versions-and-history).
The [API reference](api-overview.md) provides exact schemas; the
[challenge contract](challenge-attempt-api-contract.md) covers player attempts,
timing, marking, and saved rewards.

---

This page was prepared and edited with assistance from Codex[gpt-5.6-sol],
Codex[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].
