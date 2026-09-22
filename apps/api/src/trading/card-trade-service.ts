import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';

import type {
  CardAffinity,
  CardCategory,
  CardRarity,
  OwnedCard,
} from '../cards/card-types.js';
import {
  CARD_TRADE_POLICY_VERSION,
  rarityTradePoints,
  type CardTradePolicyLimits,
} from './card-trade-policy.js';

export type CardTradeStatus =
  'open' | 'completed' | 'declined' | 'cancelled' | 'expired' | 'invalidated';

export interface CardTradeRequestedDefinition {
  cardDefinitionId: string;
  quantity: number;
}

export interface CardTradeRequestedDefinitionView extends CardTradeRequestedDefinition {
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  imageUrl: string | null;
  imageAlt: string | null;
}

export interface CardTradeOfferedCopy {
  position: number;
  ownedCardId: string;
  cardDefinitionId: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  imageUrl: string | null;
  imageAlt: string | null;
  acquisitionKind: OwnedCard['acquisitionKind'];
  acquiredAt: string;
}

export interface CardTradePartyView {
  playerId: string;
  offeredCopies: readonly CardTradeOfferedCopy[];
  requestedDefinitions: readonly CardTradeRequestedDefinitionView[];
  rarityPoints: number;
  accepted: boolean;
  imbalanceAcknowledged: boolean;
}

export interface CardTradeSettlementMovement {
  movementId: string;
  sourcePlayerId: string;
  recipientPlayerId: string;
  sourceOwnedCardId: string;
  newOwnedCardId: string;
  cardDefinitionId: string;
}

export interface CardTradeSettlementReceipt {
  receiptId: string;
  tradeId: string;
  version: number;
  policy: CardTradePolicyLimits;
  completedAt: string;
  movements: readonly CardTradeSettlementMovement[];
}

export interface CardTradeView {
  tradeId: string;
  senderPlayerId: string;
  senderPlayerName: string;
  recipientPlayerId: string;
  recipientPlayerName: string;
  status: CardTradeStatus;
  version: number;
  createdAt: string;
  expiresAt: string;
  terminalAt: string | null;
  terminalReason: string | null;
  complete: boolean;
  imbalanceWarningRequired: boolean;
  sender: CardTradePartyView;
  recipient: CardTradePartyView;
  settlement: CardTradeSettlementReceipt | null;
}

interface CreateCardTradeBaseInput {
  senderPlayerId: string;
  submissionId?: string;
  offeredOwnedCardIds: readonly string[];
  requestedDefinitions: readonly CardTradeRequestedDefinition[];
}

export type CreateCardTradeInput = CreateCardTradeBaseInput &
  (
    | { recipientPlayerName: string; recipientPlayerId?: never }
    | { recipientPlayerId: string; recipientPlayerName?: never }
  );

export interface ReviseCardTradeInput {
  tradeId: string;
  playerId: string;
  submissionId?: string;
  expectedVersion: number;
  offeredOwnedCardIds: readonly string[];
  requestedDefinitions: readonly CardTradeRequestedDefinition[];
}

export interface VersionedCardTradeInput {
  tradeId: string;
  playerId: string;
  submissionId?: string;
  expectedVersion: number;
}

export interface TerminateCardTradeInput {
  tradeId: string;
  playerId: string;
  submissionId: string;
}

export interface ListCardTradesInput {
  playerId: string;
  page?: number;
  pageSize?: number;
  direction?: 'sent' | 'received';
  status?: CardTradeStatus;
}

export interface CardTradeSummary {
  tradeId: string;
  direction: 'sent' | 'received';
  status: CardTradeStatus;
  version: number;
  counterpartyPlayerName: string;
  createdAt: string;
  expiresAt: string;
  terminalAt: string | null;
}

export interface CardTradePage {
  items: readonly CardTradeSummary[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CardTradeService {
  createTrade(input: CreateCardTradeInput): Promise<CardTradeView>;
  reviseTrade(input: ReviseCardTradeInput): Promise<CardTradeView>;
  acknowledgeImbalance(input: VersionedCardTradeInput): Promise<CardTradeView>;
  acceptTrade(input: VersionedCardTradeInput): Promise<CardTradeView>;
  cancelTrade(tradeId: string, senderPlayerId: string): Promise<CardTradeView>;
  cancelTradeCommand(input: TerminateCardTradeInput): Promise<CardTradeView>;
  declineTrade(
    tradeId: string,
    recipientPlayerId: string,
  ): Promise<CardTradeView>;
  declineTradeCommand(input: TerminateCardTradeInput): Promise<CardTradeView>;
  getTrade(
    tradeId: string,
    participantPlayerId: string,
  ): Promise<CardTradeView>;
  listTrades(input: ListCardTradesInput): Promise<CardTradePage>;
  expireDueTrades(): Promise<number>;
  purgeTerminalTrades(): Promise<number>;
}

export interface CardTradeClient {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

export interface CardTradeDatabase {
  connect(): Promise<CardTradeClient>;
}

export type CardTradeErrorCode =
  | 'TRADE_PLAYER_UNAVAILABLE'
  | 'TRADE_PLAYER_LIMIT_REACHED'
  | 'TRADE_COPY_CONFLICT'
  | 'TRADE_VERSION_STALE'
  | 'TRADE_NOT_OPEN'
  | 'TRADE_NOT_FOUND'
  | 'TRADE_NOT_PARTICIPANT'
  | 'TRADE_ACTION_NOT_ALLOWED'
  | 'TRADE_INCOMPLETE'
  | 'TRADE_IMBALANCE_ACK_REQUIRED'
  | 'TRADE_INVENTORY_MINIMUM'
  | 'TRADE_DAILY_LIMIT_REACHED'
  | 'TRADE_IDEMPOTENCY_CONFLICT';

export class CardTradeError extends Error {
  constructor(
    readonly code: CardTradeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CardTradeError';
  }
}

class CommitCardTradeError extends CardTradeError {
  constructor(code: CardTradeErrorCode, message: string) {
    super(code, message);
    this.name = 'CommitCardTradeError';
  }
}

interface TradeRow extends pg.QueryResultRow {
  trade_id: string;
  sender_player_id: string;
  recipient_player_id: string;
  policy_version: typeof CARD_TRADE_POLICY_VERSION;
  current_version: number;
  status: CardTradeStatus;
  created_at: Date;
  expires_at: Date;
  terminal_at: Date | null;
  terminal_reason: string | null;
}

interface PlayerRow extends pg.QueryResultRow {
  id: string;
  lifecycle_status: string;
  created_at: Date;
}

interface PolicyRow extends pg.QueryResultRow {
  policy_version: typeof CARD_TRADE_POLICY_VERSION;
  minimum_account_age_seconds: number;
  maximum_open_offers: number;
  maximum_copies_per_side: number;
  maximum_completed_trades_24h: number;
  offer_lifetime_seconds: number;
  imbalance_warning_threshold: number;
  minimum_creature_copies: number;
  minimum_power_copies: number;
}

interface OwnedCopyRow extends pg.QueryResultRow {
  owned_card_id: string;
  player_id: string;
  card_definition_id: string;
  category: CardCategory;
  rarity: CardRarity;
  acquired_at: Date;
  acquisition_kind: OwnedCard['acquisitionKind'];
  source_completion_id: string | null;
  source_starter_grant_id: string | null;
  source_evolution_id: string | null;
  source_territory_bonus_id: string | null;
  source_trade_movement_id: string | null;
  is_active: boolean;
  authoring_status: string;
  protected: boolean;
}

interface VersionItemRow extends pg.QueryResultRow {
  offering_player_id: string;
  position: number;
  owned_card_id: string;
  card_definition_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  image_url: string | null;
  image_alt: string | null;
  acquired_at: Date;
  acquisition_kind: OwnedCard['acquisitionKind'];
}

interface VersionRequestRow extends pg.QueryResultRow {
  requesting_player_id: string;
  card_definition_id: string;
  quantity: number;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  image_url: string | null;
  image_alt: string | null;
}

interface ApprovalRow extends pg.QueryResultRow {
  player_id: string;
}

interface ReceiptRow extends pg.QueryResultRow {
  receipt_id: string;
  trade_id: string;
  version: number;
  completed_at: Date;
  policy_version: typeof CARD_TRADE_POLICY_VERSION;
  minimum_account_age_seconds: number;
  maximum_open_offers: number;
  maximum_copies_per_side: number;
  maximum_completed_trades_24h: number;
  offer_lifetime_seconds: number;
  imbalance_warning_threshold: number;
  minimum_creature_copies: number;
  minimum_power_copies: number;
}

interface MovementRow extends pg.QueryResultRow {
  movement_id: string;
  source_player_id: string;
  recipient_player_id: string;
  source_owned_card_id: string;
  new_owned_card_id: string;
  card_definition_id: string;
}

interface CountRow extends pg.QueryResultRow {
  count: number;
}

interface SubmissionReceiptRow extends pg.QueryResultRow {
  trade_id: string;
  payload_hash: string;
}

interface PlayerNameRow extends pg.QueryResultRow {
  id: string;
  player_name: string | null;
}

interface TradeListRow extends pg.QueryResultRow {
  trade_id: string;
  sender_player_id: string;
  recipient_player_id: string;
  sender_name: string | null;
  recipient_name: string | null;
  status: CardTradeStatus;
  current_version: number;
  created_at: Date;
  expires_at: Date;
  terminal_at: Date | null;
}

type CardTradeSubmissionOperation =
  | 'trade_create'
  | 'trade_revise'
  | 'trade_acknowledge_imbalance'
  | 'trade_accept'
  | 'trade_decline'
  | 'trade_cancel';

const UUID_LOWERCASE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function createCardTradeService(
  database: CardTradeDatabase,
  { createId = randomUUID }: { createId?: () => string } = {},
): CardTradeService {
  return {
    async createTrade(input) {
      validateOwnedCardIds(input.offeredOwnedCardIds);
      validateRequestedDefinitions(input.requestedDefinitions);
      if (typeof input.recipientPlayerId === 'string') {
        validateDistinctPlayers(input.senderPlayerId, input.recipientPlayerId);
      }

      return withTransaction(database, async (client) => {
        const payloadHash = hashTradeSubmission({
          recipient:
            typeof input.recipientPlayerName === 'string'
              ? input.recipientPlayerName.trim().toLowerCase()
              : input.recipientPlayerId,
          offeredOwnedCardIds: [...input.offeredOwnedCardIds],
          requestedDefinitions: [...input.requestedDefinitions],
        });
        const replay = await beginSubmission(
          client,
          input.senderPlayerId,
          'trade_create',
          input.submissionId,
          payloadHash,
        );
        if (replay) return loadTradeViewAfterExpiry(client, replay.trade_id);

        const recipientPlayerId =
          typeof input.recipientPlayerName === 'string'
            ? await resolveRecipientPlayerId(
                client,
                input.senderPlayerId,
                input.recipientPlayerName,
              )
            : input.recipientPlayerId;
        validateDistinctPlayers(input.senderPlayerId, recipientPlayerId);

        const policy = await loadPolicy(client);
        validateSideLimits(
          input.offeredOwnedCardIds,
          input.requestedDefinitions,
          policy,
        );
        await assertRequestedDefinitionsAvailable(
          client,
          input.requestedDefinitions,
        );
        const players = await lockPlayers(client, [
          input.senderPlayerId,
          recipientPlayerId,
        ]);
        const now = await databaseNow(client);
        await expireOpenTradesForPlayers(
          client,
          players.map((player) => player.id),
          now,
        );
        assertPlayerEligibility(players, policy, now);
        await assertNoTradeHold(
          client,
          players.map((player) => player.id),
        );
        await assertOpenOfferLimit(
          client,
          players.map((player) => player.id),
          policy,
        );

        const copies = await loadAndLockOwnedCopies(
          client,
          input.senderPlayerId,
          input.offeredOwnedCardIds,
          null,
        );
        assertCopiesAvailable(copies, input.offeredOwnedCardIds.length);

        const tradeId = createId();
        const expiresAt = new Date(
          now.getTime() + policy.offerLifetimeSeconds * 1000,
        );

        await client.query(
          `
            insert into private.card_trades (
              id, sender_player_id, recipient_player_id, policy_version,
              current_version, status, created_at, expires_at
            ) values (
              $1::uuid, $2::uuid, $3::uuid, $4, 1, 'open', $5, $6
            )
          `,
          [
            tradeId,
            input.senderPlayerId,
            recipientPlayerId,
            policy.policyVersion,
            now,
            expiresAt,
          ],
        );

        await insertVersion(client, {
          tradeId,
          version: 1,
          createdByPlayerId: input.senderPlayerId,
          createdAt: now,
        });
        await insertVersionItems(
          client,
          tradeId,
          1,
          input.senderPlayerId,
          copies,
        );
        await insertVersionRequests(
          client,
          tradeId,
          1,
          input.senderPlayerId,
          input.requestedDefinitions,
        );
        await reserveCopies(
          client,
          tradeId,
          1,
          input.senderPlayerId,
          copies.map((copy) => copy.owned_card_id),
          now,
        );
        await finishSubmission(
          client,
          input.senderPlayerId,
          'trade_create',
          input.submissionId,
          payloadHash,
          tradeId,
          now,
        );

        return loadTradeView(client, tradeId);
      });
    },

    async reviseTrade(input) {
      validateOwnedCardIds(input.offeredOwnedCardIds);
      validateRequestedDefinitions(input.requestedDefinitions);

      return withTransaction(database, async (client) => {
        const payloadHash = hashTradeSubmission({
          tradeId: input.tradeId,
          expectedVersion: input.expectedVersion,
          offeredOwnedCardIds: [...input.offeredOwnedCardIds],
          requestedDefinitions: [...input.requestedDefinitions],
        });
        const replay = await beginSubmission(
          client,
          input.playerId,
          'trade_revise',
          input.submissionId,
          payloadHash,
        );
        if (replay) return loadTradeViewAfterExpiry(client, replay.trade_id);

        const context = await lockTradeContext(client, input.tradeId);
        assertParticipant(context.trade, input.playerId);
        await ensureTradeActionable(client, context, input.expectedVersion);
        await expireOpenTradesForPlayers(
          client,
          context.players.map((player) => player.id),
          context.now,
        );
        const policy = await loadPolicy(client, context.trade.policy_version);
        validateSideLimits(
          input.offeredOwnedCardIds,
          input.requestedDefinitions,
          policy,
        );
        await assertRequestedDefinitionsAvailable(
          client,
          input.requestedDefinitions,
        );
        assertPlayerEligibility(context.players, policy, context.now);
        await assertTradeActionNotHeld(client, context);
        await assertExistingOpenOfferLimit(client, context, policy);

        const previousItems = await loadVersionItems(
          client,
          input.tradeId,
          context.trade.current_version,
        );
        const otherPlayerId = otherParticipant(context.trade, input.playerId);
        const otherCopyIds = previousItems
          .filter((item) => item.offering_player_id === otherPlayerId)
          .map((item) => item.owned_card_id);
        const allCopyIds = uniqueSorted([
          ...input.offeredOwnedCardIds,
          ...otherCopyIds,
        ]);
        const allCopies = await loadAndLockOwnedCopiesForParticipants(
          client,
          context.trade,
          allCopyIds,
          input.tradeId,
        );
        const actorCopies = allCopies.filter(
          (copy) => copy.player_id === input.playerId,
        );
        assertCopiesAvailable(actorCopies, input.offeredOwnedCardIds.length);
        assertExactOwnedIds(actorCopies, input.offeredOwnedCardIds);
        const otherCopies = allCopies.filter(
          (copy) => copy.player_id === otherPlayerId,
        );
        try {
          assertCopiesAvailable(otherCopies, otherCopyIds.length);
          assertExactOwnedIds(otherCopies, otherCopyIds);
        } catch (error) {
          if (
            error instanceof CardTradeError &&
            error.code === 'TRADE_COPY_CONFLICT'
          ) {
            await invalidateTrade(
              client,
              context.trade.trade_id,
              context.now,
              'copy_conflict',
            );
            throw new CommitCardTradeError(error.code, error.message);
          }
          throw error;
        }

        const nextVersion = context.trade.current_version + 1;
        await client.query(
          `delete from private.card_trade_reservations where trade_id = $1::uuid`,
          [input.tradeId],
        );
        await client.query(
          `
            update private.card_trades
               set current_version = $2
             where id = $1::uuid
          `,
          [input.tradeId, nextVersion],
        );
        await insertVersion(client, {
          tradeId: input.tradeId,
          version: nextVersion,
          createdByPlayerId: input.playerId,
          createdAt: context.now,
        });

        await copyOtherPartyVersionState(
          client,
          input.tradeId,
          context.trade.current_version,
          nextVersion,
          otherPlayerId,
        );
        await insertVersionItems(
          client,
          input.tradeId,
          nextVersion,
          input.playerId,
          actorCopies,
        );
        await insertVersionRequests(
          client,
          input.tradeId,
          nextVersion,
          input.playerId,
          input.requestedDefinitions,
        );
        await reserveCopies(
          client,
          input.tradeId,
          nextVersion,
          input.playerId,
          actorCopies.map((copy) => copy.owned_card_id),
          context.now,
        );
        await reserveCopies(
          client,
          input.tradeId,
          nextVersion,
          otherPlayerId,
          otherCopies.map((copy) => copy.owned_card_id),
          context.now,
        );
        await finishSubmission(
          client,
          input.playerId,
          'trade_revise',
          input.submissionId,
          payloadHash,
          input.tradeId,
          context.now,
        );

        return loadTradeView(client, input.tradeId);
      });
    },

    async acknowledgeImbalance(input) {
      return withTransaction(database, async (client) => {
        const payloadHash = hashTradeSubmission({
          tradeId: input.tradeId,
          expectedVersion: input.expectedVersion,
        });
        const replay = await beginSubmission(
          client,
          input.playerId,
          'trade_acknowledge_imbalance',
          input.submissionId,
          payloadHash,
        );
        if (replay) return loadTradeViewAfterExpiry(client, replay.trade_id);

        const context = await lockTradeContext(client, input.tradeId);
        assertParticipant(context.trade, input.playerId);
        await ensureTradeActionable(client, context, input.expectedVersion);
        await expireOpenTradesForPlayers(
          client,
          context.players.map((player) => player.id),
          context.now,
        );
        const policy = await loadPolicy(client, context.trade.policy_version);
        assertPlayerEligibility(context.players, policy, context.now);
        await assertTradeActionNotHeld(client, context);
        await assertExistingOpenOfferLimit(client, context, policy);
        const state = await loadCurrentVersionState(client, context.trade);
        assertVersionComplete(context.trade, state);
        assertPersistedVersionLimits(context.trade, state, policy);
        if (requiresImbalanceAcknowledgement(state.items, policy)) {
          await client.query(
            `
              insert into private.card_trade_imbalance_acknowledgements (
                trade_id, version, player_id, acknowledged_at
              ) values ($1::uuid, $2, $3::uuid, $4)
              on conflict (trade_id, version, player_id) do nothing
            `,
            [
              input.tradeId,
              context.trade.current_version,
              input.playerId,
              context.now,
            ],
          );
        }
        await finishSubmission(
          client,
          input.playerId,
          'trade_acknowledge_imbalance',
          input.submissionId,
          payloadHash,
          input.tradeId,
          context.now,
        );
        return loadTradeView(client, input.tradeId);
      });
    },

    async acceptTrade(input) {
      return withTransaction(database, async (client) => {
        const payloadHash = hashTradeSubmission({
          tradeId: input.tradeId,
          expectedVersion: input.expectedVersion,
        });
        const replay = await beginSubmission(
          client,
          input.playerId,
          'trade_accept',
          input.submissionId,
          payloadHash,
        );
        if (replay) return loadTradeViewAfterExpiry(client, replay.trade_id);

        const context = await lockTradeContext(client, input.tradeId);
        assertParticipant(context.trade, input.playerId);
        if (
          context.trade.status === 'completed' &&
          context.trade.current_version === input.expectedVersion
        ) {
          // A genuinely retried acceptance already has a durable submission
          // receipt from the transaction that recorded it. Do not persist a
          // fresh receipt for arbitrary post-completion submission IDs: the
          // completed trade is immutable and already safe to replay.
          return loadTradeView(client, input.tradeId);
        }
        await ensureTradeActionable(client, context, input.expectedVersion);
        await expireOpenTradesForPlayers(
          client,
          context.players.map((player) => player.id),
          context.now,
        );
        const policy = await loadPolicy(client, context.trade.policy_version);
        assertPlayerEligibility(context.players, policy, context.now);
        await assertTradeActionNotHeld(client, context);
        await assertExistingOpenOfferLimit(client, context, policy);
        const state = await loadCurrentVersionState(client, context.trade);
        assertVersionComplete(context.trade, state);
        try {
          assertPersistedVersionLimits(context.trade, state, policy);
        } catch (error) {
          if (error instanceof CardTradeError) {
            await invalidateTrade(
              client,
              context.trade.trade_id,
              context.now,
              'policy_limit',
            );
            throw new CommitCardTradeError(error.code, error.message);
          }
          throw error;
        }
        try {
          await assertRequestedDefinitionsAvailable(
            client,
            state.requests.map((request) => ({
              cardDefinitionId: request.card_definition_id,
              quantity: request.quantity,
            })),
          );
        } catch (error) {
          if (error instanceof CardTradeError) {
            await invalidateTrade(
              client,
              context.trade.trade_id,
              context.now,
              'definition_unavailable',
            );
            throw new CommitCardTradeError(error.code, error.message);
          }
          throw error;
        }
        const currentCopies = await assertCurrentVersionCopiesAvailable(
          client,
          context.trade,
          state.items,
          context.now,
        );
        try {
          await assertCompletedTradeLimit(
            client,
            [context.trade.sender_player_id, context.trade.recipient_player_id],
            policy,
            context.now,
          );
          await assertInventoryMinimums(
            client,
            context.trade,
            currentCopies,
            policy,
          );
        } catch (error) {
          if (
            error instanceof CardTradeError &&
            error.code === 'TRADE_DAILY_LIMIT_REACHED'
          ) {
            await invalidateTrade(
              client,
              context.trade.trade_id,
              context.now,
              'daily_limit',
            );
            throw new CommitCardTradeError(error.code, error.message);
          }
          if (
            error instanceof CardTradeError &&
            error.code === 'TRADE_INVENTORY_MINIMUM'
          ) {
            await invalidateTrade(
              client,
              context.trade.trade_id,
              context.now,
              'inventory_minimum',
            );
            throw new CommitCardTradeError(error.code, error.message);
          }
          throw error;
        }

        if (requiresImbalanceAcknowledgement(state.items, policy)) {
          const actorAcknowledged = state.acknowledgements.some(
            (acknowledgement) => acknowledgement.player_id === input.playerId,
          );
          if (!actorAcknowledged) {
            throw new CardTradeError(
              'TRADE_IMBALANCE_ACK_REQUIRED',
              'The current trade imbalance must be acknowledged before acceptance.',
            );
          }
        }

        await client.query(
          `
            insert into private.card_trade_acceptances (
              trade_id, version, player_id, accepted_at
            ) values ($1::uuid, $2, $3::uuid, $4)
            on conflict (trade_id, version, player_id) do nothing
          `,
          [
            input.tradeId,
            context.trade.current_version,
            input.playerId,
            context.now,
          ],
        );

        const acceptances = await client.query<ApprovalRow>(
          `
            select player_id::text
              from private.card_trade_acceptances
             where trade_id = $1::uuid
               and version = $2
             order by player_id
          `,
          [input.tradeId, context.trade.current_version],
        );

        if (acceptances.rows.length >= 2) {
          await settleTrade(
            client,
            context.trade,
            policy,
            context.now,
            createId,
          );
        }
        await finishSubmission(
          client,
          input.playerId,
          'trade_accept',
          input.submissionId,
          payloadHash,
          input.tradeId,
          context.now,
        );
        return loadTradeView(client, input.tradeId);
      });
    },

    async cancelTrade(tradeId, senderPlayerId) {
      return terminateTrade(
        database,
        tradeId,
        senderPlayerId,
        'sender',
        'cancelled',
      );
    },

    async cancelTradeCommand(input) {
      return terminateTradeCommand(database, input, 'sender', 'cancelled');
    },

    async declineTrade(tradeId, recipientPlayerId) {
      return terminateTrade(
        database,
        tradeId,
        recipientPlayerId,
        'recipient',
        'declined',
      );
    },

    async declineTradeCommand(input) {
      return terminateTradeCommand(database, input, 'recipient', 'declined');
    },

    async getTrade(tradeId, participantPlayerId) {
      return withTransaction(database, async (client) => {
        const trade = await loadTrade(client, tradeId, true);
        assertParticipant(trade, participantPlayerId);
        const now = await databaseNow(client);
        if (
          trade.status === 'open' &&
          trade.expires_at.getTime() <= now.getTime()
        ) {
          await client.query(
            `
              update private.card_trades
                 set status = 'expired',
                     terminal_at = $2,
                     terminal_reason = 'deadline_elapsed'
               where id = $1::uuid
            `,
            [tradeId, now],
          );
        }
        return loadTradeView(client, tradeId);
      });
    },

    async listTrades(input) {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;
      if (!Number.isInteger(page) || page < 1) {
        throw new Error('Card trade page must be a positive integer.');
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
        throw new Error('Card trade page size must be between 1 and 50.');
      }

      return withTransaction(database, async (client) => {
        const now = await databaseNow(client);
        await expireOpenTradesForPlayers(client, [input.playerId], now);
        const conditions = [
          '(trade.sender_player_id = $1::uuid or trade.recipient_player_id = $1::uuid)',
        ];
        const values: unknown[] = [input.playerId];
        if (input.direction === 'sent') {
          conditions.push(
            `trade.sender_player_id = $${values.length + 1}::uuid`,
          );
          values.push(input.playerId);
        } else if (input.direction === 'received') {
          conditions.push(
            `trade.recipient_player_id = $${values.length + 1}::uuid`,
          );
          values.push(input.playerId);
        }
        if (input.status) {
          conditions.push(`trade.status = $${values.length + 1}`);
          values.push(input.status);
        }
        values.push(pageSize + 1, (page - 1) * pageSize);
        const limitIndex = values.length - 1;
        const offsetIndex = values.length;
        const result = await client.query<TradeListRow>(
          `
            select
              trade.id::text as trade_id,
              trade.sender_player_id::text,
              trade.recipient_player_id::text,
              sender.player_name as sender_name,
              recipient.player_name as recipient_name,
              trade.status,
              trade.current_version,
              trade.created_at,
              trade.expires_at,
              trade.terminal_at
            from private.card_trades trade
            join public.players sender on sender.id = trade.sender_player_id
            join public.players recipient on recipient.id = trade.recipient_player_id
            where ${conditions.join(' and ')}
            order by trade.created_at desc, trade.id desc
            limit $${limitIndex} offset $${offsetIndex}
          `,
          values,
        );
        const hasMore = result.rows.length > pageSize;
        return {
          items: result.rows.slice(0, pageSize).map((row) => {
            const sent = row.sender_player_id === input.playerId;
            return {
              tradeId: row.trade_id,
              direction: sent ? ('sent' as const) : ('received' as const),
              status: row.status,
              version: row.current_version,
              counterpartyPlayerName:
                (sent ? row.recipient_name : row.sender_name) ??
                'Deleted player',
              createdAt: row.created_at.toISOString(),
              expiresAt: row.expires_at.toISOString(),
              terminalAt: row.terminal_at?.toISOString() ?? null,
            };
          }),
          page,
          pageSize,
          hasMore,
        };
      });
    },

    async expireDueTrades() {
      const client = await database.connect();
      try {
        const result = await client.query<{ count: number }>(
          `select private.expire_card_trades(clock_timestamp())::integer as count`,
        );
        return Number(result.rows[0]?.count ?? 0);
      } finally {
        client.release();
      }
    },

    async purgeTerminalTrades() {
      const client = await database.connect();
      try {
        const result = await client.query<{ count: number }>(
          `select private.purge_terminal_card_trades(clock_timestamp())::integer as count`,
        );
        return Number(result.rows[0]?.count ?? 0);
      } finally {
        client.release();
      }
    },
  };
}

async function withTransaction<T>(
  database: CardTradeDatabase,
  operation: (client: CardTradeClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    if (error instanceof CommitCardTradeError) {
      try {
        await client.query('commit');
      } catch (commitError) {
        try {
          await client.query('rollback');
        } catch {
          // Preserve the commit failure.
        }
        throw commitError;
      }
      throw error;
    }

    try {
      await client.query('rollback');
    } catch {
      // Preserve the original operation failure.
    }
    if (isUniqueViolation(error, 'card_trade_reservations_pkey')) {
      throw new CardTradeError(
        'TRADE_COPY_CONFLICT',
        'One or more selected card copies are already reserved.',
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

async function terminateTrade(
  database: CardTradeDatabase,
  tradeId: string,
  playerId: string,
  role: 'sender' | 'recipient',
  status: 'cancelled' | 'declined',
): Promise<CardTradeView> {
  return withTransaction(database, async (client) => {
    const context = await lockTradeContext(client, tradeId);
    assertParticipant(context.trade, playerId);
    const expectedPlayerId =
      role === 'sender'
        ? context.trade.sender_player_id
        : context.trade.recipient_player_id;
    if (expectedPlayerId !== playerId) {
      throw new CardTradeError(
        'TRADE_ACTION_NOT_ALLOWED',
        'This participant cannot perform that trade action.',
      );
    }
    await ensureTradeActionable(client, context);
    await client.query(
      `
        update private.card_trades
           set status = $2,
               terminal_at = $3,
               terminal_reason = $2
         where id = $1::uuid
      `,
      [tradeId, status, context.now],
    );
    return loadTradeView(client, tradeId);
  });
}

async function terminateTradeCommand(
  database: CardTradeDatabase,
  input: TerminateCardTradeInput,
  role: 'sender' | 'recipient',
  status: 'cancelled' | 'declined',
): Promise<CardTradeView> {
  return withTransaction(database, async (client) => {
    const operation: CardTradeSubmissionOperation =
      status === 'cancelled' ? 'trade_cancel' : 'trade_decline';
    const payloadHash = hashTradeSubmission({ tradeId: input.tradeId });
    const replay = await beginSubmission(
      client,
      input.playerId,
      operation,
      input.submissionId,
      payloadHash,
    );
    if (replay) return loadTradeViewAfterExpiry(client, replay.trade_id);

    const context = await lockTradeContext(client, input.tradeId);
    assertParticipant(context.trade, input.playerId);
    const expectedPlayerId =
      role === 'sender'
        ? context.trade.sender_player_id
        : context.trade.recipient_player_id;
    if (expectedPlayerId !== input.playerId) {
      throw new CardTradeError(
        'TRADE_ACTION_NOT_ALLOWED',
        'This participant cannot perform that trade action.',
      );
    }
    await ensureTradeActionable(client, context);
    await client.query(
      `
        update private.card_trades
           set status = $2,
               terminal_at = $3,
               terminal_reason = $2
         where id = $1::uuid
      `,
      [input.tradeId, status, context.now],
    );
    await finishSubmission(
      client,
      input.playerId,
      operation,
      input.submissionId,
      payloadHash,
      input.tradeId,
      context.now,
    );
    return loadTradeView(client, input.tradeId);
  });
}

async function resolveRecipientPlayerId(
  client: CardTradeClient,
  senderPlayerId: string,
  recipientPlayerName: string,
): Promise<string> {
  const normalized = recipientPlayerName.trim().toLowerCase();
  if (!normalized) {
    throw new CardTradeError(
      'TRADE_PLAYER_UNAVAILABLE',
      'The requested trade participant is unavailable.',
    );
  }
  const result = await client.query<PlayerNameRow>(
    `
      select id::text, player_name
        from public.players
       where player_name = $1
         and lifecycle_status = 'active'
         and player_name is not null
         and id <> $2::uuid
    `,
    [normalized, senderPlayerId],
  );
  const player = result.rows[0];
  if (!player) {
    throw new CardTradeError(
      'TRADE_PLAYER_UNAVAILABLE',
      'The requested trade participant is unavailable.',
    );
  }
  return player.id;
}

async function beginSubmission(
  client: CardTradeClient,
  actorPlayerId: string,
  operation: CardTradeSubmissionOperation,
  submissionId: string | undefined,
  payloadHash: string,
): Promise<SubmissionReceiptRow | null> {
  if (!submissionId) return null;
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `card-trade:${actorPlayerId}:${operation}:${submissionId}`,
  ]);
  const result = await client.query<SubmissionReceiptRow>(
    `
      select trade_id::text, payload_hash
        from private.card_trade_submission_receipts
       where actor_player_id = $1::uuid
         and operation = $2
         and submission_id = $3::uuid
    `,
    [actorPlayerId, operation, submissionId],
  );
  const receipt = result.rows[0];
  if (!receipt) return null;
  if (receipt.payload_hash !== payloadHash) {
    throw new CardTradeError(
      'TRADE_IDEMPOTENCY_CONFLICT',
      'This submission identifier was already used for different trade intent.',
    );
  }
  return receipt;
}

async function finishSubmission(
  client: CardTradeClient,
  actorPlayerId: string,
  operation: CardTradeSubmissionOperation,
  submissionId: string | undefined,
  payloadHash: string,
  tradeId: string,
  createdAt: Date,
): Promise<void> {
  if (!submissionId) return;
  await client.query(
    `
      insert into private.card_trade_submission_receipts (
        actor_player_id, operation, submission_id, payload_hash, trade_id, created_at
      ) values ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6)
    `,
    [actorPlayerId, operation, submissionId, payloadHash, tradeId, createdAt],
  );
}

function hashTradeSubmission(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function loadPolicy(
  client: CardTradeClient,
  policyVersion = CARD_TRADE_POLICY_VERSION,
): Promise<CardTradePolicyLimits> {
  const result = await client.query<PolicyRow>(
    `
      select
        policy_version,
        minimum_account_age_seconds,
        maximum_open_offers,
        maximum_copies_per_side,
        maximum_completed_trades_24h,
        offer_lifetime_seconds,
        imbalance_warning_threshold,
        minimum_creature_copies,
        minimum_power_copies
      from private.card_trade_policy_versions
      where policy_version = $1
    `,
    [policyVersion],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error(`Card trade policy ${policyVersion} was not found.`);
  return {
    policyVersion: row.policy_version,
    minimumAccountAgeSeconds: row.minimum_account_age_seconds,
    maximumOpenOffers: row.maximum_open_offers,
    maximumCopiesPerSide: row.maximum_copies_per_side,
    maximumCompletedTrades24h: row.maximum_completed_trades_24h,
    offerLifetimeSeconds: row.offer_lifetime_seconds,
    imbalanceWarningThreshold: row.imbalance_warning_threshold,
    minimumCreatureCopies: row.minimum_creature_copies,
    minimumPowerCopies: row.minimum_power_copies,
  };
}

async function lockPlayers(
  client: CardTradeClient,
  playerIds: readonly string[],
): Promise<PlayerRow[]> {
  const ids = uniqueSorted(playerIds);
  const result = await client.query<PlayerRow>(
    `
      select id::text, lifecycle_status, created_at
        from public.players
       where id = any($1::uuid[])
       order by id
       for no key update
    `,
    [ids],
  );
  if (result.rows.length !== ids.length) {
    throw new CardTradeError(
      'TRADE_PLAYER_UNAVAILABLE',
      'One or more trade participants are unavailable.',
    );
  }
  return result.rows;
}

async function lockTradeContext(
  client: CardTradeClient,
  tradeId: string,
): Promise<{ trade: TradeRow; players: PlayerRow[]; now: Date }> {
  const discovered = await loadTrade(client, tradeId);
  const players = await lockPlayers(client, [
    discovered.sender_player_id,
    discovered.recipient_player_id,
  ]);
  const locked = await loadTrade(client, tradeId, true);
  const now = await databaseNow(client);
  return { trade: locked, players, now };
}

async function loadTrade(
  client: CardTradeClient,
  tradeId: string,
  lock = false,
): Promise<TradeRow> {
  const result = await client.query<TradeRow>(
    `
      select
        id::text as trade_id,
        sender_player_id::text,
        recipient_player_id::text,
        policy_version,
        current_version,
        status,
        created_at,
        expires_at,
        terminal_at,
        terminal_reason
      from private.card_trades
      where id = $1::uuid
      ${lock ? 'for update' : ''}
    `,
    [tradeId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new CardTradeError('TRADE_NOT_FOUND', 'Card trade was not found.');
  }
  return row;
}

async function ensureTradeActionable(
  client: CardTradeClient,
  context: { trade: TradeRow; now: Date },
  expectedVersion?: number,
): Promise<void> {
  if (context.trade.status !== 'open') {
    throw new CardTradeError('TRADE_NOT_OPEN', 'Card trade is no longer open.');
  }
  if (context.trade.expires_at.getTime() <= context.now.getTime()) {
    await client.query(
      `
        update private.card_trades
           set status = 'expired',
               terminal_at = $2,
               terminal_reason = 'deadline_elapsed'
         where id = $1::uuid
      `,
      [context.trade.trade_id, context.now],
    );
    throw new CommitCardTradeError('TRADE_NOT_OPEN', 'Card trade has expired.');
  }
  if (
    expectedVersion !== undefined &&
    expectedVersion !== context.trade.current_version
  ) {
    throw new CardTradeError(
      'TRADE_VERSION_STALE',
      'The trade offer changed before this action was applied.',
    );
  }
}

function assertPlayerEligibility(
  players: readonly PlayerRow[],
  policy: CardTradePolicyLimits,
  now: Date,
): void {
  for (const player of players) {
    if (
      player.lifecycle_status !== 'active' ||
      now.getTime() - player.created_at.getTime() <
        policy.minimumAccountAgeSeconds * 1000
    ) {
      throw new CardTradeError(
        'TRADE_PLAYER_UNAVAILABLE',
        'One or more trade participants are unavailable.',
      );
    }
  }
}

async function assertNoTradeHold(
  client: CardTradeClient,
  playerIds: readonly string[],
): Promise<void> {
  const result = await client.query<CountRow>(
    `
      select count(*)::integer as count
        from private.trust_restrictions restriction
        left join private.trust_appeals appeal
          on appeal.challenged_decision_id = restriction.decision_id
        left join private.trust_appeal_resolutions resolution
          on resolution.appeal_id = appeal.id
       where restriction.player_id = any($1::uuid[])
         and restriction.scope = 'card_trade_hold'
         and restriction.starts_at <= clock_timestamp()
         and coalesce(
               case resolution.outcome
                 when 'upheld' then restriction.original_expires_at
                 else least(
                   restriction.original_expires_at,
                   resolution.effective_expires_at
                 )
               end,
               restriction.original_expires_at
             ) > clock_timestamp()
    `,
    [uniqueSorted(playerIds)],
  );
  if (Number(result.rows[0]?.count ?? 0) > 0) {
    throw new CardTradeError(
      'TRADE_PLAYER_UNAVAILABLE',
      'Card trading is temporarily unavailable for one or more participants.',
    );
  }
}

async function assertTradeActionNotHeld(
  client: CardTradeClient,
  context: { trade: TradeRow; players: readonly PlayerRow[]; now: Date },
): Promise<void> {
  try {
    await assertNoTradeHold(
      client,
      context.players.map((player) => player.id),
    );
  } catch (error) {
    if (
      error instanceof CardTradeError &&
      error.code === 'TRADE_PLAYER_UNAVAILABLE'
    ) {
      await invalidateTrade(
        client,
        context.trade.trade_id,
        context.now,
        'card_trade_hold',
      );
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }
}

async function expireOpenTradesForPlayers(
  client: CardTradeClient,
  playerIds: readonly string[],
  now: Date,
): Promise<void> {
  await client.query(
    `
      update private.card_trades
         set status = 'expired',
             terminal_at = $2,
             terminal_reason = 'deadline_elapsed'
       where status = 'open'
         and expires_at <= $2
         and (
           sender_player_id = any($1::uuid[])
           or recipient_player_id = any($1::uuid[])
         )
    `,
    [uniqueSorted(playerIds), now],
  );
}

async function assertOpenOfferLimit(
  client: CardTradeClient,
  playerIds: readonly string[],
  policy: CardTradePolicyLimits,
): Promise<void> {
  for (const playerId of uniqueSorted(playerIds)) {
    const result = await client.query<CountRow>(
      `
        select count(*)::integer as count
          from private.card_trades
         where status = 'open'
           and (sender_player_id = $1::uuid or recipient_player_id = $1::uuid)
      `,
      [playerId],
    );
    if (Number(result.rows[0]?.count ?? 0) >= policy.maximumOpenOffers) {
      throw new CardTradeError(
        'TRADE_PLAYER_LIMIT_REACHED',
        'A participant has reached the open trade limit.',
      );
    }
  }
}

async function assertExistingOpenOfferLimit(
  client: CardTradeClient,
  context: { trade: TradeRow; players: readonly PlayerRow[]; now: Date },
  policy: CardTradePolicyLimits,
): Promise<void> {
  for (const player of context.players) {
    const result = await client.query<CountRow>(
      `
        select count(*)::integer as count
          from private.card_trades
         where status = 'open'
           and (sender_player_id = $1::uuid or recipient_player_id = $1::uuid)
      `,
      [player.id],
    );
    if (Number(result.rows[0]?.count ?? 0) > policy.maximumOpenOffers) {
      await invalidateTrade(
        client,
        context.trade.trade_id,
        context.now,
        'player_limit',
      );
      throw new CommitCardTradeError(
        'TRADE_PLAYER_LIMIT_REACHED',
        'A participant exceeds the open trade limit.',
      );
    }
  }
}

async function assertRequestedDefinitionsAvailable(
  client: CardTradeClient,
  requests: readonly CardTradeRequestedDefinition[],
  lock = false,
): Promise<void> {
  const ids = uniqueSorted(
    requests.map((request) => request.cardDefinitionId.toLowerCase()),
  );
  const result = await client.query<{ card_definition_id: string }>(
    `
      select id::text as card_definition_id
        from public.card_definitions
       where id = any($1::uuid[])
         and is_active
         and authoring_status = 'published'
       order by id
       ${lock ? 'for share' : ''}
    `,
    [ids],
  );
  if (result.rows.length !== ids.length) {
    throw new CardTradeError(
      'TRADE_INCOMPLETE',
      'One or more requested card definitions are unavailable.',
    );
  }
}

async function loadAndLockOwnedCopies(
  client: CardTradeClient,
  playerId: string,
  ownedCardIds: readonly string[],
  allowedTradeId: string | null,
): Promise<OwnedCopyRow[]> {
  if (ownedCardIds.length === 0) return [];
  const result = await client.query<OwnedCopyRow>(
    ownedCopyQuery('owned.player_id = $1::uuid and owned.id = any($2::uuid[])'),
    [playerId, uniqueSorted(ownedCardIds), allowedTradeId],
  );
  return refreshCopyProtection(client, result.rows, allowedTradeId);
}

async function loadAndLockOwnedCopiesForParticipants(
  client: CardTradeClient,
  trade: TradeRow,
  ownedCardIds: readonly string[],
  allowedTradeId: string,
): Promise<OwnedCopyRow[]> {
  if (ownedCardIds.length === 0) return [];
  const result = await client.query<OwnedCopyRow>(
    ownedCopyQuery(
      `owned.player_id = any($1::uuid[]) and owned.id = any($2::uuid[])`,
    ),
    [
      uniqueSorted([trade.sender_player_id, trade.recipient_player_id]),
      uniqueSorted(ownedCardIds),
      allowedTradeId,
    ],
  );
  return refreshCopyProtection(client, result.rows, allowedTradeId);
}

async function refreshCopyProtection(
  client: CardTradeClient,
  copies: readonly OwnedCopyRow[],
  allowedTradeId: string | null,
): Promise<OwnedCopyRow[]> {
  if (copies.length === 0) return [];
  // Re-read protection state only after the ownership rows have been locked.
  // This closes the race where a deck/match transaction commits while this
  // transaction waits to acquire the same player_cards row lock.
  const result = await client.query<{ owned_card_id: string }>(
    `
      select owned.id::text as owned_card_id
        from public.player_cards owned
       where owned.id = any($1::uuid[])
         and (
           exists (
             select 1
               from public.player_deck_cards membership
              where membership.player_id = owned.player_id
                and membership.owned_card_id = owned.id
           )
           or exists (
             select 1
               from public.cpu_match_cards match_card
               join public.cpu_matches match on match.id = match_card.match_id
              where match_card.owned_card_id = owned.id
                and match.status = 'active'
           )
           or exists (
             select 1
               from private.async_pvp_deck_snapshot_cards snapshot_card
               join private.async_pvp_deck_snapshots snapshot
                 on snapshot.id = snapshot_card.snapshot_id
               join public.async_pvp_invitations invitation
                 on invitation.id = snapshot.invitation_id
               left join public.async_pvp_matches match
                 on match.id = invitation.match_id
              where snapshot_card.source_owned_card_id = owned.id
                and (invitation.status = 'pending' or match.status = 'active')
           )
           or exists (
             select 1
               from private.live_pvp_deck_snapshot_cards snapshot_card
               join private.live_pvp_deck_snapshots snapshot
                 on snapshot.id = snapshot_card.snapshot_id
               join public.live_pvp_matches match on match.id = snapshot.match_id
              where snapshot_card.source_owned_card_id = owned.id
                and match.status = 'active'
           )
           or exists (
             select 1
               from private.card_trade_reservations reservation
              where reservation.owned_card_id = owned.id
                and ($2::uuid is null or reservation.trade_id <> $2::uuid)
           )
         )
       order by owned.id
    `,
    [copies.map((copy) => copy.owned_card_id), allowedTradeId],
  );
  const protectedIds = new Set(
    result.rows.map((row) => row.owned_card_id.toLowerCase()),
  );
  return copies.map((copy) => ({
    ...copy,
    protected: protectedIds.has(copy.owned_card_id.toLowerCase()),
  }));
}

function ownedCopyQuery(whereClause: string): string {
  return `
    select
      owned.id::text as owned_card_id,
      owned.player_id::text,
      owned.card_definition_id::text,
      definition.category,
      definition.rarity,
      owned.acquired_at,
      owned.acquisition_kind,
      owned.source_completion_id::text,
      owned.source_starter_grant_id::text,
      owned.source_evolution_id::text,
      owned.source_territory_bonus_id::text,
      owned.source_trade_movement_id::text,
      definition.is_active,
      definition.authoring_status,
      (
        exists (
          select 1
            from public.player_deck_cards membership
           where membership.player_id = owned.player_id
             and membership.owned_card_id = owned.id
        )
        or exists (
          select 1
            from public.cpu_match_cards match_card
            join public.cpu_matches match on match.id = match_card.match_id
           where match_card.owned_card_id = owned.id
             and match.status = 'active'
        )
        or exists (
          select 1
            from private.async_pvp_deck_snapshot_cards snapshot_card
            join private.async_pvp_deck_snapshots snapshot
              on snapshot.id = snapshot_card.snapshot_id
            join public.async_pvp_invitations invitation
              on invitation.id = snapshot.invitation_id
            left join public.async_pvp_matches match
              on match.id = invitation.match_id
           where snapshot_card.source_owned_card_id = owned.id
             and (invitation.status = 'pending' or match.status = 'active')
        )
        or exists (
          select 1
            from private.live_pvp_deck_snapshot_cards snapshot_card
            join private.live_pvp_deck_snapshots snapshot
              on snapshot.id = snapshot_card.snapshot_id
            join public.live_pvp_matches match on match.id = snapshot.match_id
           where snapshot_card.source_owned_card_id = owned.id
             and match.status = 'active'
        )
        or exists (
          select 1
            from private.card_trade_reservations reservation
           where reservation.owned_card_id = owned.id
             and ($3::uuid is null or reservation.trade_id <> $3::uuid)
        )
      ) as protected
    from public.player_cards owned
    join public.card_definitions definition
      on definition.id = owned.card_definition_id
    where ${whereClause}
    order by owned.id
    for update of owned
  `;
}

function assertCopiesAvailable(
  copies: readonly OwnedCopyRow[],
  expectedCount: number,
): void {
  if (
    copies.length !== expectedCount ||
    copies.some(
      (copy) =>
        copy.protected ||
        !copy.is_active ||
        copy.authoring_status !== 'published',
    )
  ) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'One or more selected card copies are unavailable.',
    );
  }
}

function assertExactOwnedIds(
  copies: readonly OwnedCopyRow[],
  expectedIds: readonly string[],
): void {
  const actual = copies.map((copy) => copy.owned_card_id.toLowerCase()).sort();
  const expected = expectedIds.map((id) => id.toLowerCase()).sort();
  if (actual.join(':') !== expected.join(':')) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'One or more selected card copies are unavailable.',
    );
  }
}

async function insertVersion(
  client: CardTradeClient,
  input: {
    tradeId: string;
    version: number;
    createdByPlayerId: string;
    createdAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into private.card_trade_versions (
        trade_id, version, created_by_player_id, created_at
      ) values ($1::uuid, $2, $3::uuid, $4)
    `,
    [input.tradeId, input.version, input.createdByPlayerId, input.createdAt],
  );
}

async function insertVersionItems(
  client: CardTradeClient,
  tradeId: string,
  version: number,
  playerId: string,
  copies: readonly OwnedCopyRow[],
): Promise<void> {
  for (const [index, copy] of copies.entries()) {
    await client.query(
      `
        insert into private.card_trade_version_items (
          trade_id, version, offering_player_id, position,
          owned_card_id, card_definition_id, rarity, acquired_at,
          acquisition_kind
        ) values (
          $1::uuid, $2, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8, $9
        )
      `,
      [
        tradeId,
        version,
        playerId,
        index + 1,
        copy.owned_card_id,
        copy.card_definition_id,
        copy.rarity,
        copy.acquired_at,
        copy.acquisition_kind,
      ],
    );
  }
}

async function insertVersionRequests(
  client: CardTradeClient,
  tradeId: string,
  version: number,
  playerId: string,
  requests: readonly CardTradeRequestedDefinition[],
): Promise<void> {
  for (const request of requests) {
    await client.query(
      `
        insert into private.card_trade_version_requests (
          trade_id, version, requesting_player_id, card_definition_id, quantity
        ) values ($1::uuid, $2, $3::uuid, $4::uuid, $5)
      `,
      [tradeId, version, playerId, request.cardDefinitionId, request.quantity],
    );
  }
}

async function reserveCopies(
  client: CardTradeClient,
  tradeId: string,
  version: number,
  playerId: string,
  ownedCardIds: readonly string[],
  reservedAt: Date,
): Promise<void> {
  for (const ownedCardId of ownedCardIds) {
    await client.query(
      `
        insert into private.card_trade_reservations (
          owned_card_id, trade_id, version, player_id, reserved_at
        ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5)
      `,
      [ownedCardId, tradeId, version, playerId, reservedAt],
    );
  }
}

async function copyOtherPartyVersionState(
  client: CardTradeClient,
  tradeId: string,
  previousVersion: number,
  nextVersion: number,
  otherPlayerId: string,
): Promise<void> {
  await client.query(
    `
      insert into private.card_trade_version_items (
        trade_id, version, offering_player_id, position, owned_card_id,
        card_definition_id, rarity, acquired_at, acquisition_kind
      )
      select trade_id, $3, offering_player_id, position, owned_card_id,
             card_definition_id, rarity, acquired_at, acquisition_kind
        from private.card_trade_version_items
       where trade_id = $1::uuid
         and version = $2
         and offering_player_id = $4::uuid
       order by position
    `,
    [tradeId, previousVersion, nextVersion, otherPlayerId],
  );
  await client.query(
    `
      insert into private.card_trade_version_requests (
        trade_id, version, requesting_player_id, card_definition_id, quantity
      )
      select trade_id, $3, requesting_player_id, card_definition_id, quantity
        from private.card_trade_version_requests
       where trade_id = $1::uuid
         and version = $2
         and requesting_player_id = $4::uuid
       order by card_definition_id
    `,
    [tradeId, previousVersion, nextVersion, otherPlayerId],
  );
}

async function loadVersionItems(
  client: CardTradeClient,
  tradeId: string,
  version: number,
): Promise<VersionItemRow[]> {
  const result = await client.query<VersionItemRow>(
    `
      select
        item.offering_player_id::text,
        item.position,
        item.owned_card_id::text,
        item.card_definition_id::text,
        definition.name,
        definition.category,
        definition.affinity,
        item.rarity,
        definition.image_url,
        definition.image_alt,
        item.acquired_at,
        item.acquisition_kind
      from private.card_trade_version_items item
      join public.card_definitions definition on definition.id = item.card_definition_id
      where item.trade_id = $1::uuid
        and item.version = $2
      order by item.offering_player_id, item.position
    `,
    [tradeId, version],
  );
  return result.rows;
}

async function loadVersionRequests(
  client: CardTradeClient,
  tradeId: string,
  version: number,
): Promise<VersionRequestRow[]> {
  const result = await client.query<VersionRequestRow>(
    `
      select
        request.requesting_player_id::text,
        request.card_definition_id::text,
        request.quantity,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity,
        definition.image_url,
        definition.image_alt
      from private.card_trade_version_requests request
      join public.card_definitions definition on definition.id = request.card_definition_id
      where request.trade_id = $1::uuid
        and request.version = $2
      order by request.requesting_player_id, request.card_definition_id
    `,
    [tradeId, version],
  );
  return result.rows;
}

async function loadCurrentVersionState(
  client: CardTradeClient,
  trade: TradeRow,
): Promise<{
  items: VersionItemRow[];
  requests: VersionRequestRow[];
  acceptances: ApprovalRow[];
  acknowledgements: ApprovalRow[];
}> {
  // A pg client executes one query at a time. Keep these reads sequential so
  // callers never overlap client.query() calls on the same transaction client.
  const items = await loadVersionItems(
    client,
    trade.trade_id,
    trade.current_version,
  );
  const requests = await loadVersionRequests(
    client,
    trade.trade_id,
    trade.current_version,
  );
  const acceptances = await client.query<ApprovalRow>(
    `select player_id::text from private.card_trade_acceptances where trade_id = $1::uuid and version = $2 order by player_id`,
    [trade.trade_id, trade.current_version],
  );
  const acknowledgements = await client.query<ApprovalRow>(
    `select player_id::text from private.card_trade_imbalance_acknowledgements where trade_id = $1::uuid and version = $2 order by player_id`,
    [trade.trade_id, trade.current_version],
  );
  return {
    items,
    requests,
    acceptances: acceptances.rows,
    acknowledgements: acknowledgements.rows,
  };
}

function assertVersionComplete(
  trade: TradeRow,
  state: { items: VersionItemRow[]; requests: VersionRequestRow[] },
): void {
  if (!isVersionComplete(trade, state.items, state.requests)) {
    throw new CardTradeError(
      'TRADE_INCOMPLETE',
      'Both participants must define matching offered and requested card sets before acceptance.',
    );
  }
}

function isVersionComplete(
  trade: TradeRow,
  items: readonly VersionItemRow[],
  requests: readonly VersionRequestRow[],
): boolean {
  for (const playerId of [trade.sender_player_id, trade.recipient_player_id]) {
    const ownItems = items.filter(
      (item) => item.offering_player_id === playerId,
    );
    const ownRequests = requests.filter(
      (request) => request.requesting_player_id === playerId,
    );
    if (ownItems.length === 0 || ownRequests.length === 0) return false;
    const otherPlayerId = otherParticipant(trade, playerId);
    const otherItems = items.filter(
      (item) => item.offering_player_id === otherPlayerId,
    );
    if (!requestsMatchItems(ownRequests, otherItems)) return false;
  }
  return true;
}

function requestsMatchItems(
  requests: readonly VersionRequestRow[],
  items: readonly VersionItemRow[],
): boolean {
  const requestedCount = requests.reduce(
    (total, request) => total + request.quantity,
    0,
  );
  if (requestedCount !== items.length) return false;
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(
      item.card_definition_id,
      (counts.get(item.card_definition_id) ?? 0) + 1,
    );
  }
  return requests.every(
    (request) => counts.get(request.card_definition_id) === request.quantity,
  );
}

async function assertCurrentVersionCopiesAvailable(
  client: CardTradeClient,
  trade: TradeRow,
  items: readonly VersionItemRow[],
  now: Date,
): Promise<OwnedCopyRow[]> {
  const copyIds = items.map((item) => item.owned_card_id);
  const copies = await loadAndLockOwnedCopiesForParticipants(
    client,
    trade,
    copyIds,
    trade.trade_id,
  );
  try {
    assertCopiesAvailable(copies, copyIds.length);
    assertExactOwnedIds(copies, copyIds);
    assertCopiesMatchVersion(copies, items);
    await assertReservationSet(client, trade, copyIds);
    return copies;
  } catch (error) {
    if (
      error instanceof CardTradeError &&
      error.code === 'TRADE_COPY_CONFLICT'
    ) {
      await invalidateTrade(client, trade.trade_id, now, 'copy_conflict');
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }
}

function assertPersistedVersionLimits(
  trade: TradeRow,
  state: {
    items: readonly VersionItemRow[];
    requests: readonly VersionRequestRow[];
  },
  policy: CardTradePolicyLimits,
): void {
  for (const playerId of [trade.sender_player_id, trade.recipient_player_id]) {
    const offeredCount = state.items.filter(
      (item) => item.offering_player_id === playerId,
    ).length;
    const requestedCount = state.requests
      .filter((request) => request.requesting_player_id === playerId)
      .reduce((total, request) => total + request.quantity, 0);
    if (
      offeredCount < 1 ||
      offeredCount > policy.maximumCopiesPerSide ||
      requestedCount < 1 ||
      requestedCount > policy.maximumCopiesPerSide
    ) {
      throw new CardTradeError(
        'TRADE_PLAYER_LIMIT_REACHED',
        'The persisted trade version exceeds the configured card-copy limit.',
      );
    }
  }
}

function assertCopiesMatchVersion(
  copies: readonly OwnedCopyRow[],
  items: readonly VersionItemRow[],
): void {
  const itemByOwnedId = new Map(
    items.map((item) => [item.owned_card_id.toLowerCase(), item]),
  );
  const matches = copies.every((copy) => {
    const item = itemByOwnedId.get(copy.owned_card_id.toLowerCase());
    return (
      item !== undefined &&
      item.offering_player_id === copy.player_id &&
      item.card_definition_id === copy.card_definition_id &&
      item.rarity === copy.rarity &&
      item.acquisition_kind === copy.acquisition_kind &&
      item.acquired_at.getTime() === copy.acquired_at.getTime()
    );
  });
  if (!matches || copies.length !== items.length) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'The selected card copies changed after the current offer version was created.',
    );
  }
}

function requiresImbalanceAcknowledgement(
  items: readonly VersionItemRow[],
  policy: CardTradePolicyLimits,
): boolean {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(
      item.offering_player_id,
      (totals.get(item.offering_player_id) ?? 0) +
        rarityTradePoints(item.rarity),
    );
  }
  const values = [...totals.values()];
  if (values.length !== 2) return false;
  return Math.abs(values[0]! - values[1]!) > policy.imbalanceWarningThreshold;
}

async function settleTrade(
  client: CardTradeClient,
  trade: TradeRow,
  policy: CardTradePolicyLimits,
  now: Date,
  createId: () => string,
): Promise<void> {
  const existingReceipt = await loadSettlementReceipt(client, trade.trade_id);
  if (existingReceipt) return;

  const state = await loadCurrentVersionState(client, trade);
  assertVersionComplete(trade, state);
  try {
    assertPersistedVersionLimits(trade, state, policy);
  } catch (error) {
    if (error instanceof CardTradeError) {
      await invalidateTrade(client, trade.trade_id, now, 'policy_limit');
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }
  try {
    await assertRequestedDefinitionsAvailable(
      client,
      state.requests.map((request) => ({
        cardDefinitionId: request.card_definition_id,
        quantity: request.quantity,
        name: request.name,
        category: request.category,
        affinity: request.affinity,
        rarity: request.rarity,
        imageUrl: request.image_url,
        imageAlt: request.image_alt,
      })),
      true,
    );
  } catch (error) {
    if (error instanceof CardTradeError) {
      await invalidateTrade(
        client,
        trade.trade_id,
        now,
        'definition_unavailable',
      );
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }
  if (state.acceptances.length !== 2) {
    throw new CardTradeError(
      'TRADE_INCOMPLETE',
      'Both participants must accept the current trade version.',
    );
  }
  if (
    requiresImbalanceAcknowledgement(state.items, policy) &&
    state.acknowledgements.length !== 2
  ) {
    throw new CardTradeError(
      'TRADE_IMBALANCE_ACK_REQUIRED',
      'Both participants must acknowledge the current trade imbalance.',
    );
  }

  try {
    await assertCompletedTradeLimit(
      client,
      [trade.sender_player_id, trade.recipient_player_id],
      policy,
      now,
    );
  } catch (error) {
    if (
      error instanceof CardTradeError &&
      error.code === 'TRADE_DAILY_LIMIT_REACHED'
    ) {
      await invalidateTrade(client, trade.trade_id, now, 'daily_limit');
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }

  const copyIds = state.items.map((item) => item.owned_card_id);
  const copies = await assertCurrentVersionCopiesAvailable(
    client,
    trade,
    state.items,
    now,
  );
  try {
    await assertInventoryMinimums(client, trade, copies, policy);
  } catch (error) {
    if (
      error instanceof CardTradeError &&
      error.code === 'TRADE_INVENTORY_MINIMUM'
    ) {
      await invalidateTrade(client, trade.trade_id, now, 'inventory_minimum');
      throw new CommitCardTradeError(error.code, error.message);
    }
    throw error;
  }

  const receiptId = createId();
  await client.query(
    `
      insert into private.card_trade_settlement_receipts (
        id, trade_id, version, sender_player_id, recipient_player_id,
        policy_version, minimum_account_age_seconds, maximum_open_offers,
        maximum_copies_per_side, maximum_completed_trades_24h,
        offer_lifetime_seconds, imbalance_warning_threshold,
        minimum_creature_copies, minimum_power_copies, completed_at
      ) values (
        $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
        $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
    `,
    [
      receiptId,
      trade.trade_id,
      trade.current_version,
      trade.sender_player_id,
      trade.recipient_player_id,
      policy.policyVersion,
      policy.minimumAccountAgeSeconds,
      policy.maximumOpenOffers,
      policy.maximumCopiesPerSide,
      policy.maximumCompletedTrades24h,
      policy.offerLifetimeSeconds,
      policy.imbalanceWarningThreshold,
      policy.minimumCreatureCopies,
      policy.minimumPowerCopies,
      now,
    ],
  );

  const grants: Array<{
    movementId: string;
    newOwnedCardId: string;
    copy: OwnedCopyRow;
    recipientPlayerId: string;
  }> = [];
  for (const copy of copies) {
    const movementId = createId();
    const newOwnedCardId = createId();
    const recipientPlayerId = otherParticipant(trade, copy.player_id);
    const movement = await client.query(
      `
        insert into private.card_trade_movements (
          id, receipt_id, source_player_id, recipient_player_id,
          source_owned_card_id, new_owned_card_id, card_definition_id,
          source_acquired_at, source_acquisition_kind,
          source_completion_id, source_starter_grant_id,
          source_evolution_id, source_territory_bonus_id,
          source_trade_movement_id, transferred_at
        )
        select
          $1::uuid, $2::uuid, owned.player_id, $3::uuid,
          owned.id, $4::uuid, owned.card_definition_id,
          owned.acquired_at, owned.acquisition_kind,
          owned.source_completion_id, owned.source_starter_grant_id,
          owned.source_evolution_id, owned.source_territory_bonus_id,
          owned.source_trade_movement_id, $5::timestamptz
        from public.player_cards owned
        where owned.id = $6::uuid
          and owned.player_id = $7::uuid
      `,
      [
        movementId,
        receiptId,
        recipientPlayerId,
        newOwnedCardId,
        now,
        copy.owned_card_id,
        copy.player_id,
      ],
    );
    if (movement.rowCount !== 1) {
      throw new CardTradeError(
        'TRADE_COPY_CONFLICT',
        'The selected card copies changed before settlement.',
      );
    }
    grants.push({ movementId, newOwnedCardId, copy, recipientPlayerId });
  }

  await client.query(
    `delete from private.card_trade_reservations where trade_id = $1::uuid`,
    [trade.trade_id],
  );

  const deleted = await client.query(
    `delete from public.player_cards where id = any($1::uuid[])`,
    [copyIds],
  );
  if (deleted.rowCount !== copyIds.length) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'The selected card copies changed before settlement.',
    );
  }

  for (const grant of grants) {
    await client.query(
      `
        insert into public.player_cards (
          id, player_id, card_definition_id, source_trade_movement_id,
          acquisition_kind, acquired_at
        ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'trade', $5)
      `,
      [
        grant.newOwnedCardId,
        grant.recipientPlayerId,
        grant.copy.card_definition_id,
        grant.movementId,
        now,
      ],
    );
  }

  await client.query(
    `
      update private.card_trades
         set status = 'completed',
             terminal_at = $2,
             terminal_reason = 'settled'
       where id = $1::uuid
    `,
    [trade.trade_id, now],
  );
}

async function assertReservationSet(
  client: CardTradeClient,
  trade: TradeRow,
  copyIds: readonly string[],
): Promise<void> {
  const result = await client.query<{ owned_card_id: string }>(
    `
      select owned_card_id::text
        from private.card_trade_reservations
       where trade_id = $1::uuid
         and version = $2
       order by owned_card_id
    `,
    [trade.trade_id, trade.current_version],
  );
  const actual = result.rows.map((row) => row.owned_card_id).sort();
  const expected = copyIds.map((id) => id.toLowerCase()).sort();
  if (actual.join(':') !== expected.join(':')) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'The selected card reservations changed before settlement.',
    );
  }
}

async function assertCompletedTradeLimit(
  client: CardTradeClient,
  playerIds: readonly string[],
  policy: CardTradePolicyLimits,
  now: Date,
): Promise<void> {
  for (const playerId of uniqueSorted(playerIds)) {
    const result = await client.query<CountRow>(
      `
        select count(*)::integer as count
          from private.card_trade_settlement_receipts receipt
         where receipt.completed_at > $2::timestamptz - interval '24 hours'
           and receipt.completed_at <= $2::timestamptz
           and (
             receipt.sender_player_id = $1::uuid
             or receipt.recipient_player_id = $1::uuid
           )
      `,
      [playerId, now],
    );
    if (
      Number(result.rows[0]?.count ?? 0) >= policy.maximumCompletedTrades24h
    ) {
      throw new CardTradeError(
        'TRADE_DAILY_LIMIT_REACHED',
        'A participant has reached the completed trade limit.',
      );
    }
  }
}

async function assertInventoryMinimums(
  client: CardTradeClient,
  trade: TradeRow,
  outgoingCopies: readonly OwnedCopyRow[],
  policy: CardTradePolicyLimits,
): Promise<void> {
  for (const playerId of [trade.sender_player_id, trade.recipient_player_id]) {
    const counts = await client.query<{
      category: CardCategory;
      count: number;
    }>(
      `
        select definition.category, count(*)::integer as count
          from public.player_cards owned
          join public.card_definitions definition
            on definition.id = owned.card_definition_id
         where owned.player_id = $1::uuid
         group by definition.category
      `,
      [playerId],
    );
    const current = new Map(
      counts.rows.map((row) => [row.category, Number(row.count)]),
    );
    const outgoing = outgoingCopies.filter(
      (copy) => copy.player_id === playerId,
    );
    const incoming = outgoingCopies.filter(
      (copy) => copy.player_id !== playerId,
    );
    const finalCreature =
      (current.get('creature') ?? 0) -
      outgoing.filter((copy) => copy.category === 'creature').length +
      incoming.filter((copy) => copy.category === 'creature').length;
    const finalPower =
      (current.get('power') ?? 0) -
      outgoing.filter((copy) => copy.category === 'power').length +
      incoming.filter((copy) => copy.category === 'power').length;
    if (
      finalCreature < policy.minimumCreatureCopies ||
      finalPower < policy.minimumPowerCopies
    ) {
      throw new CardTradeError(
        'TRADE_INVENTORY_MINIMUM',
        'The trade would leave a participant below the minimum card inventory.',
      );
    }
  }
}

async function invalidateTrade(
  client: CardTradeClient,
  tradeId: string,
  at: Date,
  reason: string,
): Promise<void> {
  await client.query(
    `
      update private.card_trades
         set status = 'invalidated', terminal_at = $2, terminal_reason = $3
       where id = $1::uuid and status = 'open'
    `,
    [tradeId, at, reason],
  );
}

async function loadTradeViewAfterExpiry(
  client: CardTradeClient,
  tradeId: string,
): Promise<CardTradeView> {
  const trade = await loadTrade(client, tradeId, true);
  if (trade.status === 'open') {
    const now = await databaseNow(client);
    if (trade.expires_at.getTime() <= now.getTime()) {
      await client.query(
        `
          update private.card_trades
             set status = 'expired',
                 terminal_at = $2,
                 terminal_reason = 'deadline_elapsed'
           where id = $1::uuid
        `,
        [tradeId, now],
      );
    }
  }
  return loadTradeView(client, tradeId);
}

async function loadTradeView(
  client: CardTradeClient,
  tradeId: string,
): Promise<CardTradeView> {
  const trade = await loadTrade(client, tradeId);
  const state = await loadCurrentVersionState(client, trade);
  const policy = await loadPolicy(client, trade.policy_version);
  const complete = isVersionComplete(trade, state.items, state.requests);
  const sender = mapParty(
    trade.sender_player_id,
    state.items,
    state.requests,
    state.acceptances,
    state.acknowledgements,
  );
  const recipient = mapParty(
    trade.recipient_player_id,
    state.items,
    state.requests,
    state.acceptances,
    state.acknowledgements,
  );
  const settlement = await loadSettlementReceipt(client, trade.trade_id);
  const names = await loadParticipantNames(client, trade);
  return {
    tradeId: trade.trade_id,
    senderPlayerId: trade.sender_player_id,
    senderPlayerName: names.sender,
    recipientPlayerId: trade.recipient_player_id,
    recipientPlayerName: names.recipient,
    status: trade.status,
    version: trade.current_version,
    createdAt: trade.created_at.toISOString(),
    expiresAt: trade.expires_at.toISOString(),
    terminalAt: trade.terminal_at?.toISOString() ?? null,
    terminalReason: trade.terminal_reason,
    complete,
    imbalanceWarningRequired:
      complete && requiresImbalanceAcknowledgement(state.items, policy),
    sender,
    recipient,
    settlement,
  };
}

function mapParty(
  playerId: string,
  items: readonly VersionItemRow[],
  requests: readonly VersionRequestRow[],
  acceptances: readonly ApprovalRow[],
  acknowledgements: readonly ApprovalRow[],
): CardTradePartyView {
  const partyItems = items.filter(
    (item) => item.offering_player_id === playerId,
  );
  return {
    playerId,
    offeredCopies: partyItems.map((item) => ({
      position: item.position,
      ownedCardId: item.owned_card_id,
      cardDefinitionId: item.card_definition_id,
      name: item.name,
      category: item.category,
      affinity: item.affinity,
      rarity: item.rarity,
      imageUrl: item.image_url,
      imageAlt: item.image_alt,
      acquisitionKind: item.acquisition_kind,
      acquiredAt: item.acquired_at.toISOString(),
    })),
    requestedDefinitions: requests
      .filter((request) => request.requesting_player_id === playerId)
      .map((request) => ({
        cardDefinitionId: request.card_definition_id,
        quantity: request.quantity,
        name: request.name,
        category: request.category,
        affinity: request.affinity,
        rarity: request.rarity,
        imageUrl: request.image_url,
        imageAlt: request.image_alt,
      })),
    rarityPoints: partyItems.reduce(
      (total, item) => total + rarityTradePoints(item.rarity),
      0,
    ),
    accepted: acceptances.some(
      (acceptance) => acceptance.player_id === playerId,
    ),
    imbalanceAcknowledged: acknowledgements.some(
      (acknowledgement) => acknowledgement.player_id === playerId,
    ),
  };
}

async function loadParticipantNames(
  client: CardTradeClient,
  trade: TradeRow,
): Promise<{ sender: string; recipient: string }> {
  const result = await client.query<PlayerNameRow>(
    `
      select id::text, player_name
        from public.players
       where id = any($1::uuid[])
    `,
    [[trade.sender_player_id, trade.recipient_player_id]],
  );
  const byId = new Map(result.rows.map((row) => [row.id, row.player_name]));
  return {
    sender: byId.get(trade.sender_player_id) ?? 'Deleted player',
    recipient: byId.get(trade.recipient_player_id) ?? 'Deleted player',
  };
}

async function loadSettlementReceipt(
  client: CardTradeClient,
  tradeId: string,
): Promise<CardTradeSettlementReceipt | null> {
  const receiptResult = await client.query<ReceiptRow>(
    `
      select
        id::text as receipt_id,
        trade_id::text,
        version,
        completed_at,
        policy_version,
        minimum_account_age_seconds,
        maximum_open_offers,
        maximum_copies_per_side,
        maximum_completed_trades_24h,
        offer_lifetime_seconds,
        imbalance_warning_threshold,
        minimum_creature_copies,
        minimum_power_copies
      from private.card_trade_settlement_receipts
      where trade_id = $1::uuid
    `,
    [tradeId],
  );
  const receipt = receiptResult.rows[0];
  if (!receipt) return null;
  const movements = await client.query<MovementRow>(
    `
      select id::text as movement_id, source_player_id::text,
             recipient_player_id::text, source_owned_card_id::text,
             new_owned_card_id::text, card_definition_id::text
        from private.card_trade_movements
       where receipt_id = $1::uuid
       order by source_owned_card_id
    `,
    [receipt.receipt_id],
  );
  return {
    receiptId: receipt.receipt_id,
    tradeId: receipt.trade_id,
    version: receipt.version,
    completedAt: receipt.completed_at.toISOString(),
    policy: {
      policyVersion: receipt.policy_version,
      minimumAccountAgeSeconds: receipt.minimum_account_age_seconds,
      maximumOpenOffers: receipt.maximum_open_offers,
      maximumCopiesPerSide: receipt.maximum_copies_per_side,
      maximumCompletedTrades24h: receipt.maximum_completed_trades_24h,
      offerLifetimeSeconds: receipt.offer_lifetime_seconds,
      imbalanceWarningThreshold: receipt.imbalance_warning_threshold,
      minimumCreatureCopies: receipt.minimum_creature_copies,
      minimumPowerCopies: receipt.minimum_power_copies,
    },
    movements: movements.rows.map((movement) => ({
      movementId: movement.movement_id,
      sourcePlayerId: movement.source_player_id,
      recipientPlayerId: movement.recipient_player_id,
      sourceOwnedCardId: movement.source_owned_card_id,
      newOwnedCardId: movement.new_owned_card_id,
      cardDefinitionId: movement.card_definition_id,
    })),
  };
}

function validateDistinctPlayers(
  senderPlayerId: string,
  recipientPlayerId: string,
): void {
  if (senderPlayerId === recipientPlayerId) {
    throw new CardTradeError(
      'TRADE_PLAYER_UNAVAILABLE',
      'Trade participants must be distinct players.',
    );
  }
}

function validateOwnedCardIds(ownedCardIds: readonly string[]): void {
  if (ownedCardIds.length === 0) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'A trade side must offer at least one exact card copy.',
    );
  }
  const normalized = ownedCardIds.map((id) => id.toLowerCase());
  if (
    normalized.some((id) => !UUID_LOWERCASE.test(id)) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new CardTradeError(
      'TRADE_COPY_CONFLICT',
      'Trade card-copy identifiers must be unique UUIDs.',
    );
  }
}

function validateRequestedDefinitions(
  requests: readonly CardTradeRequestedDefinition[],
): void {
  if (requests.length === 0) {
    throw new CardTradeError(
      'TRADE_INCOMPLETE',
      'A trade side must request at least one card definition.',
    );
  }
  const ids = requests.map((request) => request.cardDefinitionId.toLowerCase());
  if (
    ids.some((id) => !UUID_LOWERCASE.test(id)) ||
    new Set(ids).size !== ids.length ||
    requests.some(
      (request) => !Number.isInteger(request.quantity) || request.quantity < 1,
    )
  ) {
    throw new CardTradeError(
      'TRADE_INCOMPLETE',
      'Requested card definitions and quantities are invalid.',
    );
  }
}

function validateSideLimits(
  ownedCardIds: readonly string[],
  requests: readonly CardTradeRequestedDefinition[],
  policy: CardTradePolicyLimits,
): void {
  const requestedCount = requests.reduce(
    (total, request) => total + request.quantity,
    0,
  );
  if (
    ownedCardIds.length > policy.maximumCopiesPerSide ||
    requestedCount < 1 ||
    requestedCount > policy.maximumCopiesPerSide
  ) {
    throw new CardTradeError(
      'TRADE_PLAYER_LIMIT_REACHED',
      'A trade side exceeds the configured card-copy limit.',
    );
  }
}

function assertParticipant(trade: TradeRow, playerId: string): void {
  if (
    playerId !== trade.sender_player_id &&
    playerId !== trade.recipient_player_id
  ) {
    throw new CardTradeError(
      'TRADE_NOT_PARTICIPANT',
      'Only trade participants may access this trade.',
    );
  }
}

function otherParticipant(trade: TradeRow, playerId: string): string {
  if (playerId === trade.sender_player_id) return trade.recipient_player_id;
  if (playerId === trade.recipient_player_id) return trade.sender_player_id;
  throw new CardTradeError(
    'TRADE_NOT_PARTICIPANT',
    'Only trade participants may access this trade.',
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))].sort();
}

async function databaseNow(client: CardTradeClient): Promise<Date> {
  const result = await client.query<{ now: Date }>(
    `select clock_timestamp() as now`,
  );
  const now = result.rows[0]?.now;
  if (!now) throw new Error('Database did not return card trade time.');
  return now;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
