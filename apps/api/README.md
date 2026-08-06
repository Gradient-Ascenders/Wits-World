# Wits World API

The Wits World API is the hand-written HTTP API for the Wits Quest game.

The current foundation provides:

- a Fastify and TypeScript application;
- runtime configuration validation;
- `GET /health`;
- versioned routes under `/api/v1`;
- server-generated request identifiers;
- a consistent safe error model;
- generated OpenAPI documentation; and
- API integration tests.

Authentication, event endpoints, challenge rules, rewards, cards, and battles are
implemented in later issues.

## Requirements

Use:

- Node.js `>=24.14.1 <25`;
- npm `>=11.18.0 <12`.

Install all workspace dependencies from the repository root:

```powershell
npm ci
```

## Local configuration

Copy the API environment example:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

The local `.env` file is ignored by Git and must not contain values intended for
commit.

### API variables

| Variable    | Required | Example     | Purpose                                  |
| ----------- | -------- | ----------- | ---------------------------------------- |
| `HOST`      | Yes      | `127.0.0.1` | Network interface used by the API server |
| `PORT`      | Yes      | `3000`      | TCP port used by the API server          |
| `LOG_LEVEL` | Yes      | `info`      | Fastify log level                        |

Supported log levels are:

- `fatal`;
- `error`;
- `warn`;
- `info`;
- `debug`;
- `trace`;
- `silent`.

`PORT` must be an integer between `1` and `65535`.

Missing or invalid required API configuration prevents the server from starting.

### Database variables

| Variable            | Required for database operations   | Purpose                                     |
| ------------------- | ---------------------------------- | ------------------------------------------- |
| `DATABASE_URL`      | Yes                                | Development PostgreSQL/PostGIS connection   |
| `TEST_DATABASE_URL` | Yes for database integration tests | Separate test PostgreSQL/PostGIS connection |

The development and test variables must point to different databases.

Do not commit real database credentials, passwords, tokens, or private keys.

## Run locally

From the repository root:

```powershell
npm run dev --workspace @wits-world/api
```

The default local address is:

```text
http://127.0.0.1:3000
```

The development process watches the API source files and restarts when they
change.

To build and run the compiled application:

```powershell
npm run build --workspace @wits-world/api
npm run start --workspace @wits-world/api
```

## API routes

### Health

```http
GET /health
```

Example response:

```json
{
  "status": "ok",
  "service": "Wits World API",
  "requestId": "server-generated-request-id"
}
```

The health endpoint confirms that the API process is running and accepting
requests. It does not currently perform a database-readiness check.

Database readiness is checked separately through:

```powershell
npm run db:check --workspace @wits-world/api
```

### Versioned API root

```http
GET /api/v1/
```

Example response:

```json
{
  "name": "Wits World API",
  "version": "v1",
  "requestId": "server-generated-request-id"
}
```

New application endpoints should be added beneath `/api/v1`.

Breaking API changes should use a new version prefix rather than silently
changing an existing public contract.

## OpenAPI documentation

With the API running, open:

```text
http://127.0.0.1:3000/documentation/
```

The generated OpenAPI JSON is available at:

```text
http://127.0.0.1:3000/documentation/json
```

Route schemas must document:

- request parameters and bodies;
- successful responses;
- safe error responses;
- authentication requirements when introduced; and
- validation constraints.

The OpenAPI plugin must be registered before API routes so their schemas are
included in the generated document.

## Error-response model

Errors use a consistent JSON structure:

```json
{
  "type": "https://wits.world/problems/not-found",
  "title": "Resource not found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": "The requested resource was not found.",
  "requestId": "server-generated-request-id"
}
```

The fields are:

| Field        | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `type`       | Stable problem-type identifier                             |
| `title`      | Short human-readable category                              |
| `status`     | HTTP status code                                           |
| `code`       | Machine-readable application code                          |
| `detail`     | Safe client-facing explanation                             |
| `requestId`  | Identifier used to correlate the response with server logs |
| `validation` | Optional safe field-validation details                     |

Production-style error responses must not expose:

- stack traces;
- SQL statements;
- database credentials;
- access tokens;
- private keys;
- internal file paths; or
- private implementation details.

Request identifiers are generated by the server rather than accepted from the
browser as authoritative values.

## Verification

Run API-specific checks:

```powershell
npm run lint --workspace @wits-world/api
npm run type-check --workspace @wits-world/api
npm test --workspace @wits-world/api
npm run build --workspace @wits-world/api
```

Run repository-wide checks before opening a pull request:

```powershell
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

The API integration tests cover:

- successful health responses;
- the `/api/v1` prefix;
- safe `404` responses;
- safe unexpected-error responses;
- server-generated request identifiers;
- invalid runtime configuration; and
- OpenAPI route generation.

## Current limitations

The API foundation does not yet include:

- CORS configuration;
- authentication-token validation;
- protected application routes;
- event discovery or eligibility routes;
- production monitoring;
- challenge, reward, card, deck, or battle operations.

Those capabilities are introduced through later tracked issues.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
