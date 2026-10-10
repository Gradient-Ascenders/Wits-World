---
title: Cards and decks API
description: Read a collection, claim starter cards, manage saved decks, and evolve eligible copies safely.
---

# Cards and decks API

The cards and decks API manages the authenticated player's owned copies and
saved battle decks. The server owns card eligibility, deck validation, starter
grants, and evolution results. Clients identify owned copies; they do not grant,
consume, reserve, or transform cards locally.

See [Collections and decks](../requirements/player-deck-building-journey.md) and
[Evolving cards](../requirements/card-evolution-rules.md) for the player
journeys. Trading uses the separate [Trading API](card-trading-api-contract.md).

## Access and routes

All routes begin with `/api/v1` and require bearer authentication and an active
player account.

| Method | Route                                               | Purpose                                      |
| ------ | --------------------------------------------------- | -------------------------------------------- |
| GET    | `/cards/collection`                                 | List the player's owned card copies.         |
| GET    | `/cards/starter-options`                            | Compare the available starter packages.      |
| POST   | `/cards/starter`                                    | Claim one starter package.                   |
| GET    | `/cards/evolutions/:sourceCardDefinitionId/preview` | Check one evolution without reserving cards. |
| POST   | `/cards/evolutions`                                 | Consume 3 copies and grant the evolved card. |
| GET    | `/decks`                                            | List saved decks and the active selection.   |
| POST   | `/decks`                                            | Create a saved deck.                         |
| PUT    | `/decks/:deckId`                                    | Replace a saved deck's name and cards.       |
| DELETE | `/decks/:deckId`                                    | Delete a saved deck.                         |
| PUT    | `/decks/:deckId/selection`                          | Make a valid saved deck active.              |

The [OpenAPI reference](../api-reference.md#http-reference) owns exact request
and response schemas. Successful JSON responses include `requestId`.

## Collection and starter cards

`GET /cards/collection` returns individual owned copies with their catalogue
and acquisition fields. Send `unique=true` to receive only the newest owned
copy of each card definition. This is a display filter; it does not merge or
delete duplicates.

Send `deckId=<UUID>` to read only copies currently in a saved deck owned by the
caller. Missing, deleted, and foreign decks return the same empty collection.
Invalid UUIDs return `400`. Combining `deckId` with `unique=true` selects the
newest copy of each definition within that deck. Responses retain the same
metadata; the filter does not reserve cards or validate battle readiness.

`GET /cards/starter-options` returns the currently approved Spark, Grit, and Wit
packages. Each package contains 3 Common Creatures and 2 Common Power cards.
Claim one by sending:

```json
{
  "affinity": "spark"
}
```

The first successful claim returns `201`. Repeating the same affinity returns
the saved grant with `200` and does not issue more cards. A different affinity
after a claim returns `409 STARTER_ALREADY_CLAIMED`. If a response is lost,
repeat the same affinity rather than trying a different one.

## Saved decks

Create or replace a deck with a name and exactly 5 owned-copy identifiers:

```json
{
  "name": "Great Hall Five",
  "ownedCardIds": [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
    "00000000-0000-0000-0000-000000000004",
    "00000000-0000-0000-0000-000000000005"
  ]
}
```

The server trims the name and validates ownership, availability, order, and the
Basic deck rules: 3 Creatures, 2 Power cards, distinct owned copies, and at most
10 rarity points. A copy reserved by an unfinished trade is unavailable. The
same owned copy may appear in different saved decks, but not twice in one deck.

Deck responses include `deckId`, `name`, `isSelected`, `totalPoints`, timestamps,
and the 5 ordered cards. Selecting a deck revalidates its current cards before
making it the player's single active selection. Deleting the active deck clears
that selection without deleting any cards.

Deck mutations have no `submissionId` or `expectedVersion`. A `PUT` replaces the
whole name and lineup, so reload before editing from another client. After an
uncertain create response, list decks before creating again because creation
does not have an idempotency key.

## Evolution preview and command

Preview a source definition before evolving it. The response identifies the
fixed target, the 3-copy requirement, owned and eligible counts, each copy's
lock reason, and `canEvolve`. A preview is current information, not a reservation;
the command rechecks every condition.

Submit an evolution with one caller-generated UUID for that intended command:

```json
{
  "submissionId": "00000000-0000-0000-0000-000000000010",
  "sourceCardDefinitionId": "00000000-0000-0000-0000-000000000020"
}
```

The server locks the owned copies, selects the 3 newest eligible copies, consumes
them, and grants the fixed target in one transaction. Copies used by any saved
deck or reserved by an unfinished trade are protected.

A new evolution returns `201`; an identical replay returns `200` with
`replayed: true` and the original result. Retry an uncertain response with the
same `submissionId` and source definition. Never reuse that identifier for a
different source.

## Errors and recovery

| Response                              | Caller action                                                          |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `400 STARTER_AFFINITY_NOT_ALLOWED`    | Reload starter options and choose a supported affinity.                |
| `400 INVALID_DECK_CARDS`              | Refresh the collection and replace unavailable or reserved copies.     |
| `400 DECK_SIZE_INVALID`               | Send exactly 5 owned-copy identifiers.                                 |
| `400 DECK_COPY_DUPLICATED`            | Use 5 distinct owned copies.                                           |
| `400 DECK_COMPOSITION_INVALID`        | Use exactly 3 Creatures and 2 Power cards.                             |
| `400 DECK_POINT_CAP_EXCEEDED`         | Reduce the lineup to at most 10 rarity points.                         |
| `404 DECK_NOT_FOUND`                  | Remove the unavailable deck from local state.                          |
| `404 EVOLUTION_NOT_AVAILABLE`         | Refresh the catalogue; the source has no active evolution.             |
| `409 STARTER_ALREADY_CLAIMED`         | Keep the existing starter affinity.                                    |
| `409 STARTER_CATALOGUE_UNAVAILABLE`   | Delay the first claim and reload the available packages.               |
| `409 EVOLUTION_COPIES_INSUFFICIENT`   | Refresh the collection and obtain more copies.                         |
| `409 EVOLUTION_COPIES_DECK_LOCKED`    | Remove enough source copies from every saved deck, then preview again. |
| `409 EVOLUTION_COPIES_TRADE_RESERVED` | End the relevant trade reservation, then preview again.                |
| `409 EVOLUTION_REPLAY_CONFLICT`       | Do not change the intent attached to a used submission ID.             |

Collection and deck reads are private to the authenticated player. Missing and
foreign deck identifiers share the same not-found response. See
[deck storage](../database/saved-deck-persistence-design.md) for transaction
details and [card reward storage](../database/challenge-reward-persistence-design.md)
for ownership provenance.

## AI declaration

Prepared with assistance from Codex[GPT-6], using card, evolution, and saved-deck
route schemas and transaction behaviour.
