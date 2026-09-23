import type pg from 'pg';

import { getDeckRarityPoints } from '../cards/deck-rules.js';
import type {
  CardAffinity,
  CardCategory,
  CardRarity,
} from '../cards/card-types.js';
import type {
  EventDiscoveryService,
  PlayerEventAvailability,
} from '../events/event-discovery.js';
import {
  PROGRESSION_MONTH_PATTERN,
  PROGRESSION_STANDINGS_MAX_PAGE,
  PROGRESSION_STANDINGS_MAX_PAGE_SIZE,
  type StandingsPeriod,
} from '../progression/progression-read-service.js';

export const DEVELOPER_EVENTS_MAX_PAGE_SIZE = 100;
export const DEVELOPER_EVENTS_MAX_PAGE = 10_000;
const progressionMonthExpression = new RegExp(PROGRESSION_MONTH_PATTERN);

export interface DeveloperEvent {
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
  availability: PlayerEventAvailability;
}

export interface DeveloperCardMove {
  position: number;
  name: string;
  moveType: string;
  powerCost: number;
  rulesText: string | null;
}

export interface DeveloperCardEffect {
  position: number;
  rulesText: string | null;
}

export interface DeveloperCard {
  cardDefinitionId: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  deckPointCost: number;
  evolvesFromCardDefinitionId: string | null;
  evolutionCopiesRequired: number | null;
  moves: DeveloperCardMove[];
  effects: DeveloperCardEffect[];
}

export interface DeveloperLeaderboardEntry {
  playerName: string;
  points: number;
  rank: number;
}

export interface DeveloperPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface DeveloperEventPage {
  events: DeveloperEvent[];
  pagination: DeveloperPagination;
}

export interface DeveloperLeaderboardPage {
  period: StandingsPeriod;
  month: string | null;
  entries: DeveloperLeaderboardEntry[];
  pagination: DeveloperPagination;
}

export interface DeveloperPublicDataService {
  listEvents(input: {
    page: number;
    pageSize: number;
  }): Promise<DeveloperEventPage>;
  getEvent(eventId: string): Promise<DeveloperEvent | null>;
  listCards(): Promise<DeveloperCard[]>;
  getCard(cardDefinitionId: string): Promise<DeveloperCard | null>;
  listLeaderboard(input: {
    period: StandingsPeriod;
    month?: string;
    page: number;
    pageSize: number;
  }): Promise<DeveloperLeaderboardPage>;
}

export interface DeveloperPublicDataDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface CardRow extends pg.QueryResultRow {
  card_definition_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
  evolves_from_definition_id: string | null;
  evolution_copies_required: number | null;
  moves: DeveloperCardMove[];
  effects: DeveloperCardEffect[];
}

interface LeaderboardRow extends pg.QueryResultRow {
  player_name: string;
  total_points: number;
  standing_rank: number;
}

interface CountRow extends pg.QueryResultRow {
  count: number;
}

export function createDeveloperPublicDataService(
  database: DeveloperPublicDataDatabase,
  eventDiscovery: EventDiscoveryService,
): DeveloperPublicDataService {
  return {
    async listEvents(input) {
      assertEventPagination(input.page, input.pageSize);
      const events = (await eventDiscovery.list()).map(toDeveloperEvent);
      const offset = (input.page - 1) * input.pageSize;
      return {
        events: events.slice(offset, offset + input.pageSize),
        pagination: pagination(input.page, input.pageSize, events.length),
      };
    },

    async getEvent(eventId) {
      const event = (await eventDiscovery.list()).find(
        (candidate) => candidate.eventId === eventId,
      );
      return event ? toDeveloperEvent(event) : null;
    },

    async listCards() {
      const result = await database.query<CardRow>(
        `${CARD_CATALOGUE_SELECT} order by definition.name asc, definition.id asc`,
      );
      return result.rows.map(mapCard);
    },

    async getCard(cardDefinitionId) {
      const result = await database.query<CardRow>(
        `${CARD_CATALOGUE_SELECT}
         and definition.id = $1::uuid
         order by definition.name asc, definition.id asc`,
        [cardDefinitionId],
      );
      return result.rows[0] ? mapCard(result.rows[0]) : null;
    },

    async listLeaderboard(input) {
      assertLeaderboardInput(input);
      const source =
        input.period === 'monthly'
          ? `public.player_progression_monthly_standings(
              to_date($3 || '-01', 'YYYY-MM-DD')
            )`
          : 'public.player_progression_all_time_standings';
      const offset = (input.page - 1) * input.pageSize;
      const values =
        input.period === 'monthly'
          ? [input.pageSize, offset, input.month]
          : [input.pageSize, offset];

      const rows = await database.query<LeaderboardRow>(
        `select player_name,
                total_points,
                standing_rank::integer as standing_rank
           from ${source}
          where player_name is not null
          order by total_points desc, player_name asc, player_id asc
          limit $1
         offset $2`,
        values,
      );
      const countValues = input.period === 'monthly' ? [input.month] : [];
      const countSource =
        input.period === 'monthly'
          ? `public.player_progression_monthly_standings(
              to_date($1 || '-01', 'YYYY-MM-DD')
            )`
          : 'public.player_progression_all_time_standings';
      const count = await database.query<CountRow>(
        `select count(*)::integer as count
           from ${countSource}
          where player_name is not null`,
        countValues,
      );
      const totalItems = count.rows[0]?.count ?? 0;

      return {
        period: input.period,
        month: input.period === 'monthly' ? input.month! : null,
        entries: rows.rows.map((row) => ({
          playerName: row.player_name,
          points: row.total_points,
          rank: row.standing_rank,
        })),
        pagination: pagination(input.page, input.pageSize, totalItems),
      };
    },
  };
}

const CARD_CATALOGUE_SELECT = `
  select
    definition.id::text as card_definition_id,
    definition.name,
    definition.category,
    definition.affinity,
    definition.rarity,
    definition.hp,
    definition.power,
    definition.description,
    definition.image_url,
    definition.image_alt,
    definition.evolves_from_definition_id::text as evolves_from_definition_id,
    definition.evolution_copies_required,
    coalesce((
      select json_agg(
        json_build_object(
          'position', move.position,
          'name', move.name,
          'moveType', move.move_type,
          'powerCost', move.power_cost,
          'rulesText', move.rules_text
        ) order by move.position
      )
      from public.card_moves move
      where move.card_definition_id = definition.id
    ), '[]'::json) as moves,
    coalesce((
      select json_agg(
        json_build_object(
          'position', effect.position,
          'rulesText', effect.rules_text
        ) order by effect.position
      )
      from public.card_effects effect
      where effect.card_definition_id = definition.id
    ), '[]'::json) as effects
  from public.card_definitions definition
  where definition.catalogue_class = 'ordinary'
    and definition.is_active = true
    and definition.authoring_status = 'published'
`;

function toDeveloperEvent(
  event: Awaited<ReturnType<EventDiscoveryService['list']>>[number],
): DeveloperEvent {
  return {
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    latitude: event.latitude,
    longitude: event.longitude,
    radiusMetres: event.radiusMetres,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    availability: event.availability,
  };
}

function mapCard(row: CardRow): DeveloperCard {
  return {
    cardDefinitionId: row.card_definition_id,
    name: row.name,
    category: row.category,
    affinity: row.affinity,
    rarity: row.rarity,
    hp: row.hp,
    power: row.power,
    description: row.description,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    deckPointCost: getDeckRarityPoints(row.rarity),
    evolvesFromCardDefinitionId: row.evolves_from_definition_id,
    evolutionCopiesRequired: row.evolution_copies_required,
    moves: row.moves ?? [],
    effects: row.effects ?? [],
  };
}

function assertEventPagination(page: number, pageSize: number): void {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > DEVELOPER_EVENTS_MAX_PAGE ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > DEVELOPER_EVENTS_MAX_PAGE_SIZE
  ) {
    throw new Error('Developer event pagination is invalid.');
  }
}

function assertLeaderboardInput(input: {
  period: StandingsPeriod;
  month?: string;
  page: number;
  pageSize: number;
}): void {
  if (
    !Number.isInteger(input.page) ||
    input.page < 1 ||
    input.page > PROGRESSION_STANDINGS_MAX_PAGE ||
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > PROGRESSION_STANDINGS_MAX_PAGE_SIZE
  ) {
    throw new Error('Developer leaderboard pagination is invalid.');
  }
  if (
    input.period === 'monthly' &&
    !progressionMonthExpression.test(input.month ?? '')
  ) {
    throw new Error('Monthly developer leaderboard requires a valid month.');
  }
  if (input.period === 'all_time' && input.month !== undefined) {
    throw new Error('All-time developer leaderboard does not accept a month.');
  }
}

function pagination(
  page: number,
  pageSize: number,
  totalItems: number,
): DeveloperPagination {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}
