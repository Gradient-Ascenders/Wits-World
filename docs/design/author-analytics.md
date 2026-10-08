---
title: 'Analytics overview'
---

# Analytics overview

Open `/author/analytics` to review event activity, question performance, and challenge card rewards. These reports help Authors identify content that needs attention.

## Use the reports

Choose **All time**, **Last 7 days**, **Last 30 days**, or **Custom dates**. Dates use UTC, and a custom period includes the selected end date. The same period applies across reports; visited reports retain their controls.

| Report        | Use it to                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| **Overview**  | Find events with ignored locations or unusually easy/problematic questions, then open the relevant content |
| **Locations** | Compare event discovery, successful eligibility checks, challenge starts, and completions                  |
| **Questions** | Review correctness, timeouts, and difficulty; filter by event, challenge, format, or difficulty            |
| **Rewards**   | Compare challenge card awards by definition and rarity                                                     |

Each report loads independently. Charts summarise the reported values; tables provide full labels, values, and disclosure status.

## Interpret the results

Location counts measure activity, not unique players. Repeated discovery and eligibility checks can count again. The stages do not track the same group of players, so they do not form a conversion rate.

Question classifications identify content worth reviewing. [Question reports](../database/question-performance-analytics.md) explains the labels and outcome rules.

Reward counts describe cards issued at challenge completion, rather than cards currently owned. Location and question comparisons cover the current results page; rarity summaries cover the entire selected period.

Reports show aggregate content activity without player identities, submitted answers, or precise player coordinates. **Suppressed** means a value is hidden because the sample is small; it does not mean zero. See [Storage and privacy](../database/advanced-analytics.md) for the technical disclosure and retention rules.

For endpoint contracts and technical filters, see [Author analytics API](../architecture/advanced-analytics-api-contract.md).

**AI declaration**

This guide was adapted from report-usage material documented with assistance from ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-6]. The current separation and editing used Codex[GPT-6].
