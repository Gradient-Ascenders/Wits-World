---
title: 'Set up Neon and PostGIS'
---

# Set up Neon and PostGIS

Wits World uses PostgreSQL with PostGIS for event locations, proximity checks,
and campus boundaries. Neon hosts the deployed database; local development can
use Neon or a PostgreSQL server with PostGIS installed.

Complete the repository setup in [Getting started](../development/getting-started.md)
before running the commands below from the repository root.

## Required databases

Use separate development and test databases, or separate Neon branches.
The test target must not contain production or development data. A different
password or a pooled connection to the same database does not provide isolation.

For Neon, copy the connection strings for each target and retain
`sslmode=require`. The role applying migrations must be able to create the
application schemas and enable PostGIS.

## Configure the API

If the API environment file does not exist, create it:

```bash
cp apps/api/.env.example apps/api/.env
```

Set these values in the ignored `apps/api/.env` file:

| Variable                | Target                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Development database. A pooled Neon endpoint is supported for ordinary queries.                    |
| `LISTENER_DATABASE_URL` | Direct, non-pooled connection to the same development database, used for PostgreSQL notifications. |
| `TEST_DATABASE_URL`     | Separate database used by test commands.                                                           |

The CLI loads the API environment file automatically. Values already exported
in the terminal take precedence. Test commands require both `DATABASE_URL` and
`TEST_DATABASE_URL` so they can check that the configured targets differ.

Keep connection strings out of browser configuration and committed files.
See [Getting started](../development/getting-started.md#configure-the-game)
for the remaining API and Web settings.

## Initialise development data

```bash
npm run prepare:api
npm run db:migrate --workspace @wits-world/api
npm run db:check --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api
```

Migrations enable PostGIS and create the application schema. Run them before
`db:check` on a new database: the readiness check expects PostGIS to be available.
Applied migrations are tracked and skipped on later runs. The runner checks all
applied filenames and checksums before applying pending SQL; missing or changed
applied files stop the run.

Normal seeding loads reusable reference data and checks that the card catalogue
is ready.

## Prepare the test target

```bash
npm run db:migrate:test --workspace @wits-world/api
npm run db:check:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api
```

The `:test` commands use `TEST_DATABASE_URL`. Database integration tests also
need a role that can create and drop temporary databases:

```bash
npm run test:database --workspace @wits-world/api
```

The suite creates isolated databases, applies migrations, and removes its
temporary databases afterward. Pull-request CI supplies an ephemeral PostGIS
service rather than using Neon.

Production changes follow the separate
[database release procedure](database-release-procedure.md).

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-5],
Codex[GPT-5], Codex[GPT-5.6 Sol], Codex[gpt-5.6-sol], Codex-CLI[GPT-6],
Codex-CLI[gpt-6-luna], and Codex[GPT-6].
