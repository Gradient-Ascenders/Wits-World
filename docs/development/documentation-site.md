---
title: Maintaining the documentation site
---

# Maintaining the documentation site

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

| Section                     | Reader need                                                     |
| --------------------------- | --------------------------------------------------------------- |
| Start here                  | Understand the product and current milestone evidence           |
| Product & player experience | Learn rules, journeys and design/accessibility standards        |
| Technical reference         | Understand architecture, API contracts, schema and decisions    |
| Development & operations    | Set up, test through CI, deploy, migrate or recover services    |
| Testing & evidence          | Find procedures, actual results, feedback and release follow-up |
| Project & history           | Understand methodology, governance and historical records       |

Keep categories shallow and labels readable. Reference a page from other pages
when it serves several needs; do not duplicate its sidebar entry.

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

Open `http://127.0.0.1:3000/docs/sprint-2-overview` and inspect the navigation.
The build rejects broken site links; review any anchor warnings too. Tests also
run in normal PR/main CI. Keep missing/stale/duplicate coverage failures visible
and fix the navigation instead of excluding documents to make tests pass.

Use a browser for meaningful layout/navigation changes, usually at approximately
390px and 1280px. Check the affected route and links in one consolidated pass.
Ordinary prose edits do not require browser automation. The docs preview needs
no API or sign-in; port 3000 is also the API default, so choose a free port if
running both services.

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
