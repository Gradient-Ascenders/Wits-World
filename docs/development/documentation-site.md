---
title: 'Update and publish documentation'
---

# Update and publish documentation

The Docusaurus app lives in `apps/docs`. Its configuration reads Markdown and
MDX from the repository's `docs/` directory and publishes routes under `/docs/`.
Root README files and documents elsewhere in the repository are not included
by this source configuration. Images and other assets are not standalone doc pages.

## Decide what needs updating

Use a small number of canonical references and link to implementation or Gitea
for detail. Keep file organisation separate from the reader-focused site
navigation. Do not move files or duplicate pages merely to make the two match.

| Change                                      | References to review                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Player behaviour or confirmed game rules    | Relevant requirements/journey, API contract and affected feature/release summaries                                   |
| API or authentication                       | Narrative API contract, route/OpenAPI schemas and relevant security/setup guidance                                   |
| Database schema or persistence              | Domain schema/relationships, migration/release procedure and affected API contract; never rewrite applied migrations |
| Setup, CI or deployment                     | Developer guide, CI/deployment runbook and exact commands from current package/workflow files                        |
| Dependency or external service              | Third-party purpose/motivation, integration boundary and applicable configuration/operations guidance                |
| Test, stakeholder or user-feedback evidence | Dated result record, finding → issue → change → retest links, and current evidence index                             |

Search for stale statements about the affected feature with `rg`. For example,
a newly implemented ordering editor may require updates to the Author contract,
Basic release summary and feature matrix as well as its detailed documentation.
Do not broaden that audit into unrelated documentation cleanup.

## Choose the reader's section

| Section    | Reader need                                                 |
| ---------- | ----------------------------------------------------------- |
| Start here | Understand the product and start the correct guide          |
| Players    | Learn exploration, challenges, cards, and battles           |
| Authors    | Create, review, place, moderate, and evaluate content       |
| Developers | Set up, understand, test, deploy, and operate the system    |
| API        | Find authentication, endpoint, error, and feature contracts |
| Project    | Review evidence, decisions, methodology, and sprint history |

Use short topic labels: “Decks” inside Database → Cards, or “Live PvP” inside
Database → Battles. The category supplies context; omit repeated words such as
“storage”, “persistence”, and “API contract”. Full page titles can be more specific.
Retain useful identifiers such as Auth0 and ADR numbers, and label templates,
proposals, and historical records accurately.

Keep each group to about eight entries or fewer. Split large lists into topic
groups, and link a category heading to its overview instead of adding another
“Overview” row. Sibling categories collapse automatically when another opens.
Reference a page from other pages when it serves several needs; do not duplicate
its sidebar entry.

## Add or update a document

1. Add the reader-facing Markdown document under `docs/`.
2. Add its document ID to the appropriate reader-focused section in
   `apps/docs/sidebars.ts`. Navigation is curated by reader task, not generated
   from the repository folders. Each document belongs in exactly one section.
3. Use a clear title and relative Markdown links to other documents. Label dated
   evidence and historical plans accurately, and include required AI attribution.
4. Run the docs checks below. The navigation test requires each published
   Markdown/MDX document to have a sidebar entry and rejects missing, stale, or
   duplicate references. Both PR and main CI run this test.

The current docs use path-based IDs: `docs/testing/example.md` has the ID
`testing/example`. The landing page's `slug: /` changes its URL, not its ID.
Use an explicit sidebar label when a shorter title helps readers. Keep current
reference separate from historical records, and link to related documents rather
than listing the same document in several sections. Existing document paths and
public category URLs are preserved even when their navigation grouping changes.
Custom document IDs require updating the path-based coverage check.

Repository-only records stay under `docs/` but are listed in `repositoryOnlyDocs`
in `apps/docs/docs-publication.ts`. The build excludes them from routes and
search, and navigation coverage checks only published documents. Do not add
them to the sidebar. Public pages should link to the repository copy when
historical evidence needs a reference.

The six main sections are Start here, Players, Authors, Developers, API, and
Project. Use the
[Sprint 3 overview](../sprint-3-overview.md) as the current milestone entry
point. Keep Sprint 2 as a historical reference. Link dated results to their
source revision instead of rewriting them as current evidence.

## Write in clear technical language

Write for a third-year computer science student. Assume they understand common
software concepts, but not this repository or its internal names.

- Lead with the answer or purpose.
- Keep one main idea per sentence and one topic per paragraph.
- Prefer common verbs such as “use”, “check”, and “store”. Avoid inflated terms
  such as “utilise”, “facilitate”, and “leverage”.
- Define a project-specific term on first use. Keep standard terms such as API,
  SQL, transaction, and CI/CD when they are the precise words.
- Use active voice when the actor matters: “The API checks the token.”
- Replace long prose lists with a short table or bullets when readers need to
  compare items.
- Put exact commands, schemas, and edge cases in the relevant reference or
  runbook. Overview pages should link to that detail instead of repeating it.
- State an evidence limit once in a clear status section. Do not repeat the
  same warning in every paragraph.
- Remove background history unless it changes how the current system should be
  understood or operated.
- Keep sentences below about 25 words where practical. Split a sentence before
  adding a third clause.

Do not simplify by weakening a security rule, data contract, acceptance
criterion, or evidence boundary. Clear language must remain technically exact.

## Preserve evidence and URLs

- Keep current reference accurate. Preserve dated results with their original
  revision, environment, command, pass/fail/skipped outcome and source link.
- Add a dated follow-up when evidence changes. Do not relabel an old test as a
  pass for a new commit or combine counts from different runs.
- Templates are for future observations. Link existing collected feedback and
  stakeholder records; blank templates do not mean there are no findings.
- Keep pending acceptance, failed/inconclusive checks and deferred scope visible.
  Do not invent approvals, results, tier classifications or deployment state.
- Update the applicable milestone overview/matrix when scope or evidence changes.
  For a later sprint, add its own dated entry point and retain earlier evidence;
  update homepage/landing links to identify the current entry point deliberately.
- Preserve paths/slugs and existing category URLs during navigation changes.
  If a move is necessary, retain its public route and repair relative links,
  sidebar IDs and incoming references. Do not silently break external bookmarks.
- Submission-facing documents must disclose actual AI tools/models and purposes.
  Never publish raw participant data, secrets, auth state or precise coordinates.

## Local checks and preview

For changes to public docs or navigation, run the coverage test and production
build once near completion, plus formatting on changed files and `git diff --check`.
Also run docs lint/type-check when changing sidebar, config or application code.
A root-only contributor/agent-instruction edit needs formatting and diff checks;
it does not require application tests or a browser pass.

Available commands, from the repository root:

```bash
npm test --workspace @wits-world/docs
npm run lint --workspace @wits-world/docs
npm run type-check --workspace @wits-world/docs
npm run build --workspace @wits-world/docs
npm run start --workspace @wits-world/docs -- --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/docs/sprint-3-overview` and inspect the navigation.
The build rejects broken site links; review any anchor warnings too. Tests also
run in normal PR/main CI. Keep missing/stale/duplicate coverage failures visible
and fix the navigation instead of excluding documents to make tests pass.

Use a browser for meaningful layout/navigation changes, usually at approximately
390px and 1280px. Check the affected route and links in one consolidated pass.
Ordinary prose edits do not require browser automation. The docs preview needs
no API or sign-in; port 3000 is also the API default, so choose a free port if
running both services.

## Search

Use the navbar search field or press Ctrl+K (⌘K on macOS) to search page titles,
headings, and content. Arrow keys select a result; Enter opens it. Search covers
all indexed documents under `/docs/`, including dated project records.

The `@easyops-cn/docusaurus-search-local` theme builds the index with the site.
Queries run in the browser; no search service or API credentials are needed.
The index filename contains a content hash so a new deployment loads new results.

To verify search after editing docs, run `npm run build --workspace @wits-world/docs`
and `npm run serve --workspace @wits-world/docs -- --host 127.0.0.1 --port 4173`.
Open `http://127.0.0.1:4173` and search for a changed heading or phrase. The
development server does not generate the search index.

## Maintain diagrams

The [visual guide](../architecture/diagrams/index.md) links the presentation
views. Mermaid rendering is enabled in `apps/docs/docusaurus.config.ts` through
`@docusaurus/theme-mermaid`; keep its version aligned with Docusaurus. Edit the
Markdown source, not a generated image or a file under `apps/docs/build`.

When schema, protected flows, services, or deployment change, update the relevant
diagram in the same change. Use real table names and relationships from the
migrations. Label simplified views and keep authoritative rules in their linked
contracts; a diagram must not invent an API, reward, or completion guarantee.

Keep each diagram focused, include a nearby text explanation and source links,
and give it Mermaid `accTitle` and `accDescr` text. Wrap the fenced block in the
existing `diagram-scroll` region with a descriptive `aria-label` and
`tabIndex={0}` so wide diagrams remain keyboard-scrollable on mobile. The visual
guide introduces horizontal scrolling to readers.

Run the documentation checks and inspect changed diagrams in a browser: the
production build checks links, but Mermaid syntax is rendered in the browser.
Check for error messages, clipped labels, readable light/dark colours, and page
overflow at the relevant mobile and desktop widths. Historical Sprint 1 evidence
and meeting attachments remain historical evidence; update the current diagram
without rewriting those records.

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

Page title clarified with assistance from Codex-CLI[GPT-6].

Sprint 3 entry-point guidance was edited with assistance from Codex-CLI[gpt-6-sol].

Sidebar organisation guidance was updated with assistance from Codex[GPT-6].

Local search setup and verification guidance were added with assistance from
Codex[GPT-6].

The navigation and clear-language rules were updated with assistance from
Codex[GPT-5].
