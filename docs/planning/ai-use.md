---
title: 'AI tools and contribution disclosure'
---

# AI tools and contribution disclosure

Wits World permits disclosed, human-accountable AI assistance under the course
policy. AI output is an input to engineering work, not evidence that a result is
correct or that a stakeholder approved it.

## Supported uses

The repository records AI use for code generation, inline editing, and code
review where those activities materially occur. The declarations currently name
only tools and models already evidenced in the repository README:
ChatGPT-Web[GPT-5.6 Thinking], Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5],
Codex[GPT-5], Codex[GPT-5.6 Sol], and ChatGPT-Web[GPT-5.6 Sol]. A contributor
must name the tool and model actually used; this list is not a prompt to copy
every name into an attribution.

## Sprint 2 documentation update — 14 September 2026

Codex-CLI[GPT-6] assisted with documentation navigation, coverage-test code,
inline edits, source/rubric comparison, Gitea evidence inspection and review of
this update. The source was the team-supplied course brief, repository files,
read-only issue/CI metadata and public endpoint checks. No participant results,
stakeholder approvals or test passes were invented.

Kevin also supplied a ChatGPT-generated prioritisation checklist. Its model was
not supplied, so this record does not guess it. The rubric mapping was checked
against the original brief rather than accepting the checklist as authority.

## Verification and responsibility

The contributor remains responsible for generated or edited work. They must
inspect the diff, understand the behavior, run proportionate tests, verify cited
facts against authoritative sources, protect secrets and personal data, and keep
the result within the issue scope. AI output must not be blindly trusted, used to
invent stakeholder decisions or missing content, or reported as a test that was
not executed. Security, migration, accessibility, licensing, and production
claims receive the same human review as non-AI work.

AI-assisted review findings are checked against the actual code and reproduced
where practical. The reviewer or contributor records confirmed defects and
evidence gaps; model confidence alone is not a finding.

## Attribution

Every commit containing AI-generated code includes an accurate extended commit
message line for every materially contributing tool/model:

```text
Assisted-by: Codex-CLI[gpt-5.6-sol medium]
```

The example is illustrative; use the real tool and model. Submission-facing
documents that AI created, planned, reviewed, or edited include an accurate AI
declaration in the document itself. Attribution discloses assistance but does
not transfer responsibility or prove correctness.

The preceding document was generated, edited, and reviewed with the assistance
of Codex[GPT-5] and ChatGPT-Web[GPT-5.6 Sol].

This Sprint 2 update was assisted by Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].
