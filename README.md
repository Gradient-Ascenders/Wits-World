<p align="center">
  <img src="apps/web/src/assets/branding/wits-world-campus-seal-transparent.svg" alt="Wits World campus seal" width="160" />
</p>

<h1 align="center">Wits World</h1>

<p align="center">
  <a href="https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml"><img src="https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml/badge.svg?branch=main&amp;style=flat-square" alt="Build" height="28" /></a>
  <a href="https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml"><img src="https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/raw/branch/coverage-badge/coverage.svg" alt="Coverage" height="28" /></a>
  <a href="https://wits-world-docs.pages.dev/"><img src="https://img.shields.io/badge/Documentation-Live-D4AF37?style=for-the-badge&amp;labelColor=050B16&amp;logo=docusaurus&amp;logoColor=F7F3E7" alt="Documentation" /></a>
  <a href="https://witsworld.co.za/"><img src="https://img.shields.io/badge/Web_App-Live-D4AF37?style=for-the-badge&amp;labelColor=050B16&amp;logo=googlechrome&amp;logoColor=F7F3E7" alt="Web App" /></a>
  <a href="https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/"><img src="https://img.shields.io/badge/API-Live-D4AF37?style=for-the-badge&amp;labelColor=050B16&amp;logo=fastify&amp;logoColor=F7F3E7" alt="API" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24.14.1-D4AF37?style=for-the-badge&amp;labelColor=050B16&amp;logo=nodedotjs&amp;logoColor=F7F3E7" alt="Node.js 24.14.1" /></a>
</p>

Wits World is the project repository and development workspace for **Wits
Quest**, a mobile-first, location-based campus exploration game built for the
COMS3011A Software Design Project.

- **Wits World** is the repository, project, and technical workspace.
- **Wits Quest** is the game and player experience.

Players discover campus events, complete university-themed challenges, earn
cards, build decks, and play server-resolved CPU matches. The
[Basic release overview](docs/basic-release-reference.md)
describes the current implemented scope and its evidence.

## Quick start

### Prerequisites

- Git
- Node.js `24.14.1`
- npm `11.18.0`

The repository pins Node.js in `.nvmrc` and constrains both versions in
`package.json`.

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
nvm install
nvm use
npm ci
```

Copy only the environment examples you need. Local `.env` files are ignored by
Git; public `VITE_` values are browser-visible and must not contain secrets.

Start the API after configuring its required database, Auth0, and CORS values:

```bash
cp apps/api/.env.example apps/api/.env
npm run db
npm run api
```

In another terminal, configure and start the web application:

```bash
cp apps/web/.env.example apps/web/.env
npm run view
```

Open <http://localhost:5173>. The API runs at <http://127.0.0.1:3000> and its
local OpenAPI reference is at <http://127.0.0.1:3000/documentation/>. See the
[Developer Guide](docs/development/getting-started.md)
for required values, database setup, and the complete local workflow.

## Repository structure

```text
.
├── apps/
│   ├── api/             Fastify API and database tooling
│   ├── docs/            Docusaurus documentation application
│   └── web/             React/Vite player web application
├── database/            PostgreSQL/PostGIS migrations and seeds
├── docs/                Documentation content published by Docusaurus
├── packages/
│   ├── account-policy/  Shared player-name validation
│   └── game-rules/      Pure battle rules and state transitions
└── CONTRIBUTING.md      Contribution and attribution standards
```

The browser sends player intent and renders authoritative server state. The API,
server-consumed rules, and PostgreSQL/PostGIS own protected decisions such as
eligibility, marking, rewards, deck legality, and battle outcomes. See the
[Architecture Overview](docs/architecture/overview.md)
for system boundaries and accepted decisions.

## Common commands

Run these from the repository root:

| Command                | Purpose                              |
| ---------------------- | ------------------------------------ |
| `npm run view`         | Start the web development server     |
| `npm run api`          | Start the API development server     |
| `npm run db`           | Check, migrate, and seed development |
| `npm run format:check` | Check formatting without changing it |
| `npm run lint`         | Lint application workspaces          |
| `npm run type-check`   | Type-check application workspaces    |
| `npm test`             | Run workspace test suites            |
| `npm run build`        | Build all buildable workspaces       |

Workspace-specific commands use npm's `--workspace` flag. The
[Developer Guide](docs/development/getting-started.md)
owns the full command and setup reference.

## Documentation

The public [Wits World documentation](https://wits-world-docs.pages.dev/) is the
detailed source of truth. Start with:

- [Developer Guide](docs/development/getting-started.md)
- [Maintaining the documentation site](docs/development/documentation-site.md)
- [API reference](docs/api-reference.md)
  and the repository's [API Guide](apps/api/README.md)
- [Architecture Overview](docs/architecture/overview.md)
- [Database Overview](docs/database/overview.md)
- [Testing Strategy](docs/testing/testing-strategy.md)
- [Continuous Integration](docs/testing/continuous-integration.md)
- [Work Tracking](docs/planning/work-tracking-and-issue-management.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting work. It covers the
issue-based workflow, branch naming, quality checks, accessibility, commits,
pull requests, and AI attribution.

## AI declaration

This repository uses AI code generation: ChatGPT-Web[GPT-5.6 Thinking],
ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5], Codex[GPT-5],
Codex[GPT-5.6 Sol], Codex[GPT-6], Codex-CLI[GPT-6], Codex-CLI[gpt-6-sol], and
Codex-CLI[gpt-6-luna].

This repository uses AI inline editing: Codex-CLI[gpt-5.6-sol medium],
Codex-CLI[GPT-5], Codex[GPT-5], Codex[GPT-5.6 Sol], Codex[GPT-6], Codex-CLI[GPT-6],
Codex-CLI[gpt-6-sol], and Codex-CLI[gpt-6-luna].

This repository uses AI code review: Codex-CLI[gpt-5.6-sol medium],
Codex-CLI[GPT-5], Codex[GPT-5], ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-6], Codex-CLI[GPT-6],
Codex-CLI[gpt-6-sol], and Codex-CLI[gpt-6-luna].

Sprint 3 documentation was generated, reviewed, and edited with assistance from
Codex-CLI[gpt-6-sol] and Codex-CLI[gpt-6-luna]. The Luna subagents contributed
testing/Scrum prose drafts and documentation source verification; their work on
those documents is not attributed as application code generation.

Idle-compute worker scheduling, regression tests, and operational documentation
were generated and edited with assistance from Codex-CLI[GPT-5] and
Codex-CLI[gpt-6-luna].
