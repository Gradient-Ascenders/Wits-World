---
title: 'Question reports'
---

# Question reports

Authors use question reports to identify content that may be too easy, confusing, or difficult to finish. Open `/author/analytics/questions`, choose a period, and filter by event, challenge, format, or difficulty. A result links back to the source content.

These reports guide content review. A low success rate does not explain its cause or prove player misconduct. Published and retired questions remain immutable; a report does not edit them automatically.

## Read the classification

| Console label   | Rule                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| **No outcomes** | No completed-attempt outcomes for this question/group                      |
| **Suppressed**  | 1–9 outcomes in the advanced analytics report; counts and rates are hidden |
| **Easy**        | At least 10 outcomes and at least 90% correct                              |
| **Problematic** | At least 10 outcomes and at least 70% incorrect                            |
| **Normal**      | A reportable sample meeting neither classification threshold               |

The API classifies zero outcomes as `normal`; the console displays **No outcomes** to distinguish absence of data from a measured result. Rates are returned from 0 to 1 and displayed as percentages.

Difficulty is the snapshot seen by the player, not a later draft value. The same source question can therefore appear in multiple historical difficulty groups. Stable question, challenge, and event IDs connect results to the relevant content.

## What counts as an outcome

Only completed challenge attempts contribute. Starting an attempt snapshots all 5 questions, but a snapshot alone does not mean the player reached that question.

- A submitted multiple-choice answer is correct when its snapshot choice maps to the private accepted choice.
- An ordering answer is correct when all 4 submitted items match their accepted positions.
- Every submitted wrong answer counts as incorrect.
- For a timed-out attempt, only the lowest-position unanswered question adds an incorrect outcome and a timeout. Later unanswered questions are excluded.
- A wrong answer submitted before a timeout remains incorrect without being counted as a timeout.
- In-progress attempts contribute no partial results.

The resulting counts satisfy:

```text
correctCount + incorrectCount = answerCount
timeoutCount ≤ incorrectCount
```

Timeouts are part of incorrect outcomes, not a third mutually exclusive category. Both rates divide their count by `answerCount`.

Date filters use the attempt's authoritative `completed_at`. The start boundary is inclusive and the end exclusive; attempt start time does not determine inclusion.

See [Author analytics API](../architecture/advanced-analytics-api-contract.md#two-reporting-endpoints) for endpoint differences and filters, and [Question analytics queries](question-performance-query.md) for query stages and supporting indexes.

**AI declaration**

The title was clarified with Codex-CLI[GPT-6], and the advanced analytics privacy boundary was documented with ChatGPT-Web[GPT-5.6 Sol]. The current rewrite and implementation review used Codex[GPT-6].
