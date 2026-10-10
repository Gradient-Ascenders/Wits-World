import {
  createHash,
  randomInt as secureRandomInt,
  randomUUID,
} from 'node:crypto';

import type pg from 'pg';
import {
  observeDatabaseError,
  observeRollback,
} from '../database/pool-observability.js';
import {
  applyBattleAction,
  createBattleState,
  getEffectDamageMultiplier,
  getLegalActions,
  IllegalBattleActionError,
  type BattleActionResult,
  type BattleEffect,
  type BattleSide,
  type BattleState,
  type RandomInt,
} from '@wits-world/game-rules';

import {
  createProgressionPersistence,
  type ProgressionPersistence,
} from '../progression/progression-persistence.js';
import {
  InvalidCursorError,
  type SignedCursorCodec,
} from '../security/signed-cursor.js';
import {
  loadPlayerBattleDeck,
  PlayerBattleDeckError,
  type LoadedPlayerBattleDeck,
} from './player-battle-deck.js';
import {
  TrustActivityRestrictedError,
  type TrustRestrictionService,
} from '../trust/trust-restrictions.js';
import type { TrustService } from '../trust/trust-service.js';
import {
  timePhase,
  timePhaseSync,
  type PhaseTimingSink,
} from '../request-timing.js';
import { timePvpClient, countTrustStatements } from './pvp-query-timing.js';

const DECISION_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_LIMIT = 20;

export type PvpInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'invalidated';
export type PvpCompletionReason =
  | 'defeat'
  | 'turn_forfeit'
  | 'account_deletion_forfeit'
  | 'voluntary_resignation';

export interface AsyncPvpClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

export interface AsyncPvpDatabase {
  connect(): Promise<AsyncPvpClient>;
}

export interface PvpInvitationView {
  invitationId: string;
  direction: 'incoming' | 'outgoing';
  status: PvpInvitationStatus;
  version: number;
  opponent: { playerName: string };
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  matchId: string | null;
}

export interface PvpParticipantView {
  playerName: string;
  creatures: unknown[];
  powerCards: unknown[];
  usedPowerCardIds: string[];
  activeCreatureId: string | null;
}

export interface PvpOpponentView {
  playerName: string;
  activeCreature: unknown | null;
  defeatedCreatures: unknown[];
  remainingCreatureCount: number;
  playedPowerCards: unknown[];
  remainingPowerCardCount: number;
}

export interface AsyncPvpMatchView {
  matchId: string;
  mode: 'asynchronous';
  status: 'active' | 'completed';
  version: number;
  opponent: { playerName: string };
  currentActor: 'self' | 'opponent' | null;
  turnDeadline: string | null;
  state: {
    phase: 'active' | 'replacement' | 'completed';
    turnNumber: number;
    self: PvpParticipantView;
    opponent: PvpOpponentView;
  };
  legalActions: readonly PvpAction[];
  history: readonly PvpActionHistoryEntryView[];
  lastAction: unknown | null;
  outcome: 'win' | 'loss' | null;
  completionReason: PvpCompletionReason | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PvpActionHistoryEntryView {
  sequence: number;
  turnNumber: number;
  createdAt: string;
  result: unknown;
}

export type PvpAction =
  | { type: 'select_replacement'; creatureId: string }
  | { type: 'swap_creature'; creatureId: string }
  | { type: 'use_move'; moveId: string }
  | { type: 'use_power_card'; powerCardId: string };

export interface Page<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface AsyncPvpService {
  findPlayer(viewerId: string, playerName: string): Promise<string>;
  createInvitation(input: {
    playerId: string;
    opponentPlayerName: string;
    deckId: string;
    initialCreatureId: string;
    submissionId: string;
  }): Promise<PvpInvitationView>;
  listInvitations(input: {
    playerId: string;
    cursor?: string;
    limit?: number;
    direction?: 'incoming' | 'outgoing';
    status?: PvpInvitationStatus;
  }): Promise<Page<PvpInvitationView>>;
  acceptInvitation(
    input: {
      playerId: string;
      invitationId: string;
      deckId: string;
      initialCreatureId: string;
      submissionId: string;
      expectedVersion: number;
    },
    timing?: PhaseTimingSink,
  ): Promise<{ invitation: PvpInvitationView; match: AsyncPvpMatchView }>;
  declineInvitation(input: {
    playerId: string;
    invitationId: string;
    submissionId: string;
    expectedVersion: number;
  }): Promise<PvpInvitationView>;
  cancelInvitation(input: {
    playerId: string;
    invitationId: string;
    submissionId: string;
    expectedVersion: number;
  }): Promise<PvpInvitationView>;
  listActiveMatches(input: {
    playerId: string;
    cursor?: string;
    limit?: number;
  }): Promise<Page<PvpMatchSummary>>;
  listHistory(input: {
    playerId: string;
    cursor?: string;
    limit?: number;
  }): Promise<Page<PvpHistorySummary>>;
  getMatch(
    playerId: string,
    matchId: string,
    timing?: PhaseTimingSink,
  ): Promise<AsyncPvpMatchView>;
  submitAction(input: {
    playerId: string;
    matchId: string;
    submissionId: string;
    expectedVersion: number;
    action: PvpAction;
  }): Promise<AsyncPvpMatchView>;
  resignMatch(input: {
    playerId: string;
    matchId: string;
    submissionId: string;
    expectedVersion: number;
  }): Promise<AsyncPvpMatchView>;
  expireInvitation(
    client: AsyncPvpClient,
    invitationId: string,
  ): Promise<boolean>;
  forfeitOverdueMatch(
    client: AsyncPvpClient,
    matchId: string,
  ): Promise<boolean>;
  finalizeAccountDeletion(
    client: AsyncPvpClient,
    playerId: string,
    requestedAt: Date,
  ): Promise<void>;
}

export interface PvpMatchSummary {
  matchId: string;
  mode: 'asynchronous';
  status: 'active';
  version: number;
  opponent: { playerName: string };
  currentActor: 'self' | 'opponent';
  turnDeadline: string;
  updatedAt: string;
}

export interface PvpHistorySummary {
  matchId: string;
  mode: 'asynchronous';
  status: 'completed';
  opponent: { playerName: string };
  outcome: 'win' | 'loss';
  completionReason: PvpCompletionReason;
  startedAt: string;
  completedAt: string;
}

export type AsyncPvpErrorCode =
  | 'PVP_PLAYER_UNAVAILABLE'
  | 'PVP_INVITATION_NOT_FOUND'
  | 'PVP_MATCH_NOT_FOUND'
  | 'PVP_INVITATION_ALREADY_PENDING'
  | 'PVP_INVITATION_EXPIRED'
  | 'PVP_INVITATION_INVALIDATED'
  | 'PVP_INVITATION_CANCELLED'
  | 'PVP_INVITATION_VERSION_CONFLICT'
  | 'PVP_MATCH_COMPLETED'
  | 'PVP_MATCH_VERSION_CONFLICT'
  | 'PVP_ACTION_ILLEGAL'
  | 'PVP_IDEMPOTENCY_CONFLICT'
  | 'PVP_DECK_INVALID';

export class AsyncPvpError extends Error {
  constructor(
    readonly code: AsyncPvpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AsyncPvpError';
  }
}

class AsyncPvpIdempotencyConflictError extends AsyncPvpError {
  constructor(
    readonly actorId: string,
    readonly operation: string,
    readonly submissionId: string,
    readonly resourceIdentifier: string,
  ) {
    super(
      'PVP_IDEMPOTENCY_CONFLICT',
      'The submission identifier was already used for different input.',
    );
    this.name = 'AsyncPvpIdempotencyConflictError';
  }
}

interface ServiceOptions {
  cursorCodec: SignedCursorCodec;
  randomInt?: RandomInt;
  progressionPersistence?: ProgressionPersistence;
  trustRestrictions?: Pick<TrustRestrictionService, 'assertAllowed'>;
  trustService?: Pick<
    TrustService,
    'recordSubmissionConflict' | 'evaluateOpponentPatternsForMatch'
  >;
}

interface InvitationRow extends pg.QueryResultRow {
  id: string;
  challenger_player_id: string;
  recipient_player_id: string;
  status: PvpInvitationStatus;
  version: number;
  match_id: string | null;
  created_at: Date;
  expires_at: Date;
  responded_at: Date | null;
  challenger_name: string | null;
  recipient_name: string | null;
}

interface MatchRow extends pg.QueryResultRow {
  id: string;
  status: 'active' | 'completed';
  version: number;
  current_player_id: string | null;
  winner_player_id: string | null;
  completion_reason: PvpCompletionReason | null;
  turn_deadline: Date | null;
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  viewer_player_id: string;
  viewer_side: BattleSide;
  viewer_outcome: 'win' | 'loss' | null;
  viewer_name: string | null;
  opponent_player_id: string;
  opponent_side: BattleSide;
  opponent_name: string | null;
  battle_state: BattleState;
  action_history: Array<{
    sequence: number;
    turnNumber: number;
    createdAt: string;
    result: BattleActionResult;
  }>;
  latest_result: BattleActionResult | null;
}

interface ReceiptRow extends pg.QueryResultRow {
  payload_hash: string;
  committed_response: unknown;
  invitation_id: string | null;
  match_id: string | null;
}

interface NowRow extends pg.QueryResultRow {
  now: Date;
}

interface ListCursor {
  endpoint: 'invitations' | 'active' | 'history';
  limit: number;
  direction?: string;
  status?: string;
  timestamp: string;
  id: string;
}

export function createAsyncPvpService(
  database: AsyncPvpDatabase,
  {
    cursorCodec,
    randomInt = secureRandomInt,
    progressionPersistence = createProgressionPersistence(),
    trustRestrictions,
    trustService,
  }: ServiceOptions,
): AsyncPvpService {
  const withServiceTransaction = <T>(
    operation: (client: AsyncPvpClient) => Promise<T>,
    timing?: PhaseTimingSink,
  ) => withTransaction(database, operation, trustService, timing);

  const service: AsyncPvpService = {
    async findPlayer(viewerId, playerName) {
      const client = await database.connect();
      try {
        const result = await client.query<{ player_name: string }>(
          `
            select player_name
              from public.players
             where player_name = lower($1)
               and lifecycle_status = 'active'
               and player_name is not null
               and id <> $2::uuid
          `,
          [playerName, viewerId],
        );
        const player = result.rows[0];
        if (!player) {
          throw unavailablePlayer();
        }
        return player.player_name;
      } finally {
        client.release();
      }
    },

    async createInvitation(input) {
      const payloadHash = hashPayload({
        opponentPlayerName: input.opponentPlayerName,
        deckId: input.deckId,
        initialCreatureId: input.initialCreatureId,
      });
      return withServiceTransaction(async (client) => {
        await lockSubmissionKey(
          client,
          input.playerId,
          'invitation_create',
          input.submissionId,
        );
        const replay = await loadReceipt<PvpInvitationView>(
          client,
          input.playerId,
          'invitation_create',
          input.submissionId,
          payloadHash,
        );
        if (replay) return replay;

        if (trustRestrictions) {
          await trustRestrictions.assertAllowed(
            input.playerId,
            'new_competitive_match_hold',
            client,
          );
        }

        const opponentResult = await client.query<{
          id: string;
          player_name: string;
        }>(
          `
            select id::text, player_name
              from public.players
             where player_name = lower($1)
               and lifecycle_status = 'active'
               and player_name is not null
               and id <> $2::uuid
          `,
          [input.opponentPlayerName, input.playerId],
        );
        const opponentLookup = opponentResult.rows[0];
        if (!opponentLookup) throw unavailablePlayer();

        const lockedPlayers = await client.query<{
          id: string;
          lifecycle_status: string;
          player_name: string | null;
        }>(
          `
            select id::text, lifecycle_status, player_name
              from public.players
             where id = any($1::uuid[])
             order by id
             for share
          `,
          [[input.playerId, opponentLookup.id].sort()],
        );
        const playersById = new Map(
          lockedPlayers.rows.map((player) => [player.id, player]),
        );
        const challenger = playersById.get(input.playerId);
        const opponent = playersById.get(opponentLookup.id);
        if (
          challenger?.lifecycle_status !== 'active' ||
          challenger.player_name === null ||
          opponent?.lifecycle_status !== 'active' ||
          opponent.player_name !== opponentLookup.player_name
        ) {
          throw unavailablePlayer();
        }

        const pair = [input.playerId, opponent.id].sort();
        await client.query(
          `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`async-pvp:${pair[0]}:${pair[1]}`],
        );

        const replayAfterLock = await loadReceipt<PvpInvitationView>(
          client,
          input.playerId,
          'invitation_create',
          input.submissionId,
          payloadHash,
        );
        if (replayAfterLock) return replayAfterLock;

        const pending = await client.query<{ id: string }>(
          `
            select id::text
              from public.async_pvp_invitations
             where pair_player_low_id = $1::uuid
               and pair_player_high_id = $2::uuid
               and status = 'pending'
          `,
          pair,
        );
        if (pending.rows[0]) {
          throw new AsyncPvpError(
            'PVP_INVITATION_ALREADY_PENDING',
            'A pending invitation already exists between these players.',
          );
        }

        const deck = await loadDeck(client, input.playerId, input.deckId);
        assertInitialCreature(deck, input.initialCreatureId);
        const now = await databaseNow(client);
        const invitationId = randomUUID();
        await client.query(
          `
            insert into public.async_pvp_invitations (
              id, challenger_player_id, recipient_player_id,
              created_at, expires_at, updated_at
            ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $4)
          `,
          [
            invitationId,
            input.playerId,
            opponent.id,
            now,
            new Date(now.getTime() + DECISION_WINDOW_MS),
          ],
        );
        await insertDeckSnapshot(
          client,
          invitationId,
          input.playerId,
          'challenger',
          deck,
          input.initialCreatureId,
          now,
        );
        const view = await loadInvitationView(
          client,
          input.playerId,
          invitationId,
        );
        await insertReceipt(client, {
          actorId: input.playerId,
          operation: 'invitation_create',
          submissionId: input.submissionId,
          invitationId,
          payloadHash,
          response: view,
          now,
        });
        return view;
      });
    },

    async listInvitations(input) {
      const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
      const cursor = decodeCursor(cursorCodec, input.playerId, input.cursor, {
        endpoint: 'invitations',
        limit,
        direction: input.direction,
        status: input.status,
      });
      const client = await database.connect();
      try {
        await expireVisibleInvitations(client, input.playerId);
        const result = await client.query<InvitationRow>(
          `
            select invitation.*,
                   challenger.player_name as challenger_name,
                   recipient.player_name as recipient_name
              from public.async_pvp_invitations invitation
              join public.players challenger on challenger.id = invitation.challenger_player_id
              join public.players recipient on recipient.id = invitation.recipient_player_id
             where ($1::text is null
                    or ($1 = 'incoming' and invitation.recipient_player_id = $2::uuid)
                    or ($1 = 'outgoing' and invitation.challenger_player_id = $2::uuid))
               and ($1::text is not null
                    or invitation.challenger_player_id = $2::uuid
                    or invitation.recipient_player_id = $2::uuid)
               and not exists (
                 select 1
                   from public.async_pvp_matches match
                  where match.id = invitation.match_id
                    and match.status = 'completed'
               )
               and ($3::text is null or invitation.status = $3)
               and ($4::timestamptz is null
                    or (invitation.created_at, invitation.id) < ($4::timestamptz, $5::uuid))
             order by invitation.created_at desc, invitation.id desc
             limit $6
          `,
          [
            input.direction ?? null,
            input.playerId,
            input.status ?? null,
            cursor?.timestamp ?? null,
            cursor?.id ?? null,
            limit + 1,
          ],
        );
        const pageRows = result.rows.slice(0, limit);
        return {
          items: pageRows.map((row) => mapInvitation(row, input.playerId)),
          nextCursor: nextCursor(
            cursorCodec,
            input.playerId,
            result.rows.length > limit,
            pageRows.at(-1),
            {
              endpoint: 'invitations',
              limit,
              direction: input.direction,
              status: input.status,
            },
            'created_at',
          ),
        };
      } finally {
        client.release();
      }
    },

    async acceptInvitation(input, timing) {
      const payloadHash = hashPayload({
        invitationId: input.invitationId,
        deckId: input.deckId,
        initialCreatureId: input.initialCreatureId,
        expectedVersion: input.expectedVersion,
      });
      let deadlineExpired = false;
      const result = await withServiceTransaction(async (client) => {
        const invitation = await timePhase(
          timing,
          'invitation_lock_client_ms',
          () =>
            lockInvitation(
              client,
              input.invitationId,
              input.playerId,
              'recipient',
            ),
        );
        await timePhase(timing, 'submission_lock_client_ms', () =>
          lockSubmissionKey(
            client,
            input.playerId,
            'invitation_accept',
            input.submissionId,
          ),
        );
        const { replay, now } = await timePhase(
          timing,
          'receipt_clock_ms',
          () =>
            loadAcceptanceReceiptAndTime<{
              invitation: PvpInvitationView;
              match: AsyncPvpMatchView;
            }>(client, input.playerId, input.submissionId, payloadHash),
        );
        if (replay) return replay;
        if (invitation.status === 'pending' && now >= invitation.expires_at) {
          await markInvitationExpired(client, invitation.id, now);
          deadlineExpired = true;
          return null;
        }
        assertPendingInvitation(invitation, input.expectedVersion);
        if (trustRestrictions) {
          await timePhase(timing, 'trust_ms', () =>
            trustRestrictions.assertAllowed(
              input.playerId,
              'new_competitive_match_hold',
              countTrustStatements(client, timing),
            ),
          );
          try {
            await timePhase(timing, 'trust_ms', () =>
              trustRestrictions.assertAllowed(
                invitation.challenger_player_id,
                'new_competitive_match_hold',
                countTrustStatements(client, timing),
              ),
            );
          } catch (error) {
            if (error instanceof TrustActivityRestrictedError) {
              throw new AsyncPvpError(
                'PVP_PLAYER_UNAVAILABLE',
                'The player is not available for a new match.',
              );
            }
            throw error;
          }
        }

        const recipientDeck = await timePhase(timing, 'deck_ms', () =>
          loadDeck(client, input.playerId, input.deckId),
        );
        assertInitialCreature(recipientDeck, input.initialCreatureId);
        const challenger = await timePhase(timing, 'snapshot_read_ms', () =>
          loadSnapshotDeck(client, invitation.id, 'challenger'),
        );
        const recipientSnapshotId = await timePhase(
          timing,
          'snapshot_write_ms',
          () =>
            insertDeckSnapshot(
              client,
              invitation.id,
              input.playerId,
              'recipient',
              recipientDeck,
              input.initialCreatureId,
              now,
            ),
        );
        const state = timePhaseSync(timing, 'match_construct_ms', () => {
          let state = createBattleState(challenger.deck, recipientDeck.deck);
          state = applyBattleAction(
            state,
            'player',
            {
              type: 'select_initial_creature',
              creatureId: challenger.initialCreatureId,
            },
            randomInt,
          ).state;
          state = applyBattleAction(
            state,
            'cpu',
            {
              type: 'select_initial_creature',
              creatureId: input.initialCreatureId,
            },
            randomInt,
          ).state;
          if (!state.currentSide || state.phase !== 'active') {
            throw new Error(
              'Accepted PvP match did not enter an active decision.',
            );
          }

          return state;
        });

        const matchId = randomUUID();
        const currentPlayerId =
          state.currentSide === 'player'
            ? invitation.challenger_player_id
            : invitation.recipient_player_id;
        const deadline = new Date(now.getTime() + DECISION_WINDOW_MS);
        const initialWrites = await timePhase(
          timing,
          'initial_match_write_ms',
          () =>
            client.query<{
              match_count: number;
              participant_count: number;
              state_count: number;
            }>(
              `
            with inserted_match as (
              insert into public.async_pvp_matches (
                id, invitation_id, current_player_id, decision_started_at,
                turn_deadline, started_at, created_at, updated_at
              ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $4, $4, $4)
              returning id, version
            ), inserted_participants as (
              insert into public.async_pvp_match_participants (
                match_id, player_id, engine_side, deck_snapshot_id, created_at
              )
              select match.id, participant.player_id, participant.engine_side,
                     participant.deck_snapshot_id, $4
                from inserted_match match
                cross join (values
                  ($6::uuid, 'player', $7::uuid),
                  ($8::uuid, 'cpu', $9::uuid)
                ) as participant(player_id, engine_side, deck_snapshot_id)
              returning match_id
            ), inserted_state as (
              insert into private.async_pvp_match_states
                (match_id, version, battle_state, updated_at)
              select match.id, match.version, $10::jsonb, $4
                from inserted_match match
               where (select count(*) from inserted_participants) = 2
              returning match_id
            )
            select (select count(*)::integer from inserted_match) as match_count,
                   (select count(*)::integer from inserted_participants) as participant_count,
                   (select count(*)::integer from inserted_state) as state_count
          `,
              [
                matchId,
                invitation.id,
                currentPlayerId,
                now,
                deadline,
                invitation.challenger_player_id,
                challenger.snapshotId,
                invitation.recipient_player_id,
                recipientSnapshotId,
                JSON.stringify(state),
              ],
            ),
        );
        // Consume RETURNING rows, not same-statement table reads. The CTE
        // dependencies order the writes; deferred integrity checks still run
        // at COMMIT after the invitation and receipt have been persisted.
        const written = initialWrites.rows[0];
        if (
          initialWrites.rows.length !== 1 ||
          written?.match_count !== 1 ||
          written.participant_count !== 2 ||
          written.state_count !== 1
        ) {
          throw new Error('Accepted PvP match initial writes were incomplete.');
        }
        await timePhase(timing, 'invitation_update_ms', () =>
          client.query(
            `
            update public.async_pvp_invitations
               set status = 'accepted', version = version + 1,
                   match_id = $2::uuid, responded_at = $3, updated_at = $3
             where id = $1::uuid
          `,
            [invitation.id, matchId, now],
          ),
        );
        const response = {
          invitation: await timePhase(timing, 'invitation_view_ms', () =>
            loadInvitationView(client, input.playerId, invitation.id),
          ),
          match: await timePhase(timing, 'match_response_view_ms', () =>
            loadMatchView(client, input.playerId, matchId, true),
          ),
        };
        await timePhase(timing, 'receipt_write_ms', () =>
          insertReceipt(client, {
            actorId: input.playerId,
            operation: 'invitation_accept',
            submissionId: input.submissionId,
            invitationId: invitation.id,
            payloadHash,
            response,
            now,
          }),
        );
        return response;
      }, timing);
      if (deadlineExpired) throw expiredInvitation();
      if (!result)
        throw new Error('PvP invitation acceptance returned no result.');
      return result;
    },

    async declineInvitation(input) {
      const payloadHash = hashPayload({
        invitationId: input.invitationId,
        expectedVersion: input.expectedVersion,
      });
      let deadlineExpired = false;
      const result = await withServiceTransaction(async (client) => {
        const invitation = await lockInvitation(
          client,
          input.invitationId,
          input.playerId,
          'recipient',
        );
        await lockSubmissionKey(
          client,
          input.playerId,
          'invitation_decline',
          input.submissionId,
        );
        const replay = await loadReceipt<PvpInvitationView>(
          client,
          input.playerId,
          'invitation_decline',
          input.submissionId,
          payloadHash,
        );
        if (replay) return replay;
        const now = await databaseNow(client);
        if (invitation.status === 'pending' && now >= invitation.expires_at) {
          await markInvitationExpired(client, invitation.id, now);
          deadlineExpired = true;
          return null;
        }
        assertPendingInvitation(invitation, input.expectedVersion);
        await client.query(
          `
            update public.async_pvp_invitations
               set status = 'declined', version = version + 1,
                   responded_at = $2, updated_at = $2
             where id = $1::uuid
          `,
          [invitation.id, now],
        );
        const view = await loadInvitationView(
          client,
          input.playerId,
          invitation.id,
        );
        await insertReceipt(client, {
          actorId: input.playerId,
          operation: 'invitation_decline',
          submissionId: input.submissionId,
          invitationId: invitation.id,
          payloadHash,
          response: view,
          now,
        });
        return view;
      });
      if (deadlineExpired) throw expiredInvitation();
      if (!result)
        throw new Error('PvP invitation decline returned no result.');
      return result;
    },

    async cancelInvitation(input) {
      const payloadHash = hashPayload({
        invitationId: input.invitationId,
        expectedVersion: input.expectedVersion,
      });
      let deadlineExpired = false;
      const result = await withServiceTransaction(async (client) => {
        const invitation = await lockInvitation(
          client,
          input.invitationId,
          input.playerId,
          'challenger',
        );
        await lockSubmissionKey(
          client,
          input.playerId,
          'invitation_cancel',
          input.submissionId,
        );
        const replay = await loadReceipt<PvpInvitationView>(
          client,
          input.playerId,
          'invitation_cancel',
          input.submissionId,
          payloadHash,
        );
        if (replay) return replay;
        const now = await databaseNow(client);
        if (invitation.status === 'pending' && now >= invitation.expires_at) {
          await markInvitationExpired(client, invitation.id, now);
          deadlineExpired = true;
          return null;
        }
        assertPendingInvitation(invitation, input.expectedVersion);
        await client.query(
          `
            update public.async_pvp_invitations
               set status = 'cancelled', version = version + 1,
                   responded_at = $2, updated_at = $2
             where id = $1::uuid
          `,
          [invitation.id, now],
        );
        const view = await loadInvitationView(
          client,
          input.playerId,
          invitation.id,
        );
        await insertReceipt(client, {
          actorId: input.playerId,
          operation: 'invitation_cancel',
          submissionId: input.submissionId,
          invitationId: invitation.id,
          payloadHash,
          response: view,
          now,
        });
        return view;
      });
      if (deadlineExpired) throw expiredInvitation();
      if (!result)
        throw new Error('PvP invitation cancellation returned no result.');
      return result;
    },

    async listActiveMatches(input) {
      await finalizeVisibleOverdueMatches(database, service, input.playerId);
      return listMatchSummaries(database, cursorCodec, input, 'active');
    },

    listHistory(input) {
      return listMatchSummaries(database, cursorCodec, input, 'history');
    },

    async getMatch(playerId, matchId, timing) {
      const view = await withServiceTransaction(async (client) => {
        const match = await timePhase(timing, 'get_locked_projection_ms', () =>
          lockMatchForView(client, playerId, matchId),
        );
        if (match.status === 'active' && match.turn_deadline) {
          const now = await timePhase(timing, 'get_clock_ms', () =>
            databaseNow(client),
          );
          if (now >= match.turn_deadline) {
            await completeForfeit(
              client,
              match,
              match.current_player_id!,
              now,
              'turn_forfeit',
              progressionPersistence,
            );
          }
        }
        // A fresh statement after locking is required: a lock wait can return
        // an updated match row alongside older joined state/history snapshots.
        // This also reloads all persisted state after a deadline forfeit.
        return await loadMatchView(client, playerId, matchId, true, timing);
      }, timing);
      if (view.status === 'completed') {
        await timePhase(
          trustService ? timing : undefined,
          'post_transaction_trust_ms',
          () => evaluateOpponentPatternsSafely(trustService, matchId),
        );
      }
      return view;
    },

    async submitAction(input) {
      const payloadHash = hashPayload({
        matchId: input.matchId,
        expectedVersion: input.expectedVersion,
        action: input.action,
      });
      let deadlineLost = false;
      const response = await withServiceTransaction(async (client) => {
        const match = await lockMatch(client, input.playerId, input.matchId);
        await lockSubmissionKey(
          client,
          input.playerId,
          'match_action',
          input.submissionId,
        );
        const { replay, now } =
          await loadActionReceiptAndTime<AsyncPvpMatchView>(
            client,
            input.playerId,
            input.submissionId,
            payloadHash,
          );
        if (replay)
          return normalizeMatchReceiptWithHistory(
            client,
            input.playerId,
            input.matchId,
            replay,
          );
        if (
          match.status === 'active' &&
          match.turn_deadline &&
          now >= match.turn_deadline
        ) {
          await completeForfeit(
            client,
            match,
            match.current_player_id!,
            now,
            'turn_forfeit',
            progressionPersistence,
          );
          deadlineLost = true;
          return loadMatchView(client, input.playerId, input.matchId);
        }
        if (match.status === 'completed') {
          throw new AsyncPvpError(
            'PVP_MATCH_COMPLETED',
            'Completed PvP matches cannot receive more actions.',
          );
        }
        if (match.version !== input.expectedVersion) {
          throw new AsyncPvpError(
            'PVP_MATCH_VERSION_CONFLICT',
            'The match changed before this action was applied.',
          );
        }
        if (match.current_player_id !== input.playerId) {
          throw illegalAction();
        }
        if (
          !isActionLegal(match.battle_state, match.viewer_side, input.action)
        ) {
          throw illegalAction();
        }

        let transition;
        try {
          transition = applyBattleAction(
            match.battle_state,
            match.viewer_side,
            input.action,
            randomInt,
          );
        } catch (error) {
          if (error instanceof IllegalBattleActionError) throw illegalAction();
          throw error;
        }
        const newVersion = match.version + 1;
        const winnerId = transition.state.winner
          ? transition.state.winner === match.viewer_side
            ? input.playerId
            : match.opponent_player_id
          : null;
        const terminal = winnerId !== null;
        const currentPlayerId = terminal
          ? null
          : transition.state.currentSide === match.viewer_side
            ? input.playerId
            : match.opponent_player_id;
        const deadline = terminal
          ? null
          : new Date(now.getTime() + DECISION_WINDOW_MS);
        const actionId = randomUUID();
        await client.query(
          `
            insert into public.async_pvp_match_actions (
              id, match_id, sequence, actor_player_id, submission_id,
              expected_version, action, public_result, created_at
            ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
                      $6, $7::jsonb, $8::jsonb, $9)
          `,
          [
            actionId,
            match.id,
            newVersion,
            input.playerId,
            input.submissionId,
            input.expectedVersion,
            JSON.stringify(input.action),
            JSON.stringify(transition.result),
            now,
          ],
        );
        await client.query(
          `
            insert into private.async_pvp_match_transitions (
              action_id, match_id, state_before, state_after,
              authoritative_result, created_at
            ) values ($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5::jsonb, $6)
          `,
          [
            actionId,
            match.id,
            JSON.stringify(match.battle_state),
            JSON.stringify(transition.state),
            JSON.stringify(transition.result),
            now,
          ],
        );
        await client.query(
          `
            update public.async_pvp_matches
               set status = $2, version = $3, current_player_id = $4::uuid,
                   winner_player_id = $5::uuid, completion_reason = $6,
                   decision_started_at = $7, turn_deadline = $8,
                   completed_at = $9, updated_at = $10
             where id = $1::uuid
          `,
          [
            match.id,
            terminal ? 'completed' : 'active',
            newVersion,
            currentPlayerId,
            winnerId,
            terminal ? 'defeat' : null,
            terminal ? null : now,
            deadline,
            terminal ? now : null,
            now,
          ],
        );
        await client.query(
          `update private.async_pvp_match_states
              set version = $2, battle_state = $3::jsonb, updated_at = $4
            where match_id = $1::uuid`,
          [match.id, newVersion, JSON.stringify(transition.state), now],
        );
        if (terminal) {
          await setParticipantOutcomes(client, match.id, winnerId);
          await progressionPersistence.recordAsynchronousPvpCompletion(
            client,
            match.id,
          );
        }
        const view = await loadMatchView(
          client,
          input.playerId,
          match.id,
          true,
        );
        await insertReceipt(client, {
          actorId: input.playerId,
          operation: 'match_action',
          submissionId: input.submissionId,
          matchId: match.id,
          payloadHash,
          response: view,
          now,
        });
        return view;
      });
      if (response.status === 'completed') {
        await evaluateOpponentPatternsSafely(trustService, input.matchId);
      }
      if (deadlineLost) {
        throw new AsyncPvpError(
          'PVP_MATCH_COMPLETED',
          'The match deadline passed before this action was applied.',
        );
      }
      return response;
    },

    async resignMatch(input) {
      const payloadHash = hashPayload({
        matchId: input.matchId,
        expectedVersion: input.expectedVersion,
      });
      let deadlineLost = false;
      const response = await withServiceTransaction(async (client) => {
        const match = await lockMatch(client, input.playerId, input.matchId);
        await lockSubmissionKey(
          client,
          input.playerId,
          'match_resign',
          input.submissionId,
        );
        const replay = await loadReceipt<AsyncPvpMatchView>(
          client,
          input.playerId,
          'match_resign',
          input.submissionId,
          payloadHash,
        );
        if (replay)
          return normalizeMatchReceiptWithHistory(
            client,
            input.playerId,
            input.matchId,
            replay,
          );

        const now = await databaseNow(client);
        if (
          match.status === 'active' &&
          match.turn_deadline &&
          now >= match.turn_deadline
        ) {
          await completeForfeit(
            client,
            match,
            match.current_player_id!,
            now,
            'turn_forfeit',
            progressionPersistence,
          );
          deadlineLost = true;
          return loadMatchView(client, input.playerId, input.matchId);
        }
        if (match.status === 'completed') {
          throw new AsyncPvpError(
            'PVP_MATCH_COMPLETED',
            'Completed PvP matches cannot be resigned.',
          );
        }
        if (match.version !== input.expectedVersion) {
          throw new AsyncPvpError(
            'PVP_MATCH_VERSION_CONFLICT',
            'The match changed before this resignation was applied.',
          );
        }

        await completeForfeit(
          client,
          match,
          input.playerId,
          now,
          'voluntary_resignation',
          progressionPersistence,
        );
        const view = await loadMatchView(client, input.playerId, match.id);
        await insertReceipt(client, {
          actorId: input.playerId,
          operation: 'match_resign',
          submissionId: input.submissionId,
          matchId: match.id,
          payloadHash,
          response: view,
          now,
        });
        return view;
      });
      if (response.status === 'completed') {
        await evaluateOpponentPatternsSafely(trustService, input.matchId);
      }
      if (deadlineLost) {
        throw new AsyncPvpError(
          'PVP_MATCH_COMPLETED',
          'The match deadline passed before this resignation was applied.',
        );
      }
      return response;
    },

    async expireInvitation(client, invitationId) {
      const result = await client.query<InvitationRow>(
        `
          select invitation.*,
                 challenger.player_name as challenger_name,
                 recipient.player_name as recipient_name
            from public.async_pvp_invitations invitation
            join public.players challenger on challenger.id = invitation.challenger_player_id
            join public.players recipient on recipient.id = invitation.recipient_player_id
           where invitation.id = $1::uuid
           for update of invitation skip locked
        `,
        [invitationId],
      );
      const invitation = result.rows[0];
      if (!invitation || invitation.status !== 'pending') return false;
      const now = await databaseNow(client);
      if (now < invitation.expires_at) return false;
      await markInvitationExpired(client, invitation.id, now);
      return true;
    },

    async forfeitOverdueMatch(client, matchId) {
      const match = await lockMatchById(client, matchId, true);
      if (!match || match.status !== 'active' || !match.turn_deadline)
        return false;
      const now = await databaseNow(client);
      if (now < match.turn_deadline) return false;
      await completeForfeit(
        client,
        match,
        match.current_player_id!,
        now,
        'turn_forfeit',
        progressionPersistence,
      );
      return true;
    },

    async finalizeAccountDeletion(client, playerId, requestedAt) {
      const invitationResult = await client.query<InvitationRow>(
        `
          select invitation.*,
                 challenger.player_name as challenger_name,
                 recipient.player_name as recipient_name
            from public.async_pvp_invitations invitation
            join public.players challenger on challenger.id = invitation.challenger_player_id
            join public.players recipient on recipient.id = invitation.recipient_player_id
           where invitation.status = 'pending'
             and (invitation.challenger_player_id = $1::uuid
                  or invitation.recipient_player_id = $1::uuid)
           order by invitation.id
           for update of invitation
        `,
        [playerId],
      );
      for (const invitation of invitationResult.rows) {
        const status =
          requestedAt >= invitation.expires_at ? 'expired' : 'invalidated';
        await client.query(
          `
            update public.async_pvp_invitations
               set status = $2, version = version + 1,
                   responded_at = $3, updated_at = $3
             where id = $1::uuid
          `,
          [invitation.id, status, requestedAt],
        );
      }

      const matches = await client.query<{ id: string }>(
        `
          select match.id::text
            from public.async_pvp_matches match
            join public.async_pvp_match_participants participant
              on participant.match_id = match.id
           where participant.player_id = $1::uuid
             and match.status = 'active'
           order by match.id
           for update of match
        `,
        [playerId],
      );
      for (const row of matches.rows) {
        const match = await lockMatchById(client, row.id, false);
        if (match?.status === 'active') {
          const deadlineElapsed =
            match.turn_deadline !== null && requestedAt >= match.turn_deadline;
          await completeForfeit(
            client,
            match,
            deadlineElapsed ? match.current_player_id! : playerId,
            requestedAt,
            deadlineElapsed ? 'turn_forfeit' : 'account_deletion_forfeit',
            progressionPersistence,
          );
        }
      }
    },
  };

  return service;
}

async function evaluateOpponentPatternsSafely(
  trustService:
    Pick<TrustService, 'evaluateOpponentPatternsForMatch'> | undefined,
  matchId: string,
): Promise<void> {
  try {
    await trustService?.evaluateOpponentPatternsForMatch(matchId);
  } catch {
    // Match completion remains authoritative. The maintenance sweep retries
    // derived opponent-pattern evaluation after transient trust failures.
  }
}

async function withTransaction<T>(
  database: AsyncPvpDatabase,
  operation: (client: AsyncPvpClient) => Promise<T>,
  trustService?: Pick<TrustService, 'recordSubmissionConflict'>,
  timing?: PhaseTimingSink,
): Promise<T> {
  const client = timePvpClient(
    await timePhase(timing, 'pool_acquire_ms', () => database.connect()),
    timing,
  );
  let failure: unknown;
  try {
    return await timePhase(timing, 'transaction_ms', () =>
      withExistingClientTransaction(client, () => operation(client), timing),
    );
  } catch (error) {
    failure = error;
  } finally {
    client.release();
  }

  if (failure instanceof AsyncPvpIdempotencyConflictError) {
    try {
      await timePhase(
        trustService ? timing : undefined,
        'post_transaction_trust_ms',
        async () =>
          trustService?.recordSubmissionConflict({
            playerId: failure.actorId,
            operation: `async_pvp_${failure.operation}`,
            resourceIdentifier: failure.resourceIdentifier,
            submissionId: failure.submissionId,
          }),
      );
    } catch {
      // Preserve the authoritative mutation conflict. A repeated conflict can
      // retry trust ingestion without changing the gameplay outcome.
    }
  }

  throw failure;
}

async function withExistingClientTransaction<T>(
  client: AsyncPvpClient,
  operation: () => Promise<T>,
  timing?: PhaseTimingSink,
): Promise<T> {
  await timePhase(timing, 'begin_ms', () => client.query('begin'));
  try {
    const result = await operation();
    await timePhase(timing, 'commit_ms', () => client.query('commit'));
    return result;
  } catch (error) {
    observeDatabaseError(error, 'transaction');
    await timePhase(timing, 'rollback_ms', () =>
      observeRollback(() => client.query('rollback')),
    );
    throw error;
  }
}

async function databaseNow(client: AsyncPvpClient): Promise<Date> {
  const result = await client.query<NowRow>(`select clock_timestamp() as now`);
  const now = result.rows[0]?.now;
  if (!now) throw new Error('Database did not return its transaction time.');
  return now;
}

async function loadDeck(
  client: AsyncPvpClient,
  playerId: string,
  deckId: string,
): Promise<LoadedPlayerBattleDeck> {
  try {
    return await loadPlayerBattleDeck(client, playerId, deckId);
  } catch (error) {
    if (error instanceof PlayerBattleDeckError) {
      throw new AsyncPvpError(
        'PVP_DECK_INVALID',
        'The saved deck is unavailable for battle.',
      );
    }
    throw error;
  }
}

function assertInitialCreature(
  deck: LoadedPlayerBattleDeck,
  initialCreatureId: string,
): void {
  if (
    !deck.cards.some(
      (card) =>
        card.ownedCardId === initialCreatureId && card.category === 'creature',
    )
  ) {
    throw new AsyncPvpError(
      'PVP_DECK_INVALID',
      'The initial Creature must belong to the saved deck.',
    );
  }
}

async function insertDeckSnapshot(
  client: AsyncPvpClient,
  invitationId: string,
  playerId: string,
  role: 'challenger' | 'recipient',
  deck: LoadedPlayerBattleDeck,
  initialCreatureId: string,
  createdAt: Date,
): Promise<string> {
  const snapshotId = randomUUID();
  const cardIds = new Map(
    deck.cards.map((card) => [card.ownedCardId, randomUUID()]),
  );
  const initialCardId = cardIds.get(initialCreatureId);
  if (!initialCardId) {
    throw new Error('Initial Creature snapshot identity was not generated.');
  }
  // The RETURNING dependency writes the header before its cards in one trip.
  // Existing deferred snapshot checks still run at the transaction's commit.
  await client.query(
    `
      with inserted_snapshot as (
        insert into private.async_pvp_deck_snapshots (
          id, invitation_id, player_id, participant_role, source_deck_id,
          initial_creature_card_id, created_at
        ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7)
        returning id
      )
      insert into private.async_pvp_deck_snapshot_cards (
        id, snapshot_id, position, battle_card_id, source_owned_card_id,
        source_card_definition_id, category, affinity, rarity, card_snapshot
      )
      select
        card.id,
        snapshot.id,
        card.position,
        card.battle_card_id,
        card.battle_card_id,
        card.source_card_definition_id,
        card.category,
        card.affinity,
        card.rarity,
        card.card_snapshot
      from inserted_snapshot snapshot
      cross join jsonb_to_recordset($8::jsonb) as card (
        id uuid,
        position smallint,
        battle_card_id uuid,
        source_card_definition_id uuid,
        category text,
        affinity text,
        rarity text,
        card_snapshot jsonb
      )
    `,
    [
      snapshotId,
      invitationId,
      playerId,
      role,
      deck.deckId,
      initialCardId,
      createdAt,
      JSON.stringify(
        deck.cards.map((card) => ({
          id: cardIds.get(card.ownedCardId),
          position: card.position,
          battle_card_id: card.ownedCardId,
          source_card_definition_id: card.cardDefinitionId,
          category: card.category,
          affinity: card.affinity,
          rarity: card.rarity,
          card_snapshot: {
            name: card.name,
            category: card.category,
            affinity: card.affinity,
            rarity: card.rarity,
            battleCard: card.battleCard,
          },
        })),
      ),
    ],
  );
  return snapshotId;
}

async function loadSnapshotDeck(
  client: AsyncPvpClient,
  invitationId: string,
  role: 'challenger' | 'recipient',
): Promise<{
  snapshotId: string;
  initialCreatureId: string;
  deck: LoadedPlayerBattleDeck['deck'];
}> {
  const result = await client.query<{
    snapshot_id: string;
    initial_battle_card_id: string;
    category: 'creature' | 'power';
    battle_card: LoadedPlayerBattleDeck['cards'][number]['battleCard'];
  }>(
    `
      select snapshot.id::text as snapshot_id,
             initial_card.battle_card_id::text as initial_battle_card_id,
             card.category,
             card.card_snapshot -> 'battleCard' as battle_card
        from private.async_pvp_deck_snapshots snapshot
        join private.async_pvp_deck_snapshot_cards card
          on card.snapshot_id = snapshot.id
        join private.async_pvp_deck_snapshot_cards initial_card
          on initial_card.id = snapshot.initial_creature_card_id
       where snapshot.invitation_id = $1::uuid
         and snapshot.participant_role = $2
       order by card.position
    `,
    [invitationId, role],
  );
  const first = result.rows[0];
  if (!first || result.rows.length !== 5) {
    throw new Error('Persisted PvP deck snapshot is incomplete.');
  }
  return {
    snapshotId: first.snapshot_id,
    initialCreatureId: first.initial_battle_card_id,
    deck: {
      creatureCards: result.rows
        .filter((row) => row.category === 'creature')
        .map((row) => row.battle_card as never),
      powerCards: result.rows
        .filter((row) => row.category === 'power')
        .map((row) => row.battle_card as never),
    },
  };
}

async function loadReceipt<T>(
  client: AsyncPvpClient,
  actorId: string,
  operation: string,
  submissionId: string,
  payloadHash: string,
): Promise<T | null> {
  const result = await client.query<ReceiptRow>(
    `
      select payload_hash, committed_response,
             invitation_id::text, match_id::text
        from private.async_pvp_submission_receipts
       where actor_player_id = $1::uuid
         and operation = $2
         and submission_id = $3::uuid
    `,
    [actorId, operation, submissionId],
  );
  return readReceipt<T>(
    result.rows[0],
    actorId,
    operation,
    submissionId,
    payloadHash,
  );
}

async function loadAcceptanceReceiptAndTime<T>(
  client: AsyncPvpClient,
  actorId: string,
  submissionId: string,
  payloadHash: string,
): Promise<{ replay: T | null; now: Date }> {
  // A separate post-lock statement sees a receipt committed by a previous
  // lock holder. The singleton also returns DB time when no receipt exists.
  const result = await client.query<
    NowRow & {
      payload_hash: string | null;
      committed_response: unknown;
      invitation_id: string | null;
      match_id: string | null;
    }
  >(
    `
      select receipt.payload_hash, receipt.committed_response,
             receipt.invitation_id::text, receipt.match_id::text,
             clock_timestamp() as now
        from (values (1)) as singleton(value)
        left join private.async_pvp_submission_receipts receipt
          on receipt.actor_player_id = $1::uuid
         and receipt.operation = 'invitation_accept'
         and receipt.submission_id = $2::uuid
    `,
    [actorId, submissionId],
  );
  const row = result.rows[0];
  const replay = readReceipt<T>(
    row && row.payload_hash !== null
      ? { ...row, payload_hash: row.payload_hash }
      : undefined,
    actorId,
    'invitation_accept',
    submissionId,
    payloadHash,
  );
  if (!row?.now)
    throw new Error('Database did not return its transaction time.');
  // Acceptance must decide replay before using this clock to decide expiry.
  return { replay, now: row.now };
}

async function loadActionReceiptAndTime<T>(
  client: AsyncPvpClient,
  actorId: string,
  submissionId: string,
  payloadHash: string,
): Promise<{ replay: T | null; now: Date }> {
  // Keep this statement after both locks, so a waiting submission observes
  // the committed receipt. The database clock is read after the receipt join.
  const result = await client.query<
    NowRow & {
      payload_hash: string | null;
      committed_response: unknown;
      invitation_id: string | null;
      match_id: string | null;
    }
  >(
    `
      select receipt.payload_hash, receipt.committed_response,
             receipt.invitation_id::text, receipt.match_id::text,
             clock_timestamp() as now
        from (values (1)) as singleton(value)
        left join private.async_pvp_submission_receipts receipt
          on receipt.actor_player_id = $1::uuid
         and receipt.operation = 'match_action'
         and receipt.submission_id = $2::uuid
    `,
    [actorId, submissionId],
  );
  const row = result.rows[0];
  const replay = readReceipt<T>(
    row && row.payload_hash !== null
      ? { ...row, payload_hash: row.payload_hash }
      : undefined,
    actorId,
    'match_action',
    submissionId,
    payloadHash,
  );
  if (!row?.now)
    throw new Error('Database did not return its transaction time.');
  return { replay, now: row.now };
}

function readReceipt<T>(
  receipt: ReceiptRow | undefined,
  actorId: string,
  operation: string,
  submissionId: string,
  payloadHash: string,
): T | null {
  if (!receipt) return null;
  if (receipt.payload_hash !== payloadHash) {
    throw new AsyncPvpIdempotencyConflictError(
      actorId,
      operation,
      submissionId,
      receipt.invitation_id ?? receipt.match_id ?? operation,
    );
  }
  return receipt.committed_response as T;
}

async function lockSubmissionKey(
  client: AsyncPvpClient,
  actorId: string,
  operation: string,
  submissionId: string,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `async-pvp-submission:${actorId}:${operation}:${submissionId}`,
  ]);
}

async function insertReceipt(
  client: AsyncPvpClient,
  input: {
    actorId: string;
    operation: string;
    submissionId: string;
    invitationId?: string;
    matchId?: string;
    payloadHash: string;
    response: unknown;
    now: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into private.async_pvp_submission_receipts (
        actor_player_id, operation, submission_id, invitation_id, match_id,
        payload_hash, committed_response, created_at
      ) values ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7::jsonb, $8)
    `,
    [
      input.actorId,
      input.operation,
      input.submissionId,
      input.invitationId ?? null,
      input.matchId ?? null,
      input.payloadHash,
      JSON.stringify(input.response),
      input.now,
    ],
  );
}

function hashPayload(payload: object): string {
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function lockInvitation(
  client: AsyncPvpClient,
  invitationId: string,
  playerId: string,
  role: 'challenger' | 'recipient' | 'participant',
): Promise<InvitationRow> {
  const result = await client.query<InvitationRow>(
    `
      select invitation.*,
             challenger.player_name as challenger_name,
             recipient.player_name as recipient_name
        from public.async_pvp_invitations invitation
        join public.players challenger on challenger.id = invitation.challenger_player_id
        join public.players recipient on recipient.id = invitation.recipient_player_id
       where invitation.id = $1::uuid
         and (($3 = 'participant'
               and (invitation.challenger_player_id = $2::uuid
                    or invitation.recipient_player_id = $2::uuid))
              or ($3 = 'recipient'
                  and invitation.recipient_player_id = $2::uuid)
              or ($3 = 'challenger'
                  and invitation.challenger_player_id = $2::uuid))
       for update of invitation
    `,
    [invitationId, playerId, role],
  );
  const invitation = result.rows[0];
  if (!invitation) {
    throw new AsyncPvpError(
      'PVP_INVITATION_NOT_FOUND',
      'The requested PvP invitation was not found.',
    );
  }
  return invitation;
}

async function loadInvitationView(
  client: AsyncPvpClient,
  playerId: string,
  invitationId: string,
): Promise<PvpInvitationView> {
  const invitation = await lockInvitation(
    client,
    invitationId,
    playerId,
    'participant',
  );
  return mapInvitation(invitation, playerId);
}

function mapInvitation(
  invitation: InvitationRow,
  playerId: string,
): PvpInvitationView {
  const outgoing = invitation.challenger_player_id === playerId;
  return {
    invitationId: invitation.id,
    direction: outgoing ? 'outgoing' : 'incoming',
    status: invitation.status,
    version: invitation.version,
    opponent: {
      playerName:
        (outgoing ? invitation.recipient_name : invitation.challenger_name) ??
        'Deleted player',
    },
    createdAt: invitation.created_at.toISOString(),
    expiresAt: invitation.expires_at.toISOString(),
    respondedAt: invitation.responded_at?.toISOString() ?? null,
    matchId: invitation.match_id,
  };
}

function assertPendingInvitation(
  invitation: InvitationRow,
  expectedVersion: number,
): void {
  if (invitation.status === 'expired') throw expiredInvitation();
  if (invitation.status === 'invalidated') {
    throw new AsyncPvpError(
      'PVP_INVITATION_INVALIDATED',
      'The invitation is no longer available.',
    );
  }
  if (invitation.status === 'cancelled') {
    throw new AsyncPvpError(
      'PVP_INVITATION_CANCELLED',
      'The invitation was cancelled by its challenger.',
    );
  }
  if (
    invitation.status !== 'pending' ||
    invitation.version !== expectedVersion
  ) {
    throw new AsyncPvpError(
      'PVP_INVITATION_VERSION_CONFLICT',
      'The invitation changed before this response was applied.',
    );
  }
}

async function markInvitationExpired(
  client: AsyncPvpClient,
  invitationId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `
      update public.async_pvp_invitations
         set status = 'expired', version = version + 1,
             responded_at = greatest(expires_at, $2),
             updated_at = greatest(expires_at, $2)
       where id = $1::uuid and status = 'pending'
    `,
    [invitationId, now],
  );
}

async function expireVisibleInvitations(
  client: AsyncPvpClient,
  playerId: string,
): Promise<void> {
  await client.query(
    `
      update public.async_pvp_invitations
         set status = 'expired', version = version + 1,
             responded_at = transaction_timestamp(),
             updated_at = transaction_timestamp()
       where status = 'pending'
         and expires_at <= transaction_timestamp()
         and (challenger_player_id = $1::uuid or recipient_player_id = $1::uuid)
    `,
    [playerId],
  );
}

function unavailablePlayer(): AsyncPvpError {
  return new AsyncPvpError(
    'PVP_PLAYER_UNAVAILABLE',
    'The requested player is unavailable.',
  );
}

function expiredInvitation(): AsyncPvpError {
  return new AsyncPvpError(
    'PVP_INVITATION_EXPIRED',
    'The invitation is no longer available.',
  );
}

function illegalAction(): AsyncPvpError {
  return new AsyncPvpError(
    'PVP_ACTION_ILLEGAL',
    'The selected action is not legal for the current match state.',
  );
}

const matchProjectionSql = `
  select match.id::text,
         match.status,
         match.version,
         match.current_player_id::text,
         match.winner_player_id::text,
         match.completion_reason,
         match.turn_deadline,
         match.started_at,
         match.updated_at,
         match.completed_at,
         viewer.player_id::text as viewer_player_id,
         viewer.engine_side as viewer_side,
         viewer.outcome as viewer_outcome,
         viewer_player.player_name as viewer_name,
         opponent.player_id::text as opponent_player_id,
         opponent.engine_side as opponent_side,
         opponent_player.player_name as opponent_name,
         state.battle_state,
         coalesce(history.entries, '[]'::jsonb) as action_history,
         latest.public_result as latest_result
    from public.async_pvp_matches match
    join public.async_pvp_match_participants viewer
      on viewer.match_id = match.id
    join public.players viewer_player on viewer_player.id = viewer.player_id
    join public.async_pvp_match_participants opponent
      on opponent.match_id = match.id and opponent.player_id <> viewer.player_id
    join public.players opponent_player on opponent_player.id = opponent.player_id
    join private.async_pvp_match_states state on state.match_id = match.id
    left join lateral (
      select action.public_result
        from public.async_pvp_match_actions action
       where action.match_id = match.id
       order by action.sequence desc
       limit 1
    ) latest on true
    left join lateral (
      select jsonb_agg(
               jsonb_build_object(
                 'sequence', action.sequence,
                 'turnNumber', greatest(
                   1,
                   coalesce(
                     (transition.state_before ->> 'turnNumber')::integer,
                     action.sequence
                   )
                 ),
                 'createdAt', action.created_at,
                 'result', action.public_result
               )
               order by action.sequence
             ) as entries
        from public.async_pvp_match_actions action
        left join private.async_pvp_match_transitions transition
          on transition.action_id = action.id
       where action.match_id = match.id
         and action.sequence <= match.version
    ) history on true
`;

type MatchViewLock = Pick<
  MatchRow,
  | 'id'
  | 'status'
  | 'version'
  | 'current_player_id'
  | 'turn_deadline'
  | 'viewer_player_id'
  | 'opponent_player_id'
>;

/** GET needs authority and deadline inputs here, not a pre-lock response. */
async function lockMatchForView(
  client: AsyncPvpClient,
  playerId: string,
  matchId: string,
): Promise<MatchViewLock> {
  const result = await client.query<MatchViewLock>(
    `select match.id::text, match.status, match.version,
            match.current_player_id::text, match.turn_deadline,
            viewer.player_id::text as viewer_player_id,
            opponent.player_id::text as opponent_player_id
       from public.async_pvp_matches match
       join public.async_pvp_match_participants viewer
         on viewer.match_id = match.id
       join public.async_pvp_match_participants opponent
         on opponent.match_id = match.id
        and opponent.player_id <> viewer.player_id
      where match.id = $1::uuid and viewer.player_id = $2::uuid
      for update of match`,
    [matchId, playerId],
  );
  const match = result.rows[0];
  if (!match) {
    throw new AsyncPvpError(
      'PVP_MATCH_NOT_FOUND',
      'The requested PvP match was not found.',
    );
  }
  return match;
}

async function lockMatch(
  client: AsyncPvpClient,
  playerId: string,
  matchId: string,
): Promise<MatchRow> {
  const result = await client.query<MatchRow>(
    `${matchProjectionSql}
      where match.id = $1::uuid and viewer.player_id = $2::uuid
      for update of match`,
    [matchId, playerId],
  );
  const match = result.rows[0];
  if (!match) {
    throw new AsyncPvpError(
      'PVP_MATCH_NOT_FOUND',
      'The requested PvP match was not found.',
    );
  }
  return match;
}

async function lockMatchById(
  client: AsyncPvpClient,
  matchId: string,
  skipLocked: boolean,
): Promise<MatchRow | null> {
  const result = await client.query<MatchRow>(
    `${matchProjectionSql}
      where match.id = $1::uuid and viewer.engine_side = 'player'
      for update of match${skipLocked ? ' skip locked' : ''}`,
    [matchId],
  );
  return result.rows[0] ?? null;
}

async function loadMatchView(
  client: AsyncPvpClient,
  playerId: string,
  matchId: string,
  includeCardPresentation = false,
  timing?: PhaseTimingSink,
): Promise<AsyncPvpMatchView> {
  const projection = `${matchProjectionSql}
      where match.id = $1::uuid and viewer.player_id = $2::uuid`;
  const result = await timePhase(timing, 'get_response_projection_ms', () =>
    client.query<
      MatchRow & {
        card_presentation?: Record<string, SnapshotCardPresentation>;
      }
    >(
      includeCardPresentation
        ? `
          with match_view as (${projection}),
               card_presentation as (${cardPresentationSql})
          select match_view.*,
                 coalesce((
                   select jsonb_object_agg(
                     id, jsonb_build_object('name', name, 'rarity', rarity)
                   )
                   from card_presentation
                 ), '{}'::jsonb) as card_presentation
            from match_view
        `
        : projection,
      [matchId, playerId],
    ),
  );
  const match = result.rows[0];
  if (!match) {
    throw new AsyncPvpError(
      'PVP_MATCH_NOT_FOUND',
      'The requested PvP match was not found.',
    );
  }
  const cards = includeCardPresentation
    ? (match.card_presentation ?? {})
    : await timePhase(timing, 'get_card_presentation_ms', () =>
        loadCardPresentation(client, matchId),
      );
  return timePhaseSync(timing, 'project_match_ms', () =>
    projectMatch(match, cards),
  );
}

interface SnapshotCardPresentation {
  name: string;
  rarity: LoadedPlayerBattleDeck['cards'][number]['rarity'];
}

const cardPresentationSql = `
  select card.battle_card_id::text as id,
         card.card_snapshot ->> 'name' as name,
         card.rarity
    from public.async_pvp_match_participants participant
    join private.async_pvp_deck_snapshot_cards card
      on card.snapshot_id = participant.deck_snapshot_id
   where participant.match_id = $1::uuid
`;

async function loadCardPresentation(
  client: AsyncPvpClient,
  matchId: string,
): Promise<Record<string, SnapshotCardPresentation>> {
  const result = await client.query<{
    id: string;
    name: string;
    rarity: SnapshotCardPresentation['rarity'];
  }>(cardPresentationSql, [matchId]);
  return Object.fromEntries(
    result.rows.map((row) => [row.id, { name: row.name, rarity: row.rarity }]),
  );
}

function projectMatch(
  match: MatchRow,
  cards: Readonly<Record<string, SnapshotCardPresentation>>,
): AsyncPvpMatchView {
  const state = match.battle_state;
  const self = state.participants[match.viewer_side];
  const opponent = state.participants[match.opponent_side];
  const currentActor =
    match.current_player_id === null
      ? null
      : match.current_player_id === match.viewer_player_id
        ? 'self'
        : 'opponent';
  const legalActions =
    currentActor === 'self'
      ? getLegalActions(state, match.viewer_side)
          .filter(
            (action): action is PvpAction =>
              action.type !== 'timeout' &&
              action.type !== 'select_initial_creature',
          )
          .map(publicAction)
      : [];
  const history = (match.action_history ?? []).map((entry) => ({
    sequence: Number(entry.sequence),
    turnNumber: Number(entry.turnNumber),
    createdAt: new Date(entry.createdAt).toISOString(),
    result: relativeActionResult(entry.result, match.viewer_side, state),
  }));

  return {
    matchId: match.id,
    mode: 'asynchronous',
    status: match.status,
    version: match.version,
    opponent: { playerName: match.opponent_name ?? 'Deleted player' },
    currentActor,
    turnDeadline: match.turn_deadline?.toISOString() ?? null,
    state: {
      phase:
        match.status === 'completed'
          ? 'completed'
          : state.phase === 'initial_selection'
            ? 'active'
            : state.phase,
      turnNumber: Math.max(1, state.turnNumber),
      self: {
        playerName: match.viewer_name ?? 'Deleted player',
        creatures: self.creatures.map((creature) =>
          publicCreature(creature, cards),
        ),
        powerCards: self.powerCards.map((card) => ({
          id: card.id,
          name:
            cards[card.id]?.name ??
            (card.affinity
              ? `${titleCase(card.affinity)} Power card`
              : 'Power card'),
          affinity: card.affinity,
          effects: card.effects.map(publicEffect),
          available: !self.usedPowerCardIds.includes(card.id),
        })),
        usedPowerCardIds: [...self.usedPowerCardIds],
        activeCreatureId: self.activeCreatureId,
      },
      opponent: {
        playerName: match.opponent_name ?? 'Deleted player',
        activeCreature:
          opponent.activeCreatureId === null
            ? null
            : publicCreature(
                opponent.creatures.find(
                  (creature) => creature.card.id === opponent.activeCreatureId,
                )!,
                cards,
              ),
        defeatedCreatures: opponent.creatures
          .filter((creature) => creature.defeated)
          .map((creature) => publicCreature(creature, cards)),
        remainingCreatureCount: opponent.creatures.filter(
          (creature) =>
            !creature.defeated &&
            creature.card.id !== opponent.activeCreatureId,
        ).length,
        playedPowerCards: opponent.powerCards
          .filter((card) => opponent.usedPowerCardIds.includes(card.id))
          .map((card) => ({
            id: card.id,
            name:
              cards[card.id]?.name ??
              (card.affinity
                ? `${titleCase(card.affinity)} Power card`
                : 'Power card'),
            affinity: card.affinity,
            effects: card.effects.map(publicEffect),
            available: false,
          })),
        remainingPowerCardCount:
          opponent.powerCards.length - opponent.usedPowerCardIds.length,
      },
    },
    legalActions,
    history,
    lastAction:
      history.at(-1)?.result ??
      (match.latest_result === null
        ? null
        : relativeActionResult(match.latest_result, match.viewer_side, state)),
    outcome: match.viewer_outcome,
    completionReason: match.completion_reason,
    startedAt: match.started_at.toISOString(),
    updatedAt: match.updated_at.toISOString(),
    completedAt: match.completed_at?.toISOString() ?? null,
  };
}

function publicCreature(
  creature: BattleState['participants']['player']['creatures'][number],
  cards: Readonly<Record<string, SnapshotCardPresentation>>,
): unknown {
  const presentation = cards[creature.card.id];
  return {
    id: creature.card.id,
    name: presentation?.name ?? `${titleCase(creature.card.affinity)} Creature`,
    ...(presentation ? { rarity: presentation.rarity } : {}),
    affinity: creature.card.affinity,
    maxHp: creature.card.maxHp,
    maxPower: creature.card.maxPower,
    currentHp: creature.currentHp,
    remainingPower: creature.remainingPower,
    defeated: creature.defeated,
    moves: creature.card.moves.map((move) => ({
      id: move.id,
      name: move.name,
      moveType: move.moveType,
      powerCost: move.powerCost,
      effects: move.effects.map(publicEffect),
    })),
    activeModifiers: creature.modifiers.map((modifier) => ({
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
    })),
  };
}

function publicEffect(effect: BattleEffect): unknown {
  return {
    damageMultiplier:
      effect.modifier?.stat === 'damage_multiplier' &&
      effect.effectValue !== null &&
      (effect.effectType === 'buff' || effect.effectType === 'debuff')
        ? getEffectDamageMultiplier(effect.effectType, effect.effectValue)
        : null,
    effectType: effect.effectType,
    effectValue: effect.effectValue,
    modifier: effect.modifier ?? null,
  };
}

function publicAction(action: PvpAction): PvpAction {
  if (action.type === 'select_replacement' || action.type === 'swap_creature') {
    return { type: action.type, creatureId: action.creatureId };
  }
  if (action.type === 'use_move') {
    return { type: action.type, moveId: action.moveId };
  }
  return { type: action.type, powerCardId: action.powerCardId };
}

function relativeActionResult(
  result: BattleActionResult,
  viewerSide: BattleSide,
  state: BattleState,
) {
  const relativeSide = (side: BattleSide): 'self' | 'opponent' =>
    side === viewerSide ? 'self' : 'opponent';
  return {
    action: result.action,
    defeatedCreatureId: result.defeatedCreatureId,
    turnEnded: result.turnEnded,
    side: relativeSide(result.side),
    winner: result.winner === null ? null : relativeSide(result.winner),
    effects: result.effects.map((effect) => ({
      effectId: effect.effectId,
      effectType: effect.effectType,
      targetCreatureId: effect.targetCreatureId,
      amount: effect.amount,
      damageMultiplier: effect.damageMultiplier,
      targetSide: relativeSide(effect.targetSide),
      modifier: findEffect(state, effect.effectId)?.modifier ?? null,
    })),
  };
}

// Older receipts may contain engine metadata. Preserve their confirmed version
// and outcome while selecting only the existing public action contract.
function normalizeMatchReceipt(view: AsyncPvpMatchView): AsyncPvpMatchView {
  const normalizeResult = (value: unknown) => {
    const result = value as ReturnType<typeof relativeActionResult>;
    return {
      action: result.action,
      side: result.side,
      defeatedCreatureId: result.defeatedCreatureId,
      winner: result.winner,
      turnEnded: result.turnEnded,
      effects: result.effects.map((effect) => ({
        effectId: effect.effectId,
        effectType: effect.effectType,
        targetCreatureId: effect.targetCreatureId,
        targetSide: effect.targetSide,
        amount: effect.amount,
        damageMultiplier: effect.damageMultiplier,
        modifier: effect.modifier ?? null,
      })),
    };
  };
  const history = Array.isArray(view.history)
    ? view.history.map((entry) => ({
        sequence: entry.sequence,
        turnNumber: entry.turnNumber,
        createdAt: entry.createdAt,
        result: normalizeResult(entry.result),
      }))
    : [];
  if (view.lastAction === null) return { ...view, history };
  return {
    ...view,
    history,
    lastAction: normalizeResult(view.lastAction),
  };
}

async function normalizeMatchReceiptWithHistory(
  client: AsyncPvpClient,
  playerId: string,
  matchId: string,
  view: AsyncPvpMatchView,
) {
  const normalized = normalizeMatchReceipt(view);
  if (Array.isArray(view.history)) return normalized;
  const current = await loadMatchView(client, playerId, matchId);
  return {
    ...normalized,
    history: current.history.filter(
      (entry) => entry.sequence <= normalized.version,
    ),
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

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isActionLegal(
  state: BattleState,
  side: BattleSide,
  action: PvpAction,
): boolean {
  return getLegalActions(state, side).some(
    (legal) => stableJson(legal) === stableJson(action),
  );
}

async function finalizeVisibleOverdueMatches(
  database: AsyncPvpDatabase,
  service: Pick<AsyncPvpService, 'forfeitOverdueMatch'>,
  playerId: string,
): Promise<void> {
  const client = await database.connect();
  let ids: string[];
  try {
    const result = await client.query<{ id: string }>(
      `
        select match.id::text
          from public.async_pvp_matches match
          join public.async_pvp_match_participants participant
            on participant.match_id = match.id
         where participant.player_id = $1::uuid
           and match.status = 'active'
           and match.turn_deadline <= transaction_timestamp()
         order by match.turn_deadline, match.id
         limit 25
      `,
      [playerId],
    );
    ids = result.rows.map((row) => row.id);
  } finally {
    client.release();
  }

  for (const id of ids) {
    await withTransaction(database, (itemClient) =>
      service.forfeitOverdueMatch(itemClient, id),
    );
  }
}

async function completeForfeit(
  client: AsyncPvpClient,
  match: Pick<
    MatchRow,
    'id' | 'version' | 'viewer_player_id' | 'opponent_player_id'
  >,
  losingPlayerId: string,
  completedAt: Date,
  reason: 'turn_forfeit' | 'account_deletion_forfeit' | 'voluntary_resignation',
  progressionPersistence: ProgressionPersistence,
): Promise<void> {
  const winnerPlayerId =
    match.viewer_player_id === losingPlayerId
      ? match.opponent_player_id
      : match.viewer_player_id;
  const newVersion = match.version + 1;
  await client.query(
    `
      update public.async_pvp_matches
         set status = 'completed', version = $2,
             current_player_id = null, winner_player_id = $3::uuid,
             completion_reason = $4, decision_started_at = null,
             turn_deadline = null, completed_at = $5, updated_at = $5
       where id = $1::uuid and status = 'active'
    `,
    [match.id, newVersion, winnerPlayerId, reason, completedAt],
  );
  await client.query(
    `
      update private.async_pvp_match_states
         set version = $2, updated_at = $3
       where match_id = $1::uuid
    `,
    [match.id, newVersion, completedAt],
  );
  await setParticipantOutcomes(client, match.id, winnerPlayerId);
  await progressionPersistence.recordAsynchronousPvpCompletion(
    client,
    match.id,
  );
}

async function setParticipantOutcomes(
  client: AsyncPvpClient,
  matchId: string,
  winnerPlayerId: string,
): Promise<void> {
  await client.query(
    `
      update public.async_pvp_match_participants
         set outcome = case when player_id = $2::uuid then 'win' else 'loss' end
       where match_id = $1::uuid
    `,
    [matchId, winnerPlayerId],
  );
}

async function listMatchSummaries(
  database: AsyncPvpDatabase,
  cursorCodec: SignedCursorCodec,
  input: { playerId: string; cursor?: string; limit?: number },
  kind: 'active',
): Promise<Page<PvpMatchSummary>>;
async function listMatchSummaries(
  database: AsyncPvpDatabase,
  cursorCodec: SignedCursorCodec,
  input: { playerId: string; cursor?: string; limit?: number },
  kind: 'history',
): Promise<Page<PvpHistorySummary>>;
async function listMatchSummaries(
  database: AsyncPvpDatabase,
  cursorCodec: SignedCursorCodec,
  input: { playerId: string; cursor?: string; limit?: number },
  kind: 'active' | 'history',
): Promise<Page<PvpMatchSummary | PvpHistorySummary>> {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
  const endpoint = kind === 'active' ? 'active' : 'history';
  const cursor = decodeCursor(cursorCodec, input.playerId, input.cursor, {
    endpoint,
    limit,
  });
  const client = await database.connect();
  try {
    const timestampColumn =
      kind === 'active' ? 'match.updated_at' : 'match.completed_at';
    const result = await client.query<{
      id: string;
      version: number;
      current_player_id: string | null;
      winner_player_id: string | null;
      completion_reason: PvpCompletionReason | null;
      started_at: Date;
      turn_deadline: Date | null;
      updated_at: Date;
      completed_at: Date | null;
      opponent_name: string | null;
    }>(
      `
        select match.id::text, match.version,
               match.current_player_id::text, match.winner_player_id::text,
               match.completion_reason, match.started_at, match.turn_deadline,
               match.updated_at, match.completed_at,
               opponent_player.player_name as opponent_name
          from public.async_pvp_matches match
          join public.async_pvp_match_participants viewer
            on viewer.match_id = match.id and viewer.player_id = $1::uuid
          join public.async_pvp_match_participants opponent
            on opponent.match_id = match.id and opponent.player_id <> viewer.player_id
          join public.players opponent_player on opponent_player.id = opponent.player_id
         where match.status = $2
           and ($2::text <> 'active' or match.turn_deadline > clock_timestamp())
           and ($3::timestamptz is null
                or (${timestampColumn}, match.id) < ($3::timestamptz, $4::uuid))
         order by ${timestampColumn} desc, match.id desc
         limit $5
      `,
      [
        input.playerId,
        kind === 'active' ? 'active' : 'completed',
        cursor?.timestamp ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
    const rows = result.rows.slice(0, limit);
    const items = rows.map((row): PvpMatchSummary | PvpHistorySummary => {
      if (kind === 'active') {
        if (!row.current_player_id || !row.turn_deadline) {
          throw new Error('Active PvP match summary is incomplete.');
        }
        return {
          matchId: row.id,
          mode: 'asynchronous',
          status: 'active',
          version: row.version,
          opponent: { playerName: row.opponent_name ?? 'Deleted player' },
          currentActor:
            row.current_player_id === input.playerId ? 'self' : 'opponent',
          turnDeadline: row.turn_deadline.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      }
      if (
        !row.winner_player_id ||
        !row.completion_reason ||
        !row.completed_at
      ) {
        throw new Error('Completed PvP history summary is incomplete.');
      }
      return {
        matchId: row.id,
        mode: 'asynchronous',
        status: 'completed',
        opponent: { playerName: row.opponent_name ?? 'Deleted player' },
        outcome: row.winner_player_id === input.playerId ? 'win' : 'loss',
        completionReason: row.completion_reason,
        startedAt: row.started_at.toISOString(),
        completedAt: row.completed_at.toISOString(),
      };
    });
    return {
      items,
      nextCursor: nextCursor(
        cursorCodec,
        input.playerId,
        result.rows.length > limit,
        rows.at(-1),
        { endpoint, limit },
        kind === 'active' ? 'updated_at' : 'completed_at',
      ),
    };
  } finally {
    client.release();
  }
}

function decodeCursor(
  codec: SignedCursorCodec,
  playerId: string,
  cursor: string | undefined,
  expected: Omit<ListCursor, 'timestamp' | 'id'>,
): ListCursor | null {
  if (!cursor) return null;
  const decoded = codec.decode<ListCursor>(playerId, cursor);
  if (
    decoded.endpoint !== expected.endpoint ||
    decoded.limit !== expected.limit ||
    decoded.direction !== expected.direction ||
    decoded.status !== expected.status ||
    typeof decoded.timestamp !== 'string' ||
    typeof decoded.id !== 'string' ||
    Number.isNaN(Date.parse(decoded.timestamp))
  ) {
    throw new InvalidCursorError();
  }
  return decoded;
}

function nextCursor<T extends { id: string }>(
  codec: SignedCursorCodec,
  playerId: string,
  hasMore: boolean,
  row: T | undefined,
  filters: Omit<ListCursor, 'timestamp' | 'id'>,
  timestampProperty: keyof T,
): string | null {
  if (!hasMore || !row) return null;
  const timestamp = row[timestampProperty];
  if (!(timestamp instanceof Date)) {
    throw new Error('Pagination row is missing its timestamp.');
  }
  return codec.encode(playerId, {
    ...filters,
    timestamp: timestamp.toISOString(),
    id: row.id,
  });
}
