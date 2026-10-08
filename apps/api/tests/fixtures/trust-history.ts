import { randomUUID } from 'node:crypto';
import type pg from 'pg';

type Queryable = Pick<pg.PoolClient, 'query'>;

export async function insertTrustHistoryPlayer(
  database: Queryable,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `insert into public.players (id, auth_issuer, auth_subject, player_name, role)
    values ($1, 'https://issuer.example/', $2, $3, 'player')`,
    [id, `trust-history-${id}`, `hist_${id.slice(0, 8)}`],
  );
  return id;
}

/** Complete, constraint-valid Live history; caller owns BEGIN/COMMIT. */
export async function insertTrustHistoryLiveMatch(
  client: Queryable,
  input: {
    pair: readonly string[];
    completedAt: Date;
    reason?:
      | 'defeat'
      | 'abandonment_forfeit'
      | 'voluntary_resignation'
      | 'account_deletion_forfeit';
    winner?: string;
    matchId?: string;
  },
): Promise<string> {
  const matchId = input.matchId ?? randomUUID();
  const started = new Date(input.completedAt.getTime() - 60_000);
  const winner = input.winner ?? input.pair[0]!;
  const reason = input.reason ?? 'abandonment_forfeit';
  await client.query(
    `insert into public.live_pvp_matches (
    id,status,version,phase,current_actor_player_id,decision_started_at,turn_deadline,started_at,created_at,updated_at
  ) values ($1,'active',0,'initial_selection',null,$2,$3,$2,$2,$2)`,
    [matchId, started, input.completedAt],
  );
  for (const [index, playerId] of input.pair.entries()) {
    const snapshotId = randomUUID();
    const side = index === 0 ? 'player_one' : 'player_two';
    await client.query(
      `insert into private.live_pvp_deck_snapshots (id,match_id,player_id,participant_side,source_deck_id)
      values ($1,$2,$3,$4,$5)`,
      [snapshotId, matchId, playerId, side, randomUUID()],
    );
    // Match the existing Live persistence fixture: three creatures, two powers.
    await client.query(
      `insert into private.live_pvp_deck_snapshot_cards (
      snapshot_id,position,battle_card_id,source_owned_card_id,source_card_definition_id,category,affinity,rarity,card_snapshot
    ) select $1, row_number() over(order by category, id), gen_random_uuid(),gen_random_uuid(),id,category,affinity,rarity,
             jsonb_build_object('category',category)
        from ((select id,category,affinity,rarity from public.card_definitions where category='creature' and rarity='common' order by id limit 3)
          union all (select id,category,affinity,rarity from public.card_definitions where category='power' and rarity='common' order by id limit 2)) cards`,
      [snapshotId],
    );
    await client.query(
      `insert into public.live_pvp_match_participants (match_id,player_id,participant_side,deck_snapshot_id,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$5)`,
      [matchId, playerId, side, snapshotId, started],
    );
  }
  await client.query(
    `insert into private.live_pvp_match_states (match_id,version,battle_state,updated_at)
    values ($1,0,'{"phase":"initial_selection"}'::jsonb,$2)`,
    [matchId, started],
  );
  await client.query(
    `update public.live_pvp_matches set status='completed',version=1,phase='completed',
    current_actor_player_id=null,decision_started_at=null,turn_deadline=null,winner_player_id=$2,
    completion_reason=$3,completed_at=$4,updated_at=$4 where id=$1`,
    [matchId, winner, reason, input.completedAt],
  );
  await client.query(
    `update public.live_pvp_match_participants set outcome=case when player_id=$2 then 'win' else 'loss' end,
    updated_at=$3 where match_id=$1`,
    [matchId, winner, input.completedAt],
  );
  await client.query(
    `update private.live_pvp_match_states set version=1,battle_state='{"phase":"completed"}'::jsonb,updated_at=$2
    where match_id=$1`,
    [matchId, input.completedAt],
  );
  const actionId = randomUUID();
  await client.query(
    `insert into public.live_pvp_match_actions (id,match_id,sequence,previous_version,committed_version,
     transition_kind,actor_player_id,public_result,created_at) values ($1,$2,1,0,1,'timeout',null,'{}',$3)`,
    [actionId, matchId, input.completedAt],
  );
  await client.query(
    `insert into private.live_pvp_match_transitions (action_id,match_id,state_before,state_after,
    authoritative_result,server_randomness,participant_connection_generation,created_at)
    values ($1,$2,'{"version":0}','{"version":1,"phase":"completed"}','{}','{}',null,$3)`,
    [actionId, matchId, input.completedAt],
  );
  await client.query(
    `insert into private.live_pvp_completion_sources (match_id,player_id,outcome,completion_reason,occurred_at)
    select match_id,player_id,outcome,$2,$3 from public.live_pvp_match_participants where match_id=$1`,
    [matchId, reason, input.completedAt],
  );
  return matchId;
}

/** Public read graph only, following the existing rollback-only Trust fixture. */
export async function insertRollbackTrustHistoryAsync(
  client: Queryable,
  input: {
    pair: readonly string[];
    completedAt: Date;
    matchId?: string;
    reason?:
      | 'turn_forfeit'
      | 'defeat'
      | 'voluntary_resignation'
      | 'account_deletion_forfeit';
    winner?: string;
  },
): Promise<string> {
  const invitationId = randomUUID();
  const matchId = input.matchId ?? randomUUID();
  const started = new Date(input.completedAt.getTime() - 60_000);
  await client.query(
    `insert into public.async_pvp_invitations (id,challenger_player_id,recipient_player_id,
    created_at,updated_at,expires_at) values ($1,$2,$3,$4,$4,$5)`,
    [invitationId, ...input.pair, started, new Date(+started + 86_400_000)],
  );
  await client.query(
    `insert into public.async_pvp_matches (id,invitation_id,current_player_id,decision_started_at,turn_deadline,started_at,created_at,updated_at)
    values ($1,$2,$3,$4,$4::timestamptz + interval '24 hours',$4,$4,$4)`,
    [matchId, invitationId, input.pair[0], started],
  );
  await client.query(
    `insert into public.async_pvp_match_participants (match_id,player_id,engine_side,deck_snapshot_id,created_at)
    values ($1,$2,'player',$4,$6),($1,$3,'cpu',$5,$6)`,
    [matchId, ...input.pair, randomUUID(), randomUUID(), started],
  );
  await client.query(
    `update public.async_pvp_matches set status='completed',version=1,current_player_id=null,decision_started_at=null,turn_deadline=null,
    winner_player_id=$2,completion_reason=$3,completed_at=$4,updated_at=$4 where id=$1`,
    [
      matchId,
      input.winner ?? input.pair[0],
      input.reason ?? 'turn_forfeit',
      input.completedAt,
    ],
  );
  await client.query(
    `update public.async_pvp_match_participants set outcome=case when player_id=$2 then 'win' else 'loss' end where match_id=$1`,
    [matchId, input.winner ?? input.pair[0]],
  );
  // Free the pending-pair unique key; the incomplete graph is never committed.
  await client.query(
    `update public.async_pvp_invitations set status='accepted',version=1,match_id=$2,responded_at=$3,updated_at=$3 where id=$1`,
    [invitationId, matchId, input.completedAt],
  );
  return matchId;
}
