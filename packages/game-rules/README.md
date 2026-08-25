# Wits World Game Rules

`@wits-world/game-rules` contains the pure Basic-tier battle engine. It does not
read the database, access the clock, call HTTP services, or trust browser state.

The API supplies validated card/deck snapshots and an injected random source.
Each accepted action returns a new `BattleState` and a transition result. The
same legal-action validator is used for player and CPU actions.

Catalogue adapters must map the API/database modifier fields into the nested
`BattleEffect.modifier` shape. The engine rejects Buff/Debuff data when the
authored target, operation, or required value is missing.

The package currently covers:

- simultaneous initial Creature selection and server-side first-player choice;
- Creature moves and Power cards;
- HP, Power, Damage, Heal, Buff, and Debuff effects;
- affinity type multipliers;
- mandatory replacement and terminal match state;
- trusted timeout actions; and
- deterministic CPU legal-action selection.

CPU match persistence and HTTP routes are implemented in `apps/api`; browser
interaction is implemented in `apps/web`. Those consumers keep the API
authoritative: the browser submits an intent and renders the returned match
state rather than running this engine or deciding legal actions itself.

This document was generated and edited with the assistance of
Codex-CLI[gpt-5.6-sol medium] and Codex[GPT-5].
