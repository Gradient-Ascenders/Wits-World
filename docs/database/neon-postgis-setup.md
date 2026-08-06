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

The first migration enables PostGIS. Event tables are intentionally left for
issue #18.

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

## Troubleshooting

- `password authentication failed`: reset the Neon role password and update the
  ignored `.env` file.
- `connection is insecure`: confirm the URL includes `sslmode=require`.
- Bash starts a background job: quote the URL or the `.env` value because it
  contains `&channel_binding=require`.
- `TEST_DATABASE_URL must not match DATABASE_URL`: create a separate Neon test
  database or branch.

The preceding document was generated and edited with the assistance of:
Codex-CLI[GPT-5].
