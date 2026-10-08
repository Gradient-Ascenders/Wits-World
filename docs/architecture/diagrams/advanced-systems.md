---
title: 'Advanced systems'
---

# Advanced systems

Live competition, territories, trading, placement, moderation, and analytics
use services inside the Fastify API. These views show how their responsibilities
connect through shared game state and saved results.

## Live, ranked, and territory flow

<div className="diagram-scroll" role="region" aria-label="Ranked matchmaking, live battles, and territory influence" tabIndex={0}>

```mermaid
flowchart TB
    accTitle: Ranked play connects live battles to ratings and territories
    accDescr: Ranked queue entries form proposals. When both players accept and server checks pass, the API creates a live match with deck and rating snapshots. The committed result feeds rating settlement and eligible territory influence. Territory access is captured before the battle.

    Queue["Ranked queue<br/>Player, deck, and renewable lease"]
    Proposal["Match proposal<br/>Both players accept"]
    Match["Live match<br/>Deck and rating snapshots"]
    Access["Territory access<br/>Eligible zone grant snapshot"]
    Battle["Battle service<br/>Shared engine and server deadlines"]
    Result[("Committed match result")]
    Rating["Ranked settlement<br/>Rating inputs and ledger"]
    Territory["Territory contribution<br/>Eligible winner and zone"]
    Ownership["Zone settlement<br/>Influence and ownership"]

    Queue --> Proposal
    Proposal -->|"Recheck players and decks"| Match
    Access -->|"Captured at match creation"| Match
    Match --> Battle --> Result
    Result --> Rating
    Rating -->|"Eligible ranked win"| Territory
    Territory --> Ownership

    classDef authority stroke:#9d8130,stroke-width:2px;
    class Result authority;
```

</div>

Ranked competition creates live matches after proposal acceptance. Rating
settlement uses the saved inputs and terminal result; casual live matches do
not receive ranked rating changes.

Territory influence additionally requires eligible zone access captured for
the match and an eligible ranked win. Owning a zone can provide a separate
challenge-card bonus. Season standings, territory ownership, and permanent
progression are distinct records.

## Other feature services

<div className="diagram-scroll" role="region" aria-label="Shared API entry point for trading and Author services" tabIndex={0}>

```mermaid
flowchart TB
    accTitle: Trading and Author tools share the API and database
    accDescr: Player and Author requests pass account, role, ownership, and resource checks before reaching trading, placement, trust review, or analytics services. Each uses PostgreSQL, and placement uses PostGIS. Reads return selected views; writes use transactions.

    Request["Player or Author request"]
    Guard["API access checks<br/>Account, role, and resource"]
    Trade["Trading<br/>Versioned offers and reservations"]
    Placement["Placement<br/>Reviewed sites and assignment history"]
    Trust["Moderation<br/>Evidence, cases, and decisions"]
    Analytics["Analytics<br/>Content aggregates"]
    DB[("PostgreSQL / PostGIS")]

    Request --> Guard
    Guard --> Trade & Placement & Trust & Analytics
    Trade & Placement & Trust & Analytics --> DB

    classDef authority stroke:#9d8130,stroke-width:2px;
    class Guard,DB authority;
```

</div>

Trading settles both sides of an exchange in one transaction after rechecking
ownership and reservations. Placement previews a plan before applying it and
retains assignment history when events rotate.

Trust signals support human review and explicit restriction decisions.
Author reports use aggregate projections; advanced analytics suppress small
samples, while the separate question-curation report has its own reporting
rules. Neither interface exposes raw player-location trails.

## Delivery and coordination

Live WebSockets deliver participant- or spectator-safe views. The API commits
an action before distributing it; PostgreSQL notifications prompt other API
instances to reload the same state. Tickets and connection generations govern
access and reconnects independently of gameplay versions.

Upstash Redis supplies shared HTTP limits and gameplay activity coordination.
Scheduling defaults to polling; optional coordinated idle scheduling changes
worker discovery, not battle rules or database authority. See
[Integrations](../external-integrations.md#upstash-redis) for that boundary.

## Detailed references

| System             | API or policy                                                   | Storage                                                                                      |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Live battles       | [Live PvP](../live-pvp-api-contract.md)                         | [Matches and connections](../../database/live-pvp-persistence.md)                            |
| Ranked competition | [Matchmaking](../ranked-matchmaking-api-contract.md)            | [Seasons and rating history](../../database/ranked-competition-persistence.md)               |
| Territories        | [Territory API](../contested-campus-territory-api-contract.md)  | [Grants, influence, and ownership](../../database/contested-campus-territory-persistence.md) |
| Trading            | [Trading API](../card-trading-api-contract.md)                  | [Offers and exchange](../../database/card-trading-persistence.md)                            |
| Placement          | [Placement service](../automatic-event-placement-service.md)    | [Plans and assignments](../../database/automatic-event-placement-persistence.md)             |
| Moderation         | [Trust policy](../../requirements/longitudinal-trust-policy.md) | [Evidence and decisions](../../database/trust-persistence.md)                                |
| Analytics          | [Reporting API](../advanced-analytics-api-contract.md)          | [Aggregates and privacy](../../database/advanced-analytics.md)                               |

External developer access is a separate read-only boundary, described in
[System context](system-context.md) and [Developer API](../developer-api.md).

**AI declaration:** Prepared and updated with assistance from
Codex-CLI[gpt-6-sol] and Codex[GPT-6].
