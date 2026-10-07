import type pg from 'pg';
import { randomUUID } from 'node:crypto';

import {
  TrustActivityRestrictedError,
  type TrustRestrictionService,
} from '../trust/trust-restrictions.js';
import {
  loadPlayerBattleDeck,
  PlayerBattleDeckError,
} from './player-battle-deck.js';
import {
  rankedConflict,
  rankedDatabaseNow,
  RankedError,
  rankedTransaction,
  rankedUnavailable,
  type RankedClient,
  type RankedDatabase,
} from './ranked-database.js';
import { createRankedLiveMatch } from './ranked-match-creation.js';
import { rankedSearchRange } from './ranked-policy.js';
import {
  createGameplayMutationGuard,
  GameplayCoordinationUnavailable,
} from './gameplay-coordination.js';
import type { GameplayActivityStore } from './gameplay-activity-store.js';
import {
  assertTerritoryQueueGrantAvailable,
  createTerritoryQueueGrant,
  loadTerritoryGrantForQueue,
  TerritoryGrantUnavailableError,
  type TerritoryClaim,
} from '../territory/territory-grants.js';

type QueueStatus =
  | 'searching'
  | 'proposed'
  | 'matched'
  | 'cancelled'
  | 'expired'
  | 'restricted'
  | 'invalid_deck';
type AcceptanceStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'timed_out'
  | 'invalid'
  | 'system_cancelled';

interface SeasonRow extends pg.QueryResultRow {
  id: string;
  policy_version: string;
  status: 'scheduled' | 'active' | 'closing' | 'closed';
  active_ends_at: Date | null;
}

interface QueueRow extends pg.QueryResultRow {
  id: string;
  season_id: string;
  player_id: string;
  selected_deck_id: string | null;
  status: QueueStatus;
  original_joined_at: Date;
  lease_expires_at: Date | null;
  active_proposal_id: string | null;
  terminal_at: Date | null;
  version: number;
  territory_contender: boolean;
}

interface ProposalRow extends pg.QueryResultRow {
  id: string;
  season_id: string;
  status: 'awaiting_acceptance' | 'matched' | 'cancelled' | 'expired';
  acceptance_deadline: Date;
}

interface ProposalPlayer extends pg.QueryResultRow {
  player_id: string;
  queue_entry_id: string;
  acceptance_status: AcceptanceStatus;
  selected_deck_id: string | null;
  original_joined_at: Date;
  territory_contender: boolean;
}

interface QueueViewRow extends QueueRow {
  acceptance_deadline: Date | null;
  acceptance_status: AcceptanceStatus | null;
  match_id: string | null;
}

export interface RankedQueueView {
  status: QueueStatus | 'idle';
  queueEntryId: string | null;
  seasonId: string | null;
  joinedAt: string | null;
  leaseExpiresAt: string | null;
  searchRange: number | null;
  proposalId: string | null;
  acceptanceDeadline: string | null;
  accepted: boolean;
  matchId: string | null;
}

export interface RankedService {
  join(
    playerId: string,
    deckId: string,
    territoryClaim?: TerritoryClaim,
  ): Promise<RankedQueueView>;
  status(playerId: string): Promise<RankedQueueView>;
  heartbeat(playerId: string): Promise<RankedQueueView>;
  cancel(playerId: string): Promise<RankedQueueView>;
  accept(playerId: string, proposalId: string): Promise<RankedQueueView>;
  decline(playerId: string, proposalId: string): Promise<RankedQueueView>;
  expireQueueEntries(limit?: number): Promise<number>;
  expireProposals(limit?: number): Promise<number>;
  pairOnce(): Promise<boolean>;
}

export function createRankedService(
  database: RankedDatabase,
  trustRestrictions: TrustRestrictionService,
  options: {
    activityStore?: GameplayActivityStore;
    logger?: { error(context: Record<string, unknown>, message: string): void };
  } = {},
): RankedService {
  async function mutation<T>(
    operation: (client: RankedClient) => Promise<T>,
    createsMatch = false,
  ): Promise<T> {
    const guard = options.activityStore
      ? createGameplayMutationGuard(
          options.activityStore,
          createsMatch ? ['live', 'ranked'] : ['ranked'],
          options.logger ?? { error: () => {} },
        )
      : undefined;
    try {
      return await rankedTransaction(database, operation, guard);
    } catch (error) {
      if (error instanceof GameplayCoordinationUnavailable) {
        throw new RankedError(
          503,
          'GAMEPLAY_COORDINATION_UNAVAILABLE',
          error.message,
        );
      }
      throw error;
    }
  }

  async function status(playerId: string): Promise<RankedQueueView> {
    const client = await database.connect();
    try {
      const now = await rankedDatabaseNow(client);
      return loadQueueView(client, playerId, now);
    } finally {
      client.release();
    }
  }

  async function join(
    playerId: string,
    deckId: string,
    territoryClaim?: TerritoryClaim,
  ): Promise<RankedQueueView> {
    return mutation(async (client) => {
      const player = await client.query<{ lifecycle_status: string }>(
        `select lifecycle_status from public.players
          where id = $1::uuid for update`,
        [playerId],
      );
      if (player.rows[0]?.lifecycle_status !== 'active') {
        throw rankedUnavailable();
      }
      const season = await loadCurrentSeason(client, 'for share');
      const now = await rankedDatabaseNow(client);
      if (
        !season ||
        season.policy_version !== 'ranked-v1' ||
        season.status !== 'active' ||
        !season.active_ends_at ||
        now >= season.active_ends_at
      ) {
        throw rankedUnavailable();
      }

      const active = await loadActiveQueue(client, playerId, true);
      if (active) {
        if (
          active.status === 'searching' &&
          active.lease_expires_at &&
          now >= active.lease_expires_at
        ) {
          await terminalizeQueue(client, active.id, 'expired', now);
        } else if (
          active.status === 'searching' &&
          active.territory_contender
        ) {
          try {
            await assertTerritoryQueueGrantAvailable(client, {
              queueEntryId: active.id,
              playerId,
              territoryContender: true,
              now,
              lock: true,
            });
          } catch (error) {
            if (!(error instanceof TerritoryGrantUnavailableError)) throw error;
            await terminalizeQueue(client, active.id, 'cancelled', now);
          }
        }
        const stillActive = await loadActiveQueue(client, playerId, true);
        if (stillActive) {
          if (
            stillActive.selected_deck_id !== deckId ||
            stillActive.territory_contender !== Boolean(territoryClaim)
          ) {
            throw rankedConflict();
          }
          if (territoryClaim) {
            const grant = await loadTerritoryGrantForQueue(
              client,
              stillActive.id,
              true,
            );
            if (!grant || grant.zone_id !== territoryClaim.zoneId) {
              throw rankedConflict();
            }
          }
          return loadQueueView(client, playerId, now);
        }
      }

      const cooldown = await client.query<{ cooldown_until: Date }>(
        `select cooldown_until from (
           select cooldown_until
             from private.ranked_matchmaking_proposal_participants
            where player_id = $1::uuid
           union all
           select cooldown_until
             from private.ranked_queue_entries
            where player_id = $1::uuid
         ) cooldown
          where cooldown_until > $2::timestamptz
          order by cooldown_until desc
          limit 1`,
        [playerId, now],
      );
      if (cooldown.rows[0]) {
        throw new RankedError(
          409,
          'RANKED_COOLDOWN',
          'Ranked matchmaking is temporarily unavailable.',
        );
      }

      await assertPlayerEligible(client, playerId, deckId, trustRestrictions);
      await ensureSeasonRating(client, season.id, playerId, now);
      const queueEntryId = randomUUID();
      await client.query(
        `insert into private.ranked_queue_entries (
           id, season_id, player_id, selected_deck_id, territory_contender,
           original_joined_at, lease_expires_at, created_at, updated_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
           $6::timestamptz + interval '30 seconds', $6, $6
         )`,
        [
          queueEntryId,
          season.id,
          playerId,
          deckId,
          Boolean(territoryClaim),
          now,
        ],
      );
      if (territoryClaim) {
        await createTerritoryQueueGrant(client, {
          queueEntryId,
          seasonId: season.id,
          playerId,
          claim: territoryClaim,
          now,
        });
      }
      return loadQueueView(client, playerId, now);
    });
  }

  async function heartbeat(playerId: string): Promise<RankedQueueView> {
    return mutation(async (client) => {
      const queue = await loadActiveQueue(client, playerId, true);
      const now = await rankedDatabaseNow(client);
      if (!queue || queue.status !== 'searching') {
        return loadQueueView(client, playerId, now);
      }
      if (!queue.lease_expires_at || now >= queue.lease_expires_at) {
        await terminalizeQueue(client, queue.id, 'expired', now);
      } else {
        await client.query(
          `update private.ranked_queue_entries
              set version = version + 1, updated_at = $2,
                  lease_expires_at = $2::timestamptz + interval '30 seconds'
            where id = $1::uuid and status = 'searching'`,
          [queue.id, now],
        );
      }
      return loadQueueView(client, playerId, now);
    });
  }

  async function cancel(playerId: string): Promise<RankedQueueView> {
    // The preview is only a routing hint. Every state decision is made again
    // while holding the same player/proposal locks as accept and expiry.
    for (;;) {
      const proposal = await database.query<{ active_proposal_id: string }>(
        `select active_proposal_id::text
           from private.ranked_queue_entries
          where player_id = $1::uuid and status = 'proposed'
          limit 1`,
        [playerId],
      );
      const proposalId = proposal.rows[0]?.active_proposal_id;
      if (proposalId) {
        const result = await respond(playerId, proposalId, 'declined', true);
        if (result) return result;
        continue;
      }
      const result = await mutation(async (client) => {
        await lockPlayers(client, [playerId]);
        const queue = await loadActiveQueue(client, playerId, true);
        const now = await rankedDatabaseNow(client);
        if (queue?.status === 'proposed') return null;
        if (queue?.status === 'searching') {
          await terminalizeQueue(
            client,
            queue.id,
            queue.lease_expires_at && now >= queue.lease_expires_at
              ? 'expired'
              : 'cancelled',
            now,
          );
        }
        return loadQueueView(client, playerId, now);
      });
      if (result) return result;
    }
  }

  async function finishCancellation(
    client: RankedClient,
    playerId: string,
    now: Date,
  ): Promise<RankedQueueView | null> {
    const queue = await loadActiveQueue(client, playerId, true);
    if (queue?.status === 'proposed') return null;
    if (queue?.status === 'searching') {
      await terminalizeQueue(client, queue.id, 'cancelled', now);
    }
    return loadQueueView(client, playerId, now);
  }

  async function respond(
    playerId: string,
    proposalId: string,
    response: 'accepted' | 'declined',
    cancelIntent: true,
  ): Promise<RankedQueueView | null>;
  async function respond(
    playerId: string,
    proposalId: string,
    response: 'accepted' | 'declined',
  ): Promise<RankedQueueView>;
  async function respond(
    playerId: string,
    proposalId: string,
    response: 'accepted' | 'declined',
    cancelIntent = false,
  ): Promise<RankedQueueView | null> {
    return mutation(async (client) => {
      const proposalPreview = await client.query<ProposalRow>(
        `select id::text, season_id::text, status, acceptance_deadline
           from private.ranked_matchmaking_proposals
          where id = $1::uuid`,
        [proposalId],
      );
      const preview = proposalPreview.rows[0];
      if (!preview) throw proposalUnavailable();
      const season = await client.query<SeasonRow>(
        `select id::text, policy_version, status, active_ends_at
           from public.ranked_seasons
          where id = $1::uuid for share`,
        [preview.season_id],
      );
      const participantsPreview = await loadProposalPlayers(client, proposalId);
      if (!participantsPreview.some((row) => row.player_id === playerId)) {
        throw proposalUnavailable();
      }
      await lockPlayers(
        client,
        participantsPreview.map((row) => row.player_id),
      );
      const proposal = await loadProposal(client, proposalId, true);
      if (!proposal) throw proposalUnavailable();
      const players = await loadProposalPlayers(client, proposalId, true);
      if (players.length !== 2) throw new Error('Ranked proposal has no pair.');
      const own = players.find((row) => row.player_id === playerId)!;
      const now = await rankedDatabaseNow(client);
      const finish = () =>
        cancelIntent
          ? finishCancellation(client, playerId, now)
          : loadQueueView(client, playerId, now);
      if (cancelIntent) {
        const queue = await loadActiveQueue(client, playerId, true);
        if (
          queue?.status !== 'proposed' ||
          queue.active_proposal_id !== proposalId
        ) {
          return finishCancellation(client, playerId, now);
        }
      }
      if (proposal.status !== 'awaiting_acceptance') {
        if (proposal.status === 'matched') {
          const receipt = await client.query<{ match_id: string }>(
            `select match_id::text from private.ranked_matchmaking_receipts
              where proposal_id = $1::uuid`,
            [proposal.id],
          );
          if (!receipt.rows[0])
            throw new Error('Matched ranked proposal has no receipt.');
          return {
            status: 'matched',
            queueEntryId: own.queue_entry_id,
            seasonId: proposal.season_id,
            joinedAt: own.original_joined_at.toISOString(),
            leaseExpiresAt: null,
            searchRange: null,
            proposalId: null,
            acceptanceDeadline: null,
            accepted: false,
            matchId: receipt.rows[0].match_id,
          };
        }
        return finish();
      }
      if (
        season.rows[0]?.status !== 'active' ||
        season.rows[0]?.policy_version !== 'ranked-v1' ||
        !season.rows[0].active_ends_at ||
        now >= season.rows[0].active_ends_at
      ) {
        await resolveProposal(client, proposal, players, now, 'system');
        return finish();
      }
      if (now >= proposal.acceptance_deadline) {
        const invalid = await findInvalidPlayers(
          client,
          players.filter((player) => player.acceptance_status === 'accepted'),
          trustRestrictions,
        );
        await addUnavailableTerritoryPlayers(client, players, invalid, now);
        await resolveProposal(
          client,
          proposal,
          players,
          now,
          'timeout',
          invalid,
        );
        return finish();
      }
      if (own.acceptance_status !== 'pending') {
        if (own.acceptance_status === response) {
          return finish();
        }
        if (own.acceptance_status !== 'accepted' || response !== 'declined') {
          throw rankedConflict();
        }
      }
      await client.query(
        `update private.ranked_matchmaking_proposal_participants
            set acceptance_status = $3, responded_at = $4,
                cooldown_until = case when $3 = 'declined'
                  then $4::timestamptz + interval '30 seconds' else null end
          where proposal_id = $1::uuid and player_id = $2::uuid
            and acceptance_status = $5`,
        [proposalId, playerId, response, now, own.acceptance_status],
      );
      own.acceptance_status = response;
      if (response === 'declined') {
        const invalid = await findInvalidPlayers(
          client,
          players.filter((player) => player.acceptance_status === 'accepted'),
          trustRestrictions,
        );
        await resolveProposal(
          client,
          proposal,
          players,
          now,
          'decline',
          invalid,
        );
        return finish();
      }
      if (players.every((row) => row.acceptance_status === 'accepted')) {
        const invalid = await findInvalidPlayers(
          client,
          players,
          trustRestrictions,
        );
        if (invalid.size > 0) {
          await resolveProposal(
            client,
            proposal,
            players,
            now,
            'invalid',
            invalid,
          );
        } else {
          await createRankedLiveMatch(client, {
            proposalId,
            seasonId: proposal.season_id,
            policyVersion: season.rows[0].policy_version,
            players: players.map((row) => ({
              playerId: row.player_id,
              queueEntryId: row.queue_entry_id,
              deckId: row.selected_deck_id!,
              territoryContender: row.territory_contender,
            })) as [
              {
                playerId: string;
                queueEntryId: string;
                deckId: string;
                territoryContender: boolean;
              },
              {
                playerId: string;
                queueEntryId: string;
                deckId: string;
                territoryContender: boolean;
              },
            ],
            now,
          });
        }
      }
      return finish();
    }, response === 'accepted');
  }

  return {
    join,
    status,
    heartbeat,
    cancel,
    accept: (playerId, proposalId) => respond(playerId, proposalId, 'accepted'),
    decline: (playerId, proposalId) =>
      respond(playerId, proposalId, 'declined'),
    expireQueueEntries: (limit = 50) => expireQueueEntries(database, limit),
    expireProposals: (limit = 25) =>
      expireProposals(database, trustRestrictions, limit),
    pairOnce: () => pairOnce(database, trustRestrictions),
  };
}

function proposalUnavailable(): RankedError {
  return new RankedError(
    404,
    'RANKED_PROPOSAL_UNAVAILABLE',
    'The ranked proposal is unavailable.',
  );
}

async function loadCurrentSeason(
  client: RankedClient,
  lock: '' | 'for share' | 'for update' = '',
): Promise<SeasonRow | null> {
  const result = await client.query<SeasonRow>(
    `select id::text, policy_version, status, active_ends_at
       from public.ranked_seasons
      where status in ('active', 'closing')
      limit 1 ${lock}`,
  );
  return result.rows[0] ?? null;
}

async function loadActiveQueue(
  client: RankedClient,
  playerId: string,
  lock: boolean,
): Promise<QueueRow | null> {
  const result = await client.query<QueueRow>(
    `select id::text, season_id::text, player_id::text,
            selected_deck_id::text, status, original_joined_at,
            lease_expires_at, active_proposal_id::text, terminal_at, version,
            territory_contender
       from private.ranked_queue_entries
      where player_id = $1::uuid and status in ('searching', 'proposed')
      limit 1 ${lock ? 'for update' : ''}`,
    [playerId],
  );
  return result.rows[0] ?? null;
}

async function loadQueueView(
  client: RankedClient,
  playerId: string,
  now: Date,
): Promise<RankedQueueView> {
  const result = await client.query<QueueViewRow>(
    `select queue.id::text, queue.season_id::text, queue.player_id::text,
            queue.selected_deck_id::text, queue.status, queue.original_joined_at,
            queue.lease_expires_at, queue.active_proposal_id::text,
            queue.terminal_at, queue.version, queue.territory_contender,
            proposal.acceptance_deadline,
            response.acceptance_status,
            receipt.match_id::text
       from private.ranked_queue_entries queue
       left join lateral (
         select participant.proposal_id, participant.acceptance_status
           from private.ranked_matchmaking_proposal_participants participant
          where participant.queue_entry_id = queue.id
          order by (participant.proposal_id = queue.active_proposal_id) desc,
                   participant.created_at desc, participant.proposal_id desc
          limit 1
       ) response on true
       left join private.ranked_matchmaking_proposals proposal
         on proposal.id = response.proposal_id
       left join private.ranked_matchmaking_receipts receipt
         on receipt.proposal_id = response.proposal_id
      where queue.player_id = $1::uuid
      order by queue.created_at desc, queue.id desc
      limit 1`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      status: 'idle',
      queueEntryId: null,
      seasonId: null,
      joinedAt: null,
      leaseExpiresAt: null,
      searchRange: null,
      proposalId: null,
      acceptanceDeadline: null,
      accepted: false,
      matchId: null,
    };
  }
  const status =
    row.status === 'searching' &&
    row.lease_expires_at &&
    now >= row.lease_expires_at
      ? 'expired'
      : row.status;
  return {
    status,
    queueEntryId: row.id,
    seasonId: row.season_id,
    joinedAt: row.original_joined_at.toISOString(),
    leaseExpiresAt:
      status === 'searching'
        ? (row.lease_expires_at?.toISOString() ?? null)
        : null,
    searchRange:
      status === 'searching'
        ? rankedSearchRange(now.getTime() - row.original_joined_at.getTime())
        : null,
    proposalId: status === 'proposed' ? row.active_proposal_id : null,
    acceptanceDeadline:
      status === 'proposed'
        ? (row.acceptance_deadline?.toISOString() ?? null)
        : null,
    accepted: status === 'proposed' && row.acceptance_status === 'accepted',
    matchId: status === 'matched' ? row.match_id : null,
  };
}

async function terminalizeQueue(
  client: RankedClient,
  queueId: string,
  status: Extract<
    QueueStatus,
    'cancelled' | 'expired' | 'restricted' | 'invalid_deck'
  >,
  now: Date,
): Promise<void> {
  await client.query(
    `update private.ranked_queue_entries
        set status = $2, version = version + 1,
            lease_expires_at = null, active_proposal_id = null,
            terminal_at = $3, updated_at = $3
      where id = $1::uuid and status = 'searching'`,
    [queueId, status, now],
  );
}

async function ensureSeasonRating(
  client: RankedClient,
  seasonId: string,
  playerId: string,
  now: Date,
): Promise<void> {
  const previous = await client.query<{
    season_id: string;
    rating: number;
  }>(
    `select previous.id::text as season_id, rating.rating
       from public.ranked_seasons previous
       left join public.ranked_player_season_ratings rating
         on rating.season_id = previous.id and rating.player_id = $1::uuid
      where previous.status = 'closed'
      order by previous.closed_at desc, previous.id desc
      limit 1`,
    [playerId],
  );
  const prior = previous.rows[0];
  const initial =
    prior?.rating != null
      ? Math.max(
          100,
          1000 +
            Math.sign(prior.rating - 1000) *
              Math.round(Math.abs(prior.rating - 1000) * 0.5),
        )
      : 1000;
  await client.query(
    `insert into public.ranked_player_season_ratings (
       season_id, player_id, starting_rating, rating,
       rating_first_reached_at, carried_from_season_id,
       created_at, updated_at
     ) values (
       $1::uuid, $2::uuid, $3, $3,
       $4, $5::uuid, $4, $4
     ) on conflict (season_id, player_id) do nothing`,
    [
      seasonId,
      playerId,
      initial,
      now,
      prior?.rating != null ? prior.season_id : null,
    ],
  );
}

async function assertPlayerEligible(
  client: RankedClient,
  playerId: string,
  deckId: string,
  restrictions: TrustRestrictionService,
): Promise<void> {
  const player = await client.query<{ lifecycle_status: string }>(
    `select lifecycle_status from public.players where id = $1::uuid`,
    [playerId],
  );
  if (player.rows[0]?.lifecycle_status !== 'active') {
    throw rankedUnavailable();
  }
  const activeMatch = await client.query<{ id: string }>(
    `select match.id::text
       from public.live_pvp_matches match
       join public.live_pvp_match_participants participant
         on participant.match_id = match.id
      where participant.player_id = $1::uuid and match.status = 'active'
      limit 1`,
    [playerId],
  );
  if (activeMatch.rows[0]) {
    throw new RankedError(
      409,
      'RANKED_ALREADY_PLAYING',
      'Finish the current live match before joining ranked matchmaking.',
    );
  }
  try {
    await restrictions.assertAllowed(
      playerId,
      'new_competitive_match_hold',
      client,
    );
  } catch (error) {
    if (!(error instanceof TrustActivityRestrictedError)) throw error;
    throw new RankedError(
      403,
      'RANKED_RESTRICTED',
      'Ranked matchmaking is temporarily unavailable.',
    );
  }
  try {
    await loadPlayerBattleDeck(client, playerId, deckId);
  } catch (error) {
    if (!(error instanceof PlayerBattleDeckError)) throw error;
    throw new RankedError(
      409,
      'RANKED_DECK_INVALID',
      'The selected deck is unavailable for ranked play.',
    );
  }
}

async function lockPlayers(client: RankedClient, playerIds: readonly string[]) {
  const result = await client.query<{ id: string }>(
    `select id::text from public.players
      where id = any($1::uuid[])
      order by id for update`,
    [playerIds],
  );
  if (result.rows.length !== playerIds.length) {
    throw rankedUnavailable();
  }
}

async function loadProposal(
  client: RankedClient,
  proposalId: string,
  lock = false,
): Promise<ProposalRow | null> {
  const result = await client.query<ProposalRow>(
    `select id::text, season_id::text, status, acceptance_deadline
       from private.ranked_matchmaking_proposals
      where id = $1::uuid ${lock ? 'for update' : ''}`,
    [proposalId],
  );
  return result.rows[0] ?? null;
}

async function loadProposalPlayers(
  client: RankedClient,
  proposalId: string,
  lock = false,
): Promise<ProposalPlayer[]> {
  const result = await client.query<ProposalPlayer>(
    `select response.player_id::text, response.queue_entry_id::text,
            response.acceptance_status, queue.selected_deck_id::text,
            queue.original_joined_at, queue.territory_contender
       from private.ranked_matchmaking_proposal_participants response
       join private.ranked_queue_entries queue
         on queue.id = response.queue_entry_id
      where response.proposal_id = $1::uuid
      order by queue.original_joined_at, response.player_id
      ${lock ? 'for update of response, queue' : ''}`,
    [proposalId],
  );
  return result.rows;
}

async function findInvalidPlayers(
  client: RankedClient,
  players: readonly ProposalPlayer[],
  restrictions: TrustRestrictionService,
): Promise<Map<string, 'invalid_deck' | 'restricted' | 'cancelled'>> {
  const invalid = new Map<
    string,
    'invalid_deck' | 'restricted' | 'cancelled'
  >();
  for (const player of players) {
    if (!player.selected_deck_id) {
      invalid.set(player.player_id, 'invalid_deck');
      continue;
    }
    try {
      await assertPlayerEligible(
        client,
        player.player_id,
        player.selected_deck_id,
        restrictions,
      );
      await assertTerritoryQueueGrantAvailable(client, {
        queueEntryId: player.queue_entry_id,
        playerId: player.player_id,
        territoryContender: player.territory_contender,
        now: await rankedDatabaseNow(client),
        lock: true,
      });
    } catch (error) {
      if (error instanceof TerritoryGrantUnavailableError) {
        invalid.set(player.player_id, 'cancelled');
      } else if (error instanceof RankedError) {
        invalid.set(
          player.player_id,
          error.code === 'RANKED_DECK_INVALID'
            ? 'invalid_deck'
            : error.code === 'RANKED_RESTRICTED'
              ? 'restricted'
              : 'cancelled',
        );
      } else {
        throw error;
      }
    }
  }
  return invalid;
}

async function addUnavailableTerritoryPlayers(
  client: RankedClient,
  players: readonly ProposalPlayer[],
  invalid: Map<string, 'invalid_deck' | 'restricted' | 'cancelled'>,
  now: Date,
): Promise<void> {
  for (const player of players) {
    if (invalid.has(player.player_id) || !player.territory_contender) continue;
    try {
      await assertTerritoryQueueGrantAvailable(client, {
        queueEntryId: player.queue_entry_id,
        playerId: player.player_id,
        territoryContender: true,
        now,
        lock: true,
      });
    } catch (error) {
      if (!(error instanceof TerritoryGrantUnavailableError)) throw error;
      invalid.set(player.player_id, 'cancelled');
    }
  }
}

async function resolveProposal(
  client: RankedClient,
  proposal: ProposalRow,
  players: readonly ProposalPlayer[],
  now: Date,
  reason: 'timeout' | 'decline' | 'system' | 'invalid',
  invalid?: Map<string, 'invalid_deck' | 'restricted' | 'cancelled'>,
): Promise<void> {
  for (const player of players) {
    if (player.acceptance_status !== 'pending') continue;
    const nextStatus: AcceptanceStatus = invalid?.has(player.player_id)
      ? 'invalid'
      : reason === 'timeout'
        ? 'timed_out'
        : reason === 'decline'
          ? 'timed_out'
          : reason === 'system'
            ? 'system_cancelled'
            : 'system_cancelled';
    await client.query(
      `update private.ranked_matchmaking_proposal_participants
          set acceptance_status = $3, responded_at = $4,
              cooldown_until = case when $3 = 'timed_out'
                then $4::timestamptz + interval '30 seconds' else null end
        where proposal_id = $1::uuid and player_id = $2::uuid
          and acceptance_status = 'pending'`,
      [proposal.id, player.player_id, nextStatus, now],
    );
    player.acceptance_status = nextStatus;
  }

  for (const player of players) {
    const terminalStatus: QueueStatus | null =
      reason === 'system'
        ? 'cancelled'
        : invalid?.has(player.player_id)
          ? invalid.get(player.player_id)!
          : player.acceptance_status === 'declined'
            ? 'cancelled'
            : player.acceptance_status === 'timed_out'
              ? 'expired'
              : null;
    if (terminalStatus) {
      await client.query(
        `update private.ranked_queue_entries
            set status = $2, version = version + 1,
                lease_expires_at = null, active_proposal_id = null,
                terminal_at = $3, updated_at = $3,
                cooldown_until = case when $2 in ('invalid_deck', 'restricted')
                  then $3::timestamptz + interval '30 seconds' else null end
          where id = $1::uuid and status = 'proposed'`,
        [player.queue_entry_id, terminalStatus, now],
      );
    } else {
      await client.query(
        `update private.ranked_queue_entries
            set status = 'searching', version = version + 1,
                lease_expires_at = $2::timestamptz + interval '30 seconds',
                active_proposal_id = null, terminal_at = null, updated_at = $2
          where id = $1::uuid and status = 'proposed'`,
        [player.queue_entry_id, now],
      );
    }
  }
  await client.query(
    `update private.ranked_matchmaking_proposals
        set status = $2, version = version + 1, resolved_at = $3
      where id = $1::uuid and status = 'awaiting_acceptance'`,
    [proposal.id, reason === 'timeout' ? 'expired' : 'cancelled', now],
  );
}

async function expireQueueEntries(
  database: RankedDatabase,
  limit: number,
): Promise<number> {
  return rankedTransaction(database, async (client) => {
    const now = await rankedDatabaseNow(client);
    const result = await client.query<{ id: string }>(
      `with due as (
         select id from private.ranked_queue_entries
          where status = 'searching' and lease_expires_at <= $1
          order by lease_expires_at, id
          limit $2 for update skip locked
       )
       update private.ranked_queue_entries queue
          set status = 'expired', version = queue.version + 1,
              lease_expires_at = null, terminal_at = $1, updated_at = $1
         from due
        where queue.id = due.id
       returning queue.id::text`,
      [now, limit],
    );
    return result.rows.length;
  });
}

async function expireProposals(
  database: RankedDatabase,
  restrictions: TrustRestrictionService,
  limit: number,
): Promise<number> {
  const due = await database.query<{ id: string }>(
    `select id::text from private.ranked_matchmaking_proposals
      where status = 'awaiting_acceptance'
        and acceptance_deadline <= clock_timestamp()
      order by acceptance_deadline, id limit $1`,
    [limit],
  );
  let expired = 0;
  for (const { id } of due.rows) {
    const resolved = await rankedTransaction(database, async (client) => {
      const preview = await loadProposal(client, id);
      if (!preview || preview.status !== 'awaiting_acceptance') return false;
      const season = await client.query<SeasonRow>(
        `select id::text, policy_version, status, active_ends_at
           from public.ranked_seasons
          where id = $1::uuid for share`,
        [preview.season_id],
      );
      const playersPreview = await loadProposalPlayers(client, id);
      await lockPlayers(
        client,
        playersPreview.map((row) => row.player_id),
      );
      const proposal = await loadProposal(client, id, true);
      if (!proposal || proposal.status !== 'awaiting_acceptance') return false;
      const players = await loadProposalPlayers(client, id, true);
      const now = await rankedDatabaseNow(client);
      if (
        season.rows[0]?.status !== 'active' ||
        !season.rows[0].active_ends_at ||
        now >= season.rows[0].active_ends_at
      ) {
        await resolveProposal(client, proposal, players, now, 'system');
      } else if (now >= proposal.acceptance_deadline) {
        const invalid = await findInvalidPlayers(
          client,
          players.filter((player) => player.acceptance_status === 'accepted'),
          restrictions,
        );
        await addUnavailableTerritoryPlayers(client, players, invalid, now);
        await resolveProposal(
          client,
          proposal,
          players,
          now,
          'timeout',
          invalid,
        );
      } else {
        return false;
      }
      return true;
    });
    if (resolved) expired += 1;
  }
  return expired;
}

interface SearchEntry extends pg.QueryResultRow {
  id: string;
  player_id: string;
  selected_deck_id: string;
  original_joined_at: Date;
  lease_expires_at: Date;
  rating: number;
  territory_contender: boolean;
}

async function pairOnce(
  database: RankedDatabase,
  restrictions: TrustRestrictionService,
): Promise<boolean> {
  return rankedTransaction(database, async (client) => {
    const season = await loadCurrentSeason(client, 'for share');
    const now = await rankedDatabaseNow(client);
    if (
      !season ||
      season.policy_version !== 'ranked-v1' ||
      season.status !== 'active' ||
      !season.active_ends_at ||
      now >= season.active_ends_at
    ) {
      return false;
    }
    const anchors = await client.query<SearchEntry>(
      `select queue.id::text, queue.player_id::text,
              queue.selected_deck_id::text, queue.original_joined_at,
              queue.lease_expires_at, rating.rating, queue.territory_contender
         from private.ranked_queue_entries queue
         join public.ranked_player_season_ratings rating
           on rating.season_id = queue.season_id
          and rating.player_id = queue.player_id
        where queue.season_id = $1::uuid and queue.status = 'searching'
          and queue.lease_expires_at > $2
        order by queue.original_joined_at, queue.id
        `,
      [season.id, now],
    );
    for (const anchor of anchors.rows) {
      const candidates = await client.query<SearchEntry>(
        `select queue.id::text, queue.player_id::text,
                queue.selected_deck_id::text, queue.original_joined_at,
                queue.lease_expires_at, rating.rating, queue.territory_contender
           from private.ranked_queue_entries queue
           join public.ranked_player_season_ratings rating
             on rating.season_id = queue.season_id
            and rating.player_id = queue.player_id
          where queue.season_id = $1::uuid
            and queue.status = 'searching'
            and queue.lease_expires_at > $2
            and queue.player_id <> $3::uuid
            and abs(rating.rating - $4::integer) <= least(
              least(400, 100 + 50 * floor(
                greatest(0, extract(epoch from ($2::timestamptz - $5::timestamptz))) / 15
              )::integer),
              least(400, 100 + 50 * floor(
                greatest(0, extract(epoch from ($2::timestamptz - queue.original_joined_at))) / 15
              )::integer)
            )
          order by abs(rating.rating - $4::integer),
                   queue.original_joined_at, queue.player_id
          limit 1`,
        [
          season.id,
          now,
          anchor.player_id,
          anchor.rating,
          anchor.original_joined_at,
        ],
      );
      const candidate = candidates.rows[0];
      if (!candidate) continue;
      await lockPlayers(client, [anchor.player_id, candidate.player_id]);
      const locked = await client.query<SearchEntry>(
        `select queue.id::text, queue.player_id::text,
                queue.selected_deck_id::text, queue.original_joined_at,
                queue.lease_expires_at, rating.rating, queue.territory_contender
           from private.ranked_queue_entries queue
           join public.ranked_player_season_ratings rating
             on rating.season_id = queue.season_id
            and rating.player_id = queue.player_id
          where queue.id = any($1::uuid[])
            and queue.status = 'searching'
          order by queue.id for update of queue skip locked`,
        [[anchor.id, candidate.id]],
      );
      if (locked.rows.length !== 2) continue;
      const first = locked.rows.find((row) => row.id === anchor.id);
      const second = locked.rows.find((row) => row.id === candidate.id);
      const claimNow = await rankedDatabaseNow(client);
      if (
        !first ||
        !second ||
        claimNow >= season.active_ends_at ||
        claimNow >= first.lease_expires_at ||
        claimNow >= second.lease_expires_at ||
        Math.abs(first.rating - second.rating) >
          Math.min(
            rankedSearchRange(
              claimNow.getTime() - first.original_joined_at.getTime(),
            ),
            rankedSearchRange(
              claimNow.getTime() - second.original_joined_at.getTime(),
            ),
          )
      ) {
        continue;
      }
      let invalid = false;
      for (const entry of [first, second]) {
        try {
          await assertPlayerEligible(
            client,
            entry.player_id,
            entry.selected_deck_id,
            restrictions,
          );
          await assertTerritoryQueueGrantAvailable(client, {
            queueEntryId: entry.id,
            playerId: entry.player_id,
            territoryContender: entry.territory_contender,
            now: claimNow,
            lock: true,
          });
        } catch (error) {
          if (error instanceof TerritoryGrantUnavailableError) {
            await terminalizeQueue(client, entry.id, 'cancelled', claimNow);
            invalid = true;
            continue;
          }
          if (!(error instanceof RankedError)) throw error;
          await terminalizeQueue(
            client,
            entry.id,
            error.code === 'RANKED_DECK_INVALID'
              ? 'invalid_deck'
              : error.code === 'RANKED_RESTRICTED'
                ? 'restricted'
                : 'cancelled',
            claimNow,
          );
          invalid = true;
        }
      }
      if (invalid) return false;

      const proposalId = randomUUID();
      await client.query(
        `insert into private.ranked_matchmaking_proposals (
           id, season_id, created_at, acceptance_deadline
         ) values (
           $1::uuid, $2::uuid, $3, $3::timestamptz + interval '20 seconds'
         )`,
        [proposalId, season.id, claimNow],
      );
      const update = await client.query<{ id: string }>(
        `update private.ranked_queue_entries
            set status = 'proposed', version = version + 1,
                lease_expires_at = null, active_proposal_id = $2::uuid,
                updated_at = $3
          where id = any($1::uuid[]) and status = 'searching'
          returning id::text`,
        [[first.id, second.id], proposalId, claimNow],
      );
      if (update.rows.length !== 2) {
        throw new Error('Ranked pair claim lost a queue entry.');
      }
      for (const entry of [first, second]) {
        await client.query(
          `insert into private.ranked_matchmaking_proposal_participants (
             proposal_id, season_id, player_id, queue_entry_id, created_at
           ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)`,
          [proposalId, season.id, entry.player_id, entry.id, claimNow],
        );
      }
      return true;
    }
    return false;
  });
}
