import {
  createHash,
  randomBytes,
  randomInt as secureRandomInt,
  randomUUID,
} from 'node:crypto';

import {
  applyBattleAction,
  getEffectDamageMultiplier,
  getLegalActions,
  IllegalBattleActionError,
  type BattleAction,
  type BattleActionResult,
  type BattleEffect,
  type BattleSide,
  type BattleState,
  type RandomInt,
} from '@wits-world/game-rules';
import type pg from 'pg';

import type { TrustService } from '../trust/trust-service.js';

const DECISION_WINDOW_MS = 60_000;
const MAX_TIMEOUT_STRIKES = 3;
export const LIVE_PVP_MAX_CATCH_UP_TRANSITIONS = 8;
const LIVE_PVP_NOTIFY_CHANNEL = 'live_pvp_match_changed';
const LIVE_PVP_PRESENCE_NOTIFY_CHANNEL = 'live_pvp_presence_changed';

export type LiveConnectionRole = 'participant' | 'spectator';
export type LiveParticipantSide = 'player_one' | 'player_two';
export type LiveCompletionReason =
  | 'defeat'
  | 'abandonment_forfeit'
  | 'voluntary_resignation'
  | 'account_deletion_forfeit';

export type LiveClientAction = Exclude<BattleAction, { type: 'timeout' }>;

export interface LivePvpDatabaseClient {
  query<R extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount?: number | null }>;
  release(): void;
}

export interface LivePvpDatabase {
  connect(): Promise<LivePvpDatabaseClient>;
  query<R extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface LivePvpTicketView {
  ticket: string;
  role: LiveConnectionRole;
  protocolVersion: 1;
  expiresAt: string;
}

export interface RedeemedLivePvpConnection {
  accessId: string;
  matchId: string;
  playerId: string;
  role: LiveConnectionRole;
  participantGeneration: number | null;
}

export interface LivePvpParticipantProjection {
  matchId: string;
  mode: 'live';
  role: 'participant';
  status: 'active' | 'completed';
  version: number;
  phase: BattleState['phase'];
  turnNumber: number;
  currentActor: 'self' | 'opponent' | null;
  turnDeadline: string | null;
  consecutiveTimeouts: { self: number; opponent: number };
  self: PublicSelfParticipant;
  opponent: PublicOpponentParticipant;
  legalActions: readonly LiveClientAction[];
  lastAction: unknown | null;
  outcome: 'win' | 'loss' | null;
  completionReason: LiveCompletionReason | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface LivePvpSpectatorProjection {
  matchId: string;
  mode: 'live';
  role: 'spectator';
  status: 'active' | 'completed';
  version: number;
  phase: BattleState['phase'];
  turnNumber: number;
  currentActor: 'playerOne' | 'playerTwo' | null;
  turnDeadline: string | null;
  consecutiveTimeouts: { playerOne: number; playerTwo: number };
  playerOne: PublicOpponentParticipant;
  playerTwo: PublicOpponentParticipant;
  history: readonly unknown[];
  presence: {
    playerOneConnected: boolean;
    playerTwoConnected: boolean;
    spectatorCount: number;
  };
  completionReason: LiveCompletionReason | null;
  winner: 'playerOne' | 'playerTwo' | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type LivePvpProjection =
  LivePvpParticipantProjection | LivePvpSpectatorProjection;

export interface LivePvpMutationInput {
  matchId: string;
  playerId: string;
  connectionGeneration: number;
  messageId: string;
  expectedVersion: number;
}

export interface LivePvpMutationResult {
  acknowledgement: {
    protocolVersion: 1;
    type: 'action.acknowledged';
    messageId: string;
    eventId: string;
    version: number;
    serverTime: string;
  };
  replayed: boolean;
  late: boolean;
}

export interface LivePvpDeadlineResult {
  transitioned: boolean;
  matchId: string;
  previousVersion?: number;
  version?: number;
  completed?: boolean;
}

export type LivePvpErrorCode =
  | 'LIVE_AUTHENTICATION_REQUIRED'
  | 'LIVE_ACTION_FORBIDDEN'
  | 'LIVE_MATCH_NOT_FOUND'
  | 'LIVE_MATCH_COMPLETED'
  | 'LIVE_VERSION_CONFLICT'
  | 'LIVE_ACTION_ILLEGAL'
  | 'LIVE_ACTION_LATE'
  | 'LIVE_IDEMPOTENCY_CONFLICT'
  | 'LIVE_TICKET_EXPIRED'
  | 'LIVE_TICKET_ALREADY_USED'
  | 'LIVE_CONNECTION_SUPERSEDED';

export class LivePvpError extends Error {
  constructor(
    readonly code: LivePvpErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LivePvpError';
  }
}

export interface LivePvpService {
  mintConnectionTicket(input: {
    matchId: string;
    playerId: string;
    requestedRole: LiveConnectionRole;
  }): Promise<LivePvpTicketView>;
  redeemConnectionTicket(rawTicket: string): Promise<RedeemedLivePvpConnection>;
  closeConnectionAccess(
    accessId: string,
    reason: 'transport_closed' | 'service_shutdown' | 'match_completed',
  ): Promise<void>;
  getProjection(input: {
    matchId: string;
    playerId: string;
  }): Promise<LivePvpProjection>;
  getProjectionForConnection(
    connection: RedeemedLivePvpConnection,
  ): Promise<LivePvpProjection>;
  getPresence(matchId: string): Promise<{
    playerOneConnected: boolean;
    playerTwoConnected: boolean;
    spectatorCount: number;
  }>;
  getCommittedEventMeta(
    matchId: string,
    committedVersion: number,
  ): Promise<{ eventId: string; createdAt: string } | null>;
  submitAction(
    input: LivePvpMutationInput & { action: LiveClientAction },
  ): Promise<LivePvpMutationResult>;
  resign(input: LivePvpMutationInput): Promise<LivePvpMutationResult>;
  processOverdueMatch(matchId: string): Promise<LivePvpDeadlineResult>;
  processOverdueUntilCurrent(matchId: string): Promise<void>;
  listDueMatchIds(limit?: number): Promise<string[]>;
  purgeTransientAccess(): Promise<{
    accessRowsDeleted: number;
    ticketRowsDeleted: number;
  }>;
  finalizeAccountDeletion(
    client: LivePvpDatabaseClient,
    playerId: string,
    requestedAt: Date,
  ): Promise<void>;
}

interface MatchRow extends pg.QueryResultRow {
  id: string;
  status: 'active' | 'completed';
  version: number;
  phase: BattleState['phase'];
  current_actor_player_id: string | null;
  decision_started_at: Date | null;
  turn_deadline: Date | null;
  winner_player_id: string | null;
  completion_reason: LiveCompletionReason | null;
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  battle_state: BattleState;
}

interface ParticipantRow extends pg.QueryResultRow {
  player_id: string;
  participant_side: LiveParticipantSide;
  consecutive_timeout_count: number;
  connection_generation: string | number;
  outcome: 'win' | 'loss' | null;
  player_name: string | null;
}

interface ReceiptRow extends pg.QueryResultRow {
  payload_hash: string;
  committed_acknowledgement: LivePvpMutationResult['acknowledgement'];
}

interface TicketInsertRow extends pg.QueryResultRow {
  role: LiveConnectionRole;
  expires_at: Date;
}

interface RedeemedRow extends pg.QueryResultRow {
  access_id: string;
  match_id: string;
  player_id: string;
  role: LiveConnectionRole;
  participant_generation: string | number | null;
}

interface ConnectionAccessRow extends pg.QueryResultRow {
  match_id: string;
  player_id: string;
  role: LiveConnectionRole;
  participant_generation: string | number | null;
  closed_at: Date | null;
  close_reason: string | null;
}

interface PublicActionRow extends pg.QueryResultRow {
  public_result: unknown;
}

interface LockedMatchContext {
  match: MatchRow;
  participants: readonly [ParticipantRow, ParticipantRow];
}

interface PublicSelfParticipant {
  playerName: string;
  creatures: readonly unknown[];
  powerCards: readonly unknown[];
  usedPowerCardIds: readonly string[];
  activeCreatureId: string | null;
}

interface PublicOpponentParticipant {
  playerName: string;
  activeCreature: unknown | null;
  defeatedCreatures: readonly unknown[];
  remainingCreatureCount: number;
  playedPowerCards: readonly unknown[];
  remainingPowerCardCount: number;
}

export function createLivePvpService(
  database: LivePvpDatabase,
  {
    randomInt = secureRandomInt,
    trustService,
  }: {
    randomInt?: RandomInt;
    trustService?: Pick<
      TrustService,
      'recordSubmissionConflict' | 'evaluateOpponentPatternsForMatch'
    >;
  } = {},
): LivePvpService {
  const service: LivePvpService = {
    async mintConnectionTicket(input) {
      const rawTicket = randomBytes(32).toString('base64url');
      const digest = digestTicket(rawTicket);
      try {
        const result = await database.query<TicketInsertRow>(
          `insert into private.live_pvp_connection_tickets (
             ticket_digest, match_id, player_id, role
           ) values ($1::bytea, $2::uuid, $3::uuid, $4)
           returning role, expires_at`,
          [digest, input.matchId, input.playerId, input.requestedRole],
        );
        const ticket = result.rows[0];
        if (!ticket) throw new Error('Ticket insertion returned no row.');
        return {
          ticket: rawTicket,
          role: ticket.role,
          protocolVersion: 1,
          expiresAt: ticket.expires_at.toISOString(),
        };
      } catch (error) {
        throw mapTicketMintError(error);
      }
    },

    async redeemConnectionTicket(rawTicket) {
      const digest = digestTicket(rawTicket);
      try {
        return await withTransaction(database, async (client) => {
          const result = await client.query<RedeemedRow>(
            `select access_id::text, match_id::text, player_id::text, role,
                    participant_generation
               from private.redeem_live_pvp_connection_ticket($1::bytea)`,
            [digest],
          );
          const row = result.rows[0];
          if (!row) {
            throw new LivePvpError(
              'LIVE_AUTHENTICATION_REQUIRED',
              'The realtime connection ticket is invalid.',
            );
          }
          await notifyCurrentMatchVersion(client, row.match_id);
          return {
            accessId: row.access_id,
            matchId: row.match_id,
            playerId: row.player_id,
            role: row.role,
            participantGeneration:
              row.participant_generation === null
                ? null
                : Number(row.participant_generation),
          };
        });
      } catch (error) {
        if (error instanceof LivePvpError) throw error;
        throw mapTicketRedemptionError(error);
      }
    },

    async closeConnectionAccess(accessId, reason) {
      await withTransaction(database, async (client) => {
        const closed = await client.query<{ closed: boolean }>(
          `select private.close_live_pvp_connection_access($1::uuid, $2) as closed`,
          [accessId, reason],
        );
        if (!closed.rows[0]?.closed) return;
        const access = await client.query<{ match_id: string }>(
          `select match_id::text
             from private.live_pvp_connection_access
            where id = $1::uuid`,
          [accessId],
        );
        const matchId = access.rows[0]?.match_id;
        if (matchId) await notifyCurrentMatchVersion(client, matchId);
      });
    },

    async getProjection(input) {
      return withProjectionSnapshot(database, async (client) => {
        const context = await loadMatchContext(client, input.matchId, false);
        if (!context) throw matchNotFound();
        const participant = context.participants.find(
          (candidate) => candidate.player_id === input.playerId,
        );
        if (participant) {
          return projectParticipant(
            context,
            participant,
            await loadLatestPublicResult(
              client,
              input.matchId,
              context.match.version,
            ),
          );
        }
        if (context.match.status !== 'active') throw matchNotFound();
        return projectSpectator(
          context,
          await loadPublicHistory(client, input.matchId, context.match.version),
          await loadPresence(client, input.matchId),
        );
      });
    },

    async getProjectionForConnection(connection) {
      return withProjectionSnapshot(database, async (client) => {
        const access = await loadPersistedConnectionAccess(client, connection);
        const context = await loadMatchContext(
          client,
          connection.matchId,
          false,
        );
        if (!context) throw matchNotFound();
        validateConnectionAccessLifecycle(access, context.match.status);
        if (connection.role === 'participant') {
          const participant = context.participants.find(
            (candidate) => candidate.player_id === connection.playerId,
          );
          if (!participant) throw matchNotFound();
          if (
            connection.participantGeneration === null ||
            Number(participant.connection_generation) !==
              connection.participantGeneration
          ) {
            throw connectionSuperseded();
          }
          return projectParticipant(
            context,
            participant,
            await loadLatestPublicResult(
              client,
              connection.matchId,
              context.match.version,
            ),
          );
        }
        return projectSpectator(
          context,
          await loadPublicHistory(
            client,
            connection.matchId,
            context.match.version,
          ),
          await loadPresence(client, connection.matchId),
        );
      });
    },

    async getPresence(matchId) {
      return loadPresence(database, matchId);
    },

    async getCommittedEventMeta(matchId, committedVersion) {
      const result = await database.query<{ id: string; created_at: Date }>(
        `select id::text, created_at
           from public.live_pvp_match_actions
          where match_id = $1::uuid
            and committed_version = $2`,
        [matchId, committedVersion],
      );
      const row = result.rows[0];
      return row
        ? { eventId: row.id, createdAt: row.created_at.toISOString() }
        : null;
    },

    async submitAction(input) {
      const payloadHash = hashCanonical({
        type: 'action.submit',
        matchId: input.matchId,
        expectedVersion: input.expectedVersion,
        action: input.action,
      });
      const result = await mutateParticipant(
        database,
        input,
        'action_submit',
        payloadHash,
        trustService,
        async (client, context, actor, now, recorder) => {
          if (context.match.status === 'completed') throw matchCompleted();
          if (
            context.match.turn_deadline &&
            now >= context.match.turn_deadline
          ) {
            await applyOverdueTransition(client, context, now, randomInt);
            return { late: true } as const;
          }
          if (context.match.version !== input.expectedVersion) {
            throw new LivePvpError(
              'LIVE_VERSION_CONFLICT',
              'The match changed before this action was applied.',
              true,
            );
          }
          const actorSide = engineSide(actor.participant_side);
          if (
            !isActionLegal(context.match.battle_state, actorSide, input.action)
          ) {
            throw illegalAction();
          }
          if (!isActorAllowed(context, actor, actorSide)) throw illegalAction();

          let transition;
          try {
            transition = applyBattleAction(
              context.match.battle_state,
              actorSide,
              input.action,
              recorder.randomInt,
            );
          } catch (error) {
            if (error instanceof IllegalBattleActionError)
              throw illegalAction();
            throw error;
          }

          const eventId = randomUUID();
          const committedVersion = context.match.version + 1;
          const publicResult = publicTransitionResult(
            transition.result,
            transition.state,
            context,
            'participant_action',
          );
          await persistBattleTransition(client, {
            context,
            eventId,
            actorPlayerId: actor.player_id,
            transitionKind: 'participant_action',
            stateAfter: transition.state,
            authoritativeResult: transition.result,
            publicResult,
            randomness: recorder.values,
            participantGeneration: input.connectionGeneration,
            committedAt: now,
            timeoutActorPlayerId: null,
            resetActorTimeoutPlayerId: actor.player_id,
            completionReason: transition.state.winner ? 'defeat' : null,
          });
          return { late: false, eventId, committedVersion } as const;
        },
      );

      await evaluateOpponentPatternsSafely(trustService, input.matchId);
      if (result.kind === 'replay') {
        return {
          acknowledgement: result.acknowledgement,
          replayed: true,
          late: false,
        };
      }
      if (result.kind === 'late') {
        return {
          acknowledgement: {
            protocolVersion: 1,
            type: 'action.acknowledged',
            messageId: input.messageId,
            eventId: result.eventId,
            version: result.version,
            serverTime: result.serverTime,
          },
          replayed: false,
          late: true,
        };
      }
      return {
        acknowledgement: result.acknowledgement,
        replayed: false,
        late: false,
      };
    },

    async resign(input) {
      const payloadHash = hashCanonical({
        type: 'resign.submit',
        matchId: input.matchId,
        expectedVersion: input.expectedVersion,
      });
      const result = await mutateParticipant(
        database,
        input,
        'resign_submit',
        payloadHash,
        trustService,
        async (client, context, actor, now) => {
          if (context.match.status === 'completed') throw matchCompleted();
          if (
            context.match.turn_deadline &&
            now >= context.match.turn_deadline
          ) {
            await applyOverdueTransition(client, context, now, randomInt);
            return { late: true } as const;
          }
          if (context.match.version !== input.expectedVersion) {
            throw new LivePvpError(
              'LIVE_VERSION_CONFLICT',
              'The match changed before this resignation was applied.',
              true,
            );
          }
          const eventId = randomUUID();
          const actorSide = engineSide(actor.participant_side);
          const winnerSide = otherEngineSide(actorSide);
          const completedState: BattleState = {
            ...context.match.battle_state,
            phase: 'completed',
            currentSide: null,
            replacementSide: null,
            replacementQueue: [],
            winner: winnerSide,
          };
          await persistBattleTransition(client, {
            context,
            eventId,
            actorPlayerId: actor.player_id,
            transitionKind: 'voluntary_resignation',
            stateAfter: completedState,
            authoritativeResult: {
              type: 'voluntary_resignation',
              losingSide: actorSide,
              winner: winnerSide,
            },
            publicResult: {
              type: 'voluntary_resignation',
              loser: publicSide(actorSide),
              winner: publicSide(winnerSide),
            },
            randomness: [],
            participantGeneration: input.connectionGeneration,
            committedAt: now,
            timeoutActorPlayerId: null,
            resetActorTimeoutPlayerId: null,
            completionReason: 'voluntary_resignation',
          });
          return {
            late: false,
            eventId,
            committedVersion: context.match.version + 1,
          } as const;
        },
      );
      await evaluateOpponentPatternsSafely(trustService, input.matchId);
      if (result.kind === 'replay') {
        return {
          acknowledgement: result.acknowledgement,
          replayed: true,
          late: false,
        };
      }
      if (result.kind === 'late') {
        return {
          acknowledgement: {
            protocolVersion: 1,
            type: 'action.acknowledged',
            messageId: input.messageId,
            eventId: result.eventId,
            version: result.version,
            serverTime: result.serverTime,
          },
          replayed: false,
          late: true,
        };
      }
      return {
        acknowledgement: result.acknowledgement,
        replayed: false,
        late: false,
      };
    },

    async processOverdueMatch(matchId) {
      const result = await withTransaction(database, async (client) => {
        const context = await loadMatchContext(client, matchId, true);
        if (!context || context.match.status !== 'active') {
          return { transitioned: false, matchId };
        }
        const now = await databaseNow(client);
        if (!context.match.turn_deadline || now < context.match.turn_deadline) {
          return { transitioned: false, matchId };
        }
        const previousVersion = context.match.version;
        await applyOverdueTransition(client, context, now, randomInt);
        return {
          transitioned: true,
          matchId,
          previousVersion,
          version: previousVersion + 1,
          completed: await isMatchCompleted(client, matchId),
        };
      });
      if (result.transitioned && result.completed) {
        await evaluateOpponentPatternsSafely(trustService, matchId);
      }
      return result;
    },

    async processOverdueUntilCurrent(matchId) {
      for (
        let index = 0;
        index < LIVE_PVP_MAX_CATCH_UP_TRANSITIONS;
        index += 1
      ) {
        const result = await service.processOverdueMatch(matchId);
        if (!result.transitioned || result.completed) return;
      }
    },

    async listDueMatchIds(limit = 25) {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const result = await database.query<{ id: string }>(
        `select id::text
           from public.live_pvp_matches
          where status = 'active'
            and turn_deadline <= clock_timestamp()
          order by turn_deadline, id
          limit $1`,
        [safeLimit],
      );
      return result.rows.map((row) => row.id);
    },

    async purgeTransientAccess() {
      const result = await database.query<{
        access_rows_deleted: number;
        ticket_rows_deleted: number;
      }>(
        `select access_rows_deleted, ticket_rows_deleted
           from private.purge_live_pvp_transient_access()`,
      );
      const row = result.rows[0];
      return {
        accessRowsDeleted: Number(row?.access_rows_deleted ?? 0),
        ticketRowsDeleted: Number(row?.ticket_rows_deleted ?? 0),
      };
    },

    async finalizeAccountDeletion(client, playerId) {
      const connectionMatches = await client.query<{ match_id: string }>(
        `select distinct match_id::text
           from private.live_pvp_connection_access
          where player_id = $1::uuid
            and closed_at is null
          order by match_id`,
        [playerId],
      );
      const matches = await client.query<{ id: string }>(
        `select match.id::text
           from public.live_pvp_matches match
           join public.live_pvp_match_participants participant
             on participant.match_id = match.id
          where participant.player_id = $1::uuid
            and match.status = 'active'
          order by match.id`,
        [playerId],
      );
      for (const { id: matchId } of matches.rows) {
        let context = await loadMatchContext(client, matchId, true);
        if (!context || context.match.status !== 'active') continue;
        const now = await databaseNow(client);
        for (
          let index = 0;
          index < LIVE_PVP_MAX_CATCH_UP_TRANSITIONS;
          index += 1
        ) {
          if (
            !context ||
            context.match.status !== 'active' ||
            context.match.turn_deadline === null ||
            now < context.match.turn_deadline
          ) {
            break;
          }
          await applyOverdueTransition(client, context, now, randomInt);
          context = await loadMatchContext(client, matchId, true);
        }
        if (!context || context.match.status !== 'active') continue;
        if (context.match.turn_deadline && now >= context.match.turn_deadline) {
          throw new Error(
            'Live PvP deadline catch-up did not converge before account deletion.',
          );
        }
        const actor = context.participants.find(
          (participant) => participant.player_id === playerId,
        );
        if (!actor) continue;
        const losingSide = engineSide(actor.participant_side);
        const winnerSide = otherEngineSide(losingSide);
        const completedState: BattleState = {
          ...context.match.battle_state,
          phase: 'completed',
          currentSide: null,
          replacementSide: null,
          replacementQueue: [],
          winner: winnerSide,
        };
        await persistBattleTransition(client, {
          context,
          eventId: randomUUID(),
          actorPlayerId: null,
          transitionKind: 'account_deletion_forfeit',
          stateAfter: completedState,
          authoritativeResult: {
            type: 'account_deletion_forfeit',
            losingSide,
            winner: winnerSide,
          },
          publicResult: {
            type: 'account_deletion_forfeit',
            loser: publicSide(losingSide),
            winner: publicSide(winnerSide),
          },
          randomness: [],
          participantGeneration: null,
          committedAt: now,
          timeoutActorPlayerId: null,
          resetActorTimeoutPlayerId: null,
          completionReason: 'account_deletion_forfeit',
        });
      }

      // Account deletion removes the deleting player's transient access rows
      // later in this same transaction. Presence notifications are delivered
      // only after commit, so every gateway instance revalidates any local
      // sockets against the post-deletion database state before fan-out.
      for (const { match_id: matchId } of connectionMatches.rows) {
        await notifyCurrentMatchVersion(client, matchId);
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
    // Realtime completion/replay remains authoritative. Periodic trust
    // maintenance retries pattern derivation after transient failures.
  }
}

async function mutateParticipant(
  database: LivePvpDatabase,
  input: LivePvpMutationInput,
  operation: 'action_submit' | 'resign_submit',
  payloadHash: string,
  trustService: Pick<TrustService, 'recordSubmissionConflict'> | undefined,
  operationBody: (
    client: LivePvpDatabaseClient,
    context: LockedMatchContext,
    actor: ParticipantRow,
    now: Date,
    recorder: ReturnType<typeof createRandomRecorder>,
  ) => Promise<
    { late: true } | { late: false; eventId: string; committedVersion: number }
  >,
): Promise<
  | {
      kind: 'replay';
      acknowledgement: LivePvpMutationResult['acknowledgement'];
    }
  | { kind: 'late'; eventId: string; version: number; serverTime: string }
  | {
      kind: 'committed';
      acknowledgement: LivePvpMutationResult['acknowledgement'];
    }
> {
  try {
    return await runMutationTransaction();
  } catch (error) {
    if (
      error instanceof LivePvpError &&
      error.code === 'LIVE_IDEMPOTENCY_CONFLICT'
    ) {
      try {
        await trustService?.recordSubmissionConflict({
          playerId: input.playerId,
          operation: `live_pvp_${operation}`,
          resourceIdentifier: input.matchId,
          submissionId: input.messageId,
        });
      } catch {
        // Preserve the realtime protocol conflict. A retry can attempt trust
        // ingestion again without changing the committed match state.
      }
    }
    throw error;
  }

  async function runMutationTransaction() {
    return withTransaction(database, async (client) => {
      const context = await loadMatchContext(client, input.matchId, true);
      if (!context) throw matchNotFound();
      const actor = context.participants.find(
        (participant) => participant.player_id === input.playerId,
      );
      if (!actor) throw forbiddenAction();
      if (Number(actor.connection_generation) !== input.connectionGeneration) {
        throw connectionSuperseded();
      }

      const receipt = await loadReceipt(client, input, operation);
      if (receipt) {
        if (receipt.payload_hash !== payloadHash) {
          throw new LivePvpError(
            'LIVE_IDEMPOTENCY_CONFLICT',
            'This message ID was already used with a different payload.',
          );
        }
        return {
          kind: 'replay' as const,
          acknowledgement: receipt.committed_acknowledgement,
        };
      }

      const now = await databaseNow(client);
      const recorder = createRandomRecorder();
      const outcome = await operationBody(
        client,
        context,
        actor,
        now,
        recorder,
      );
      if (!('eventId' in outcome)) {
        const latest = await loadMatchContext(client, input.matchId, false);
        if (!latest) throw matchNotFound();
        const action = await client.query<{ id: string; created_at: Date }>(
          `select id::text, created_at
             from public.live_pvp_match_actions
            where match_id = $1::uuid
              and committed_version = $2
            limit 1`,
          [input.matchId, latest.match.version],
        );
        const row = action.rows[0];
        if (!row)
          throw new Error('Late transition did not persist a public action.');
        return {
          kind: 'late' as const,
          eventId: row.id,
          version: latest.match.version,
          serverTime: row.created_at.toISOString(),
        };
      }

      const acknowledgement: LivePvpMutationResult['acknowledgement'] = {
        protocolVersion: 1,
        type: 'action.acknowledged',
        messageId: input.messageId,
        eventId: outcome.eventId,
        version: outcome.committedVersion,
        serverTime: now.toISOString(),
      };
      await client.query(
        `insert into private.live_pvp_submission_receipts (
           match_id, actor_player_id, operation, message_id, expected_version,
           connection_generation, payload_hash, committed_event_id,
           committed_acknowledgement
         ) values (
           $1::uuid, $2::uuid, $3, $4::uuid, $5,
           $6, $7, $8::uuid, $9::jsonb
         )`,
        [
          input.matchId,
          input.playerId,
          operation,
          input.messageId,
          input.expectedVersion,
          input.connectionGeneration,
          payloadHash,
          outcome.eventId,
          JSON.stringify(acknowledgement),
        ],
      );
      return { kind: 'committed' as const, acknowledgement };
    });
  }
}

async function applyOverdueTransition(
  client: LivePvpDatabaseClient,
  context: LockedMatchContext,
  now: Date,
  randomInt: RandomInt,
): Promise<void> {
  const required = requiredParticipant(context);
  if (!required) return;
  const nextTimeoutCount = required.consecutive_timeout_count + 1;
  const requiredSide = engineSide(required.participant_side);

  if (nextTimeoutCount >= MAX_TIMEOUT_STRIKES) {
    const winnerSide = otherEngineSide(requiredSide);
    const completedState: BattleState = {
      ...context.match.battle_state,
      phase: 'completed',
      currentSide: null,
      replacementSide: null,
      replacementQueue: [],
      winner: winnerSide,
    };
    await persistBattleTransition(client, {
      context,
      eventId: randomUUID(),
      actorPlayerId: null,
      transitionKind: 'abandonment_forfeit',
      stateAfter: completedState,
      authoritativeResult: {
        type: 'abandonment_forfeit',
        losingSide: requiredSide,
        winner: winnerSide,
      },
      publicResult: {
        type: 'abandonment_forfeit',
        loser: publicSide(requiredSide),
        winner: publicSide(winnerSide),
      },
      randomness: [],
      participantGeneration: null,
      committedAt: now,
      nextDecisionStartedAt: context.match.turn_deadline ?? now,
      timeoutActorPlayerId: required.player_id,
      resetActorTimeoutPlayerId: null,
      completionReason: 'abandonment_forfeit',
    });
    return;
  }

  const recorder = createRandomRecorder(randomInt);
  let action: BattleAction;
  let transitionKind:
    'automatic_initial_selection' | 'automatic_replacement' | 'timeout';

  if (context.match.battle_state.phase === 'initial_selection') {
    const legal = getLegalActions(
      context.match.battle_state,
      requiredSide,
    ).filter((candidate) => candidate.type === 'select_initial_creature');
    action = pickLegalAction(legal, recorder.randomInt);
    transitionKind = 'automatic_initial_selection';
  } else if (context.match.battle_state.phase === 'replacement') {
    const legal = getLegalActions(
      context.match.battle_state,
      requiredSide,
    ).filter((candidate) => candidate.type === 'select_replacement');
    action = pickLegalAction(legal, recorder.randomInt);
    transitionKind = 'automatic_replacement';
  } else {
    action = { type: 'timeout' };
    transitionKind = 'timeout';
  }

  const transition = applyBattleAction(
    context.match.battle_state,
    requiredSide,
    action,
    recorder.randomInt,
  );
  await persistBattleTransition(client, {
    context,
    eventId: randomUUID(),
    actorPlayerId: null,
    transitionKind,
    stateAfter: transition.state,
    authoritativeResult: transition.result,
    publicResult: publicTransitionResult(
      transition.result,
      transition.state,
      context,
      transitionKind,
    ),
    randomness: recorder.values,
    participantGeneration: null,
    committedAt: now,
    nextDecisionStartedAt: context.match.turn_deadline ?? now,
    timeoutActorPlayerId: required.player_id,
    resetActorTimeoutPlayerId: null,
    completionReason: transition.state.winner ? 'defeat' : null,
  });
}

async function persistBattleTransition(
  client: LivePvpDatabaseClient,
  input: {
    context: LockedMatchContext;
    eventId: string;
    actorPlayerId: string | null;
    transitionKind:
      | 'participant_action'
      | 'automatic_initial_selection'
      | 'automatic_replacement'
      | 'timeout'
      | 'abandonment_forfeit'
      | 'voluntary_resignation'
      | 'account_deletion_forfeit';
    stateAfter: BattleState;
    authoritativeResult: unknown;
    publicResult: unknown;
    randomness: readonly { maxExclusive: number; value: number }[];
    participantGeneration: number | null;
    committedAt: Date;
    nextDecisionStartedAt?: Date;
    timeoutActorPlayerId: string | null;
    resetActorTimeoutPlayerId: string | null;
    completionReason: LiveCompletionReason | null;
  },
): Promise<void> {
  const { context } = input;
  const previousVersion = context.match.version;
  const committedVersion = previousVersion + 1;
  const terminal =
    input.completionReason !== null || input.stateAfter.phase === 'completed';
  const winnerPlayerId = input.stateAfter.winner
    ? playerIdForEngineSide(context, input.stateAfter.winner)
    : null;

  let currentActorPlayerId: string | null = null;
  let decisionStartedAt: Date | null = null;
  let turnDeadline: Date | null = null;
  if (!terminal) {
    currentActorPlayerId = requiredPlayerIdForState(context, input.stateAfter);
    const preserveInitialDeadline =
      context.match.phase === 'initial_selection' &&
      input.stateAfter.phase === 'initial_selection';
    if (preserveInitialDeadline) {
      decisionStartedAt = context.match.decision_started_at;
      turnDeadline = context.match.turn_deadline;
    } else {
      decisionStartedAt = input.nextDecisionStartedAt ?? input.committedAt;
      turnDeadline = new Date(decisionStartedAt.getTime() + DECISION_WINDOW_MS);
    }
  }

  await client.query(
    `update public.live_pvp_matches
        set status = $2,
            version = $3,
            phase = $4,
            current_actor_player_id = $5::uuid,
            decision_started_at = $6::timestamptz,
            turn_deadline = $7::timestamptz,
            winner_player_id = $8::uuid,
            completion_reason = $9,
            completed_at = $10::timestamptz,
            updated_at = $11::timestamptz
      where id = $1::uuid`,
    [
      context.match.id,
      terminal ? 'completed' : 'active',
      committedVersion,
      terminal ? 'completed' : input.stateAfter.phase,
      currentActorPlayerId,
      decisionStartedAt,
      turnDeadline,
      terminal ? winnerPlayerId : null,
      terminal ? (input.completionReason ?? 'defeat') : null,
      terminal ? input.committedAt : null,
      input.committedAt,
    ],
  );

  await client.query(
    `update private.live_pvp_match_states
        set version = $2,
            battle_state = $3::jsonb,
            updated_at = $4::timestamptz
      where match_id = $1::uuid`,
    [
      context.match.id,
      committedVersion,
      JSON.stringify(input.stateAfter),
      input.committedAt,
    ],
  );

  if (input.timeoutActorPlayerId) {
    await client.query(
      `update public.live_pvp_match_participants
          set consecutive_timeout_count = least(3, consecutive_timeout_count + 1),
              updated_at = greatest(updated_at, $3::timestamptz)
        where match_id = $1::uuid
          and player_id = $2::uuid`,
      [context.match.id, input.timeoutActorPlayerId, input.committedAt],
    );
  }
  if (input.resetActorTimeoutPlayerId) {
    await client.query(
      `update public.live_pvp_match_participants
          set consecutive_timeout_count = 0,
              updated_at = greatest(updated_at, $3::timestamptz)
        where match_id = $1::uuid
          and player_id = $2::uuid`,
      [context.match.id, input.resetActorTimeoutPlayerId, input.committedAt],
    );
  }

  if (terminal) {
    await client.query(
      `update public.live_pvp_match_participants
          set outcome = case when player_id = $2::uuid then 'win' else 'loss' end,
              updated_at = greatest(updated_at, $3::timestamptz)
        where match_id = $1::uuid`,
      [context.match.id, winnerPlayerId, input.committedAt],
    );
  }

  await client.query(
    `insert into public.live_pvp_match_actions (
       id, match_id, sequence, previous_version, committed_version,
       transition_kind, actor_player_id, public_result, created_at
     ) values (
       $1::uuid, $2::uuid, $3, $4, $3,
       $5, $6::uuid, $7::jsonb, $8::timestamptz
     )`,
    [
      input.eventId,
      context.match.id,
      committedVersion,
      previousVersion,
      input.transitionKind,
      input.actorPlayerId,
      JSON.stringify(input.publicResult),
      input.committedAt,
    ],
  );

  await client.query(
    `insert into private.live_pvp_match_transitions (
       action_id, match_id, state_before, state_after,
       authoritative_result, server_randomness,
       participant_connection_generation, created_at
     ) values (
       $1::uuid, $2::uuid, $3::jsonb, $4::jsonb,
       $5::jsonb, $6::jsonb, $7, $8::timestamptz
     )`,
    [
      input.eventId,
      context.match.id,
      JSON.stringify(context.match.battle_state),
      JSON.stringify(input.stateAfter),
      JSON.stringify(input.authoritativeResult),
      JSON.stringify({ draws: input.randomness }),
      input.participantGeneration,
      input.committedAt,
    ],
  );

  if (terminal) {
    await client.query(
      `insert into private.live_pvp_completion_sources (
         match_id, player_id, outcome, completion_reason, occurred_at
       )
       select participant.match_id,
              participant.player_id,
              participant.outcome,
              $2,
              $3::timestamptz
         from public.live_pvp_match_participants participant
        where participant.match_id = $1::uuid`,
      [context.match.id, input.completionReason ?? 'defeat', input.committedAt],
    );
  }

  await client.query(
    `select pg_notify(
       $1,
       json_build_object('matchId', $2::text, 'version', $3::integer)::text
     )`,
    [LIVE_PVP_NOTIFY_CHANNEL, context.match.id, committedVersion],
  );
}

async function loadMatchContext(
  client: LivePvpDatabaseClient,
  matchId: string,
  forUpdate: boolean,
): Promise<LockedMatchContext | null> {
  const matchResult = await client.query<MatchRow>(
    `select match.id::text,
            match.status,
            match.version,
            match.phase,
            match.current_actor_player_id::text,
            match.decision_started_at,
            match.turn_deadline,
            match.winner_player_id::text,
            match.completion_reason,
            match.started_at,
            match.updated_at,
            match.completed_at,
            state.battle_state
       from public.live_pvp_matches match
       join private.live_pvp_match_states state
         on state.match_id = match.id
      where match.id = $1::uuid
      ${forUpdate ? 'for update of match' : ''}`,
    [matchId],
  );
  const match = matchResult.rows[0];
  if (!match) return null;
  const participantResult = await client.query<ParticipantRow>(
    `select participant.player_id::text,
            participant.participant_side,
            participant.consecutive_timeout_count,
            participant.connection_generation,
            participant.outcome,
            player.player_name
       from public.live_pvp_match_participants participant
       join public.players player on player.id = participant.player_id
      where participant.match_id = $1::uuid
      order by participant.participant_side
      ${forUpdate ? 'for update of participant' : ''}`,
    [matchId],
  );
  if (participantResult.rows.length !== 2) {
    throw new Error(
      'Live PvP match does not contain exactly two participants.',
    );
  }
  return {
    match,
    participants: [participantResult.rows[0]!, participantResult.rows[1]!],
  };
}

async function loadReceipt(
  client: LivePvpDatabaseClient,
  input: LivePvpMutationInput,
  operation: 'action_submit' | 'resign_submit',
): Promise<ReceiptRow | null> {
  const result = await client.query<ReceiptRow>(
    `select payload_hash, committed_acknowledgement
       from private.live_pvp_submission_receipts
      where match_id = $1::uuid
        and actor_player_id = $2::uuid
        and operation = $3
        and message_id = $4::uuid`,
    [input.matchId, input.playerId, operation, input.messageId],
  );
  return result.rows[0] ?? null;
}

async function loadPersistedConnectionAccess(
  client: LivePvpDatabaseClient,
  connection: RedeemedLivePvpConnection,
): Promise<ConnectionAccessRow> {
  const result = await client.query<ConnectionAccessRow>(
    `select match_id::text,
            player_id::text,
            role,
            participant_generation,
            closed_at,
            close_reason
       from private.live_pvp_connection_access
      where id = $1::uuid`,
    [connection.accessId],
  );
  const access = result.rows[0];
  if (
    !access ||
    access.match_id !== connection.matchId ||
    access.player_id !== connection.playerId ||
    access.role !== connection.role
  ) {
    throw connectionAuthorizationRequired();
  }

  const expectedGeneration = connection.participantGeneration;
  const persistedGeneration =
    access.participant_generation === null
      ? null
      : Number(access.participant_generation);
  if (persistedGeneration !== expectedGeneration) {
    throw connectionSuperseded();
  }
  if (access.closed_at !== null && access.close_reason === 'superseded') {
    throw connectionSuperseded();
  }
  if (access.closed_at !== null && access.close_reason !== 'match_completed') {
    throw connectionAuthorizationRequired();
  }
  return access;
}

function validateConnectionAccessLifecycle(
  access: ConnectionAccessRow,
  matchStatus: MatchRow['status'],
): void {
  if (access.closed_at === null) return;
  if (
    matchStatus === 'completed' &&
    access.close_reason === 'match_completed'
  ) {
    return;
  }
  throw connectionAuthorizationRequired();
}

async function loadPresence(
  database: Pick<LivePvpDatabase, 'query'> | LivePvpDatabaseClient,
  matchId: string,
): Promise<LivePvpSpectatorProjection['presence']> {
  const result = await database.query<{
    player_one_connected: boolean;
    player_two_connected: boolean;
    spectator_count: string | number;
  }>(
    `select
       exists (
         select 1
           from private.live_pvp_connection_access access
           join public.live_pvp_match_participants participant
             on participant.match_id = access.match_id
            and participant.player_id = access.player_id
          where access.match_id = $1::uuid
            and access.role = 'participant'
            and access.closed_at is null
            and participant.participant_side = 'player_one'
       ) as player_one_connected,
       exists (
         select 1
           from private.live_pvp_connection_access access
           join public.live_pvp_match_participants participant
             on participant.match_id = access.match_id
            and participant.player_id = access.player_id
          where access.match_id = $1::uuid
            and access.role = 'participant'
            and access.closed_at is null
            and participant.participant_side = 'player_two'
       ) as player_two_connected,
       (select count(*)::text
          from private.live_pvp_connection_access access
         where access.match_id = $1::uuid
           and access.role = 'spectator'
           and access.closed_at is null) as spectator_count`,
    [matchId],
  );
  const row = result.rows[0];
  return {
    playerOneConnected: row?.player_one_connected ?? false,
    playerTwoConnected: row?.player_two_connected ?? false,
    spectatorCount: Number(row?.spectator_count ?? 0),
  };
}

async function loadLatestPublicResult(
  client: LivePvpDatabaseClient,
  matchId: string,
  throughVersion: number,
): Promise<unknown | null> {
  const result = await client.query<PublicActionRow>(
    `select public_result
       from public.live_pvp_match_actions
      where match_id = $1::uuid
        and committed_version <= $2
      order by sequence desc
      limit 1`,
    [matchId, throughVersion],
  );
  return result.rows[0]?.public_result ?? null;
}

async function loadPublicHistory(
  client: LivePvpDatabaseClient,
  matchId: string,
  throughVersion: number,
): Promise<readonly unknown[]> {
  const result = await client.query<PublicActionRow>(
    `select public_result
       from public.live_pvp_match_actions
      where match_id = $1::uuid
        and committed_version <= $2
      order by sequence`,
    [matchId, throughVersion],
  );
  return result.rows.map((row) => row.public_result);
}

function projectParticipant(
  context: LockedMatchContext,
  viewer: ParticipantRow,
  lastAction: unknown | null,
): LivePvpParticipantProjection {
  const viewerSide = engineSide(viewer.participant_side);
  const opponentRow = context.participants.find(
    (participant) => participant.player_id !== viewer.player_id,
  )!;
  const opponentSide = engineSide(opponentRow.participant_side);
  const state = context.match.battle_state;
  const self = state.participants[viewerSide];
  const opponent = state.participants[opponentSide];
  const currentActor =
    context.match.current_actor_player_id === null
      ? null
      : context.match.current_actor_player_id === viewer.player_id
        ? 'self'
        : 'opponent';
  const legalActions =
    context.match.status === 'active' &&
    canViewerAct(context, viewer, viewerSide)
      ? getLegalActions(state, viewerSide).filter(isLiveClientAction)
      : [];

  return {
    matchId: context.match.id,
    mode: 'live',
    role: 'participant',
    status: context.match.status,
    version: context.match.version,
    phase: context.match.phase,
    turnNumber: state.turnNumber,
    currentActor,
    turnDeadline: context.match.turn_deadline?.toISOString() ?? null,
    consecutiveTimeouts: {
      self: viewer.consecutive_timeout_count,
      opponent: opponentRow.consecutive_timeout_count,
    },
    self: {
      playerName: viewer.player_name ?? 'Deleted player',
      creatures: self.creatures.map(publicCreature),
      powerCards: self.powerCards.map((card) =>
        publicPowerCard(card, self.usedPowerCardIds),
      ),
      usedPowerCardIds: [...self.usedPowerCardIds],
      activeCreatureId: self.activeCreatureId,
    },
    opponent: opponentProjection(opponentRow, opponent),
    legalActions,
    lastAction,
    outcome: viewer.outcome,
    completionReason: context.match.completion_reason,
    startedAt: context.match.started_at.toISOString(),
    updatedAt: context.match.updated_at.toISOString(),
    completedAt: context.match.completed_at?.toISOString() ?? null,
  };
}

function projectSpectator(
  context: LockedMatchContext,
  history: readonly unknown[],
  presence: LivePvpSpectatorProjection['presence'],
): LivePvpSpectatorProjection {
  const one = context.participants.find(
    (participant) => participant.participant_side === 'player_one',
  )!;
  const two = context.participants.find(
    (participant) => participant.participant_side === 'player_two',
  )!;
  const state = context.match.battle_state;
  const winner =
    context.match.winner_player_id === null
      ? null
      : context.match.winner_player_id === one.player_id
        ? 'playerOne'
        : 'playerTwo';
  const currentActor =
    context.match.current_actor_player_id === null
      ? null
      : context.match.current_actor_player_id === one.player_id
        ? 'playerOne'
        : 'playerTwo';
  return {
    matchId: context.match.id,
    mode: 'live',
    role: 'spectator',
    status: context.match.status,
    version: context.match.version,
    phase: context.match.phase,
    turnNumber: state.turnNumber,
    currentActor,
    turnDeadline: context.match.turn_deadline?.toISOString() ?? null,
    consecutiveTimeouts: {
      playerOne: one.consecutive_timeout_count,
      playerTwo: two.consecutive_timeout_count,
    },
    playerOne: opponentProjection(one, state.participants.player),
    playerTwo: opponentProjection(two, state.participants.cpu),
    history,
    presence,
    completionReason: context.match.completion_reason,
    winner,
    startedAt: context.match.started_at.toISOString(),
    updatedAt: context.match.updated_at.toISOString(),
    completedAt: context.match.completed_at?.toISOString() ?? null,
  };
}

function opponentProjection(
  participant: ParticipantRow,
  state: BattleState['participants'][BattleSide],
): PublicOpponentParticipant {
  return {
    playerName: participant.player_name ?? 'Deleted player',
    activeCreature:
      state.activeCreatureId === null
        ? null
        : publicCreature(
            state.creatures.find(
              (creature) => creature.card.id === state.activeCreatureId,
            )!,
          ),
    defeatedCreatures: state.creatures
      .filter((creature) => creature.defeated)
      .map(publicCreature),
    remainingCreatureCount: state.creatures.filter(
      (creature) =>
        !creature.defeated && creature.card.id !== state.activeCreatureId,
    ).length,
    playedPowerCards: state.powerCards
      .filter((card) => state.usedPowerCardIds.includes(card.id))
      .map((card) => publicPowerCard(card, state.usedPowerCardIds)),
    remainingPowerCardCount:
      state.powerCards.length - state.usedPowerCardIds.length,
  };
}

function publicCreature(
  creature: BattleState['participants'][BattleSide]['creatures'][number],
): unknown {
  return {
    id: creature.card.id,
    name: `${titleCase(creature.card.affinity)} Creature`,
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

function publicPowerCard(
  card: BattleState['participants'][BattleSide]['powerCards'][number],
  usedIds: readonly string[],
): unknown {
  return {
    id: card.id,
    name: card.affinity
      ? `${titleCase(card.affinity)} Power card`
      : 'Power card',
    affinity: card.affinity,
    effects: card.effects.map(publicEffect),
    available: !usedIds.includes(card.id),
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

function publicTransitionResult(
  result: BattleActionResult,
  stateAfter: BattleState,
  _context: LockedMatchContext,
  transitionKind:
    | 'participant_action'
    | 'automatic_initial_selection'
    | 'automatic_replacement'
    | 'timeout',
): unknown {
  if (
    (result.action.type === 'select_initial_creature' ||
      transitionKind === 'automatic_initial_selection') &&
    stateAfter.phase === 'initial_selection'
  ) {
    return {
      type: 'initial_selection_submitted',
      side: publicSide(result.side),
      automatic: transitionKind === 'automatic_initial_selection',
    };
  }
  return {
    type: transitionKind,
    side: publicSide(result.side),
    action: result.action,
    defeatedCreatureId: result.defeatedCreatureId,
    winner: result.winner === null ? null : publicSide(result.winner),
    turnEnded: result.turnEnded,
    effects: result.effects.map((effect) => ({
      effectId: effect.effectId,
      effectType: effect.effectType,
      targetSide: publicSide(effect.targetSide),
      targetCreatureId: effect.targetCreatureId,
      amount: effect.amount,
      damageMultiplier: effect.damageMultiplier,
    })),
  };
}

function requiredParticipant(
  context: LockedMatchContext,
): ParticipantRow | null {
  const state = context.match.battle_state;
  if (state.phase === 'initial_selection') {
    for (const participant of context.participants) {
      if (state.selections[engineSide(participant.participant_side)] === null) {
        return participant;
      }
    }
    return null;
  }
  const requiredSide =
    state.phase === 'replacement' ? state.replacementSide : state.currentSide;
  if (!requiredSide) return null;
  return (
    context.participants.find(
      (participant) =>
        engineSide(participant.participant_side) === requiredSide,
    ) ?? null
  );
}

function requiredPlayerIdForState(
  context: LockedMatchContext,
  state: BattleState,
): string | null {
  if (state.phase === 'initial_selection' || state.phase === 'completed') {
    return null;
  }
  const requiredSide =
    state.phase === 'replacement' ? state.replacementSide : state.currentSide;
  return requiredSide ? playerIdForEngineSide(context, requiredSide) : null;
}

function playerIdForEngineSide(
  context: LockedMatchContext,
  side: BattleSide,
): string {
  const participantSide: LiveParticipantSide =
    side === 'player' ? 'player_one' : 'player_two';
  const participant = context.participants.find(
    (candidate) => candidate.participant_side === participantSide,
  );
  if (!participant)
    throw new Error(`Missing live PvP participant for ${side}.`);
  return participant.player_id;
}

function canViewerAct(
  context: LockedMatchContext,
  participant: ParticipantRow,
  side: BattleSide,
): boolean {
  if (context.match.status !== 'active') return false;
  const state = context.match.battle_state;
  if (state.phase === 'initial_selection') {
    return state.selections[side] === null;
  }
  if (state.phase === 'replacement') return state.replacementSide === side;
  return (
    state.phase === 'active' &&
    context.match.current_actor_player_id === participant.player_id
  );
}

function isActorAllowed(
  context: LockedMatchContext,
  actor: ParticipantRow,
  actorSide: BattleSide,
): boolean {
  return canViewerAct(context, actor, actorSide);
}

function isActionLegal(
  state: BattleState,
  side: BattleSide,
  action: LiveClientAction,
): boolean {
  return getLegalActions(state, side).some(
    (legal) => stableJson(legal) === stableJson(action),
  );
}

function isLiveClientAction(action: BattleAction): action is LiveClientAction {
  return action.type !== 'timeout';
}

function pickLegalAction(
  actions: readonly BattleAction[],
  randomInt: RandomInt,
): BattleAction {
  if (actions.length === 0) throw illegalAction();
  const index = randomInt(actions.length);
  const action = actions[index];
  if (!action) throw new Error('Random live PvP action index was unavailable.');
  return action;
}

function createRandomRecorder(base: RandomInt = secureRandomInt) {
  const values: Array<{ maxExclusive: number; value: number }> = [];
  return {
    values,
    randomInt(maxExclusive: number) {
      const value = base(maxExclusive);
      values.push({ maxExclusive, value });
      return value;
    },
  };
}

async function notifyCurrentMatchVersion(
  client: LivePvpDatabaseClient,
  matchId: string,
): Promise<void> {
  const version = await client.query<{ version: number }>(
    `select version
       from public.live_pvp_matches
      where id = $1::uuid`,
    [matchId],
  );
  const currentVersion = version.rows[0]?.version;
  if (currentVersion === undefined) return;
  await client.query(
    `select pg_notify(
       $1,
       json_build_object('matchId', $2::text, 'version', $3::integer)::text
     )`,
    [LIVE_PVP_PRESENCE_NOTIFY_CHANNEL, matchId, currentVersion],
  );
}

async function databaseNow(client: LivePvpDatabaseClient): Promise<Date> {
  const result = await client.query<{ now: Date }>(
    `select clock_timestamp() as now`,
  );
  const now = result.rows[0]?.now;
  if (!now) throw new Error('Database did not return authoritative time.');
  return now;
}

async function withTransaction<T>(
  database: Pick<LivePvpDatabase, 'connect'>,
  operation: (client: LivePvpDatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function withProjectionSnapshot<T>(
  database: Pick<LivePvpDatabase, 'connect'>,
  operation: (client: LivePvpDatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query(
      'begin transaction isolation level repeatable read read only',
    );
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function isMatchCompleted(
  client: LivePvpDatabaseClient,
  matchId: string,
): Promise<boolean> {
  const result = await client.query<{ status: 'active' | 'completed' }>(
    `select status from public.live_pvp_matches where id = $1::uuid`,
    [matchId],
  );
  return result.rows[0]?.status === 'completed';
}

function digestTicket(ticket: string): Buffer {
  return createHash('sha256').update(ticket, 'utf8').digest();
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function engineSide(side: LiveParticipantSide): BattleSide {
  return side === 'player_one' ? 'player' : 'cpu';
}

function publicSide(side: BattleSide): 'playerOne' | 'playerTwo' {
  return side === 'player' ? 'playerOne' : 'playerTwo';
}

function otherEngineSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'cpu' : 'player';
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function connectionAuthorizationRequired(): LivePvpError {
  return new LivePvpError(
    'LIVE_AUTHENTICATION_REQUIRED',
    'The realtime connection is no longer authorized.',
  );
}

function connectionSuperseded(): LivePvpError {
  return new LivePvpError(
    'LIVE_CONNECTION_SUPERSEDED',
    'A newer participant connection is authoritative for this match.',
  );
}

function matchNotFound(): LivePvpError {
  return new LivePvpError(
    'LIVE_MATCH_NOT_FOUND',
    'The live match is unavailable.',
  );
}

function matchCompleted(): LivePvpError {
  return new LivePvpError(
    'LIVE_MATCH_COMPLETED',
    'Completed live matches cannot receive new intents.',
  );
}

function forbiddenAction(): LivePvpError {
  return new LivePvpError(
    'LIVE_ACTION_FORBIDDEN',
    'This connection cannot perform participant operations.',
  );
}

function illegalAction(): LivePvpError {
  return new LivePvpError(
    'LIVE_ACTION_ILLEGAL',
    'The intended action is not legal in the current match state.',
  );
}

function mapTicketMintError(error: unknown): Error {
  const db = databaseError(error);
  if (db?.code === '23514') {
    if (db.message.includes('participant cannot mint a spectator')) {
      return forbiddenAction();
    }
    return matchNotFound();
  }
  return error instanceof Error ? error : new Error('Ticket minting failed.');
}

function mapTicketRedemptionError(error: unknown): Error {
  const db = databaseError(error);
  if (!db)
    return error instanceof Error
      ? error
      : new Error('Ticket redemption failed.');
  if (db.code === '22023' && db.message.includes('expired')) {
    return new LivePvpError(
      'LIVE_TICKET_EXPIRED',
      'The realtime connection ticket expired before redemption.',
    );
  }
  if (db.code === '23505' && db.message.includes('already been redeemed')) {
    return new LivePvpError(
      'LIVE_TICKET_ALREADY_USED',
      'The realtime connection ticket has already been used.',
    );
  }
  return new LivePvpError(
    'LIVE_AUTHENTICATION_REQUIRED',
    'The realtime connection ticket is invalid or unavailable.',
  );
}

function databaseError(
  error: unknown,
): { code?: string; message: string } | null {
  if (!(error instanceof Error)) return null;
  const code = (error as NodeJS.ErrnoException).code;
  return { code, message: error.message.toLowerCase() };
}

export { LIVE_PVP_NOTIFY_CHANNEL, LIVE_PVP_PRESENCE_NOTIFY_CHANNEL };
