---
title: Advanced systems and authority flow
---

# Advanced systems and authority flow

This diagram extends the [application containers](application-containers.md)
with the implemented Sprint 3 services at main `c0fd42b`. Read it alongside
the [feature matrix](../../requirements/sprint-3-feature-matrix.md), not as
evidence that a deployed multi-client session has passed.

<div className="diagram-scroll" role="region" aria-label="Advanced applications and authoritative services diagram" tabIndex={0}>

```mermaid
flowchart TB
    accTitle: Advanced Wits World services and authority
    accDescr: Players and Authors use HTTPS and authenticated live WebSockets. Fastify validates intent, uses the shared battle engine, and commits authoritative data in PostgreSQL. Notifications deliver committed state. External developers have a separate read-only API-key boundary.
    Web["Player and Author browser<br/>React and Mapbox presentation"]
    Auth["Auth0<br/>Validated identity"]
    Dev["External developer<br/>X-API-Key"]
    subgraph API["Fastify API"]
        HTTP["HTTP authentication<br/>Role and object guards"]
        Live["Live gateway<br/>One-use tickets and reconnect generations"]
        Ranked["Ranked queue<br/>Rating and season settlement"]
        Territory["Zone grants<br/>Influence and ownership settlement"]
        Trade["Trade offers<br/>Reservations and atomic exchange"]
        Trust["Trust evidence and scores<br/>Human review and restrictions"]
        Placement["Walkable-site plans<br/>Preview, apply and rotation"]
        Analytics["Author analytics<br/>Bounded aggregate projections"]
        Public["Read-only developer API<br/>Revocation and per-key limits"]
        Engine["Shared game-rules package<br/>Legal actions and deterministic resolution"]
    end
    DB[("PostgreSQL and PostGIS<br/>Versions, constraints, locks and transactions")]
    Web -->|"HTTPS intent"| HTTP
    Web <-->|"WSS public/player-safe state"| Live
    Auth -->|"Validated claims"| HTTP
    HTTP -->|"Mint bounded access ticket"| Live
    HTTP --> Ranked & Territory & Trade & Trust & Placement & Analytics
    Live --> Engine
    Live -->|"Persist action and deadline"| DB
    DB -->|"Post-commit notification<br/>Reload canonical state"| Live
    Ranked & Territory & Trade & Trust & Placement & Analytics --> DB
    Dev --> Public --> DB
```

</div>

## How to read the boundaries

- **Live transport:** Socket memory is not battle authority. PostgreSQL retains
  match state, versions, connection generations, receipts and deadlines.
  Notifications wake receivers, which load the canonical committed projection.
- **Ranked and territory:** Ratings and influence consume eligible committed
  match outcomes. The browser cannot submit an authoritative winner, rating
  delta, zone membership, contribution or owner.
- **Trading:** Both sides negotiate versioned offers. Settlement rechecks
  ownership, reservations and policy limits inside the transaction; it cannot
  transfer one side while leaving the other unchanged.
- **Placement:** Reviewed sites and PostGIS distances constrain distribution.
  Preview is separate from apply. Versioned assignments retain history when
  events rotate; this is not randomized territory geometry.
- **Trust and analytics:** Trust uses bounded evidence and proportionate
  decisions. Operational analytics publish aggregate/suppressed results rather
  than raw player location or identity trails.
- **Developer access:** API keys cannot impersonate player/Author sessions.
  The current limiter is process-local; Upstash is a proposed extension, not
  part of this implemented diagram.

## Detailed references

| Boundary        | API/policy                                                      | Database                                                                                    |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Live PvP        | [Live contract](../live-pvp-api-contract.md)                    | [Match and connection persistence](../../database/live-pvp-persistence.md)                  |
| Ranked          | [Matchmaking API](../ranked-matchmaking-api-contract.md)        | [Ratings, seasons and history](../../database/ranked-competition-persistence.md)            |
| Territory       | [Territory API](../contested-campus-territory-api-contract.md)  | [Zone and settlement persistence](../../database/contested-campus-territory-persistence.md) |
| Trade           | [Trading API](../card-trading-api-contract.md)                  | [Atomic ownership exchange](../../database/card-trading-persistence.md)                     |
| Trust           | [Trust policy](../../requirements/longitudinal-trust-policy.md) | [Evidence, cases and decisions](../../database/trust-persistence.md)                        |
| Placement       | [Placement service](../automatic-event-placement-service.md)    | [Plans and assignments](../../database/automatic-event-placement-persistence.md)            |
| Analytics       | [Analytics API](../advanced-analytics-api-contract.md)          | [Aggregate data](../../database/advanced-analytics.md)                                      |
| External access | [Developer API](../developer-api.md)                            | [Key verifiers](../../database/developer-api-keys.md)                                       |

See [third-party motivations](../third-party-software-and-services.md) for the
WebSocket and service dependencies, and the
[validation snapshot](../../testing/sprint-3-validation-status.md) for recorded
checks and outstanding deployment evidence.

## AI declaration

This diagram and its explanations were generated and edited with assistance
from Codex-CLI[gpt-6-sol] using the current contracts and persistence documents.
