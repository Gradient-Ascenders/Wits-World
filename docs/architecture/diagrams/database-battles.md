---
title: 'Battle relationships'
---

# Battle relationships

CPU, asynchronous, and live battles have separate match records. Each snapshots
its battle inputs and saves server-controlled state, so later changes to a
collection or deck do not rewrite a running match.

These diagrams show selected tables and columns. `||` means exactly 1, `o|`
means 0 or 1, `o{` means 0 or more, and `|{` means 1 or more. `PK` and
`FK` mark primary and foreign keys. Where a match requires exactly 2
participants, the text states that rule.

## CPU battles

<div className="diagram-scroll" role="region" aria-label="CPU match state, card snapshots, rounds, and actions" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: CPU matches retain snapshots and ordered actions
    accDescr: A player owns CPU matches. Each match stores card snapshots and rounds; rounds contain actions. The match's state and version provide the current authoritative position.

    players ||--o{ cpu_matches : plays
    cpu_matches ||--o{ cpu_match_cards : snapshots
    cpu_matches ||--o{ cpu_match_rounds : rounds
    cpu_match_rounds ||--o{ cpu_match_actions : actions

    players {
        uuid id PK
    }
    cpu_matches {
        uuid id PK
        uuid player_id FK
        jsonb state
        integer version
    }
    cpu_match_cards {
        uuid id PK
        uuid match_id FK
        jsonb snapshot
    }
    cpu_match_rounds {
        uuid id PK
        uuid match_id FK
        integer round_number
    }
    cpu_match_actions {
        uuid id PK
        uuid round_id FK
        uuid submission_id
        integer sequence
    }
```

</div>

The match stores current state and a version. Snapshot rows preserve the cards
used, while rounds and actions record play. An action's compound round/match
reference prevents it from belonging to another match's round.

The optional source deck can be deleted without removing the match snapshots.
Snapshot ownership IDs identify the original copies rather than current
ownership rows. Row locks, active-match uniqueness, and submission receipts
prevent conflicting or repeated actions.

See [CPU match storage](../../database/cpu-match-persistence-design.md).

## Asynchronous player battles

<div className="diagram-scroll" role="region" aria-label="Asynchronous invitations, snapshots, participants, and actions" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Accepted invitations create asynchronous matches
    accDescr: An invitation can create one match. Its private deck snapshots belong to historical actors and are used by match participants. Exactly two participants play a committed match, and their actions are stored in order.

    async_pvp_invitations ||--o| async_pvp_matches : accepted_as
    async_pvp_invitations ||--o{ async_pvp_deck_snapshots : captures
    async_pvp_matches ||--|{ async_pvp_match_participants : participants
    player_history_actors ||--o{ async_pvp_match_participants : represented_by
    async_pvp_deck_snapshots ||--o| async_pvp_match_participants : used_by
    async_pvp_match_participants ||--o{ async_pvp_match_actions : submits

    async_pvp_invitations {
        uuid id PK
        uuid challenger_player_id FK
        uuid recipient_player_id FK
    }
    async_pvp_matches {
        uuid id PK
        uuid invitation_id FK
        integer version
    }
    async_pvp_deck_snapshots {
        uuid id PK
        uuid invitation_id FK
        uuid player_id FK
    }
    player_history_actors {
        uuid id PK
    }
    async_pvp_match_participants {
        uuid match_id PK, FK
        uuid player_id PK, FK
        uuid deck_snapshot_id FK
    }
    async_pvp_match_actions {
        uuid id PK
        uuid match_id FK
        uuid actor_player_id FK
    }
```

</div>

Acceptance creates a match with exactly 2 participants. Compound references
bind each participant's private snapshot to the correct actor and each action
to a participant in that match. Server deadlines, expected versions, locks,
and saved receipts govern turns and retries.

`player_history_actors` and the deck snapshots are in the `private` schema.
Retained PvP records reference the historical actor rather than requiring a
permanent player profile. Account deletion replaces that actor key with a
profile-free surrogate. Historical participation grants no authentication or
gameplay access.

See [asynchronous battle storage](../../database/asynchronous-pvp-persistence.md),
[the API contract](../asynchronous-pvp-api-contract.md), and
[deletion retention](../../database/account-deletion-retention.md).

## Live player battles

<div className="diagram-scroll" role="region" aria-label="Live participants, snapshots, current state, and action history" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Live battles separate current state from viewer-safe history
    accDescr: A live match has exactly two participants linked to historical actors and private deck snapshots. Private current state follows the match version; public actions record viewer-safe transitions. Full transition details remain private.

    live_pvp_matches ||--|{ live_pvp_match_participants : participants
    player_history_actors ||--o{ live_pvp_match_participants : represented_by
    live_pvp_deck_snapshots ||--o| live_pvp_match_participants : used_by
    live_pvp_matches ||--|| live_pvp_match_states : current_state
    live_pvp_matches ||--o{ live_pvp_match_actions : history

    live_pvp_matches {
        uuid id PK
        integer version
        timestamptz turn_deadline
    }
    player_history_actors {
        uuid id PK
    }
    live_pvp_match_participants {
        uuid match_id PK, FK
        uuid player_id PK, FK
        uuid deck_snapshot_id FK
        bigint connection_generation
    }
    live_pvp_deck_snapshots {
        uuid id PK
        uuid match_id FK
        uuid player_id FK
    }
    live_pvp_match_states {
        uuid match_id PK, FK
        integer version FK
        jsonb battle_state
    }
    live_pvp_match_actions {
        uuid id PK
        uuid match_id FK
        integer committed_version
    }
```

</div>

A committed transition advances the match and private state versions together.
It also appends a viewer-safe action record and a corresponding private
transition containing the full resolution. The gateway constructs participant
or spectator views from committed state.

Match state, snapshots, and historical actor anchors are private. A table in
the `public` schema still requires the API's access checks and response
projection; the schema name does not grant public access.

See [live battle storage](../../database/live-pvp-persistence.md) and
[the live API contract](../live-pvp-api-contract.md).

## Live connection access

<div className="diagram-scroll" role="region" aria-label="Live connection tickets and redeemed access records" tabIndex={0}>

```mermaid
erDiagram
    direction LR
    accTitle: Connection tickets create role-bound live access
    accDescr: An active player receives short-lived connection tickets. A ticket can be redeemed once into a participant or spectator access record. Both records are private and refer to the relevant live match.

    players ||--o{ live_pvp_connection_tickets : receives
    live_pvp_connection_tickets ||--o| live_pvp_connection_access : redeemed_as

    players {
        uuid id PK
    }
    live_pvp_connection_tickets {
        uuid id PK
        uuid match_id FK
        uuid player_id FK
        timestamptz expires_at
    }
    live_pvp_connection_access {
        uuid id PK
        uuid ticket_id FK
        text role
        bigint participant_generation
    }
```

</div>

Tickets and access rows are private, temporary records tied to a current
player account and match. Ticket digests are stored instead of raw tickets.
Spectator access cannot submit battle actions.

Redeeming a newer participant ticket advances its connection generation and
supersedes the previous connection. It does not advance the gameplay version
or restart the turn deadline. Account deletion closes connections and removes
these access records.

## Ranked result settlement

<div className="diagram-scroll" role="region" aria-label="Ranked match receipts, rating inputs, settlements, and ledger entries" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Ranked rating changes retain match inputs and settlement evidence
    accDescr: A ranked season has matchmaking receipts linked to live matches. Each receipt preserves two rating inputs and can have one settlement. Settlement records two ledger entries. Casual live matches have no ranked receipt.

    ranked_seasons ||--o{ ranked_matchmaking_receipts : contains
    live_pvp_matches ||--o| ranked_matchmaking_receipts : ranked_as
    ranked_matchmaking_receipts ||--|{ ranked_match_rating_inputs : snapshots
    ranked_matchmaking_receipts ||--o| ranked_rating_settlements : settles
    ranked_rating_settlements ||--|{ ranked_rating_ledger_entries : changes

    ranked_seasons {
        uuid id PK
        text status
    }
    live_pvp_matches {
        uuid id PK
    }
    ranked_matchmaking_receipts {
        uuid proposal_id PK, FK
        uuid match_id FK
        uuid season_id FK
    }
    ranked_match_rating_inputs {
        uuid match_id PK, FK
        uuid player_id PK, FK
        integer pre_match_rating
    }
    ranked_rating_settlements {
        uuid match_id PK, FK
        uuid season_id FK
    }
    ranked_rating_ledger_entries {
        uuid match_id PK, FK
        uuid player_id PK, FK
        integer rating_after
    }
```

</div>

An accepted ranked proposal creates a receipt linking its season and live match.
Each ranked match has exactly 2 saved rating inputs. A terminal result produces
at most 1 settlement with exactly 2 ledger entries, preventing repeat settlement.

Player season ratings and closed-season standings are stored separately from
this retained match evidence. Historical queue entries now refer directly to
the season and historical actor; they no longer depend on retaining the
player's season-rating row. The [deletion contract](../../database/account-deletion-retention.md)
defines which personal standings are removed and which shared history remains.

See [ranked storage](../../database/ranked-competition-persistence.md) and
[ranked rules](../../requirements/ranked-competition-policy.md). Territory
contributions consume eligible settled results through their
[separate storage model](../../database/contested-campus-territory-persistence.md).

[Data relationships](database-relationships.md) covers owned cards, saved
decks, challenge completions, and permanent progression.

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-6],
ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5.6 Sol], and Codex[GPT-6].
