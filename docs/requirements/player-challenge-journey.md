---
title: 'Playing a challenge'
description: Answer questions, resume saved progress, and review the result.
---

# Playing a challenge

## Player journey

1. Read the current question, remaining time, and saved progress.
2. Prepare and submit your response using the controls below.
3. Wait for the answer to save and the next question to open.
4. At completion, expand **Review your answers** to compare your responses
   with the correct answers. Ordering reviews also include explanations.
5. Choose **View collection** to inspect awarded cards, or **Return to explore**
   to find another event.

| Format          | Controls                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Multiple choice | Select an option and choose **Submit answer**.                                 |
| Ordering        | Drag items or use **Move up** and **Move down**, then choose **Submit order**. |

To resume, reopen the challenge page. It returns the first unanswered question
or the completed result. Unsaved selections are discarded after a reload.

If saving an answer or checking a result takes more than 20 seconds, the page
offers **Retry answer** or **Check result again**. Retrying keeps your current
selection and checks the same attempt; the original server timer still applies.
A connection failure does not prove that an answer was lost.

For prepared challenges played without a connection, follow
[Saved events and offline play](player-offline-journey.md).

## How it works

The API stores the questions, accepted answers, and deadline. Accepted answers
are locked, and correctness stays hidden until completion. Refreshing or losing
connection does not reset the timer; the server decides whether an answer arrived
on time.

Completion saves the result, progression, and card awards in one transaction.
Retries return saved state without issuing rewards again. Artwork loads
separately from the award itself.

Attempt limits, timings, and reward probabilities are in the
[game rules](basic-game-rules.md). Requests, responses, and retry rules are in the
[challenge API contract](../architecture/challenge-attempt-api-contract.md).

---

This page was prepared and edited with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].
