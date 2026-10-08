import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import {
  inspectMigrationHistory,
  loadMigrationFiles,
  type MigrationHistoryInspection,
} from './migrations.js';
import { getMigrationsDirectory } from './paths.js';

export interface PlayerDataClassifications {
  reviewedAt: string;
  productionPlayerIds: string[];
  testPlayerIds: string[];
}

interface EntityOriginCounts {
  entity: string;
  total: number;
  confirmedTest: number;
  confirmedProduction: number;
  unknown: number;
}

export interface DatabaseQualityReport {
  observedAt: string;
  database: string;
  postgresVersion: string;
  postgisVersion: string | null;
  content: {
    cards: { total: number; activePublished: number };
    events: {
      total: number;
      fixtureLabelled: number;
      publishedInOwnWindow: number;
      available: number;
      availableFixtureLabelled: number;
      availableWithSources: number;
      availableWithReadyQuestionPool: number;
    };
    questions: {
      total: number;
      published: number;
      withSources: number;
      availablePublished: number;
    };
    trails: { total: number; published: number; retired: number };
    asyncMatches: number;
    liveMatches: number;
  };
  structure: {
    applicationTables: number;
    foreignKeys: number;
    unvalidatedConstraints: Array<{ table: string; constraint: string }>;
    cpuJsonShapes: Array<{
      field: string;
      expected: string;
      total: number;
      invalid: number;
    }>;
    connectedRole: {
      ownsDatabase: boolean;
      canCreateDatabases: boolean;
      canCreateRoles: boolean;
      canCreateInPublic: boolean;
      canCreateInPrivate: boolean;
    };
  };
  playerData: {
    classificationReviewedAt: string | null;
    classificationsNotInCurrentPlayers: number;
    byEntity: EntityOriginCounts[];
  };
  migrations: MigrationHistoryInspection & {
    sourceCount: number;
    appliedCount: number;
  };
}

export function parsePlayerDataClassifications(
  value: unknown,
  databaseConfig: DatabaseConfig,
): PlayerDataClassifications {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid data classification manifest.');
  }
  const manifest = value as Record<string, unknown>;
  const target = new URL(databaseConfig.connectionString);
  if (
    manifest.databaseHost !== target.hostname ||
    manifest.databasePort !== (target.port || '5432') ||
    manifest.databaseName !== decodeURIComponent(target.pathname.slice(1))
  ) {
    throw new Error(
      'Data classifications belong to a different database target.',
    );
  }
  const reviewedAt = manifest.reviewedAt;
  if (
    typeof reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)
  ) {
    throw new Error('Data classifications need a valid review date.');
  }
  const reviewDate = new Date(`${reviewedAt}T00:00:00Z`);
  if (
    !Number.isFinite(reviewDate.getTime()) ||
    reviewDate.toISOString().slice(0, 10) !== reviewedAt ||
    reviewDate.getTime() > Date.now()
  ) {
    throw new Error(
      'Data classifications need a valid, non-future review date.',
    );
  }
  const productionPlayerIds = parsePlayerIds(manifest.productionPlayerIds);
  const testPlayerIds = parsePlayerIds(manifest.testPlayerIds);
  const allIds = [...productionPlayerIds, ...testPlayerIds];
  if (new Set(allIds).size !== allIds.length) {
    throw new Error(
      'Data classifications contain duplicate or conflicting players.',
    );
  }
  return { reviewedAt, productionPlayerIds, testPlayerIds };
}

function parsePlayerIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (id): id is string =>
        typeof id === 'string' &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id),
    )
  ) {
    throw new Error('Data classifications must contain UUID arrays.');
  }
  return value.map((id) => id.toLowerCase());
}

export async function auditDatabaseQuality(
  databaseConfig: DatabaseConfig,
  {
    classifications,
    migrationsDirectory = getMigrationsDirectory(),
  }: {
    classifications?: PlayerDataClassifications;
    migrationsDirectory?: string;
  } = {},
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<DatabaseQualityReport> {
  const migrationFiles = await loadMigrationFiles(migrationsDirectory);

  return runWithClient(databaseConfig, async (client) => {
    await client.query('begin isolation level repeatable read read only');
    try {
      await client.query("set local statement_timeout = '8s'");
      await client.query("set local lock_timeout = '1s'");
      const applied = await client.query<{ name: string; checksum: string }>(
        'select name, checksum from public.schema_migrations order by name',
      );
      const result = await client.query<{
        report: Omit<DatabaseQualityReport, 'migrations'>;
      }>(QUALITY_REPORT_SQL, [
        classifications?.testPlayerIds ?? [],
        classifications?.productionPlayerIds ?? [],
        classifications?.reviewedAt ?? null,
      ]);
      const report = result.rows[0]?.report;
      if (!report)
        throw new Error('Database quality query returned no report.');
      return {
        ...report,
        migrations: {
          ...inspectMigrationHistory(
            migrationFiles,
            new Map(applied.rows.map((row) => [row.name, row.checksum])),
          ),
          sourceCount: migrationFiles.length,
          appliedCount: applied.rows.length,
        },
      };
    } finally {
      await client.query('rollback');
    }
  });
}

// Return only aggregates: no identities, answer text/keys, locations, or JSON bodies.
const QUALITY_REPORT_SQL = `
  with event_inventory as (
    select event.*,
      lower(event.title) ~ '(^|[^a-z])(demo|test|testing|fixture|sample)([^a-z]|$)'
        or lower(event.description) like '%non-production%' as fixture_labelled,
      event.is_published and event.authoring_status='published'
        and event.starts_at <= now() and event.ends_at >= now() as own_window,
      event.is_published and effective.availability='active'
        and placement.is_available as available
    from public.events event
    cross join lateral public.resolve_event_availability(event.id, now()) effective
    cross join lateral public.resolve_event_placement_location(event.id, now()) placement
  ), owned_rows as (
    select 'players' as entity, id as player_id from public.players
    union all select 'owned_cards', player_id from public.player_cards
    union all select 'decks', player_id from public.player_decks
    union all select 'challenge_attempts', player_id from public.challenge_attempts
    union all select 'event_completions', player_id from public.event_completions
    union all select 'cpu_matches', player_id from public.cpu_matches
  ), origins as (
    select entity, count(*)::int as total,
      count(*) filter (where player_id=any($1::uuid[]))::int as test,
      count(*) filter (where player_id=any($2::uuid[]))::int as production,
      count(*) filter (where player_id is null or
        (not player_id=any($1::uuid[]) and not player_id=any($2::uuid[])))::int as unknown
    from owned_rows group by entity
  ), cpu_shapes as (
    select 'cpu_matches.state' as field, 'object' as expected, count(*)::int as total,
      count(*) filter (where jsonb_typeof(state) is distinct from 'object')::int as invalid from public.cpu_matches
    union all select 'cpu_match_cards.snapshot', 'object', count(*)::int,
      count(*) filter (where jsonb_typeof(snapshot) is distinct from 'object')::int from public.cpu_match_cards
    union all select 'cpu_match_rounds.state_before', 'object', count(*)::int,
      count(*) filter (where jsonb_typeof(state_before) is distinct from 'object')::int from public.cpu_match_rounds
    union all select 'cpu_match_rounds.state_after', 'object', count(*)::int,
      count(*) filter (where jsonb_typeof(state_after) is distinct from 'object')::int from public.cpu_match_rounds
    union all select 'cpu_match_rounds.result', 'array', count(*)::int,
      count(*) filter (where jsonb_typeof(result) is distinct from 'array')::int from public.cpu_match_rounds
    union all select 'cpu_match_actions.action', 'object', count(*)::int,
      count(*) filter (where jsonb_typeof(action) is distinct from 'object')::int from public.cpu_match_actions
    union all select 'cpu_match_actions.result', 'object', count(*)::int,
      count(*) filter (where jsonb_typeof(result) is distinct from 'object')::int from public.cpu_match_actions
    union all select 'cpu_match_actions.response', 'object or SQL NULL', count(*)::int,
      count(*) filter (where response is not null and jsonb_typeof(response) is distinct from 'object')::int from public.cpu_match_actions
    union all select 'cpu_match_actions.submitted_intent', 'object or SQL NULL', count(*)::int,
      count(*) filter (where submitted_intent is not null and jsonb_typeof(submitted_intent) is distinct from 'object')::int from public.cpu_match_actions
  )
  select jsonb_build_object(
    'observedAt', now(), 'database', current_database(),
    'postgresVersion', current_setting('server_version'),
    'postgisVersion', (select extversion from pg_extension where extname='postgis'),
    'content', jsonb_build_object(
      'cards', (select jsonb_build_object('total', count(*),
        'activePublished', count(*) filter (where is_active and authoring_status='published')) from public.card_definitions),
      'events', (select jsonb_build_object('total', count(*),
        'fixtureLabelled', count(*) filter (where fixture_labelled),
        'publishedInOwnWindow', count(*) filter (where own_window),
        'available', count(*) filter (where available),
        'availableFixtureLabelled', count(*) filter (where available and fixture_labelled),
        'availableWithSources', count(*) filter (where available and cardinality(source_urls)>0),
        'availableWithReadyQuestionPool', count(*) filter (where available and exists (
          select 1 from public.event_challenges ec where ec.event_id=e.id and ec.status='published'
            and (select count(*) from public.challenge_questions q where q.challenge_id=ec.id and q.status='published') >= 5
        ))) from event_inventory e),
      'questions', (select jsonb_build_object('total', count(*),
        'published', count(*) filter (where status='published'),
        'withSources', count(*) filter (where cardinality(source_urls)>0),
        'availablePublished', count(*) filter (where status='published' and exists (
          select 1 from public.event_challenges ec join event_inventory e on e.id=ec.event_id
          where ec.id=q.challenge_id and ec.status='published' and e.available
        ))) from public.challenge_questions q),
      'trails', (select jsonb_build_object('total', count(*),
        'published', count(*) filter (where status='published'),
        'retired', count(*) filter (where status='retired')) from public.trails),
      'asyncMatches', (select count(*) from public.async_pvp_matches),
      'liveMatches', (select count(*) from public.live_pvp_matches)
    ),
    'structure', jsonb_build_object(
      'applicationTables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private') and c.relkind='r' and c.relname <> 'spatial_ref_sys'),
      'foreignKeys', (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
        where n.nspname in ('public','private') and c.contype='f'),
      'unvalidatedConstraints', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', n.nspname || '.' || t.relname, 'constraint', c.conname) order by n.nspname, t.relname, c.conname), '[]'::jsonb)
        from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
        where n.nspname in ('public','private') and not c.convalidated),
      'cpuJsonShapes', (select jsonb_agg(jsonb_build_object('field', field, 'expected', expected,
        'total', total, 'invalid', invalid) order by field) from cpu_shapes),
      'connectedRole', (select jsonb_build_object(
        'ownsDatabase', pg_has_role(current_user, (select datdba from pg_database where datname=current_database()), 'USAGE'),
        'canCreateDatabases', rolcreatedb, 'canCreateRoles', rolcreaterole,
        'canCreateInPublic', has_schema_privilege(current_user, 'public', 'CREATE'),
        'canCreateInPrivate', has_schema_privilege(current_user, 'private', 'CREATE'))
        from pg_roles where rolname=current_user)
    ),
    'playerData', jsonb_build_object(
      'classificationReviewedAt', $3::text,
      'classificationsNotInCurrentPlayers', (select count(*) from unnest($1::uuid[] || $2::uuid[]) classified(id)
        where not exists (select 1 from public.players p where p.id=classified.id)),
      'byEntity', (select coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'total', total,
        'confirmedTest', test, 'confirmedProduction', production, 'unknown', unknown) order by entity), '[]'::jsonb) from origins)
    )
  ) as report
`;
