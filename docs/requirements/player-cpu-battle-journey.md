# Player CPU battle and match-history journey

## Purpose and sources of truth

Issue #76 provides the mobile-first browser experience for the Basic CPU match
implemented by issue #75. The authoritative rules are the
[Basic game rules](basic-game-rules.md#cpu-battles), and the exact persistence,
privacy, concurrency, and recovery behavior is documented by the
[CPU match contract](../database/cpu-match-persistence-design.md).

The API owns all battle state. The browser renders returned state and submits a
permitted intent; it never calculates damage, CPU choices, timeouts, turn
advancement, defeat, replacement consequences, winners, or completion.

## Routes and HTTP boundary

- `/matches` is the authenticated battle entry. It first calls
  `GET /api/v1/matches/cpu`, which accepts no player or match identifier.
- `/decks` starts from the selected saved deck after the same active lookup.
  `POST /api/v1/matches/cpu` receives `{ "deckId": "<selected deck ID>" }`.
- `/matches/:matchId` calls the ownership-scoped
  `GET /api/v1/matches/:matchId` and renders its coherent state and latest
  action snapshot.
- Actions use `POST /api/v1/matches/:matchId/actions` with
  `{ submissionId, expectedVersion, action }`.
- `/matches/history` calls `GET /api/v1/matches/history`; each completed item
  links to its persisted direct detail route.

Authentication is the only source of player ownership. The browser never sends
a player ID or filters another player's records locally.

## Entry, creation, and recovery

On entry, `200` from the active lookup presents the returned match as the
dashboard's only primary action. The player explicitly follows **Resume battle**
to its detailed route; starting a conflicting match is not offered.
`404 CPU_MATCH_NOT_FOUND` is the explicit no-active state: the dashboard can
name the selected saved deck and offer creation, or link to deck selection when
none is selected. The browser does not reproduce the API's deck validation.

One create request is made per activation. A successful response navigates to
its returned `matchId`. `INVALID_MATCH_DECK`, authentication, and safe network
failures receive focused recovery UI. When a create transport or success-schema
failure is ambiguous, the client checks the active lookup at 0, 250, and 750
milliseconds. These bounded delays cover a transaction that was still
uncommitted during the immediate lookup without turning browser memory into a
permanent source of truth. `409 CPU_MATCH_ALREADY_ACTIVE` uses the same active
lookup sequence. The create POST is not automatically replayed by that sequence.

## Authoritative battle presentation

`CpuMatchResponse.state.phase` drives the visible state:

- `initial_selection` exposes only returned `select_initial_creature` intents;
- `active` shows the player's current Creature, the revealed CPU Creature,
  current side, deadline, move and Power controls represented by `legalActions`;
- `replacement` explains the server-reported defeat and enables only returned
  `select_replacement` intents; and
- `completed` removes all active controls and presents the persisted winner,
  completion time, final turn, and history navigation.

Creature actions are `{ type: "use_move", moveId }`; Power-card actions are
`{ type: "use_power_card", powerCardId }`. Unreturned actions stay disabled and
explain that the server did not advertise them. CPU unplayed card identities are
never reconstructed: the UI names the hidden information and displays only the
aggregate remaining counts returned by the API. `lastAction` is the recent
authoritative compatibility field. The primary battle record is `battleLog`, an
ordered server projection of persisted actions and outcomes; the browser does
not derive either representation from card statistics.

The public match view projects existing authoritative card and battle data for
decisions. Revealed Creature moves include their name, move type, Power cost,
and ordered effect definition. Player Power cards include their snapshot-backed
name, affinity, authored ordered effects, and server availability. Each effect
contains its type and non-null executable value plus modifier stat, operation,
and authored duration when applicable. Card names come from immutable
`cpu_match_cards` snapshots; no current catalogue lookup can rename a match.
For damage modifiers, the API additionally projects the rules-normalized
multiplier. Previews render that authoritative multiplier, including the
zero-multiplier clamp for debuffs greater than 100%, rather than calculating a
combat rule in the browser or showing an impossible raw reduction.

Only persistent damage multipliers appear beside an active Creature. Each
stored modifier remains a separate entry with a signed percentage and the
authoritative `remainingTurns`; `null` means rest of battle. A finite duration
counts the affected Creature's subsequent turns and is displayed exactly as it
decrements in battle state. Damage, healing, and immediate HP or Power changes
appear in the battle log but do not remain in active effects. No browser
timer, combined stacking percentage, effect target, or combat result is
calculated from these values.

Fresh reads enrich older match state and log events with names already present
in the historical card snapshots. The API also augments an older persisted
idempotency receipt with a log reconstructed through the final persisted action
in that receipt's round, including any synchronous CPU or replacement actions,
while preserving the receipt's original `lastAction`. Normal action submissions
extend the cumulative log stored in the latest receipt instead of rereading all
prior action and round-state JSON. Older results without expiry metadata omit
only that unrecorded event; neither API nor browser guesses it. Malformed effect,
modifier, expiry, or log fields reject the response as unavailable.

These response and presentation additions do not change damage, affinity,
Power, regeneration, stacking, duration, legality, CPU choice, replacement,
timeout, turn-order, persistence, or snapshot mechanics.

## Submission and state ordering

Each activation generates a fresh UUID `submissionId`, sends the currently
applied `expectedVersion`, and locks all battle controls until the response
settles. No local round simulation occurs. Route re-entry always reloads direct
authoritative state.

Every request has a monotonically increasing local generation. A response is
applied only to the mounted matching route, never below the displayed server
version, and never behind a newer same-version response. A completed match is
absorbing for that mounted page. Aborted/unmounted requests cannot mutate the
new route. The server's idempotency constraint remains the protection for the
same submitted UUID; the UI's single-flight lock prevents accidental duplicate
logical submissions.

`CPU_MATCH_STALE_ACTION`, `ILLEGAL_CPU_MATCH_ACTION`, and
`CPU_MATCH_COMPLETED` are recoverable authority events. The page announces that
the intent was not accepted, reloads the direct match, discards the obsolete
intent, focuses the current phase, and requires a fresh player activation. It
never replays a gameplay action automatically. Authentication and unavailable
responses preserve the last applied state and offer sign-in or explicit reload.

## History, accessibility, and responsive behavior

The dashboard loads recent history independently, shows the newest few persisted
results in compact form, and links to `/matches/history` for the full archive. A
slow or failed recent-history request does not delay or hide an available Resume
or Start action. History has loading, empty, populated, authentication,
unavailable, and retry states. Result, CPU opponent, completion time, and
submitted-round count come from the persisted history response. Direct detail
uses the same authoritative completed response and stays completed after refresh.

The battle uses native buttons and links; no drag, gesture, or animation is
required. Phase changes use a concise polite announcement and move focus to the
new phase heading after initial selection, replacement, stale reconciliation,
and completion. Disabled choices have semantic reasons. Card affinity, HP,
Power, defeated state, hidden CPU information, current side, and result are
textual rather than color-only.

At 360px and 390px the order is phase/turn, combatants, legal actions, and a
collapsed latest-outcome/log control beside secondary details. Tablet keeps the
same compact flow. Desktop keeps the complete independently scrollable log open
in the secondary rail without competing with the battlefield or action tray.
Controls keep mobile touch targets and all layouts must satisfy
`scrollWidth <= clientWidth`.

## Automated evidence

Vitest covers strict contracts, recovery timing, selected-deck creation,
explicit active resume, compact recent results, initial/move/Power/replacement
actions, unavailable controls,
single-flight submission, stale reconciliation, response ordering, completion
absorption, history/detail, authentication, retry, and keyboard operation.

`playwright/cpu-battle.spec.ts` uses the authenticated production application
shell with deterministic authentication and intercepted API responses. It
completes a full frontend match, including a real touch tap, keyboard actions,
Power use, defeat/replacement, stale recovery, completion, history/detail, and
refresh. Its effect-rich fixture checks ordered multi-effects, zero Power,
finite/permanent stacked modifiers, disabled legality, visible keyboard focus,
control containment, horizontal overflow, and console/runtime errors at
390x844, 768x1024, 1280x800, and 1600x1000. It also checks grouped log access,
scroll-to-latest, completion, and reconstruction after refresh. Screenshots remain under the ignored
`.pr-screenshots/issue-76/` path. It also covers the explicit dashboard resume,
selected-deck start, no-selected-deck recovery, recent results, and full-history
navigation at representative mobile, tablet, and desktop widths. This is mocked
API browser evidence, not a claim that a live backend match was completed end to
end.

This document was generated and edited with assistance from
Codex-CLI[gpt-5.6-sol], Codex-CLI[GPT-5], and Codex[GPT-5].
