---
title: 'Data relationships'
---

# Data relationships

These views show the main relationships behind events, cards, decks, and
progression. Each includes selected columns; the linked database references
define the full schema and constraints.

In the notation below, `||` means exactly 1, `o|` means 0 or 1, and `o{`
means 0 or more. `PK` marks a primary key and `FK` marks a foreign key.
Compound references are simplified in the diagrams and explained in the text.

## Events and challenge results

<div className="diagram-scroll" role="region" aria-label="Events, attempts, completions, and reward records" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Events connect challenge versions to player attempts and rewards
    accDescr: Players start attempts for event challenge versions. An attempt can have one completion, which retains normal card reward records referring to card definitions. Direct player and event references are omitted where the chain already shows the relationship.

    events ||--o{ event_challenges : versions
    event_challenges ||--o{ challenge_attempts : attempted
    players ||--o{ challenge_attempts : starts
    challenge_attempts ||--o| event_completions : completes
    event_completions ||--o{ event_completion_card_rewards : records
    card_definitions ||--o{ event_completion_card_rewards : awarded

    events {
        uuid id PK
        geography location
    }
    event_challenges {
        uuid id PK
        uuid event_id FK
        text status
    }
    players {
        uuid id PK
    }
    challenge_attempts {
        uuid id PK
        uuid player_id FK
        uuid challenge_id FK
    }
    event_completions {
        uuid id PK
        uuid attempt_id FK
    }
    event_completion_card_rewards {
        uuid completion_id PK, FK
        smallint reward_position PK
        uuid card_definition_id FK
    }
    card_definitions {
        uuid id PK
    }
```

</div>

An event can retain several challenge versions, with at most 1 published
version. A player has at most 1 attempt and 1 completion per event. Compound
foreign keys bind each attempt to the correct event and challenge, and each
completion to the same player and event.

Finalisation stores the normal reward records and owned card copies together.
The reward record preserves the original award if a copy is later consumed or
traded. Territory owner bonuses use separate decision records linked to the
completion.

See [challenge and reward storage](../../database/challenge-reward-persistence-design.md)
and [territory storage](../../database/contested-campus-territory-persistence.md).

## Card ownership and decks

<div className="diagram-scroll" role="region" aria-label="Card definitions, owned copies, and saved decks" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Saved decks reference individual owned card copies
    accDescr: Players own copies of card definitions and save decks. Deck slots reference owned copies belonging to that deck's player. A selection record identifies the player's active deck.

    players ||--o{ player_cards : owns
    card_definitions ||--o{ player_cards : describes
    players ||--o{ player_decks : saves
    player_decks ||--o{ player_deck_cards : slots
    player_cards ||--o{ player_deck_cards : used_in
    players ||--o| player_deck_selections : selects
    player_decks ||--o| player_deck_selections : active_as

    players {
        uuid id PK
    }
    card_definitions {
        uuid id PK
    }
    player_cards {
        uuid id PK
        uuid player_id FK
        uuid card_definition_id FK
    }
    player_decks {
        uuid id PK
        uuid player_id FK
    }
    player_deck_cards {
        uuid deck_id PK, FK
        smallint position PK
        uuid owned_card_id FK
    }
    player_deck_selections {
        uuid player_id PK, FK
        uuid deck_id FK
    }
```

</div>

A definition describes a card; `player_cards` identifies a particular owned
copy. Copies of the same definition remain separate assets. Compound foreign
keys ensure that a deck and its referenced copies belong to the same player.

A copy can appear in several saved decks, but only once in a particular deck.
The API checks current ownership and deck legality before battle; a saved deck
is not automatically playable. Battle snapshots preserve the cards used even
when later collection changes affect the source deck.

See [saved decks](../../database/saved-deck-persistence-design.md),
[evolution](../../requirements/card-evolution-rules.md), and
[trading storage](../../database/card-trading-persistence.md).

## Progression and achievements

<div className="diagram-scroll" role="region" aria-label="Point awards, progression summaries, and achievement unlocks" tabIndex={0}>

```mermaid
erDiagram
    direction TB
    accTitle: Point awards drive progression summaries and achievements
    accDescr: Players receive point awards under versioned rules. Progression state summarises those awards, while achievement unlocks refer to shared definitions and the award that earned them.

    players ||--o{ player_point_awards : earns
    progression_point_rules ||--o{ player_point_awards : governs
    players ||--o| player_progression_state : summary
    players ||--o{ player_achievement_unlocks : unlocks
    achievement_definitions ||--o{ player_achievement_unlocks : defines
    player_point_awards ||--o{ player_achievement_unlocks : source

    players {
        uuid id PK
    }
    progression_point_rules {
        text rule_code PK
        integer version PK
    }
    player_point_awards {
        uuid id PK
        uuid player_id FK
        text rule_code FK
        integer rule_version FK
    }
    player_progression_state {
        uuid player_id PK, FK
        integer total_points
    }
    player_achievement_unlocks {
        uuid player_id PK, FK
        text achievement_code PK, FK
        uuid source_award_id FK
    }
    achievement_definitions {
        text code PK
    }
```

</div>

The point-award ledger records each earned award; progression summaries support
all-time totals, monthly views, and streaks. Versioned rules and source
uniqueness prevent a repeated request from earning the same award twice.

Permanent points are separate from ranked seasonal ratings. The current game
does not use the legacy coin economy.

See [progression storage](../../database/player-progression-persistence.md)
and [progression rules](../../requirements/player-progression-rules.md).

## Ordered trails

<div className="diagram-scroll" role="region" aria-label="Ordered trail membership and event content" tabIndex={0}>

```mermaid
erDiagram
    direction LR
    accTitle: Trails order existing events through membership rows
    accDescr: Trail membership links a trail to events and assigns each event a position. Player progress is calculated from completions rather than stored as a trail cursor.

    trails ||--o{ trail_events : orders
    events ||--o{ trail_events : included

    trails {
        uuid id PK
        text status
    }
    trail_events {
        uuid trail_id PK, FK
        uuid event_id PK, FK
        smallint position
    }
    events {
        uuid id PK
    }
```

</div>

Trail progress is derived from ordered membership and the player's completed
events. Campaigns group events and trails through separate membership tables
and apply their own publication and schedule rules. Automatically placed
events also have assignment history; their effective location can differ from
the authored location or exist when that location is unset.

See [trail storage](../../database/ordered-trails-persistence.md),
[campaign storage](../../database/campaign-scheduling-persistence.md), and
[placement storage](../../database/automatic-event-placement-persistence.md).

## Related data

[Battle relationships](database-battles.md) covers match snapshots, actions,
connections, and ranked settlements. The [database guide](../../database/overview.md)
links the remaining domains, including profile, identity, moderation, and analytics.

Account deletion removes player-owned records according to the
[deletion contract](../../database/account-deletion-retention.md). Retained shared
history uses a separate, profile-free historical actor; a historical actor is
not an active player account.

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-6]
and Codex[GPT-6].
