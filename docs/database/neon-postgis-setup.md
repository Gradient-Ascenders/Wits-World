---
title: 'Set up Neon and PostGIS'
---

# Set up Neon and PostGIS

This guide covers the managed database setup for Wits Quest.

The deployed API uses Neon PostgreSQL and PostGIS. Pull-request database
validation uses the disposable `postgis/postgis:17-3.5` service defined in
`.gitea/workflows/pr-validation.yml`; it does not connect to Neon. Developers
may use Neon for manual integration and release rehearsals when a local PostGIS
service is unavailable, but routine PR validation should remain local to CI.

## Required databases

Create or select two separate Neon database targets:

- development: used through `DATABASE_URL`
- test: used through `TEST_DATABASE_URL`

The two URLs must not point at the same database or branch. This keeps migration
and integration tests from damaging development data. When both targets are
hosted by Neon, prefer separate Neon projects rather than branches of one
project so their monthly compute allowances and failure boundaries are also
separate.

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

Pull requests run the destructive database suite automatically against the
job-local PostGIS service. For an authorised manual run, use only the separate
test target configured by `TEST_DATABASE_URL`:

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

## Serverless compute usage

The API starts account-deletion retry, movement-evidence cleanup, and
asynchronous-PvP deadline workers together. Production configures these and
live-PvP transient cleanup, trust evaluation, and card-trade maintenance to
the same 30-minute interval, and the API rejects intervals shorter than 15
minutes. Request-time checks remain authoritative; the background jobs only
converge failed or inactive work.

These housekeeping intervals do not by themselves make the complete API idle.
`GAMEPLAY_SCHEDULER_BACKEND` defaults to `polling`, where live-PvP and ranked
workers probe persisted work at their configured cadence (one second by
default), even with no local gameplay activity. The scheduler implementation
is being added with a staged `upstash` mode intended for use only after it is
deployed and all producers of new persisted gameplay work have durable-intent
support. In that mode,
active work continues polling at the configured interval, while idle PostgreSQL probes can
sleep for up to 30 minutes or until an earlier known work boundary. Each API
instance reads a combined Redis activity snapshot using one direct `HMGET`
every 10 seconds and wakes the affected local worker; initialization EVAL runs
only when the epoch is absent. At that cadence, one
continuously running API instance performs about 259,200 snapshot reads per
30-day month; multiply by the continuously running replica count. Mutation and
initialization Lua commands, along with rate-limit traffic, use the same Redis
budget and must be included when checking plan quota. Same-process local wakes
remain immediate. The PostgreSQL gateway listener remains off while
there is no persisted active match or local socket. Other API traffic,
housekeeping, or external database clients can still wake Neon compute.

The activity store is constructed when either `RATE_LIMIT_BACKEND=upstash` or
`GAMEPLAY_SCHEDULER_BACKEND=upstash`; work producers then publish persistent
pre-write intents, including in scheduler polling mode. Merely configuring
Upstash credentials while both backends remain local/polling does not publish
intents, so those local/development writers are unaware of coordination and
must be retired or moved to Upstash before enabling long idle sleeps. Work
producers take shared PostgreSQL transaction advisory locks and validate their
durable intent before writing. Ranked API mutations, season transitions, and
pairing fail closed if that Redis signal is unavailable. Existing queue and
proposal expiry and due territory settlement instead use a shared PG-only
transaction guard and continue without Redis publication or intent validation.
The scheduler pauses the season and pairing phases on coordination errors,
continues expiry and cleanup, and retries creation at the active cadence while
preserving normal cleanup throttles. Existing live actions, tickets, and
presence writes cannot introduce or reactivate an active match and do not need
a new scheduler intent. Idle confirmation uses an
exclusive try-lock, removes intents older than 120 seconds under that lock,
rechecks database work, and clears active only when the activity epoch and
revision are unchanged and no intents remain. Invalidated delayed writers abort
with `503`. Redis outages
or monitoring/fallback signals trigger fast PostgreSQL scans, and startup scans
persisted work immediately. Activity keys have no TTL and must not be deleted
to force idle. No schema migration is required.

Use the documented staged rollout: first deploy polling mode with durable
writers, then retire all older/unaware producers (including old local servers)
that can write to the same Neon database. Only then set the repository Actions
variable `PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND=upstash` and deploy/restart;
CI maps it to the Azure API setting `GAMEPLAY_SCHEDULER_BACKEND` and defaults
that setting to `polling`. A manual Azure setting change alone is temporary;
the next deployment reapplies the repository variable/default. Do not enable
Upstash mode while an unaware writer is still running. Roll back by setting the
Actions variable to `polling` and redeploying/restarting.
`GAMEPLAY_SCHEDULER_NAMESPACE` is optional; its default is a hash of
the canonical database endpoint with Neon `-pooler` removed and port/path
retained. All replicas sharing the database must use the same namespace. The
Upstash store reuses existing Redis credentials and adds Redis commands, so
this is not zero-cost. CU savings and actual Neon suspension have not been
measured or verified in deployment; scale-to-zero remains conditional on the
mode being safely enabled and no other traffic or maintenance waking compute.
See the [ranked operations guide](../deployment/ranked-operations.md),
[Azure deployment setup](../deployment/azure-deployment-setup.md), and
[live-PvP contract](../architecture/live-pvp-api-contract.md) for the protocol
and operator sequence.

In the Neon console, keep the production compute minimum at `0.25 CU` and keep
scale-to-zero enabled with the five-minute inactivity delay. Review project
consumption and branch computes after each release. Delete unused branch
computes, and investigate long continuous active periods against all worker and
request traffic, not only the housekeeping intervals.

Do not run the full database suite repeatedly against the production project.
Use PR CI for routine verification and reserve hosted test runs for release
smoke or recovery evidence.

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

Page title clarified with assistance from Codex-CLI[GPT-6].

Gameplay-probe and compute-usage limitations were clarified with assistance
from Codex-CLI[GPT-5].

The staged gameplay scheduler guidance was updated with assistance from
Codex[GPT-5], based on user-provided implementation requirements.
Existing-work outage behavior was clarified with assistance from Codex-CLI[gpt-6-luna].
