# Player saved-deck journey

## Scope and authority

The protected `/decks` route lets an authenticated player create, inspect,
edit, rename, delete, and select saved decks. It prepares one active deck for
the CPU-match journey without creating or playing a match.

The authoritative rules are [Wits Quest Basic Game Rules, Saved decks](./basic-game-rules.md#saved-decks).
Persistence, HTTP operations, concurrency, and the match-snapshot boundary are
defined by the [saved-deck persistence and API design](../database/saved-deck-persistence-design.md).

The browser presents an explanatory preflight, but it never submits or decides
authoritative ownership, category, rarity, point totals, player identity, or
deck validity. A successful API response is the only saved result.

## Initial load

After Auth0 resolves the active player, the route requests these protected
resources together:

```http
GET /api/v1/decks
GET /api/v1/cards/collection
```

The saved-deck response supplies the server-saved composition and active
selection. The collection response supplies every exact `ownedCardId` the
picker may use. The browser does not create synthetic copies or expose an add
action after every returned copy of a definition is already used in the draft.

`GET /api/v1/decks` does not expose a per-deck invalid status. The #72 service
runs the authoritative Basic validator while mapping every saved deck, and its
response schema requires exactly five cards and a five-to-ten-point total. A
persisted invariant failure therefore fails the list request instead of
returning an individually invalid deck. The client keeps schema parsing strict;
the invalid states handled by this journey are incomplete local drafts and
server validation rejections during create, update, or selection.

Loading, empty, expired-session, malformed-response, network, and API failure
states are written as text. General failures provide a fresh load; an expired
session provides an Auth0 sign-in action that returns to `/decks`.

## Basic deck explanation

Before the editor, the route explains the confirmed Basic constraints:

- exactly five owned copies;
- three Creature cards and two Power cards;
- at most ten rarity points;
- Common costs one point, Rare two, Epic three, and Legendary four; and
- using a definition twice in one deck requires two separately owned copies.

The draft summary mirrors those confirmed values to explain the current count,
composition, and point total. Save remains unavailable while the local draft is
obviously incomplete. This is guidance only: the API re-resolves the selected
owned copies and applies its authoritative validation on every create, update,
and selection.

## Owned-copy picker

Cards retain the collection experience's name, category, affinity, rarity,
artwork/fallback, acquisition, and duplicate presentation. Category and rarity
are always text, not colour-only signals.

Copies that share one card definition appear as one picker choice with explicit
`Owned`, `Used`, and `Remaining` counts. `Add a copy` selects the next unused
`ownedCardId`; `Remove a copy` returns one selected copy. When a player owns
`N` copies, remaining reaches zero after `N` additions and the add action is
disabled. The same exact owned copy may still be reused by another saved deck,
as allowed by the server rules.

The ordered draft lists each chosen copy and provides a normal remove button.
Drag-and-drop is not required.

## Save and management operations

Creating sends only:

```json
{
  "name": "Campus Five",
  "ownedCardIds": ["five exact owned-copy UUIDs"]
}
```

Editing or renaming uses the same complete name-and-composition body with
`PUT /api/v1/decks/{deckId}`. This preserves the API's atomic replace contract;
the frontend does not invent a separate rename operation.

Delete first presents an inline confirmation. Deletion removes the saved deck,
not collection cards. Deleting the active deck leaves no active selection, as
defined by the database cascade.

Server errors map to the closest useful feedback:

| API code                   | Player-facing feedback                                      |
| -------------------------- | ----------------------------------------------------------- |
| `INVALID_DECK_NAME`        | deck-name feedback                                          |
| `INVALID_DECK_CARDS`       | selected owned copies are no longer available               |
| `DECK_SIZE_INVALID`        | exactly five copies are required                            |
| `DECK_COPY_DUPLICATED`     | the same owned copy was submitted twice                     |
| `DECK_COMPOSITION_INVALID` | exactly three Creature and two Power cards are required     |
| `DECK_POINT_CAP_EXCEEDED`  | the server-calculated total exceeds ten points              |
| `DECK_NOT_FOUND`           | stale/deleted deck explanation and an authoritative refresh |

The failed-action alert receives focus so keyboard and assistive-technology
users reach it immediately.

## Active selection and CPU-match handoff

`PUT /api/v1/decks/{deckId}/selection` revalidates a saved deck and makes it
the player's one active selection. The active deck has explicit text and a
`Selected for matches` badge; colour is supplementary.

The production `/decks` route supplies the active server-returned `deckId` to
`POST /api/v1/matches/cpu` through the typed start callback. It renders **Start
CPU match**, reconciles an already-active match through the server lookup, and
navigates to the authoritative match route. The match service independently
requires the supplied deck to remain the player's active selection and creates
immutable match-owned snapshots.

## Concurrency and recovery

The saved-deck API has no browser-visible version or conditional-update field.
Concurrent updates serialize on the server and the last completed whole-deck
update wins. The frontend therefore does not invent optimistic versions.

If an edit, selection, or deletion targets a deck that no longer exists, the
API returns `DECK_NOT_FOUND`. The route describes the stale state, closes an
editor for that unavailable deck, and reloads both authoritative decks and
collection. Other server validation errors keep the current draft available so
the player can correct it.

Each mutation is single-flight, obsolete loads are aborted, and responses from
aborted requests do not replace current UI state.

## Accessibility and responsive behaviour

- All add, remove, save, edit, rename, select, delete, retry, and match-start
  actions are native controls with visible focus and at least the shared touch
  target size.
- Important loading and success transitions use status announcements; failures
  use alerts; editor, saved-list, and active-deck headings receive programmatic
  focus where the context changes. Draft preflight remains live without moving
  focus away from the card-picker control.
- Card category, affinity, rarity, owned count, used count, remaining count,
  active state, and validation are communicated in text.
- The editor is one column on mobile and becomes a draft/picker comparison at
  desktop widths. Controls remain usable at 360px, 390px, tablet, and desktop.

## AI declaration

This document was generated and edited with assistance from Codex[GPT-5].
