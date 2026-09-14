---
title: Maintaining the documentation site
---

# Maintaining the documentation site

The Docusaurus app lives in `apps/docs`. Its configuration reads Markdown and
MDX from the repository's `docs/` directory and publishes routes under `/docs/`.
Root README files and documents elsewhere in the repository are not included
by this source configuration. Images and other assets are not standalone doc pages.

## Add or update a document

1. Add the reader-facing Markdown document under `docs/`.
2. Add its document ID to the appropriate reader-focused section in
   `apps/docs/sidebars.ts`. Navigation is curated by reader task, not generated
   from the repository folders. Each document belongs in exactly one section.
3. Use a clear title and relative Markdown links to other documents. Label dated
   evidence and historical plans accurately, and include required AI attribution.
4. Run the docs checks below. The navigation test requires each Markdown/MDX
   document to have a sidebar entry and rejects missing, stale, or duplicate
   references. Both PR and main CI run this test.

The current docs use path-based IDs: `docs/testing/example.md` has the ID
`testing/example`. The landing page's `slug: /` changes its URL, not its ID.
Use an explicit sidebar label when a shorter title helps readers. Keep current
reference separate from historical records, and link to related documents rather
than listing the same document in several sections. Existing document paths and
public category URLs are preserved even when their navigation grouping changes.
Custom document IDs require updating the path-based coverage check.

The six main sections are Start here, Product & player experience, Technical
reference, Development & operations, Testing & evidence, and Project & history.
Use the Sprint 2 overview as the meeting entry point; keep dated results linked
to their source revision rather than rewriting historical evidence as current.

## Local checks and preview

From the repository root:

```bash
npm test --workspace @wits-world/docs
npm run type-check --workspace @wits-world/docs
npm run build --workspace @wits-world/docs
npm run start --workspace @wits-world/docs -- --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/docs/sprint-2-overview` and inspect the navigation.
The build rejects broken site links. Tests also run in normal PR/main CI.

## Publication

`.gitea/workflows/docs-deploy.yml` deploys to
[the public docs site](https://wits-world-docs.pages.dev) when relevant changes
reach `main`: `docs/**`, `apps/docs/**`, the root package files, `.nvmrc`, or the
docs workflow itself. Local and unmerged branch changes are not published.
The workflow builds Docusaurus and deploys `apps/docs/build` to Cloudflare Pages.

If a page appears missing, distinguish these cases:

- **Absent from navigation:** check its sidebar entry and the navigation coverage test.
- **Local or unmerged changes:** check the branch and merge status.
- **Old published content:** check the latest Deploy Documentation status and
  compare a specific changed page with `main`.

Do not infer deployment success from a local build or a successful web/API job.

## AI declaration

Prepared with assistance from Codex-CLI[GPT-6].
