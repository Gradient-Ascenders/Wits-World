---
title: 'Challenges and rewards'
---

# Challenges and rewards

The API saves a challenge attempt before play begins, marks submitted answers,
and records the result and rewards together. The browser displays that saved
state and supplies answer intent.

## Start an online attempt

<div className="diagram-scroll" role="region" aria-label="Online challenge eligibility and attempt creation" tabIndex={0}>

```mermaid
sequenceDiagram
    accTitle: Starting or reopening an online challenge
    accDescr: The API checks identity and reads the event and any existing attempt. An existing attempt is returned. An eligible new attempt saves five question snapshots and a server deadline; the browser receives playable questions without answer keys.

    participant Web as Player Web
    participant API as API
    participant DB as PostgreSQL / PostGIS

    Web->>API: Start challenge with reported location
    Note over API: Validate identity and request
    API->>DB: Load event and existing attempt
    alt Attempt already exists
        DB-->>API: Saved attempt or completed result
        API-->>Web: Resume the same record
    else New attempt
        API->>DB: Check availability, distance, and movement evidence
        Note over API,DB: Create only when access checks pass
        API->>DB: Save 5 question snapshots and deadline
        DB-->>API: Committed attempt
        API-->>Web: Questions and deadline, without answer keys
    end
```

</div>

Starting again for the same event resumes the player's existing attempt or
result. For a new attempt, the API checks current event and challenge
availability, reported-location policy, and movement evidence. A rejected start
creates no playable attempt.

Question snapshots preserve the content selected for that attempt. Timing is
server-owned; a browser countdown only displays the deadline. Territory owner
bonus eligibility is also captured at challenge start where applicable.

## Answers and completion

<div className="diagram-scroll" role="region" aria-label="Answer submission and atomic challenge completion" tabIndex={0}>

```mermaid
sequenceDiagram
    accTitle: Accepted answers lead to one committed result
    accDescr: The API locks the attempt and checks its state and deadline. Accepted answers are marked against private data and stored. When the attempt finishes, the same transaction records completion, normal rewards, any eligible territory bonus, and progression. Reopening returns the saved result.

    participant Web as Player Web
    participant API as API
    participant DB as PostgreSQL

    Web->>API: Submit choice or ordering
    API->>DB: Lock attempt and load answer data with deadline
    Note over API,DB: Validate and mark on the server
    API->>DB: Store accepted answer
    alt More questions remain
        DB-->>API: Commit active attempt
        API-->>Web: Updated attempt
    else Attempt finishes
        rect rgba(157, 129, 48, 0.12)
            Note over API,DB: One transaction
            API->>DB: Save completion and normal card rewards
            API->>DB: Apply eligible territory bonus and progression
            DB-->>API: Commit completed result
        end
        API-->>Web: Score, review, and awarded cards
    end
    Web->>API: Reopen after completion or lost response
    API->>DB: Read stored result
    API-->>Web: Same result and rewards
```

</div>

Invalid, late, or conflicting submissions follow the
[attempt contract](../challenge-attempt-api-contract.md). Request-time expiry
can also finalise an attempt, including when its status is fetched; completion
does not depend on a browser timer or a guaranteed background tick.

Normal score-based rewards contain 0, 1, or 2 cards. An eligible territory owner
can receive 1 additional Common card under the
[owner-bonus policy](../../requirements/contested-campus-zone-policy.md#owner-card-bonus).
The completion, reward records, owned copies, bonus decision, and progression
changes commit together. Reopening cannot reroll the award.

## Offline reconciliation

<div className="diagram-scroll" role="region" aria-label="Offline attempt storage and server reconciliation" tabIndex={0}>

```mermaid
flowchart LR
    accTitle: Offline completion becomes authoritative after reconciliation
    accDescr: The API issues a signed pack. The browser stores local answers in IndexedDB and submits them when online. Server validation and finalisation produce the accepted result and a saved receipt.

    Pack["API-issued signed pack<br/>Playable content"]
    Local["IndexedDB attempt<br/>Pending answers"]
    Sync["API reconciliation<br/>Validate and finalise"]
    Result[("Saved result and receipt")]

    Pack --> Local
    Local -->|"When online"| Sync
    Sync --> Result

    classDef authority stroke:#9d8130,stroke-width:2px;
    class Result authority;
```

</div>

A local completion is provisional. Reconciliation checks the signed pack,
account binding, timing, source content, location claims, and answers before
using the completion finaliser. A saved receipt makes delivery retries safe.
The [offline contract](../offline-challenge-play.md) defines its timing and
conflict rules.

See [challenge storage](../../database/challenge-reward-persistence-design.md)
for snapshots and reward records, and
[location eligibility](../../database/event-eligibility.md) for spatial checks.

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-6]
and Codex[GPT-6].
