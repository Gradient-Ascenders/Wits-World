---
title: 'Battle rules'
description: Turn order, type matchups, damage, Power, status effects, and battle deadlines.
---

# Battle rules

CPU, asynchronous player, and live player battles use the same card-combat
rules. Each side brings a legal deck with **3 Creatures and 2 Power cards**.
The server resolves actions and saves the result; card details and the battle
log show the values used in that match.

## Why battles use moves

The project brief describes “picking an attribute and comparing it round by
round.” Wits World deliberately replaces that mechanic with Creature moves and
Power cards.

This gives players decisions throughout a battle: spend limited Power on damage,
restore resources, apply a status effect, or swap for a better matchup. A move's
value depends on the opponent and the current battle state. Cards therefore
offer different tactics, giving deck building a purpose beyond selecting high
stats.

The core requirements remain: players choose a deck, take turns against the
computer, follow server-enforced rules, and retain completed matches. The team
confirmed this departure on 25 August 2026; that confirmation does not record a
formal amendment to the supplied brief.

## Starting and turn order

Both sides select an opening Creature. Once both choices are resolved, the
Creatures are revealed and the server randomly chooses who acts first. Each
side has a **50% chance**, independent of card stats or who selected first.

Players then alternate normal turns. Each turn allows **1 action**: a Creature
move, a Power card, or a voluntary swap. Effects resolve before control passes
to the opponent. Mandatory replacement pauses this order without spending the
replacing player's next normal turn.

## Type matchups

Use the **move's type** against the **defending Creature's affinity**. A Creature
can have Basic moves alongside moves of its own affinity.

![Type matchup diagram: move types in rows and defending affinities in columns. Green means 1.5× damage, coral means 0.75×, and neutral means 1×.](/img/battle-type-matchups.svg)

**1.5×** is an advantage, **0.75×** is a disadvantage, and **1×** is neutral.
Wit beats Grit, Grit beats Spark, and Spark beats Wit. Spirit and Mystic both
have advantage against each other. Matching affinities are neutral.

Basic moves and explicitly neutral damage use **1×** against every affinity.
Type matchups affect damage; healing and Power restoration use their authored
amounts.

For example, Quillip's **Eureka** is a Wit move with 25 base damage. With no
other modifiers, it calculates **37 damage against Grit**, **18 against Spark**,
and **25 against Wit**. Its Basic **Ink Peck** calculates 10 against every
affinity before other modifiers.

## Damage and modifiers

Creature-move damage is calculated as:

```text
floor(base damage × type multiplier × outgoing modifiers × incoming modifiers)
```

A 20% damage boost contributes **1.2×**; a 50% incoming reduction contributes
**0.5×**. For example, `30 × 1.5 × 1.2 × 0.5 = 27` damage. The server rounds
down after combining the multipliers. Actual HP lost is limited by the target's
remaining HP.

Different compatible damage modifiers multiply together. Reapplying the same
authored modifier refreshes its duration or charges. Current Power-card damage
and Poison bypass Creature damage boosts and incoming attack reductions.

## Power and available actions

Creatures start with full HP and Power. **Power is a resource for moves**,
separate from deck rarity points; a higher Power maximum does not increase a
move's base damage.

| Action         | Rule                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------- |
| Creature move  | Pay its Power cost before effects resolve. Enough Power and any HP conditions are required. |
| Power card     | Use an available card with an active Creature. It is discarded for the rest of the match.   |
| Voluntary swap | Choose a living bench Creature. The swap ends your turn.                                    |

A 0-cost move can remain available at 0 Power. Power is restored by card or move
effects; taking turns or resting on the bench does not regenerate it. Healing
and restoration stop at the Creature's maximum HP or Power.

Effects execute in their listed order. **Overcharge** pays 25 HP before restoring
Power and requires more than 25 HP. **Static Demolition** pays 20 HP before its
damage and requires more than 20 HP. If an effect ends the battle, later effects
do not execute.

## Status effects

| Effect    | Behaviour                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Poison    | Deals neutral damage at the end of the affected Creature's turns. It can defeat the Creature and remains after its source is defeated. Reapplication refreshes the duration.            |
| Stun      | Prevents Creature moves. Legal Power-card and swap actions remain available. Recovery grants immunity to another stun.                                                                  |
| Dodge     | Makes the card's chance roll on the next opponent-directed damage effect from a Creature move. The charge is spent whether it succeeds or fails; costs and other effects still resolve. |
| Reflect   | Returns a percentage of actual HP damage received, rounded down. Quill Guard's reflection cannot lower the attacker below 1 HP.                                                         |
| Lifesteal | Heals a percentage of actual HP damage dealt, rounded down. It starts with subsequent damaging moves, excluding the move that grants it.                                                |

Turn-based durations count the affected Creature's subsequent turns while active. Effects
with charges count matching actions instead. Time on the bench does not tick
turn-based durations. Poison, Stun, Dodge, Reflect, and Lifesteal refresh their
existing effect rather than stacking another instance of that status.

## Swapping, defeat, and winning

Swapping preserves each Creature's HP, Power, and remaining effects. The outgoing
Creature's end-of-turn effects, including Poison, resolve before the incoming
Creature becomes active. The incoming Creature's effects do not tick on that
swap turn.

At 0 HP, a Creature is defeated and cannot return during the match. If its side
has another living Creature, it must select a replacement before normal play
continues. Required replacement does not consume a normal turn.

Defeat all opposing Creatures to win. A confirmed forfeit or resignation records
a loss for the departing player. Rewards and rating changes depend on the battle
mode; see [progression](player-progression-rules.md) and
[ranked competition](ranked-competition-policy.md).

## Decision deadlines

| Mode                | Decision window                                                                                                | Missed deadline                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU                 | 90 seconds for a normal player turn. Opening selection and mandatory replacement have no normal-turn deadline. | A late action becomes a timeout and ends the turn.                                                                                                |
| Asynchronous player | 24 hours for each turn or mandatory replacement.                                                               | The required player loses by deadline forfeit.                                                                                                    |
| Live player         | 60 seconds for opening selection, normal turns, and replacement.                                               | The server selects a legal Creature for a missed selection or replacement, or skips a normal turn. 3 consecutive missed decisions lose the match. |

The server clock decides whether an action is on time; the exact deadline is
already late. Refreshing, leaving, or reconnecting does not extend it. In live
battles, a timely legal action resets that player's consecutive timeout count.

For controls and navigation, see [CPU battles](player-cpu-battle-journey.md) and
[player battles](player-asynchronous-pvp-journey.md). Individual move costs and
effects are in the [card catalogue](../design/basic-card-roster.md).

---

This page was prepared with assistance from Codex[GPT-6].
