import { randomInt as secureRandomInt } from 'node:crypto';

import type pg from 'pg';

import {
  applyBattleAction,
  chooseCpuAction,
  createBattleState,
  getEffectDamageMultiplier,
  getLegalActions,
  getTypeMultiplier,
  InvalidBattleSetupError,
  validateBattleDeck,
  type BattleAction,
  type BattleActionResult,
  type BattleCreatureCard,
  type BattleDeck,
  type BattleEffect,
  type BattleMove,
  type BattleModifier,
  type BattlePowerCard,
  type BattleState,
  type BattleTransition,
  type RandomInt,
  type EffectCode,
  type EffectTarget,
} from '@wits-world/game-rules';

import { DeckRuleViolationError } from '../cards/deck-rules.js';
import type {
  CardAffinity,
  CardCategory,
  CardRarity,
  CardEffect,
  CardMove,
} from '../cards/card-types.js';
import { BASIC_CPU_DECK_CONFIGURATION } from './basic-cpu-deck.js';
import {
  createProgressionPersistence,
  type ProgressionPersistence,
} from '../progression/progression-persistence.js';
import {
  loadPlayerBattleDeck,
  PlayerBattleDeckError,
} from './player-battle-deck.js';
import type { TrustService } from '../trust/trust-service.js';

const CPU_TURN_SECONDS = 90;

export interface CpuMatchDatabase {
  connect(): Promise<CpuMatchClient>;
}

export interface CpuMatchClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

export interface CpuMatchClock {
  now(): Date;
}

export interface CpuMatchServiceOptions {
  clock?: CpuMatchClock;
  randomInt?: RandomInt;
  progressionPersistence?: ProgressionPersistence;
  trustService?: Pick<TrustService, 'recordSubmissionConflict'>;
}

export interface CreateCpuMatchInput {
  playerId: string;
  deckId: string;
}

export interface SubmitCpuMatchActionInput {
  playerId: string;
  matchId: string;
  submissionId: string;
  expectedVersion: number;
  action: Exclude<BattleAction, { type: 'timeout' }>;
}

export interface ForfeitCpuMatchInput {
  playerId: string;
  matchId: string;
  expectedVersion: number;
}

export interface CpuMatchActionView {
  type: BattleAction['type'];
  creatureId?: string;
  moveId?: string;
  powerCardId?: string;
}

export interface CpuMatchStateView {
  phase: BattleState['phase'];
  turnNumber: number;
  currentSide: BattleState['currentSide'];
  replacementSide: BattleState['replacementSide'];
  firstSide: BattleState['firstSide'];
  selections: {
    player: string | null;
    cpu: string | null;
  };
  player: PlayerParticipantView;
  cpu: CpuParticipantView;
  legalActions: readonly CpuMatchActionView[];
  turnDeadline: string | null;
}

export interface PlayerParticipantView {
  creatures: readonly PublicCreatureView[];
  powerCards: readonly PublicPowerCardView[];
  usedPowerCardIds: readonly string[];
  activeCreatureId: string | null;
}

export interface CpuParticipantView {
  activeCreature: PublicCreatureView | null;
  defeatedCreatures: readonly PublicCreatureView[];
  remainingCreatureCount: number;
  usedPowerCardIds: readonly string[];
  remainingPowerCardCount: number;
}

export interface PublicCreatureView {
  id: string;
  name: string;
  affinity: BattleCreatureCard['affinity'];
  rarity: CardRarity;
  maxHp: number;
  maxPower: number;
  currentHp: number;
  remainingPower: number;
  defeated: boolean;
  moves: readonly PublicMoveView[];
  activeModifiers: readonly PublicActiveModifierView[];
}

export interface PublicMoveView {
  effectiveness: 'effective' | 'neutral' | 'resisted' | null;
  id: string;
  name: string;
  moveType: BattleMove['moveType'];
  powerCost: number;
  effects: readonly PublicEffectView[];
}

export interface PublicPowerCardView {
  id: string;
  name: string;
  affinity: BattlePowerCard['affinity'];
  effects: readonly PublicEffectView[];
  available: boolean;
}

export interface PublicEffectView {
  damageMultiplier: number | null;
  effectType: BattleEffect['effectType'];
  effectValue: number | null;
  modifier: NonNullable<BattleEffect['modifier']> | null;
}

export interface PublicActiveModifierView {
  stat: BattleModifier['stat'];
  operation: BattleModifier['operation'];
  value: number;
  percentage: number | null;
  remainingTurns: number | null;
  remainingCharges: number | null;
}

export interface PublicAppliedEffectView {
  effectId: string;
  effectType: BattleEffect['effectType'];
  targetSide: 'player' | 'cpu';
  targetCreatureId: string;
  amount: number;
  damageMultiplier: number | null;
  modifier: NonNullable<BattleEffect['modifier']> | null;
}

export interface PublicBattleActionResult extends Omit<
  BattleActionResult,
  'effects'
> {
  effects: readonly PublicAppliedEffectView[];
}

export type CpuMatchBattleLogEventKind =
  'action' | 'defeat' | 'effect' | 'effect_expired' | 'result' | 'turn';

export interface CpuMatchBattleLogEvent {
  id: string;
  sequence: number;
  side: 'player' | 'cpu' | null;
  kind: CpuMatchBattleLogEventKind;
  message: string;
}

export interface CpuMatchBattleLogGroup {
  id: string;
  label: string;
  turnNumber: number;
  events: readonly CpuMatchBattleLogEvent[];
}

export interface CpuMatchResponse {
  matchId: string;
  status: 'active' | 'completed';
  version: number;
  winner: 'player' | 'cpu' | null;
  startedAt: string;
  completedAt: string | null;
  state: CpuMatchStateView;
  lastAction: PublicBattleActionResult | null;
  battleLog: readonly CpuMatchBattleLogGroup[];
}

export interface CpuMatchHistoryRound {
  roundNumber: number;
  actions: readonly CpuMatchHistoryAction[];
  result: readonly PublicBattleActionResult[];
  createdAt: string;
}

export interface CpuMatchHistoryAction {
  sequence: number;
  side: 'player' | 'cpu';
  submissionId: string | null;
  action: BattleAction;
  result: PublicBattleActionResult;
  createdAt: string;
}

export interface CpuMatchHistory {
  matchId: string;
  status: 'completed';
  winner: 'player' | 'cpu';
  startedAt: string;
  completedAt: string;
  rounds: readonly CpuMatchHistoryRound[];
}

export interface CpuMatchService {
  createMatch(input: CreateCpuMatchInput): Promise<CpuMatchResponse>;
  getActiveMatch(playerId: string): Promise<CpuMatchResponse>;
  getMatch(playerId: string, matchId: string): Promise<CpuMatchResponse>;
  forfeitMatch(input: ForfeitCpuMatchInput): Promise<CpuMatchResponse>;
  submitAction(input: SubmitCpuMatchActionInput): Promise<CpuMatchResponse>;
  listHistory(playerId: string): Promise<readonly CpuMatchHistory[]>;
}

export class CpuMatchNotFoundError extends Error {
  constructor() {
    super('CPU match was not found.');
    this.name = 'CpuMatchNotFoundError';
  }
}

export class CpuMatchAlreadyActiveError extends Error {
  constructor() {
    super('The player already has an active CPU match.');
    this.name = 'CpuMatchAlreadyActiveError';
  }
}

export class CpuMatchDeckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CpuMatchDeckError';
  }
}

class CpuMatchSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CpuMatchSetupError';
  }
}

export class CpuMatchActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CpuMatchActionError';
  }
}

export class CpuMatchVersionConflictError extends Error {
  constructor() {
    super('The match changed before this action was applied.');
    this.name = 'CpuMatchVersionConflictError';
  }
}

export class CpuMatchSubmissionConflictError extends Error {
  constructor() {
    super('This submission ID was already used with a different action.');
    this.name = 'CpuMatchSubmissionConflictError';
  }
}

export class CpuMatchCompletedError extends Error {
  constructor() {
    super('Completed CPU matches cannot receive more actions.');
    this.name = 'CpuMatchCompletedError';
  }
}

interface MatchRow extends pg.QueryResultRow {
  id: string;
  player_id: string;
  status: 'active' | 'completed';
  state: BattleState;
  version: number;
  turn_started_at: Date | null;
  turn_deadline: Date | null;
  winner: 'player' | 'cpu' | null;
  started_at: Date;
  completed_at: Date | null;
  card_names?: Record<string, string>;
  card_rarities?: Record<string, CardRarity>;
}

interface MatchViewRow extends MatchRow {
  log_actions: BattleLogActionRow[];
}

interface ActionMatchRow extends MatchRow {
  action_sequence: number;
  latest_battle_log: CpuMatchBattleLogGroup[] | null;
  legacy_log_actions: BattleLogActionRow[];
}

interface MatchIdentityRow extends pg.QueryResultRow {
  id: string;
}

interface ActionResponseRow extends pg.QueryResultRow {
  action: BattleAction;
  submitted_intent: BattleAction | null;
  expected_version: number;
  legacy_log_actions: BattleLogActionRow[];
  response: StoredCpuMatchResponse;
}

type StoredBattleActionResult = Omit<BattleActionResult, 'expiredEffects'> & {
  expiredEffects?: BattleActionResult['expiredEffects'];
};

type StoredPublicBattleActionResult = Omit<
  PublicBattleActionResult,
  'expiredEffects'
> & {
  expiredEffects?: PublicBattleActionResult['expiredEffects'];
};

type StoredCpuMatchResponse = Omit<
  CpuMatchResponse,
  'battleLog' | 'lastAction'
> & {
  battleLog?: readonly CpuMatchBattleLogGroup[];
  lastAction: StoredPublicBattleActionResult | null;
};

interface BattleLogActionRow {
  sequence: number;
  roundNumber: number;
  roundStateBefore: BattleState;
  roundStateAfter: BattleState;
  result: StoredBattleActionResult;
}

interface TransitionPersistenceRow extends pg.QueryResultRow {
  action_count: number;
  action_match_matches: boolean;
  action_round_matches: boolean;
  base_sequence: number;
  first_sequence: number;
  last_sequence: number;
  match_update_count: number;
  player_receipt_count: number;
  round_count: number;
  round_id: string | null;
  round_match_id: string | null;
  unexpected_receipt_count: number;
  updated_match_id: string | null;
}

interface RoundRow extends pg.QueryResultRow {
  match_id: string;
  id: string;
  round_number: number;
  state_before: BattleState;
  state_after: BattleState;
  result: StoredBattleActionResult[];
  created_at: Date;
}

interface ActionRow extends pg.QueryResultRow {
  round_id: string;
  sequence: number;
  side: 'player' | 'cpu';
  submission_id: string | null;
  action: BattleAction;
  result: StoredBattleActionResult;
  created_at: Date;
}

interface SavedDeckCardRow extends pg.QueryResultRow {
  position: number;
  owned_card_id: string;
  card_definition_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  is_active: boolean;
}

interface CpuCardRow extends pg.QueryResultRow {
  position: number;
  card_definition_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  is_active: boolean;
}

interface ConfiguredCpuCardRow extends pg.QueryResultRow {
  position: number;
  configured_card_definition_id: string;
  expected_category: CardCategory;
  card_definition_id: string | null;
  name: string | null;
  category: CardCategory | null;
  affinity: CardAffinity | null;
  rarity: CardRarity | null;
  hp: number | null;
  power: number | null;
  is_active: boolean | null;
  authoring_status: string | null;
}

interface MoveRow extends pg.QueryResultRow {
  id: string;
  card_definition_id: string;
  position: number;
  name: string;
  move_type: CardMove['moveType'];
  effect_type: CardMove['effectType'];
  effect_value: number | null;
  modifier_stat: CardMove['modifierStat'];
  modifier_operation: CardMove['modifierOperation'];
  modifier_duration_turns: number | null;
  power_cost: number;
}

interface EffectRow extends pg.QueryResultRow {
  id: string;
  card_definition_id: string;
  position: number;
  effect_type: CardEffect['effectType'];
  effect_value: number | null;
  modifier_stat: CardEffect['modifierStat'];
  modifier_operation: CardEffect['modifierOperation'];
  modifier_duration_turns: number | null;
  effect_code: EffectCode;
  effect_config: unknown;
}

interface MoveEffectRow extends EffectRow {
  card_move_id: string;
}

interface SnapshotCard {
  side: 'player' | 'cpu';
  position: number;
  ownedCardId: string | null;
  cardDefinitionId: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  card: BattleCreatureCard | BattlePowerCard;
}

export function createCpuMatchService(
  database: CpuMatchDatabase,
  options: CpuMatchServiceOptions = {},
): CpuMatchService {
  const clock = options.clock ?? { now: () => new Date() };
  const randomInt = options.randomInt ?? secureRandomInt;
  const progressionPersistence =
    options.progressionPersistence ?? createProgressionPersistence();

  const trustService = options.trustService;

  return {
    async createMatch(input) {
      const client = await database.connect();

      try {
        await client.query('begin');

        const loadedPlayerDeck = await loadSelectedDeckCards(
          client,
          input.playerId,
          input.deckId,
        );
        const playerCards = loadedPlayerDeck.cards;
        const cpuCards = await loadCpuDeckCards(client);
        const playerDeck = loadedPlayerDeck.deck;
        const cpuDeck = await buildBattleDeck(client, cpuCards, 'cpu');

        validateBattleDeck(playerDeck);
        try {
          validateBattleDeck(cpuDeck);
        } catch (error) {
          throw mapCpuMatchSetupError(error);
        }

        const state = createBattleState(playerDeck, cpuDeck);
        const startedAt = clock.now();
        const inserted = await client.query<MatchIdentityRow>(
          `
            insert into public.cpu_matches (
              player_id,
              player_deck_id,
              state,
              turn_started_at
            )
            values ($1::uuid, $2::uuid, $3::jsonb, null)
            returning id::text
          `,
          [input.playerId, input.deckId, JSON.stringify(state)],
        );

        const matchId = inserted.rows[0]?.id;
        if (!matchId) {
          throw new Error('CPU match creation returned no match identifier.');
        }

        await insertSnapshots(client, matchId, playerCards, cpuCards, {
          player: playerDeck,
          cpu: cpuDeck,
        });

        const snapshots = [
          ...snapshotDeck('player', playerCards, playerDeck),
          ...snapshotDeck('cpu', cpuCards, cpuDeck),
        ];

        await client.query('commit');

        return createResponse({
          matchId,
          status: 'active',
          version: 0,
          state,
          winner: null,
          startedAt,
          completedAt: null,
          turnDeadline: null,
          logActions: [],
          cardNames: cardNamesFromSnapshots(snapshots),
          cardRarities: cardRaritiesFromSnapshots(snapshots),
        });
      } catch (error) {
        await rollback(client);
        if (isActiveMatchUniqueViolation(error)) {
          throw new CpuMatchAlreadyActiveError();
        }
        throw mapBattleSetupError(error);
      } finally {
        client.release();
      }
    },

    async getActiveMatch(playerId) {
      const client = await database.connect();

      try {
        const result = await loadMatchView(client, playerId, {
          activeOnly: true,
        });

        if (result.rows.length > 1) {
          throw new Error(
            'CPU match active-state invariant was violated for a player.',
          );
        }

        const match = result.rows[0];
        if (!match) {
          throw new CpuMatchNotFoundError();
        }

        return createResponse({
          matchId: match.id,
          status: match.status,
          version: match.version,
          state: match.state,
          winner: match.winner,
          startedAt: match.started_at,
          completedAt: match.completed_at,
          turnDeadline: match.turn_deadline,
          logActions: match.log_actions,
          cardNames: match.card_names,
          cardRarities: match.card_rarities,
        });
      } finally {
        client.release();
      }
    },

    async getMatch(playerId, matchId) {
      const client = await database.connect();

      try {
        const result = await loadMatchView(client, playerId, { matchId });
        const match = result.rows[0];

        if (!match) {
          throw new CpuMatchNotFoundError();
        }

        return createResponse({
          matchId: match.id,
          status: match.status,
          version: match.version,
          state: match.state,
          winner: match.winner,
          startedAt: match.started_at,
          completedAt: match.completed_at,
          turnDeadline: match.turn_deadline,
          logActions: match.log_actions,
          cardNames: match.card_names,
          cardRarities: match.card_rarities,
        });
      } finally {
        client.release();
      }
    },

    async forfeitMatch(input) {
      const client = await database.connect();

      try {
        await client.query('begin');
        const match = await loadMatch(
          client,
          input.playerId,
          input.matchId,
          true,
        );

        if (match.status === 'completed') {
          throw new CpuMatchCompletedError();
        }

        if (match.version !== input.expectedVersion) {
          throw new CpuMatchVersionConflictError();
        }

        const completedAt = clock.now();
        const version = match.version + 1;
        const state: BattleState = {
          ...match.state,
          phase: 'completed',
          currentSide: null,
          replacementSide: null,
          replacementQueue: [],
          resumeSideAfterReplacement: null,
          winner: 'cpu',
        };
        const updated = await client.query<MatchIdentityRow>(
          `
            update public.cpu_matches
               set status = 'completed',
                   state = $1::jsonb,
                   version = $2,
                   winner = 'cpu',
                   turn_started_at = null,
                   turn_deadline = null,
                   completed_at = $3,
                   updated_at = now()
             where id = $4::uuid
               and player_id = $5::uuid
               and status = 'active'
               and version = $6
            returning id::text
          `,
          [
            JSON.stringify(state),
            version,
            completedAt,
            match.id,
            input.playerId,
            match.version,
          ],
        );
        if (updated.rows[0]?.id !== match.id) {
          throw new CpuMatchVersionConflictError();
        }

        await progressionPersistence.recordCpuMatch(client, match.id);
        const response = createResponse({
          matchId: match.id,
          status: 'completed',
          version,
          state,
          winner: 'cpu',
          startedAt: match.started_at,
          completedAt,
          turnDeadline: null,
          logActions: match.legacy_log_actions,
          cardNames: match.card_names,
          cardRarities: match.card_rarities,
        });
        await client.query('commit');
        return response;
      } catch (error) {
        await rollback(client);
        throw mapActionError(error);
      } finally {
        client.release();
      }
    },

    async submitAction(input) {
      const client = await database.connect();
      let released = false;

      try {
        await client.query('begin');

        const match = await loadMatch(
          client,
          input.playerId,
          input.matchId,
          true,
        );
        // Keep this as a fresh statement after the row lock. If it is folded
        // into the locking read, a request that waited for another writer can
        // retain an older statement snapshot and miss that writer's receipt.
        const duplicate = await client.query<ActionResponseRow>(
          `
            select
              submitted.action,
              submitted.submitted_intent,
              submitted_round.round_number - 1 as expected_version,
              submitted.response,
              case
                when submitted.response ? 'battleLog' then '[]'::jsonb
                else coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'sequence', log_action.sequence,
                      'roundNumber', round.round_number,
                      'roundStateBefore', round.state_before,
                      'roundStateAfter', round.state_after,
                      'result', log_action.result
                    )
                    order by log_action.sequence
                  )
                  from public.cpu_match_actions log_action
                  join public.cpu_match_rounds round
                    on round.id = log_action.round_id
                  where log_action.match_id = submitted.match_id
                    and log_action.sequence <= (
                      select max(round_action.sequence)
                      from public.cpu_match_actions round_action
                      where round_action.round_id = submitted.round_id
                    )
                ), '[]'::jsonb)
              end as legacy_log_actions
            from public.cpu_match_actions submitted
            join public.cpu_match_rounds submitted_round
              on submitted_round.id = submitted.round_id
             and submitted_round.match_id = submitted.match_id
            where submitted.match_id = $1::uuid
              and submitted.submission_id = $2::uuid
              and submitted.response is not null
          `,
          [input.matchId, input.submissionId],
        );

        if (duplicate.rows[0]?.response) {
          const stored = duplicate.rows[0];
          if (
            stored.expected_version !== input.expectedVersion ||
            !sameSubmittedIntent(stored, input.action)
          ) {
            throw new CpuMatchSubmissionConflictError();
          }
          const response = hasBattleLog(stored.response)
            ? normalizeStoredResponse(
                stored.response,
                stored.response.battleLog!,
              )
            : addBattleLogToStoredResponse(
                stored.response,
                stored.legacy_log_actions,
                match.state,
                match.card_names,
              );
          await client.query('commit');
          return addCreatureRarities(response, match.card_rarities);
        }

        if (match.status === 'completed') {
          throw new CpuMatchCompletedError();
        }

        if (match.version !== input.expectedVersion) {
          throw new CpuMatchVersionConflictError();
        }

        const stateBefore = match.state;
        // Every modern player receipt already contains the complete log through
        // its synchronous CPU chain. Extend that projection instead of loading
        // every prior action and repeated round-state snapshot on each turn.
        const previousBattleLog = Array.isArray(match.latest_battle_log)
          ? match.latest_battle_log
          : createBattleLog(
              match.legacy_log_actions ?? [],
              stateBefore,
              match.card_names,
            );
        const transitions: BattleTransition[] = [];
        const now = clock.now();
        const playerAction = actionForTimeoutIfNeeded(
          stateBefore,
          match.turn_deadline,
          now,
          input.action,
        );

        transitions.push(
          applyBattleAction(stateBefore, 'player', playerAction, randomInt),
        );

        let state = transitions[0]!.state;

        while (shouldAdvanceCpu(state)) {
          const cpuAction = chooseCpuAction(state, randomInt);
          const transition = applyBattleAction(
            state,
            'cpu',
            cpuAction ?? { type: 'timeout' },
            randomInt,
          );
          transitions.push(transition);
          state = transition.state;
        }

        const completed = state.winner !== null;
        const version = match.version + 1;
        const turnDeadline = getTurnDeadline(state, now);
        const baseSequence = match.action_sequence ?? 0;
        const currentLogActions = transitions.map(({ result }, index) => ({
          sequence: baseSequence + index + 1,
          roundNumber: version,
          roundStateBefore: stateBefore,
          roundStateAfter: state,
          result,
        }));
        const response = createResponse({
          matchId: match.id,
          status: completed ? 'completed' : 'active',
          version,
          state,
          winner: state.winner,
          startedAt: match.started_at,
          completedAt: completed ? now : null,
          turnDeadline,
          logActions: currentLogActions,
          previousBattleLog,
          cardNames: match.card_names,
          cardRarities: match.card_rarities,
        });

        const persisted = await client.query<TransitionPersistenceRow>(
          `
            with sequence_base as materialized (
              select coalesce(max(sequence), 0)::integer as value
              from public.cpu_match_actions
              where match_id = $1::uuid
            ),
            inserted_round as (
              insert into public.cpu_match_rounds (
                match_id,
                round_number,
                state_before,
                state_after,
                result
              )
              values ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::jsonb)
              returning id, match_id
            ),
            transition_payload as materialized (
              select transition.value, transition.ordinality::integer
              from jsonb_array_elements($6::jsonb)
                with ordinality as transition(value, ordinality)
            ),
            inserted_actions as (
              insert into public.cpu_match_actions (
                match_id,
                round_id,
                sequence,
                side,
                submission_id,
                submitted_intent,
                action,
                result,
                response
              )
              select
                $1::uuid,
                inserted_round.id,
                sequence_base.value + transition_payload.ordinality,
                transition_payload.value ->> 'side',
                case
                  when transition_payload.ordinality = 1 then $7::uuid
                  else null
                end,
                case
                  when transition_payload.ordinality = 1 then $15::jsonb
                  else null
                end,
                transition_payload.value -> 'action',
                transition_payload.value -> 'result',
                case
                  when transition_payload.ordinality = 1 then $8::jsonb
                  else null
                end
              from inserted_round
              cross join sequence_base
              cross join transition_payload
              order by transition_payload.ordinality
              returning
                match_id,
                round_id,
                sequence,
                submission_id,
                response
            ),
            updated_match as (
              update public.cpu_matches
                 set status = $9,
                     state = $4::jsonb,
                     version = $2,
                     winner = $10,
                     turn_started_at = $11,
                     turn_deadline = $12,
                     completed_at = $13,
                     updated_at = now()
               where id = $1::uuid
                 and version = $14
              returning id
            )
            select
              sequence_base.value as base_sequence,
              (select count(*)::integer from inserted_round) as round_count,
              (select id::text from inserted_round limit 1) as round_id,
              (select match_id::text from inserted_round limit 1) as round_match_id,
              (select count(*)::integer from inserted_actions) as action_count,
              (
                select min(sequence)::integer
                from inserted_actions
              ) as first_sequence,
              (
                select max(sequence)::integer
                from inserted_actions
              ) as last_sequence,
              (
                select count(*)::integer
                from inserted_actions
                where submission_id = $7::uuid
                  and response = $8::jsonb
              ) as player_receipt_count,
              (
                select count(*)::integer
                from inserted_actions
                where sequence <> sequence_base.value + 1
                  and (submission_id is not null or response is not null)
              ) as unexpected_receipt_count,
              coalesce(
                (
                  select bool_and(action.match_id = $1::uuid)
                  from inserted_actions action
                ),
                false
              ) as action_match_matches,
              coalesce(
                (
                  select bool_and(action.round_id = inserted_round.id)
                  from inserted_actions action
                  cross join inserted_round
                ),
                false
              ) as action_round_matches,
              (select count(*)::integer from updated_match) as match_update_count,
              (select id::text from updated_match limit 1) as updated_match_id
            from sequence_base
          `,
          [
            match.id,
            version,
            JSON.stringify(stateBefore),
            JSON.stringify(state),
            JSON.stringify(transitions.map(({ result }) => result)),
            JSON.stringify(
              transitions.map(({ result }) => ({
                side: result.side,
                action: result.action,
                result,
              })),
            ),
            input.submissionId,
            JSON.stringify(response),
            completed ? 'completed' : 'active',
            state.winner,
            completed ? null : state.phase === 'active' ? now : null,
            completed ? null : turnDeadline,
            completed ? now : null,
            match.version,
            JSON.stringify(input.action),
          ],
        );

        assertTransitionPersistence(
          persisted.rows[0],
          match.id,
          baseSequence,
          transitions.length,
        );

        if (completed) {
          await progressionPersistence.recordCpuMatch(client, match.id);
        }

        await client.query('commit');
        return response;
      } catch (error) {
        await rollback(client);
        const mapped = mapActionError(error);
        client.release();
        released = true;

        if (mapped instanceof CpuMatchSubmissionConflictError) {
          try {
            await trustService?.recordSubmissionConflict({
              playerId: input.playerId,
              operation: 'cpu_match_action',
              resourceIdentifier: input.matchId,
              submissionId: input.submissionId,
            });
          } catch {
            // Keep the original idempotency conflict authoritative. A retry can
            // attempt trust ingestion again without changing match state.
          }
        }
        throw mapped;
      } finally {
        if (!released) client.release();
      }
    },

    async listHistory(playerId) {
      const client = await database.connect();

      try {
        const matches = await client.query<MatchRow>(
          `
            select
              id::text,
              winner,
              started_at,
              completed_at
            from public.cpu_matches
            where player_id = $1::uuid
              and status = 'completed'
            order by completed_at desc, id desc
          `,
          [playerId],
        );

        const history: CpuMatchHistory[] = [];
        const roundsByMatch = await loadHistoryRounds(
          client,
          matches.rows.map((match) => match.id),
        );

        for (const match of matches.rows) {
          if (!match.completed_at || !match.winner) {
            continue;
          }

          const rounds = roundsByMatch.get(match.id) ?? [];
          history.push({
            matchId: match.id,
            status: 'completed',
            winner: match.winner,
            startedAt: match.started_at.toISOString(),
            completedAt: match.completed_at.toISOString(),
            rounds,
          });
        }

        return history;
      } finally {
        client.release();
      }
    },
  };
}

async function loadSelectedDeckCards(
  client: CpuMatchClient,
  playerId: string,
  deckId: string,
): Promise<{ cards: SavedDeckCardRow[]; deck: BattleDeck }> {
  try {
    const loaded = await loadPlayerBattleDeck(client, playerId, deckId, {
      requirePublished: false,
      requireSelected: true,
    });
    return {
      cards: loaded.cards.map((card) => ({
        position: card.position,
        owned_card_id: card.ownedCardId,
        card_definition_id: card.cardDefinitionId,
        name: card.name,
        category: card.category,
        affinity: card.affinity,
        rarity: card.rarity,
        hp: card.hp,
        power: card.power,
        is_active: true,
      })),
      deck: loaded.deck,
    };
  } catch (error) {
    if (error instanceof PlayerBattleDeckError) {
      throw new CpuMatchDeckError(
        'The selected deck is not a valid active deck.',
      );
    }
    throw error;
  }
}

async function loadCpuDeckCards(client: CpuMatchClient): Promise<CpuCardRow[]> {
  const configuredDefinitionIds = BASIC_CPU_DECK_CONFIGURATION.map(
    ({ cardDefinitionId }) => cardDefinitionId,
  );
  const expectedCategories = BASIC_CPU_DECK_CONFIGURATION.map(
    ({ category }) => category,
  );
  const result = await client.query<ConfiguredCpuCardRow>(
    `
      select
        configured.position::integer,
        configured.card_definition_id::text as configured_card_definition_id,
        configured.expected_category,
        definition.id::text as card_definition_id,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity,
        definition.hp,
        definition.power,
        definition.is_active,
        definition.authoring_status
      from unnest($1::uuid[], $2::text[]) with ordinality as configured(
        card_definition_id,
        expected_category,
        position
      )
      left join public.card_definitions definition
        on definition.id = configured.card_definition_id
      order by configured.position
    `,
    [configuredDefinitionIds, expectedCategories],
  );

  if (result.rows.length !== BASIC_CPU_DECK_CONFIGURATION.length) {
    throw new CpuMatchSetupError(
      'The Basic CPU deck configuration did not return all configured cards.',
    );
  }

  return result.rows.map((row, index) => {
    const configured = BASIC_CPU_DECK_CONFIGURATION[index];

    if (
      !configured ||
      row.position !== index + 1 ||
      row.configured_card_definition_id !== configured.cardDefinitionId ||
      row.expected_category !== configured.category
    ) {
      throw new CpuMatchSetupError(
        'The Basic CPU deck configuration order is invalid.',
      );
    }

    if (
      row.card_definition_id === null ||
      row.name === null ||
      row.category === null ||
      row.rarity === null
    ) {
      throw new CpuMatchSetupError(
        `Configured Basic CPU card ${configured.cardDefinitionId} does not exist.`,
      );
    }

    if (row.authoring_status !== 'published' || row.is_active !== true) {
      throw new CpuMatchSetupError(
        `Configured Basic CPU card ${configured.cardDefinitionId} is not active and published.`,
      );
    }

    if (row.category !== configured.category) {
      throw new CpuMatchSetupError(
        `Configured Basic CPU card ${configured.cardDefinitionId} must be a ${configured.category} card.`,
      );
    }

    if (row.category === 'creature' && row.affinity === null) {
      throw new CpuMatchSetupError(
        `Configured Basic CPU Creature ${configured.cardDefinitionId} requires an affinity.`,
      );
    }

    if (row.rarity !== 'common') {
      throw new CpuMatchSetupError(
        `Configured Basic CPU card ${configured.cardDefinitionId} must be common.`,
      );
    }

    return {
      position: row.position,
      card_definition_id: row.card_definition_id,
      name: row.name,
      category: row.category,
      affinity: row.affinity,
      rarity: row.rarity,
      hp: row.hp,
      power: row.power,
      is_active: row.is_active,
    };
  });
}

async function buildBattleDeck(
  client: CpuMatchClient,
  cards: readonly (SavedDeckCardRow | CpuCardRow)[],
  side: 'player' | 'cpu',
): Promise<BattleDeck> {
  const definitionIds = [
    ...new Set(cards.map((card) => card.card_definition_id)),
  ];
  const [movesResult, moveEffectsResult, effectsResult] = await Promise.all([
    client.query<MoveRow>(
      `
        select
          id::text,
          card_definition_id::text,
          position,
          name,
          move_type,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns,
          power_cost
        from public.card_moves
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position
      `,
      [definitionIds],
    ),
    client.query<MoveEffectRow>(
      `
        select
          effect.id::text,
          effect.card_move_id::text,
          effect.card_definition_id::text,
          effect.effect_code,
          effect.effect_value,
          effect.effect_config,
          case
            when effect.effect_code = 'damage' then 'damage'
            when effect.effect_code = 'heal' then 'heal'
            when effect.effect_code in ('poison', 'stun') then 'debuff'
            when effect.effect_code in ('power_change', 'damage_modifier')
              and effect.effect_config ->> 'target' = 'opponent' then 'debuff'
            else 'buff'
          end as effect_type,
          null::text as modifier_stat,
          null::text as modifier_operation,
          null::integer as modifier_duration_turns,
          0::integer as position
        from public.card_move_effects effect
        where effect.card_definition_id = any($1::uuid[])
        order by effect.card_definition_id, effect.card_move_id, effect.position
      `,
      [definitionIds],
    ),
    client.query<EffectRow>(
      `
        select
          id::text,
          card_definition_id::text,
          position,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns,
          effect_code,
          effect_config
        from public.card_effects
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position
      `,
      [definitionIds],
    ),
  ]);

  const movesByDefinition = groupByDefinition(movesResult.rows);
  const effectsByMove = groupByKey(moveEffectsResult.rows, 'card_move_id');
  const effectsByDefinition = groupByDefinition(effectsResult.rows);
  const creatures: BattleCreatureCard[] = [];
  const powerCards: BattlePowerCard[] = [];

  for (const card of cards) {
    const id =
      side === 'player' && 'owned_card_id' in card
        ? card.owned_card_id
        : card.card_definition_id;

    if (card.category === 'creature') {
      if (card.affinity === null || card.hp === null || card.power === null) {
        throw new CpuMatchSetupError(
          `Creature ${card.name} has incomplete stats.`,
        );
      }

      creatures.push({
        id,
        affinity: card.affinity,
        maxHp: card.hp,
        maxPower: card.power,
        moves: (movesByDefinition.get(card.card_definition_id) ?? []).map(
          (move) => mapBattleMove(move, effectsByMove.get(move.id) ?? []),
        ),
      });
    } else {
      powerCards.push({
        id,
        affinity: card.affinity,
        effects: (effectsByDefinition.get(card.card_definition_id) ?? []).map(
          mapBattleEffect,
        ),
      });
    }
  }

  return { creatureCards: creatures, powerCards };
}

function groupByDefinition<T extends { card_definition_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const values = grouped.get(row.card_definition_id) ?? [];
    values.push(row);
    grouped.set(row.card_definition_id, values);
  }

  return grouped;
}

function groupByKey<T extends Record<K, string>, K extends keyof T>(
  rows: readonly T[],
  key: K,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row[key]) ?? [];
    values.push(row);
    grouped.set(row[key], values);
  }
  return grouped;
}

function mapBattleMove(
  row: MoveRow,
  effects: readonly MoveEffectRow[],
): BattleMove {
  return {
    id: row.id,
    name: row.name,
    moveType: row.move_type,
    powerCost: row.power_cost,
    effects:
      effects.length > 0
        ? effects.map(mapBattleEffect)
        : [mapBattleEffect(row)],
  };
}

function mapBattleEffect(row: MoveRow | EffectRow): BattleEffect {
  if ('effect_code' in row) {
    const config = asEffectConfig(row.effect_config);
    const target = readEffectTarget(config.target);
    const durationTurns = readInteger(config.durationTurns);
    const charges = readInteger(config.charges);
    const minimumHpExclusive = readInteger(config.minimumHpExclusive);
    return {
      id: row.id,
      effectType: row.effect_type,
      effectValue: row.effect_value,
      effectCode: row.effect_code,
      ...(target ? { target } : {}),
      ...(durationTurns === undefined ? {} : { durationTurns }),
      ...(charges === undefined ? {} : { charges }),
      ...(typeof config.neutral === 'boolean'
        ? { neutral: config.neutral }
        : {}),
      ...(typeof config.bypassDefense === 'boolean'
        ? { bypassDefense: config.bypassDefense }
        : {}),
      ...(minimumHpExclusive === undefined ? {} : { minimumHpExclusive }),
      ...(typeof config.cannotDefeat === 'boolean'
        ? { cannotDefeat: config.cannotDefeat }
        : {}),
      ...(typeof config.immunityAfterRecovery === 'boolean'
        ? { immunityAfterRecovery: config.immunityAfterRecovery }
        : {}),
    };
  }
  const modifier =
    row.modifier_stat && row.modifier_operation
      ? {
          stat: row.modifier_stat,
          operation: row.modifier_operation,
          durationTurns: row.modifier_duration_turns,
        }
      : undefined;

  return {
    id: row.id,
    effectType: row.effect_type,
    effectValue: row.effect_value,
    modifier,
  };
}

function asEffectConfig(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function readEffectTarget(value: unknown): EffectTarget | undefined {
  return value === 'self' || value === 'opponent' || value === 'both'
    ? value
    : undefined;
}

async function insertSnapshots(
  client: CpuMatchClient,
  matchId: string,
  playerCards: readonly SavedDeckCardRow[],
  cpuCards: readonly CpuCardRow[],
  decks: { player: BattleDeck; cpu: BattleDeck },
): Promise<void> {
  const snapshots: SnapshotCard[] = [
    ...snapshotDeck('player', playerCards, decks.player),
    ...snapshotDeck('cpu', cpuCards, decks.cpu),
  ];

  for (const snapshot of snapshots) {
    await client.query(
      `
        insert into public.cpu_match_cards (
          match_id,
          side,
          position,
          owned_card_id,
          card_definition_id,
          snapshot
        )
        values ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::jsonb)
      `,
      [
        matchId,
        snapshot.side,
        snapshot.position,
        snapshot.ownedCardId,
        snapshot.cardDefinitionId,
        JSON.stringify({
          cardDefinitionId: snapshot.cardDefinitionId,
          name: snapshot.name,
          category: snapshot.category,
          affinity: snapshot.affinity,
          rarity: snapshot.rarity,
          battleCard: snapshot.card,
        }),
      ],
    );
  }
}

function snapshotDeck(
  side: 'player' | 'cpu',
  rows: readonly (SavedDeckCardRow | CpuCardRow)[],
  deck: BattleDeck,
): SnapshotCard[] {
  let creatureIndex = 0;
  let powerIndex = 0;

  return rows.map((row) => {
    const card =
      row.category === 'creature'
        ? deck.creatureCards[creatureIndex++]
        : deck.powerCards[powerIndex++];

    if (!card) {
      throw new CpuMatchSetupError('The match deck snapshot is incomplete.');
    }

    return {
      side,
      position: row.position,
      ownedCardId: 'owned_card_id' in row ? row.owned_card_id : null,
      cardDefinitionId: row.card_definition_id,
      name: row.name,
      category: row.category,
      affinity: row.affinity,
      rarity: row.rarity,
      card,
    };
  });
}

async function loadMatch(
  client: CpuMatchClient,
  playerId: string,
  matchId: string,
  forUpdate: boolean,
): Promise<ActionMatchRow> {
  const result = await client.query<ActionMatchRow>(
    `
      select
        cpu_matches.id::text,
        cpu_matches.player_id::text,
        cpu_matches.status,
        cpu_matches.state,
        cpu_matches.version,
        cpu_matches.turn_started_at,
        cpu_matches.turn_deadline,
        cpu_matches.winner,
        cpu_matches.started_at,
        cpu_matches.completed_at,
        coalesce((
          select jsonb_object_agg(
            card.snapshot -> 'battleCard' ->> 'id',
            card.snapshot ->> 'name'
          )
          from public.cpu_match_cards card
          where card.match_id = cpu_matches.id
        ), '{}'::jsonb) as card_names,
        coalesce((
          select jsonb_object_agg(
            card.snapshot -> 'battleCard' ->> 'id',
            card.snapshot ->> 'rarity'
          )
          from public.cpu_match_cards card
          where card.match_id = cpu_matches.id
        ), '{}'::jsonb) as card_rarities,
        action_summary.action_sequence,
        action_summary.latest_battle_log,
        case
          when action_summary.latest_battle_log is not null
            then '[]'::jsonb
          else coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'sequence', action.sequence,
                'roundNumber', round.round_number,
                'roundStateBefore', round.state_before,
                'roundStateAfter', round.state_after,
                'result', action.result
              )
              order by action.sequence
            )
            from public.cpu_match_actions action
            join public.cpu_match_rounds round on round.id = action.round_id
            where action.match_id = cpu_matches.id
          ), '[]'::jsonb)
        end as legacy_log_actions
      from public.cpu_matches
      cross join lateral (
        select
          coalesce((
            select max(action.sequence)
            from public.cpu_match_actions action
            where action.match_id = cpu_matches.id
          ), 0)::integer as action_sequence,
          (
            select action.response -> 'battleLog'
            from public.cpu_match_actions action
            where action.match_id = cpu_matches.id
              and action.response is not null
            order by action.sequence desc
            limit 1
          ) as latest_battle_log
      ) action_summary
      where cpu_matches.id = $1::uuid
        and cpu_matches.player_id = $2::uuid
      ${forUpdate ? 'for update of cpu_matches' : ''}
    `,
    [matchId, playerId],
  );

  const match = result.rows[0];
  if (!match) {
    throw new CpuMatchNotFoundError();
  }

  return match;
}

async function loadMatchView(
  client: CpuMatchClient,
  playerId: string,
  filter: { activeOnly: true } | { matchId: string },
): Promise<{ rows: MatchViewRow[] }> {
  const activeOnly = 'activeOnly' in filter;
  const matchId = 'matchId' in filter ? filter.matchId : null;

  return client.query<MatchViewRow>(
    `
      select
        match.id::text,
        match.player_id::text,
        match.status,
        match.state,
        match.version,
        match.turn_started_at,
        match.turn_deadline,
        match.winner,
        match.started_at,
        match.completed_at,
        coalesce((
          select jsonb_object_agg(
            card.snapshot -> 'battleCard' ->> 'id',
            card.snapshot ->> 'name'
          )
          from public.cpu_match_cards card
          where card.match_id = match.id
        ), '{}'::jsonb) as card_names,
        coalesce((
          select jsonb_object_agg(
            card.snapshot -> 'battleCard' ->> 'id',
            card.snapshot ->> 'rarity'
          )
          from public.cpu_match_cards card
          where card.match_id = match.id
        ), '{}'::jsonb) as card_rarities,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'sequence', action.sequence,
              'roundNumber', round.round_number,
              'roundStateBefore', round.state_before,
              'roundStateAfter', round.state_after,
              'result', action.result
            )
            order by action.sequence
          )
          from public.cpu_match_actions action
          join public.cpu_match_rounds round on round.id = action.round_id
          where action.match_id = match.id
        ), '[]'::jsonb) as log_actions
      from public.cpu_matches match
      where match.player_id = $1::uuid
        and ($2::uuid is null or match.id = $2::uuid)
        and ($3::boolean = false or match.status = 'active')
    `,
    [playerId, matchId, activeOnly],
  );
}

async function loadHistoryRounds(
  client: CpuMatchClient,
  matchIds: string[],
): Promise<Map<string, CpuMatchHistoryRound[]>> {
  const history = new Map<string, CpuMatchHistoryRound[]>();
  if (matchIds.length === 0) return history;
  const rounds = await client.query<RoundRow>(
    `select id, match_id, round_number, result, state_after, created_at
     from public.cpu_match_rounds
     where match_id = any($1::uuid[])
     order by match_id, round_number`,
    [matchIds],
  );
  if (rounds.rows.length === 0) return history;
  const actions = await client.query<ActionRow>(
    `select round_id, sequence, side, submission_id, action, result, created_at
     from public.cpu_match_actions
     where match_id = any($1::uuid[])
     order by sequence`,
    [matchIds],
  );
  const actionsByRound = new Map<string, ActionRow[]>();
  for (const action of actions.rows) {
    const group = actionsByRound.get(action.round_id) ?? [];
    group.push(action);
    actionsByRound.set(action.round_id, group);
  }
  for (const round of rounds.rows) {
    const group = history.get(round.match_id) ?? [];
    group.push({
      roundNumber: round.round_number,
      actions: (actionsByRound.get(round.id) ?? []).map((action) => ({
        sequence: action.sequence,
        side: action.side,
        submissionId: action.submission_id,
        action: action.action,
        result: toPublicActionResult(
          normalizeStoredActionResult(action.result),
          round.state_after,
        ),
        createdAt: action.created_at.toISOString(),
      })),
      result: round.result.map((result) =>
        toPublicActionResult(
          normalizeStoredActionResult(result),
          round.state_after,
        ),
      ),
      createdAt: round.created_at.toISOString(),
    });
    history.set(round.match_id, group);
  }
  return history;
}

function createResponse(input: {
  matchId: string;
  status: 'active' | 'completed';
  version: number;
  state: BattleState;
  winner: 'player' | 'cpu' | null;
  startedAt: Date;
  completedAt: Date | null;
  turnDeadline: Date | null;
  logActions: readonly BattleLogActionRow[];
  previousBattleLog?: readonly CpuMatchBattleLogGroup[];
  cardNames?: Readonly<Record<string, string>>;
  cardRarities?: Readonly<Record<string, CardRarity>>;
}): CpuMatchResponse {
  const lastAction = input.logActions.at(-1)?.result ?? null;
  const currentBattleLog = createBattleLog(
    input.logActions,
    input.state,
    input.cardNames,
  );
  return {
    matchId: input.matchId,
    status: input.status,
    version: input.version,
    winner: input.winner,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt?.toISOString() ?? null,
    state: toPublicState(
      input.state,
      input.turnDeadline,
      input.cardNames,
      input.cardRarities,
    ),
    lastAction:
      lastAction === null
        ? null
        : toPublicActionResult(
            normalizeStoredActionResult(lastAction),
            input.state,
          ),
    battleLog:
      input.previousBattleLog === undefined
        ? currentBattleLog
        : mergeBattleLogs(input.previousBattleLog, currentBattleLog),
  };
}

function hasBattleLog(
  response: StoredCpuMatchResponse | null | undefined,
): response is StoredCpuMatchResponse & {
  battleLog: readonly CpuMatchBattleLogGroup[];
} {
  return Array.isArray(response?.battleLog);
}

function normalizeStoredResponse(
  response: StoredCpuMatchResponse,
  battleLog: readonly CpuMatchBattleLogGroup[],
): CpuMatchResponse {
  return {
    ...response,
    battleLog,
    lastAction:
      response.lastAction === null
        ? null
        : {
            ...response.lastAction,
            effects: response.lastAction.effects.map(toPublicAppliedEffect),
            expiredEffects: response.lastAction.expiredEffects ?? [],
          },
  };
}

function addBattleLogToStoredResponse(
  response: StoredCpuMatchResponse,
  logActions: readonly BattleLogActionRow[],
  state: BattleState,
  cardNames: Readonly<Record<string, string>> = {},
): CpuMatchResponse {
  return normalizeStoredResponse(
    response,
    createBattleLog(logActions, state, cardNames),
  );
}

function mergeBattleLogs(
  previous: readonly CpuMatchBattleLogGroup[],
  current: readonly CpuMatchBattleLogGroup[],
): CpuMatchBattleLogGroup[] {
  const groups = previous.map((group) => ({
    ...group,
    events: [...group.events],
  }));
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  for (const currentGroup of current) {
    const existing = groupsById.get(currentGroup.id);
    if (existing) {
      existing.events.push(...currentGroup.events);
      continue;
    }

    const added = { ...currentGroup, events: [...currentGroup.events] };
    groups.push(added);
    groupsById.set(added.id, added);
  }

  return groups;
}

function normalizeStoredActionResult(
  result: StoredBattleActionResult,
): BattleActionResult {
  return {
    ...result,
    expiredEffects: result.expiredEffects ?? [],
  };
}

function createBattleLog(
  actionRows: readonly BattleLogActionRow[],
  state: BattleState,
  cardNames: Readonly<Record<string, string>> = {},
): CpuMatchBattleLogGroup[] {
  const groups: Array<{
    id: string;
    label: string;
    turnNumber: number;
    events: CpuMatchBattleLogEvent[];
  }> = [];
  const seenSequences = new Set<number>();
  let roundNumber: number | null = null;
  let projection = battleLogProjection(
    actionRows[0]?.roundStateBefore ?? state,
  );

  for (const row of [...actionRows].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (seenSequences.has(row.sequence)) continue;
    seenSequences.add(row.sequence);

    if (roundNumber !== row.roundNumber) {
      roundNumber = row.roundNumber;
      projection = battleLogProjection(row.roundStateBefore);
    }

    const result = normalizeStoredActionResult(row.result);
    const groupTurn =
      result.action.type === 'select_initial_creature'
        ? 0
        : projection.turnNumber;
    const group = getBattleLogGroup(groups, groupTurn);
    let eventIndex = 0;
    const addEvent = (
      kind: CpuMatchBattleLogEventKind,
      message: string,
      side: 'player' | 'cpu' | null = result.side,
    ) => {
      group.events.push({
        id: `${row.sequence}:${eventIndex++}`,
        sequence: row.sequence,
        side,
        kind,
        message,
      });
    };

    const actorCreatureId = projection.activeCreatureIds[result.side];
    const actorCreatureName = actorCreatureId
      ? battleCreatureName(state, actorCreatureId, cardNames)
      : null;

    if (result.action.type === 'select_initial_creature') {
      const name = battleCreatureName(
        state,
        result.action.creatureId,
        cardNames,
      );
      addEvent(
        'action',
        result.side === 'player'
          ? `Player selected ${name}.`
          : `CPU revealed ${name}.`,
      );
      projection.selections[result.side] = result.action.creatureId;
      projection.activeCreatureIds[result.side] = result.action.creatureId;

      if (projection.selections.player && projection.selections.cpu) {
        projection.turnNumber = 1;
        const firstSide = row.roundStateAfter.firstSide;
        addEvent(
          'turn',
          `Turn 1 began.${firstSide ? ` ${battleSideLabel(firstSide)} has the first action.` : ''}`,
          firstSide,
        );
      }
    } else if (result.action.type === 'select_replacement') {
      const name = battleCreatureName(
        state,
        result.action.creatureId,
        cardNames,
      );
      addEvent(
        'action',
        `${battleSideLabel(result.side)} sent out ${name} as a replacement.`,
      );
      projection.activeCreatureIds[result.side] = result.action.creatureId;
    } else if (result.action.type === 'use_move') {
      const source = findBattleMove(state, result.action.moveId);
      const creatureName =
        actorCreatureName ??
        (source
          ? battleCreatureName(state, source.creatureId, cardNames)
          : 'Creature');
      addEvent(
        'action',
        `${battleSidePossessive(result.side)} ${creatureName} used ${source?.move.name ?? 'a Creature move'}.`,
      );
      if (source && source.move.powerCost > 0) {
        addEvent(
          'effect',
          `${creatureSubject(result.side, creatureName)} spent ${source.move.powerCost} Power.`,
          result.side,
        );
      }
    } else if (result.action.type === 'use_power_card') {
      addEvent(
        'action',
        `${battleSideLabel(result.side)} used ${battlePowerCardName(
          state,
          result.action.powerCardId,
          cardNames,
        )}.`,
      );
    } else {
      addEvent('action', `${battleSideLabel(result.side)}'s turn timed out.`);
    }

    for (const effect of result.effects) {
      addEvent(
        'effect',
        describeBattleLogEffect(effect, state, cardNames),
        effect.targetSide,
      );
    }

    for (const expired of result.expiredEffects) {
      addEvent(
        'effect_expired',
        describeExpiredBattleLogEffect(expired, state, cardNames),
        expired.targetSide,
      );
    }

    if (result.defeatedCreatureId) {
      const defeatedSide = oppositeBattleSide(result.side);
      addEvent(
        'defeat',
        `${creatureSubject(
          defeatedSide,
          battleCreatureName(state, result.defeatedCreatureId, cardNames),
        )} was defeated.`,
        defeatedSide,
      );
      projection.activeCreatureIds[defeatedSide] = null;
    }

    if (result.winner) {
      addEvent(
        'result',
        `${battleSideLabel(result.winner)} won the match.`,
        result.winner,
      );
    } else if (result.turnEnded) {
      const nextSide = oppositeBattleSide(result.side);
      addEvent(
        'turn',
        result.defeatedCreatureId
          ? `Turn ${projection.turnNumber} ended. ${battleSideLabel(nextSide)} must choose a replacement.`
          : `Turn ${projection.turnNumber} ended. ${battleSideLabel(nextSide)} is next.`,
        nextSide,
      );
      projection.turnNumber += 1;
    }
  }

  return groups;
}

function battleLogProjection(state: BattleState) {
  return {
    turnNumber: state.turnNumber,
    selections: { ...state.selections },
    activeCreatureIds: {
      player: state.participants.player.activeCreatureId,
      cpu: state.participants.cpu.activeCreatureId,
    },
  };
}

function getBattleLogGroup(
  groups: Array<{
    id: string;
    label: string;
    turnNumber: number;
    events: CpuMatchBattleLogEvent[];
  }>,
  turnNumber: number,
) {
  const id = turnNumber === 0 ? 'opening' : `turn-${turnNumber}`;
  const existing = groups.find((group) => group.id === id);
  if (existing) return existing;

  const group = {
    id,
    label: turnNumber === 0 ? 'Opening' : `Turn ${turnNumber}`,
    turnNumber,
    events: [] as CpuMatchBattleLogEvent[],
  };
  groups.push(group);
  return group;
}

function describeBattleLogEffect(
  effect: BattleActionResult['effects'][number],
  state: BattleState,
  cardNames: Readonly<Record<string, string>>,
): string {
  const subject = creatureSubject(
    effect.targetSide,
    battleCreatureName(state, effect.targetCreatureId, cardNames),
  );
  const definition = findEffect(state, effect.effectId);
  const amount = Math.abs(effect.amount);

  if (effect.effectType === 'damage') {
    return `${subject} took ${amount} damage.`;
  }
  if (effect.effectType === 'heal') {
    return `${subject} restored ${amount} HP.`;
  }
  if (definition?.modifier?.stat === 'hp') {
    return effect.effectType === 'buff'
      ? `${subject} restored ${amount} HP.`
      : `${subject} lost ${amount} HP.`;
  }
  if (definition?.modifier?.stat === 'power') {
    return effect.effectType === 'buff'
      ? `${subject} restored ${amount} Power.`
      : `${subject} lost ${amount} Power.`;
  }
  if (definition?.modifier?.stat === 'damage_multiplier') {
    const sign = effect.effectType === 'buff' ? '+' : '−';
    return `${subject} gained Damage ${sign}${battleLogDamagePercentage(
      effect.damageMultiplier,
    )}% for ${battleLogDuration(definition.modifier.durationTurns ?? null)}.`;
  }

  return `${subject} received ${effect.effectType} ${effect.amount}.`;
}

function describeExpiredBattleLogEffect(
  effect: BattleActionResult['expiredEffects'][number],
  state: BattleState,
  cardNames: Readonly<Record<string, string>>,
): string {
  const subject = creatureSubject(
    effect.targetSide,
    battleCreatureName(state, effect.targetCreatureId, cardNames),
  );
  const definition = findEffect(state, effect.effectId);

  if (definition?.modifier?.stat === 'damage_multiplier') {
    const sign = definition.effectType === 'buff' ? '+' : '−';
    return `${subject} no longer has Damage ${sign}${battleLogDamagePercentage(
      effect.damageMultiplier,
    )}%.`;
  }

  return `${subject} no longer has an expired active effect.`;
}

function battleLogDuration(durationTurns: number | null): string {
  if (durationTurns === null) return 'the rest of the battle';
  return `${durationTurns} ${durationTurns === 1 ? 'turn' : 'turns'}`;
}

function battleLogDamagePercentage(damageMultiplier: number | null): number {
  if (
    damageMultiplier === null ||
    !Number.isFinite(damageMultiplier) ||
    damageMultiplier < 0
  ) {
    throw new CpuMatchSetupError(
      'Persisted damage modifier is missing its effective multiplier.',
    );
  }

  return Math.abs(Math.round((damageMultiplier - 1) * 100));
}

function battleCreatureName(
  state: BattleState,
  creatureId: string,
  cardNames: Readonly<Record<string, string>>,
): string {
  const creature = Object.values(state.participants)
    .flatMap((participant) => participant.creatures)
    .find((candidate) => candidate.card.id === creatureId);
  return (
    cardNames[creatureId] ??
    (creature ? `${titleCase(creature.card.affinity)} Creature` : 'Creature')
  );
}

function battlePowerCardName(
  state: BattleState,
  powerCardId: string,
  cardNames: Readonly<Record<string, string>>,
): string {
  const card = Object.values(state.participants)
    .flatMap((participant) => participant.powerCards)
    .find((candidate) => candidate.id === powerCardId);
  return (
    cardNames[powerCardId] ??
    (card?.affinity ? `${titleCase(card.affinity)} Power card` : 'a Power card')
  );
}

function findBattleMove(state: BattleState, moveId: string) {
  for (const participant of Object.values(state.participants)) {
    for (const creature of participant.creatures) {
      const move = creature.card.moves.find(
        (candidate) => candidate.id === moveId,
      );
      if (move) return { creatureId: creature.card.id, move };
    }
  }
  return null;
}

function battleSideLabel(side: 'player' | 'cpu'): string {
  return side === 'player' ? 'Player' : 'CPU';
}

function battleSidePossessive(side: 'player' | 'cpu'): string {
  return side === 'player' ? "Player's" : "CPU's";
}

function creatureSubject(side: 'player' | 'cpu', name: string): string {
  return `${battleSidePossessive(side)} ${name}`;
}

function oppositeBattleSide(side: 'player' | 'cpu'): 'player' | 'cpu' {
  return side === 'player' ? 'cpu' : 'player';
}

function toPublicState(
  state: BattleState,
  turnDeadline: Date | null,
  cardNames: Readonly<Record<string, string>> = {},
  cardRarities: Readonly<Record<string, CardRarity>> = {},
): CpuMatchStateView {
  const player = state.participants.player;
  const cpu = state.participants.cpu;
  const visibleCpuCreatures = cpu.creatures.filter(
    (creature) =>
      creature.defeated || creature.card.id === cpu.activeCreatureId,
  );
  const cpuActiveCreature =
    cpu.activeCreatureId === null
      ? null
      : cpu.creatures.find(
          (creature) => creature.card.id === cpu.activeCreatureId,
        )!;
  const playerActiveCreature =
    player.activeCreatureId === null
      ? null
      : player.creatures.find(
          (creature) => creature.card.id === player.activeCreatureId,
        )!;
  const playerCreatures = player.creatures.map((creature) =>
    toPublicCreature(
      creature,
      cardNames,
      cardRarities,
      cpuActiveCreature?.card.affinity ?? null,
      state.affinityRulesVersion ?? 1,
    ),
  );

  return {
    phase: state.phase,
    turnNumber: state.turnNumber,
    currentSide: state.currentSide,
    replacementSide: state.replacementSide,
    firstSide: state.firstSide,
    selections: {
      player: state.selections.player,
      cpu: state.selections.cpu,
    },
    player: {
      creatures: playerCreatures,
      powerCards: player.powerCards.map((card) => ({
        id: card.id,
        name:
          cardNames[card.id] ??
          (card.affinity
            ? `${titleCase(card.affinity)} Power card`
            : 'Power card'),
        affinity: card.affinity,
        effects: card.effects.map(toPublicEffect),
        available: !player.usedPowerCardIds.includes(card.id),
      })),
      usedPowerCardIds: player.usedPowerCardIds,
      activeCreatureId: player.activeCreatureId,
    },
    cpu: {
      activeCreature:
        cpuActiveCreature === null
          ? null
          : toPublicCreature(
              cpuActiveCreature,
              cardNames,
              cardRarities,
              playerActiveCreature?.card.affinity ?? null,
              state.affinityRulesVersion ?? 1,
            ),
      defeatedCreatures: visibleCpuCreatures
        .filter((creature) => creature.defeated)
        .map((creature) =>
          toPublicCreature(
            creature,
            cardNames,
            cardRarities,
            playerActiveCreature?.card.affinity ?? null,
            state.affinityRulesVersion ?? 1,
          ),
        ),
      remainingCreatureCount: cpu.creatures.filter(
        (creature) => !creature.defeated,
      ).length,
      usedPowerCardIds: cpu.usedPowerCardIds,
      remainingPowerCardCount:
        cpu.powerCards.length - cpu.usedPowerCardIds.length,
    },
    legalActions: getLegalActions(state, 'player').map(toPublicAction),
    turnDeadline: turnDeadline?.toISOString() ?? null,
  };
}

function toPublicCreature(
  creature: {
    card: BattleCreatureCard;
    currentHp: number;
    remainingPower: number;
    defeated: boolean;
    modifiers: BattleState['participants']['player']['creatures'][number]['modifiers'];
  },
  cardNames: Readonly<Record<string, string>>,
  cardRarities: Readonly<Record<string, CardRarity>>,
  defendingAffinity: CardAffinity | null = null,
  affinityRulesVersion: 1 | 2 = 1,
): PublicCreatureView {
  return {
    id: creature.card.id,
    name:
      cardNames[creature.card.id] ??
      `${titleCase(creature.card.affinity)} Creature`,
    affinity: creature.card.affinity,
    rarity: cardRarities[creature.card.id] ?? 'common',
    maxHp: creature.card.maxHp,
    maxPower: creature.card.maxPower,
    currentHp: creature.currentHp,
    remainingPower: creature.remainingPower,
    defeated: creature.defeated,
    moves: creature.card.moves.map((move) => ({
      effectiveness: moveEffectiveness(
        move,
        defendingAffinity,
        affinityRulesVersion,
      ),
      id: move.id,
      name: move.name,
      moveType: move.moveType,
      powerCost: move.powerCost,
      effects: move.effects.map(toPublicEffect),
    })),
    activeModifiers: creature.modifiers.map(toPublicActiveModifier),
  };
}

function moveEffectiveness(
  move: BattleMove,
  defendingAffinity: CardAffinity | null,
  affinityRulesVersion: 1 | 2,
): PublicMoveView['effectiveness'] {
  const hasAffinityDamage = move.effects.some(
    (effect) =>
      effect.effectType === 'damage' &&
      effect.target !== 'self' &&
      effect.neutral !== true,
  );
  if (!hasAffinityDamage || defendingAffinity === null) return null;

  const multiplier = getTypeMultiplier(
    move.moveType,
    defendingAffinity,
    affinityRulesVersion,
  );
  return multiplier > 1 ? 'effective' : multiplier < 1 ? 'resisted' : 'neutral';
}

function toPublicEffect(effect: BattleEffect): PublicEffectView {
  const damageMultiplier =
    effect.modifier?.stat === 'damage_multiplier' &&
    effect.effectValue !== null &&
    (effect.effectType === 'buff' || effect.effectType === 'debuff')
      ? getEffectDamageMultiplier(effect.effectType, effect.effectValue)
      : null;

  return {
    damageMultiplier,
    effectType: effect.effectType,
    effectValue: effect.effectValue,
    modifier: effect.modifier ?? null,
  };
}

function toPublicActiveModifier(
  modifier: BattleState['participants']['player']['creatures'][number]['modifiers'][number],
): PublicActiveModifierView {
  if (
    !Number.isFinite(modifier.value) ||
    modifier.value < 0 ||
    (modifier.remainingTurns !== null &&
      (!Number.isInteger(modifier.remainingTurns) ||
        modifier.remainingTurns <= 0)) ||
    (modifier.remainingCharges !== null &&
      modifier.remainingCharges !== undefined &&
      (!Number.isInteger(modifier.remainingCharges) ||
        modifier.remainingCharges <= 0))
  ) {
    throw new CpuMatchSetupError(
      'Persisted active modifier state is not player-readable.',
    );
  }

  return {
    stat: modifier.stat,
    operation: modifier.operation,
    value: modifier.value,
    percentage:
      modifier.stat === 'damage_multiplier' ||
      modifier.stat === 'incoming_damage_multiplier'
        ? Math.round((modifier.value - 1) * 100)
        : null,
    remainingTurns: modifier.remainingTurns,
    remainingCharges: modifier.remainingCharges ?? null,
  };
}

function toPublicActionResult(
  result: BattleActionResult,
  state: BattleState,
): PublicBattleActionResult {
  return {
    ...result,
    effects: result.effects.map((effect) =>
      toPublicAppliedEffect({
        ...effect,
        modifier: findEffect(state, effect.effectId)?.modifier ?? null,
      }),
    ),
  };
}

// Engine and stored effects can contain internal metadata such as effectCode.
// Project the existing public contract before strict response serialization,
// including when replaying a receipt saved by an older server version.
function toPublicAppliedEffect(
  effect: PublicAppliedEffectView,
): PublicAppliedEffectView {
  return {
    effectId: effect.effectId,
    effectType: effect.effectType,
    targetSide: effect.targetSide,
    targetCreatureId: effect.targetCreatureId,
    amount: effect.amount,
    damageMultiplier: effect.damageMultiplier,
    modifier: effect.modifier ?? null,
  };
}

function findEffect(state: BattleState, effectId: string): BattleEffect | null {
  for (const participant of Object.values(state.participants)) {
    for (const creature of participant.creatures) {
      for (const move of creature.card.moves) {
        const effect = move.effects.find(
          (candidate) => candidate.id === effectId,
        );
        if (effect) return effect;
      }
    }

    for (const card of participant.powerCards) {
      const effect = card.effects.find(
        (candidate) => candidate.id === effectId,
      );
      if (effect) return effect;
    }
  }

  return null;
}

function cardNamesFromSnapshots(
  snapshots: readonly SnapshotCard[],
): Record<string, string> {
  return Object.fromEntries(
    snapshots.map((snapshot) => [snapshot.card.id, snapshot.name]),
  );
}

function cardRaritiesFromSnapshots(
  snapshots: readonly SnapshotCard[],
): Record<string, CardRarity> {
  return Object.fromEntries(
    snapshots.map((snapshot) => [snapshot.card.id, snapshot.rarity]),
  );
}

function addCreatureRarities(
  response: CpuMatchResponse,
  cardRarities: Readonly<Record<string, CardRarity>> = {},
): CpuMatchResponse {
  if (
    !response.state.player ||
    !Array.isArray(response.state.player.creatures) ||
    !response.state.cpu ||
    !Array.isArray(response.state.cpu.defeatedCreatures)
  ) {
    return response;
  }
  const withRarity = (creature: PublicCreatureView): PublicCreatureView => ({
    ...creature,
    rarity: cardRarities[creature.id] ?? creature.rarity ?? 'common',
  });
  return {
    ...response,
    state: {
      ...response.state,
      player: {
        ...response.state.player,
        creatures: response.state.player.creatures.map(withRarity),
      },
      cpu: {
        ...response.state.cpu,
        activeCreature:
          response.state.cpu.activeCreature === null
            ? null
            : withRarity(response.state.cpu.activeCreature),
        defeatedCreatures: response.state.cpu.defeatedCreatures.map(withRarity),
      },
    },
  };
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function toPublicAction(action: BattleAction): CpuMatchActionView {
  if (action.type === 'select_initial_creature') {
    return { type: action.type, creatureId: action.creatureId };
  }
  if (action.type === 'select_replacement') {
    return { type: action.type, creatureId: action.creatureId };
  }
  if (action.type === 'use_move') {
    return { type: action.type, moveId: action.moveId };
  }
  if (action.type === 'use_power_card') {
    return { type: action.type, powerCardId: action.powerCardId };
  }
  return { type: action.type };
}

function shouldAdvanceCpu(state: BattleState): boolean {
  if (state.phase === 'initial_selection') {
    return state.selections.player !== null && state.selections.cpu === null;
  }

  return (
    (state.phase === 'replacement' && state.replacementSide === 'cpu') ||
    (state.phase === 'active' && state.currentSide === 'cpu')
  );
}

function assertTransitionPersistence(
  persisted: TransitionPersistenceRow | undefined,
  matchId: string,
  expectedBaseSequence: number,
  expectedActionCount: number,
): asserts persisted is TransitionPersistenceRow {
  if (!persisted) {
    throw new Error('CPU match transition persistence invariant failed.');
  }

  const expectedFirstSequence = persisted.base_sequence + 1;
  const expectedLastSequence = persisted.base_sequence + expectedActionCount;

  if (
    !Number.isInteger(persisted.base_sequence) ||
    persisted.base_sequence < 0 ||
    persisted.base_sequence !== expectedBaseSequence ||
    persisted.round_count !== 1 ||
    !persisted.round_id ||
    persisted.round_match_id !== matchId ||
    persisted.action_count !== expectedActionCount ||
    persisted.first_sequence !== expectedFirstSequence ||
    persisted.last_sequence !== expectedLastSequence ||
    persisted.player_receipt_count !== 1 ||
    persisted.unexpected_receipt_count !== 0 ||
    !persisted.action_match_matches ||
    !persisted.action_round_matches ||
    persisted.match_update_count !== 1 ||
    persisted.updated_match_id !== matchId
  ) {
    throw new Error('CPU match transition persistence invariant failed.');
  }
}

function actionForTimeoutIfNeeded(
  state: BattleState,
  deadline: Date | null,
  now: Date,
  action: Exclude<BattleAction, { type: 'timeout' }>,
): BattleAction {
  if (
    state.phase === 'active' &&
    state.currentSide === 'player' &&
    deadline !== null &&
    now.getTime() >= deadline.getTime()
  ) {
    return { type: 'timeout' };
  }

  return action;
}

function getTurnDeadline(state: BattleState, now: Date): Date | null {
  if (state.phase !== 'active' || state.currentSide !== 'player') {
    return null;
  }

  return new Date(now.getTime() + CPU_TURN_SECONDS * 1000);
}

function mapBattleSetupError(error: unknown): Error {
  if (error instanceof CpuMatchDeckError) {
    return error;
  }

  if (
    error instanceof DeckRuleViolationError ||
    error instanceof InvalidBattleSetupError
  ) {
    return new CpuMatchDeckError(error.message);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('CPU match creation failed unexpectedly.');
}

function mapCpuMatchSetupError(error: unknown): CpuMatchSetupError {
  if (error instanceof CpuMatchSetupError) {
    return error;
  }

  if (error instanceof Error) {
    return new CpuMatchSetupError(error.message);
  }

  return new CpuMatchSetupError('The CPU deck setup is invalid.');
}

function sameSubmittedIntent(
  stored: Pick<ActionResponseRow, 'action' | 'submitted_intent'>,
  submitted: BattleAction,
): boolean {
  if (stored.submitted_intent) {
    return sameBattleAction(stored.submitted_intent, submitted);
  }

  // Historical receipts predate submitted_intent. If a late action was
  // substituted with an authoritative timeout, the original intent cannot be
  // reconstructed safely. Treat that legacy receipt as replay-compatible so a
  // retry cannot create a false trust signal; new receipts always persist the
  // canonical submitted intent separately.
  if (stored.action.type === 'timeout') return true;

  return sameBattleAction(stored.action, submitted);
}

function sameBattleAction(left: BattleAction, right: BattleAction): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function mapActionError(error: unknown): Error {
  if (
    error instanceof CpuMatchNotFoundError ||
    error instanceof CpuMatchCompletedError ||
    error instanceof CpuMatchVersionConflictError ||
    error instanceof CpuMatchSubmissionConflictError ||
    error instanceof CpuMatchActionError
  ) {
    return error;
  }

  if (error instanceof Error && error.name === 'IllegalBattleActionError') {
    return new CpuMatchActionError(error.message);
  }

  return error instanceof Error ? error : new Error('CPU match action failed.');
}

function isActiveMatchUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505' &&
    'constraint' in error &&
    (error as { constraint?: unknown }).constraint ===
      'cpu_matches_one_active_per_player_idx'
  );
}

async function rollback(client: CpuMatchClient): Promise<void> {
  try {
    await client.query('rollback');
  } catch {
    // Preserve the original transaction failure.
  }
}
