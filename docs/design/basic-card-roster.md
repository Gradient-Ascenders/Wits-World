---
title: Wits Quest Basic Card Roster
description: Approved canonical seeded card roster, starter packages, progression unlocks, and CPU deck for the Wits Quest Basic tier.
---

# Wits Quest Basic card roster

**Status:** Approved and frozen implementation specification

**Applies to:** Canonical deterministic card seed content and Basic CPU battles

**Approved:** 2026-08-25

This document is the source of truth for the canonical deterministic card
content that must replace the placeholder Basic catalogue. Implement the exact
stable card IDs, statistics, moves, effects, ordering, and durations below
without further balance changes. The
[Basic game rules](../requirements/basic-game-rules.md) remain authoritative
for battle resolution and server authority.

:::warning[Historical matches are immutable]

Catalogue and seed changes apply only to future matches. Never rewrite existing
CPU-match card snapshots or completed battle history.

:::

## Design foundation

### Affinity identities and availability

| Affinity | Identity                      | Basic availability   |
| -------- | ----------------------------- | -------------------- |
| Spark    | Pressure and burst            | Starter affinity     |
| Grit     | Durability and efficiency     | Starter affinity     |
| Wit      | Flexibility and disruption    | Starter affinity     |
| Spirit   | Sustain and resource recovery | Progression affinity |
| Mystic   | Setup and specialist play     | Progression affinity |

The affinity cycle remains `Wit → Grit → Spark → Spirit → Mystic → Wit`.
Advantage deals `1.5x` damage, disadvantage deals `0.75x`, and unrelated or
same-affinity damage deals `1.0x`.

### Frozen principles

- There is no same-type attack bonus (STAB), and implementation must not add
  one.
- Basic is neutral. Every seeded Common Creature has a zero-cost Basic damage
  fallback, including Wit Creature 3 and Mystic Creature 3.
- Common coverage normally softens a poor matchup without fully reversing the
  cycle. Wit may carry broader coverage as part of its identity.
- Common damage modifiers remain restrained at `10–15%`.
- Spirit recovery is finite; no move creates a repeatable healing/Power loop.
- Rarity adds coverage, sequencing, or flexibility rather than pure HP, Power,
  or damage inflation.
- Creature moves each have one effect. Power cards may have multiple effects,
  which resolve in the exact listed order.

In the tables below, `+N% damage` and `−N% damage` mean a Buff or Debuff of
`damage_multiplier` using `multiply`. Power changes use the `power` modifier
with `add` and apply immediately. An omitted damage-modifier duration lasts for
the rest of that Creature's battle life.

## Creature roster

Every Creature has exactly four ordered moves.

### Spark Creatures

| Stable card                                                          | Rarity; HP / Power  | Ordered moves                                                                                                                                                                                                                         | Role                                                                                          |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `eca9b943-9e05-834e-c85c-1175001d897c`<br />Spark Creature 1         | Common; 96 / 10     | 1. **Steady Jab** — Basic, cost 0: Damage 9<br />2. **Flash Arc** — Spark, cost 2: Damage 19<br />3. **Overcharge** — Spark, cost 4: Damage 32<br />4. **Feinting Insight** — Mystic, cost 2: Damage 15                               | Accessible pressure attacker with a meaningful burst decision and neutral coverage into Grit. |
| `ec9fb511-5dd2-8164-5f56-d9e13820c713`<br />Spark Creature 2         | Common; 88 / 12     | 1. **Quick Jab** — Basic, cost 0: Damage 8<br />2. **Voltage Spike** — Spark, cost 2: Damage 21<br />3. **Redline** — Spark, cost 4: Damage 34<br />4. **Calculated Feint** — Mystic, cost 2: Damage 16                               | Low-HP glass cannon with the strongest Common raw burst.                                      |
| `62d5bb93-78ad-5c44-412c-c7eca5f03250`<br />Spark Creature 3         | Common; 103 / 9     | 1. **Pressing Blow** — Basic, cost 0: Damage 10<br />2. **Live Wire** — Spark, cost 2: Damage 18<br />3. **Read the Opening** — Mystic, cost 2: Damage 15<br />4. **Static Screen** — Spark, cost 1: opponent −10% damage for 2 turns | Pressure-control bruiser that trades peak damage for HP and short defensive tempo.            |
| `740b5400-8362-b728-3b76-9d232077732d`<br />Spark Rare Creature      | Rare; 98 / 12       | 1. **Measured Jab** — Basic, cost 0: Damage 10<br />2. **Flash Sequence** — Spark, cost 2: Damage 22<br />3. **Clever Vector** — Wit, cost 2: Damage 16<br />4. **Momentum Read** — Spark, cost 1: +15% damage for 2 turns            | Combo striker whose rarity adds sequencing and stronger coverage.                             |
| `65f102ad-ff11-876c-a4f7-e2e74167bc4c`<br />Spark Epic Creature      | Epic; 102 / 13      | 1. **Opening Tap** — Basic, cost 0: Damage 10<br />2. **Storm Thesis** — Spark, cost 3: Damage 28<br />3. **Countercurrent** — Wit, cost 2: Damage 18<br />4. **Prismatic Detour** — Mystic, cost 2: Damage 18                        | Flexible attacker with two coverage routes instead of inflated defensive stats.               |
| `948a71e6-f04b-fcec-75ef-e401066ec8b8`<br />Spark Legendary Creature | Legendary; 106 / 14 | 1. **First Spark** — Basic, cost 0: Damage 10<br />2. **Crown Voltage** — Spark, cost 3: Damage 31<br />3. **Perfect Feint** — Wit, cost 2: Damage 18<br />4. **Unending Charge** — Spark, cost 2: permanent +15% damage              | Long-horizon finisher whose permanent setup must repay its action and Power investment.       |

### Grit Creatures

| Stable card                                                 | Rarity; HP / Power  | Ordered moves                                                                                                                                                                                                                 | Role                                                                                                      |
| ----------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `27cbcedf-1886-aa81-04b4-089b4c10cd87`<br />Grit Creature 1 | Common; **104 / 9** | 1. **Firm Strike** — Basic, cost 0: Damage 10<br />2. **Stone Rhythm** — Grit, cost 1: Damage 15<br />3. **Hidden Angle** — Spirit, cost 2: Damage 15<br />4. **Dig In** — Grit, cost 1: opponent −10% damage for **2 turns** | Efficient defensive anchor. The frozen HP and duration include the final balance reduction.               |
| `c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac`<br />Grit Creature 2 | Common; 101 / 11    | 1. **Workmanlike Blow** — Basic, cost 0: Damage 9<br />2. **Efficient Force** — Grit, cost 2: Damage 21<br />3. **Relentless Drive** — Grit, cost 3: Damage 28<br />4. **Patient Read** — Spirit, cost 2: Damage 16           | Efficient bruiser that chooses between sustained output and a finishing hit.                              |
| `fc2c46fb-d960-b1bb-ea9a-93110b79e22d`<br />Grit Creature 3 | Common; **98 / 10** | 1. **Guarded Tap** — Basic, cost 0: Damage 9<br />2. **Stalwart Swing** — Grit, cost 2: Damage 19<br />3. **Quiet Counter** — Spirit, cost 2: Damage 15<br />4. **Patch Up** — Grit, cost 2: **Heal 12**                      | Repair-oriented defender with finite healing. The frozen HP and heal include the final balance reduction. |

### Wit Creatures

| Stable card                                                | Rarity; HP / Power | Ordered moves                                                                                                                                                                                                            | Role                                                                                     |
| ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `84790040-6ea8-6155-c4b7-dec3a22ac3ab`<br />Wit Creature 1 | Common; 98 / 11    | 1. **Quick Retort** — Basic, cost 0: Damage 9<br />2. **Logic Lash** — Wit, cost 2: Damage 18<br />3. **Lateral Step** — Spirit, cost 2: Damage 14<br />4. **Power Leak** — Wit, cost 2: opponent Power −2               | Resource disruptor that sacrifices an attack and equal Power to deny an opposing option. |
| `47f04de3-98d9-79ad-2759-7409c499c5ec`<br />Wit Creature 2 | Common; 94 / 12    | 1. **Testing Tap** — Basic, cost 0: Damage 8<br />2. **Sharp Thesis** — Wit, cost 2: Damage 20<br />3. **Borrowed Resolve** — Spirit, cost 2: Damage 15<br />4. **Spark of Improvisation** — Spark, cost 2: Damage 15    | Broad-coverage attacker and the intentional exception to the usual one-coverage pattern. |
| `cdd5284b-0aaf-5c50-f820-787a7f6b1506`<br />Wit Creature 3 | Common; 103 / 10   | 1. **Fast Read** — **Basic, cost 0: Damage 8**<br />2. **Checkmate Line** — Wit, cost 3: Damage 25<br />3. **Reframe** — Spirit, cost 2: Damage 15<br />4. **Misdirect** — Wit, cost 2: opponent −15% damage for 2 turns | Control specialist. Fast Read is the final approved neutral Basic fallback.              |

### Spirit Creatures

| Stable card                                                   | Rarity; HP / Power | Ordered moves                                                                                                                                                                                                                               | Role                                                                                    |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `a230fdda-cec0-c127-b4a2-e4dd20660e3a`<br />Spirit Creature 1 | Common; 102 / 10   | 1. **Grounding Tap** — Basic, cost 0: Damage 9<br />2. **Heartbeat Wave** — Spirit, cost 2: Damage 18<br />3. **Steady Hand** — Wit, cost 2: Damage 15<br />4. **Mend** — Spirit, cost 2: Heal 14                                           | Balanced sustain Creature and the first Spirit progression unlock.                      |
| `6e6b2c9f-27b2-2145-3b8a-219a0df622d7`<br />Spirit Creature 2 | Common; 94 / 12    | 1. **Gentle Tap** — Basic, cost 0: Damage 8<br />2. **Rallying Pulse** — Spirit, cost 2: Damage 20<br />3. **Rooted Reply** — Wit, cost 2: Damage 16<br />4. **Deep Breath** — Spirit, cost 3: Heal 18                                      | Low-HP resource planner with a finite choice between pressure and substantial healing.  |
| `6f962f85-eaee-fd27-b2d7-c00c8af95098`<br />Spirit Creature 3 | Common; 110 / 9    | 1. **Centering Blow** — Basic, cost 0: Damage 10<br />2. **Enduring Chorus** — Spirit, cost 2: Damage 20<br />3. **Insightful Reply** — Wit, cost 2: Damage 15<br />4. **Calming Field** — Spirit, cost 2: opponent −10% damage for 3 turns | Preventative guardian that sustains through HP and damage reduction instead of healing. |

### Mystic Creatures

| Stable card                                                   | Rarity; HP / Power | Ordered moves                                                                                                                                                                                                                     | Role                                                                                |
| ------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `0cba869b-d777-11f8-6b8c-c47d4d626558`<br />Mystic Creature 1 | Common; 98 / 11    | 1. **Plain Sigil** — Basic, cost 0: Damage 9<br />2. **Arcane Thread** — Mystic, cost 2: Damage 18<br />3. **Stone Rune** — Grit, cost 2: Damage 15<br />4. **Focus Lens** — Mystic, cost 1: +10% damage for 3 turns              | Accessible setup specialist and the first Mystic progression unlock.                |
| `5340e0ee-d31c-93f5-0d59-39d0cd977f15`<br />Mystic Creature 2 | Common; 90 / 13    | 1. **Simple Mark** — Basic, cost 0: Damage 8<br />2. **Convergence** — Mystic, cost 3: Damage 28<br />3. **Iron Glyph** — Grit, cost 2: Damage 17<br />4. **Attune** — Mystic, cost 2: +15% damage for 2 turns                    | Fragile combo attacker whose high ceiling requires setup and Power commitment.      |
| `a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6`<br />Mystic Creature 3 | Common; 106 / 10   | 1. **Whispering Rune** — **Basic, cost 0: Damage 8**<br />2. **Deep Pattern** — Mystic, cost 2: Damage 21<br />3. **Grounded Equation** — Grit, cost 2: Damage 15<br />4. **Long Vision** — Mystic, cost 2: permanent +10% damage | Long-game specialist. Whispering Rune is the final approved neutral Basic fallback. |

## Power-card roster

Damage uses the Power card's affinity. Effects resolve in the listed order.

| Stable card                                                       | Rarity / affinity | Ordered effects                                                                       | Role                                                                                                               |
| ----------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `0d28241f-a4f2-2cf3-52bc-dee1633b3316`<br />Spark Power 1         | Common / Spark    | 1. Damage 20                                                                          | Immediate pressure or finishing damage.                                                                            |
| `b7485793-8432-2db9-5f99-974164efa788`<br />Spark Power 2         | Common / Spark    | 1. Damage 12<br />2. +10% damage for 2 turns                                          | Maintains pressure while preparing two stronger attacks.                                                           |
| `49e45cbb-f419-bf5c-2868-757646cb8dc9`<br />Grit Power 1          | Common / Grit     | 1. Heal 8<br />2. Opponent −10% damage for 2 turns                                    | Stabilization that retains prevention when healing is partly wasted.                                               |
| `17150f89-427c-6bd8-5551-fbaf59b99808`<br />Grit Power 2          | Common / Grit     | 1. Damage 14<br />2. **Heal 6**                                                       | Durable tempo swing with the final approved healing reduction.                                                     |
| `a2405856-34a7-f0a8-d1f6-ed0f161ecdab`<br />Wit Power 1           | Common / Wit      | 1. Opponent Power −3<br />2. Damage 10                                                | Disrupts expensive plans while advancing the battle.                                                               |
| `b862854d-9bc1-2e2e-31f2-c3b31fefcaed`<br />Wit Power 2           | Common / Wit      | 1. Heal 10<br />2. +10% damage for 2 turns                                            | Flexible recovery and setup.                                                                                       |
| `c1db21b9-944e-f9d6-fa2c-7d14702f41d4`<br />Spirit Power 1        | Common / Spirit   | 1. Heal 20                                                                            | Focused emergency sustain.                                                                                         |
| `1f991679-3269-163f-4e74-b75a738a2bee`<br />Spirit Power 2        | Common / Spirit   | 1. Heal 10<br />2. Power +3                                                           | Bounded, one-use resource recovery.                                                                                |
| `76f057c6-efab-38d9-9bcf-298d5c794f1a`<br />Mystic Power 1        | Common / Mystic   | 1. +10% damage for 2 turns<br />2. Damage 12                                          | Sequencing card whose first effect increases its own later damage effect.                                          |
| `4e7b34e3-4f31-33c1-5da5-000570b3d4f3`<br />Mystic Power 2        | Common / Mystic   | 1. Heal 10<br />2. Permanent +10% damage                                              | Long-horizon setup with modest stabilization.                                                                      |
| `25621c1c-0722-303d-928b-4ed6e015dbd0`<br />Spark Rare Power      | Rare / Spark      | 1. Damage 16<br />2. Opponent Power −2                                                | Pressure plus small sequencing disruption.                                                                         |
| `7f72be51-3370-8dbf-e96c-963ef4b5f29b`<br />Spark Epic Power      | Epic / Spark      | 1. +15% damage for 3 turns<br />2. Damage 16                                          | Setup-and-strike card whose Buff also affects its ordered damage effect.                                           |
| `5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc`<br />Spark Legendary Power | Legendary / Spark | 1. +15% damage for 2 turns<br />2. Damage 18<br />3. Opponent −10% damage for 2 turns | Three-stage setup, burst, and protection swing. A lethal second effect skips the final Debuff under current rules. |

## Starter and progression packages

- Spark, Grit, and Wit are the only starter affinities. Each starter package is
  its three Common Creatures and two Common Power cards.
- Spirit and Mystic are earned through progression and must not be offered as
  starter choices.
- The first Spirit unlock is **Spirit Creature 1**
  (`a230fdda-cec0-c127-b4a2-e4dd20660e3a`).
- The first Mystic unlock is **Mystic Creature 1**
  (`0cba869b-d777-11f8-6b8c-c47d4d626558`).

## Curated Basic CPU deck

The Basic journey CPU deck is the following fixed five-Common-card deck:

1. Grit Creature 2 — `c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac`
2. Spirit Creature 1 — `a230fdda-cec0-c127-b4a2-e4dd20660e3a`
3. Mystic Creature 1 — `0cba869b-d777-11f8-6b8c-c47d4d626558`
4. Grit Power 1 — `49e45cbb-f419-bf5c-2868-757646cb8dc9`
5. Mystic Power 1 — `76f057c6-efab-38d9-9bcf-298d5c794f1a`

CPU actions remain uniformly random among legal actions under the current Basic
battle rules. Catalogue ordering must not select the CPU deck implicitly.

## Basic-Tier high-rarity limitation

Rare, Epic, and Legendary canonical content remains Spark-only in the Basic
tier. Do not add high-rarity cards for other affinities as part of roster
implementation.

Under the current random reward policy, every Rare, Epic, or Legendary card
award therefore resolves to Spark content; within each rarity, the active
canonical pool contains only the Spark Creature and Spark Power card. This
concentration is an explicit Basic-Tier limitation, not an omitted roster slot.

## AI declaration

This document was planned, generated, and edited with assistance from
Codex[GPT-5].
