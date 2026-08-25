# Wits World Documentation

This workspace contains the public documentation website for the Wits World
project and the Wits Quest game.

The site is built with Docusaurus and renders the project documentation stored
in the repository-level `docs/` directory.

## Prerequisites

Use the repository-standard versions:

- Node.js 24.14.1
- npm 11.18.0

Install dependencies from the repository root:

```bash
npm ci
```

## Run and verify

Start the documentation site on port 3001 so it can run alongside the API:

```bash
npm run start --workspace @wits-world/docs -- --port 3001
```

Open `http://localhost:3001`. Run the workspace checks from the repository root:

```bash
npm run lint --workspace @wits-world/docs
npm run type-check --workspace @wits-world/docs
npm test --workspace @wits-world/docs
npm run build --workspace @wits-world/docs
```

The production build treats broken internal links as errors.

## Add or update content

- Put public Markdown content in the repository-level `docs/` directory.
- Add new pages deliberately to the curated `apps/docs/sidebars.ts`; do not rely
  on automatic filesystem navigation.
- Preserve existing document paths and slugs unless an approved task changes a
  public URL.
- Keep application-specific setup in its workspace README and link to it from a
  concise public guide rather than maintaining a second detailed copy.
- Include the project-required AI declaration in submission-facing documents
  that AI materially creates, plans, reviews, or edits.

The [Developer Guide](../../docs/development/getting-started.md) is the public
onboarding entry point. Deployment is documented in
[Continuous Integration](../../docs/testing/continuous-integration.md).

The preceding document was edited with assistance from Codex[GPT-5].
