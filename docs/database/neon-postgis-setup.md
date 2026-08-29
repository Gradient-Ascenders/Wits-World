# Neon PostgreSQL and PostGIS Setup

This guide covers the Sprint 1 database setup for Wits Quest.

The team uses Neon as the PostgreSQL and PostGIS development environment for
Sprint 1. No Docker or self-hosted local PostgreSQL service is configured in
this issue.

## Required databases

Create or select two separate Neon database targets:

- development: used through `DATABASE_URL`
- test: used through `TEST_DATABASE_URL`

The two URLs must not point at the same database or branch. This keeps migration
and integration tests from damaging development data.

## Local environment file

Copy the API example and edit the ignored local file:

```bash
cp apps/api/.env.example apps/api/.env
```

Set the real Neon URLs in `apps/api/.env`:

```env
DATABASE_URL='postgresql://neondb_owner:<password>@<host>/<database>?sslmode=require&channel_binding=require'
TEST_DATABASE_URL='postgresql://neondb_owner:<password>@<test-host>/<test-database>?sslmode=require&channel_binding=require'
```

Use quotes around connection strings when sourcing the file in a shell. The `&`
character otherwise runs the rest of the line as a background command.

Never commit `apps/api/.env`. Git ignores `.env` files, and
`apps/api/.env.example` must contain placeholders only.

## Verify the connection

From the repository root:

```bash
set -a
source apps/api/.env
set +a
psql "$DATABASE_URL" -c 'select current_database(), current_user;'
```

## Run migrations

Migrations are tracked as SQL files in `database/migrations`.

Run development migrations:

```bash
npm run db:migrate --workspace @wits-world/api
```

Run test-database migrations:

```bash
npm run db:migrate:test --workspace @wits-world/api
```

The first migration enables PostGIS. The second migration creates the initial
event table and spatial index.

## Seed data

Apply migrations before seeds. Seed files are repeatable SQL fixtures tracked
in `database/seeds`.

Seed the development database:

```bash
npm run db:seed --workspace @wits-world/api
```

Seed the test database:

```bash
npm run db:seed:test --workspace @wits-world/api
```

The Basic demonstration events and challenge are provisional, non-production
content. Their fixed identifiers and conflict-safe inserts make repeated
demo-seed runs leave already-published, immutable fixtures unchanged rather
than create duplicates. Run the following when the complete Basic journey is
required:

```bash
npm run db:seed:test --workspace @wits-world/api -- --basic-demo
```

See the [Basic demo seed guide](basic-demo-seed.md) and [event-schema
guide](event-schema.md) for fixture values and availability periods.

## Database integration test

Run the destructive database integration test only against the separate Neon
test branch configured by `TEST_DATABASE_URL`:

```bash
npm run test:database --workspace @wits-world/api
```

The test creates a uniquely named temporary database, applies all migrations,
runs migrations and seeds repeatedly, checks discovery and accuracy-aware
PostGIS eligibility, rehearses a transactional migration failure and recovery,
and drops only that temporary database in cleanup. The configured test database
itself is not dropped or cleared. Follow the
[PostGIS recovery rehearsal](postgis-recovery-rehearsal.md) when collecting
release evidence.

## Check readiness

Check the development database:

```bash
npm run db:check --workspace @wits-world/api
```

Check the test database:

```bash
npm run db:check:test --workspace @wits-world/api
```

The readiness check connects using environment configuration and queries
`postgis_full_version()`. If PostGIS is missing, run migrations first.

## Release procedure

The individual development and test commands above remain useful during local
work. Preparing a release target uses the guarded
[Sprint 1 database release procedure](database-release-procedure.md), which adds
a read-only connection and PostGIS availability inspection before writes, exact
database-name confirmation, installed-PostGIS readiness verification after
migrations, and a separate demonstration-seed decision.

The release command is not part of CI and does not run automatically during an
Azure deployment:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target test \
  --confirm-database <test-database-name> \
  --seed-basic-demo
```

Use the production target only with explicit release authority. Never substitute
`DATABASE_URL` for `TEST_DATABASE_URL` during isolated rehearsal.

## Troubleshooting

- `password authentication failed`: reset the Neon role password and update the
  ignored `.env` file.
- `connection is insecure`: confirm the URL includes `sslmode=require`.
- Bash starts a background job: quote the URL or the `.env` value because it
  contains `&channel_binding=require`.
- `TEST_DATABASE_URL must not match DATABASE_URL`: create a separate Neon test
  database or branch.

The preceding document was generated and edited with the assistance of:
Codex-CLI[GPT-5], Codex[GPT-5], Codex[GPT-5.6 Sol], and
Codex[gpt-5.6-sol].
