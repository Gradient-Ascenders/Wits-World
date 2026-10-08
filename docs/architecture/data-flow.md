---
title: 'How data moves through the system'
---

# How data moves through the system

Most operations follow the same path: the Web sends a request, the API resolves
the caller and validates the action, a service reads or changes database state,
and the API returns a view suitable for that caller.

This page describes that processing path. Player instructions and game rules
remain in the [Player guides](/docs/player-guide); endpoint details belong in
the [API overview](api-overview.md).

## A typical gameplay request

1. The Web obtains an Auth0 access token and includes it with the request.
2. The API validates the token and resolves the local account.
3. Route schemas and service checks validate the request, permissions, and resource state.
4. The service queries PostgreSQL. Mutations use transactions and appropriate locks.
5. The API returns the response; the Web updates its displayed state.

Reads return selected fields rather than database rows wholesale. Mutation
contracts may require an expected resource version and a submission ID:
the version detects conflicting edits, while the submission ID allows a retry
to recover an already saved result.

Identity and validation details are in [Security](trust-boundaries.md).

## Explore and challenge completion

Event discovery loads player-visible content, effective event locations, and
availability from the API. The Web uses those records for both the map and
event list.

When an operation needs location, the Web sends a browser reading with accuracy
and acquisition time. The API checks the event and claim, then uses PostGIS for
distance. Challenge start checks eligibility again and saves an attempt with
question snapshots and server-owned timing.

Answer submissions save the player's choices or ordering. The API marks them
against private answer data. Finalisation records the completed attempt and
its applicable completion, reward, and progression changes in the same
transaction. A response is built from the saved result.

Trail progress is derived from ordered membership and the player's event
completions. Automatic placement uses assignment history to supply an effective
location without changing the authored location of published content.

See [Challenges and answers](challenge-attempt-api-contract.md),
[reward persistence](../database/challenge-reward-persistence-design.md), and
[event placement](../database/automatic-event-placement-persistence.md).

## Cards and battles

Collection reads join each owned card copy to its definition. Deck mutations
validate those specific copies and save membership. Evolution and trading
update ownership through their own transactional operations.

Starting a battle snapshots the participating cards. The API applies intended
actions through the shared battle rules and saves the resulting state,
version, and history. CPU choices and player-match deadlines are resolved by
server services. Completed matches feed the applicable progression, ranked,
and territory records.

Live play adds a delivery channel to that saved state:

1. The Web loads its participant or spectator view over HTTPS.
2. It obtains a short-lived connection ticket and opens the WebSocket.
3. The API commits legal actions and sends updated views.
4. Reconnection reloads the current saved view before continuing.

PostgreSQL notifications distribute committed changes between API processes.
Socket delivery is separate from persistence: reconnecting does not restart a
match or pause its deadline.

The [battle persistence references](../database/overview.md) and
[live PvP contract](live-pvp-api-contract.md) define the detailed transactions
and projections.

## Author changes

Author requests pass through the same account and permission checks. Services
apply the requested edit or lifecycle transition and record audit information.

Events, questions, challenges, and cards use the content-review workflow.
Campaigns and trails have their own publication rules. Published content becomes
available to player queries when its schedule and other eligibility conditions
allow it.

The [Author guide](../design/author-guide.md) links each workflow.

## Offline reconciliation

The Web stores issued challenge packs and local attempts in IndexedDB.
Offline answers remain pending until an authenticated reconciliation request
reaches the API.

The API verifies the signed pack, account binding, timing, location claims, and
answers before saving a result. Local completion alone cannot issue a reward.
A saved receipt lets the Web recover the reconciliation result after a retry.

See [Offline play](offline-challenge-play.md) for the pack, storage, and
reconciliation contracts.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5],
Codex[gpt-5.6-sol], Codex-CLI[GPT-6], and Codex[GPT-6].
