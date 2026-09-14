---
title: 'Challenge and reward flow'
---

# Challenge and reward flow

This diagram follows an online challenge from a player's request to the stored
result. Authentication and active-account checks apply to protected requests;
the browser sends intent and reported location, never authoritative answers,
scores, or reward choices.

<div className="diagram-scroll" role="region" aria-label="Challenge and reward flow — diagram 1" tabIndex={0}>

```mermaid
sequenceDiagram
    accTitle: Server-authoritative challenge completion
    accDescr: The API checks access, persists an attempt, locks answers before its deadline, and atomically stores completion and rewards. Retried requests return the stored outcome.
    participant Web as Player browser
    participant API as Wits World API
    participant DB as PostgreSQL / PostGIS
    Web->>API: Start request with reported location
    API->>DB: Load event and check distance / existing attempt
    Note over Web,API: Validate identity, availability, location policy and movement evidence
    alt New attempt is eligible
        API->>DB: Persist five question snapshots and server deadline
        DB-->>API: Stored attempt
        API-->>Web: Questions and deadline, no answer key
    else Access fails
        API-->>Web: Safe reason and recovery guidance
    end
    loop While the attempt remains active
        Web->>API: Answer intent for attempt and question
        API->>DB: Lock attempt and check persisted state
        Note over API,DB: Enforce deadline and mark with private answer key
        API->>DB: Persist accepted answer once
        alt Attempt is complete
            Note over API,DB: Same transaction as the final answer
            API->>DB: Store completion, card rewards and progression
            DB-->>API: Committed result
            API-->>Web: Score, review and awarded cards
        else More questions remain
            API-->>Web: Safe active-attempt state
        end
    end
    Note over API,DB: A status fetch after expiry uses the same finaliser
    Web->>API: Retry / resume after a lost response
    API->>DB: Read the same persisted completion
    API-->>Web: Same result, no reward reroll
```

</div>

The answer loop applies only after an attempt exists. Invalid, late, or
conflicting answers are rejected according to the API contract; the diagram
condenses those error branches. Finalisation is part of the transaction that
handles the final answer or request-time expiry, not an independent browser
reward request. Expiry can be processed when the attempt is fetched; this does
not depict a guaranteed background timer.

The result can contain zero, one, or two cards under the current score policy.
The server stores the result before displaying it, which makes reconnects and
retries safe. Correct answers and review details are revealed after completion.
Reported location remains a claim, not proof of physical presence.

## Offline boundary

Offline play uses a separately issued challenge pack and queues answer intent
for reconciliation. A local completion is provisional: it cannot authoritatively
award cards, points, or an event completion. The server validates reconciliation
and returns the accepted result. See the
[offline challenge contract](../offline-challenge-play.md) for its own timing,
location, expiry and conflict rules; the online sequence above does not replace
that protocol.

## Sources

- [Challenges and answers API](../challenge-attempt-api-contract.md).
- [Challenge and reward storage](../../database/challenge-reward-persistence-design.md).
- [Reported-location eligibility](../../database/event-eligibility.md).
- [Start service](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/src/challenges/challenge-attempt-start.ts) and [completion finaliser](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/src/challenges/challenge-attempt-completion-finalizer.ts).

## AI declaration

Prepared from repository API contracts and implementation with assistance from
Codex-CLI[GPT-6].
