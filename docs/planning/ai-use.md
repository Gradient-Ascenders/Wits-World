---
title: 'AI use and disclosure'
description: Where AI assisted the project, how that assistance is attributed, and how contributors verify the work.
---

# AI use and disclosure

Wits World uses AI assistance for code, editing, review, and documentation.
Contributors remain responsible for the work they accept. The supplied
COMS3011A Project Brief, section 1.4, requires attribution of the tool, model,
and purpose and directs contributors to the separate course AI policy for
the full requirements.

## Recorded uses

The [repository README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/README.md)
records code generation, inline editing, and code review separately. Its
declarations include the following tools and models:

| Tool        | Recorded models                                          |
| ----------- | -------------------------------------------------------- |
| ChatGPT-Web | GPT-5.6 Thinking; GPT-5.6 Sol.                           |
| Codex       | GPT-5; GPT-5.6 Sol; GPT-6.                               |
| Codex-CLI   | gpt-5.6-sol medium; GPT-5; GPT-6; gpt-6-sol; gpt-6-luna. |

This list summarises project-level disclosure. Individual changes identify
which tool and model contributed and the purpose of that assistance.

Documentation records also identify AI-assisted planning, prose generation,
source comparison, and editing. For example, the Sprint 3 guides attribute
drafting and source verification to Codex-CLI[gpt-6-sol] and
Codex-CLI[gpt-6-luna]. The README distinguishes that work from application code
generation. The September documentation audit attributes navigation, test-code
changes, rubric/source comparison, and evidence review to Codex-CLI[GPT-6].

## Attribution

The README summarises repository-wide uses. Assisted code commits name every
materially contributing tool and model in an `Assisted-by` trailer, while the
PR's AI section describes the assistance with that change. Submission-facing
documents include a declaration naming the tool, model, and purpose of their
generation, planning, review, or editing.

For example, this documentation revision can be described as:

> Codex[GPT-6] assisted with rubric comparison, repository source review,
> rewriting the Process guides, and documentation validation.

The matching commit trailer is `Assisted-by: Codex[GPT-6]`. Contributors use the
actual tool and model rather than copying an example or the full project list.
Unknown model details stay unknown until supplied.

## Verification and responsibility

Contributors inspect the diff, understand the resulting behaviour, check facts
against source material, and run checks appropriate to the change. Human review
and the [quality gates](project-and-git-methodology.md#quality-and-completion)
apply to AI-assisted work. A proposed review finding needs confirmation against
the code or a reproducible scenario before it becomes a reported defect.

Generated code and documentation can contain incorrect assumptions, stale
contracts, or unsupported claims. Source review and tests help identify those
errors; attribution does not establish correctness. Contributors also check
privacy, security, licensing, accessibility, and operational consequences.

AI-generated text cannot supply missing participant observations, stakeholder
approval, meeting attendance, or test results. Reconstructed sprint summaries
retain their source limits, and verification records identify the revision,
environment, procedure, and actual outcome. Credentials, personal participant
data, and private location histories stay out of public declarations.

**AI declaration:** Earlier versions used Codex[GPT-5],
ChatGPT-Web[GPT-5.6 Sol], and Codex-CLI[GPT-6] for generation, editing, and review.
This revision used Codex[GPT-6] for rubric comparison, source review, rewriting,
and documentation validation.
