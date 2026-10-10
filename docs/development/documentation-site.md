---
title: 'Update and publish documentation'
---

# Update and publish documentation

The documentation site is a Docusaurus workspace. It runs independently of the
game services and publishes Markdown and MDX pages under `/docs/`.

## Source files

| Location                         | Contents                                            |
| -------------------------------- | --------------------------------------------------- |
| `docs/`                          | Page content.                                       |
| `apps/docs/sidebars.ts`          | Sidebar labels, ordering, and page links.           |
| `apps/docs/docusaurus.config.ts` | Site configuration, search, and Mermaid support.    |
| `apps/docs/docs-publication.ts`  | Documents excluded from the public build.           |
| `apps/docs/src/`                 | Homepage components and styling.                    |
| `apps/docs/static/`              | Images and other static assets.                     |
| `apps/docs/static/_redirects`    | Cloudflare Pages redirects for retired public URLs. |

Keep implementation details in the relevant developer or API reference and
link to them from shorter user guides. Repository-only notes should be excluded
from publication and navigation. Never include credentials or private player data.

## Preview locally

After installing dependencies as described in [Getting started](getting-started.md),
run this from the repository root:

```bash
npm run start --workspace @wits-world/docs -- --port 3001
```

Open `http://localhost:3001/docs/`. Content changes reload automatically;
configuration changes may require restarting the server. No API or database
configuration is needed.

## Add or update a page

Create a Markdown or MDX file in `docs/` with a title:

```yaml
---
title: 'Page title'
---
```

Add its document ID to the appropriate section in `apps/docs/sidebars.ts`.
For example, `docs/development/example.md` has the ID `development/example`.
Every published page must appear exactly once, either as a page entry or a
category's linked overview.

Use relative Markdown links between documents. Preserve existing file paths
and public URLs when changing sidebar labels or ordering. A front-matter
`slug` changes the public route, not the document ID.

When consolidating a public page into an existing summary, retain its source in
Git, exclude it from publication, update incoming links, and redirect the old
route through `apps/docs/static/_redirects`. These hosting redirects apply after
deployment; they do not add pages to navigation or search.

For diagrams, edit the Mermaid source in the page. Include `accTitle`,
`accDescr`, and a nearby explanation. Use the existing `diagram-scroll` region
with a descriptive `aria-label` and `tabIndex={0}` for wide diagrams.
The [visual guide](../architecture/diagrams/index.md) contains examples.

## Check changes

Format the changed files with Prettier and run `git diff --check`, then:

```bash
npm test --workspace @wits-world/docs
npm run build --workspace @wits-world/docs
```

The tests check navigation coverage, including missing, duplicate, and stale
document IDs. The production build validates links and generates the site in
`apps/docs/build/`. Edit source files rather than generated output.

For sidebar, configuration, or application-code changes, also run:

```bash
npm run lint --workspace @wits-world/docs
npm run type-check --workspace @wits-world/docs
```

## Search

Search covers published page titles, headings, and content. Use the navbar
search field or Ctrl+K (⌘K on macOS).

The index is generated during the production build. Queries run in the browser
without an external search service. To preview the built site and its search:

```bash
npm run serve --workspace @wits-world/docs -- --port 4173
```

Open `http://localhost:4173/docs/`. The development server does not generate
the search index.

## Publishing

Relevant changes merged into `main` trigger the documentation deployment
workflow in `.gitea/workflows/docs-deploy.yml`. It builds the site and deploys
`apps/docs/build/` to [Cloudflare Pages](https://wits-world-docs.pages.dev).
Local or unmerged changes remain unpublished.

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-6],
Codex-CLI[gpt-6-sol], Codex[GPT-6], and Codex[GPT-5].
