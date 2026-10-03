import type pg from 'pg';
import sharp from 'sharp';

import { createCardCollectionService } from '../cards/card-collection.js';
import type { OwnedCard } from '../cards/card-types.js';
import { ApiError } from '../errors/api-error.js';
import {
  createProgressionReadService,
  type CurrentProgressionProfile,
} from '../progression/progression-read-service.js';

export interface ProfileEdit {
  expectedVersion: number;
  bio: string;
  degree: string;
  studyYear: string;
  avatarDataUrl: string | null;
  statusEmoji: string;
  statusText: string;
  statusExpiry: 'keep' | 'today' | 'week' | 'never';
  isPublic: boolean;
  activityVisible: boolean;
  featuredOwnedCardIds: string[];
}

export type FeaturedCard = Omit<
  OwnedCard,
  'ownedCardId' | 'acquiredAt' | 'acquisitionKind'
>;

export interface PlayerProfile extends CurrentProgressionProfile {
  isOwner: boolean;
  version: number | null;
  bio: string;
  degree: string;
  studyYear: string;
  avatarDataUrl: string | null;
  status: { emoji: string; text: string; expiresAt: string | null } | null;
  isPublic: boolean;
  activityVisible: boolean;
  featuredCards: FeaturedCard[];
  featuredOwnedCardIds: string[];
  activity: { date: string; count: number }[] | null;
  activityThrough: string;
}

export interface PlayerProfileService {
  get(viewerId: string, playerName?: string): Promise<PlayerProfile>;
  save(playerId: string, edit: ProfileEdit): Promise<PlayerProfile>;
}

interface ProfileRow extends pg.QueryResultRow {
  id: string;
  version: number | null;
  bio: string | null;
  degree: string | null;
  study_year: string | null;
  avatar_data_url: string | null;
  status_emoji: string | null;
  status_text: string | null;
  status_expires_at: Date | null;
  status_active: boolean;
  is_public: boolean | null;
  activity_visible: boolean | null;
  today: string;
}

function problem(statusCode: number, code: string, detail: string) {
  return new ApiError({
    statusCode,
    code,
    title: 'Profile unavailable',
    detail,
  });
}

export async function normalizeProfileAvatar(
  value: string | null,
): Promise<string | null> {
  if (value === null) return null;
  if (
    !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ||
    value.length > 200000
  ) {
    throw problem(
      400,
      'INVALID_PROFILE_AVATAR',
      'Choose a JPEG, PNG or WebP image under 8 MB.',
    );
  }
  try {
    const output = await sharp(
      Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'),
      {
        limitInputPixels: 16000000,
        failOn: 'warning',
      },
    )
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString('base64')}`;
  } catch {
    throw problem(
      400,
      'INVALID_PROFILE_AVATAR',
      'This image could not be read. Choose another image.',
    );
  }
}

export function createPlayerProfileService(
  database: Pick<pg.Pool, 'connect'>,
): PlayerProfileService {
  async function get(
    viewerId: string,
    playerName?: string,
  ): Promise<PlayerProfile> {
    const client = await database.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const result = await client.query<ProfileRow>(
        `
        select p.id, profile.*,
          (profile.status_expires_at is null or profile.status_expires_at > now()) as status_active,
          (now() at time zone 'Africa/Johannesburg')::date::text as today
        from public.players p
        left join public.player_profiles profile on profile.player_id = p.id
        where p.lifecycle_status = 'active' and p.player_name is not null
          and (($2::text is null and p.id = $1::uuid) or lower(p.player_name) = lower($2))
          and (p.id = $1::uuid or profile.is_public = true)
      `,
        [viewerId, playerName ?? null],
      );
      const row = result.rows[0];
      if (!row)
        throw problem(
          404,
          'PROFILE_NOT_FOUND',
          'This player profile is not available.',
        );
      const isOwner = row.id === viewerId;
      const progression = await createProgressionReadService(
        client,
      ).getCurrentProfile(row.id);
      const selected = await client.query<{ owned_card_id: string }>(
        `
        select showcase.owned_card_id from public.player_profile_cards showcase
        join public.player_cards owned on owned.id = showcase.owned_card_id and owned.player_id = showcase.player_id
        where showcase.player_id = $1::uuid order by showcase.position
      `,
        [row.id],
      );
      const selectedIds = selected.rows.map((entry) => entry.owned_card_id);
      const owned = selectedIds.length
        ? await createCardCollectionService(client).listOwnedCards(row.id)
        : [];
      const featuredCards = selectedIds.flatMap((id) => {
        const card = owned.find((entry) => entry.ownedCardId === id);
        if (!card) return [];
        return [
          {
            cardDefinitionId: card.cardDefinitionId,
            name: card.name,
            category: card.category,
            affinity: card.affinity,
            rarity: card.rarity,
            hp: card.hp,
            power: card.power,
            description: card.description,
            imageAlt: card.imageAlt ?? null,
            imageUrl: card.imageUrl,
            isActive: card.isActive,
            moves: card.moves,
            effects: card.effects,
          },
        ];
      });
      const activity =
        isOwner || row.activity_visible
          ? (
              await client.query<{ date: string; count: number }>(
                `
        select activity_day::text as date, completed_activity_count as count
        from public.player_activity_days where player_id = $1::uuid
          and activity_day between $2::date - 364 and $2::date
        order by activity_day
      `,
                [row.id, row.today],
              )
            ).rows
          : null;
      await client.query('commit');
      return {
        ...progression,
        achievements: isOwner
          ? progression.achievements
          : progression.achievements.filter((entry) => entry.earned),
        isOwner,
        version: isOwner ? (row.version ?? 0) : null,
        bio: row.bio ?? '',
        degree: row.degree ?? '',
        studyYear: row.study_year ?? '',
        avatarDataUrl: row.avatar_data_url,
        status:
          row.status_active && (row.status_text || row.status_emoji)
            ? {
                emoji: row.status_emoji ?? '',
                text: row.status_text ?? '',
                expiresAt: row.status_expires_at?.toISOString() ?? null,
              }
            : null,
        isPublic: row.is_public ?? false,
        activityVisible: row.activity_visible ?? false,
        featuredCards,
        featuredOwnedCardIds: isOwner ? selectedIds : [],
        activity,
        activityThrough: row.today,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    get,
    async save(playerId, edit) {
      const avatar = await normalizeProfileAvatar(edit.avatarDataUrl);
      if (
        edit.featuredOwnedCardIds.length > 4 ||
        new Set(edit.featuredOwnedCardIds).size !==
          edit.featuredOwnedCardIds.length
      ) {
        throw problem(
          400,
          'INVALID_PROFILE_CARDS',
          'Choose up to four different owned copies.',
        );
      }
      const client = await database.connect();
      try {
        await client.query('begin');
        const player = await client.query(
          "select id from public.players where id = $1::uuid and lifecycle_status = 'active' for update",
          [playerId],
        );
        if (!player.rows.length)
          throw problem(
            403,
            'ACCOUNT_UNAVAILABLE',
            'This account cannot edit a profile.',
          );
        const previous = await client.query<{ version: number }>(
          'select version from public.player_profiles where player_id = $1::uuid',
          [playerId],
        );
        if ((previous.rows[0]?.version ?? 0) !== edit.expectedVersion) {
          throw problem(
            409,
            'PROFILE_VERSION_CONFLICT',
            'Your profile changed in another window. Reload it before saving.',
          );
        }
        const owned = await client.query(
          `select id from public.player_cards where player_id = $1::uuid and id = any($2::uuid[]) order by id for share`,
          [playerId, edit.featuredOwnedCardIds],
        );
        if (owned.rows.length !== edit.featuredOwnedCardIds.length) {
          throw problem(
            409,
            'PROFILE_CARD_UNAVAILABLE',
            'A selected card is no longer in your collection. Choose your cards again.',
          );
        }
        await client.query(
          `
          insert into public.player_profiles (player_id, version, bio, degree, study_year, avatar_data_url,
            status_emoji, status_text, status_expires_at, is_public, activity_visible)
          values ($1, $2 + 1, $3, $4, $5, $6, $7, $8,
            case $9::text
              when 'today' then (((now() at time zone 'Africa/Johannesburg')::date + 1)::timestamp at time zone 'Africa/Johannesburg')
              when 'week' then now() + interval '7 days'
              when 'keep' then (select status_expires_at from public.player_profiles where player_id = $1)
              else null end, $10, $11)
          on conflict (player_id) do update set version = excluded.version, bio = excluded.bio,
            degree = excluded.degree, study_year = excluded.study_year, avatar_data_url = excluded.avatar_data_url,
            status_emoji = excluded.status_emoji, status_text = excluded.status_text,
            status_expires_at = excluded.status_expires_at, is_public = excluded.is_public,
            activity_visible = excluded.activity_visible, updated_at = now()
        `,
          [
            playerId,
            edit.expectedVersion,
            edit.bio.trim(),
            edit.degree.trim(),
            edit.studyYear.trim(),
            avatar,
            edit.statusEmoji.trim(),
            edit.statusText.trim(),
            edit.statusExpiry,
            edit.isPublic,
            edit.activityVisible,
          ],
        );
        await client.query(
          'delete from public.player_profile_cards where player_id = $1',
          [playerId],
        );
        for (const [position, id] of edit.featuredOwnedCardIds.entries()) {
          await client.query(
            'insert into public.player_profile_cards (player_id, owned_card_id, position) values ($1, $2, $3)',
            [playerId, id, position],
          );
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      return get(playerId);
    },
  };
}
