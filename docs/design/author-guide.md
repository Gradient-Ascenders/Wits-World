---
title: 'Author guide'
description: The Author role, access requirements, and guides to creating, reviewing, and managing game content.
slug: /author-guide
---

# Author guide

An **Author** is a player with additional permission to maintain shared game content, review submissions, manage event placement, and investigate player activity. Authors can still explore campus, collect cards, and play battles.

## Access and permissions

Sign in, complete Player Name setup, and open **Author** in the app navigation. The console starts at `/author/events`.

Author access requires an active local account with the `author` role. New accounts receive the `player` role; signing in does not grant Author permission. The API reads the role from the Wits World account, rather than trusting browser claims. There is no self-service role change or role-management screen in the console.

The content catalogue is shared between Authors. Each mutation records the acting Author, and publication still requires the relevant readiness and review checks.

## What Authors can do

| Workspace          | Capabilities                                                                              | Guide                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Events**         | Create events, set schedules and locations, and write challenge questions                 | [Events and questions](../architecture/author-curation-api-contract.md) |
| **Cards**          | Define Creature moves and Power-card effects, then prepare cards for publication          | [Author cards](./author-cards.md)                                       |
| **Campaigns**      | Schedule published events and trails together                                             | [Campaigns](../architecture/campaign-scheduling-api-contract.md)        |
| **Content review** | Review another Author's submissions, approve or return them, and publish approved content | [Review and publish](../architecture/diagrams/content-review.md)        |
| **Placement**      | Preview and apply automatic event assignments, manage overrides, and request rollback     | [Event placement](../architecture/automatic-event-placement-service.md) |
| **Player review**  | Inspect trust cases, record decisions, and apply supported temporary restrictions         | [Moderation and trust](../requirements/longitudinal-trust-policy.md)    |
| **Analytics**      | Inspect aggregate event activity, question outcomes, and card rewards                     | [Analytics overview](./author-analytics.md)                             |

Authors can also create, reorder, publish, and retire trails through the protected API. There is currently no trail editor in the console: see [Author trails](./author-trails.md).

## Review boundaries

An Author cannot approve or return their own latest submission. Another Author must review it. Approval and publication are separate actions, and published definitions remain immutable. See [Review and publish](../architecture/diagrams/content-review.md) for the shared lifecycle.

Player review also prevents decisions about the reviewer's own account. Trust scores prioritise human review; they do not impose restrictions automatically. The console supports temporary activity restrictions, while player appeal submission and appeal resolution remain unimplemented.

Some operations remain outside the console: placement site/zone lifecycle changes use the API, and starter packages and evolution relationships are configured separately from card authoring. The linked guides distinguish available controls from these implementation boundaries.

**AI declaration**

This guide was written and checked against the current Author UI and API with assistance from Codex[GPT-6].
