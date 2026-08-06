# Wits World

Wits World is the project repository and product team workspace for Wits Quest,
our mobile-friendly, location-based campus exploration web game developed for
the COMS3011A Software Design Project.

In this repository, **Wits World** refers to the project, repository, and
development workspace. **Wits Quest** refers to the game/topic being built.

Players explore the Wits campus, visit location-based events, answer challenges about university history, alumni and landmarks, and collect cards. These cards can be assembled into decks and used in turn-based matches against the computer.

The project also includes an authoring console for managing events, questions, locations and collectible cards.

## Getting Started

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 24.14.1
- npm 11.18.0

The repository includes an `.nvmrc` file for users of
[nvm](https://github.com/nvm-sh/nvm).

### Installation

Clone the repository and install the locked dependencies:

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
nvm install
nvm use
npm ci
```

Copy only the environment examples needed for the application you are running.
Local `.env` files are ignored by Git.

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

The examples contain local development values only. Application-specific setup
will be documented as each application is implemented.

## Repository Structure

```text
apps/
  api/          Fastify API workspace (implementation tracked in issue #9)
  docs/         Public documentation workspace (implementation tracked in issue #15)
  web/          React web workspace (implementation tracked in issue #6)
database/       Database diagrams, migrations, and seed data
docs/           Version-controlled project and assessment documentation
infrastructure/ Local and deployment infrastructure
packages/       Shared configuration, contracts, and game rules
tests/          Cross-application test fixtures and suites
```

The application workspaces currently contain minimal TypeScript entry points.
They establish independent build boundaries without pre-empting their dedicated
implementation issues.

## Development Commands

Run shared checks from the repository root:

| Command                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `npm run build`        | Build every application workspace                             |
| `npm run lint`         | Lint every application workspace                              |
| `npm run type-check`   | Type-check every application workspace without emitting files |
| `npm test`             | Run every application workspace test suite                    |
| `npm run format:check` | Check formatting across the repository                        |
| `npm run format`       | Apply the repository formatting rules                         |

Run one application command independently with npm's workspace flag:

```bash
npm run build --workspace @wits-world/web
npm run build --workspace @wits-world/api
npm run build --workspace @wits-world/docs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, verification, commit, and
AI-attribution standards.

## AI Declaration

This repository uses AI code generation: ChatGPT-Web[GPT-5.6 Thinking] and
Codex-CLI[gpt-5.6-sol medium].

This repository uses AI inline editing: Codex-CLI[gpt-5.6-sol medium].

This repository uses AI code review: Codex-CLI[gpt-5.6-sol medium].
