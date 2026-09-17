---
title: 'Battle database relationships'
---

# Battle database relationships

CPU battles, asynchronous player battles, and live player battles have
separate persistence models. Each keeps match-owned snapshots and
server-controlled state, so changing a saved deck or consuming an owned card
does not rewrite a running match.

These views show selected tables and foreign-key relationships. `||` means one,
`o|` means zero or one, `o{` means zero or many, and `|{` means one or many.
Exact constraints and lifecycle rules remain in the linked storage references.

## 1. CPU matches, snapshots and action history

<div className="diagram-scroll" role="region" aria-label="CPU battle database relationships" tabIndex={0}>

```mermaid
erDiagram
    accTitle: CPU battle database relationships
    accDescr: Players own CPU matches. Matches retain card snapshots and rounds, with ordered actions attached to each round. Definitions describe the cards used in snapshots.
    players ||--o{ cpu_matches : plays
    cpu_matches ||--|{ cpu_match_cards : snapshots
    card_definitions ||--o{ cpu_match_cards : describes
    cpu_matches ||--o{ cpu_match_rounds : records
    cpu_match_rounds ||--|{ cpu_match_actions : contains
    cpu_matches {
        uuid id PK
        uuid player_id FK
        uuid player_deck_id FK
        jsonb state
        integer version
    }
    cpu_match_cards {
        uuid id PK
        uuid match_id FK
        uuid card_definition_id FK
        jsonb snapshot
    }
    cpu_match_rounds {
        uuid id PK
        uuid match_id FK
        integer round_number
    }
    cpu_match_actions {
        uuid id PK
        uuid match_id FK
        uuid round_id FK
        uuid submission_id
        integer sequence
    }
```

</div>

The match stores current state and its version. Its card snapshots retain the
battle inputs; rounds and actions preserve what happened. The action's compound
round/match foreign key prevents it from being attached to another match's
round. The direct action-to-match link is omitted from the picture for clarity.

The source `player_deck_id` can become null when the saved deck is deleted.
Snapshot `owned_card_id` values are historical identifiers, not foreign keys to
current ownership rows. A player's active-match uniqueness constraint and
transactional row locking prevent conflicting updates. Repeating a submission
returns its recorded response instead of applying the action again.

Source: [CPU match storage and API](../../database/cpu-match-persistence-design.md)
and migration `0012_create_cpu_matches.sql`. Cardinalities describe committed
game records; the server also checks roster and battle rules.

## 2. Player invitations, participants and actions

<div className="diagram-scroll" role="region" aria-label="Asynchronous player battle database relationships" tabIndex={0}>

```mermaid
erDiagram
    accTitle: Asynchronous player battle database relationships
    accDescr: An invitation can create one match. Players join through match participants, each using a private deck snapshot. Participant actions are stored in order.
    async_pvp_invitations ||--o| async_pvp_matches : accepted_as
    async_pvp_invitations ||--o{ async_pvp_deck_snapshots : snapshots
    async_pvp_matches ||--|{ async_pvp_match_participants : has
    players ||--o{ async_pvp_match_participants : participates
    async_pvp_deck_snapshots ||--o| async_pvp_match_participants : used_by
    async_pvp_match_participants ||--o{ async_pvp_match_actions : submits
    async_pvp_invitations {
        uuid id PK
        uuid challenger_player_id FK
        uuid challenged_player_id FK
    }
    async_pvp_matches {
        uuid id PK
        uuid invitation_id FK
        integer version
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
        uuid submission_id
        integer sequence
    }
```

</div>

An invitation identifies the challenger and challenged player through separate
foreign keys to `players`. Acceptance creates one match with two participants.
The participant's compound snapshot/player foreign key binds its deck snapshot
to the correct player, and an action's compound match/actor key binds the action
to a participant in that match.

`async_pvp_deck_snapshots` is in the **private** schema; the other relations
shown here are in `public`. Private card snapshots, match state, transitions,
and submission receipts are omitted to keep this overview readable. A `public`
schema name does not make a table publicly accessible through the API: routes
still enforce authentication, ownership and safe response projections.

Server deadlines, expected versions, row locks and submission receipts govern
progress and retries. The browser does not choose the winner or disclose the
opponent's private deck. Internal engine side names are implementation labels;
both participants in this model are human players.

Source: [asynchronous player battle storage](../../database/asynchronous-pvp-persistence.md),
[the API contract](../asynchronous-pvp-api-contract.md), and migration
`0028_create_asynchronous_pvp_persistence.sql`.

## 3. Live player matches, connections and transition history

<div className="diagram-scroll" role="region" aria-label="Live player battle database relationships" tabIndex={0}>

```mermaid
erDiagram
    accTitle: Live player battle database relationships
    accDescr: A live match has two participants with private deck snapshots. Match versions point to private current state and append spectator-safe transition history. Short-lived ticket digests create participant or spectator access records, while participant messages retain private idempotency receipts.
    live_pvp_matches ||--|{ live_pvp_match_participants : has
    players ||--o{ live_pvp_match_participants : participates
    live_pvp_deck_snapshots ||--o| live_pvp_match_participants : used_by
    live_pvp_matches ||--|| live_pvp_match_states : current_state
    live_pvp_matches ||--o{ live_pvp_match_actions : records
    live_pvp_match_actions ||--|| live_pvp_match_transitions : has_private_transition
    live_pvp_match_participants ||--o{ live_pvp_submission_receipts : submits
    live_pvp_connection_tickets ||--o| live_pvp_connection_access : redeems_as
    live_pvp_matches ||--o{ live_pvp_completion_sources : completes
    live_pvp_matches {
        uuid id PK
        integer version
        text phase
        uuid current_actor_player_id FK
        timestamptz turn_deadline
        uuid winner_player_id FK
    }
    live_pvp_match_participants {
        uuid match_id PK, FK
        uuid player_id PK, FK
        uuid deck_snapshot_id FK
        integer consecutive_timeout_count
        bigint connection_generation
    }
    live_pvp_match_actions {
        uuid id PK
        uuid match_id FK
        integer committed_version
        text transition_kind
        uuid actor_player_id FK
    }
    live_pvp_connection_tickets {
        uuid id PK
        bytea ticket_digest
        uuid match_id FK
        uuid player_id FK
        text role
        timestamptz expires_at
    }
    live_pvp_connection_access {
        uuid id PK
        uuid ticket_id FK
        uuid match_id FK
        uuid player_id FK
        bigint participant_generation
    }
```

</div>

`live_pvp_matches`, `live_pvp_match_participants`, and the spectator-safe
`live_pvp_match_actions` history are in `public`. Deck/card snapshots, current
full state, authoritative transitions, ticket digests, connection access,
idempotency receipts, and completion sources are in `private`. A database
schema name is not an API authorization decision; the future realtime gateway
must still derive the connection role and construct a role-safe projection.

Gameplay `version` and participant `connection_generation` are intentionally
separate. A committed battle transition advances the gameplay version and
appends one public/private transition pair. Redeeming a newer participant ticket
advances only that participant's connection generation and supersedes the old
connection without changing battle state or the one-minute deadline.

Source: [live player battle storage](../../database/live-pvp-persistence.md),
[the live PvP contract](../live-pvp-api-contract.md), and migration
`0044_create_live_pvp_persistence.sql`.

## Related diagrams

- [Players, challenges, cards, decks and progression](database-relationships.md).
- [Events and ordered-trail membership](../../database/event-schema.md).
- [All diagrams](index.md).

## AI declaration

Prepared from repository migrations and battle persistence contracts with
assistance from Codex-CLI[GPT-6] and ChatGPT-Web[GPT-5.6 Sol].
